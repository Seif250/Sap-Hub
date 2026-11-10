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

  window.addEventListener("message", (evt) => {
    if (evt.data && evt.data.source === "SAP_BRIDGE" && (evt.data.type === "ANNOUNCE" || evt.data.type === "PONG")) {
      extensionBridgeAvailable = true;
      if (evt.data.version) extensionBridgeVersion = evt.data.version;
    }
  });

  function pingExtensionBridge(timeoutMs = 350) {
    if (extensionBridgeAvailable) return Promise.resolve(true);
    return new Promise((resolve) => {
      const requestId = "ping_" + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve(false);
      }, timeoutMs);

      function handler(e) {
        if (e.data && e.data.source === "SAP_BRIDGE" && (e.data.requestId === requestId || e.data.type === "PONG" || e.data.type === "ANNOUNCE")) {
          clearTimeout(timer);
          window.removeEventListener("message", handler);
          extensionBridgeAvailable = true;
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
    // 1. Direct browser extension query
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
        const sel = await proxy({
          url: sess.contextUrl, method: "POST", cookie: sess.cookie,
          body: postBody(sess.secureId, SAP.buildNoteCellSelectQueue(ctl.tableId, r.cellId, r.focusId, r.rowIndex, r.colIndex))
        });
        if (!sel.ok) continue;
        sess.cookie = SAP.mergeCookies(sess.cookie, sel.setCookie);
        SAP.applySapDeltaUpdates(sel.body || "", vdom);

        const disp = await proxy({
          url: sess.contextUrl, method: "POST", cookie: sess.cookie,
          body: postBody(sess.secureId, SAP.buildButtonPressQueue(ctl.displayBtnId))
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
        const { historyPopupId, bookingHistoryItemId, historyMenuBtn } = det.menuIds;
        const h = await proxy({
          url: sess.contextUrl, method: "POST", cookie: sess.cookie,
          body: postBody(sess.secureId, SAP.buildBookingHistoryQueue(historyPopupId, bookingHistoryItemId, historyMenuBtn)),
        });
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

  // ==========================================================================
  // Live Registration & Class Schedule Engine (ZHER_WA_REGISTRATION)
  // ==========================================================================
  const FESR_REG = "fesrAppName=ZHER_WA_REGISTRATION~ZHER_AC_REGISTRATION&fesrUseBeacon=true";
  const postRegBody = (secureId, queue) =>
    `sap-charset=utf-8&sap-wd-secure-id=${encodeURIComponent(secureId)}&${FESR_REG}&SAPEVENTQUEUE=${queue}`;

  let regSession = null; // { studentId, regUrl, contextUrl, secureId, cookie, centreKey, controls, popupOpen }
  let lastGuardiansByStudent = {};

  /**
   * Releases any open ZHER_WA_REGISTRATION session by closing WDWL1 (if open) and pressing Back (WD028A / WD02DE)
   * so SAP immediately releases the ABAP Enqueue Lock EZ_COURSE_REG for the current user!
   */
  async function releaseRegistrationSession(onStep) {
    const rs = regSession;
    if (!rs || !rs.contextUrl || !rs.secureId) {
      regSession = null;
      return;
    }
    regSession = null;
    try {
      onStep && onStep("Releasing SAP Registration lock (EZ_COURSE_REG)…");
      if (rs.popupOpen) {
        const closePopupQ =
          `PopupWindow_Close~E002Id~E004WDWL1~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
        const closeRes = await proxy({
          url: rs.contextUrl,
          method: "POST",
          cookie: rs.cookie,
          body: postRegBody(rs.secureId, closePopupQ),
        });
        if (closeRes && closeRes.ok && closeRes.body) {
          rs.cookie = SAP.mergeCookies(rs.cookie, closeRes.setCookie);
          rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(closeRes.body));
        }
        rs.popupOpen = false;
      }
      const backBtnId = (rs.controls && rs.controls.backBtn) || "WD028A";
      const backQ = SAP.buildButtonPressQueue(backBtnId);
      const backRes = await proxy({
        url: rs.contextUrl,
        method: "POST",
        cookie: rs.cookie,
        body: postRegBody(rs.secureId, backQ),
      });
      if (backRes && backRes.ok && backRes.body) {
        rs.cookie = SAP.mergeCookies(rs.cookie, backRes.setCookie);
        const decBack = SAP.decodeHtmlEntities(backRes.body);
        const yesBtnM =
          decBack.match(/<div[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="B"[^>]*>[\s\S]{0,250}?\b(?:Yes|OK|Discard)\b/i) ||
          decBack.match(/<[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="B"[^>]*lsdata='[^']*?["']0["']\s*:\s*["'](?:Yes|OK)["']/i);
        if (yesBtnM && yesBtnM[1] && /WDWL/i.test(decBack)) {
          await proxy({
            url: rs.contextUrl,
            method: "POST",
            cookie: rs.cookie,
            body: postRegBody(rs.secureId, SAP.buildButtonPressQueue(yesBtnM[1])),
          }).catch(() => { });
        }
      }
    } catch (e) {
      console.warn("Could not cleanly release SAP Registration session:", e);
    }
  }

  async function obtainStudentRegistrationUrl(studentId, onStep) {
    return withSapLock(async () => {
      const cleanId = String(studentId || "").padStart(10, "0");
      let sess = await ensureSearchScreen(onStep);
      onStep && onStep(`Locating ${cleanId} in SAP for registration…`);
      const crit = [{ label: "Student ID", controlId: sess.controls.studentId, value: cleanId }];
      let r = await runSearch(sess, crit);
      if (!r.ok || !r.body || r.body.includes("SAMLRequest") || r.sessionState === "RELEASED") {
        sess = await connect(onStep);
        const freshCrit = [{ label: "Student ID", controlId: sess.controls.studentId, value: cleanId }];
        r = await runSearch(sess, freshCrit);
      }
      if (!r.ok) throw new Error(r.error || `HTTP ${r.status}`);
      sess.cookie = SAP.mergeCookies(sess.cookie, r.setCookie);
      SAP.applySapDeltaUpdates(r.body || "", vdom);
      const fresh = SAP.parseSearchResults(vdom, r.body || "");
      const exact = fresh.find((s) => s.studentNumber === cleanId) || fresh[0];
      if (!exact || !exact.linkId) {
        throw new Error(`Student ${cleanId} could not be located in SAP.`);
      }

      const d = await proxy({
        url: sess.contextUrl,
        method: "POST",
        cookie: sess.cookie,
        body: postBody(sess.secureId, SAP.buildLinkActivateQueue(exact.linkId)),
      });
      if (!d.ok || !d.body) throw new Error("Failed to open student detail screen.");
      sess.cookie = SAP.mergeCookies(sess.cookie, d.setCookie);
      const det = SAP.parseStudentDetailScreen(vdom, d.body);
      const regBtnId = (det.menuIds && det.menuIds.registrationBtn) || "WD0A50";

      onStep && onStep("Opening SAP Registration portal…");
      const regClick = await proxy({
        url: sess.contextUrl,
        method: "POST",
        cookie: sess.cookie,
        body: postBody(sess.secureId, SAP.buildButtonPressQueue(regBtnId)),
      });
      // Clicking Registration releases the Z_HER_WA_STUDENT context and redirects to ZHER_WA_REGISTRATION
      session = null;

      if (!regClick.ok || !regClick.body) {
        throw new Error("Failed to trigger SAP Registration redirect.");
      }
      const unescaped = String(regClick.body)
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      const urlMatch = unescaped.match(/"url"\s*:\s*"([^"]+)"/i);
      if (!urlMatch) {
        throw new Error("SAP did not return a Registration redirect URL.");
      }
      let redirectUrl = urlMatch[1];
      if (redirectUrl.startsWith("/")) redirectUrl = `${SAP.SAP_ORIGIN}${redirectUrl}`;
      return { redirectUrl, cookie: SAP.mergeCookies(sess.cookie, regClick.setCookie) };
    });
  }

  async function initRegistrationPopup({ studentId, centreKey, bookingAction = "reservation", onStep }) {
    const cleanId = String(studentId || "").padStart(10, "0");
    if (regSession) {
      await releaseRegistrationSession();
    }
    // Always obtain a fresh Registration redirect URL (KEY_CALLING_CONTEXT is a one-time token in SAP)
    const info = await obtainStudentRegistrationUrl(cleanId, onStep);
    let baseRegUrl = info.redirectUrl;
    let cookie = info.cookie;

    onStep && onStep("Initializing SAP Registration session…");
    let gRes = await proxy({ url: baseRegUrl, method: "GET", cookie });
    if (!gRes.ok || !gRes.body || gRes.body.includes("SAMLRequest")) {
      const retryInfo = await obtainStudentRegistrationUrl(cleanId, onStep);
      baseRegUrl = retryInfo.redirectUrl;
      cookie = retryInfo.cookie;
      gRes = await proxy({ url: baseRegUrl, method: "GET", cookie });
    }
    if (!gRes.ok || !gRes.body) throw new Error("Could not load SAP Registration page.");

    cookie = SAP.mergeCookies(cookie, gRes.setCookie);
    const htmlDec = SAP.decodeHtmlEntities(gRes.body);
    const ctxM = htmlDec.match(/sap-contextid=([^"&'\s>]+)/i);
    const secM =
      htmlDec.match(/name=["']sap-wd-secure-id["'][^>]*value=["']([^"']+)["']/i) ||
      htmlDec.match(/value=["']([^"']+)["'][^>]*name=["']sap-wd-secure-id["']/i);
    if (!ctxM || !secM) throw new Error("Could not extract Registration context ID.");

    const contextUrl = `${SAP.SAP_ORIGIN}/sap/bc/webdynpro/sap/zher_wa_registration?sap-contextid=${ctxM[1]}`;
    const secureId = decodeURIComponent(secM[1]);

    // Step 10: LoadingPlaceHolder_Load
    const phRes = await proxy({
      url: contextUrl,
      method: "POST",
      cookie,
      body: SAP.buildLoadingPlaceholderBody(secureId).replace(FESR, FESR_REG),
    });
    if (!phRes.ok || !phRes.body) throw new Error("Failed to initialize Registration screen.");
    cookie = SAP.mergeCookies(cookie, phRes.setCookie);
    let ctl = SAP.parseRegistrationControls(phRes.body, true);

    // Step 12: Select Target Teaching Centre
    const sapCentreKey = String(centreKey || "05001351").split("_")[0];
    const selCentreQueue =
      `ComboBox_Select~E002Id~E004${ctl.centreComboId}~E005Key~E004${sapCentreKey}~E005ByEnter~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
      `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`;
    const cRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, selCentreQueue) });
    if (cRes.ok && cRes.body) {
      cookie = SAP.mergeCookies(cookie, cRes.setCookie);
      ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(cRes.body));
    }

    // Step 13: Cancel Package Popup (WDAA) ONLY IF a package popup is open in SAP!
    // Some centres (e.g. New Cairo) do not open any bundle popup; sending a blind cancel causes SAP desync.
    const hasPackagePopup =
      Boolean(cRes.ok && cRes.body) &&
      (ctl.hasPackagePopup ||
        (/Bundle\s*selection|Package\s*selection/i.test(cRes.body) &&
          !/<control-update id="WDWL1_POP_CONT"><content><!\[CDATA\[<div id="WDWL1_POP_CONT"[^>]*><\/div>/i.test(cRes.body)));

    if (hasPackagePopup) {
      const cancelBtnId = ctl.cancelPopupBtn || "WDAA";
      const cancelQueue = SAP.buildButtonPressQueue(cancelBtnId);
      const canRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, cancelQueue) });
      if (canRes.ok && canRes.body) {
        cookie = SAP.mergeCookies(cookie, canRes.setCookie);
        ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(canRes.body));
      }
    }

    // Step 13b: Ensure active tab is "Registrations" (only if currently on "Header data" and booking button not present)
    if (
      (!ctl.addReservationItemId && !ctl.bookingBtnId) &&
      ctl.panelStackId &&
      ctl.registrationsTabPanelId
    ) {
      const regPanelId = ctl.registrationsTabPanelId || "WDCB";
      const switchToRegQueue =
        `PanelStack_Select~E002Id~E004${ctl.panelStackId}~E005PanelId~E004${regPanelId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
        `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`;
      const regTabRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, switchToRegQueue) });
      if (regTabRes.ok && regTabRes.body) {
        cookie = SAP.mergeCookies(cookie, regTabRes.setCookie);
        ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(regTabRes.body));
      }
    } else if ((!ctl.guardiansList || ctl.guardiansList.length === 0) && ctl.headerTabPanelId) {
      // Briefly load "Header data" tab to discover student's Guardian / Related Person list, then switch back to "Registrations"
      const pstId = ctl.panelStackId || "WDBD";
      const hdrPanelId = ctl.headerTabPanelId || "WDC0";
      const regPanelId = ctl.registrationsTabPanelId || "WDCB";
      const switchToHdrQueue =
        `PanelStack_Select~E002Id~E004${pstId}~E005PanelId~E004${hdrPanelId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
        `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
      const hdrPeekRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, switchToHdrQueue) });
      if (hdrPeekRes.ok && hdrPeekRes.body) {
        cookie = SAP.mergeCookies(cookie, hdrPeekRes.setCookie);
        const hdrCtl = SAP.parseRegistrationControls(hdrPeekRes.body);
        if (hdrCtl.guardiansList && hdrCtl.guardiansList.length > 0) {
          ctl.guardiansList = hdrCtl.guardiansList;
        }
      }
      const backToRegQueue =
        `PanelStack_Select~E002Id~E004${pstId}~E005PanelId~E004${regPanelId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
        `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
      const regBackRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, backToRegQueue) });
      if (regBackRes.ok && regBackRes.body) {
        cookie = SAP.mergeCookies(cookie, regBackRes.setCookie);
        ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(regBackRes.body));
      }
    }

    // Step 14: Click "Add reservation" (WDE6 / WD0249 / WDA6) or "Add waitlist booking" (WDE7 / WD024A / WDA7)
    const itemId = bookingAction === "waitlist" ? (ctl.addWaitlistItemId || "WDE7") : (ctl.addReservationItemId || "WDE6");
    const popupId = ctl.bookingPopupId || (ctl.bookingBtnId ? SAP.stepHexId(ctl.bookingBtnId, 4) : "WDE9");
    const bookingBtnId = ctl.bookingBtnId || (ctl.addReservationItemId ? SAP.stepHexId(ctl.addReservationItemId, -1) : "WDE5");
    const addResQueue =
      `PopupMenu_Select~E002Id~E004${popupId}~E005ItemId~E004${itemId}~E005ConnectedControlId~E004${bookingBtnId}~E005Checked~E004false~E005UserData~E004~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
      `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`;
    const popRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, addResQueue) });
    if (!popRes.ok || !popRes.body) throw new Error("Could not open Course Search popup in SAP.");
    cookie = SAP.mergeCookies(cookie, popRes.setCookie);
    const popCtl = SAP.parseRegistrationControls(popRes.body);
    ctl = mergeRegControls(ctl, popCtl);
    if (ctl.guardiansList && ctl.guardiansList.length > 0) {
      lastGuardiansByStudent[cleanId] = ctl.guardiansList;
    }

    regSession = {
      studentId: cleanId,
      regUrl: baseRegUrl,
      contextUrl,
      secureId,
      cookie,
      centreKey: centreKey || "05001351",
      bookingAction,
      controls: ctl,
      popupOpen: true,
    };
    return regSession;
  }

  /**
   * Searches available classes in SAP Registration for a given student, branch (or all branches),
   * course code, year, event type, and level filter.
   */
  async function searchAvailableClasses({
    studentId,
    centreKey = "05001351",
    courseCode = "",
    year = "2026",
    eventType = "",
    subLevelFilter = "",
    bookingAction = "reservation",
    onStep,
  }) {
    const cleanId = String(studentId || "").padStart(10, "0");
    let rs = regSession;
    if (!rs || rs.studentId !== cleanId || rs.centreKey !== centreKey || !rs.popupOpen || rs.bookingAction !== bookingAction) {
      rs = await initRegistrationPopup({ studentId: cleanId, centreKey, bookingAction, onStep });
    }

    const ctl = rs.controls;
    onStep && onStep(`Searching SAP classes for ${courseCode || "selected course"} (${year})…`);

    const events = [];
    if (ctl.courseInputId) {
      events.push(
        `ComboBox_Change~E002Id~E004${ctl.courseInputId}~E005Value~E004${SAP.sapEscape(courseCode)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
      );
    }
    if (ctl.yearInputId) {
      events.push(
        `ComboBox_Change~E002Id~E004${ctl.yearInputId}~E005Value~E004${SAP.sapEscape(year || "2026")}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
      );
    }
    if (ctl.eventTypeInputId && eventType && !/^(New\s*)?\d{1,2}L/i.test(eventType)) {
      events.push(
        `ComboBox_Change~E002Id~E004${ctl.eventTypeInputId}~E005Value~E004${SAP.sapEscape(eventType)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
      );
    }
    if (ctl.classDescInputId) {
      const descVal = subLevelFilter ? `*${subLevelFilter}*` : "";
      events.push(
        `ComboBox_Change~E002Id~E004${ctl.classDescInputId}~E005Value~E004${SAP.sapEscape(descVal)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
      );
    }

    events.push(
      `Button_Press~E002Id~E004${ctl.searchBtnId || "WD0562"}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`,
      `Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`
    );

    let sRes = await proxy({
      url: rs.contextUrl,
      method: "POST",
      cookie: rs.cookie,
      body: postRegBody(rs.secureId, events.join("~E001")),
    });

    if (!sRes.ok || !sRes.body || sRes.body.includes("SAMLRequest") || sRes.sessionState === "RELEASED") {
      rs = await initRegistrationPopup({ studentId: cleanId, centreKey, bookingAction, onStep });
      sRes = await proxy({
        url: rs.contextUrl,
        method: "POST",
        cookie: rs.cookie,
        body: postRegBody(rs.secureId, events.join("~E001")),
      });
    }

    if (!sRes.ok || !sRes.body) throw new Error("Failed to search classes in SAP.");
    rs.cookie = SAP.mergeCookies(rs.cookie, sRes.setCookie);
    rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(sRes.body));

    const allClasses = SAP.parseRegistrationClasses(sRes.body).map((c) => ({ ...c, firstVisibleIndex: 0 }));
    const messages = SAP.parseSapMessages(sRes.body);

    // Accurately detect total row count from SAP Web Dynpro table (crc attribute e.g. crc="71")
    const crcMatch =
      (rs.controls.scheduleTableId ? sRes.body.match(new RegExp(`id="${rs.controls.scheduleTableId}"[^>]*crc="(\\d+)"`, "i")) : null) ||
      sRes.body.match(/id="(?:WD[0-9A-F]+)"[^>]+(?:ct="STCS"|ct="ST5"|ct="ST")[^>]*\scrc="(\d+)"/i) ||
      sRes.body.match(/crc="(\d+)"/i) ||
      sRes.body.match(/aria-rowcount="(\d+)"/i) ||
      sRes.body.match(/iContentRowCount="(\d+)"/i) ||
      sRes.body.match(/data-itemcount="(\d+)"/i);
    const totalRowCount = crcMatch ? parseInt(crcMatch[1], 10) : 0;
    const maxTarget = totalRowCount > 0 ? totalRowCount : 150;

    let didScroll = false;
    if (allClasses.length > 0 && (totalRowCount === 0 || allClasses.length < totalRowCount)) {
      const seenNames = new Set(allClasses.map((c) => `${c.className}|${c.startDate}`));
      // Step size MUST strictly match the visible viewport (usually 5 rows) so no months/rows in between are skipped!
      const windowStep = Math.max(Math.min(allClasses.length, 5), 5);
      for (let idx = windowStep; idx < maxTarget; idx += windowStep) {
        onStep && onStep(`Loading full yearly schedules from SAP (${allClasses.length} of ${totalRowCount || 'all'} classes)…`);
        const scrollQ =
          `SapTable_VerticalScroll~E002Id~E004${rs.controls.scheduleTableId || "WD0592"}~E005FirstVisibleItemIndex~E004${idx}~E005Action~E004DIRECT~E005CellId~E004~E005AccessType~E004SCROLLBAR~E005SelectionFollowFocus~E004false~E005Shift~E004false~E005Ctrl~E004false~E005Alt~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
        const scRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, scrollQ) });
        if (scRes.ok && scRes.body) {
          didScroll = true;
          rs.cookie = SAP.mergeCookies(rs.cookie, scRes.setCookie);
          rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(scRes.body));
          const moreClasses = SAP.parseRegistrationClasses(scRes.body);
          let addedCount = 0;
          moreClasses.forEach((mc) => {
            const k = `${mc.className}|${mc.startDate}`;
            if (!seenNames.has(k)) {
              seenNames.add(k);
              allClasses.push({ ...mc, firstVisibleIndex: idx });
              addedCount++;
            }
          });
          if (addedCount === 0 || (totalRowCount > 0 && allClasses.length >= totalRowCount)) {
            break;
          }
        } else {
          break;
        }
      }
      if (didScroll) {
        // Scroll back to top (index 0) so row indices 1..5 match immediate selection, and refresh top row IDs & okPopupBtn
        const topQ =
          `SapTable_VerticalScroll~E002Id~E004${rs.controls.scheduleTableId || "WD0592"}~E005FirstVisibleItemIndex~E0040~E005Action~E004DIRECT~E005CellId~E004~E005AccessType~E004SCROLLBAR~E005SelectionFollowFocus~E004false~E005Shift~E004false~E005Ctrl~E004false~E005Alt~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
        const topRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, topQ) });
        if (topRes.ok && topRes.body) {
          rs.cookie = SAP.mergeCookies(rs.cookie, topRes.setCookie);
          rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(topRes.body));
          const topClasses = SAP.parseRegistrationClasses(topRes.body);
          topClasses.forEach((tc) => {
            const existing = allClasses.find((c) => c.className === tc.className && (!tc.startDate || c.startDate === tc.startDate));
            if (existing) {
              existing.rowIndex = tc.rowIndex;
              existing.triggerCellId = tc.triggerCellId;
              existing.tableId = tc.tableId;
              existing.firstVisibleIndex = 0;
            }
          });
        }
      }
    }

    return {
      centreKey,
      courseCode,
      classes: allClasses,
      messages,
    };
  }

  /**
   * Searches across ALL 6 British Council Egypt Teaching Centres for the student's recommended level!
   */
  async function searchAllBranchesSchedules({ studentId, levelStr, isAdult = true, year = "2026", eventType = "", subLevelFilter = "", onBranchResult, onStep }) {
    const resultsByBranch = {};
    for (const centre of SAP.TEACHING_CENTRES) {
      const resolved = SAP.resolveSapCourseForLevel(centre.code, levelStr, isAdult);
      onStep && onStep(`Checking ${centre.shortName} (${resolved.courseCode})…`);
      try {
        const res = await searchAvailableClasses({
          studentId,
          centreKey: centre.key,
          courseCode: resolved.courseCode,
          year,
          eventType,
          subLevelFilter: subLevelFilter !== undefined && subLevelFilter !== "" ? subLevelFilter : resolved.subLevelFilter,
          onStep,
        });
        resultsByBranch[centre.key] = {
          centre,
          courseCode: resolved.courseCode,
          classes: res.classes || [],
          error: null,
        };
        onBranchResult && onBranchResult(centre.key, resultsByBranch[centre.key]);
      } catch (e) {
        resultsByBranch[centre.key] = {
          centre,
          courseCode: resolved.courseCode,
          classes: [],
          error: e.message,
        };
        onBranchResult && onBranchResult(centre.key, resultsByBranch[centre.key]);
      }
    }
    return resultsByBranch;
  }

  function extractClassSearchHint(className) {
    const s = String(className || "").trim();
    // 1. BCE Month pattern: e.g. "Sep26", "Jan26", "Oct26", "Mar 27", "Nov 26"
    const bceMonth = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{0,2}\b/i);
    if (bceMonth) return bceMonth[0].replace(/\s+/g, "");

    // 2. Beginner sub-level: e.g. "Beg A", "Beg B", "Beg C", "Beg D"
    const begMatch = s.match(/\b(Beg\s+[A-E])\b/i);
    if (begMatch) return begMatch[1];

    // 3. Early Years: Ducks or Owls
    if (/\bducks\b/i.test(s)) return "Ducks";
    if (/\bowls\b/i.test(s)) return "Owls";

    // Note: Do NOT return term tokens (T1..T11) or days as classDesc hints;
    // in SAP WebDynpro, terms/days belong to session or day columns, not class description!
    return "";
  }

  /**
   * Executes the booking in SAP (supports single class or multi-term/multi-class cart):
   * - Adds 1st class from Course Search popup -> Presses OK
   * - For any additional classes in classItems: clicks Add reservation/waitlist -> filters by class -> Selects row + Presses OK
   * - Checks ALL Terms & Conditions checkboxes (LIST_VIEW.TAC_FPM_CE) across all rows
   * - Adult: Presses Save
   * - Young Learner: Switches to Header data -> Selects Guardian -> Fills Collector Start/End Dates -> Presses Save
   * - Immediately exits ZHER_WA_REGISTRATION (presses Back) so SAP releases the EZ_COURSE_REG lock
   */
  async function bookClassInSap({
    studentId,
    centreKey,
    courseCode,
    year = "2026",
    eventType = "",
    subLevelFilter = "",
    classItem,
    classItems,
    bookingAction = "reservation",
    isAdult = true,
    guardianKey = "",
    collectorStartDate = "",
    collectorEndDate = "",
    onStep,
  }) {
    const cleanId = String(studentId || "").padStart(10, "0");
    const itemsToBook =
      Array.isArray(classItems) && classItems.length > 0
        ? classItems.slice()
        : classItem
          ? [classItem]
          : [];
    if (itemsToBook.length === 0) {
      throw new Error("No classes selected for booking.");
    }

    let firstItem = itemsToBook[0];
    let primaryCentreKey = firstItem._centreKey || centreKey;
    if (/\b(BSA|ALX)\b/i.test(firstItem.className || "") && !primaryCentreKey.startsWith("05001354")) {
      primaryCentreKey = "05001354";
    }
    const primaryCourseCode = firstItem._courseCode || courseCode;
    let rs = regSession;

    try {
      // Ensure we have an open Registration session for the student & branch of the first class
      if (!rs || rs.studentId !== cleanId || rs.centreKey !== primaryCentreKey || !rs.popupOpen || rs.bookingAction !== bookingAction) {
        rs = await initRegistrationPopup({
          studentId: cleanId,
          centreKey: primaryCentreKey,
          bookingAction,
          onStep,
        });
      }

      // Helper: Check all currently unchecked Terms & Conditions checkboxes (LIST_VIEW.TAC_FPM_CE) one by one
      // Checking T&C immediately after each class is added ensures Row 1 is checked while it is the active
      // row (with explicit LIST_VIEW.TAC_FPM_CE hint), and each subsequent row is checked with fresh WD IDs.
      const checkAllUncheckedTac = async (stepLabel) => {
        for (let guard = 0; guard < 8; guard++) {
          const unchecked = Array.isArray(rs.controls.uncheckedTacCheckboxIds)
            ? rs.controls.uncheckedTacCheckboxIds
            : [];
          if (unchecked.length === 0) break;
          const tacId = unchecked[0];
          onStep && onStep(stepLabel || "Accepting Terms & Conditions (T&C) in SAP…");
          const tacQueue =
            `CheckBox_Change~E002Id~E004${tacId}~E005Checked~E004true~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
            `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`;
          const tacRes = await proxy({
            url: rs.contextUrl,
            method: "POST",
            cookie: rs.cookie,
            body: postRegBody(rs.secureId, tacQueue),
          });
          if (!tacRes.ok || !tacRes.body) break;
          rs.cookie = SAP.mergeCookies(rs.cookie, tacRes.setCookie);
          const parsedTacCtl = SAP.parseRegistrationControls(tacRes.body);
          rs.controls = mergeRegControls(rs.controls, parsedTacCtl);
          // If delta update didn't re-list uncheckedTacCheckboxIds or kept the same ID, remove the one we just checked
          if (Array.isArray(rs.controls.uncheckedTacCheckboxIds)) {
            rs.controls.uncheckedTacCheckboxIds = rs.controls.uncheckedTacCheckboxIds.filter((id) => id !== tacId);
          } else {
            break;
          }
        }
      };

      // Unified loop: Add each selected class (1..N) to the Registration table (LIST_VIEW) and accept its T&C immediately
      for (let idx = 0; idx < itemsToBook.length; idx++) {
        const item = itemsToBook[idx];

        // 1. Determine exact course code for this specific item
        let itemCourseCode = item._courseCode;
        if (!itemCourseCode) {
          const centreObj = SAP.TEACHING_CENTRES.find((c) => c.key === (item._centreKey || rs.centreKey))
            || SAP.TEACHING_CENTRES.find((c) => c.key === rs.centreKey)
            || SAP.TEACHING_CENTRES[0];
          const branchPrefix = (centreObj && centreObj.code) || "AGU";

          const cls = item.className || "";
          const ppM = cls.match(/\b(?:PriPlus|Primary\s*Plus\s*)(\d)\b/i);
          const secM = cls.match(/\b(?:SecPlus|Secondary\s*Plus\s*)([A-C][12](?:\.[12])?)\b/i);
          const usM = cls.match(/\b(?:Upper\s*Sec(?:ondary)?|US\s*)([A-C][12](?:\.[12])?)\b/i);
          const pstM = cls.match(/\b(?:Starter|PSt)\s*([AB])\b/i);

          if (ppM) {
            itemCourseCode = `${branchPrefix}-PP${ppM[1]}`;
          } else if (secM) {
            itemCourseCode = `${branchPrefix}-S${secM[1].toUpperCase()}`;
          } else if (usM) {
            itemCourseCode = `${branchPrefix}-US${usM[1].toUpperCase()}`;
          } else if (pstM) {
            itemCourseCode = `${branchPrefix}-PSt${pstM[1].toUpperCase()}`;
          } else if (/\b(AD Beg|Beginner|Beg\s+[A-D])\b/i.test(cls)) {
            itemCourseCode = `${branchPrefix}-AD Beg`;
          } else if (/\b(?:BCE|British\s*Council\s*English|\d{1,2}L(?:\s*\/\s*\d{1,2}M)?)\b/i.test(cls)) {
            itemCourseCode = `${branchPrefix}-BCE`;
          } else if (/\bIELTS\b/i.test(cls)) {
            itemCourseCode = `${branchPrefix}-IELTS`;
          } else if (/\b(Owls|EY3)\b/i.test(cls)) {
            itemCourseCode = `${branchPrefix}-EY3`;
          } else if (/\b(Ducks|EY2)\b/i.test(cls)) {
            itemCourseCode = `${branchPrefix}-EY2`;
          } else if (/\b(EY1)\b/i.test(cls)) {
            itemCourseCode = `${branchPrefix}-EY1`;
          } else {
            itemCourseCode = primaryCourseCode;
          }
        }

        // 2. Determine exact year for this specific item from its start date!
        const itemStartDateYear = (item.startDate && item.startDate.match(/\b(20\d{2})\b/)?.[1])
          || (item.start && item.start.match(/\b(20\d{2})\b/)?.[1]);
        const itemYear = itemStartDateYear || item.year || year || "2026";

        // For 2nd+ classes (or if popup is closed), click "Add reservation" / "Add waitlist booking" to open WDWL1 popup
        if (idx > 0 || !rs.popupOpen) {
          onStep && onStep(`Opening Course Search for class ${idx + 1} of ${itemsToBook.length}: "${item.className}"…`);
          const menuActionItemId =
            bookingAction === "waitlist"
              ? (rs.controls.addWaitlistItemId || "WDE7")
              : (rs.controls.addReservationItemId || "WDE6");
          const bookingBtnId =
            rs.controls.bookingBtnId ||
            (rs.controls.addReservationItemId ? SAP.stepHexId(rs.controls.addReservationItemId, -1) : "WDE5");
          const popupId =
            rs.controls.bookingPopupId ||
            (bookingBtnId ? SAP.stepHexId(bookingBtnId, 4) : "WDE9");

          const reopenPopupQ =
            `PopupMenu_Select~E002Id~E004${popupId}~E005ItemId~E004${menuActionItemId}~E005ConnectedControlId~E004${bookingBtnId}~E005Checked~E004false~E005UserData~E004~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
            `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~0040~007B~0022sFocussedId~0022~003A~0022${bookingBtnId}~0022~007D~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`;
          let popRes = await proxy({
            url: rs.contextUrl,
            method: "POST",
            cookie: rs.cookie,
            body: postRegBody(rs.secureId, reopenPopupQ),
          });

          // If first attempt failed or popup not open, check if popup was already open or retry after short delay
          const popupOpened = popRes.ok && popRes.body && /<div[^>]*\bct="PW"[^>]*id="WDWL1"/i.test(popRes.body);
          if (!popupOpened && popRes.ok && popRes.body) {
            await new Promise((r) => setTimeout(r, 600));
            popRes = await proxy({
              url: rs.contextUrl,
              method: "POST",
              cookie: rs.cookie,
              body: postRegBody(rs.secureId, reopenPopupQ),
            });
          }

          if (!popRes.ok || !popRes.body) {
            const errDetail = (popRes && (popRes.error || popRes.status)) ? ` (${popRes.error || popRes.status})` : "";
            throw new Error(`Could not open Course Search popup for class #${idx + 1} (${item.className})${errDetail}.`);
          }
          const popMsgs = SAP.parseSapMessages(popRes.body);
          if (popMsgs.some((m) => m.type === "ERROR")) {
            await releaseRegistrationSession(onStep);
            return {
              ok: false,
              messages: popMsgs,
              classItem: item,
              classItems: itemsToBook,
            };
          }
          rs.cookie = SAP.mergeCookies(rs.cookie, popRes.setCookie);
          rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(popRes.body));
          rs.popupOpen = true;
        }

        // Filter open popup by smart class hint (e.g. *Sep26*, *Jan26*, *Beg B*, *T1*) so target class is at rowIndex=1
        const curCtl = rs.controls;
        onStep && onStep(
          itemsToBook.length > 1
            ? `Locating & adding class ${idx + 1} of ${itemsToBook.length}: "${item.className}"…`
            : `Selecting class "${item.className}" & adding to registration…`
        );
        const searchEvents = [];
        if (curCtl.courseInputId && itemCourseCode) {
          searchEvents.push(
            `ComboBox_Change~E002Id~E004${curCtl.courseInputId}~E005Value~E004${SAP.sapEscape(itemCourseCode)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
          );
        }
        if (curCtl.yearInputId) {
          searchEvents.push(
            `ComboBox_Change~E002Id~E004${curCtl.yearInputId}~E005Value~E004${SAP.sapEscape(itemYear)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
          );
        }
        if (curCtl.eventTypeInputId && item.eventType && !/^(?:New\s*)?\d{1,2}L/i.test(item.eventType)) {
          searchEvents.push(
            `ComboBox_Change~E002Id~E004${curCtl.eventTypeInputId}~E005Value~E004${SAP.sapEscape(item.eventType)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
          );
        }
        if (curCtl.classDescInputId) {
          let descVal = "";
          const hint = extractClassSearchHint(item.className);
          if (hint) {
            descVal = `*${hint}*`;
          } else if (item.subLevelFilter && !/^(?:T\d+|Sat|Sun|Mon|Tue|Wed|Thu|Fri)/i.test(item.subLevelFilter)) {
            descVal = `*${item.subLevelFilter}*`;
          }
          searchEvents.push(
            `ComboBox_Change~E002Id~E004${curCtl.classDescInputId}~E005Value~E004${SAP.sapEscape(descVal)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
          );
        }
        searchEvents.push(
          `Button_Press~E002Id~E004${curCtl.searchBtnId || "WD0562"}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`,
          `Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`
        );

        let fRes = await proxy({
          url: rs.contextUrl,
          method: "POST",
          cookie: rs.cookie,
          body: postRegBody(rs.secureId, searchEvents.join("~E001")),
        });

        // If session expired or request failed, re-open popup and retry once
        if (!fRes.ok || !fRes.body || fRes.body.includes("SAMLRequest") || fRes.sessionState === "RELEASED") {
          onStep && onStep("Reconnecting SAP registration session…");
          rs = await initRegistrationPopup({
            studentId: cleanId,
            centreKey: primaryCentreKey,
            bookingAction,
            onStep,
          });
          const retryCtl = rs.controls;
          const retrySearchEvents = [];
          if (retryCtl.courseInputId && itemCourseCode) {
            retrySearchEvents.push(
              `ComboBox_Change~E002Id~E004${retryCtl.courseInputId}~E005Value~E004${SAP.sapEscape(itemCourseCode)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
            );
          }
          if (retryCtl.yearInputId) {
            retrySearchEvents.push(
              `ComboBox_Change~E002Id~E004${retryCtl.yearInputId}~E005Value~E004${SAP.sapEscape(itemYear)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
            );
          }
          if (retryCtl.classDescInputId) {
            let descVal = "";
            const hint = extractClassSearchHint(item.className);
            if (hint) descVal = `*${hint}*`;
            retrySearchEvents.push(
              `ComboBox_Change~E002Id~E004${retryCtl.classDescInputId}~E005Value~E004${SAP.sapEscape(descVal)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
            );
          }
          retrySearchEvents.push(
            `Button_Press~E002Id~E004${retryCtl.searchBtnId || "WD0562"}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`,
            `Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`
          );
          fRes = await proxy({
            url: rs.contextUrl,
            method: "POST",
            cookie: rs.cookie,
            body: postRegBody(rs.secureId, retrySearchEvents.join("~E001")),
          });
        }

        if (!fRes.ok || !fRes.body) {
          const detail = (fRes && (fRes.error || fRes.status)) ? ` (${fRes.error || fRes.status})` : "";
          throw new Error(`Failed to locate class "${item.className}" in SAP${detail}.`);
        }
        rs.cookie = SAP.mergeCookies(rs.cookie, fRes.setCookie);
        rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(fRes.body));

        let fClasses = SAP.parseRegistrationClasses(fRes.body);

        const norm = (str) => String(str || "").replace(/[\s\-_/–—\(\)]+/g, "").toLowerCase();
        // Convert 12h AM/PM times into 24h before normalizing so e.g. "4:00 PM" matches "16:00"
        const normTime = (str) => {
          let s = String(str || "");
          s = s.replace(/(\d{1,2}):(\d{2})\s*(am|pm)/gi, (_, h, m, meridiem) => {
            let hour = parseInt(h, 10);
            if (/pm/i.test(meridiem) && hour < 12) hour += 12;
            if (/am/i.test(meridiem) && hour === 12) hour = 0;
            return `${String(hour).padStart(2, "0")}:${m}`;
          });
          return norm(s);
        };
        const cleanCore = (s) => normTime(s).replace(/^t\d+/g, "").replace(/t\d+$/g, "");
        const itemNorm = normTime(item.className);
        const itemCore = cleanCore(item.className);
        const itemStartDate = item.startDate || item.start || "";
        const itemEndDate = item.endDate || item.end || "";

        const findMatchedClass = (classes) => {
          if (!Array.isArray(classes) || classes.length === 0) return null;
          // 1. Exact normalized name (time/casing agnostic) + start date
          const exact = classes.find(
            (c) => normTime(c.className) === itemNorm && (!itemStartDate || c.startDate === itemStartDate)
          );
          if (exact) return exact;

          // 2. Core name match (ignoring T1..T11 prefix/suffix differences) + start date
          if (itemStartDate) {
            const coreMatch = classes.find(
              (c) => c.startDate === itemStartDate && (cleanCore(c.className) === itemCore || cleanCore(c.className).includes(itemCore) || itemCore.includes(cleanCore(c.className)))
            );
            if (coreMatch) return coreMatch;
          }

          // 3. Exact normalized name
          const nameMatch = classes.find((c) => normTime(c.className) === itemNorm || cleanCore(c.className) === itemCore);
          if (nameMatch) return nameMatch;

          // 4. Exact start date and end date span match (for monthly/term packages)
          if (itemStartDate && itemEndDate) {
            const dateSpanMatch = classes.find((c) => c.startDate === itemStartDate && c.endDate === itemEndDate);
            if (dateSpanMatch) return dateSpanMatch;
          }

          // 5. Start date + names contain each other
          if (itemStartDate) {
            const dateMatch = classes.find(
              (c) => c.startDate === itemStartDate && (norm(c.className).includes(norm(item.className)) || norm(item.className).includes(norm(c.className)))
            );
            if (dateMatch) return dateMatch;
          }
          return null;
        };

        let matchedClass = findMatchedClass(fClasses);

        // Fallback: If targeted hint returned 0 rows, clear classDesc filter and re-search to see all classes
        if (!matchedClass && fClasses.length === 0 && curCtl.classDescInputId) {
          const resetEvents = [
            `ComboBox_Change~E002Id~E004${curCtl.classDescInputId}~E005Value~E004~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`,
            `Button_Press~E002Id~E004${curCtl.searchBtnId || "WD0562"}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`,
            `Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`
          ];
          const resetRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, resetEvents.join("~E001")) });
          if (resetRes.ok && resetRes.body) {
            rs.cookie = SAP.mergeCookies(rs.cookie, resetRes.setCookie);
            rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(resetRes.body));
            fClasses = SAP.parseRegistrationClasses(resetRes.body);
            matchedClass = findMatchedClass(fClasses);
          }
        }

        // If target class is not within the visible rows, scroll SAP popup in steps of 5 until found
        if (!matchedClass) {
          const scheduleTableId = rs.controls.scheduleTableId || "WD0592";
          const crcMatch = (fRes.body && fRes.body.match(new RegExp(`id="${scheduleTableId}"[^>]*crc="(\\d+)"`, "i"))) ||
            (fRes.body && fRes.body.match(/crc="(\d+)"/i));
          const totalRowCount = crcMatch ? parseInt(crcMatch[1], 10) : 120;
          const maxTarget = totalRowCount > 0 ? totalRowCount : 120;

          const initialTarget = (typeof item.firstVisibleIndex === "number" && item.firstVisibleIndex > 0)
            ? item.firstVisibleIndex
            : null;

          const scrollIndicesToTry = [];
          if (initialTarget !== null) {
            scrollIndicesToTry.push(initialTarget);
          }
          for (let sIdx = 5; sIdx <= maxTarget; sIdx += 5) {
            if (sIdx !== initialTarget) {
              scrollIndicesToTry.push(sIdx);
            }
          }

          for (const scrollIdx of scrollIndicesToTry) {
            onStep && onStep(`Locating "${item.className}" in SAP popup (scrolling to row ${scrollIdx})…`);
            const scrollQ =
              `SapTable_VerticalScroll~E002Id~E004${scheduleTableId}~E005FirstVisibleItemIndex~E004${scrollIdx}~E005Action~E004DIRECT~E005CellId~E004~E005AccessType~E004SCROLLBAR~E005SelectionFollowFocus~E004false~E005Shift~E004false~E005Ctrl~E004false~E005Alt~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
              `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;

            const scRes = await proxy({
              url: rs.contextUrl,
              method: "POST",
              cookie: rs.cookie,
              body: postRegBody(rs.secureId, scrollQ),
            });

            if (scRes.ok && scRes.body) {
              rs.cookie = SAP.mergeCookies(rs.cookie, scRes.setCookie);
              rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(scRes.body));
              const scrolledClasses = SAP.parseRegistrationClasses(scRes.body);
              matchedClass = findMatchedClass(scrolledClasses);
              if (matchedClass) {
                break;
              }
              if (!scrolledClasses || scrolledClasses.length === 0) {
                break;
              }
            } else {
              break;
            }
          }
        }

        if (!matchedClass || !matchedClass.triggerCellId) {
          throw new Error(`Target class "${item.className}" could not be located in SAP schedule table.`);
        }

        const activeTableId = matchedClass.tableId || rs.controls.scheduleTableId || "WD0592";
        const okBtnId = rs.controls.okPopupBtn || "WD0FC3";
        const selectAndOkQueue =
          `SapTable_ClientRowSelect~E002Id~E004${activeTableId}~E005RowIndex~E004${matchedClass.rowIndex}~E005RowUserData~E004~E005CellUserData~E004~E005AccessType~E004STANDARD~E005TriggerCellId~E004${matchedClass.triggerCellId}~E005TriggerAction~E004MOUSE~E003~E002ResponseData~E004delta~E003~E002~E003` +
          `~E001Button_Press~E002Id~E004${okBtnId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`;

        let okRes = await proxy({
          url: rs.contextUrl,
          method: "POST",
          cookie: rs.cookie,
          body: postRegBody(rs.secureId, selectAndOkQueue),
        });

        // Fallback: if popup remained open (no LIST_VIEW.TAC_FPM_CE in delta response), check for confirmation dialog or press the newly returned okPopupBtn
        for (let okRetry = 0; okRetry < 3; okRetry++) {
          const popupStillOpen = okRes.body && (!/LIST_VIEW\.TAC_FPM_CE/i.test(okRes.body) && /<div[^>]*\bct="PW"[^>]*id="WDWL1"/i.test(okRes.body));
          if (okRes.ok && okRes.body && popupStillOpen && !/ERROR/i.test(okRes.body)) {
            rs.cookie = SAP.mergeCookies(rs.cookie, okRes.setCookie);
            const retryCtl = SAP.parseRegistrationControls(okRes.body);
            rs.controls = mergeRegControls(rs.controls, retryCtl);
            const retryOkBtn = retryCtl.okPopupBtn || rs.controls.okPopupBtn;
            if (retryOkBtn) {
              okRes = await proxy({
                url: rs.contextUrl,
                method: "POST",
                cookie: rs.cookie,
                body: postRegBody(rs.secureId, SAP.buildButtonPressQueue(retryOkBtn)),
              });
            } else {
              break;
            }
          } else {
            break;
          }
        }

        if (!okRes.ok || !okRes.body) {
          throw new Error(`Failed to add class "${item.className}" to registration table.`);
        }
        rs.cookie = SAP.mergeCookies(rs.cookie, okRes.setCookie);
        rs.popupOpen = false;

        const okMsgs = SAP.parseSapMessages(okRes.body);
        if (okMsgs.some((m) => m.type === "ERROR")) {
          await releaseRegistrationSession(onStep);
          return {
            ok: false,
            messages: okMsgs,
            classItem: item,
            classItems: itemsToBook,
          };
        }

        rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(okRes.body));

        // For multi-class bookings (row index >= 1), WebDynpro loads rows >= 2 as lazy spacer fragments
        // (bIsSpacerFragment="true"). Scroll / request the new row in the Registration table (LIST_VIEW)
        // so SAP renders its cells and its Terms & Conditions checkbox.
        const regTableId = rs.controls.regListTableId || "WD03FC";
        if (idx > 0 || rs.controls.hasSpacerFragment) {
          onStep && onStep(`Loading registration row ${idx + 1} for "${item.className}"…`);
          const scrollRegQueue =
            `SapTable_VerticalScroll~E002Id~E004${regTableId}~E005FirstVisibleItemIndex~E004${idx}~E005Action~E004DIRECT~E005CellId~E004~E005AccessType~E004SCROLLBAR~E005SelectionFollowFocus~E004false~E005Shift~E004false~E005Ctrl~E004false~E005Alt~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
            `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
          const sRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, scrollRegQueue) });
          if (sRes.ok && sRes.body) {
            rs.cookie = SAP.mergeCookies(rs.cookie, sRes.setCookie);
            rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(sRes.body));
          }

          // If still a spacer fragment or uncheckedTacCheckboxIds is empty, request the fragment directly
          if (rs.controls.hasSpacerFragment && (!rs.controls.uncheckedTacCheckboxIds || rs.controls.uncheckedTacCheckboxIds.length === 0)) {
            const rowCount = rs.controls.regRowCount || (idx + 1);
            const reqDataQ =
              `SapTableCS_TableResize~E002Id~E004${regTableId}~E005VisibleContentRowCount~E004${rowCount}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E003~E002~E003` +
              `~E001SapTableCS_RequestData~E002Id~E004${regTableId}~E005DataFragments~E004${idx}~002C${rowCount}~003B~E005FirstVisibleContentRowIndex~E0040~E005VisibleContentRowCount~E004${rowCount}~E003~E002ResponseData~E004delta~E005ClientAction~E004submitAsync~E003~E002~E003` +
              `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004true~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
            const reqRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, reqDataQ) });
            if (reqRes.ok && reqRes.body) {
              rs.cookie = SAP.mergeCookies(rs.cookie, reqRes.setCookie);
              rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(reqRes.body));
            }
          }
        }

        // Immediately accept Terms & Conditions (T&C) for the newly added class row!
        await checkAllUncheckedTac(
          itemsToBook.length > 1
            ? `Accepting Terms & Conditions for class ${idx + 1} of ${itemsToBook.length} (${item.className})…`
            : "Accepting Terms & Conditions (T&C) in SAP…"
        );
      }

      // After adding and checking all classes, if multiple items were added, scroll back to top and do a final sweep
      if (itemsToBook.length > 1) {
        const regTableId = rs.controls.regListTableId || "WD03FC";
        const topScrollQ =
          `SapTable_VerticalScroll~E002Id~E004${regTableId}~E005FirstVisibleItemIndex~E0040~E005Action~E004DIRECT~E005CellId~E004~E005AccessType~E004SCROLLBAR~E005SelectionFollowFocus~E004false~E005Shift~E004false~E005Ctrl~E004false~E005Alt~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
        const topRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, topScrollQ) });
        if (topRes.ok && topRes.body) {
          rs.cookie = SAP.mergeCookies(rs.cookie, topRes.setCookie);
          rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(topRes.body));
        }
        await checkAllUncheckedTac("Ensuring all Terms & Conditions (T&C) are accepted…");
      }

      // Compute earliest start date across all selected classes for Collector validity
      const sortedStarts = itemsToBook
        .map((c) => c.startDate)
        .filter(Boolean)
        .sort((a, b) => (SAP.parseSapDateToNum(a) || 99999999) - (SAP.parseSapDateToNum(b) || 99999999));
      const earliestStart = sortedStarts[0] || firstItem.startDate || "01.05.2026";

      // Helper for Young Learner Header Data (Guardian + Collector Start/End Dates + Save)
      const applyYoungLearnerCollectorAndSave = async () => {
        onStep && onStep("Switching to Header data tab for Young Learner Guardian & Collector dates…");
        // Clear any stale control IDs so we use fresh IDs discovered from Header data
        rs.controls.guardianComboId = null;
        rs.controls.addCollectorBtnId = null;
        rs.controls.collectorStartInputId = null;
        rs.controls.collectorEndInputId = null;

        const panelStackId = rs.controls.panelStackId || "WDBD";
        const headerPanelId = rs.controls.headerTabPanelId || "WDC0";
        const headerTabQueue =
          `PanelStack_Select~E002Id~E004${panelStackId}~E005PanelId~E004${headerPanelId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
        const hdrRes = await proxy({
          url: rs.contextUrl,
          method: "POST",
          cookie: rs.cookie,
          body: postRegBody(rs.secureId, headerTabQueue),
        });
        if (hdrRes.ok && hdrRes.body) {
          rs.cookie = SAP.mergeCookies(rs.cookie, hdrRes.setCookie);
          rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(hdrRes.body));
          if (rs.controls.guardiansList && rs.controls.guardiansList.length > 0) {
            lastGuardiansByStudent[cleanId] = rs.controls.guardiansList;
          }
        }

        // Select Guardian / Related Person (e.g. WD0C96 / WD0D0F / WD1106 / WD0301 / WD1467)
        const gComboId = rs.controls.guardianComboId || "WD0C96";
        const guardians = rs.controls.guardiansList || lastGuardiansByStudent[cleanId] || [];
        const validPassedKey =
          guardianKey &&
            !/^(?:0500|1000)\d*$/.test(guardianKey) &&
            (guardians.length === 0 || guardians.some((g) => g.key === guardianKey))
            ? guardianKey
            : "";
        const chosenGuardianKey = validPassedKey || (guardians[0] && guardians[0].key) || "";
        const chosenGuardianName = (guardians.find((g) => g.key === chosenGuardianKey) || guardians[0] || {}).name || chosenGuardianKey;

        if (chosenGuardianKey && gComboId) {
          onStep && onStep(`Selecting Guardian (${chosenGuardianName}) in SAP…`);
          const grdQueue =
            `ComboBox_Select~E002Id~E004${gComboId}~E005Key~E004${SAP.sapEscape(chosenGuardianKey)}~E005ByEnter~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
            `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
          const grdRes = await proxy({
            url: rs.contextUrl,
            method: "POST",
            cookie: rs.cookie,
            body: postRegBody(rs.secureId, grdQueue),
          });
          if (grdRes.ok && grdRes.body) {
            rs.cookie = SAP.mergeCookies(rs.cookie, grdRes.setCookie);
            rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(grdRes.body));
          }
        }

        // Step B: Add Collector to Contacts Table (only if selecting Guardian did not auto-populate the collector row)
        let startInputId = rs.controls.collectorStartInputId;
        let endInputId = rs.controls.collectorEndInputId;
        const addCollectorBtn = rs.controls.addCollectorBtnId;

        if (!startInputId && !endInputId && addCollectorBtn) {
          onStep && onStep("Adding Collector to contacts table in SAP…");
          const addQueue = SAP.buildButtonPressQueue(addCollectorBtn);
          const addRes = await proxy({
            url: rs.contextUrl,
            method: "POST",
            cookie: rs.cookie,
            body: postRegBody(rs.secureId, addQueue),
          });
          if (addRes.ok && addRes.body) {
            rs.cookie = SAP.mergeCookies(rs.cookie, addRes.setCookie);
            rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(addRes.body));
            startInputId = rs.controls.collectorStartInputId;
            endInputId = rs.controls.collectorEndInputId;

            // Extra fallback: scan all newly rendered ct="I" date fields from delta update
            if (!startInputId || !endInputId) {
              const deltaInputs = Array.from(
                addRes.body.matchAll(/<(?:input|span)\b[^>]*?\bid="(WD[0-9A-F]+)"[^>]*?\bct="I"[^>]*>|<(?:input|span)\b[^>]*?\bct="I"[^>]*?\bid="(WD[0-9A-F]+)"[^>]*>/gi)
              )
                .map((m) => m[1] || m[2])
                .filter(Boolean);
              if (deltaInputs.length >= 2) {
                if (!startInputId) startInputId = deltaInputs[0];
                if (!endInputId) endInputId = deltaInputs[1];
              } else if (deltaInputs.length === 1) {
                if (!startInputId) startInputId = deltaInputs[0];
                if (!endInputId) endInputId = SAP.stepHexId(deltaInputs[0], 2);
              }
            }
          }
        }

        // Fill Collector Valid From (Start Date) & Valid To (End Date) + Press Save
        const startVal = collectorStartDate || earliestStart;
        const endVal = collectorEndDate || SAP.addOneYearToSapDate(startVal) || firstItem.endDate || "01.05.2027";
        const finalStartId = startInputId || rs.controls.collectorStartInputId;
        const finalEndId = endInputId || rs.controls.collectorEndInputId || (finalStartId ? SAP.stepHexId(finalStartId, 2) : null);
        const saveBtnId = rs.controls.saveBtn || "WD0285";

        onStep && onStep(`Setting Collector dates (${startVal} → ${endVal}) & Saving in SAP…`);
        const datesAndSaveEvents = [];
        if (finalStartId) {
          datesAndSaveEvents.push(
            `InputField_Change~E002Id~E004${finalStartId}~E005Value~E004${SAP.sapEscape(startVal)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
          );
        }
        if (finalEndId) {
          datesAndSaveEvents.push(
            `InputField_Change~E002Id~E004${finalEndId}~E005Value~E004${SAP.sapEscape(endVal)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
          );
        }
        datesAndSaveEvents.push(
          `Button_Press~E002Id~E004${saveBtnId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`
        );
        datesAndSaveEvents.push(
          `Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`
        );

        const ySaveRes = await proxy({
          url: rs.contextUrl,
          method: "POST",
          cookie: rs.cookie,
          body: postRegBody(rs.secureId, datesAndSaveEvents.join("~E001")),
        });
        if (!ySaveRes.ok || !ySaveRes.body) throw new Error("Failed to save Young Learner booking in SAP.");
        rs.cookie = SAP.mergeCookies(rs.cookie, ySaveRes.setCookie);
        rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(ySaveRes.body));

        // Switch PanelStack back to Registrations tab so SAP doesn't remember Header data on next open
        const regPanelId = rs.controls.registrationsTabPanelId || "WDCB";
        const backToRegQ =
          `PanelStack_Select~E002Id~E004${panelStackId}~E005PanelId~E004${regPanelId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
        const backTabRes = await proxy({
          url: rs.contextUrl,
          method: "POST",
          cookie: rs.cookie,
          body: postRegBody(rs.secureId, backToRegQ),
        }).catch(() => null);
        if (backTabRes && backTabRes.ok && backTabRes.body) {
          rs.cookie = SAP.mergeCookies(rs.cookie, backTabRes.setCookie);
          rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(backTabRes.body));
        }

        return ySaveRes;
      };

      let finalSaveRes;
      if (!isAdult) {
        finalSaveRes = await applyYoungLearnerCollectorAndSave();
      } else {
        // Adult: Press Save directly (e.g. WD022F / WD0285 / WD025F)
        const saveBtnId = rs.controls.saveBtn || "WD025F";
        onStep && onStep("Saving booking in SAP…");
        const saveQueue = SAP.buildButtonPressQueue(saveBtnId);
        finalSaveRes = await proxy({
          url: rs.contextUrl,
          method: "POST",
          cookie: rs.cookie,
          body: postRegBody(rs.secureId, saveQueue),
        });
        if (!finalSaveRes.ok || !finalSaveRes.body) throw new Error("Failed to save booking in SAP.");
        rs.cookie = SAP.mergeCookies(rs.cookie, finalSaveRes.setCookie);
        rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(finalSaveRes.body));

        // Fallback: if SAP warns that a collector/related person is required, automatically run the YL collector flow!
        const initialMsgs = SAP.parseSapMessages(finalSaveRes.body);
        const needsCollector = initialMsgs.some((m) => /collector|related person/i.test(m.text));
        if (needsCollector) {
          finalSaveRes = await applyYoungLearnerCollectorAndSave();
        }
      }

      const messages = SAP.parseSapMessages(finalSaveRes.body);
      const hasError = messages.some((m) => m.type === "ERROR");

      // Immediately release the SAP Registration session (press Back) so EZ_COURSE_REG is unlocked!
      await releaseRegistrationSession(onStep);

      return {
        ok: !hasError,
        messages,
        classItem: firstItem,
        classItems: itemsToBook,
      };
    } catch (err) {
      await releaseRegistrationSession().catch(() => { });
      throw err;
    }
  }

  global.SapService = {
    getCookie, setCookie, hasCookie, fetchServerSyncedCookie, detectQuery, connect, testAndSave, search, openStudent,
    searchAvailableClasses, searchAllBranchesSchedules, bookClassInSap, releaseRegistrationSession,
    getCachedGuardians: (studentId) =>
      (regSession && regSession.controls && regSession.controls.guardiansList) ||
      (studentId ? lastGuardiansByStudent[String(studentId).padStart(10, "0")] : Object.values(lastGuardiansByStudent)[0]) ||
      [],
    reset: () => { session = null; regSession = null; },
    isConnected: () => !!session,
    isExtensionBridgeActive: () => extensionBridgeAvailable,
    pingExtensionBridge: () => pingExtensionBridge(350),
  };
})(window);
