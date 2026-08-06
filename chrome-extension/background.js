// ────────────────────────────────────────────────────────────
//  Background Service Worker — Blog Master Extension
//  역할: 백엔드 폴링 → pending_extension 작업 탐지 → 네이버 탭 열기
//       → chrome.debugger CDP로 텍스트 입력 → 발행 → 완료 보고
// ────────────────────────────────────────────────────────────
console.log('[BG] ✅ Service worker loaded at', new Date().toLocaleTimeString('ko-KR'));

const POLL_ALARM_MINUTES = 0.5;

// ── Device ID (설치 시 1회 생성, 영구 보관) ──────────────────
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function getOrCreateDeviceId() {
  const { deviceId } = await get(['deviceId']);
  if (deviceId) return deviceId;
  const newId = generateUUID();
  await set({ deviceId: newId });
  console.log('[BG] New device_id created:', newId);
  return newId;
}

chrome.runtime.onInstalled.addListener(async () => {
  await getOrCreateDeviceId();
});

// chrome.debugger가 예기치 않게 detach되면("Detached while handling command" 에러의 원인) 이유를
// 알 수 없어 원인 파악이 어려웠다. Chrome이 제공하는 reason(예: target_closed, canceled_by_user,
// replaced_with_devtools 등)을 로그에 남겨 다음 발생 시 바로 원인을 알 수 있게 한다.
chrome.debugger.onDetach.addListener((source, reason) => {
  console.warn('[BG] Debugger detached — tabId:', source.tabId, 'reason:', reason);
});

// ── Storage helpers ──────────────────────────────────────────
function get(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function set(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Session expiry handling ────────────────────────────────────
// 예전엔 여기서 웹 대시보드 세션의 refresh_token 사본으로 Supabase 토큰 갱신을 직접
// 호출했는데, 그 refresh_token이 대시보드 탭 쪽에서 먼저 로테이션되면 이 사본이
// 무효화돼서 확장프로그램이 인증을 잃는 문제가 있었다. 이제는 설정 페이지에서 발급받는
// 만료되지 않는 확장프로그램 전용 토큰을 쓰므로, 갱신 로직 자체가 필요 없다 — 401이면
// 그냥 사용자가 토큰을 재발급/무효화한 것으로 간주하고 연결을 끊는다.
async function handleSessionExpired() {
  await set({ accessToken: null });
  stopPolling();
  chrome.runtime.sendMessage({ type: 'SESSION_EXPIRED' }).catch(() => {});
  chrome.notifications.create('session_expired', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Blog Master — 연결 해제됨',
    message: '토큰이 만료/재발급되었습니다. 설정 페이지에서 새 토큰을 발급받아 다시 연결해 주세요.',
    priority: 2
  });
  console.warn('[BG] Session expired — cleared token, polling stopped. Re-login required.');
}

// ── Message handler (from popup & content script) ────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[BG] Message received:', msg.type);
  if (msg.type === 'START_POLLING') startPolling();
  if (msg.type === 'STOP_POLLING') stopPolling();
  if (msg.type === 'POLL_NOW') { poll(); pollXhsJobs(); }
  if (msg.type === 'GET_DEVICE_ID') {
    getOrCreateDeviceId().then(deviceId => sendResponse({ deviceId }));
    return true;
  }
  if (msg.type === 'CHECK_CONNECTION') {
    get(['accessToken']).then(({ accessToken }) => sendResponse({ connected: !!accessToken }));
    return true;
  }
  if (msg.type === 'CHECK_NAVER_LOGIN') {
    chrome.cookies.get({ url: 'https://www.naver.com', name: 'NID_AUT' }, (cookie) => {
      sendResponse({ loggedIn: !!cookie });
    });
    return true;
  }
});

// ── Alarm-based polling ──────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll') { poll(); pollXhsJobs(); }
});

async function startPolling() {
  const { apiUrl, accessToken } = await get(['apiUrl', 'accessToken']);
  if (!apiUrl || !accessToken) return;

  await chrome.alarms.clear('poll');
  chrome.alarms.create('poll', { periodInMinutes: POLL_ALARM_MINUTES });
  console.log('[BG] Polling started (30s interval)');

  poll();
  pollXhsJobs();
}

function stopPolling() {
  chrome.alarms.clear('poll');
  console.log('[BG] Polling stopped');
}

let currentJobTabId = null;

// Tab closure cleanup: if the automation tab is closed manually, reset activeJobId immediately
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === currentJobTabId) {
    console.log('[BG] Active automation tab was closed. Clearing activeJob lock.');
    currentJobTabId = null;
    await set({ activeJobId: null, activeJobStartTime: null });
  }
});

let isProcessingNaverJob = false;

// ── Main poll function ───────────────────────────────────────
async function poll() {
  if (isProcessingNaverJob) {
    console.log('[BG] Skipping poll — job execution already in progress locally');
    return;
  }

  let { apiUrl, accessToken, activeJobId, activeJobStartTime } = await get([
    'apiUrl', 'accessToken', 'activeJobId', 'activeJobStartTime'
  ]);
  console.log('[BG] poll() — apiUrl:', apiUrl ? '✅' : '❌', 'token:', accessToken ? '✅' : '❌', 'activeJob:', activeJobId || 'none');
  if (!apiUrl || !accessToken) return;

  if (activeJobId) {
    let tabExists = false;
    if (currentJobTabId) {
      try {
        await chrome.tabs.get(currentJobTabId);
        tabExists = true;
      } catch (_) {
        tabExists = false;
      }
    }

    const isOrphaned = !activeJobStartTime || (Date.now() - activeJobStartTime > 3 * 60 * 1000) || (currentJobTabId && !tabExists);
    if (isOrphaned) {
      console.log('[BG] Orphaned activeJobId detected (tabExists:', tabExists, '), clearing:', activeJobId);
      currentJobTabId = null;
      await set({ activeJobId: null, activeJobStartTime: null });
    } else {
      console.log('[BG] Skipping poll — job already active:', activeJobId);
      return;
    }
  }

  const deviceId = await getOrCreateDeviceId();

  let jobs;
  try {
    const res = await fetch(`${apiUrl}/api/extension/jobs?device_id=${encodeURIComponent(deviceId)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (res.status === 401) {
      console.warn('[BG] Token invalid/revoked (401)');
      await handleSessionExpired();
      return;
    }
    if (!res.ok) { console.warn('[BG] Poll failed:', res.status); return; }
    const data = await res.json();
    jobs = data.jobs || [];
    console.log('[BG] Jobs fetched:', jobs.length, 'total,',
      jobs.filter(j => j.status === 'pending_extension').length, 'pending_extension');
  } catch (e) {
    console.warn('[BG] Poll error:', e.message); return;
  }

  await set({ pendingJobs: jobs });

  const job = jobs.find(j => j.status === 'pending_extension');
  if (!job) return;

  await processJob(job, apiUrl, accessToken);
}

// ════════════════════════════════════════════════════════════
//  샤오홍슈 스크래핑 잡 (naver 발행 잡과 완전히 별도 락으로 병행 동작)
// ════════════════════════════════════════════════════════════
let currentXhsTabId = null;

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === currentXhsTabId) {
    currentXhsTabId = null;
    await set({ activeXhsJobId: null });
  }
});

async function pollXhsJobs() {
  const { apiUrl, accessToken, activeXhsJobId, activeXhsJobStartTime } = await get([
    'apiUrl', 'accessToken', 'activeXhsJobId', 'activeXhsJobStartTime'
  ]);
  if (!apiUrl || !accessToken) return;
  if (activeXhsJobId) {
    let tabExists = false;
    if (currentXhsTabId) {
      try {
        await chrome.tabs.get(currentXhsTabId);
        tabExists = true;
      } catch (_) {
        tabExists = false;
      }
    }
    const isOrphaned = !activeXhsJobStartTime || (Date.now() - activeXhsJobStartTime > 3 * 60 * 1000) || (currentXhsTabId && !tabExists);
    if (isOrphaned) {
      console.log('[BG][XHS] Orphaned activeXhsJobId detected (tabExists:', tabExists, '), clearing:', activeXhsJobId);
      currentXhsTabId = null;
      await set({ activeXhsJobId: null, activeXhsJobStartTime: null });
    } else {
      console.log('[BG][XHS] Skipping poll — job already active:', activeXhsJobId);
      return;
    }
  }

  const deviceId = await getOrCreateDeviceId();
  let jobs;
  try {
    const res = await fetch(`${apiUrl}/api/extension/xhs-jobs?device_id=${encodeURIComponent(deviceId)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) { console.warn('[BG][XHS] Poll failed:', res.status); return; }
    const data = await res.json();
    jobs = data.jobs || [];
    console.log('[BG][XHS] Jobs fetched:', jobs.length);
  } catch (e) {
    console.warn('[BG][XHS] Poll error:', e.message); return;
  }

  const job = jobs.find(j => j.status === 'pending_extension');
  if (!job) return;

  await processXhsJob(job, apiUrl, accessToken);
}

async function processXhsJob(job, apiUrl, accessToken) {
  console.log('[BG][XHS] Starting job:', job.id, job.source_url);
  await set({ activeXhsJobId: job.id, activeXhsJobStartTime: Date.now() });

  try {
    await fetch(`${apiUrl}/api/extension/xhs-jobs/${job.id}/ack`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.warn('[BG][XHS] Ack failed:', e.message);
  }

  let tab;
  try {
    tab = await chrome.tabs.create({ url: job.source_url, active: false });
    currentXhsTabId = tab.id;
  } catch (e) {
    currentXhsTabId = null;
    await reportXhsDone(job.id, { success: false, error: `탭 생성 실패: ${e.message}` }, apiUrl, accessToken);
    return;
  }

  await waitForTabLoad(tab.id);
  await sleep(2000);

  let result;
  try {
    result = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ success: false, error: '스크래핑 타임아웃(30초)' }), 30000);
      chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_XHS' }, async (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (!response || !response.success) {
          resolve(response || { success: false, error: '콘텐츠 스크립트 응답 없음' });
          return;
        }
        try {
          const uploadRes = await uploadXhsMedia(job.id, response, apiUrl, accessToken);
          resolve(uploadRes);
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });
  } catch (e) {
    result = { success: false, error: e.message };
  }

  await chrome.tabs.remove(tab.id).catch(() => {});
  currentXhsTabId = null;
  await reportXhsDone(job.id, result, apiUrl, accessToken);
}

