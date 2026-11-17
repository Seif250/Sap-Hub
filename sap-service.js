// ============================================================================
// SAP Service — framework-agnostic session lifecycle on top of SAPClient
// (GET → LoadingPlaceHolder_Load → Search → Open student → Booking history)
// UI code should only call: SapService.search(), SapService.openStudent(), SapService.reset()
// ============================================================================
(function (global) {
  const SAP = global.SAPClient;
  const FESR = "fesrAppName=Z_HER_WA_STUDENT~Z_HER_AC_STUDENT&fesrUseBeacon=true";

  let session = null; // { contextUrl, secureId, cookie, controls, screen, backFromHistoryBtn, backToSearchBtn }
  let lastCriteria = null;
  let sapLock = Promise.resolve();
  const vdom = document.createElement("div");
  const dirty = new Set();

  /** Serializes all SAP Web Dynpro operations so parallel UI calls never collide on the same session */
  function withSapLock(fn) {
    const next = sapLock.then(fn, fn);
    sapLock = next.catch(() => { });
    return next;
  }

  function getCookie() {
    return localStorage.getItem("sap_hub_cookie") || "";
  }
  function setCookie(raw) {
    localStorage.setItem("sap_hub_cookie", raw || "");
    session = null;
  }
  function hasCookie() {
    return !!SAP.parsePastedAuth(getCookie()).cookie;
  }

  // --- Extension Direct Bridge State & Communication ---
  let extensionBridgeAvailable = !!document.documentElement.getAttribute("data-sap-hub-bridge");
  let extensionBridgeVersion = document.documentElement.getAttribute("data-sap-hub-bridge") || null;
  let extensionPingChecked = extensionBridgeAvailable;

  window.addEventListener("message", (evt) => {
    if (evt.data && evt.data.source === "SAP_BRIDGE" && (evt.data.type === "ANNOUNCE" || evt.data.type === "PONG")) {
      extensionBridgeAvailable = true;
      extensionPingChecked = true;
      if (evt.data.version) extensionBridgeVersion = evt.data.version;
    }
  });

  function pingExtensionBridge(timeoutMs = 350) {
    if (extensionBridgeAvailable) return Promise.resolve(true);
    if (extensionPingChecked) return Promise.resolve(false);
    return new Promise((resolve) => {
      const requestId = "ping_" + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener("message", handler);
        extensionPingChecked = true;
        resolve(false);
      }, timeoutMs);

      function handler(e) {
        if (e.data && e.data.source === "SAP_BRIDGE" && (e.data.requestId === requestId || e.data.type === "PONG" || e.data.type === "ANNOUNCE")) {
          clearTimeout(timer);
          window.removeEventListener("message", handler);
          extensionBridgeAvailable = true;
          extensionPingChecked = true;
          if (e.data.version) extensionBridgeVersion = e.data.version;
          resolve(true);
        }
      }

      window.addEventListener("message", handler);
      window.postMessage({ source: "SAP_HUB_CLIENT", type: "PING", requestId }, "*");
    });
  }

  function callExtensionProxy(payload, timeoutMs = 65000) {
    return new Promise((resolve, reject) => {
      const requestId = "sap_req_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("SAP request timed out via Chrome Extension bridge (65s)"));
      }, timeoutMs);

      function handler(e) {
        if (!e.data || e.data.source !== "SAP_BRIDGE" || e.data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        if (e.data.error) {
          reject(new Error(e.data.error));
        } else {
          resolve(e.data.response);
        }
      }

      window.addEventListener("message", handler);
      window.postMessage({ source: "SAP_HUB_CLIENT", type: "SAP_PROXY", requestId, payload }, "*");
    });
  }

  function callExtensionAction(type, payload = {}, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const requestId = "act_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve(null);
      }, timeoutMs);

      function handler(e) {
        if (!e.data || e.data.source !== "SAP_BRIDGE" || e.data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        resolve(e.data);
      }

      window.addEventListener("message", handler);
      window.postMessage({ source: "SAP_HUB_CLIENT", type, requestId, payload }, "*");
    });
  }

  async function proxy({ url, method = "GET", cookie, body = "" }) {
    // 1. First priority: Direct Chrome Extension Bridge (serverless, direct browser proxy)
    const hasBridge = extensionBridgeAvailable || (await pingExtensionBridge(300));
    if (hasBridge) {
      try {
        const extRes = await callExtensionProxy({ url, method, cookie, body, referer: SAP.BASE_SAP_URL });
        if (extRes && (extRes.ok || extRes.status)) {
          return extRes;
        }
      } catch (err) {
        console.warn("[SAP Proxy] Extension bridge request warning:", err);
      }
    }

    // 2. Fallback: Local server or Cloudflare edge function (/api/sap)
    let resp;
    try {
      resp = await fetch("/api/sap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method, cookie, body, referer: SAP.BASE_SAP_URL }),
      });
    } catch (e) {
      throw new Error("Unable to connect to SAP. Make sure the SAP Copilot Chrome Extension is installed and active in this browser, or server.ps1 is running.");
    }
    const data = await resp.json();
    if (!data.ok && data.error && data.error.includes("Cloudflare cannot route directly")) {
      throw new Error("SAP Connection Error: Please install/reload the SAP Copilot Chrome Extension to connect directly from Cloudflare Pages!");
    }
    return data;
  }

  const postBody = (secureId, queue) =>
    `sap-charset=utf-8&sap-wd-secure-id=${encodeURIComponent(secureId)}&${FESR}&SAPEVENTQUEUE=${queue}`;

  function mergeRegControls(target, source) {
    if (!source) return target || {};
    const merged = { ...(target || {}) };
    for (const [k, v] of Object.entries(source)) {
      if (v !== null && v !== undefined && v !== "") {
        merged[k] = v;
      }
    }
    return merged;
  }

  async function fetchServerSyncedCookie() {
    // 1. Direct browser extension query (only if extension bridge is present)
    const hasBridge = extensionBridgeAvailable || (await pingExtensionBridge(250));
    if (hasBridge) {
      try {
        const extRes = await callExtensionAction("GET_ACTIVE_COOKIES", {}, 1200);
        if (extRes && extRes.ok && extRes.cookie) {
          localStorage.setItem("sap_hub_cookie", extRes.cookie);
          return {
            ok: true,
            hasCookie: true,
            hasSessionId: !!extRes.hasSessionId,
            cookie: extRes.cookie,
            source: "extension",
            updatedAt: extRes.updatedAt || new Date().toISOString()
          };
        }
      } catch (e) {}
    }

    // 2. Local or edge server (/api/get-cookies)
    try {
      const r = await fetch("/api/get-cookies");
      const data = await r.json();
      if (data && data.ok && data.cookie) {
        localStorage.setItem("sap_hub_cookie", data.cookie);
        data.source = "server";
        return data;
      }
    } catch (e) { }
    return null;
  }

  async function connect(onStep, isRetry = false) {
    let parsed = SAP.parsePastedAuth(getCookie());
    if (!parsed.cookie) {
      onStep && onStep("Checking for auto-synced cookies…");
      const serverData = await fetchServerSyncedCookie();
      if (serverData && serverData.cookie) {
        parsed = SAP.parsePastedAuth(serverData.cookie);
      }
    }

    if (!parsed.cookie) {
      const err = new Error("No SAP cookie found. Open SAP tab with the Auto-Sync extension, or paste cookies in Settings.");
      err.code = "NO_COOKIE";
      throw err;
    }
    onStep && onStep("Connecting to SAP…");
    const getRes = await proxy({ url: SAP.BASE_SAP_URL, cookie: parsed.cookie });
    if (!getRes.ok || !getRes.body) {
      const isExp = getRes.status === 403 || getRes.status === 401 || getRes.sessionExpired || (getRes.error && /403|expired|forbidden/i.test(getRes.error));
      if (isExp && !isRetry) {
        onStep && onStep("Session expired. Checking for fresh cookies from extension…");
        const fresh = await fetchServerSyncedCookie();
        if (fresh && fresh.cookie && fresh.cookie !== parsed.cookie) {
          return connect(onStep, true);
        }
      }
      const err = new Error(isExp ? "SAP session expired. Refresh (F5) your open SAP tab and the extension will sync a fresh cookie automatically!" : (getRes.error || `SAP connection failed (${getRes.status})`));
      err.code = isExp ? "EXPIRED" : "FAILED";
      throw err;
    }

    let cookie = SAP.mergeCookies(parsed.cookie, getRes.setCookie);
    const htmlText = SAP.decodeHtmlEntities(getRes.body);
    if (htmlText.includes("SAMLRequest") || htmlText.includes("SAML2")) {
      const err = new Error("SAP session expired. Paste a fresh cookie in Settings.");
      err.code = "EXPIRED";
      throw err;
    }
    const ctx = htmlText.match(/sap-contextid=([^"&'\s>]+)/i);
    const sec =
      htmlText.match(/name=["']sap-wd-secure-id["'][^>]*value=["']([^"']+)["']/i) ||
      htmlText.match(/value=["']([^"']+)["'][^>]*name=["']sap-wd-secure-id["']/i) ||
      htmlText.match(/sap-wd-secure-id["'\s:=]+([A-F0-9]{16,64})/i);
    if (!ctx || !sec) {
      const err = new Error("SAP did not return a session context. The cookie may be invalid or expired.");
      err.code = "EXPIRED";
      throw err;
    }
    const contextUrl = `${SAP.SAP_ORIGIN}/sap/bc/webdynpro/sap/z_her_wa_student?sap-contextid=${ctx[1]}`;
    const secureId = decodeURIComponent(sec[1]);

    onStep && onStep("Loading SAP search screen…");
    const ph = await proxy({ url: contextUrl, method: "POST", cookie, body: SAP.buildLoadingPlaceholderBody(secureId) });
    if (!ph.ok) throw new Error(ph.error || `SAP init failed (${ph.status})`);
    cookie = SAP.mergeCookies(cookie, ph.setCookie);
    vdom.innerHTML = "";
    SAP.applySapDeltaUpdates(ph.body, vdom);
    dirty.clear();
    session = {
      contextUrl,
      secureId,
      cookie,
      controls: SAP.discoverSearchControls(vdom, ph.body),
      screen: "SEARCH",
      backFromHistoryBtn: null,
      backToSearchBtn: null,
    };
    return session;
  }

  /**
   * Navigates an existing SAP session from HISTORY or DETAIL back to the SEARCH screen (~200ms)
   * instead of creating a brand-new SAP session (~1.5s) and exhausting server context slots!
   */
  async function ensureSearchScreen(onStep) {
    if (!session) return connect(onStep);
    if (session.screen === "SEARCH") return session;

    try {
      if (session.screen === "HISTORY" && session.backFromHistoryBtn) {
        const bhRes = await proxy({
          url: session.contextUrl,
          method: "POST",
          cookie: session.cookie,
          body: postBody(session.secureId, SAP.buildButtonPressQueue(session.backFromHistoryBtn)),
        });
        if (bhRes.ok && bhRes.body && !bhRes.body.includes("SAMLRequest") && bhRes.sessionState !== "RELEASED") {
          session.cookie = SAP.mergeCookies(session.cookie, bhRes.setCookie);
          SAP.applySapDeltaUpdates(bhRes.body, vdom);
          const detAfter = SAP.parseStudentDetailScreen(vdom, bhRes.body);
          session.backToSearchBtn = (detAfter.menuIds && detAfter.menuIds.backToSearchBtn) || session.backToSearchBtn;
          session.screen = "DETAIL";
        } else {
          return connect(onStep);
        }
      }

      if (session.screen === "DETAIL" && session.backToSearchBtn) {
        const bsRes = await proxy({
          url: session.contextUrl,
          method: "POST",
          cookie: session.cookie,
          body: postBody(session.secureId, SAP.buildButtonPressQueue(session.backToSearchBtn)),
        });
        if (bsRes.ok && bsRes.body && !bsRes.body.includes("SAMLRequest") && bsRes.sessionState !== "RELEASED") {
          session.cookie = SAP.mergeCookies(session.cookie, bsRes.setCookie);
          vdom.innerHTML = "";
          SAP.applySapDeltaUpdates(bsRes.body, vdom);
          session.controls = SAP.discoverSearchControls(vdom, bsRes.body);
          session.screen = "SEARCH";
          session.backFromHistoryBtn = null;
          session.backToSearchBtn = null;
          dirty.clear();
          return session;
        }
      }
    } catch (e) {
      console.warn("Could not navigate back to search, reconnecting:", e);
    }

    return connect(onStep);
  }

  /** Detects what the agent typed: Student ID, email, or phone */
  function detectQuery(raw) {
    const q = String(raw || "").trim();
    if (!q) return null;
    if (q.includes("@")) return { type: "email", label: "Email", value: q };
    const digits = q.replace(/[^\d]/g, "");
    if (/^00\d{8}$/.test(digits)) return { type: "studentId", label: "Student ID", value: digits };
    if (digits.length >= 9) {
      let p = digits;
      if (p.startsWith("20") && p.length === 12) p = p.slice(2);
      // Keep exact input digits (e.g. 01039723505 or 1039723505) and prepare alternatives
      const withZero = p.startsWith("0") ? p : `0${p}`;
      const withoutZero = p.startsWith("0") ? p.slice(1) : p;
      return {
        type: "telephone",
        label: "Phone",
        value: p,
        withZero,
        withoutZero,
      };
    }
    if (/^\d{1,8}$/.test(digits)) return { type: "studentId", label: "Student ID", value: digits.padStart(10, "0") };
    return { type: "name", label: "Name", value: q };
  }

  function criteriaFor(det, controls) {
    const map = { studentId: controls.studentId, telephone: controls.telephone, email: controls.email, name: controls.anyName };
    if (!map[det.type]) throw new Error(`Search by ${det.label} is not supported on this SAP screen.`);
    return [{ label: det.label, controlId: map[det.type], value: det.value }];
  }

  async function runSearch(sess, criteria) {
    const queue = SAP.buildSearchEventQueue(criteria, sess.controls, dirty);
    return proxy({ url: sess.contextUrl, method: "POST", cookie: sess.cookie, body: postBody(sess.secureId, queue) });
  }

  async function fetchAllTablePages(sess, rawBody, currentParsed, onStep) {
    let results = currentParsed || [];
    const bodyStr = String(rawBody || "");
    const crcMatch = bodyStr.match(/id="([A-Za-z0-9_]+)"[^>]+crc="(\d+)"/i);
    const tableId = (crcMatch && crcMatch[1]) || (sess.controls && sess.controls.resultsTable) || "WD03F1";
    const totalCrc = crcMatch ? parseInt(crcMatch[2], 10) : 0;

    if (totalCrc > results.length) {
      onStep && onStep(`Loading all ${totalCrc} family members from SAP…`);
      const fetchQueue = `SapTableCS_TableResize~E002Id~E004${tableId}~E005VisibleContentRowCount~E004${totalCrc}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E003~E002~E003~E001SapTableCS_RequestData~E002Id~E004${tableId}~E005DataFragments~E004${results.length}~002C${totalCrc}~003B~E005FirstVisibleContentRowIndex~E0040~E005VisibleContentRowCount~E004${totalCrc}~E003~E002ResponseData~E004delta~E005ClientAction~E004submitAsync~E003~E002~E003~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004true~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
      const moreRes = await proxy({ url: sess.contextUrl, method: "POST", cookie: sess.cookie, body: postBody(sess.secureId, fetchQueue) });
      if (moreRes.ok && moreRes.body) {
        sess.cookie = SAP.mergeCookies(sess.cookie, moreRes.setCookie);
        SAP.applySapDeltaUpdates(moreRes.body, vdom);
        results = SAP.parseSearchResults(vdom, moreRes.body, results);
      }
    }
    return results;
  }

  function search(rawQuery, onStep) {
    return withSapLock(async () => {
      const det = detectQuery(rawQuery);
      if (!det) throw new Error("Enter a Student ID, phone number, or email.");
      let sess = await ensureSearchScreen(onStep);
      let criteria = criteriaFor(det, sess.controls);
      onStep && onStep(`Searching SAP by ${det.label} (${det.value})…`);
      let res = await runSearch(sess, criteria);
      if (!res.ok || !res.body || res.body.includes("SAMLRequest") || res.sessionState === "RELEASED") {
        sess = await connect(onStep);
        criteria = criteriaFor(det, sess.controls);
        res = await runSearch(sess, criteria);
      }
      if (!res.ok) throw new Error(res.error || `SAP search failed (HTTP ${res.status})`);
      sess.cookie = SAP.mergeCookies(sess.cookie, res.setCookie);
      SAP.applySapDeltaUpdates(res.body || "", vdom);
      lastCriteria = criteria;
      let parsedResults = SAP.parseSearchResults(vdom, res.body || "");
      parsedResults = await fetchAllTablePages(sess, res.body, parsedResults, onStep);

      // Automatic Phone Number Fallback:
      // If searched with 0 (e.g. 01039723505) and 0 results -> retry without 0 (1039723505)
      // If searched without 0 (e.g. 1039723505) and 0 results -> retry with 0 (01039723505)
      if (det.type === "telephone" && parsedResults.length === 0) {
        const altValue = det.value.startsWith("0") ? det.withoutZero : det.withZero;
        if (altValue && altValue !== det.value) {
          onStep && onStep(`No results for "${det.value}", retrying with "${altValue}"…`);
          const altDet = { ...det, value: altValue };
          const altCriteria = criteriaFor(altDet, sess.controls);
          const altRes = await runSearch(sess, altCriteria);
          if (altRes.ok && altRes.body) {
            sess.cookie = SAP.mergeCookies(sess.cookie, altRes.setCookie);
            SAP.applySapDeltaUpdates(altRes.body || "", vdom);
            let altParsed = SAP.parseSearchResults(vdom, altRes.body);
            altParsed = await fetchAllTablePages(sess, altRes.body, altParsed, onStep);
            if (altParsed.length > 0) {
              lastCriteria = altCriteria;
              return { detected: altDet, results: altParsed };
            }
          }
        }
      }

      return { detected: det, results: parsedResults };
    });
  }

  /**
   * Fetches the student's live SAP Account Balance (FPL9) directly via SAP ITS WebGUI.
   * Runs on its own WebGUI path so it never collides with the Web Dynpro session lock.
   */
  async function fetchStudentAccountBalance(studentId, cookie) {
    const cleanId = String(studentId || "").padStart(10, "0");
    if (!cleanId || cleanId === "0000000000") return null;

    // 1. Direct SAP ITS WebGUI FPL9 2-step handshake
    try {
      const fpl9InitUrl =
        `${SAP.SAP_ORIGIN}/sap/bc/gui/sap/its/webgui?%7etransaction=*APB_LPD_CALL_B_I_TXN%20` +
        `P_ROLE%3dFPM_NAV_2%3bP_APPL%3dYOU_CAN_ALSO%3bP_TCODE%3dFPL9%3bP_SELSCR%3dX%3b` +
        `P_PRGRAM%3dSAPLFKL9%3bP_DYNNR%3d0100%3bP_OKCODE%3d%3bP_ENCMTH%3d%3b` +
        `P_OBJECT%3dFKKL1-GPART%252521${cleanId}%3bP_CTO%3dEA%3bDYNP_OKCODE%3donli%3b` +
        `&~nosplash=1&sap-language=EN&sap-client=100`;

      const step1 = await proxy({ url: fpl9InitUrl, method: "GET", cookie });
      if (step1 && step1.ok && step1.body) {
        const html1 = String(step1.body);
        const moinMatch = html1.match(/moin\s*[:=]\s*["']([A-F0-9]+)["']/i);
        const pathMatch =
          html1.match(/startParam\s*:\s*['"]~path=([^'"]+)['"]/i) ||
          html1.match(/(\/sap\([^)]+\)\/bc\/gui\/sap\/its\/webgui)/i);

        if (moinMatch && pathMatch) {
          const moin = moinMatch[1];
          const wgPath = pathMatch[1].replace(/\/$/, "");
          const wgCookie = SAP.mergeCookies(cookie, step1.setCookie);
          const step2Url = `${SAP.SAP_ORIGIN}${wgPath}/state/ur`;
          const step2Body =
            `moin=${moin}&~RG_WEBGUI=X&sap-statistics=true&~path=${wgPath}` +
            `&ClientWidth=2124&ClientHeight=1024&ScreenOrientation=landscape` +
            `&ThemedLayoutPaddingTop=16&ThemedLayoutPaddingBottom=16&ThemedLayoutPaddingLeft=48&ThemedLayoutPaddingRight=48` +
            `&ThemedTableRowHeightStandard=33&ThemedScrollbarDimension=17&ThemedDocumentBackgroundColor=rgb(247, 247, 247)` +
            `&ThemedSvgLibs=${encodeURIComponent(SAP.SAP_ORIGIN + "/sap/public/icmandir/its/ls/theming/UR/c2/sap_fiori_3/svg/libs/SAPGUI-icons.svg")}` +
            `&ThemedRasterHeight=32&ThemedRasterWidth=10&ThemedAbapListRasterHeight=27&ThemedAbapListRasterWidth=8` +
            `&sapthemecat=3&ThemeID=sap_fiori_3&SapThemeID=sap_fiori_3&DeviceType=DESKTOP&Platform=Windows` +
            `&ThemedTableRowHeight=25&sapurisfioritheme=1&theme=sap_fiori_3&sapbasetheme=sap_fiori_3` +
            `&ThemedValueHelpWidth=1080&ThemedValueHelpHeight=700` +
            `&~webguiScreenWidth=2124&~webguiScreenHeight=1024&~webguiUserAreaWidth=2028&~webguiUserAreaHeight=872` +
            `&~ci_result=ClientWidth=2124;ClientHeight=1024;ScreenOrientation=landscape;ThemedLayoutPaddingTop=16;ThemedLayoutPaddingBottom=16;ThemedLayoutPaddingLeft=48;ThemedLayoutPaddingRight=48;ThemedTableRowHeightStandard=33;ThemedScrollbarDimension=17;ThemedDocumentBackgroundColor=rgb(247, 247, 247);ThemedSvgLibs=${encodeURIComponent(SAP.SAP_ORIGIN + "/sap/public/icmandir/its/ls/theming/UR/c2/sap_fiori_3/svg/libs/SAPGUI-icons.svg")};ThemedRasterHeight=32;ThemedRasterWidth=10;ThemedAbapListRasterHeight=27;ThemedAbapListRasterWidth=8;sapthemecat=3;ThemeID=sap_fiori_3;SapThemeID=sap_fiori_3;DeviceType=DESKTOP;Platform=Windows;ThemedTableRowHeight=25;sapurisfioritheme=1;theme=sap_fiori_3;sapbasetheme=sap_fiori_3;ThemedValueHelpWidth=1080;ThemedValueHelpHeight=700;~webguiScreenWidth=2124;~webguiScreenHeight=1024;~webguiUserAreaWidth=2028;~webguiUserAreaHeight=872`;

          const step2 = await proxy({ url: step2Url, method: "POST", cookie: wgCookie, body: step2Body });
          if (step2 && step2.ok && step2.body && step2.body.includes("urColorTotal")) {
            return SAP.parseAccountBalance(step2.body);
          }
        }
      }
    } catch (e) {
      console.warn("Direct FPL9 WebGUI balance check failed:", e);
    }

    // 2. Fallback: Check recorder cache only if it explicitly belongs to this studentId
    try {
      const recentRes = await fetch("/api/recorder/recent").then((r) => r.json()).catch(() => null);
      if (recentRes && Array.isArray(recentRes.items)) {
        const fpl9Entry = recentRes.items.slice().reverse().find((i) => {
          const body = i.fullResponse || i.responseSnippet || "";
          return ((i.url && i.url.includes("webgui")) || (i.action && i.action.includes("Account balance"))) && body.includes(cleanId);
        });
        if (fpl9Entry) {
          const bodyToParse = fpl9Entry.fullResponse || fpl9Entry.responseSnippet || "";
          if (bodyToParse) return SAP.parseAccountBalance(bodyToParse);
        }
      }
    } catch (e) { }

    return null;
  }

  /**
   * Opens notes whose titles don't reveal the level (Select row → "Display note" → read text → Close popup),
   * then re-runs level detection on the note bodies. Mutates notesData. Max 3 notes per student.
   */
  async function readNoteBodies(sess, notesPanelXml, notesData) {
    const ctl = SAP.findNoteControls(notesPanelXml);
    if (!ctl.tableId || !ctl.displayBtnId || !ctl.rows.length) return;
    const toOpen = ctl.rows.filter((r) => !SAP.titleRevealsLevel(r.title)).slice(0, 3);

    for (const r of toOpen) {
      try {
        const selQueue = SAP.buildNoteCellSelectQueue(ctl.tableId, r.cellId, r.focusId, r.rowIndex, r.colIndex);
        const dispQueue = SAP.buildButtonPressQueue(ctl.displayBtnId);
        // Combine row select + Display Note button press into 1 round-trip instead of 2
        const combinedQueue = selQueue.replace(/~E001Form_Request[\s\S]*$/, "") + "~E001" + dispQueue;
        const disp = await proxy({
          url: sess.contextUrl, method: "POST", cookie: sess.cookie,
          body: postBody(sess.secureId, combinedQueue)
        });
        if (!disp.ok) continue;
        sess.cookie = SAP.mergeCookies(sess.cookie, disp.setCookie);
        const pop = SAP.parseNotePopup(disp.body);

        // Always close the popup so the SAP session stays on the student screen
        const cls = await proxy({
          url: sess.contextUrl, method: "POST", cookie: sess.cookie,
          body: postBody(sess.secureId, SAP.buildPopupCloseQueue(pop.popupId))
        });
        if (cls.ok) {
          sess.cookie = SAP.mergeCookies(sess.cookie, cls.setCookie);
          SAP.applySapDeltaUpdates(cls.body || "", vdom);
        }

        if (pop.text) {
          let entry = notesData.notesList.find((n) => n.title === r.title && (!n.text || n.text === n.title));
          const lvl = SAP.detectLevelFromNotesText(`${r.title || ""} ${pop.text}`);
          if (entry) {
            entry.text = pop.text;
            if (lvl.detectedLevel) {
              entry.detectedLevel = lvl.detectedLevel;
              entry.isNoLevel = lvl.isNoLevel;
            }
          } else {
            entry = {
              type: "Note Detail",
              title: r.title,
              text: pop.text,
              detectedLevel: lvl.detectedLevel,
              isNoLevel: lvl.isNoLevel,
              dateNum: 0,
            };
            notesData.notesList.push(entry);
          }
          notesData.rawNotesList.push(`${r.title}: ${pop.text}`);
          const sortedWithLevel = notesData.notesList
            .filter((n) => n.detectedLevel)
            .sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));
          if (sortedWithLevel.length > 0) {
            notesData.detectedLevel = sortedWithLevel[0].detectedLevel;
            notesData.isNoLevel = sortedWithLevel[0].isNoLevel;
            notesData.detectedLevelDate = sortedWithLevel[0].createdOn || "";
            notesData.detectedLevelDateNum = sortedWithLevel[0].dateNum || 0;
            break;
          }
        }
      } catch (e) {
        console.warn("Could not open note", r.title, e);
      }
    }
  }

  function openStudent(row, onStep, onUpdate) {
    return withSapLock(async () => {
      let sess = session;
      let linkId = row.linkId;
      const studentId = String(row.studentNumber || row.studentId || "").padStart(10, "0");

      // Check if we are already on a search screen with this student's link ID available
      let canUseDirectLink = Boolean(
        sess &&
        sess.screen === "SEARCH" &&
        linkId &&
        (vdom.querySelector(`[id="${CSS.escape(linkId)}"]`) || (vdom.innerHTML && vdom.innerHTML.includes(linkId)))
      );

      // If not on search screen or link is missing/from a different screen, navigate back to search screen (~200ms)
      // and search by Student ID directly so we open the EXACT student with 100% precision without leaking sessions.
      if (!canUseDirectLink) {
        sess = await ensureSearchScreen(onStep);
        onStep && onStep(`Looking up student ${row.fullName || studentId} in SAP…`);
        const crit = [{ label: "Student ID", controlId: sess.controls.studentId, value: studentId }];
        let r = await runSearch(sess, crit);
        if (!r.ok || !r.body || r.body.includes("SAMLRequest") || r.sessionState === "RELEASED") {
          sess = await connect(onStep);
          const freshCrit = [{ label: "Student ID", controlId: sess.controls.studentId, value: studentId }];
          r = await runSearch(sess, freshCrit);
        }
        if (!r.ok) throw new Error(r.error || `HTTP ${r.status}`);
        sess.cookie = SAP.mergeCookies(sess.cookie, r.setCookie);
        SAP.applySapDeltaUpdates(r.body || "", vdom);
        const fresh = SAP.parseSearchResults(vdom, r.body || "");
        const exact = fresh.find((s) => s.studentNumber === studentId) || fresh[0];
        if (!exact || !exact.linkId) {
          throw new Error(`Student ${studentId} could not be located in SAP.`);
        }
        linkId = exact.linkId;
        row = { ...row, ...exact };
      }

      onStep && onStep(`Opening ${row.fullName || row.studentNumber || row.studentId}…`);
      const d = await proxy({
        url: sess.contextUrl, method: "POST", cookie: sess.cookie,
        body: postBody(sess.secureId, SAP.buildLinkActivateQueue(linkId)),
      });
      if (!d.ok || !d.body) throw new Error(d.error || "Failed to open the student record.");
      sess.cookie = SAP.mergeCookies(sess.cookie, d.setCookie);
      vdom.innerHTML = "";
      SAP.applySapDeltaUpdates(d.body, vdom);
      const det = SAP.parseStudentDetailScreen(vdom, d.body);
      sess.backToSearchBtn = (det.menuIds && det.menuIds.backToSearchBtn) || sess.backToSearchBtn;
      sess.screen = "DETAIL";

      let notesData = { notesList: [], rawNotesList: [], detectedLevel: null };
      let recLevelData = { recLevels: [], latestRec: null, latestRecLevel: null };
      let accountBalance = {
        open: 0,
        debit: 0,
        credit: 0,
        currency: "EGP",
        isCredit: false,
        isDebt: false,
        isSettled: true,
        amount: 0,
        formatted: "0 EGP",
      };

      function buildProfile(dDet, dNotes, dRec, dBal, currentBookings = []) {
        const outside = (dDet.outsideLevel || dDet.levelFromHeader || row.level || "").trim();
        const isA0 = /^a0(\s|$)/i.test(outside);
        const hasSpecificOutsideLevel = Boolean(outside && !isA0 && !/no\s*level/i.test(outside));
        const hasSpecificRecLevel = Boolean(
          dRec.latestRecLevel &&
          !/^a0(\s|$)/i.test(dRec.latestRecLevel) &&
          !/no\s*level/i.test(dRec.latestRecLevel)
        );

        let finalLevel = outside || "No level assigned";
        let detectedFromNote = dNotes.detectedLevel || null;
        let levelSource = "SAP Header";

        const noteDateNum = dNotes.detectedLevelDateNum || 0;
        const recDateNum = dRec.latestRecDateNum || 0;
        let latestBookingDateNum = 0;
        let prebookedPTBooking = null;
        if (Array.isArray(currentBookings)) {
          currentBookings.forEach((b) => {
            const desc = `${b.courseCode || ""} ${b.courseDescription || ""} ${b.className || ""}`;
            const s = String(b.status || "").toLowerCase();
            const isPT = /ylcon|adcon|consultation|placement|\bpt\b|assessment/i.test(desc);
            if (isPT && /prebook|reserv|pending|wait/i.test(s) && !s.includes("cancel")) {
              if (!prebookedPTBooking) prebookedPTBooking = b;
            }
            if (isPT) return;
            if (s.includes("cancel")) return;
            const dNum = SAP.parseSapDateToNum(b.bookingDate) || SAP.parseSapDateToNum(b.startDate);
            if (dNum > latestBookingDateNum) latestBookingDateNum = dNum;
          });
        }
        const hasPrebookedPT = Boolean(prebookedPTBooking);

        // Chronological check: if a dated Note is strictly newer than both RecLevel and the latest Course Booking,
        // or if a Note on the same/newer date specifies a level override (even a lower level or No Level), follow the newest date!
        const noteIsNewest = Boolean(
          dNotes.detectedLevel &&
          noteDateNum > 0 &&
          noteDateNum >= recDateNum &&
          noteDateNum > latestBookingDateNum
        );

        const studentDob = dDet.dob || row.dob || "";
        const kb = global.BCKnowledgeBase || global.bcKnowledgeBase;
        const studentAge = studentDob && kb ? kb.calculateDetailedAge(studentDob) : null;
        const isStudentEarlyYears = Boolean(
          studentAge &&
          (studentAge.stageCategory === "YL" || studentAge.isEarlyYears) &&
          (studentAge.academicYears <= 5 || studentAge.years <= 5)
        );

        // Only notes that explicitly state failure/no level count as failed PT.
        // "No level assigned" in the SAP header is merely an unassigned placeholder, NOT a failed PT!
        const outsideExplicitlyFailed = Boolean(
          outside &&
          !/no\s*level\s*assigned/i.test(outside) &&
          /no\s*level|راسب|ساقط|fail|did not pass/i.test(outside)
        );
        const rawNoLevelInNotes = Boolean(
          !isStudentEarlyYears &&
          !hasPrebookedPT && (
            dNotes.isNoLevel ||
            /no\s*level|راسب|ساقط|fail|did not pass/i.test(dNotes.detectedLevel || "") ||
            outsideExplicitlyFailed ||
            (Array.isArray(dNotes.notesList) && dNotes.notesList.some((n) => /\bno\s*level\b|راسب|ساقط|fail|did not pass/i.test(n.title || n.text || "")))
          )
        );
        const isStudentNoLevel = Boolean(
          !isStudentEarlyYears &&
          !hasPrebookedPT && (
            (noteIsNewest && dNotes.isNoLevel) ||
            (rawNoLevelInNotes && !hasSpecificOutsideLevel && !hasSpecificRecLevel && latestBookingDateNum === 0)
          )
        );

        if (isStudentEarlyYears) {
          const acadYrs = (studentAge && studentAge.academicYears) || (studentAge && studentAge.years) || 4;
          const eyLvl = acadYrs >= 5 ? "Early Years 3 (Owls)" : "Early Years 2 (Ducks)";
          finalLevel = (hasSpecificOutsideLevel && /ducks|owls/i.test(outside)) ? outside : eyLvl;
          detectedFromNote = null;
          levelSource = "Age Placement (Direct Enrollment)";
        } else if (hasPrebookedPT) {
          finalLevel = "Pending PT Payment (Unpaid)";
          detectedFromNote = null;
          levelSource = "Placement Test (Awaiting Payment)";
        } else if (noteIsNewest) {
          finalLevel = dNotes.detectedLevel;
          detectedFromNote = dNotes.detectedLevel;
          levelSource = `Advising Note (${dNotes.detectedLevelDate || "Latest"})`;
        } else if (hasSpecificRecLevel && (recDateNum >= noteDateNum || !dNotes.detectedLevel)) {
          finalLevel = dRec.latestRecLevel;
          levelSource = "Recommended Academic Level";
        } else if (dNotes.detectedLevel && noteDateNum > recDateNum && latestBookingDateNum === 0) {
          finalLevel = dNotes.detectedLevel;
          detectedFromNote = dNotes.detectedLevel;
          levelSource = `Advising Note (${dNotes.detectedLevelDate || "Latest"})`;
        } else if (hasSpecificOutsideLevel) {
          finalLevel = outside;
          levelSource = "SAP Header";
        } else if (isStudentNoLevel) {
          finalLevel = "No Level (Failed PT)";
          detectedFromNote = "No Level";
          levelSource = "Notes (Placement Test Failed)";
        } else if (dRec.latestRecLevel) {
          finalLevel = dRec.latestRecLevel;
          levelSource = "Recommended Academic Level";
        } else if (isA0) {
          if (dNotes.detectedLevel) {
            finalLevel = dNotes.detectedLevel;
            detectedFromNote = dNotes.detectedLevel;
            levelSource = "Advising Notes";
          } else {
            finalLevel = "Beginner (A0)";
            detectedFromNote = "A0";
            levelSource = "SAP Header (Unplaced A0)";
          }
        } else if (dNotes.detectedLevel) {
          finalLevel = dNotes.detectedLevel;
          detectedFromNote = dNotes.detectedLevel;
          levelSource = "Advising Notes";
        }

        const searchPhone = (lastCriteria && lastCriteria.find((c) => c.label === "Phone") ? lastCriteria.find((c) => c.label === "Phone").value : "") || row.phone || "";
        const searchEmail = (lastCriteria && lastCriteria.find((c) => c.label === "Email") ? lastCriteria.find((c) => c.label === "Email").value : "") || row.email || "";

        return {
          ...dDet,
          level: finalLevel,
          levelSource,
          outsideLevel: outside,
          detectedLevelFromNotes: detectedFromNote,
          detectedLevelDate: dNotes.detectedLevelDate || "",
          detectedLevelDateNum: noteDateNum,
          isNoLevel: isStudentNoLevel,
          hasPrebookedPT,
          prebookedPT: prebookedPTBooking || null,
          isEarlyYears: isStudentEarlyYears,
          recLevels: dRec.recLevels || [],
          latestRecLevel: dRec.latestRecLevel || null,
          latestRecDate: dRec.latestRecDate || "",
          latestRecDateNum: recDateNum,
          accountBalance: row.accountBalance || dBal,
          notesList: dNotes.notesList || [],
          rawNotesList: Array.from(new Set([...(dDet.rawNotesList || []), ...(dNotes.rawNotesList || [])])),
          studentId: dDet.studentId || row.studentNumber || row.studentId,
          fullName: SAP.formatStudentName(dDet.fullName || row.fullName),
          firstName: SAP.formatStudentName(dDet.firstName || row.firstName),
          lastName: SAP.formatStudentName(dDet.lastName || row.lastName),
          dob: dDet.dob || row.dob,
          phone: dDet.phone || row.phone || searchPhone,
          email: dDet.email || row.email || searchEmail,
          teachingCentre: row.teachingCentre || dDet.teachingCentre,
          courseHold: row.courseHold,
        };
      }

      // Start Account Balance (FPL9 WebGUI) fetch in parallel so it adds zero latency to student opening!
      const fpl9Promise = fetchStudentAccountBalance(det.studentId || studentId, sess.cookie);

      // Milestone 1: Emit initial profile immediately (< 1s) so the user sees student data right away!
      onUpdate && onUpdate({ profile: buildProfile(det, notesData, recLevelData, accountBalance), bookings: [], isPartial: true });

      // 1. Auto-load Notes & Advising tab
      onStep && onStep("Loading student notes & advising…");
      let latestScreenXml = d.body;
      try {
        const decodedXml = SAP.decodeHtmlEntities(latestScreenXml);
        const pstGeneral = decodedXml.match(/id="([A-Za-z0-9_]+)"[^>]*ct="PST"/i);
        const panelStackId = pstGeneral ? pstGeneral[1] : null;

        const pNotesMatch = decodedXml.match(/id="([A-Za-z0-9_]+)"[^>]*ct="P"[^>]*lsdata='\{[^']*?"8":"Notes"/i);
        const titleNotesMatch = decodedXml.match(/id="([A-Za-z0-9_]+)-title"[^>]*>[^<]*Notes/i);
        const notesPanelId = pNotesMatch ? pNotesMatch[1] : (titleNotesMatch ? titleNotesMatch[1] : null);

        if (panelStackId && notesPanelId) {
          const nRes = await proxy({
            url: sess.contextUrl, method: "POST", cookie: sess.cookie,
            body: postBody(sess.secureId, SAP.buildNotesPanelQueue(panelStackId, notesPanelId)),
          });
          if (nRes.ok && nRes.body) {
            sess.cookie = SAP.mergeCookies(sess.cookie, nRes.setCookie);
            SAP.applySapDeltaUpdates(nRes.body, vdom);
            notesData = SAP.parseNotesScreen(vdom, nRes.body);
            latestScreenXml = nRes.body;

            const outsideLvl = (det.outsideLevel || det.levelFromHeader || row.level || "").trim();
            const outsideIsSpecific = Boolean(outsideLvl && !/^a0(\s|$)/i.test(outsideLvl) && !/no level/i.test(outsideLvl));
            if (!outsideIsSpecific && !notesData.detectedLevel) {
              onStep && onStep("Opening notes to read level…");
              await readNoteBodies(sess, nRes.body, notesData);
            }
            // Milestone 2: Emit updated profile with Notes
            onUpdate && onUpdate({ profile: buildProfile(det, notesData, recLevelData, accountBalance), bookings: [], isPartial: true });
          }
        }
      } catch (e) {
        console.warn("Could not load notes tab from SAP:", e);
      }

      // 2. Auto-load Recommended Academic Level tab
      {
        onStep && onStep("Checking recommended academic level…");
        try {
          const decodedXml = SAP.decodeHtmlEntities(latestScreenXml || d.body);
          const pstMatch = decodedXml.match(/id="([A-Za-z0-9_]+)"[^>]*ct="PST"/i);
          const panelStackId = pstMatch ? pstMatch[1] : null;

          const pRecMatch = decodedXml.match(/id="([A-Za-z0-9_]+)"[^>]*ct="P"[^>]*lsdata='\{[^']*?"8":"Recommended(?:&#x20;|\s+)academic(?:&#x20;|\s+)level"/i);
          const titleRecMatch = decodedXml.match(/id="([A-Za-z0-9_]+)-title"[^>]*>[^<]*Recommended(?:\s+|&#x20;)academic(?:\s+|&#x20;)level/i);
          const recLevelPanelId = pRecMatch ? pRecMatch[1] : (titleRecMatch ? titleRecMatch[1] : null);

          if (panelStackId && recLevelPanelId) {
            const rRes = await proxy({
              url: sess.contextUrl, method: "POST", cookie: sess.cookie,
              body: postBody(sess.secureId, SAP.buildNotesPanelQueue(panelStackId, recLevelPanelId)),
            });
            if (rRes.ok && rRes.body) {
              sess.cookie = SAP.mergeCookies(sess.cookie, rRes.setCookie);
              SAP.applySapDeltaUpdates(rRes.body, vdom);
              recLevelData = SAP.parseRecommendedAcademicLevel(vdom, rRes.body);
              // Milestone 3: Emit updated profile with Recommended Academic Level
              onUpdate && onUpdate({ profile: buildProfile(det, notesData, recLevelData, accountBalance), bookings: [], isPartial: true });
            }
          }
        } catch (e) {
          console.warn("Could not load recommended academic level tab:", e);
        }
      }

      // 3. Await parallel Account Balance (FPL9) check
      try {
        const fetchedBalance = await fpl9Promise;
        if (fetchedBalance) {
          accountBalance = fetchedBalance;
          onUpdate && onUpdate({ profile: buildProfile(det, notesData, recLevelData, accountBalance), bookings: [], isPartial: true });
        }
      } catch (e) {
        console.warn("Could not parse account balance:", e);
      }

      let profile = buildProfile(det, notesData, recLevelData, accountBalance);
      sess.screen = "DETAIL";

      onStep && onStep("Loading booking history…");
      let bookings = [];
      let historyError = null;
      try {
        let { historyPopupId, bookingHistoryItemId, historyMenuBtn } = det.menuIds;
        let h = await proxy({
          url: sess.contextUrl, method: "POST", cookie: sess.cookie,
          body: postBody(sess.secureId, SAP.buildBookingHistoryQueue(historyPopupId, bookingHistoryItemId, historyMenuBtn)),
        });

        // Auto-recover if SAP returned HTTP 500 or stale menu/context state (e.g. after tab switches or shifted IDs)
        if (!h.ok || !h.body || h.status >= 500 || h.body.includes("SAMLRequest") || h.sessionState === "RELEASED") {
          onStep && onStep("Refreshing SAP student view to load booking history…");
          try {
            sess = await connect(onStep);
            const freshCrit = [{ label: "Student ID", controlId: sess.controls.studentId, value: studentId }];
            const sr = await runSearch(sess, freshCrit);
            if (sr.ok && sr.body) {
              sess.cookie = SAP.mergeCookies(sess.cookie, sr.setCookie);
              SAP.applySapDeltaUpdates(sr.body, vdom);
              const freshList = SAP.parseSearchResults(vdom, sr.body);
              const exactStudent = freshList.find((s) => s.studentNumber === studentId) || freshList[0];
              if (exactStudent && exactStudent.linkId) {
                const d2 = await proxy({
                  url: sess.contextUrl, method: "POST", cookie: sess.cookie,
                  body: postBody(sess.secureId, SAP.buildLinkActivateQueue(exactStudent.linkId)),
                });
                if (d2.ok && d2.body) {
                  sess.cookie = SAP.mergeCookies(sess.cookie, d2.setCookie);
                  vdom.innerHTML = "";
                  SAP.applySapDeltaUpdates(d2.body, vdom);
                  const det2 = SAP.parseStudentDetailScreen(vdom, d2.body);
                  sess.backToSearchBtn = (det2.menuIds && det2.menuIds.backToSearchBtn) || sess.backToSearchBtn;
                  sess.screen = "DETAIL";
                  const m2 = det2.menuIds || {};
                  h = await proxy({
                    url: sess.contextUrl, method: "POST", cookie: sess.cookie,
                    body: postBody(sess.secureId, SAP.buildBookingHistoryQueue(m2.historyPopupId || historyPopupId, m2.bookingHistoryItemId || bookingHistoryItemId, m2.historyMenuBtn || historyMenuBtn)),
                  });
                }
              }
            }
          } catch (retryErr) {
            console.warn("Booking history recovery attempt note:", retryErr);
          }
        }

        if (h.ok && h.body) {
          sess.cookie = SAP.mergeCookies(sess.cookie, h.setCookie);
          SAP.applySapDeltaUpdates(h.body, vdom);
          const parsedHist = SAP.parseBookingHistoryScreen(vdom, h.body);
          bookings = parsedHist.bookings || [];
          sess.backFromHistoryBtn = parsedHist.backFromHistoryBtn || SAP.DEFAULT_CONTROLS.backFromHistoryBtn;
          sess.screen = "HISTORY";
          profile = buildProfile(det, notesData, recLevelData, accountBalance, bookings);

          // Milestone 4: Emit initial booking history batch immediately!
          onUpdate && onUpdate({ profile, bookings, isPartial: true });

          // Check if SAP table virtualized/paginated bookings (crc = total row count > bookings.length)
          const crcMatch = h.body.match(/id="([A-Za-z0-9_]+)"[^>]+(?:ct="STCS"|ct="ST5")[^>]*\scrc="(\d+)"/i) || h.body.match(/id="([A-Za-z0-9_]+)"[^>]+crc="(\d+)"/i);
          const totalCrc = crcMatch ? parseInt(crcMatch[2], 10) : 0;
          const tableId = crcMatch ? crcMatch[1] : "WD0A75";

          if (totalCrc > bookings.length) {
            onStep && onStep(`Loading all ${totalCrc} course bookings from SAP…`);
            const fetchQueue = `SapTableCS_TableResize~E002Id~E004${tableId}~E005VisibleContentRowCount~E004${totalCrc}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E003~E002~E003~E001SapTableCS_RequestData~E002Id~E004${tableId}~E005DataFragments~E004${bookings.length}~002C${totalCrc}~003B~E005FirstVisibleContentRowIndex~E0040~E005VisibleContentRowCount~E004${totalCrc}~E003~E002ResponseData~E004delta~E005ClientAction~E004submitAsync~E003~E002~E003~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004true~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
            const moreH = await proxy({
              url: sess.contextUrl, method: "POST", cookie: sess.cookie,
              body: postBody(sess.secureId, fetchQueue),
            });
            if (moreH.ok && moreH.body) {
              sess.cookie = SAP.mergeCookies(sess.cookie, moreH.setCookie);
              SAP.applySapDeltaUpdates(moreH.body, vdom);
              const parsedMore = SAP.parseBookingHistoryScreen(vdom, moreH.body, bookings);
              bookings = parsedMore.bookings || bookings;
              profile = buildProfile(det, notesData, recLevelData, accountBalance, bookings);
              onUpdate && onUpdate({ profile, bookings, isPartial: false });
            }
          }
        } else historyError = h.error || `HTTP ${h.status}`;
      } catch (e) {
        historyError = e.message;
      }
      return { profile, bookings, historyError, fetchedAt: new Date() };
    });
  }

  async function testAndSave(rawInput, onStep) {
    const text = String(rawInput || "").trim();
    if (!text) {
      setCookie("");
      return { ok: true, cleared: true };
    }
    const parsed = SAP.parsePastedAuth(text);
    if (!parsed.cookie) {
      throw new Error("No cookie detected in the pasted text.");
    }
    setCookie(text);
    const sess = await connect(onStep);
    return { ok: true, session: sess };
  }

  global.SapService = {
    getCookie,
    setCookie,
    hasCookie,
    fetchServerSyncedCookie,
    detectQuery,
    connect,
    testAndSave,
    search,
    openStudent,
    reset: () => {
      session = null;
      if (global.SapService._resetRegSession) global.SapService._resetRegSession();
    },
    isConnected: () => !!session,
    isExtensionBridgeActive: () => extensionBridgeAvailable,
    pingExtensionBridge: () => pingExtensionBridge(350),
    _internal: {
      FESR,
      withSapLock,
      proxy,
      postBody,
      mergeRegControls,
      ensureSearchScreen,
      connect,
      runSearch,
      vdom,
      clearSession: () => { session = null; },
    },
  };
})(window);