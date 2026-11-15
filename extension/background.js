// ============================================================================
// SAP Copilot Auto-Sync Extension - Background Service Worker (v1.2.2)
// - Isolated Direct Extension Bridge (NEVER touches open SAP browser tabs!)
// - Strict tabIds:[-1] + excludedInitiatorDomains DNR scoping & cleanup
// - Zero global cookie-jar mutation during SAP_PROXY requests
// ============================================================================

const SAP_TARGET_URL = "https://prd-sap.sms.britishcouncil.org/sap/bc/webdynpro/sap/z_her_wa_student";
const SAP_DOMAINS = [
  "prd-sap.sms.britishcouncil.org",
  "sms.britishcouncil.org",
  "britishcouncil.org"
];
const LOCAL_ENDPOINT = "http://localhost:8787/api/sync-cookies";
const DNR_RULE_BASE_ID = 8888;
const DNR_RULE_MAX_SLOTS = 50;

let lastSyncTime = null;
let lastSyncedHash = "";
let nextRuleSlot = 0;

// In-memory cookie cache for instant zero-overhead responses
let cachedCookies = {
  cookie: "",
  hasSession: false,
  cookieCount: 0,
  syncedAt: null
};
let isCookieRefreshing = false;

/**
 * Removes any leftover DNR rules created by this extension so open SAP tabs are never affected.
 */
async function cleanupAllProxyDnrRules() {
  try {
    if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.getDynamicRules) return;
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const idsToRemove = existing
      .map((r) => r.id)
      .filter((id) => id >= DNR_RULE_BASE_ID && id < DNR_RULE_BASE_ID + DNR_RULE_MAX_SLOTS + 10);
    if (idsToRemove.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: idsToRemove });
    }
  } catch (e) {}
}

/**
 * Safely writes to chrome.storage.local without throwing if unavailable.
 */
function safeStorageSet(obj) {
  try {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(obj);
    }
  } catch (e) {}
}

/**
 * Gathers and deduplicates cookies sent to prd-sap.sms.britishcouncil.org.
 * Prioritizes host-only / exact-host SAP cookies over broader domain cookies.
 */
async function refreshCachedCookies() {
  if (isCookieRefreshing) return cachedCookies;
  isCookieRefreshing = true;
  try {
    let allCookies = [];
    try {
      const exactList = await chrome.cookies.getAll({ url: SAP_TARGET_URL });
      if (Array.isArray(exactList)) {
        allCookies.push(...exactList);
      }
    } catch (e) {}

    // Fallback/supplement from SAP_DOMAINS only for names not already collected
    for (const domain of SAP_DOMAINS) {
      try {
        const cList = await chrome.cookies.getAll({ domain });
        if (Array.isArray(cList)) {
          allCookies.push(...cList);
        }
      } catch (e) {}
    }

    // Prefer host-only & exact prd-sap host cookies over broader .britishcouncil.org duplicates
    allCookies.sort((a, b) => {
      const score = (c) => {
        let s = 0;
        if (c.hostOnly) s += 4;
        if (c.domain === "prd-sap.sms.britishcouncil.org") s += 2;
        if (c.path && c.path.startsWith("/sap")) s += 1;
        return s;
      };
      return score(b) - score(a);
    });

    const cookieMap = new Map();
    allCookies.forEach((c) => {
      // Skip unrelated marketing/consent cookies from root britishcouncil.org when collecting SAP auth
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
 * Installs a strictly scoped, temporary DNR rule for a single background service worker fetch().
 * Scoped with tabIds: [-1] and excludedInitiatorDomains: ["britishcouncil.org"] so open SAP tabs
 * are NEVER touched. Also strips Set-Cookie on the proxy response so it never overwrites tab cookies.
 */
async function installScopedDnrRule(ruleId, reqHeaders) {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) return;
  const condition = {
    urlFilter: "||prd-sap.sms.britishcouncil.org",
    tabIds: [-1],
    excludedInitiatorDomains: ["britishcouncil.org"],
    resourceTypes: ["xmlhttprequest", "other"]
  };

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ruleId],
      addRules: [{
        id: ruleId,
        priority: 999,
        action: {
          type: "modifyHeaders",
          requestHeaders: reqHeaders,
          responseHeaders: [{ header: "set-cookie", operation: "remove" }]
        },
        condition
      }]
    });
  } catch (err) {
    // Fallback if browser version rejects responseHeaders modification on set-cookie
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [ruleId],
      addRules: [{
        id: ruleId,
        priority: 999,
        action: {
          type: "modifyHeaders",
          requestHeaders: reqHeaders
        },
        condition
      }]
    }).catch(() => {});
  }
}

async function removeScopedDnrRule(ruleId) {
  try {
    if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.updateDynamicRules) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [ruleId] });
    }
  } catch (e) {}
}

/**
 * Isolated proxy handler for SAP Web Dynpro requests from SAP Hub.
 * Never mutates Chrome's global cookie store and never modifies headers of open browser tabs.
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

  // 1. Resolve cookie from in-memory cache if caller didn't supply one (never write back to Chrome store!)
  if (!cookie) {
    if (!cachedCookies.cookie) {
      await refreshCachedCookies();
    }
    cookie = cachedCookies.cookie;
  }

  const reqHeaders = [
    { header: "Referer", operation: "set", value: referer },
    { header: "Accept-Language", operation: "set", value: "en-GB,en;q=0.9,en-US;q=0.8" },
    { header: "X-Requested-With", operation: "set", value: "XMLHttpRequest" },
    { header: "X-XHR-Logon", operation: "set", value: "accept" }
  ];
  if (cookie) {
    reqHeaders.push({ header: "Cookie", operation: "set", value: cookie });
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

  const ruleId = DNR_RULE_BASE_ID + (nextRuleSlot++ % DNR_RULE_MAX_SLOTS);
  await installScopedDnrRule(ruleId, reqHeaders);

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

    return {
      ok: resp.ok,
      status: resp.status,
      finalUrl: resp.url,
      setCookie: cookie || cachedCookies.cookie,
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
  } finally {
    await removeScopedDnrRule(ruleId);
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
      safeStorageSet({
        lastSync: lastSyncTime.toISOString(),
        hasSession: active.hasSession,
        status: "connected"
      });
    }
  } catch (err) {
    safeStorageSet({ status: "offline" });
  }
}

// 1. Clean up any legacy/stale DNR rules on install/startup/boot
chrome.runtime.onInstalled.addListener(() => {
  cleanupAllProxyDnrRules();
});
chrome.runtime.onStartup.addListener(() => {
  cleanupAllProxyDnrRules();
});

// 2. Listen for real-time cookie updates on SAP domains
chrome.cookies.onChanged.addListener((changeInfo) => {
  const d = changeInfo.cookie.domain || "";
  if (SAP_DOMAINS.some((dom) => d.includes(dom))) {
    refreshCachedCookies().then(() => {
      syncCookiesToLocalAssistant();
    });
  }
});

// 3. Periodic heartbeat sync every 60 seconds
chrome.alarms.create("sapCookieSyncAlarm", { periodInMinutes: 1.0 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "sapCookieSyncAlarm") {
    refreshCachedCookies().then(() => {
      syncCookiesToLocalAssistant();
    });
  }
});

// 4. Message handlers for Bridge and Popup
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

// Initial warm-up & stale rule cleanup
cleanupAllProxyDnrRules();
refreshCachedCookies();
