// ============================================================================
// SAP Copilot Auto-Sync Extension - Background Service Worker (v1.2.1 - Turbo)
// - Ultra-low latency Direct Extension Bridge for Cloudflare Pages & Web UI
// - In-memory cookie caching (0ms overhead on proxy requests)
// ============================================================================

const SAP_DOMAINS = [
  "prd-sap.sms.britishcouncil.org",
  "sms.britishcouncil.org",
  "britishcouncil.org"
];
const LOCAL_ENDPOINT = "http://localhost:8787/api/sync-cookies";
const DNR_RULE_ID = 8888;

let lastSyncTime = null;
let lastSyncedHash = "";

// In-memory cookie cache for instant zero-overhead responses
let cachedCookies = {
  cookie: "",
  hasSession: false,
  cookieCount: 0,
  syncedAt: null
};
let isCookieRefreshing = false;
let lastInjectedCookie = "";
let lastDnrCookie = "";
let lastDnrReferer = "";

/**
 * Gathers and deduplicates all cookies from the British Council SAP domains.
 */
async function refreshCachedCookies() {
  if (isCookieRefreshing) return cachedCookies;
  isCookieRefreshing = true;
  try {
    let allCookies = [];
    for (const domain of SAP_DOMAINS) {
      try {
        const cList = await chrome.cookies.getAll({ domain });
        if (Array.isArray(cList)) {
          allCookies.push(...cList);
        }
      } catch (e) {}
    }

    const cookieMap = new Map();
    allCookies.forEach((c) => {
      if (!cookieMap.has(c.name)) {
        cookieMap.set(c.name, c.value);
      }
    });

    let hasSession = false;
    for (const [name] of cookieMap) {
      if (name.includes("SAP_SESSIONID")) {
        hasSession = true;
        break;
      }
    }

    const cookieString = Array.from(cookieMap.entries())
      .map(([name, val]) => `${name}=${val}`)
      .join("; ");

    cachedCookies = {
      cookie: cookieString,
      hasSession,
      cookieCount: cookieMap.size,
      syncedAt: new Date().toISOString()
    };
    return cachedCookies;
  } catch (err) {
    console.warn("[SAP Extension] Error reading cookies:", err);
    return cachedCookies;
  } finally {
    isCookieRefreshing = false;
  }
}

/**
 * Injects a cookie string into Chrome's cookie store (in parallel for high speed).
 */
async function injectCookiesIntoStore(cookieString, domain = "prd-sap.sms.britishcouncil.org") {
  if (!cookieString || typeof cookieString !== "string" || cookieString === lastInjectedCookie) return;
  lastInjectedCookie = cookieString;
  const pairs = cookieString.split(";");
  const promises = [];
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (name && value) {
        promises.push(
          chrome.cookies.set({
            url: "https://" + domain,
            name,
            value,
            domain: domain,
            path: "/"
          }).catch(() => {})
        );
      }
    }
  }
  await Promise.all(promises);
}

/**
 * Turbo proxy handler for SAP Web Dynpro requests from Cloudflare Pages.
 * Optimized for maximum speed: zero sequential IPC calls, parallel processing.
 */
