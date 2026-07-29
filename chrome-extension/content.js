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
});