async function uploadXhsMedia(jobId, scrapeData, apiUrl, accessToken) {
  const { videoSrc, images = [], captionText = '' } = scrapeData;
  const formData = new FormData();
  formData.set('caption_text', captionText);

  if (videoSrc) {
    try {
      const res = await fetch(videoSrc);
      if (res.ok) {
        const videoBlob = await res.blob();
        formData.set('video', videoBlob, 'source.mp4');
      } else {
        formData.set('video_url', videoSrc);
      }
    } catch (e) {
      console.warn('[BG][XHS] Video blob fetch failed, fallback to video_url:', e.message);
      formData.set('video_url', videoSrc);
    }
  }

  for (let i = 0; i < images.length; i++) {
    try {
      const res = await fetch(images[i]);
      if (res.ok) {
        const imgBlob = await res.blob();
        formData.set(`image_${i}`, imgBlob, `image_${i}.jpg`);
      }
    } catch (e) {
      console.warn(`[BG][XHS] Image ${i} fetch failed:`, e.message);
    }
  }

  const uploadRes = await fetch(`${apiUrl}/api/extension/xhs-jobs/${jobId}/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: formData,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    throw new Error(`업로드 실패 (${uploadRes.status}): ${text}`);
  }

  return { success: true };
}

async function reportXhsDone(jobId, result, apiUrl, accessToken) {
  try {
    await fetch(`${apiUrl}/api/extension/xhs-jobs/${jobId}/done`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    });
  } catch (e) {
    console.warn('[BG][XHS] Report done failed:', e.message);
  }
  await set({ activeXhsJobId: null, activeXhsJobStartTime: null });
  console.warn('[BG][XHS] Job done:', jobId, result.success ? '성공' : '실패', result.error || '');
}

// ── Process a single job ─────────────────────────────────────
async function processJob(job, apiUrl, accessToken) {
  if (isProcessingNaverJob) {
    console.warn('[BG] Already processing a job locally, skipping duplicate start:', job.id);
    return;
  }
  isProcessingNaverJob = true;
  console.log('[BG] Starting job:', job.id);
  await set({ activeJobId: job.id, activeJobStartTime: Date.now() });

  try {
    try {
      await fetch(`${apiUrl}/api/extension/jobs/${job.id}/ack`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.warn('[BG] Ack failed:', e.message);
    }

    const naverBlogId = job.naver_accounts?.naver_id?.trim().split('@')[0];
    if (!naverBlogId) {
      await reportDone(job.id, { success: false, error: '네이버 블로그 ID가 없습니다.' }, apiUrl, accessToken);
      return;
    }

    const imageUrls = (job.content_json?.extension_images || []).map((imgPath, i) => {
      if (!imgPath) return null;
      if (typeof imgPath === 'string' && imgPath.startsWith('http')) {
        return imgPath;
      }
      return `${apiUrl}/api/extension/image/${job.id}/${i}?token=${encodeURIComponent(accessToken)}`;
    });

    const publishOptions = {
      ...(job.content_json?.publish_options || {}),
      scheduled_at: job.content_json?.publish_options?.scheduled_at || job.scheduled_at || null,
    };

    const jobPayload = {
      id: job.id,
      title: job.content_json?.title || '',
      content: job.content_json?.content || '',
      hashtags: job.content_json?.hashtags || [],
      imageUrls,
      naverBlogId,
      publishOptions,
      business: job.content_json?.business || {},
      aiGeneratedIndices: job.content_json?.ai_generated_indices || [],
    };

    const writeUrl = `https://blog.naver.com/${naverBlogId}?Redirect=Write`;
    let tab;
    try {
      tab = await chrome.tabs.create({ url: writeUrl, active: true });
      currentJobTabId = tab.id;
    } catch (e) {
      currentJobTabId = null;
      await reportDone(job.id, { success: false, error: `탭 생성 실패: ${e.message}` }, apiUrl, accessToken);
      return;
    }

    await waitForTabLoad(tab.id);
    await sleep(3000);

    try {
      await chrome.debugger.attach({ tabId: tab.id }, '1.3');
      console.log('[BG] Debugger attached to tab', tab.id);
    } catch (e) {
      console.warn('[BG] Debugger attach failed:', e.message);
      await chrome.tabs.remove(tab.id).catch(() => {});
      currentJobTabId = null;
      await reportDone(job.id, { success: false, error: `디버거 연결 실패: ${e.message}` }, apiUrl, accessToken);
      return;
    }

    let result;
    try {
      result = await runEditorAutomation(tab.id, jobPayload);
    } catch (e) {
      console.error('[BG] Automation error:', e);
      result = { success: false, error: e.message };
    }

    try { await evalInTab(tab.id, () => { window.onbeforeunload = null; }); } catch (_) {}
    try { await chrome.debugger.detach({ tabId: tab.id }); } catch (_) {}
    await chrome.tabs.remove(tab.id).catch(() => {});
    currentJobTabId = null;
    await reportDone(job.id, result, apiUrl, accessToken);
  } finally {
    isProcessingNaverJob = false;
  }
}

// ── Wait for tab navigation to complete ─────────────────────
function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
  });
}

// ── Report job completion to backend ────────────────────────
async function reportDone(jobId, result, apiUrl, accessToken) {
  if (!apiUrl || !accessToken) {
    const stored = await get(['apiUrl', 'accessToken']);
    apiUrl = stored.apiUrl;
    accessToken = stored.accessToken;
  }
  try {
    await fetch(`${apiUrl}/api/extension/jobs/${jobId}/done`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    });
  } catch (e) {
    console.warn('[BG] Report done failed:', e.message);
  }
  currentJobTabId = null;
  await set({ activeJobId: null, activeJobStartTime: null });
  console.warn('[BG] Job done:', jobId, result.success ? '성공' : '실패', result.error || '');
}

// ── Auto-start polling if already configured ─────────────────
chrome.runtime.onStartup.addListener(startPolling);
chrome.runtime.onInstalled.addListener(startPolling);
get(['apiUrl', 'accessToken']).then(({ apiUrl, accessToken }) => {
  if (apiUrl && accessToken) startPolling();
});

// ════════════════════════════════════════════════════════════
//  CDP 헬퍼
// ════════════════════════════════════════════════════════════

async function findEditorFrameId(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => ({
        hasEditor: !!(
          document.querySelector('.se-main-container') ||
          document.querySelector('[class*="se-component"]') ||
          document.querySelectorAll('[contenteditable="true"]').length >= 2
        ),
      }),
    });
    for (const r of results || []) {
      if (r?.result?.hasEditor) {
        console.log('[BG] Editor found in frameId:', r.frameId);
        return r.frameId;
      }
    }
  } catch (e) {
    console.warn('[BG] findEditorFrameId error:', e.message);
  }
  console.log('[BG] Editor frame not found, using main frame (0)');
  return 0;
}

async function evalInEditor(tabId, editorFrameId, func, args = []) {
  const target = editorFrameId > 0
    ? { tabId, frameIds: [editorFrameId] }
    : { tabId };
  const results = await chrome.scripting.executeScript({ target, func, args });
  return results?.[0]?.result;
}

async function evalInTab(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return results?.[0]?.result;
}

async function clickAtCoords(tabId, x, y) {
  const p = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mousePressed',  buttons: 1, ...p });
  await sleep(30);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', buttons: 0, ...p });
  await sleep(80);
}

async function getAbsoluteCoords(tabId, editorFrameId, func, args = []) {
  const pos = await evalInEditor(tabId, editorFrameId, func, args);
  if (!pos) return null;
  if (editorFrameId > 0) {
    const offset = await evalInTab(tabId, () => {
      let best = null, bestArea = 0;
      for (const iframe of document.querySelectorAll('iframe')) {
        const r = iframe.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestArea && r.width > 300 && r.height > 200) {
          bestArea = area;
          best = { left: Math.round(r.left), top: Math.round(r.top) };
        }
      }
      return best || { left: 0, top: 0 };
    });
    console.warn('[AUTOMATION] iframe offset:', offset, '→ abs:', { x: pos.x + offset.left, y: pos.y + offset.top });
    pos.x += (offset?.left || 0);
    pos.y += (offset?.top || 0);
  }
  return pos;
}

// 이미지 삽입 등 복잡한 DOM 조작 직후 포커스가 본문 영역을 벗어나 있는지 확인하고,
// 벗어났다면 마지막 단락을 다시 클릭해 커서를 되돌린다. (본문 타이핑이 조용히
// 엉뚱한 곳으로 들어가거나 사라지는 간헐적 버그 방지 — Input.insertText는 특정
// 요소를 지정하지 않고 현재 포커스 위치에 그대로 흘려넣기 때문에 반드시 필요함)
async function ensureBodyFocus(tabId, editorFrameId) {
  const isFocusedInTextPara = await evalInEditor(tabId, editorFrameId, () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const node = sel.anchorNode;
    if (!node) return false;
    const parentEl = node.nodeType === 1 ? node : node.parentElement;
    if (!parentEl) return false;
    // 이미지, 인용구 박스, 지도, 외곽 툴바 내부면 false
    if (parentEl.closest('.se-component-image, .se-component-map, .se-component-oglink, .se-quote, .se-quotation-container')) {
      return false;
    }
    // 제목 섹션 내부면 false
    if (parentEl.closest('.se-section-documentTitle')) return false;
    // 본문 text-paragraph 또는 module-text p 내부인지 확인
    return !!(parentEl.closest('.se-text-paragraph') || parentEl.closest('.se-module-text') || parentEl.closest('.se-component-text'));
  });

  if (isFocusedInTextPara) return true;

  console.warn('[AUTOMATION] 포커스가 본문 텍스트 단락을 벗어남 — 본문 단락 재조정');

  const bodyCoords = await getAbsoluteCoords(tabId, editorFrameId, () => {
    const paras = document.querySelectorAll(
      '.se-component-text .se-text-paragraph, ' +
      '.se-main-container .se-section:not(.se-section-documentTitle) .se-text-paragraph, ' +
      '.se-components .se-section:not(.se-section-documentTitle) .se-text-paragraph, ' +
      '.se-section-text .se-text-paragraph, ' +
      '.se-module-text:not(.se-documentTitle .se-module-text) p'
    );
    if (paras.length > 0) {
      const last = paras[paras.length - 1];
      last.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = last.getBoundingClientRect();
      if (r.width || r.height) {
        return { x: r.left + Math.max(r.width / 4, 20), y: r.top + Math.max(r.height / 2, 10) };
      }
    }

    // 2차 폴백: 단락이 아직 없을 때 본문 영역 전체 섹션을 클릭
    const bodySection = document.querySelector(
      '.se-main-container .se-section:not(.se-section-documentTitle), ' +
      '.se-components .se-section:not(.se-section-documentTitle), ' +
      '.se-section-text, .se-component-text'
    );
    if (bodySection) {
      bodySection.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = bodySection.getBoundingClientRect();
      if (r.width || r.height) {
        return { x: r.left + Math.max(r.width / 4, 20), y: r.top + Math.max(r.height / 2, 10) };
      }
    }

    return null;
  });

  if (!bodyCoords) {
    console.warn('[AUTOMATION] 재조정할 본문 영역을 찾지 못함');
    return false;
  }

  await clickAtCoords(tabId, bodyCoords.x, bodyCoords.y);
  await sleep(200);
  await sendKey(tabId, 'End', 'End', 35); // 클릭 위치가 단락 중간일 수 있으므로 끝으로 이동
  await sleep(100);
  return true;
}