async function handleSapProxy(payload) {
  if (!payload || !payload.url) {
    return { ok: false, status: 400, error: "Missing payload URL", body: "" };
  }

  const targetUrl = payload.url;
  const method = (payload.method || "GET").toUpperCase();
  const postBody = payload.body || "";
  const referer = payload.referer || "https://prd-sap.sms.britishcouncil.org/sap/bc/webdynpro/sap/z_her_wa_student?WDCONFIGURATIONID=Z_HER_AC_STUDENT";
  let cookie = payload.cookie || "";

  // 1. Fast cookie resolution from cache
  if (!cookie) {
    if (!cachedCookies.cookie) {
      await refreshCachedCookies();
    }
    cookie = cachedCookies.cookie;
  } else if (cookie !== lastInjectedCookie) {
    // Only inject if cookie actually changed (parallelized)
    injectCookiesIntoStore(cookie).catch(() => {});
  }

  // 2. Fast DNR rule check: only update dynamic rules if headers actually changed
  if (cookie !== lastDnrCookie || referer !== lastDnrReferer) {
    lastDnrCookie = cookie;
    lastDnrReferer = referer;
    try {
      if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateDynamicRules) {
        const reqHeaders = [
          { header: "Referer", operation: "set", value: referer },
          { header: "Accept-Language", operation: "set", value: "en-GB,en;q=0.9,en-US;q=0.8" },
          { header: "X-Requested-With", operation: "set", value: "XMLHttpRequest" },
          { header: "X-XHR-Logon", operation: "set", value: "accept" }
        ];
        if (cookie) {
          reqHeaders.push({ header: "Cookie", operation: "set", value: cookie });
        }

        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [DNR_RULE_ID],
          addRules: [{
            id: DNR_RULE_ID,
            priority: 999,
            action: {
              type: "modifyHeaders",
              requestHeaders: reqHeaders
            },
            condition: {
              urlFilter: "||prd-sap.sms.britishcouncil.org",
              resourceTypes: ["xmlhttprequest"]
            }
          }]
        }).catch(() => {});
      }
    } catch (ruleErr) {}
  }

  const fetchHeaders = {
    "Accept": "*/*",
    "Accept-Language": "en-GB,en;q=0.9,en-US;q=0.8",
    "X-Requested-With": "XMLHttpRequest",
    "X-XHR-Logon": "accept"
  };
  if (method === "POST") {
    fetchHeaders["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const resp = await fetch(targetUrl, {
      method,
      headers: fetchHeaders,
      body: method === "POST" ? postBody : undefined,
      credentials: "include",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const bodyText = await resp.text();
    const sessionState = resp.headers.get("sap-session-state") || "";

    // Instantly return without blocking on chrome.cookies.getAll
    return {
      ok: resp.ok,
      status: resp.status,
      finalUrl: resp.url,
      setCookie: cachedCookies.cookie || cookie,
      sessionState: sessionState,
      body: bodyText
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: "SAP Network Request Failed: " + (err.name === "AbortError" ? "Request timed out after 60s" : err.message),
      body: ""
    };
  }
}

/**
 * Pushes active cookies to the local server if running (for localhost:8787 dev mode).
 */
async function syncCookiesToLocalAssistant() {
  try {
    if (!cachedCookies.cookie) {
      await refreshCachedCookies();
    }
    const active = cachedCookies;
    if (!active.cookie || active.cookie === lastSyncedHash) {
      return;
    }

    const payload = {
      cookie: active.cookie,
      hasSessionId: active.hasSession,
      cookieCount: active.cookieCount,
      syncedAt: active.syncedAt
    };

    const resp = await fetch(LOCAL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (resp.ok) {
      lastSyncTime = new Date();
      lastSyncedHash = active.cookie;
      chrome.storage.local.set({
        lastSync: lastSyncTime.toISOString(),
        hasSession: active.hasSession,
        status: "connected"
      });
    }
  } catch (err) {
    chrome.storage.local.set({ status: "offline" });
  }
}

// 1. Listen for real-time cookie updates on SAP domains
chrome.cookies.onChanged.addListener((changeInfo) => {
  const d = changeInfo.cookie.domain || "";
  if (SAP_DOMAINS.some((dom) => d.includes(dom))) {
    refreshCachedCookies().then(() => {
      syncCookiesToLocalAssistant();
    });
  }
});

// 2. Periodic heartbeat sync every 60 seconds
chrome.alarms.create("sapCookieSyncAlarm", { periodInMinutes: 1.0 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "sapCookieSyncAlarm") {
    refreshCachedCookies().then(() => {
      syncCookiesToLocalAssistant();
    });
  }
});

// 3. Message handlers for Bridge and Popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return false;

  if (msg.action === "forceSync") {
    refreshCachedCookies().then(() => syncCookiesToLocalAssistant()).then(() => {
      sendResponse({ ok: true, syncedAt: lastSyncTime ? lastSyncTime.toISOString() : null });
    });
    return true;
  }

  if (msg.action === "GET_ACTIVE_COOKIES") {
    if (cachedCookies.cookie) {
      sendResponse(cachedCookies);
      // Refresh in background
      refreshCachedCookies();
    } else {
      refreshCachedCookies().then((res) => {
        sendResponse(res);
      }).catch((err) => {
        sendResponse({ error: err.message });
      });
    }
    return true;
  }

  if (msg.action === "SAP_PROXY") {
    handleSapProxy(msg.payload).then((res) => {
      sendResponse(res);
    }).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  return false;
});

// Initial warm-up
refreshCachedCookies();
