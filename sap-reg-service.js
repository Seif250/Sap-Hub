// ============================================================================
// SAP Live Registration, Schedule Search & Booking Engine (ZHER_WA_REGISTRATION)
// Extends window.SapService with schedule search, cart booking & lock release
// ============================================================================
(function (global) {
  const SAP = global.SAPClient;
  const {
    FESR,
    withSapLock,
    proxy,
    postBody,
    mergeRegControls,
    ensureSearchScreen,
    connect,
    runSearch,
    vdom,
    getSession,
    clearSession,
  } = global.SapService._internal;
  // ==========================================================================
  // Live Registration & Class Schedule Engine (ZHER_WA_REGISTRATION)
  // ==========================================================================
  const FESR_REG = "fesrAppName=ZHER_WA_REGISTRATION~ZHER_AC_REGISTRATION&fesrUseBeacon=true";
  const postRegBody = (secureId, queue) =>
    `sap-charset=utf-8&sap-wd-secure-id=${encodeURIComponent(secureId)}&${FESR_REG}&SAPEVENTQUEUE=${queue}`;

  let regSession = null; // { studentId, regUrl, contextUrl, secureId, cookie, centreKey, controls, popupOpen }
  let lastGuardiansByStudent = {};

  /**
   * Extracts total row count (crc / aria-rowcount / iContentRowCount) specifically for the
   * popup schedule table (V_LIST), ignoring background LIST_VIEW row counts.
   */
  function extractScheduleRowCount(xmlBody, scheduleTableId) {
    if (!xmlBody) return null;
    if (scheduleTableId) {
      const escId = scheduleTableId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mId =
        xmlBody.match(new RegExp(`id="${escId}"[^>]*\\bcrc="(\\d+)"`, "i")) ||
        xmlBody.match(new RegExp(`\\bcrc="(\\d+)"[^>]*id="${escId}"`, "i"));
      if (mId) return parseInt(mId[1], 10);
    }
    const vListM =
      xmlBody.match(/V_LIST\.DYNAMIC_TABLE[^>]*\bcrc="(\d+)"/i) ||
      xmlBody.match(/\bcrc="(\d+)"[^>]*V_LIST\.DYNAMIC_TABLE/i);
    if (vListM) return parseInt(vListM[1], 10);

    const crcRe = /<table\b[^>]*\bcrc="(\d+)"[^>]*>/gi;
    let m;
    while ((m = crcRe.exec(xmlBody)) !== null) {
      if (!/LIST_VIEW\.(?:DYNAMIC_TABLE|TAC_FPM_CE)/i.test(m[0])) {
        return parseInt(m[1], 10);
      }
    }
    const fallbackM =
      xmlBody.match(/aria-rowcount="(\d+)"/i) ||
      xmlBody.match(/iContentRowCount="(\d+)"/i) ||
      xmlBody.match(/data-itemcount="(\d+)"/i);
    return fallbackM ? parseInt(fallbackM[1], 10) : null;
  }

  function buildPopupSearchEvents(ctl, { courseCode = "", year = "", classDesc = undefined } = {}) {
    const events = [];
    if (ctl.courseInputId && courseCode) {
      events.push(
        `ComboBox_Change~E002Id~E004${ctl.courseInputId}~E005Value~E004${SAP.sapEscape(courseCode)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
      );
    }
    if (ctl.yearInputId && year) {
      events.push(
        `ComboBox_Change~E002Id~E004${ctl.yearInputId}~E005Value~E004${SAP.sapEscape(year)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
      );
    }
    if (ctl.classDescInputId && classDesc !== undefined) {
      events.push(
        `ComboBox_Change~E002Id~E004${ctl.classDescInputId}~E005Value~E004${SAP.sapEscape(classDesc)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
      );
    }
    events.push(
      `Button_Press~E002Id~E004${ctl.searchBtnId || "WD0562"}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`,
      `Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`
    );
    return events;
  }

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

      // Fast path: reuse currently open student DETAIL or HISTORY session (~2-3s faster!)
      const curSess = getSession && getSession();
      if (
        curSess &&
        curSess.contextUrl &&
        curSess.secureId &&
        curSess.currentStudentId === cleanId &&
        (curSess.screen === "DETAIL" || curSess.screen === "HISTORY")
      ) {
        try {
          let activeSess = curSess;
          if (activeSess.screen === "HISTORY" && activeSess.backFromHistoryBtn) {
            onStep && onStep("Returning to SAP Student Detail…");
            const bhRes = await proxy({
              url: activeSess.contextUrl,
              method: "POST",
              cookie: activeSess.cookie,
              body: postBody(activeSess.secureId, SAP.buildButtonPressQueue(activeSess.backFromHistoryBtn)),
            });
            if (bhRes.ok && bhRes.body && !bhRes.body.includes("SAMLRequest") && bhRes.sessionState !== "RELEASED") {
              activeSess.cookie = SAP.mergeCookies(activeSess.cookie, bhRes.setCookie);
              SAP.applySapDeltaUpdates(bhRes.body, vdom);
              const detFast = SAP.parseStudentDetailScreen(vdom, bhRes.body);
              activeSess.registrationBtn = (detFast.menuIds && detFast.menuIds.registrationBtn) || activeSess.registrationBtn;
              activeSess.backToSearchBtn = (detFast.menuIds && detFast.menuIds.backToSearchBtn) || activeSess.backToSearchBtn;
              activeSess.screen = "DETAIL";
            } else {
              activeSess = null;
            }
          }
          if (activeSess && activeSess.screen === "DETAIL" && activeSess.registrationBtn) {
            onStep && onStep("Opening SAP Registration portal…");
            const fastRegClick = await proxy({
              url: activeSess.contextUrl,
              method: "POST",
              cookie: activeSess.cookie,
              body: postBody(activeSess.secureId, SAP.buildButtonPressQueue(activeSess.registrationBtn)),
            });
            if (fastRegClick.ok && fastRegClick.body && !fastRegClick.body.includes("SAMLRequest") && fastRegClick.sessionState !== "RELEASED") {
              const fastUnesc = String(fastRegClick.body)
                .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
              const fastUrlM = fastUnesc.match(/"url"\s*:\s*"([^"]+)"/i);
              if (fastUrlM) {
                clearSession();
                let redirectUrl = fastUrlM[1];
                if (redirectUrl.startsWith("/")) redirectUrl = `${SAP.SAP_ORIGIN}${redirectUrl}`;
                return { redirectUrl, cookie: SAP.mergeCookies(activeSess.cookie, fastRegClick.setCookie) };
              }
            }
          }
        } catch (fastErr) {
          // Fall through cleanly to standard search flow
        }
      }

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
      clearSession();

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

  async function initRegistrationPopup({ studentId, centreKey, bookingAction = "reservation", isAdult = null, onStep }) {
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

    // Reuse cached guardians for this student immediately if already discovered (saves 2 SAP round-trips!)
    if (lastGuardiansByStudent[cleanId] && lastGuardiansByStudent[cleanId].length > 0) {
      ctl.guardiansList = lastGuardiansByStudent[cleanId];
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
    } else if (isAdult === false && (!ctl.guardiansList || ctl.guardiansList.length === 0) && ctl.headerTabPanelId) {
      // Only peek at "Header data" tab for Young Learners when guardians are not yet cached
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
   * Fast in-place branch/action switch on an existing ZHER_WA_REGISTRATION session (~0.6s instead of ~5s).
   * Falls back to initRegistrationPopup if the session is released or stale.
   */
  async function ensureRegistrationPopup({ studentId, centreKey = "05001351", bookingAction = "reservation", isAdult = null, onStep }) {
    const cleanId = String(studentId || "").padStart(10, "0");
    let rs = regSession;
    if (rs && rs.studentId === cleanId && rs.centreKey === centreKey && rs.popupOpen && rs.bookingAction === bookingAction) {
      return rs;
    }
    if (rs && rs.studentId === cleanId && rs.contextUrl && rs.secureId) {
      try {
        onStep && onStep("Switching branch / mode in active SAP Registration session…");
        let ctl = rs.controls;
        let cookie = rs.cookie;
        const sapCentreKey = String(centreKey || "05001351").split("_")[0];
        const curSapCentreKey = String(rs.centreKey || "").split("_")[0];

        // 1. Close popup (if open) and change centre (if changed) in one request
        const step1Events = [];
        if (rs.popupOpen) {
          step1Events.push(`PopupWindow_Close~E002Id~E004WDWL1~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`);
        }
        if (sapCentreKey !== curSapCentreKey) {
          step1Events.push(
            `ComboBox_Select~E002Id~E004${ctl.centreComboId || "WD62"}~E005Key~E004${sapCentreKey}~E005ByEnter~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`
          );
        }
        if (step1Events.length > 0) {
          step1Events.push(
            `Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`
          );
          const s1Res = await proxy({
            url: rs.contextUrl,
            method: "POST",
            cookie,
            body: postRegBody(rs.secureId, step1Events.join("~E001")),
          });
          if (!s1Res.ok || !s1Res.body || s1Res.body.includes("SAMLRequest") || s1Res.sessionState === "RELEASED") {
            throw new Error("Session released");
          }
          cookie = SAP.mergeCookies(cookie, s1Res.setCookie);
          ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(s1Res.body));
          rs.popupOpen = false;

          const hasPkg =
            ctl.hasPackagePopup ||
            (/Bundle\s*selection|Package\s*selection/i.test(s1Res.body) &&
              !/<control-update id="WDWL1_POP_CONT"><content><!\[CDATA\[<div id="WDWL1_POP_CONT"[^>]*><\/div>/i.test(s1Res.body));
          if (hasPkg) {
            const canBtn = ctl.cancelPopupBtn || "WDAA";
            const canRes = await proxy({ url: rs.contextUrl, method: "POST", cookie, body: postRegBody(rs.secureId, SAP.buildButtonPressQueue(canBtn)) });
            if (canRes.ok && canRes.body) {
              cookie = SAP.mergeCookies(cookie, canRes.setCookie);
              ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(canRes.body));
            }
          }
        }

        // 2. Re-open Course Search popup for the target bookingAction
        const itemId = bookingAction === "waitlist" ? (ctl.addWaitlistItemId || "WDE7") : (ctl.addReservationItemId || "WDE6");
        const popupId = ctl.bookingPopupId || (ctl.bookingBtnId ? SAP.stepHexId(ctl.bookingBtnId, 4) : "WDE9");
        const bookingBtnId = ctl.bookingBtnId || (ctl.addReservationItemId ? SAP.stepHexId(ctl.addReservationItemId, -1) : "WDE5");
        const addResQueue =
          `PopupMenu_Select~E002Id~E004${popupId}~E005ItemId~E004${itemId}~E005ConnectedControlId~E004${bookingBtnId}~E005Checked~E004false~E005UserData~E004~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`;
        const popRes = await proxy({ url: rs.contextUrl, method: "POST", cookie, body: postRegBody(rs.secureId, addResQueue) });
        if (!popRes.ok || !popRes.body || !/<div[^>]*\bct="PW"[^>]*id="WDWL1"/i.test(popRes.body)) {
          throw new Error("Popup did not open");
        }
        cookie = SAP.mergeCookies(cookie, popRes.setCookie);
        const popCtl = SAP.parseRegistrationControls(popRes.body);
        if (!popCtl.searchBtnId && !popCtl.courseInputId && !popCtl.classDescInputId) {
          throw new Error("Popup controls did not refresh");
        }
        ctl = mergeRegControls(ctl, popCtl);
        regSession = {
          ...rs,
          cookie,
          centreKey: centreKey || "05001351",
          bookingAction,
          controls: ctl,
          popupOpen: true,
        };
        return regSession;
      } catch (e) {
        // Fallback to full init if fast switch couldn't complete
      }
    }
    return initRegistrationPopup({ studentId: cleanId, centreKey, bookingAction, isAdult, onStep });
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
    isAdult = null,
    onStep,
  }) {
    const cleanId = String(studentId || "").padStart(10, "0");
    const hadSessionBefore = Boolean(regSession);
    let rs = await ensureRegistrationPopup({ studentId: cleanId, centreKey, bookingAction, isAdult, onStep });

    const buildSearchQueueFor = (c) => {
      const evs = [];
      if (c.courseInputId) {
        evs.push(
          `ComboBox_Change~E002Id~E004${c.courseInputId}~E005Value~E004${SAP.sapEscape(courseCode)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
        );
      }
      if (c.yearInputId) {
        evs.push(
          `ComboBox_Change~E002Id~E004${c.yearInputId}~E005Value~E004${SAP.sapEscape(year || "2026")}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
        );
      }
      if (c.eventTypeInputId && eventType && !/^(New\s*)?\d{1,2}L/i.test(eventType)) {
        evs.push(
          `ComboBox_Change~E002Id~E004${c.eventTypeInputId}~E005Value~E004${SAP.sapEscape(eventType)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
        );
      }
      if (c.classDescInputId) {
        const descVal = subLevelFilter ? `*${subLevelFilter}*` : "";
        evs.push(
          `ComboBox_Change~E002Id~E004${c.classDescInputId}~E005Value~E004${SAP.sapEscape(descVal)}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
        );
      }
      evs.push(
        `Button_Press~E002Id~E004${c.searchBtnId || "WD0562"}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`,
        `Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`
      );
      return evs.join("~E001");
    };

    onStep && onStep(`Searching SAP classes for ${courseCode || "selected course"} (${year})…`);

    let sRes = await proxy({
      url: rs.contextUrl,
      method: "POST",
      cookie: rs.cookie,
      body: postRegBody(rs.secureId, buildSearchQueueFor(rs.controls)),
    });

    if (!sRes.ok || !sRes.body || sRes.body.includes("SAMLRequest") || sRes.sessionState === "RELEASED" || /id="WDWL2"/i.test(sRes.body)) {
      rs = await initRegistrationPopup({ studentId: cleanId, centreKey, bookingAction, isAdult, onStep });
      sRes = await proxy({
        url: rs.contextUrl,
        method: "POST",
        cookie: rs.cookie,
        body: postRegBody(rs.secureId, buildSearchQueueFor(rs.controls)),
      });
    }

    if (!sRes.ok || !sRes.body) throw new Error("Failed to search classes in SAP.");
    rs.cookie = SAP.mergeCookies(rs.cookie, sRes.setCookie);
    rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(sRes.body));

    let parsedInitial = SAP.parseRegistrationClasses(sRes.body);
    // Branch-mismatch guard: if cached session returned classes for a different branch (e.g. CTS instead of AGU), re-init fresh
    const expectedPrefix = (courseCode && courseCode.split("-")[0] || "").trim().toUpperCase();
    const hasBranchMismatch =
      hadSessionBefore &&
      parsedInitial.length > 0 &&
      expectedPrefix &&
      /^(AGU|CTS|OCT|HEL|AIS|ALX|KLS)$/i.test(expectedPrefix) &&
      parsedInitial.every((c) => {
        const cls = String(c.className || "").toUpperCase();
        const altPrefix = expectedPrefix === "AIS" ? "NCA" : expectedPrefix === "ALX" ? "BSA" : expectedPrefix;
        return /^(AGU|CTS|OCT|HEL|AIS|NCA|ALX|BSA|KLS)\b/.test(cls) &&
          !cls.startsWith(expectedPrefix) &&
          !cls.startsWith(altPrefix);
      });

    if (hasBranchMismatch) {
      onStep && onStep(`Refreshing SAP search session for ${expectedPrefix}…`);
      rs = await initRegistrationPopup({ studentId: cleanId, centreKey, bookingAction, isAdult, onStep });
      sRes = await proxy({
        url: rs.contextUrl,
        method: "POST",
        cookie: rs.cookie,
        body: postRegBody(rs.secureId, buildSearchQueueFor(rs.controls)),
      });
      if (!sRes.ok || !sRes.body) throw new Error("Failed to search classes in SAP.");
      rs.cookie = SAP.mergeCookies(rs.cookie, sRes.setCookie);
      rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(sRes.body));
      parsedInitial = SAP.parseRegistrationClasses(sRes.body);
    }

    const allClasses = parsedInitial.map((c) => ({ ...c, firstVisibleIndex: 0 }));
    const messages = SAP.parseSapMessages(sRes.body);

    // Accurately detect total row count from SAP Web Dynpro table (crc attribute e.g. crc="71")
    const parsedTotalCount = extractScheduleRowCount(sRes.body, rs.controls.scheduleTableId);
    const totalRowCount = parsedTotalCount !== null ? parsedTotalCount : 0;
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
          isAdult,
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

  function deduceCentreKeyFromClassOrBranch(className, fallbackKey) {
    const s = String(className || "").toUpperCase();
    if (/\b(BSA|ALX)\b/.test(s) || s.startsWith("BSA") || s.startsWith("ALX")) {
      return "05001354"; // Alex
    }
    if (/\bCTS\b/.test(s) || s.startsWith("CTS") || s.includes("CITYSTARS")) {
      return "05001353"; // CityStars
    }
    if (/\bOCT\b/.test(s) || s.startsWith("OCT") || s.includes("OCTOBER")) {
      return "05001355"; // 6th of October
    }
    if (/\bHEL\b/.test(s) || s.startsWith("HEL") || s.includes("HELIOPOLIS")) {
      return "05001352"; // Heliopolis
    }
    if (/\bAIS\b/.test(s) || s.startsWith("AIS") || s.includes("ASPIRE") || s.includes("NEW CAIRO")) {
      return "05001677"; // New Cairo
    }
    if (/\bAGU\b/.test(s) || s.startsWith("AGU") || s.includes("AGOUZA")) {
      return "05001351"; // Agouza
    }
    return fallbackKey || "05001351";
  }

  function extractClassSearchHint(className) {
    const s = String(className || "").trim();
    // 1. BCE Month pattern: e.g. "Sep", "Jan", "Oct", "Mar", "Nov"
    // Apply ONLY if class is BCE or British Council English
    if (/\b(?:BCE|British\s*Council\s*English|\d{1,2}L)\b/i.test(s)) {
      const bceMonth = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
      if (bceMonth) return bceMonth[1];
    }

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

  function deduceItemCourseSuffix(item) {
    if (item && item._courseCode) {
      const parts = item._courseCode.split("-");
      if (parts.length > 1) return parts.slice(1).join("-").trim();
    }
    const cls = String((item && item.className) || "");
    if (/\b(AD Beg|Beginner|Beg\s+[A-E])\b/i.test(cls)) return "AD Beg";
    if (/\b(?:BCE|British\s*Council\s*English|\d{1,2}L(?:\s*\/\s*\d{1,2}M)?)\b/i.test(cls)) return "BCE";
    if (/\bIELTS\b/i.test(cls)) return "IELTS";
    if (/\b(Owls|EY3)\b/i.test(cls)) return "EY3";
    if (/\b(Ducks|EY2)\b/i.test(cls)) return "EY2";
    if (/\bEY1\b/i.test(cls)) return "EY1";
    const ppM = cls.match(/\b(?:PriPlus|Primary\s*Plus\s*)(\d)\b/i);
    if (ppM) return `PP${ppM[1]}`;
    const secM = cls.match(/\b(?:SecPlus|Secondary\s*Plus\s*)([A-C][12](?:\.[12])?)\b/i);
    if (secM) return `S${secM[1].toUpperCase()}`;
    const usM = cls.match(/\b(?:Upper\s*Sec(?:ondary)?|US\s*)([A-C][12](?:\.[12])?)\b/i);
    if (usM) return `US${usM[1].toUpperCase()}`;
    const pstM = cls.match(/\b(?:Starter|PSt)\s*([AB])\b/i);
    if (pstM) return `PSt${pstM[1].toUpperCase()}`;
    return "BCE";
  }

  function groupClassesForBooking(items, defaultCentreKey) {
    const groupsMap = new Map();
    items.forEach((it) => {
      let cKey = deduceCentreKeyFromClassOrBranch(it.className, it._centreKey || defaultCentreKey);
      const suffix = deduceItemCourseSuffix(it);
      const gKey = `${cKey}__${suffix}`;
      if (!groupsMap.has(gKey)) {
        const cObj = SAP.TEACHING_CENTRES.find((c) => c.key === cKey) || SAP.TEACHING_CENTRES[0];
        groupsMap.set(gKey, {
          key: gKey,
          centreKey: cKey,
          centreCode: (cObj && cObj.code) || "AGU",
          centreName: (cObj && cObj.shortName) || "Agouza",
          courseSuffix: suffix,
          courseCode: it._courseCode || `${(cObj && cObj.code) || "AGU"}-${suffix}`,
          items: [],
          earliestStartDateNum: 99999999,
        });
      }
      const grp = groupsMap.get(gKey);
      grp.items.push(it);
      const sNum = SAP.parseSapDateToNum(it.startDate || it.start) || 99999999;
      if (sNum < grp.earliestStartDateNum) grp.earliestStartDateNum = sNum;
    });

    const groups = Array.from(groupsMap.values());
    // Explicit priority: Book BCE first, then Beg, then chronological
    groups.sort((a, b) => {
      const isBceA = a.courseSuffix === "BCE";
      const isBceB = b.courseSuffix === "BCE";
      if (isBceA && !isBceB) return -1;
      if (!isBceA && isBceB) return 1;
      return a.earliestStartDateNum - b.earliestStartDateNum;
    });
    return groups;
  }

  /**
   * Executes the booking of a single course group in SAP:
   * - Adds 1st class from Course Search popup -> Presses OK
   * - For any additional classes in classItems: clicks Add reservation/waitlist -> filters by class -> Selects row + Presses OK
   * - Checks ALL Terms & Conditions checkboxes (LIST_VIEW.TAC_FPM_CE) across all rows
   * - Adult: Presses Save
   * - Young Learner: Switches to Header data -> Selects Guardian -> Fills Collector Start/End Dates -> Presses Save
   * - Immediately exits ZHER_WA_REGISTRATION (presses Back) so SAP releases the EZ_COURSE_REG lock
   */
  async function _bookSingleGroupInSap({
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
    let primaryCentreKey = deduceCentreKeyFromClassOrBranch(firstItem.className, firstItem._centreKey || centreKey);
    const primaryCourseCode = firstItem._courseCode || courseCode;
    let rs = regSession;
    const sapClassIdMap = {};
    const recordClassIdsFromXml = (xml, hintItem = null) => {
      if (!xml || !SAP.extractListViewClassIds) return;
      const found = SAP.extractListViewClassIds(xml);
      const beforeKeys = Object.keys(sapClassIdMap);
      Object.entries(found).forEach(([id, clsName]) => {
        sapClassIdMap[id] = clsName;
      });
      if (hintItem && hintItem.className) {
        const newlyAdded = Object.keys(found).filter((id) => !beforeKeys.includes(id));
        if (newlyAdded.length === 1 && !sapClassIdMap[newlyAdded[0]]) {
          sapClassIdMap[newlyAdded[0]] = hintItem.className;
        }
      }
    };
    const resolveFailedItem = (msgs) => {
      const text = (msgs || []).map((m) => m.text || "").join(" ");
      const idMatches = Array.from(text.matchAll(/\b(00\d{6}|\d{8})\b/g)).map((m) => m[1]);
      for (const sapId of idMatches) {
        const mappedName = sapClassIdMap[sapId];
        if (mappedName) {
          const hit = itemsToBook.find((it) => it.className === mappedName ||
            String(it.className || "").toLowerCase().includes(mappedName.toLowerCase()) ||
            mappedName.toLowerCase().includes(String(it.className || "").toLowerCase()));
          if (hit) return { sapId, item: hit };
          return { sapId, item: { className: mappedName, _sapObjectId: sapId } };
        }
      }
      const quotedM = text.match(/Target class "([^"]+)"/i);
      if (quotedM) {
        const hit = itemsToBook.find((it) => it.className === quotedM[1]);
        if (hit) return { sapId: "", item: hit };
      }
      return itemsToBook.length === 1 ? { sapId: idMatches[0] || "", item: itemsToBook[0] } : null;
    };

    try {
      // Ensure we have an open Registration session for the student & branch of the first class
      rs = await ensureRegistrationPopup({
        studentId: cleanId,
        centreKey: primaryCentreKey,
        bookingAction,
        isAdult,
        onStep,
      });

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

        // 2. Determine exact SAP Academic Year (PERYR_E) for this item!
        // IMPORTANT: In SAP, YL T2/T3/T4/Summer classes running in Jan–Aug 2027 belong to Academic Year "2026".
        // Therefore item.year (PERYR_E returned by SAP) MUST take priority over the calendar year inside startDate!
        const itemStartDateYear = (item.startDate && item.startDate.match(/\b(20\d{2})\b/)?.[1])
          || (item.start && item.start.match(/\b(20\d{2})\b/)?.[1]);
        const itemYear = item.year || year || itemStartDateYear || "2026";

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

        // Filter open popup by smart class hint (e.g. *Sep26*, *Jan26*, *Beg C*) and search SAP
        const curCtl = rs.controls;
        onStep && onStep(
          itemsToBook.length > 1
            ? `Locating & adding class ${idx + 1} of ${itemsToBook.length}: "${item.className}"…`
            : `Selecting class "${item.className}" & adding to registration…`
        );
        let descVal = "";
        const hint = extractClassSearchHint(item.className);
        if (hint) {
          descVal = `*${hint}*`;
        } else if (item.subLevelFilter && !/^(?:T\d+|Sat|Sun|Mon|Tue|Wed|Thu|Fri)/i.test(item.subLevelFilter)) {
          descVal = `*${item.subLevelFilter}*`;
        }

        const searchEvents = buildPopupSearchEvents(curCtl, {
          courseCode: itemCourseCode,
          year: itemYear,
          classDesc: curCtl.classDescInputId ? descVal : undefined,
        });

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
          const retrySearchEvents = buildPopupSearchEvents(rs.controls, {
            courseCode: itemCourseCode,
            year: itemYear,
            classDesc: rs.controls.classDescInputId ? descVal : undefined,
          });
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

        const scrollAndFindInPopup = async (initialBody, initialClasses, preferStartIdx = null) => {
          const directMatch = findMatchedClass(initialClasses);
          if (directMatch) return directMatch;

          if (!initialClasses || initialClasses.length === 0) return null;
          const activeTbl = (initialClasses[0] && initialClasses[0].tableId) || rs.controls.scheduleTableId || "WD0592";
          const rowCount = extractScheduleRowCount(initialBody, activeTbl);
          if (rowCount === 0 || (rowCount !== null && rowCount <= initialClasses.length)) return null;
          const maxTarget = rowCount && rowCount > 0 ? rowCount : 120;

          const scrollIndicesToTry = [];
          if (typeof preferStartIdx === "number" && preferStartIdx > 0) {
            scrollIndicesToTry.push(preferStartIdx);
          }
          for (let sIdx = 5; sIdx < maxTarget; sIdx += 5) {
            if (sIdx !== preferStartIdx) scrollIndicesToTry.push(sIdx);
          }
          if (preferStartIdx !== 0) {
            scrollIndicesToTry.push(0);
          }

          let prevSignature = Array.isArray(initialClasses)
            ? initialClasses.map((c) => `${c.className}|${c.startDate}|${c.rowIndex}`).join("||")
            : "";

          for (const scrollIdx of scrollIndicesToTry) {
            onStep && onStep(`Locating "${item.className}" in SAP popup (scrolling to row ${scrollIdx})…`);
            const scrollQ =
              `SapTable_VerticalScroll~E002Id~E004${activeTbl}~E005FirstVisibleItemIndex~E004${scrollIdx}~E005Action~E004DIRECT~E005CellId~E004~E005AccessType~E004SCROLLBAR~E005SelectionFollowFocus~E004false~E005Shift~E004false~E005Ctrl~E004false~E005Alt~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
              `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;

            const scRes = await proxy({
              url: rs.contextUrl,
              method: "POST",
              cookie: rs.cookie,
              body: postRegBody(rs.secureId, scrollQ),
            });
            if (!scRes.ok || !scRes.body) break;
            rs.cookie = SAP.mergeCookies(rs.cookie, scRes.setCookie);
            rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(scRes.body));
            const scrolledClasses = SAP.parseRegistrationClasses(scRes.body);
            const found = findMatchedClass(scrolledClasses);
            if (found) return found;

            const sig = scrolledClasses.map((c) => `${c.className}|${c.startDate}|${c.rowIndex}`).join("||");
            if (scrollIdx > 0 && (scrolledClasses.length === 0 || (sig && sig === prevSignature))) {
              break;
            }
            if (sig) prevSignature = sig;
          }
          return null;
        };

        // Phase 1: Search & scroll WITH targeted class description filter intact (e.g. *Beg C*)
        let matchedClass = await scrollAndFindInPopup(fRes.body, fClasses, item.firstVisibleIndex);

        // Phase 2: If targeted hint didn't find the class even after scrolling, clear classDesc filter & scroll ALL classes
        if (!matchedClass && descVal && rs.controls.classDescInputId) {
          onStep && onStep(`Expanding SAP class filter for "${item.className}"…`);
          const resetEvents = buildPopupSearchEvents(rs.controls, {
            courseCode: itemCourseCode,
            year: itemYear,
            classDesc: "",
          });
          const resetRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, resetEvents.join("~E001")) });
          if (resetRes.ok && resetRes.body) {
            rs.cookie = SAP.mergeCookies(rs.cookie, resetRes.setCookie);
            rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(resetRes.body));
            const resetClasses = SAP.parseRegistrationClasses(resetRes.body);
            matchedClass = await scrollAndFindInPopup(resetRes.body, resetClasses, null);
          }
        }

        // Phase 3: Alternate-year safety fallback (e.g. if SAP stores Jan-Aug 2027 terms under Academic Year 2026 or vice versa)
        if (!matchedClass && rs.controls.yearInputId) {
          const yrNum = parseInt(itemYear, 10);
          const candidateAltYears = Array.from(new Set([
            year && year !== itemYear ? year : "",
            itemStartDateYear && itemStartDateYear !== itemYear ? itemStartDateYear : "",
            !isNaN(yrNum) ? String(yrNum - 1) : "",
            !isNaN(yrNum) ? String(yrNum + 1) : "",
          ])).filter((y) => y && y !== itemYear);

          for (const altYr of candidateAltYears) {
            onStep && onStep(`Checking SAP schedules under year ${altYr} for "${item.className}"…`);
            const altEvents = buildPopupSearchEvents(rs.controls, {
              courseCode: itemCourseCode,
              year: altYr,
              classDesc: rs.controls.classDescInputId ? "" : undefined,
            });
            const altRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, altEvents.join("~E001")) });
            if (altRes.ok && altRes.body) {
              rs.cookie = SAP.mergeCookies(rs.cookie, altRes.setCookie);
              rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(altRes.body));
              const altClasses = SAP.parseRegistrationClasses(altRes.body);
              matchedClass = await scrollAndFindInPopup(altRes.body, altClasses, null);
              if (matchedClass) break;
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
        recordClassIdsFromXml(okRes.body, item);

        const okMsgs = SAP.parseSapMessages(okRes.body);
        if (okMsgs.some((m) => m.type === "ERROR")) {
          const enrichedOkMsgs = okMsgs.map((m) => ({
            ...m,
            resolvedClassItem: m.type === "ERROR" ? item : null,
          }));
          await releaseRegistrationSession(onStep);
          return {
            ok: false,
            messages: enrichedOkMsgs,
            classItem: item,
            failedClassItem: item,
            failedIndex: idx,
            classItems: itemsToBook,
            sapClassIdMap,
          };
        }

        rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(okRes.body));

        // For multi-class bookings (row index >= 1), WebDynpro loads rows >= 2 as lazy spacer fragments
        // (bIsSpacerFragment="true"). Scroll / request the new row in the Registration table (LIST_VIEW)
        // so SAP renders its cells and its Terms & Conditions checkbox.
        const regTableId = rs.controls.regListTableId || "WDDF";
        if (idx > 0 || rs.controls.hasSpacerFragment) {
          onStep && onStep(`Loading registration row ${idx + 1} for "${item.className}"…`);
          const scrollRegQueue =
            `SapTable_VerticalScroll~E002Id~E004${regTableId}~E005FirstVisibleItemIndex~E004${idx}~E005Action~E004DIRECT~E005CellId~E004~E005AccessType~E004SCROLLBAR~E005SelectionFollowFocus~E004false~E005Shift~E004false~E005Ctrl~E004false~E005Alt~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
            `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
          const sRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, scrollRegQueue) });
          if (sRes.ok && sRes.body) {
            rs.cookie = SAP.mergeCookies(rs.cookie, sRes.setCookie);
            rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(sRes.body));
            recordClassIdsFromXml(sRes.body, item);
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
              recordClassIdsFromXml(reqRes.body, item);
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
        const regTableId = rs.controls.regListTableId || "WDDF";
        const topScrollQ =
          `SapTable_VerticalScroll~E002Id~E004${regTableId}~E005FirstVisibleItemIndex~E0040~E005Action~E004DIRECT~E005CellId~E004~E005AccessType~E004SCROLLBAR~E005SelectionFollowFocus~E004false~E005Shift~E004false~E005Ctrl~E004false~E005Alt~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
        const topRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, topScrollQ) });
        if (topRes.ok && topRes.body) {
          rs.cookie = SAP.mergeCookies(rs.cookie, topRes.setCookie);
          rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(topRes.body));
          recordClassIdsFromXml(topRes.body);
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

      let messages = SAP.parseSapMessages(finalSaveRes.body);
      let hasError = messages.some((m) => m.type === "ERROR");

      // Auto-retry safety net: If SAP rejected Save with "Please agree to the terms and conditions",
      // immediately check all remaining row checkboxes and re-press Save!
      const termsError = messages.some((m) => /terms\s+and\s+conditions/i.test(m.text));
      if (termsError) {
        onStep && onStep("Terms & conditions required by SAP. Re-checking all rows…");
        rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(finalSaveRes.body));

        // If uncheckedTacCheckboxIds is still empty, scroll through all rows to force SAP to render them
        const regTableId = rs.controls.regListTableId || "WDDF";
        const rowCount = Math.max(rs.controls.regRowCount || 0, itemsToBook.length);
        if (!rs.controls.uncheckedTacCheckboxIds || rs.controls.uncheckedTacCheckboxIds.length === 0) {
          for (let rIdx = 0; rIdx < rowCount; rIdx++) {
            const scrollQ =
              `SapTable_VerticalScroll~E002Id~E004${regTableId}~E005FirstVisibleItemIndex~E004${rIdx}~E005Action~E004DIRECT~E005CellId~E004~E005AccessType~E004SCROLLBAR~E005SelectionFollowFocus~E004false~E005Shift~E004false~E005Ctrl~E004false~E005Alt~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
              `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
            const sRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, scrollQ) });
            if (sRes.ok && sRes.body) {
              rs.cookie = SAP.mergeCookies(rs.cookie, sRes.setCookie);
              rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(sRes.body));
            }
          }
        }

        // If still empty (e.g. SAP didn't re-emit unchecked attribute in delta), fall back to all discovered TAC IDs
        if (!rs.controls.uncheckedTacCheckboxIds || rs.controls.uncheckedTacCheckboxIds.length === 0) {
          const fallbackTacIds =
            Array.isArray(rs.controls.tacCheckboxIds) && rs.controls.tacCheckboxIds.length > 0
              ? rs.controls.tacCheckboxIds.slice()
              : rs.controls.tacCheckboxId
                ? [rs.controls.tacCheckboxId]
                : [];
          if (fallbackTacIds.length > 0) {
            rs.controls.uncheckedTacCheckboxIds = fallbackTacIds;
          }
        }

        // Check any remaining unchecked checkboxes
        await checkAllUncheckedTac("Accepting Terms & Conditions in SAP…");

        // Re-press Save
        const saveBtnId = rs.controls.saveBtn || (isAdult ? "WD0285" : "WD025F");
        onStep && onStep("Re-saving booking in SAP…");
        const retrySaveQueue = SAP.buildButtonPressQueue(saveBtnId);
        finalSaveRes = await proxy({
          url: rs.contextUrl,
          method: "POST",
          cookie: rs.cookie,
          body: postRegBody(rs.secureId, retrySaveQueue),
        });
        if (finalSaveRes.ok && finalSaveRes.body) {
          rs.cookie = SAP.mergeCookies(rs.cookie, finalSaveRes.setCookie);
          rs.controls = mergeRegControls(rs.controls, SAP.parseRegistrationControls(finalSaveRes.body));
          messages = SAP.parseSapMessages(finalSaveRes.body);
          hasError = messages.some((m) => m.type === "ERROR");
        }
      }

      // Immediately release the SAP Registration session (press Back) so EZ_COURSE_REG is unlocked!
      recordClassIdsFromXml(finalSaveRes && finalSaveRes.body);
      // If Save failed mentioning an 8-digit SAP class ID that wasn't rendered in top viewport, hydrate LIST_VIEW fragments before Back
      if (hasError && Object.keys(sapClassIdMap).length < itemsToBook.length) {
        const regTableId = rs.controls.regListTableId || "WD5A";
        const rowCount = Math.max(rs.controls.regRowCount || 0, itemsToBook.length);
        const hydrateErrQ =
          `SapTableCS_RequestData~E002Id~E004${regTableId}~E005DataFragments~E0040~002C${rowCount}~003B~E005FirstVisibleContentRowIndex~E0040~E005VisibleContentRowCount~E004${rowCount}~E003~E002ResponseData~E004delta~E005ClientAction~E004submitAsync~E003~E002~E003` +
          `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004true~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
        const hErrRes = await proxy({ url: rs.contextUrl, method: "POST", cookie: rs.cookie, body: postRegBody(rs.secureId, hydrateErrQ) }).catch(() => null);
        if (hErrRes && hErrRes.ok && hErrRes.body) {
          recordClassIdsFromXml(hErrRes.body);
        }
      }
      const resolvedFailure = hasError ? resolveFailedItem(messages) : null;
      await releaseRegistrationSession(onStep);

      return {
        ok: !hasError,
        messages,
        classItem: (resolvedFailure && resolvedFailure.item) || firstItem,
        failedClassItem: (resolvedFailure && resolvedFailure.item) || null,
        failedSapObjectId: (resolvedFailure && resolvedFailure.sapId) || "",
        sapClassIdMap,
        classItems: itemsToBook,
      };
    } catch (err) {
      await releaseRegistrationSession().catch(() => { });
      throw err;
    }
  }

  /**
   * Top-level bookClassInSap:
   * If all selected classes belong to the same course & branch, runs a single SAP registration session.
   * If classes span multiple courses (e.g. BCE + Beginner) or multiple branches:
   * Groups classes by course/branch, sorts them (BCE first, then Beginner, then chronological),
   * and registers each group in its own SAP registration session, releasing and saving each one cleanly.
   */
  async function bookClassInSap(opts) {
    const {
      studentId,
      centreKey,
      classItem,
      classItems,
      onStep,
    } = opts;
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

    const firstItem = itemsToBook[0];
    let primaryCentreKey = firstItem._centreKey || centreKey;
    if (/\b(BSA|ALX)\b/i.test(firstItem.className || "") && !primaryCentreKey.startsWith("05001354")) {
      primaryCentreKey = "05001354";
    }

    const bookingGroups = groupClassesForBooking(itemsToBook, primaryCentreKey);
    if (bookingGroups.length <= 1) {
      return _bookSingleGroupInSap(opts);
    }

    // Multi-course or multi-registration booking (e.g. BCE + Beginner)
    const allMessages = [];
    const allBooked = [];
    for (let gIdx = 0; gIdx < bookingGroups.length; gIdx++) {
      const grp = bookingGroups[gIdx];
      const stepHeader = `Registration ${gIdx + 1} of ${bookingGroups.length}: Booking ${grp.courseSuffix || "course"} (${grp.items.length} ${grp.items.length === 1 ? "class" : "classes"}) in SAP…`;
      onStep && onStep(stepHeader);

      // Ensure any leftover registration session is released before starting the new course group
      await releaseRegistrationSession(onStep).catch(() => { });

      // Prioritize SAP PERYR_E (grp.items[0].year) or opts.year over calendar year in startDate
      const groupStartYear = grp.items[0].year
        || opts.year
        || (grp.items[0].startDate && grp.items[0].startDate.match(/\b(20\d{2})\b/)?.[1])
        || (grp.items[0].start && grp.items[0].start.match(/\b(20\d{2})\b/)?.[1]);

      const grpRes = await _bookSingleGroupInSap({
        ...opts,
        centreKey: grp.centreKey,
        courseCode: grp.courseCode,
        year: groupStartYear,
        classItem: grp.items[0],
        classItems: grp.items,
        onStep: (msg) => onStep && onStep(`[${gIdx + 1}/${bookingGroups.length} - ${grp.courseSuffix}] ${msg}`),
      });

      if (grpRes.messages && Array.isArray(grpRes.messages)) {
        allMessages.push(...grpRes.messages);
      }

      if (!grpRes.ok) {
        return {
          ok: false,
          messages: allMessages,
          classItem: grpRes.failedClassItem || grpRes.classItem || grp.items[0],
          failedClassItem: grpRes.failedClassItem || grpRes.classItem || null,
          failedSapObjectId: grpRes.failedSapObjectId || "",
          sapClassIdMap: grpRes.sapClassIdMap || {},
          classItems: itemsToBook,
          bookedClasses: allBooked,
          failedGroup: grp,
          failedIndex: gIdx,
        };
      }
      allBooked.push(...grp.items);
    }

    return {
      ok: true,
      messages: allMessages,
      classItem: itemsToBook[0],
      classItems: itemsToBook,
      bookedClasses: allBooked,
      groupCount: bookingGroups.length,
    };
  }

  /**
   * Read-only lookup into SAP ZHER_WA_REGISTRATION for an existing student booking:
   * Opens Registration screen -> finds matching row in LIST_VIEW -> selects it to load
   * Course fee and Services + Registration details (Course details & Change data) ->
   * Immediately releases ZHER_WA_REGISTRATION (Back) so EZ_COURSE_REG lock is freed.
   * Never creates or saves any booking.
   */
  async function fetchRegistrationRowDetails({ studentId, booking, onStep }) {
    const cleanId = String(studentId || "").padStart(10, "0");
    if (!cleanId || cleanId === "0000000000") {
      throw new Error("Invalid Student ID.");
    }
    if (regSession) {
      await releaseRegistrationSession();
    }

    const regVdom = document.createElement("div");
    try {
      let info = null;
      if (booking && booking.linkId) {
        info = await withSapLock(async () => {
          const curSess = getSession && getSession();
          if (
            curSess &&
            curSess.contextUrl &&
            curSess.secureId &&
            curSess.currentStudentId === cleanId &&
            curSess.screen === "HISTORY"
          ) {
            try {
              onStep && onStep("Opening exact booking record in SAP (MODREGID)…");
              const linkRes = await proxy({
                url: curSess.contextUrl,
                method: "POST",
                cookie: curSess.cookie,
                body: postBody(curSess.secureId, SAP.buildLinkActivateQueue(booking.linkId)),
              });
              if (linkRes.ok && linkRes.body && !linkRes.body.includes("SAMLRequest") && linkRes.sessionState !== "RELEASED") {
                const linkUnesc = String(linkRes.body)
                  .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                  .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
                const linkUrlM = linkUnesc.match(/"url"\s*:\s*"([^"]+)"/i);
                if (linkUrlM) {
                  clearSession();
                  let redirectUrl = linkUrlM[1];
                  if (redirectUrl.startsWith("/")) redirectUrl = `${SAP.SAP_ORIGIN}${redirectUrl}`;
                  return {
                    redirectUrl,
                    cookie: SAP.mergeCookies(curSess.cookie, linkRes.setCookie),
                    viaModRegId: /MODREGID=/i.test(redirectUrl),
                  };
                }
              }
            } catch (e) {
              // Fall back cleanly to Registration URL flow
            }
          }
          return null;
        });
      }
      if (!info) {
        info = await obtainStudentRegistrationUrl(cleanId, onStep);
      }
      const openedViaModRegId = Boolean(info && info.viaModRegId);
      let baseRegUrl = info.redirectUrl;
      let cookie = info.cookie;

      onStep && onStep("Loading SAP Registration details…");
      let gRes = await proxy({ url: baseRegUrl, method: "GET", cookie });
      if (!gRes.ok || !gRes.body || gRes.body.includes("SAMLRequest")) {
        const retryInfo = await obtainStudentRegistrationUrl(cleanId, onStep);
        baseRegUrl = retryInfo.redirectUrl;
        cookie = retryInfo.cookie;
        gRes = await proxy({ url: baseRegUrl, method: "GET", cookie });
      }
      if (!gRes.ok || !gRes.body) throw new Error("Could not load SAP Registration screen.");

      cookie = SAP.mergeCookies(cookie, gRes.setCookie);
      const htmlDec = SAP.decodeHtmlEntities(gRes.body);
      const ctxM = htmlDec.match(/sap-contextid=([^"&'\s>]+)/i);
      const secM =
        htmlDec.match(/name=["']sap-wd-secure-id["'][^>]*value=["']([^"']+)["']/i) ||
        htmlDec.match(/value=["']([^"']+)["'][^>]*name=["']sap-wd-secure-id["']/i);
      if (!ctxM || !secM) throw new Error("Could not extract Registration context ID.");

      const contextUrl = `${SAP.SAP_ORIGIN}/sap/bc/webdynpro/sap/zher_wa_registration?sap-contextid=${ctxM[1]}`;
      const secureId = decodeURIComponent(secM[1]);

      const phRes = await proxy({
        url: contextUrl,
        method: "POST",
        cookie,
        body: SAP.buildLoadingPlaceholderBody(secureId).replace(FESR, FESR_REG),
      });
      if (!phRes.ok || !phRes.body) throw new Error("Failed to initialize Registration screen.");
      cookie = SAP.mergeCookies(cookie, phRes.setCookie);
      SAP.applySapDeltaUpdates(phRes.body, regVdom);
      let ctl = SAP.parseRegistrationControls(phRes.body, true);

      regSession = {
        studentId: cleanId,
        regUrl: baseRegUrl,
        contextUrl,
        secureId,
        cookie,
        centreKey: "",
        controls: ctl,
        popupOpen: false,
      };

      const cancelAnyPackagePopup = async (xmlBody) => {
        const hasPkg =
          ctl.hasPackagePopup ||
          (xmlBody &&
            /Bundle\s*selection|Package\s*selection/i.test(xmlBody) &&
            !/<control-update id="WDWL1_POP_CONT"><content><!\[CDATA\[<div id="WDWL1_POP_CONT"[^>]*><\/div>/i.test(xmlBody));
        if (hasPkg) {
          const cancelBtn = ctl.cancelPopupBtn || "WDAA";
          const canRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, SAP.buildButtonPressQueue(cancelBtn)) });
          if (canRes.ok && canRes.body) {
            cookie = SAP.mergeCookies(cookie, canRes.setCookie);
            SAP.applySapDeltaUpdates(canRes.body, regVdom);
            ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(canRes.body));
            regSession.cookie = cookie;
            regSession.controls = ctl;
          }
        }
      };

      const ensureRegistrationsTabVisible = async () => {
        const needsRegTab =
          ctl.panelStackId &&
          ctl.registrationsTabPanelId &&
          (/header/i.test(ctl.activePanelTitle || "") || (!ctl.addReservationItemId && !ctl.bookingBtnId && !ctl.regListTableId));
        if (needsRegTab) {
          const switchQ =
            `PanelStack_Select~E002Id~E004${ctl.panelStackId}~E005PanelId~E004${ctl.registrationsTabPanelId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
            `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
          const tabRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, switchQ) });
          if (tabRes.ok && tabRes.body) {
            cookie = SAP.mergeCookies(cookie, tabRes.setCookie);
            SAP.applySapDeltaUpdates(tabRes.body, regVdom);
            ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(tabRes.body));
            regSession.cookie = cookie;
            regSession.controls = ctl;
          }
        }
      };

      await cancelAnyPackagePopup(phRes.body);
      await ensureRegistrationsTabVisible();

      const normCls = (s) => {
        let str = String(s || "");
        str = str.replace(/(\d{1,2}):(\d{2})\s*(am|pm)/gi, (_, h, m, mer) => {
          let hr = parseInt(h, 10);
          if (/pm/i.test(mer) && hr < 12) hr += 12;
          if (/am/i.test(mer) && hr === 12) hr = 0;
          return `${String(hr).padStart(2, "0")}:${m}`;
        });
        return str.replace(/\.{2,}$|…$/, "").replace(/[\s\-_/–—\(\):]+/g, "").toLowerCase();
      };

      const hasLevelConflict = (aStr, bStr) => {
        const aBeg = String(aStr || "").match(/\bbeg\s*([a-e])\b/i)?.[1]?.toLowerCase();
        const bBeg = String(bStr || "").match(/\bbeg\s*([a-e])\b/i)?.[1]?.toLowerCase();
        if (aBeg && bBeg && aBeg !== bBeg) return true;
        const aCefr = String(aStr || "").match(/\b([abc][12]\.[12])\b/i)?.[1]?.toLowerCase();
        const bCefr = String(bStr || "").match(/\b([abc][12]\.[12])\b/i)?.[1]?.toLowerCase();
        if (aCefr && bCefr && aCefr !== bCefr) return true;
        return false;
      };

      const findMatchingRow = (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        if (!booking) return rows[0];
        const bCls = normCls(booking.className);
        const bCourse = String(booking.courseCode || "").trim().toLowerCase();
        const bStatus = String(booking.status || "").trim().toLowerCase();
        const bTerm = String(booking.session || "").match(/(?:Term|T)\s*(\d+)/i)?.[1] || "";
        const bMonYr = String(`${booking.className || ""} ${booking.courseDescription || ""}`).match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{2,4})\b/i);
        const bActStart = String(booking.actualStartDate || "").trim();

        let bestRow = null;
        let bestScore = 0;
        rows.forEach((r) => {
          if (hasLevelConflict(booking.className, r.className)) return;
          const rCls = normCls(r.className);
          const combined = `${r.courseAndSession || ""} ${r.course || ""} ${r.className || ""}`.toLowerCase();
          let score = 0;

          if (rCls && bCls) {
            if (bCls === rCls) score += 120;
            else if (bCls.startsWith(rCls) || rCls.startsWith(bCls)) score += 95;
            else if (bCls.includes(rCls) || rCls.includes(bCls)) score += 70;
          }
          if (bActStart && r.startDate === bActStart) score += 45;
          if (bStatus && r.status && r.status.toLowerCase() === bStatus) score += 25;
          if (bCourse && combined.includes(bCourse)) score += 15;
          const bCourseExact = (booking.courseCode || "").trim().toLowerCase();
          const rCourseExact = (r.course || "").trim().toLowerCase();
          if (bCourseExact && rCourseExact && (rCourseExact === bCourseExact || rCourseExact.includes(bCourseExact) || bCourseExact.includes(rCourseExact))) {
            score += 35;
          }
          const bSrc = (booking.bookingSource || "").trim().toLowerCase();
          const rSrc = (r.bookingSource || "").trim().toLowerCase();
          if (bSrc && rSrc && bSrc === rSrc) score += 15;
          if (openedViaModRegId && rows.length === 1) score += 50;
          if (bTerm && new RegExp(`(?:term|t)\\s*${bTerm}\\b`, "i").test(combined)) score += 20;
          if (bMonYr) {
            const mon = bMonYr[1].toLowerCase();
            const yr = bMonYr[2].length === 2 ? bMonYr[2] : bMonYr[2].slice(-2);
            if (combined.includes(mon) && combined.includes(yr)) score += 20;
          }
          if (score > bestScore && score >= 50) {
            bestScore = score;
            bestRow = r;
          }
        });
        return bestRow;
      };

      const scanAndScrollForRow = async () => {
        let list = SAP.parseExistingRegistrationsList(regVdom);
        let found = findMatchingRow(list.rows);
        let totalRows = Math.max(ctl.regRowCount || 0, list.rows.length);
        const tblId = list.tableId || ctl.regListTableId || "WD5A";

        // Hydrate lazy SapTableCS spacer rows (SAP only renders Row 1 until SapTableCS_RequestData is sent!)
        const needsHydration =
          Boolean(tblId) &&
          (ctl.hasSpacerFragment || totalRows > list.rows.length || (!found && list.rows.length === 1));
        if (needsHydration) {
          const reqCount = Math.min(Math.max(totalRows, 15), 40);
          onStep && onStep("Loading all active registration rows from SAP…");
          const hydrateQ =
            `SapTableCS_TableResize~E002Id~E004${tblId}~E005VisibleContentRowCount~E004${reqCount}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E003~E002~E003` +
            `~E001SapTableCS_RequestData~E002Id~E004${tblId}~E005DataFragments~E0040~002C${reqCount}~003B~E005FirstVisibleContentRowIndex~E0040~E005VisibleContentRowCount~E004${reqCount}~E003~E002ResponseData~E004delta~E005ClientAction~E004submitAsync~E003~E002~E003` +
            `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004true~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
          const hRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, hydrateQ) });
          if (hRes.ok && hRes.body) {
            cookie = SAP.mergeCookies(cookie, hRes.setCookie);
            SAP.applySapDeltaUpdates(hRes.body, regVdom);
            ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(hRes.body));
            regSession.cookie = cookie;
            regSession.controls = ctl;
            list = SAP.parseExistingRegistrationsList(regVdom);
            totalRows = Math.max(ctl.regRowCount || 0, list.rows.length);
            found = findMatchingRow(list.rows);
          }
        }

        // Paginate beyond 40 rows if student has huge history and row is still not loaded
        if (!found && totalRows > list.rows.length && tblId) {
          for (let offset = list.rows.length; offset < Math.min(totalRows, 80); offset += 20) {
            onStep && onStep(`Loading SAP Registrations (${offset + 1}–${Math.min(offset + 20, totalRows)} of ${totalRows})…`);
            const moreQ =
              `SapTableCS_RequestData~E002Id~E004${tblId}~E005DataFragments~E004${offset}~002C20~003B~E005FirstVisibleContentRowIndex~E004${offset}~E005VisibleContentRowCount~E00420~E003~E002ResponseData~E004delta~E005ClientAction~E004submitAsync~E003~E002~E003` +
              `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004true~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
            const sRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, moreQ) });
            if (!sRes.ok || !sRes.body) break;
            cookie = SAP.mergeCookies(cookie, sRes.setCookie);
            SAP.applySapDeltaUpdates(sRes.body, regVdom);
            ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(sRes.body));
            regSession.cookie = cookie;
            regSession.controls = ctl;
            const nextList = SAP.parseExistingRegistrationsList(regVdom);
            const grew = nextList.rows.length > list.rows.length;
            list = nextList;
            found = findMatchingRow(list.rows);
            if (found || !grew) break;
          }
        }
        return { list, found };
      };

      let { list: regList, found: matchedRow } = await scanAndScrollForRow();

      // If no matching row yet, switch Teaching Centre combo across matching/available centres
      if (!matchedRow && booking && ctl.centreComboId) {
        const bookingText = `${booking.className || ""} ${booking.courseCode || ""} ${booking.teachingCentre || ""}`.trim();
        const targetCentreKey = deduceCentreKeyFromClassOrBranch(bookingText, "");
        const primaryKey = targetCentreKey ? String(targetCentreKey).split("_")[0] : "";
        const availableOpts = Array.isArray(ctl.centreOptions) ? ctl.centreOptions : [];
        const isEgOrOnline = /^(?:EG\b|Online\b)/i.test(bookingText) || /OLCons|Online|Phone\s*Consultation/i.test(bookingText);
        const prioritizedOpts = availableOpts
          .slice()
          .sort((a, b) => {
            const scoreOpt = (o) => {
              const lbl = String(o.label || "");
              let s = 0;
              if (booking.teachingCentre && lbl.toLowerCase().includes(booking.teachingCentre.toLowerCase())) s += 100;
              if (isEgOrOnline && /egypt|online|\beg\b/i.test(lbl)) s += 80;
              if (/agouza|citystars|october|heliopolis|new\s*cairo|alex/i.test(lbl)) s += 10;
              return s;
            };
            return scoreOpt(b) - scoreOpt(a);
          })
          .map((o) => o.key);

        const candidateCentreKeys = [];
        if (primaryKey) candidateCentreKeys.push(primaryKey);
        prioritizedOpts.forEach((k) => {
          if (k && !candidateCentreKeys.includes(k)) candidateCentreKeys.push(k);
        });

        for (let ci = 0; ci < candidateCentreKeys.length && ci < 7; ci++) {
          const sapCentreKey = candidateCentreKeys[ci];
          const selCentreQ =
            `ComboBox_Select~E002Id~E004${ctl.centreComboId}~E005Key~E004${sapCentreKey}~E005ByEnter~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
            `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
          const cRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, selCentreQ) });
          if (cRes.ok && cRes.body) {
            cookie = SAP.mergeCookies(cookie, cRes.setCookie);
            SAP.applySapDeltaUpdates(cRes.body, regVdom);
            ctl = mergeRegControls(ctl, SAP.parseRegistrationControls(cRes.body));
            regSession.cookie = cookie;
            regSession.controls = ctl;

            await cancelAnyPackagePopup(cRes.body);
            await ensureRegistrationsTabVisible();

            const rescan = await scanAndScrollForRow();
            regList = rescan.list;
            matchedRow = rescan.found;
            if (matchedRow) break;
          }
        }
      }

      // Select matchedRow in LIST_VIEW if bottom Course details aren't already showing this exact row
      const preDetails = SAP.parseRegistrationDetailsPanel(regVdom);
      const preClsNorm = normCls(preDetails.courseDetails && preDetails.courseDetails.className);
      const targetClsNorm = normCls(matchedRow && matchedRow.className);
      const preBegin = (preDetails.courseDetails && preDetails.courseDetails.begin) || "";
      const beginMatches = !matchedRow || !matchedRow.startDate || !preBegin || preBegin === matchedRow.startDate;
      const clsMatches =
        !targetClsNorm || !preClsNorm || preClsNorm.startsWith(targetClsNorm) || targetClsNorm.startsWith(preClsNorm);
      const alreadyLoadedForRow =
        Boolean(matchedRow && matchedRow.selected) &&
        Boolean(preBegin) &&
        beginMatches &&
        clsMatches;

      if (matchedRow && !alreadyLoadedForRow && matchedRow.triggerCellId) {
        onStep && onStep("Reading selected registration row details in SAP…");
        const tblId = matchedRow.tableId || regList.tableId || ctl.regListTableId || "WD5A";
        const sendRowSelect = async (evtName) => {
          const selRowQ =
            `${evtName}~E002Id~E004${tblId}~E005RowIndex~E004${matchedRow.rowIndex}~E005RowUserData~E004~E005CellUserData~E004~E005AccessType~E004STANDARD~E005TriggerCellId~E004${matchedRow.triggerCellId}~E005TriggerAction~E004MOUSE~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003` +
            `~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
          const rowRes = await proxy({ url: contextUrl, method: "POST", cookie, body: postRegBody(secureId, selRowQ) });
          if (rowRes.ok && rowRes.body) {
            cookie = SAP.mergeCookies(cookie, rowRes.setCookie);
            SAP.applySapDeltaUpdates(rowRes.body, regVdom);
            regSession.cookie = cookie;
            regList = SAP.parseExistingRegistrationsList(regVdom);
            matchedRow = findMatchingRow(regList.rows) || matchedRow;
          }
        };

        await sendRowSelect("SapTableCS_ClientRowSelect");
        const postDetails = SAP.parseRegistrationDetailsPanel(regVdom);
        const postBegin = (postDetails.courseDetails && postDetails.courseDetails.begin) || "";
        const postClsNorm = normCls(postDetails.courseDetails && postDetails.courseDetails.className);
        if (
          (matchedRow.startDate && postBegin && postBegin !== matchedRow.startDate) ||
          (targetClsNorm && postClsNorm && !postClsNorm.startsWith(targetClsNorm) && !targetClsNorm.startsWith(postClsNorm))
        ) {
          await sendRowSelect("SapTable_ClientRowSelect");
        }
      }

      const details = SAP.parseRegistrationDetailsPanel(regVdom);
      if (matchedRow && details.courseDetails) {
        if (!details.courseDetails.course && matchedRow.course) details.courseDetails.course = matchedRow.course;
        if (!details.courseDetails.year && matchedRow.year) details.courseDetails.year = matchedRow.year;
        if (!details.courseDetails.period && matchedRow.period) details.courseDetails.period = matchedRow.period;
        if (!details.courseDetails.origin && matchedRow.bookingSource) details.courseDetails.origin = matchedRow.bookingSource;
        if (!details.courseDetails.status && matchedRow.status) details.courseDetails.status = matchedRow.status;
        if (!details.courseDetails.className && matchedRow.className) details.courseDetails.className = matchedRow.className;
        if (!details.courseDetails.begin && matchedRow.startDate) details.courseDetails.begin = matchedRow.startDate;
        if (!details.courseDetails.end && matchedRow.endDate) details.courseDetails.end = matchedRow.endDate;
      }
      const hasPanelData = Boolean(
        openedViaModRegId &&
        details &&
        details.courseDetails &&
        (details.courseDetails.course || details.courseDetails.begin)
      );
      return {
        ok: true,
        foundInRegistrations: Boolean(matchedRow || hasPanelData),
        matchedRow: matchedRow || null,
        registrations: regList.rows || [],
        details,
      };
    } finally {
      await releaseRegistrationSession().catch(() => { });
    }
  }

  Object.assign(global.SapService, {
    searchAvailableClasses,
    searchAllBranchesSchedules,
    bookClassInSap,
    releaseRegistrationSession,
    fetchRegistrationRowDetails,
    groupClassesForBooking: (items, defaultCentreKey) => groupClassesForBooking(items, defaultCentreKey),
    deduceCentreKeyFromClassOrBranch: (className, fallbackKey) => deduceCentreKeyFromClassOrBranch(className, fallbackKey),
    getCachedGuardians: (studentId) =>
      (regSession && regSession.controls && regSession.controls.guardiansList) ||
      (studentId ? lastGuardiansByStudent[String(studentId).padStart(10, "0")] : Object.values(lastGuardiansByStudent)[0]) ||
      [],
    _resetRegSession: () => { regSession = null; },
  });
})(window);