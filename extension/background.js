// ============================================================================
// SAP Copilot Auto-Sync Extension - Background Service Worker (v1.2.0)
// - Intercepts & syncs live SAP session cookies to localhost:8787 (if running)
// - Provides Direct Extension Bridge for Cloudflare Pages & Web UI (Zero Server!)
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

/**
 * Gathers and deduplicates all cookies from the British Council SAP domains.
 */
async function getActiveSapCookies() {
  try {
    let allCookies = [];
    for (const domain of SAP_DOMAINS) {
      const cList = await chrome.cookies.getAll({ domain });
      if (Array.isArray(cList)) {
        allCookies.push(...cList);
      }
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

    return {
      cookie: cookieString,
      hasSession,
      cookieCount: cookieMap.size,
      syncedAt: new Date().toISOString()
    };
  } catch (err) {
    console.warn("[SAP Extension] Error reading cookies:", err);
    return {
      cookie: "",
      hasSession: false,
      cookieCount: 0,
      syncedAt: null,
      error: err.message
    };
  }
}

/**
 * Injects a cookie string into Chrome's cookie store for SAP domain.
 */
async function injectCookiesIntoStore(cookieString, domain = "prd-sap.sms.britishcouncil.org") {
  if (!cookieString || typeof cookieString !== "string") return;
  const pairs = cookieString.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx > 0) {
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (name && value) {
        try {
          await chrome.cookies.set({
            url: "https://" + domain,
            name,
            value,
            domain: domain,
            path: "/"
          });
        } catch (e) {}
      }
    }
  }
}

/**
 * Direct proxy handler for SAP Web Dynpro requests from Cloudflare Pages / Web Client.
 * Runs inside the browser context that has direct access to British Council network.
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

  // If no explicit cookie passed, fetch active cookies from Chrome store
  if (!cookie) {
    const active = await getActiveSapCookies();
    cookie = active.cookie;
  } else {
    // If explicit cookie passed, update the cookie store
    await injectCookiesIntoStore(cookie);
  }

  // Set dynamic declarative rule to preserve exact Referer and Cookie headers
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

      await chrome.declarativeNetRequest.updateDynamicRules({
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
      });
    }
  } catch (ruleErr) {
    console.warn("[SAP Proxy] DNR rule warning:", ruleErr);
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
    const timeoutId = setTimeout(() => controller.abort(), 65000);

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

    // Read back fresh cookies after SAP responded
    const fresh = await getActiveSapCookies();

    return {
      ok: resp.ok,
      status: resp.status,
      finalUrl: resp.url,
      setCookie: fresh.cookie,
      sessionState: sessionState,
      body: bodyText
    };
  } catch (err) {
    console.error("[SAP Proxy] Fetch failed:", err);
    return {
      ok: false,
      status: 0,
      error: "SAP Network Request Failed: " + (err.name === "AbortError" ? "Request timed out after 65s" : err.message),
      body: ""
    };
  }
}

/**
 * Pushes active cookies to the local server if running (for localhost:8787 dev mode).
 */
async function syncCookiesToLocalAssistant() {
  try {
    const active = await getActiveSapCookies();
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
      console.log("[SAP Copilot Sync] Cookies pushed to local server at", lastSyncTime.toLocaleTimeString());
    }
  } catch (err) {
    chrome.storage.local.set({ status: "offline", error: err.message });
  }
}

// 1. Listen for real-time cookie updates on SAP domains
chrome.cookies.onChanged.addListener((changeInfo) => {
  const d = changeInfo.cookie.domain || "";
  if (SAP_DOMAINS.some((dom) => d.includes(dom))) {
    syncCookiesToLocalAssistant();
  }
});

// 2. Periodic heartbeat sync every 45 seconds
chrome.alarms.create("sapCookieSyncAlarm", { periodInMinutes: 0.75 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "sapCookieSyncAlarm") {
    syncCookiesToLocalAssistant();
  }
});

// 3. Message handlers for Bridge and Popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return false;

  if (msg.action === "forceSync") {
    syncCookiesToLocalAssistant().then(() => {
      sendResponse({ ok: true, syncedAt: lastSyncTime ? lastSyncTime.toISOString() : null });
    });
    return true;
  }

  if (msg.action === "GET_ACTIVE_COOKIES") {
    getActiveSapCookies().then((res) => {
      sendResponse(res);
    }).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // Keep message channel open for async response
  }

  if (msg.action === "SAP_PROXY") {
    handleSapProxy(msg.payload).then((res) => {
      sendResponse(res);
    }).catch((err) => {
      sendResponse({ ok: false, error: err.message });
    });
    return true; // Keep message channel open for async response
  }

  return false;
});

// Initial run
syncCookiesToLocalAssistant();