// 한 줄(문단)을 문장 단위로 쪼갠다 (마침표/물음표/느낌표 뒤에 공백이나 끝이 오는 지점만
// 문장 경계로 인정 — "3.5mm"처럼 숫자 사이 마침표는 뒤에 공백이 없으므로 경계로 취급하지
// 않는다). 문단 전체가 한 번에 삽입되면 사람이 아니라 복사-붙여넣기처럼 보이므로, 문장마다
// 딜레이를 주기 위한 최소 단위로 사용한다. 인덱스 기반 slice만 사용해 원문 글자가 하나도
// 유실되지 않도록 보장한다(정규식 match 방식은 매칭 실패 구간의 문자를 조용히 누락시킬 수 있어 사용하지 않음).
function splitIntoSentences(text) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = text[i + 1];
      if (next === undefined || /\s/.test(next)) {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        parts.push(text.slice(start, j));
        start = j;
        i = j - 1;
      }
    }
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts.length ? parts : [text];
}

async function typeViaDebugger(tabId, text) {
  if (!text) return;
  // 문장 중간에 억지로 삽입된 불필요한 줄바꿈(\n) 정제:
  const cleanedText = text
    .replace(/([^\.!\?\n])\n+([^\.!\?\n])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ');

  // 진짜 문단 구분(\n\n 또는 남은 \n)으로 분할
  const paragraphs = cleanedText.split(/\n+/).filter(p => p.trim());
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (para) {
      // [B]...[/B] 태그를 감지해 문단 분할 없이 인라인(Ctrl+B) 볼드 처리
      const chunks = [];
      const regex = /\[B\]([\s\S]*?)\[\/B\]/gi;
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(para)) !== null) {
        if (match.index > lastIndex) {
          chunks.push({ text: para.substring(lastIndex, match.index), isBold: false });
        }
        chunks.push({ text: match[1], isBold: true });
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < para.length) {
        chunks.push({ text: para.substring(lastIndex), isBold: false });
      }

      let isCurrentlyBold = false;
      for (const chunk of chunks) {
        if (!chunk.text) continue;

        // 볼드 상태 전환이 필요한 경우 Ctrl+B (modifiers: 2) 토글 전송
        if (chunk.isBold !== isCurrentlyBold) {
          await sendKey(tabId, 'b', 'KeyB', 66, 2);
          await sleep(50);
          isCurrentlyBold = chunk.isBold;
        }

        const sentences = splitIntoSentences(chunk.text);
        for (const sentence of sentences) {
          // Input.insertText는 서로게이트 쌍 이모지(📞💬 등 U+FFFF 초과) 뒤 텍스트를 잘라버리는
          // Chrome CDP 버그가 있으므로, 이모지 경계마다 분리해서 각각 삽입한다.
          const segments = sentence.split(/(\p{Extended_Pictographic})/u).filter(s => s);
          for (const seg of segments) {
            await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: seg });
            await sleep(20);
          }
          await sleep(150 + Math.random() * 150);
        }
      }

      // 문단 완료 후 볼드 상태가 켜져 있다면 해제
      if (isCurrentlyBold) {
        await sendKey(tabId, 'b', 'KeyB', 66, 2);
        await sleep(50);
      }
    }
    if (i < paragraphs.length - 1) {
      await sendKey(tabId, 'Return', 'Enter', 13);
    }
  }
}

// modifiers 비트마스크: 0=없음, 1=Alt, 2=Ctrl, 4=Meta, 8=Shift
async function sendKey(tabId, key, code, keyCode, modifiers = 0) {
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyDown', key, code,
    nativeVirtualKeyCode: keyCode, windowsVirtualKeyCode: keyCode,
    modifiers,
  });
  await sleep(20);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
    type: 'keyUp', key, code,
    nativeVirtualKeyCode: keyCode, windowsVirtualKeyCode: keyCode,
    modifiers,
  });
  await sleep(50);
}

// ════════════════════════════════════════════════════════════
//  콘텐츠 블록 파싱
// ════════════════════════════════════════════════════════════
function parseBlocks(content) {
  const tokens = [];
  // AI가 생성한 변형 B 태그 표준화 ([B]...[/B])
  let remaining = (content || '')
    .replace(/\[\/\s*<?\/?\\?\s*B\s*>?\s*\]/gi, '[/B]')
    .replace(/\[\s*<?\/?\\?\s*B\s*>?\s*\]/gi, '[B]')
    .replace(/\[B\]([^\[\]]{1,50}?)\[B\]/gi, '[B]$1[/B]')
    .replace(/\[IMAGE_?ANCHOR_?(\d+)\]/gi, '[IMAGE_ANCHOR_$1]')
    .replace(/\[\/?(QUOTEANCHOR\d*|IMAGEQUOTE\d*|QUOTEIMAGE\d*)\]/gi, '');
  // AI가 프롬프트 지시를 어기고 마크다운 불릿(줄 앞 *, - )으로 목록을 쓴 경우, 그대로 타이핑하면
  // "*"만 단독 줄에 남는 등 어색하게 노출되므로 굵은 점(•)으로 치환해 최소한 목록처럼 보이게 한다.
  remaining = remaining.replace(/^[ \t]*[*-][ \t]+/gm, '• ');

  // 텍스트 블록 정규화 헬퍼: 앞뒤 \n 제거 후 내용이 있을 때만 push
  // (AI가 섹션 간 \n을 몇 개 생성하든 코드에서 통제)
  const pushText = (raw) => {
    const stripped = raw.replace(/^\n+/, '').replace(/\n+$/, '');
    if (stripped) tokens.push({ type: 'text', content: stripped });
  };

  while (remaining.length > 0) {
    const vMatch  = remaining.match(/\[QUOTE_?VERTICAL\]/i);
    const pMatch  = remaining.match(/\[QUOTE_?POSTIT\]/i);
    const dMatch  = remaining.match(/\[QUOTE_?DEFAULT\]/i);
    const blMatch = remaining.match(/\[QUOTE_?BALLOON\]/i);
    const lqMatch = remaining.match(/\[QUOTE_?LINE_?QUOTATION\]/i);
    const frMatch = remaining.match(/\[QUOTE_?FRAME\]/i);
    const imageMatch = remaining.match(/\[IMAGE_?ANCHOR_?(?:\s*)(\d+)\]/i);
    const mapMatch   = remaining.match(/\[BUSINESS_?MAP_?BLOCK\]/i);
    const ctaMatch   = remaining.match(/\[BUSINESS_?CTA_?BANNER\]/i);

    const candidates = [
      vMatch  && { type: 'quote_vertical',       index: vMatch.index,  match: vMatch },
      pMatch  && { type: 'quote_postit',          index: pMatch.index,  match: pMatch },
      dMatch  && { type: 'quote_default',         index: dMatch.index,  match: dMatch },
      blMatch && { type: 'quote_balloon',         index: blMatch.index, match: blMatch },
      lqMatch && { type: 'quote_line_quotation',  index: lqMatch.index, match: lqMatch },
      frMatch && { type: 'quote_frame',           index: frMatch.index, match: frMatch },
      imageMatch && { type: 'image',              index: imageMatch.index, match: imageMatch },
      mapMatch   && { type: 'map',                index: mapMatch.index,   match: mapMatch },
      ctaMatch   && { type: 'cta_banner',         index: ctaMatch.index,   match: ctaMatch },
    ].filter(Boolean).sort((a, b) => a.index - b.index);

    if (candidates.length === 0) {
      pushText(remaining);
      break;
    }

    const first = candidates[0];
    if (first.index > 0) pushText(remaining.substring(0, first.index));
    remaining = remaining.substring(first.index);

    if (first.type.startsWith('quote_')) {
      const sTag = first.match[0];
      const eTagStr = sTag.replace('[', '[/');
      const eRe = new RegExp(eTagStr.replace('[', '\\[').replace(']', '\\]'), 'i');
      const eMatch = remaining.substring(sTag.length).match(eRe);
      if (eMatch) {
        const eIdx = sTag.length + eMatch.index;
        const cleanText = remaining.substring(sTag.length, eIdx).trim()
          .replace(/\[\/?B\]/gi, '').replace(/\[IMAGE_ANCHOR_\d+\]/gi, '').replace(/\n+/g, ' ').trim();
        tokens.push({ type: first.type, content: cleanText });
        remaining = remaining.substring(eIdx + eMatch[0].length).replace(/^\n+/, '');
      } else {
        remaining = remaining.substring(sTag.length);
      }
    } else if (first.type === 'bold') {
      const eMatch = remaining.substring(3).match(/\[\/B\]/i);
      if (eMatch) {
        const eIdx = 3 + eMatch.index;
        tokens.push({ type: 'bold', content: remaining.substring(3, eIdx) });
        remaining = remaining.substring(eIdx + 4);
      } else {
        remaining = remaining.substring(3);
      }
    } else if (first.type === 'image') {
      tokens.push({ type: 'image', id: parseInt(first.match[1]) });
      remaining = remaining.substring(first.match[0].length);
    } else if (first.type === 'map' || first.type === 'cta_banner') {
      tokens.push({ type: first.type });
      remaining = remaining.substring(first.match[0].length).replace(/^\n+/, '');
    }
  }
  return tokens;
}

// ════════════════════════════════════════════════════════════
//  에디터 자동화 헬퍼들
// ════════════════════════════════════════════════════════════

async function waitForEditorReady(tabId) {
  for (let i = 0; i < 60; i++) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => !!(
          document.querySelector('.se-main-container') ||
          document.querySelector('.se-canvas') ||
          document.querySelector('[class*="se-component"]') ||
          document.querySelectorAll('[contenteditable="true"]').length >= 2
        ),
      });
      if (results?.some(r => r?.result)) return true;
    } catch (_) {}
    await sleep(500);
  }
  return false;
}

// 사이드바 / 팝업 닫기 (Puppeteer _closeSidebars 포팅)
async function closeSidebars(tabId, editorFrameId) {
  for (let i = 0; i < 3; i++) {
    await evalInEditor(tabId, editorFrameId, () => {
      const closeSelectors = [
        '.se-aside-close-button', '.se-aside-library-close-button',
        '.se-aside-header-close-button', '[class*="aside_close"]',
        '[class*="library_close"]', 'button[aria-label="닫기"]',
        'button[title="닫기"]', '.se-btn-close',
      ];
      closeSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(b => {
          if (b.getBoundingClientRect().width > 0) b.click();
        });
      });
      document.querySelectorAll('.se-help-popup, .se-popup-container').forEach(ov => {
        ov.querySelectorAll('button').forEach(b => b.click());
      });
    }).catch(() => {});
    await sendKey(tabId, 'Escape', 'Escape', 27);
    await sleep(400);
  }
}

