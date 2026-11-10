// ============================================================================
// SAP Copilot Extension - Hub Bridge (Content Script)
// Connects SAP Hub (Cloudflare Pages or Localhost) to Chrome Extension Background
// Allows direct, serverless SAP calls with active browser cookies!
// ============================================================================

(function () {
  const BRIDGE_VERSION = "1.2.0";

  // Mark the document so the web page knows the extension bridge is installed
  try {
    document.documentElement.setAttribute("data-sap-hub-bridge", BRIDGE_VERSION);
  } catch (e) {}

  // Broadcast readiness event
  try {
    window.postMessage({
      source: "SAP_BRIDGE",
      type: "ANNOUNCE",
      version: BRIDGE_VERSION
    }, "*");
  } catch (e) {}

  // Handle messages dispatched by the web application (app.js / sap-service.js)
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "SAP_HUB_CLIENT") {
      return;
    }

    const { type, requestId, payload } = event.data;

    // 1. Ping / Handshake
    if (type === "PING") {
      window.postMessage({
        source: "SAP_BRIDGE",
        type: "PONG",
        requestId,
        version: BRIDGE_VERSION,
        ok: true
      }, "*");
      return;
    }

    // 2. Direct Cookie Fetching
    if (type === "GET_ACTIVE_COOKIES") {
      try {
        chrome.runtime.sendMessage({ action: "GET_ACTIVE_COOKIES" }, (res) => {
          const lastErr = chrome.runtime.lastError;
          window.postMessage({
            source: "SAP_BRIDGE",
            type: "GET_ACTIVE_COOKIES_RESP",
            requestId,
            ok: !lastErr && res && !res.error,
            cookie: res ? res.cookie : "",
            hasSessionId: res ? res.hasSession : false,
            cookieCount: res ? res.cookieCount : 0,
            updatedAt: res ? res.syncedAt : null,
            error: lastErr ? lastErr.message : (res && res.error)
          }, "*");
        });
      } catch (err) {
        window.postMessage({
          source: "SAP_BRIDGE",
          type: "GET_ACTIVE_COOKIES_RESP",
          requestId,
          ok: false,
          error: err.message
        }, "*");
      }
      return;
    }

    // 3. Direct SAP Web Dynpro Proxy
    if (type === "SAP_PROXY") {
      try {
        chrome.runtime.sendMessage({ action: "SAP_PROXY", payload }, (res) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) {
            window.postMessage({
              source: "SAP_BRIDGE",
              type: "SAP_PROXY_RESP",
              requestId,
              error: lastErr.message
            }, "*");
          } else {
            window.postMessage({
              source: "SAP_BRIDGE",
              type: "SAP_PROXY_RESP",
              requestId,
              response: res
            }, "*");
          }
        });
      } catch (err) {
        window.postMessage({
          source: "SAP_BRIDGE",
          type: "SAP_PROXY_RESP",
          requestId,
          error: err.message
        }, "*");
      }
    }
  });

  console.log(`[SAP Copilot Bridge] Active v${BRIDGE_VERSION} on ${window.location.origin}`);
})();

