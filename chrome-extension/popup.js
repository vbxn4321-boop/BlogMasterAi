const $ = (id) => document.getElementById(id);

async function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

async function setStorage(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

function showMsg(el, text, type = 'error') {
  el.innerHTML = `<div class="msg ${type}">${text}</div>`;
}

async function render() {
  const { apiUrl, accessToken, userEmail, pendingJobs, activeJobId } = await getStorage([
    'apiUrl', 'accessToken', 'userEmail', 'pendingJobs', 'activeJobId'
  ]);

  const connected = !!(apiUrl && accessToken && userEmail);

  $('setupSection').style.display = connected ? 'none' : 'block';
  $('connectedSection').style.display = connected ? 'block' : 'none';
  $('toggleSettingsBtn').style.display = connected ? 'block' : 'none';
  $('toggleLogBtn').style.display = connected ? 'block' : 'none';

  if (!connected) {
    $('statusDot').className = 'dot';
    $('statusText').textContent = '연결 안 됨';
    return;
  }

  // Connected state
  $('userInfo').textContent = userEmail || '알 수 없음';

  const jobs = pendingJobs || [];
  const isRunning = !!activeJobId;

  if (isRunning) {
    $('statusDot').className = 'dot working';
    $('statusText').textContent = '발행 처리 중...';
    $('runningBadge').style.display = 'inline-block';
  } else {
    $('statusDot').className = 'dot connected';
    $('statusText').textContent = `연결됨 — 폴링 중 (${jobs.length}건 대기)`;
    $('runningBadge').style.display = 'none';
  }

  if (jobs.length === 0) {
    $('queueList').innerHTML = '<div class="empty-msg">대기 중인 발행 작업이 없습니다</div>';
  } else {
    $('queueList').innerHTML = jobs.map(job => {
      const isActive = job.id === activeJobId;
      const title = job.content_json?.title || job.topic || '(제목 없음)';
      // naver_id가 "gktla2@naver.com"처럼 이메일 형식으로 저장된 경우 "@" 뒤 도메인은 숨긴다
      const account = job.naver_accounts?.naver_id?.trim().split('@')[0] || '?';
      const time = new Date(job.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      return `<div class="queue-item ${isActive ? 'active' : ''}">
        <div class="title">${escHtml(title)}</div>
        <div class="meta">${escHtml(account)} · ${time}${isActive ? ' · <strong style="color:#a78bfa">처리 중</strong>' : ''}</div>
      </div>`;
    }).join('');
  }

  if ($('apiUrlEdit')) $('apiUrlEdit').value = apiUrl || '';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function normalizeUrl(url) {
  url = url.trim().replace(/\/$/, '');
  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url;
}

const FIXED_API_URL = 'https://resplendent-endurance-production-ee32.up.railway.app';

// Connect
$('connectBtn').addEventListener('click', async () => {
  const apiUrl = FIXED_API_URL;
  const rawToken = $('accessToken').value.trim();
  const msgEl = $('connectMsg');

  if (!rawToken) {
    showMsg(msgEl, '액세스 토큰을 입력해주세요.'); return;
  }

  // 설정 페이지에서 발급받은 확장프로그램 전용 토큰을 그대로 사용한다 — 예전엔 웹 세션을
  // base64 JSON으로 감싼 걸 풀어서 access_token/refresh_token을 따로 뽑아냈지만, 이제는
  // 만료되지 않는 단일 토큰이라 그럴 필요가 없다.
  const accessToken = rawToken;

  showMsg(msgEl, '연결 확인 중...', 'success');
  try {
    const res = await fetch(`${apiUrl}/api/extension/verify`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) { showMsg(msgEl, `인증 실패 (${res.status})`); return; }
    const data = await res.json();

    await setStorage({ apiUrl, accessToken, userEmail: data.email });
    chrome.runtime.sendMessage({ type: 'START_POLLING' });
    showMsg(msgEl, '연결 성공!', 'success');
    setTimeout(render, 500);
  } catch (e) {
    showMsg(msgEl, `연결 오류: ${e.message}`);
  }
});

// Disconnect
$('disconnectBtn').addEventListener('click', async () => {
  await setStorage({ apiUrl: null, accessToken: null, userEmail: null, pendingJobs: [], activeJobId: null });
  chrome.runtime.sendMessage({ type: 'STOP_POLLING' });
  render();
});

// Toggle settings
$('toggleSettingsBtn').addEventListener('click', () => {
  const s = $('settingsSection');
  s.style.display = s.style.display === 'none' ? 'block' : 'none';
});

// ── 로그 뷰어 ────────────────────────────────────────────────
let logAutoRefresh = true;
let logLastTs = 0;
let logAutoTimer = null;

function fmtTs(ts) {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function fetchLogs(reset = false) {
  const { apiUrl, accessToken } = await getStorage(['apiUrl', 'accessToken']);
  if (!apiUrl || !accessToken) return;
  if (reset) logLastTs = 0;
  try {
    const res = await fetch(`${apiUrl}/api/extension/logs?since=${logLastTs}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) return;
    const { logs } = await res.json();
    if (!logs?.length) return;

    const box = $('logBox');
    const wasAtBottom = box.scrollHeight - box.scrollTop <= box.clientHeight + 10;

    if (reset) box.innerHTML = '';
    if (box.querySelector('[data-empty]')) box.innerHTML = '';

    logs.forEach(e => {
      logLastTs = Math.max(logLastTs, e.ts);
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.innerHTML = `<span class="log-ts">${fmtTs(e.ts)}</span><span class="log-${e.level}">${escHtml(e.msg)}</span>`;
      box.appendChild(div);
    });

    if (wasAtBottom || reset) box.scrollTop = box.scrollHeight;
  } catch (_) {}
}

$('toggleLogBtn').addEventListener('click', () => {
  const s = $('logSection');
  const isOpen = s.style.display !== 'none';
  s.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) fetchLogs(true);
});

$('refreshLogBtn').addEventListener('click', () => fetchLogs(true));
$('clearLogViewBtn').addEventListener('click', () => {
  logLastTs = 0;
  $('logBox').innerHTML = '<span data-empty style="color:#3d3d50">로그가 없습니다</span>';
});
$('autoRefreshBtn').addEventListener('click', () => {
  logAutoRefresh = !logAutoRefresh;
  $('autoRefreshBtn').textContent = `자동갱신 ${logAutoRefresh ? 'ON' : 'OFF'}`;
  $('autoRefreshBtn').className = logAutoRefresh ? 'btn-log active' : 'btn-log';
});

setInterval(() => {
  if (logAutoRefresh && $('logSection').style.display !== 'none') fetchLogs();
}, 3000);


// 팝업이 열려있는 동안 5초마다 폴링 트리거 (서비스 워커 유지)
function triggerPoll() {
  chrome.runtime.sendMessage({ type: 'POLL_NOW' }).catch(() => {});
}
triggerPoll(); // 즉시 1회
setInterval(triggerPoll, 5000); // 5초마다

// 세션 만료 알림 수신 → 팝업 즉시 갱신
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SESSION_EXPIRED') render();
});

// Auto-refresh while popup is open
render();
setInterval(render, 3000);