// 이미지 업로드
// chrome.downloads → 로컬 임시 파일 경로 획득 → Page.setInterceptFileChooserDialog + DOM.setFileInputFiles
// (Puppeteer의 waitForFileChooser + fileChooser.accept([localPath]) 동작과 동일)
// 이미지 링크 적용 (업로드 직후 이미지 선택 상태에서 호출)
async function applyLinkToImage(tabId, editorFid, link) {
  if (!link) return;

  // 전화번호 → tel: 변환
  let finalLink = link;
  const isRawPhone = typeof link === 'string' &&
    (link.match(/^[\d]{2,3}-[\d]{3,4}-[\d]{4}$/) || link.startsWith('010') || link.startsWith('02-'));
  if (isRawPhone) {
    finalLink = `tel:${link.replace(/[^\d]/g, '')}`;
  } else if (typeof link === 'string' && link.toLowerCase().startsWith('tel:')) {
    finalLink = link;
  }
  console.warn('[LINK] Applying image link:', finalLink);

  // 1. 링크 버튼 클릭 — 모든 프레임 탐색
  // 확인된 DOM: 이미지 플로팅 툴바의 버튼들은 span.se-toolbar-icon을 포함
  // 링크 버튼은 플로팅 툴바의 마지막 버튼 (y > 100: 상단 에디터 툴바 제외)
  const linkBtnResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      // 명시적 셀렉터 우선 시도
      const specific = [
        'button[data-name="image-link"]',
        // button[data-name="link"] 제거 — 상단 텍스트 링크 버튼도 매칭돼서 이미지 미선택 시 URL이 텍스트로 삽입되는 버그
        'button[title="링크"]',
        'button[title*="링크"]',
        'button[aria-label="링크"]',
        'button[aria-label*="링크"]',
        'button.se-link-toolbar-button',
      ];
      for (const sel of specific) {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetWidth > 0) { btn.click(); return `specific:${sel}`; }
      }

      // 폴백: span.se-toolbar-icon 포함 버튼 중 y > 100인 것 (이미지 플로팅 툴바)
      // 상단 에디터 툴바(y ≈ 0~100)와 구분
      const floatingBtns = Array.from(document.querySelectorAll('button')).filter(b => {
        if (!b.offsetWidth) return false;
        if (!b.querySelector('span.se-toolbar-icon')) return false;
        const r = b.getBoundingClientRect();
        return r.top > 100;
      });
      if (floatingBtns.length > 0) {
        const last = floatingBtns[floatingBtns.length - 1];
        last.click();
        return `floating-last(${floatingBtns.length}):class=${last.className.trim().split(' ')[0]}`;
      }
      return null;
    }
  }).catch(() => null);

  const clickedFrame = linkBtnResults?.find(r => r?.result);
  console.warn('[LINK] 링크 버튼 클릭 결과:', clickedFrame?.result || 'NOT FOUND');
  if (!clickedFrame?.result) {
    console.warn('[LINK] 링크 버튼을 찾지 못해 스킵');
    return;
  }
  await sleep(1000);

  // 2. 링크 입력란에 값 설정
  // 확인된 DOM: input.se-custom-layer-link-input[type="url"][data-role="input"]
  const inputResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (val) => {
      const inp = document.querySelector('input.se-custom-layer-link-input');
      if (!inp) return null;
      inp.focus();
      // native setter로 React controlled input 우회
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inp, val);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return inp.className;
    },
    args: [finalLink]
  }).catch(() => null);

  const inputFrame = inputResults?.find(r => r?.result);
  console.warn('[LINK] 입력란 설정 결과:', inputFrame?.result || 'NOT FOUND');
  if (!inputFrame?.result) {
    console.warn('[LINK] 입력란을 찾지 못함 — Enter로 닫기');
    await sendKey(tabId, 'Return', 'Enter', 13);
    return;
  }

  await sleep(500);

  // 3. 확인 버튼 클릭 (없으면 Enter로 대체)
  const applyResults = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      const selectors = [
        'button.se-custom-layer-link-apply-button',
        'button[data-role="apply"]',
        'button[class*="link-apply"]',
        'button[class*="link_apply"]',
      ];
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetWidth > 0) { btn.click(); return sel; }
      }
      return null;
    }
  }).catch(() => null);

  const appliedFrame = applyResults?.find(r => r?.result);
  console.warn('[LINK] 확인 버튼 결과:', appliedFrame?.result || 'Enter로 대체');
  if (!appliedFrame?.result) {
    await sendKey(tabId, 'Return', 'Enter', 13);
  }
  await sleep(800);
  console.warn('[LINK] ✅ 링크 적용 완료:', finalLink);
}

async function clickAiUsageToggle(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      const btns = Array.from(document.querySelectorAll('.se-set-ai-mark-button-toggle'));
      if (!btns.length) return null;
      // 이미지는 문서 순서대로 삽입되므로 btns[마지막] = 현재 업로드된 이미지의 토글
      // querySelector / offsetParent는 항상 1번 이미지를 반환하므로 사용 금지
      const btn = btns[btns.length - 1];
      const isOn = btn.getAttribute('aria-pressed') === 'true' ||
                   btn.classList.contains('active') ||
                   btn.classList.contains('on');
      if (isOn) return 'already_on';
      btn.click();
      return btn.className;
    }
  }).catch(() => null);
  const result = results?.find(r => r?.result);
  console.warn('[AI-TOGGLE]', result?.result || 'NOT FOUND');
  await sleep(300);
}

async function uploadImageInTab(tabId, imageUrl, link = null, isAiGenerated = false) {
  // 1. 이미지를 로컬 임시 파일로 다운로드 (로컬 경로 획득)
  let downloadId;
  try {
    downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: imageUrl,
        filename: `blogmaster_${Date.now()}.jpg`,
        saveAs: false,
        conflictAction: 'overwrite',
      }, (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      });
    });
  } catch (e) {
    console.warn('[IMG] Download start failed:', e.message);
    return false;
  }

  const localPath = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(dl);
      resolve(null);
    }, 30000);
    function dl(delta) {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') {
        chrome.downloads.onChanged.removeListener(dl);
        clearTimeout(timer);
        chrome.downloads.search({ id: downloadId }, ([item]) => resolve(item?.filename || null));
      } else if (delta.state?.current === 'interrupted') {
        chrome.downloads.onChanged.removeListener(dl);
        clearTimeout(timer);
        resolve(null);
      }
    }
    chrome.downloads.onChanged.addListener(dl);
  });

  if (!localPath) {
    console.warn('[IMG] Image download failed or timed out');
    return false;
  }
  console.warn('[IMG] Downloaded to:', localPath);

  const editorFid = await findEditorFrameId(tabId);

  // 2. 이미지 버튼 좌표 탐색
  const imgBtnCoords = await getAbsoluteCoords(tabId, editorFid, () => {
    const selectors = [
      'button.se-image-toolbar-button',
      '.se-toolbar-item-image button',
      'button[data-name="image"]',
      'button[aria-label*="사진"]', 'button[title*="사진"]',
      'button[aria-label*="이미지"]', 'button[title*="이미지"]',
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetWidth > 0) {
        btn.scrollIntoView({ behavior: 'instant', block: 'nearest' });
        const r = btn.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }
    }
    return null;
  });

  if (!imgBtnCoords) {
    console.warn('[IMG] Image button not found');
    chrome.downloads.removeFile(downloadId, () => {});
    return false;
  }
  console.warn('[IMG] Image button coords:', imgBtnCoords);

  // 3. 파일 선택기 인터셉트 활성화 (OS 다이얼로그 차단)
  // Page.enable + DOM.enable 없이는 Page.fileChooserOpened 이벤트가 chrome.debugger.onEvent로 전달되지 않음
  await chrome.debugger.sendCommand({ tabId }, 'Page.enable').catch(() => {});
  await chrome.debugger.sendCommand({ tabId }, 'DOM.enable').catch(() => {});
  await chrome.debugger.sendCommand({ tabId }, 'Page.setInterceptFileChooserDialog', { enabled: true });

  // 4. 이벤트 리스너 먼저 등록 후 CDP 클릭 (Puppeteer의 Promise.all과 동일한 패턴)
  const fileChooserPromise = new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.debugger.onEvent.removeListener(listener);
      resolve(null);
    }, 10000);
    function listener(source, method, params) {
      if (source.tabId === tabId && method === 'Page.fileChooserOpened') {
        chrome.debugger.onEvent.removeListener(listener);
        clearTimeout(timer);
        resolve(params.backendNodeId || null);
      }
    }
    chrome.debugger.onEvent.addListener(listener);
  });

  // 5. CDP trusted 클릭 → 파일 선택기 트리거
  await clickAtCoords(tabId, imgBtnCoords.x, imgBtnCoords.y);

  const backendNodeId = await fileChooserPromise;
  console.warn('[IMG] fileChooserOpened backendNodeId:', backendNodeId);

  // 6. 파일 경로 설정 (DOM.setFileInputFiles)
  let uploadTriggered = false;
  if (backendNodeId) {
    try {
      await chrome.debugger.sendCommand({ tabId }, 'DOM.setFileInputFiles', {
        files: [localPath],
        backendNodeId,
      });
      uploadTriggered = true;
      console.warn('[IMG] Files set via DOM.setFileInputFiles');
    } catch (e) {
      console.warn('[IMG] DOM.setFileInputFiles failed:', e.message);
    }
  } else {
    console.warn('[IMG] File chooser not intercepted (timeout or no event)');
  }

  // 7. 인터셉트 비활성화
  await chrome.debugger.sendCommand({ tabId }, 'Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});

  if (!uploadTriggered) {
    chrome.downloads.removeFile(downloadId, () => {});
    return false;
  }

  // 8. 업로드 완료 대기 (로딩 인디케이터 사라질 때까지)
  await sleep(3000);
  for (let i = 0; i < 30; i++) {
    const loading = await evalInEditor(tabId, editorFid,
      () => !!document.querySelector('.se-image-loading')
    );
    if (!loading) break;
    await sleep(1000);
  }
  await sleep(1500);

  // 9. Escape 후 마지막 이미지를 CDP 신뢰 클릭으로 선택 → 플로팅 툴바 표시
  // JS .click()은 네이버 에디터가 이미지 선택으로 인식하지 않아 플로팅 툴바가
  // 나타나지 않음 — CDP clickAtCoords(trusted click)로 교체
  await sendKey(tabId, 'Escape', 'Escape', 27);
  await sleep(500);

  const lastImgCoords = await getAbsoluteCoords(tabId, editorFid, () => {
    const imgs = document.querySelectorAll(
      '.se-component .se-image-container img, .se-module-image img, .se-image img'
    );
    if (!imgs.length) return null;
    const last = imgs[imgs.length - 1];
    last.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    const r = last.getBoundingClientRect();
    if (!r.width) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });

  if (lastImgCoords) {
    await clickAtCoords(tabId, lastImgCoords.x, lastImgCoords.y);
    await sleep(1000);
  } else {
    await sendKey(tabId, 'ArrowUp', 'ArrowUp', 38);
    await sleep(1000);
  }

  // 10. AI 생성 이미지면 AI 활용 설정 토글 ON
  if (isAiGenerated) {
    await clickAiUsageToggle(tabId);
  }

  // 11. 이미지 링크 적용 (이미지 선택 상태, 정렬 전)
  if (link) {
    await applyLinkToImage(tabId, editorFid, link);
  }

  // 12. 가운데 정렬
  await sleep(500);
  await evalInEditor(tabId, editorFid, () => {
    const alignBtn = document.querySelector(
      '.se-align-center-toolbar-button, button[class*="align_center"]'
    );
    if (alignBtn) alignBtn.click();
  });
  await sleep(500);

  // Escape로 이미지 선택 해제 → Return으로 빈 줄 1칸 생성
  // (메인 루프도 Return 1개를 추가하므로 합계 2칸이 될 것 같지만,
  //  Escape 직후 커서가 이미지 바로 옆 단락에 있어 실제로는 1칸만 비워짐)
  await sendKey(tabId, 'Escape', 'Escape', 27);
  await sleep(200);
  await sendKey(tabId, 'Return', 'Enter', 13);
  await sleep(300);

  // 10. 임시 파일 삭제
  chrome.downloads.removeFile(downloadId, () => {});

  return true;
}

