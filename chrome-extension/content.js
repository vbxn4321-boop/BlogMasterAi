// 페이지 ↔ 익스텐션 브릿지 (content script)
// 웹페이지가 window.postMessage로 device_id를 요청하면 background로 중계

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.type === 'BLOGMASTER_GET_DEVICE_ID') {
    try {
      chrome.runtime.sendMessage({ type: 'GET_DEVICE_ID' }, (response) => {
        if (chrome.runtime.lastError) return;
        window.postMessage({ type: 'BLOGMASTER_DEVICE_ID_RESPONSE', deviceId: response?.deviceId || null }, '*');
      });
    } catch (e) {
      // context invalidated — 무시
    }
  }

  if (event.data?.type === 'BLOGMASTER_CHECK_CONNECTION') {
    try {
      chrome.runtime.sendMessage({ type: 'CHECK_CONNECTION' }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({ type: 'BLOGMASTER_CONNECTION_STATUS', connected: false }, '*');
          return;
        }
        window.postMessage({ type: 'BLOGMASTER_CONNECTION_STATUS', connected: response?.connected || false }, '*');
      });
    } catch (e) {
      window.postMessage({ type: 'BLOGMASTER_CONNECTION_STATUS', connected: false, contextInvalidated: true }, '*');
    }
  }

  if (event.data?.type === 'BLOGMASTER_CHECK_NAVER_LOGIN') {
    try {
      chrome.runtime.sendMessage({ type: 'CHECK_NAVER_LOGIN' }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({ type: 'BLOGMASTER_NAVER_LOGIN_STATUS', loggedIn: false, noExtension: true }, '*');
          return;
        }
        window.postMessage({ type: 'BLOGMASTER_NAVER_LOGIN_STATUS', loggedIn: response?.loggedIn || false }, '*');
      });
    } catch (e) {
      // Extension context invalidated — 페이지 새로고침 필요
      window.postMessage({ type: 'BLOGMASTER_NAVER_LOGIN_STATUS', loggedIn: false, contextInvalidated: true }, '*');
    }
  }

  if (event.data?.type === 'BLOGMASTER_POLL_NOW') {
    try {
      chrome.runtime.sendMessage({ type: 'POLL_NOW' }, () => {
        if (chrome.runtime.lastError) {
          // Context invalidated
        }
      });
    } catch (e) {}
  }
});

// ────────────────────────────────────────────────────────────
// 샤오홍슈 스크래핑 (background.js가 xhs job을 위해 새로 연 탭에서 호출)
// ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SCRAPE_XHS') {
    scrapeXiaohongshu(msg.apiUrl, msg.accessToken, msg.jobId)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // 비동기 응답
  }
});

function waitForXhsContent(timeoutMs = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const hasVideo = !!document.querySelector('video');
      const hasImages = document.querySelectorAll('img').length > 5;
      if (hasVideo || hasImages || Date.now() - start > timeoutMs) resolve();
      else setTimeout(check, 500);
    };
    check();
  });
}

function extractXhsCaptionText() {
  // 샤오홍슈 게시물 본문 셀렉터 — 사이트 마크업 변경 시 갱신 필요
  const selectors = ['#detail-desc', '.note-content', '.desc'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }
  const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content');
  return metaDesc?.trim() || document.title || '';
}

async function scrapeXiaohongshu() {
  await waitForXhsContent();

  const video = document.querySelector('video');
  const videoSrc = video?.currentSrc || video?.src || null;

  const images = videoSrc ? [] : Array.from(document.querySelectorAll('img'))
    .map((img) => img.src)
    .filter((src) => src && /^https?:/.test(src) && (document.querySelector(`img[src="${src}"]`)?.naturalWidth || 0) > 200)
    .slice(0, 12);

  if (!videoSrc && images.length === 0) {
    throw new Error('영상/이미지를 찾지 못했습니다. 페이지가 완전히 로드된 뒤 다시 시도해주세요.');
  }

  const captionText = extractXhsCaptionText();

  return { success: true, videoSrc, images, captionText };
}