// 인용구 삽입 (6가지 스타일 전체 지원)
async function insertQuoteInTab(tabId, editorFrameId, type, text) {
  // 스타일 셀렉터의 실제 값(quotation_bubble/quotation_underline/quotation_corner)은
  // 인용구 삽입 드롭다운(se-toolbar-option-insert-quotation-*-button)에서 devtools로 확인한
  // data-value 그대로 적용 — balloon/line_quotation/frame은 추측이었고 실제 값과 달라서 실패했었음.
  const styleClassMap = {
    quote_default:        '.se-quotation-quotation_default-toolbar-button',
    quote_vertical:       '.se-quotation-quotation_line-toolbar-button',
    quote_postit:         '.se-quotation-quotation_postit-toolbar-button',
    quote_balloon:        '.se-quotation-quotation_bubble-toolbar-button',
    quote_line_quotation: '.se-quotation-quotation_underline-toolbar-button',
    quote_frame:          '.se-quotation-quotation_corner-toolbar-button',
  };

  const quoteBtnCoords = await getAbsoluteCoords(tabId, editorFrameId, () => {
    const btn = document.querySelector(
      '.se-insert-quotation-default-toolbar-button, button[class*="quotation"][data-type="icon"]'
    );
    if (!btn) return null;
    btn.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    const r = btn.getBoundingClientRect();
    if (r.left < -500) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  if (!quoteBtnCoords) {
    await typeViaDebugger(tabId, `「${text}」`);
    await sendKey(tabId, 'Return', 'Enter', 13);
    return;
  }

  await clickAtCoords(tabId, quoteBtnCoords.x, quoteBtnCoords.y);
  await sleep(1500);

  const styleSel = styleClassMap[type] || styleClassMap.quote_default;
  const styleBtnCoords = await getAbsoluteCoords(tabId, editorFrameId, (sel) => {
    const btn = document.querySelector(sel);
    if (!btn) return null;
    btn.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    const r = btn.getBoundingClientRect();
    if (r.left < -500) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [styleSel]);

  if (styleBtnCoords) {
    await clickAtCoords(tabId, styleBtnCoords.x, styleBtnCoords.y);
    await sleep(800);
  }

  // 말풍선/프레임은 스타일 적용 직후 네이버가 출처칸(se-cite)을 활성 상태로 잡아버려서,
  // 기존 셀렉터(.se-quotation-content 등)로 찾은 좌표가 결국 se-cite를 가리키게 된다.
  // 이 두 타입만 명시적으로 메인칸(.se-module-text.se-quote)을 타겟으로 강제 지정.
  // 다른 4종은 기존 셀렉터 그대로 사용 (영향 없음).
  const forceMainQuoteField = (type === 'quote_balloon' || type === 'quote_frame');
  const quoteAreaCoords = await getAbsoluteCoords(tabId, editorFrameId, (forceMain) => {
    if (forceMain) {
      const els = document.querySelectorAll('.se-module-text.se-quote');
      if (els.length) {
        const el = els[els.length - 1];
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        const r = el.getBoundingClientRect();
        if (r.left >= -500) return { x: r.left + r.width / 2, y: r.top + Math.max(r.height / 2, 8) };
      }
      return null;
    }
    for (const sel of ['.se-quotation-content', '.se-module-quotation', '.se-quotation']) {
      const els = document.querySelectorAll(sel);
      if (!els.length) continue;
      const el = els[els.length - 1];
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = el.getBoundingClientRect();
      if (r.left < -500) continue;
      return { x: r.left + r.width / 2, y: r.top + Math.max(r.height / 2, 8) };
    }
    return null;
  }, [forceMainQuoteField]);
  console.warn('[AUTOMATION] quoteAreaCoords:', quoteAreaCoords, 'forceMainQuoteField:', forceMainQuoteField);
  if (quoteAreaCoords) await clickAtCoords(tabId, quoteAreaCoords.x, quoteAreaCoords.y);
  await sleep(300);

  await typeViaDebugger(tabId, text);
  await sleep(800);
  await sendKey(tabId, 'Escape', 'Escape', 27);
  await sleep(600);
  await sendKey(tabId, 'ArrowDown', 'ArrowDown', 40);
  await sleep(800);

  // 탈출 확인: 커서가 아직 인용구 안에 있으면 인용구 아래를 클릭해 강제 이탈
  const stillInQuote = await evalInEditor(tabId, editorFrameId, () => {
    try {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return false;
      let el = sel.anchorNode;
      if (el?.nodeType === 3) el = el.parentElement;
      while (el && el !== document.body) {
        if (el.classList?.contains('se-module-quotation') ||
            el.classList?.contains('se-quotation-content') ||
            (el.className && /quotation/.test(el.className))) return true;
        el = el.parentElement;
      }
    } catch (_) {}
    return false;
  }).catch(() => false);

  if (stillInQuote) {
    console.warn('[AUTOMATION] Still inside quote — forcing exit by clicking below');
    await sendKey(tabId, 'Escape', 'Escape', 27);
    await sleep(400);
    const belowCoords = await getAbsoluteCoords(tabId, editorFrameId, () => {
      const quotes = document.querySelectorAll('.se-quotation-container');
      if (!quotes.length) return null;
      const last = quotes[quotes.length - 1];
      const r = last.getBoundingClientRect();
      if (!r.width || !r.height) return null; // 크기 0인 숨겨진 요소 무시
      const targetY = r.bottom + 30;
      if (targetY > window.innerHeight - 10) return null;
      return { x: r.left + Math.min(r.width / 2, 300), y: targetY };
    });
    if (belowCoords) {
      await clickAtCoords(tabId, belowCoords.x, belowCoords.y);
      await sleep(500);
    } else {
      // 화면 밖이면 그냥 ArrowDown 한 번 더
      await sendKey(tabId, 'ArrowDown', 'ArrowDown', 40);
      await sleep(500);
    }
  }
}

// 지도(MAP) 삽입 (Puppeteer _insertMap 포팅)
async function insertMapInTab(tabId, editorFrameId, address) {
  if (!address) return false;
  console.warn('[AUTOMATION] insertMap:', address);

  // 지도 버튼 — 에디터 iframe과 메인 프레임 모두 탐색
  const mapBtnCoords = await getAbsoluteCoords(tabId, editorFrameId, () => {
    const allBtns = document.querySelectorAll('button, [role="button"]');
    const btn = Array.from(allBtns).find(b => {
      const text  = (b.innerText || b.textContent || '').trim();
      const label = b.getAttribute('aria-label') || b.getAttribute('title') || '';
      return (text.includes('장소') || label.includes('장소')) && b.offsetWidth > 0;
    });
    if (!btn) return null;
    btn.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    const r = btn.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });

  if (!mapBtnCoords) { console.warn('[AUTOMATION] 지도 버튼 미발견'); return false; }
  console.warn('[AUTOMATION] 지도 버튼 coords:', mapBtnCoords);
  await clickAtCoords(tabId, mapBtnCoords.x, mapBtnCoords.y);
  await sleep(3000); // 검색 패널 열리기 대기

  // 검색 입력창 클릭 후 포커스 — 포커스 없이 typeViaDebugger하면 입력이 안 됨
  const searchInputCoords = await getAbsoluteCoords(tabId, editorFrameId, () => {
    const sel = [
      '.se-place-search-input', 'input[placeholder*="장소"]',
      'input[placeholder*="검색"]', '.se-popup input[type="text"]', 'input[type="search"]',
    ];
    for (const s of sel) {
      const inp = document.querySelector(s);
      if (inp && inp.offsetWidth > 0) {
        const r = inp.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      }
    }
    return null;
  });

  if (searchInputCoords) {
    await clickAtCoords(tabId, searchInputCoords.x, searchInputCoords.y);
    await sleep(500);
  }

  await typeViaDebugger(tabId, address);
  await sendKey(tabId, 'Return', 'Enter', 13);
  await sleep(4000); // 검색 결과 대기

  // ── Step 1: 결과 아이템에 CDP trusted 호버 → CSS :hover → "추가" 버튼 표시 ──
  // 실제 클래스: li.se-place-map-search-result-item (내부에 button.se-place-add-button 항상 존재,
  // 단 hover 전엔 CSS로 숨겨져 있음)
  const hoverCoords = await getAbsoluteCoords(tabId, editorFrameId, () => {
    const item = document.querySelector('.se-place-map-search-result-item, .se-place-map-search-result-link');
    if (!item) return null;
    item.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    const r = item.getBoundingClientRect();
    if (!r.width) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });

  if (hoverCoords) {
    console.warn('[AUTOMATION] 검색 결과 호버 좌표:', hoverCoords);
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: hoverCoords.x, y: hoverCoords.y, button: 'none', buttons: 0,
    });
    await sleep(600); // CSS :hover 적용 + "추가" 버튼 렌더링 대기
  } else {
    console.warn('[AUTOMATION] se-place-map-search-result-item 미발견');
  }

  // ── Step 2: "추가" 버튼 클릭 (hover 후 visible) ──────────────────────────────
  // se-place-add-button은 hover 전엔 offsetWidth=0, hover 후엔 > 0
  let addClicked = await evalInEditor(tabId, editorFrameId, () => {
    const btn = document.querySelector('.se-place-add-button');
    if (btn && btn.offsetWidth > 0) { btn.click(); return '.se-place-add-button'; }
    return null;
  });
  if (!addClicked) {
    addClicked = await evalInTab(tabId, () => {
      const btn = document.querySelector('.se-place-add-button');
      if (btn && btn.offsetWidth > 0) { btn.click(); return '.se-place-add-button(main)'; }
      return null;
    });
  }
  console.warn('[AUTOMATION] 지도 추가 클릭:', addClicked);
  await sleep(2000);

  // ── Step 3: "확인" 버튼 클릭 ─────────────────────────────────────────────────
  let confirmClicked = await evalInEditor(tabId, editorFrameId, () => {
    const btn = document.querySelector('.se-popup-button-confirm:not(:disabled)');
    if (btn && btn.offsetWidth > 0) { btn.click(); return '.se-popup-button-confirm'; }
    return null;
  });
  if (!confirmClicked) {
    await evalInTab(tabId, () => {
      const btn = document.querySelector('.se-popup-button-confirm:not(:disabled)');
      if (btn && btn.offsetWidth > 0) btn.click();
    });
    confirmClicked = '확인(main)';
  }
  console.warn('[AUTOMATION] 지도 확인 클릭:', confirmClicked);
  await sleep(4000);

  // 가운데 정렬
  await sendKey(tabId, 'ArrowUp', 'ArrowUp', 38);
  await sleep(500);
  await evalInEditor(tabId, editorFrameId, () => {
    const btn = document.querySelector('.se-align-center-toolbar-button, button[class*="align_center"]');
    if (btn) btn.click();
  });
  await sleep(500);
  await sendKey(tabId, 'ArrowDown', 'ArrowDown', 40);
  await sendKey(tabId, 'Return', 'Enter', 13);
  return true;
}

// 푸터 시스템 삽입 (Puppeteer _insertFooterSystem 포팅)
async function insertFooterSystem(tabId, editorFrameId, components, imageUrls) {
  if (!components?.length) return;
  console.warn('[AUTOMATION] insertFooterSystem:', components.length, 'items');

  // 에디터 하단으로 이동
  await sendKey(tabId, 'End', 'End', 35, 4); // Ctrl+End
  await sleep(1000);

  for (const comp of components) {
    try {
      if (comp.type === 'TEXT' && comp.content) {
        // 직전 인용구 종료 시 "강제 이탈" 클릭이 숨겨진 요소를 잘못 잡아 포커스가
        // <body>로 완전히 빠지는 경우가 있어(인용구 다음에 바로 TEXT가 오면 재현됨),
        // 정렬 적용/타이핑 전에 커서를 문서 끝으로 강제 이동시켜 항상 올바른 위치에서 시작하게 한다.
        await sendKey(tabId, 'End', 'End', 35, 4); // Ctrl+End
        await sleep(300);

        // 정렬 설정
        if (comp.align) {
          await evalInEditor(tabId, editorFrameId, (align) => {
            const alignDropdown = document.querySelector(
              'button[data-name="align-drop-down-with-justify"][data-type="drop-down"]'
            );
            if (alignDropdown) {
              alignDropdown.click();
              setTimeout(() => {
                const map = { left: '.se-toolbar-option-align-left-button', center: '.se-toolbar-option-align-center-button', right: '.se-toolbar-option-align-right-button' };
                const btn = document.querySelector(map[align] || map.center);
                if (btn) btn.click();
              }, 400);
            }
          }, [comp.align]);
          await sleep(700);
        }
        await typeViaDebugger(tabId, comp.content);
        await sendKey(tabId, 'Return', 'Enter', 13);
        await sendKey(tabId, 'Return', 'Enter', 13);

      } else if (comp.type === 'QUOTE' && comp.content?.trim()) {
        await insertQuoteInTab(tabId, editorFrameId, comp.quote_style || 'quote_default', comp.content.trim());
        await sendKey(tabId, 'Return', 'Enter', 13);

      } else if (comp.type === 'IMAGE') {
        const imgUrl = comp.url || comp.localPath;
        const imgLink = comp.link_value || null;
        if (imgUrl && imgUrl.startsWith('http')) {
          await uploadImageInTab(tabId, imgUrl, imgLink);
        } else {
          console.warn('[AUTOMATION] Footer IMAGE: URL 없음, 스킵');
        }

      } else if (comp.type === 'MAP' && comp.address) {
        await insertMapInTab(tabId, editorFrameId, comp.address);
      }
    } catch (e) {
      console.warn('[AUTOMATION] Footer item error:', e.message);
      await sendKey(tabId, 'Return', 'Enter', 13);
    }
    await sleep(200);
  }
}

// 발행 설정 패널 적용 (에디터 iframe 기준)
async function applyPublishSettings(tabId, editorFrameId, options) {
  if (!options || Object.keys(options).length === 0) return;
  console.warn('[AUTOMATION] applyPublishSettings:', JSON.stringify(options));

  // ── 공개 설정 — data-click-area로 정확히 타겟 ─────────────
  // HTML: <input data-click-area="tpb*i.secret" id="open_private"> <label for="open_private">비공개</label>
  if (options.visibility) {
    const visClickAreaMap = {
      all: 'tpb*i.all',       public:   'tpb*i.all',      '전체공개':   'tpb*i.all',
      neighbor: 'tpb*i.buddy1',          '이웃공개':  'tpb*i.buddy1',
      buddy: 'tpb*i.buddy2',             '서로이웃공개': 'tpb*i.buddy2',
      private: 'tpb*i.secret',           '비공개':    'tpb*i.secret',
    };
    const clickArea = visClickAreaMap[options.visibility];
    if (clickArea) {
      const clicked = await evalInEditor(tabId, editorFrameId, (ca) => {
        // radio input의 data-click-area로 찾고, 연결된 label 클릭
        const input = document.querySelector(`[data-click-area="${ca}"]`);
        if (input) {
          const label = document.querySelector(`label[for="${input.id}"]`);
          if (label) { label.click(); return `label[for=${input.id}]`; }
          input.click();
          return `input[data-click-area=${ca}]`;
        }
        return null;
      }, [clickArea]);
      console.warn('[AUTOMATION] visibility clicked:', clicked);
      await sleep(800);
    }
  }

  // ── 카테고리 ──────────────────────────────────────────────
  if (options.category_id || options.category_name) {
    const catName = options.category_name || '';
    const catId   = String(options.category_id || '');

    // 1단계: 트리거 찾기 — 발행 패널은 메인 프레임에 있으므로 0 우선, 에디터 iframe 폴백
    const triggerFrames = editorFrameId > 0 ? [0, editorFrameId] : [0];
    let triggerCoords = null;
    let triggerFrame  = 0;

    for (const fid of triggerFrames) {
      const coords = await getAbsoluteCoords(tabId, fid, () => {
        // A: "카테고리" 레이블 근처 버튼 탐색
        const catLabel = Array.from(document.querySelectorAll('*')).find(el => {
          const txt = (el.innerText || el.textContent || '').trim();
          const r   = el.getBoundingClientRect();
          return (txt === '카테고리' || txt === '블로그 카테고리') && r.width > 0 && r.height < 50;
        });
        if (catLabel) {
          let node = catLabel;
          for (let i = 0; i < 8; i++) {
            if (!node.parentElement) break;
            node = node.parentElement;
            const btn = node.querySelector('button, [role="button"], [role="combobox"]');
            if (btn && btn !== catLabel && btn.getBoundingClientRect().width > 0) {
              const r = btn.getBoundingClientRect();
              return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
            }
          }
        }
        // B: data-testid 폴백
        const byId = document.querySelector('[data-testid*="categoryItemText"]');
        if (byId && byId.getBoundingClientRect().width > 0) {
          const r = byId.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }
        return null;
      });
      if (coords) { triggerCoords = coords; triggerFrame = fid; break; }
    }

    console.warn('[CAT] trigger coords:', triggerCoords, 'frame:', triggerFrame);

    if (triggerCoords) {
      // 2단계: 드롭다운 열기
      await clickAtCoords(tabId, triggerCoords.x, triggerCoords.y);
      await sleep(2500);

      // 3단계: 아이템 선택 — 실제 HTML 구조 기반
      // <input data-testid="categoryBtn_15" id="15_맞춤여행 후기" type="radio">
      // <label for="15_맞춤여행 후기" role="button"> ← 실제 클릭 대상
      //   <span data-testid="categoryItemText_15">맞춤여행 후기</span>
      const directClicked = await evalInEditor(tabId, triggerFrame, (cId, cName) => {
        const norm = t => (t || '').replace(/[\s└ㄴ·]/g, '').toLowerCase();
        const nTarget = norm(cName);

        const clickLabel = (label) => {
          if (!label) return null;
          label.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          label.click();
          return (label.innerText || label.textContent || '').trim().substring(0, 30);
        };

        // 전략 A: categoryBtn_{id} 라디오 → 연결된 label 클릭 (가장 정확)
        const radioInput = document.querySelector(`[data-testid="categoryBtn_${cId}"]`);
        if (radioInput && radioInput.id) {
          const label = document.querySelector(`label[for="${CSS.escape(radioInput.id)}"]`);
          if (label && label.getBoundingClientRect().width > 0) {
            return clickLabel(label);
          }
        }

        // 전략 B: categoryItemText_{id} span → 부모 label 클릭
        const spanById = document.querySelector(`[data-testid="categoryItemText_${cId}"]`);
        if (spanById && spanById.getBoundingClientRect().width > 0) {
          const label = spanById.closest('label') || spanById.parentElement?.closest('label');
          if (label) return clickLabel(label);
        }

        // 전략 C: 텍스트 이름으로 categoryItemText span 검색 → 부모 label 클릭
        const allSpans = Array.from(document.querySelectorAll('[data-testid*="categoryItemText"]'))
          .filter(el => el.getBoundingClientRect().width > 0);
        console.warn('[CAT] categoryItemText spans found:', allSpans.length,
          allSpans.slice(0, 5).map(s => (s.innerText || '').trim().slice(0, 20)));

        const matchedSpan =
          allSpans.find(s => norm(s.innerText || s.textContent) === nTarget) ||
          allSpans.find(s => norm(s.innerText || s.textContent).includes(nTarget));
        if (matchedSpan) {
          const label = matchedSpan.closest('label') || matchedSpan.parentElement?.closest('label');
          if (label) return clickLabel(label);
        }

        return null;
      }, [catId, catName]);

      if (directClicked) {
        console.warn('[CAT] ✅ 카테고리 선택 완료:', directClicked);
        await sleep(800);
      } else {
        console.warn('[CAT] 카테고리 아이템 찾기 실패:', catName, catId);
        await sendKey(tabId, 'Escape', 'Escape', 27);
      }
    } else {
      console.warn('[CAT] category trigger not found');
    }
  }

  // ── 주제(글 주제) 설정 ────────────────────────────────────
  if (options.topic_id && options.topic_id !== '0' && options.topic_id !== '주제 선택 안 함') {
    const topicName = options.topic_id;
    const triggerClicked = await evalInEditor(tabId, editorFrameId, (name) => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const label = allEls.find(el => {
        const txt = (el.innerText || '').trim();
        return (txt === '주제' || txt === '글 주제') && el.getBoundingClientRect().width > 0;
      });
      if (!label) return false;
      let node = label;
      for (let i = 0; i < 6; i++) {
        if (!node.parentElement) break;
        node = node.parentElement;
        const trigger = node.querySelector('button, [role="button"], a');
        if (trigger && trigger !== label && trigger.getBoundingClientRect().width > 0) {
          trigger.click();
          return true;
        }
      }
      label.click();
      return true;
    }, [topicName]);

    if (triggerClicked) {
      await sleep(3000);
      // 팝업 내 항목 클릭 + 확인 버튼
      const clicked = await evalInEditor(tabId, editorFrameId, (name) => {
        const normalize = t => t.replace(/[·・•]/g, '·').replace(/\s+/g, ' ').trim();
        const target = normalize(name);
        // 팝업 컨테이너 탐색
        const titleEl = Array.from(document.querySelectorAll('*')).find(el => {
          const txt = (el.innerText || '').trim();
          const r = el.getBoundingClientRect();
          return txt === '주제 설정' && r.width > 0 && r.height > 0;
        });
        let root = null;
        if (titleEl) {
          let node = titleEl;
          for (let i = 0; i < 12; i++) {
            if (!node.parentElement) break;
            node = node.parentElement;
            const r = node.getBoundingClientRect();
            if (r.width > 300 && r.height > 200) { root = node; break; }
          }
        }
        if (!root) root = document;

        const labels = Array.from(root.querySelectorAll('label'))
          .filter(el => el.getBoundingClientRect().width > 0 && normalize(el.innerText || '') === target);
        const best = labels[0];
        if (best) {
          const r = best.getBoundingClientRect();
          best.click();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        return null;
      }, [topicName]);

      await sleep(800);
      // 확인 버튼 클릭
      await evalInEditor(tabId, editorFrameId, () => {
        const btn = document.querySelector('[data-click-area*="subjectok"]') ||
          Array.from(document.querySelectorAll('button[class*="ok_btn"], button'))
            .find(b => b.textContent?.trim() === '확인' && b.getBoundingClientRect().width > 0);
        if (btn) btn.click();
      });
      await sleep(3000);
    }
  }

  // ── 체크박스 설정 (댓글/공감/검색/블로그공유/외부공유) ──
  await evalInEditor(tabId, editorFrameId, (opts) => {
    function toggleCheckbox(textHint, enable) {
      if (enable === undefined || enable === null) return;
      const labels = Array.from(document.querySelectorAll('label'));
      const label = labels.find(l =>
        l.textContent?.replace(/\s/g, '').includes(textHint) && l.getBoundingClientRect().width > 0
      );
      if (!label) return;
      const cb = label.querySelector('input[type="checkbox"]') ||
        document.getElementById(label.htmlFor) ||
        label.closest('li, div')?.querySelector('input[type="checkbox"]');
      if (cb && cb.checked !== !!enable) label.click();
    }
    if (opts.allow_comments      !== undefined) toggleCheckbox('댓글허용',   opts.allow_comments);
    if (opts.allow_likes         !== undefined) toggleCheckbox('공감허용',   opts.allow_likes);
    if (opts.allow_search        !== undefined) toggleCheckbox('검색허용',   opts.allow_search);
    if (opts.allow_share         !== undefined) toggleCheckbox('블로그/카페', opts.allow_share);
    if (opts.allow_external      !== undefined) toggleCheckbox('외부공유',   opts.allow_external);
  }, [options]);
  await sleep(500);
}

// 예약 발행 날짜/시간 설정
async function applyScheduledAt(tabId, editorFrameId, scheduledAt) {
  const dateObj = new Date(scheduledAt);
  const kstParts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(dateObj);
  const getPart = type => kstParts.find(p => p.type === type)?.value;
  const yyyy = getPart('year'), mm = getPart('month'), dd = getPart('day');
  const hourVal = getPart('hour');
  const rawMin = parseInt(getPart('minute'));
  const minVal = String(Math.min(Math.round(rawMin / 10) * 10, 50)).padStart(2, '0');
  // 실제 input value 포맷: "2026. 05. 19" (마침표 없음)
  const dateStr = `${yyyy}. ${mm}. ${dd}`;
  console.warn('[AUTOMATION] 예약 발행 시각 (KST):', dateStr, hourVal + ':' + minVal);

  // "예약" 라디오 클릭 — data-click-area="tpb*i.schedule" (applyPublishSettings와 동일 패턴)
  const scheduleClicked = await evalInEditor(tabId, editorFrameId, () => {
    const input = document.querySelector('[data-click-area="tpb*i.schedule"], [data-testid="preTimeRadioBtn"]');
    if (input) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) { label.click(); return 'label:' + input.id; }
      input.click(); return 'input:' + input.id;
    }
    return null;
  });
  console.warn('[AUTOMATION] 예약 클릭:', scheduleClicked);
  await sleep(2000); // 날짜/시간 입력 UI 나타날 때까지 대기

  // 날짜: 달력 UI 직접 조작
  // 1. 날짜 input 클릭 → 달력 팝업 열기
  await evalInEditor(tabId, editorFrameId, () => {
    const inp = document.querySelector('input.input_date__QmA0s');
    if (inp) inp.click();
  });
  await sleep(600);

  // 2. 목표 년/월로 이동 (최대 24개월)
  const targetYear = parseInt(yyyy);
  const targetMonth = parseInt(mm);
  for (let i = 0; i < 24; i++) {
    const cur = await evalInEditor(tabId, editorFrameId, () => {
      const yearEl = document.querySelector('.ui-datepicker-year');
      const monthEl = document.querySelector('.ui-datepicker-month');
      if (!yearEl || !monthEl) return null;
      return { y: parseInt(yearEl.textContent), m: parseInt(monthEl.textContent) };
    });
    if (!cur) break;
    if (cur.y === targetYear && cur.m === targetMonth) break;
    const curTotal = cur.y * 12 + cur.m;
    const tTotal = targetYear * 12 + targetMonth;
    if (tTotal > curTotal) {
      await evalInEditor(tabId, editorFrameId, () => {
        const btn = document.querySelector('.ui-datepicker-next:not(.ui-state-disabled)');
        if (btn) btn.click();
      });
    } else {
      await evalInEditor(tabId, editorFrameId, () => {
        const btn = document.querySelector('.ui-datepicker-prev:not(.ui-state-disabled)');
        if (btn) btn.click();
      });
    }
    await sleep(400);
  }

  // 3. 목표 날짜 버튼 클릭
  const dayClicked = await evalInEditor(tabId, editorFrameId, (tDay) => {
    const cells = document.querySelectorAll('.ui-datepicker tbody td:not(.ui-state-disabled) button');
    for (const btn of cells) {
      if (btn.textContent.trim() === String(tDay)) { btn.click(); return true; }
    }
    return false;
  }, [parseInt(dd)]);
  console.warn('[AUTOMATION] 날짜 클릭:', dayClicked, `${yyyy}.${mm}.${dd}`);
  await sleep(300);

  // 시/분 select — title 속성으로 안정적으로 탐색 + native setter
  await evalInEditor(tabId, editorFrameId, (h, m) => {
    const hStr = String(h).padStart(2, '0');
    const mStr = String(m).padStart(2, '0');
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;

    // 시간 select: title="예약 발행 시간 선택"
    const hourSel = document.querySelector('select[title="예약 발행 시간 선택"]');
    if (hourSel) {
      nativeSetter.call(hourSel, hStr);
      hourSel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 분 select: title="예약 발행 분 선택"
    const minSel = document.querySelector('select[title="예약 발행 분 선택"]');
    if (minSel) {
      nativeSetter.call(minSel, mStr);
      minSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, [hourVal, minVal]);
  await sleep(1000);
}

// ════════════════════════════════════════════════════════════
//  메인 오케스트레이션
// ════════════════════════════════════════════════════════════
async function runEditorAutomation(tabId, jobPayload) {
  const { title, content, hashtags, imageUrls, publishOptions, business, aiGeneratedIndices = [] } = jobPayload;

  const editorReady = await waitForEditorReady(tabId);
  if (!editorReady) return { success: false, error: '에디터 로딩 타임아웃' };
  await sleep(1000);

  const eFid = await findEditorFrameId(tabId);
  console.warn('[AUTOMATION] editorFrameId:', eFid, '| title:', title?.substring(0, 20));

  // "작성 중인 글이 있습니다" 팝업 처리
  await evalInEditor(tabId, eFid, () => {
    const btn = document.querySelector(
      '.se-popup-alert-confirm .se-popup-button-cancel, [class*="popup"] button:first-child'
    );
    if (btn) btn.click();
  });
  await sleep(500);

  // 제목 입력
  const titleCoords = await getAbsoluteCoords(tabId, eFid, () => {
    for (const sel of [
      '.se-title-text .se-text-paragraph', '.se-title-text p',
      '.se-title-text', '.se-documentTitle .se-module-text',
    ]) {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width || r.height) return { x: r.left + Math.max(r.width / 4, 20), y: r.top + Math.max(r.height / 2, 8) };
      }
    }
    return null;
  });
  console.warn('[AUTOMATION] titleCoords:', titleCoords);
  if (!titleCoords) return { success: false, error: '제목 입력란을 찾을 수 없습니다.' };
  await clickAtCoords(tabId, titleCoords.x, titleCoords.y);
  await sleep(300);
  await typeViaDebugger(tabId, title);
  await sleep(500);
  await sendKey(tabId, 'Tab', 'Tab', 9);
  await sleep(500);

  // 본문 영역 포커스
  const bodyCoords = await getAbsoluteCoords(tabId, eFid, () => {
    for (const sel of [
      '.se-section:not(.se-section-documentTitle) .se-text-paragraph',
      '.se-component-holder .se-section:not(.se-section-documentTitle) .se-module-text p',
      '.se-main-container .se-module-text p:not(.se-documentTitle p)',
    ]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -100 || r.top < -100) continue;
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r2 = el.getBoundingClientRect();
      return { x: r2.left + Math.max(r2.width / 4, 20), y: r2.top + Math.max(r2.height / 2, 10) };
    }
    return null;
  });
  console.warn('[AUTOMATION] bodyCoords:', bodyCoords);
  if (bodyCoords) await clickAtCoords(tabId, bodyCoords.x, bodyCoords.y);
  await sleep(800);

  // 콘텐츠 블록 처리 (앞뒤 빈 줄 제거)
  const blocks = parseBlocks((content || '').replace(/^\n+/, ''));
  let footerInserted = false;

  for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
    const block = blocks[blockIdx];
    if (block.type === 'text') {
      // 포커스 복구 실패를 무시하고 계속 진행하면, 이후 모든 블록이 어디로
      // 타이핑되는지 모르는 상태로 조용히 실패만 반복하며 진행이 멈춘 것처럼
      // 보이게 된다 (사용자가 결국 수동 취소하게 됨). 한 번 더 재시도 후에도
      // 실패하면 여기서 바로 명확한 에러로 중단한다.
      let focused = await ensureBodyFocus(tabId, eFid);
      if (!focused) {
        if (bodyCoords) await clickAtCoords(tabId, bodyCoords.x, bodyCoords.y);
        await sleep(500);
        focused = await ensureBodyFocus(tabId, eFid);
      }
      if (!focused) {
        if (bodyCoords) {
          console.warn('[AUTOMATION] ensureBodyFocus 미확정 — bodyCoords 클릭 후 강제 진행');
          await clickAtCoords(tabId, bodyCoords.x, bodyCoords.y);
          await sleep(300);
        } else {
          throw new Error('본문 영역 포커스를 복구하지 못했습니다 (에디터 상태 이상 — 자동발행을 중단합니다)');
        }
      }
      await typeViaDebugger(tabId, block.content);
      await sleep(100);
      await sendKey(tabId, 'Return', 'Enter', 13);
      await sleep(100);
    } else if (block.type === 'image') {
      const imgUrl = imageUrls[block.id - 1];
      const imgLink = business?.image_links?.[block.id] || business?.image_links?.[`anchor${block.id}`] || null;
      const isAiImg = aiGeneratedIndices.includes(block.id - 1);
      if (imgUrl) await uploadImageInTab(tabId, imgUrl, imgLink, isAiImg);
      await sendKey(tabId, 'Return', 'Enter', 13); // 이미지 뒤 1칸
    } else if (block.type.startsWith('quote_')) {
      await insertQuoteInTab(tabId, eFid, block.type, block.content);
      await sendKey(tabId, 'Return', 'Enter', 13); // 인용구 뒤 1칸
      await sleep(150);
    } else if (block.type === 'map' || block.type === 'cta_banner') {
      // business 블록 위치 — 푸터 시스템 전체 삽입 (Puppeteer 동일 로직)
      if (!footerInserted) {
        if (business?.footer_components?.length > 0) {
          await insertFooterSystem(tabId, eFid, business.footer_components, imageUrls);
          footerInserted = true;
        } else if (block.type === 'map' && business?.map_address) {
          await insertMapInTab(tabId, eFid, business.map_address);
          footerInserted = true;
        }
      }
    }
    await sleep(400);
  }

  // 본문에 business 태그가 없으면 맨 끝에 푸터 삽입
  if (!footerInserted) {
    if (business?.footer_components?.length > 0) {
      await insertFooterSystem(tabId, eFid, business.footer_components, imageUrls);
    } else if (business?.map_address) {
      await sendKey(tabId, 'Return', 'Enter', 13);
      await sendKey(tabId, 'Return', 'Enter', 13);
      await insertMapInTab(tabId, eFid, business.map_address);
    }
    if (business?.footer_text) {
      await sendKey(tabId, 'Return', 'Enter', 13);
      await sendKey(tabId, 'Return', 'Enter', 13);
      await typeViaDebugger(tabId, business.footer_text);
    }
  }

  // 해시태그
  if (hashtags?.length > 0) {
    const TAG_SEL = [
      'input[placeholder*="태그"]',
      'input[placeholder*="tag"]',
      '.se-hashtag-container input',
      '.se-tag-input',
      '.se-editor-hashtag-area input',
      '[class*="hashtag"] input',
      '[class*="tag_input"] input',
      '[class*="tagInput"] input',
      '[data-testid*="hashtag"] input',
      '[data-testid*="tag"] input',
    ].join(', ');
    const tagFocused = await evalInEditor(tabId, eFid, (sel) => {
      // 먼저 에디터 하단으로 스크롤
      const container = document.querySelector('.se-main-container, .se-editor, body');
      if (container) container.scrollTop = container.scrollHeight;
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.click(); el.focus(); return true;
      }
      return false;
    }, [TAG_SEL]);
    const tagFocusedMain = !tagFocused && await evalInTab(tabId, (sel) => {
      const container = document.querySelector('.se-main-container, .se-editor, body');
      if (container) container.scrollTop = container.scrollHeight;
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.click(); el.focus(); return true;
      }
      return false;
    }, [TAG_SEL]);
    console.warn('[AUTOMATION] tagFocused:', tagFocused, '| tagFocusedMain:', tagFocusedMain);
    if (tagFocused || tagFocusedMain) {
      await sleep(300);
      for (const tag of hashtags) {
        const clean = tag.replace(/^#/, '').trim();
        if (!clean) continue;
        await typeViaDebugger(tabId, clean);
        await sendKey(tabId, 'Return', 'Enter', 13);
        await sleep(200);
      }
    }
  }

  // ── 발행 전 사이드바 닫기
  await closeSidebars(tabId, eFid);
  await sleep(500);

  // ── 1차 발행 버튼 (패널 열기)
  await sleep(1000);
  let publishClicked = await evalInEditor(tabId, eFid, () => {
    const selectors = [
      'button.publish_btn', 'button[data-name="publish"]',
      '.se-publish-button', 'button.se-btn-publish',
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetWidth > 0) { btn.click(); return sel; }
    }
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === '발행' && b.offsetWidth > 0);
    if (btn) { btn.click(); return 'text:발행'; }
    return null;
  });
  if (!publishClicked) {
    publishClicked = await evalInTab(tabId, () => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.trim() === '발행' && b.offsetWidth > 0);
      if (btn) { btn.click(); return 'main:발행'; }
      return null;
    });
  }
  console.warn('[AUTOMATION] publishClicked:', publishClicked);
  if (!publishClicked) return { success: false, error: '발행 버튼을 찾을 수 없습니다.' };
  await sleep(5000);

  // ── 예약 발행 날짜/시간 설정
  const scheduledAt = publishOptions?.scheduled_at;
  const isScheduled = scheduledAt && scheduledAt !== 'null';
  if (isScheduled) {
    await applyScheduledAt(tabId, eFid, scheduledAt);
  }

  // ── 발행 설정 패널 적용
  await applyPublishSettings(tabId, eFid, publishOptions);
  await sleep(500);

  // ── 최종 발행/예약 버튼 CDP 클릭
  function findPublishConfirmBtn() {
    const byTestId = document.querySelector('[data-testid="seOnePublishBtn"]');
    if (byTestId && byTestId.offsetWidth > 0) {
      const r = byTestId.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const byClickArea = document.querySelector('[data-click-area*="publish"][data-testid]');
    if (byClickArea && byClickArea.offsetWidth > 0) {
      const r = byClickArea.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const byConfirmCls = document.querySelector('button[class*="confirm_btn"]');
    if (byConfirmCls && byConfirmCls.offsetWidth > 0) {
      const r = byConfirmCls.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const allVisible = Array.from(document.querySelectorAll('button'))
      .filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
    const keyword = isScheduled ? '예약' : '발행';
    const panelBtns = allVisible
      .filter(b => b.textContent.includes(keyword) && b.getBoundingClientRect().top > 50);
    if (panelBtns.length >= 1) {
      const rightmost = panelBtns.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
      const r = rightmost.getBoundingClientRect();
      console.warn('[FINAL-BTN]', keyword, 'rightmost:', { x: Math.round(r.left), y: Math.round(r.top), text: rightmost.textContent.trim().substring(0, 20) });
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }

  let finalBtnCoords = await getAbsoluteCoords(tabId, eFid, findPublishConfirmBtn);
  if (!finalBtnCoords) finalBtnCoords = await evalInTab(tabId, findPublishConfirmBtn);
  console.warn('[AUTOMATION] finalBtnCoords:', finalBtnCoords);
  if (!finalBtnCoords) return { success: false, error: '최종 발행 버튼을 찾을 수 없습니다.' };
  await clickAtCoords(tabId, finalBtnCoords.x, finalBtnCoords.y);

  // URL 변경 폴링 (최대 15초) — 글쓰기 화면을 벗어났는지만 우선 확인
  let finalUrl = '';
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    finalUrl = await evalInTab(tabId, () => window.location.href).catch(() => '');
    if (finalUrl && !finalUrl.includes('Redirect=Write') && !finalUrl.includes('PostWriteForm')) break;
  }
  console.warn('[AUTOMATION] finalUrl (write 화면 이탈):', finalUrl);

  const isSuccess = finalUrl &&
    !finalUrl.includes('Redirect=Write') &&
    !finalUrl.includes('write.blog.naver.com') &&
    !finalUrl.includes('PostWriteForm');

  // 글쓰기 화면은 벗어났지만 네이버가 게시글 고유 주소(블로그ID/글번호)가 아니라 블로그
  // 홈(블로그ID)에 먼저 도착시키는 경우가 있다. 발행 성공 여부 판정은 그대로 두고(이미
  // 위에서 끝났으므로 실패로 뒤집지 않음), "블로그 보기" 링크가 특정 글이 아니라 블로그
  // 홈으로 가버리지 않도록 URL만 몇 초 더 지켜보며 글 번호가 포함된 주소로 갱신되면 그걸 쓴다.
  const hasLogNo = (url) => /\/[a-zA-Z0-9_-]+\/\d{6,}(?:[/?#]|$)/.test(url) || /[?&]logNo=\d{6,}/.test(url);
  if (isSuccess && !hasLogNo(finalUrl)) {
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      const url = await evalInTab(tabId, () => window.location.href).catch(() => '');
      if (hasLogNo(url)) { finalUrl = url; break; }
    }
    console.warn('[AUTOMATION] finalUrl (게시글 고유 URL 재확인):', finalUrl);
  }

  return {
    success: !!isSuccess,
    url: isSuccess ? finalUrl : null,
    error: isSuccess ? null : `발행 완료를 확인하지 못했습니다. URL: ${finalUrl}`,
  };
}
