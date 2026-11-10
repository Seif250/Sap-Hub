// ============================================================================
// SAP Web Dynpro Connector, Delta DOM Engine & Screen Parsers
// Exact battle-tested SAPEVENTQUEUE protocol for Z_HER_WA_STUDENT
// ============================================================================
(function (global) {
  const SAP_ORIGIN = "https://prd-sap.sms.britishcouncil.org";
  const BASE_SAP_URL = `${SAP_ORIGIN}/sap/bc/webdynpro/sap/z_her_wa_student?WDCONFIGURATIONID=Z_HER_AC_STUDENT`;

  const DEFAULT_CONTROLS = {
    studentId: "WD80",
    studentIdList: "WD81",
    firstName: "WDA8",
    lastName: "WDD2",
    anyName: "WDFC",
    email: "WD02A0",
    telephone: "WD02C9",
    searchBtn: "WD03C4",
    clearBtn: "WD03C6",
    resetBtn: "WD03C8",
    resultsTable: "WD03F1",
    historyMenuBtn: "WD0A49",
    historyPopupId: "WD0A4E",
    bookingHistoryItemId: "WD0A4A",
    backFromHistoryBtn: "WD0A5F",
  };

  function decodeHtmlEntities(str) {
    if (!str) return "";
    return String(str)
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
  }

  function cleanSapCellText(raw) {
    const s = decodeHtmlEntities(raw || "")
      .replace(/[\u00a0\ufffd]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return s === "Empty" ? "" : s;
  }

  function formatStudentName(rawName) {
    if (!rawName) return "";
    return String(rawName)
      .trim()
      .split(/\s+/)
      .map((word) => {
        if (!word) return "";
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(" ");
  }

  function normalizeStudentName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ");
  }

  function getLevelRank(profile) {
    if (!profile) return 0;
    if (profile.isNoLevel) return 0;
    const lvl = String(profile.level || profile.outsideLevel || "").trim();
    if (!lvl || /no level|unassigned|not assigned|راسب|ساقط/i.test(lvl)) return 0;
    if (/^a0$|^beginner\s*\(a0\)$/i.test(lvl) && !profile.detectedLevelFromNotes) return 1;
    return 2; // Specific level (e.g. Beginner B, Primary Plus 1, A1, B2, Starter B)
  }

  function sapEscape(str) {
    if (str === null || str === undefined) return "";
    const s = String(str);
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (/^[a-zA-Z0-9_.\-]$/.test(ch)) {
        out += ch;
      } else {
        const hex = ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
        out += `~${hex}`;
      }
    }
    return out;
  }

  function parsePastedAuth(input) {
    const text = String(input || "").trim();
    if (!text) return { cookie: "", contextUrl: "", secureId: "" };

    let cookie = text;
    let contextUrl = "";
    let secureId = "";

    if (text.includes("fetch(") || text.includes('"cookie"') || text.includes("'cookie'")) {
      const cookieMatch = text.match(/["']cookie["']\s*:\s*["']([^"']+)["']/i);
      if (cookieMatch) cookie = cookieMatch[1];

      const urlMatch = text.match(/fetch\(\s*["']([^"']+)["']/i);
      if (urlMatch && urlMatch[1].includes("sap-contextid=")) {
        contextUrl = urlMatch[1];
      }

      const secMatch = text.match(/sap-wd-secure-id=([A-Za-z0-9_%]+)/i);
      if (secMatch) secureId = decodeURIComponent(secMatch[1]);
    } else if (text.includes("curl ")) {
      const cookieMatch = text.match(/(?:-H|--header|-b|--cookie)\s+["'](?:cookie:\s*)?([^"']+)["']/i);
      if (cookieMatch) cookie = cookieMatch[1];
    } else if (text.toLowerCase().startsWith("cookie:")) {
      cookie = text.slice(7).trim();
    }

    return { cookie: cookie.trim(), contextUrl, secureId };
  }

  function mergeCookies(existingCookieStr, setCookieHeader) {
    if (!setCookieHeader) return existingCookieStr;
    const map = new Map();
    String(existingCookieStr || "")
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const idx = pair.indexOf("=");
        if (idx > 0) {
          map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
        }
      });

    const reserved = new Set(["path", "domain", "expires", "max-age", "secure", "httponly", "samesite"]);
    const parts = String(setCookieHeader).split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
    for (const part of parts) {
      const firstSeg = part.split(";")[0].trim();
      const eq = firstSeg.indexOf("=");
      if (eq > 0) {
        const k = firstSeg.slice(0, eq).trim();
        const v = firstSeg.slice(eq + 1).trim();
        if (!reserved.has(k.toLowerCase())) {
          map.set(k, v);
        }
      }
    }

    return Array.from(map.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  /**
   * Builds the mandatory LoadingPlaceHolder_Load POST body required by SAP Web Dynpro
   * right after GET /z_her_wa_student before any Search/ComboBox events can be sent.
   */
  function buildLoadingPlaceholderBody(secureId) {
    const queue = "ClientInspector_Notify~E002Id~E004WD01~E005Data~E004ClientWidth~003A1920px~003BClientHeight~003A960px~003BScreenWidth~003A1920px~003BScreenHeight~003A1080px~003BScreenOrientation~003Alandscape~003BThemedValueHelpHeight~003A700px~003BThemedValueHelpWidth~003A1080px~003BThemedTableRowHeight~003A33px~003BThemedFormLayoutRowHeight~003A32px~003BThemedSvgLibUrls~003A~007B~0022SAPGUI-icons~0022~003A~0022https~003A~002F~002Fprd-sap.sms.britishcouncil.org~002Fsap~002Fpublic~002Fbc~002Fur~002Fnw5~002Fthemes~002F~00257ecache-20260505114737~002FUR~002Fls~002Fsap_fiori_3~002Fsvg~002Flibs~002FSAPGUI-icons.svg~0022~002C~0022SAPWeb-icons~0022~003A~0022https~003A~002F~002Fprd-sap.sms.britishcouncil.org~002Fsap~002Fpublic~002Fbc~002Fur~002Fnw5~002Fthemes~002F~00257ecache-20260505114737~002FUR~002Fls~002Fsap_fiori_3~002Fsvg~002Flibs~002FSAPWeb-icons.svg~0022~007D~003BThemeTags~003AFiori_3~002CTouch~003BDeviceType~003ADESKTOP~003BDocumentDomain~003Asms.britishcouncil.org~003BClientURL~003Ahttps~003A~002F~002Fprd-sap.sms.britishcouncil.org~002Fsap~002Fbc~002Fwebdynpro~002Fsap~002Fz_her_wa_student~003FWDCONFIGURATIONID~003DZ_HER_AC_STUDENT~0023~003BIsTopWindow~003ATRUE~003BParentAccessible~003ATRUE~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E003~E002~E003~E001ClientInspector_Notify~E002Id~E004WD02~E005Data~E004ThemedTableRowHeight~003A25px~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E003~E002~E003~E001LoadingPlaceHolder_Load~E002Id~E004_loadingPlaceholder_~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003";
    return `sap-charset=utf-8&sap-wd-secure-id=${encodeURIComponent(secureId)}&fesrAppName=Z_HER_WA_STUDENT~Z_HER_AC_STUDENT&fesrUseBeacon=true&SAPEVENTQUEUE=${queue}`;
  }

  function buildSearchEventQueue(criteriaList, activeControls, dirtyFieldsSet) {
    const events = [];
    const currentIds = new Set(criteriaList.map((c) => c.controlId));

    // Explicitly clear all other known search input fields so switching search types (e.g. Phone -> Student ID)
    // never leaves a stale filter active on the SAP server!
    const allSearchInputIds = [
      activeControls.studentId,
      activeControls.telephone,
      activeControls.email,
      activeControls.anyName,
      activeControls.firstName,
      activeControls.lastName,
      ...(dirtyFieldsSet ? Array.from(dirtyFieldsSet) : []),
    ].filter(Boolean);

    const clearedIds = new Set();
    for (const fieldId of allSearchInputIds) {
      if (!currentIds.has(fieldId) && !clearedIds.has(fieldId)) {
        clearedIds.add(fieldId);
        events.push(
          `ComboBox_Change~E002Id~E004${fieldId}~E005Value~E004~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
        );
      }
    }
    if (dirtyFieldsSet) dirtyFieldsSet.clear();

    let lastControlId = activeControls.studentId || "WD80";
    let lastVal = "";

    for (const item of criteriaList) {
      const escapedVal = sapEscape(item.value);
      events.push(
        `ComboBox_Change~E002Id~E004${item.controlId}~E005Value~E004${escapedVal}~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E005Delay~E004full~E003~E002~E003`
      );
      if (dirtyFieldsSet) dirtyFieldsSet.add(item.controlId);
      lastControlId = item.controlId;
      lastVal = item.value;
    }

    // Resize results table so SAP Web Dynpro does not paginate/virtualize large families to only 5 rows
    const tableId = (activeControls && activeControls.resultsTable) || "WD03F1";
    events.push(
      `SapTableCS_TableResize~E002Id~E004${tableId}~E005VisibleContentRowCount~E00450~E003~E002ResponseData~E004delta~E005EnqueueCardinality~E004single~E003~E002~E003`
    );

    events.push(
      `Button_Press~E002Id~E004${activeControls.searchBtn || "WD03C4"}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003`
    );

    const escapedFocusVal = sapEscape(lastVal);
    const valLen = String(lastVal).length;
    events.push(
      `Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~0040~007B~0022iSelectionStart~0022~003A0~002C~0022iSelectionEnd~0022~003A${valLen}~002C~0022iCursorPos~0022~003A0~002C~0022sValue~0022~003A~0022${escapedFocusVal}~0022~002C~0022sFocussedId~0022~003A~0022${lastControlId}~0022~002C~0022sApplyControlId~0022~003A~0022${lastControlId}~0022~007D~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`
    );

    return events.join("~E001");
  }

  function buildLinkActivateQueue(targetLinkId) {
    return `Link_Activate~E002Id~E004${targetLinkId}~E005Ctrl~E004false~E005Shift~E004false~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~0040~007B~0022sFocussedId~0022~003A~0022${targetLinkId}~0022~007D~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
  }

  function buildBookingHistoryQueue(historyPopupId, bookingHistoryItemId, historyMenuBtn) {
    return `PopupMenu_Select~E002Id~E004${historyPopupId}~E005ItemId~E004${bookingHistoryItemId}~E005ConnectedControlId~E004${historyMenuBtn}~E005Checked~E004false~E005UserData~E004~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~0040~007B~0022sFocussedId~0022~003A~0022${historyMenuBtn}~0022~007D~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
  }

  function buildNotesPanelQueue(panelStackId, notesPanelId) {
    const pid = notesPanelId || "WD09FB";
    const psid = panelStackId || "WD04BC";
    return `PanelStack_Select~E002Id~E004${psid}~E005PanelId~E004${pid}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~0040~007B~0022sFocussedId~0022~003A~0022${pid}-title~0022~002C~0022sSubControlHandle~0022~003A~0022title~0022~007D~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004true~E003~E002ResponseData~E004delta~E003~E002~E003`;
  }

  // ---- Open a note's content (captured from live SAP: CellSelect → "Display note" → popup → Close) ----
  function buildNoteCellSelectQueue(tableId, cellId, focusId, rowIndex, colIndex) {
    return `SapTable_CellSelect~E002Id~E004${tableId}~E005CellId~E004${cellId}~E005CellType~E004SapTableCell~E005RowIndex~E004${rowIndex}~E005ColIndex~E004${colIndex}~E005RowUserData~E004~E005CellUserData~E004~E005AccessType~E004STANDARD~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~0040~007B~0022iRowIndex~0022~003A${rowIndex}~002C~0022iColIndex~0022~003A${colIndex}~002C~0022sFocussedId~0022~003A~0022${focusId}~0022~002C~0022sApplyControlId~0022~003A~0022${tableId}~0022~007D~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
  }
  function buildButtonPressQueue(btnId) {
    return `Button_Press~E002Id~E004${btnId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~0040~007B~0022sFocussedId~0022~003A~0022${btnId}~0022~007D~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
  }
  function buildPopupCloseQueue(popupId) {
    return `PopupWindow_Close~E002Id~E004${popupId}~E003~E002ResponseData~E004delta~E005ClientAction~E004submit~E003~E002~E003~E001Form_Request~E002Id~E004sap.client.SsrClient.form~E005Async~E004false~E005FocusInfo~E004~0040~007B~0022sFocussedId~0022~003A~0022${popupId}-close~0022~002C~0022sSubControlHandle~0022~003A~0022close~0022~007D~E005Hash~E004~E005DomChanged~E004false~E005IsDirty~E004false~E003~E002ResponseData~E004delta~E003~E002~E003`;
  }

  /** Finds the Notes table, each note's title cell and the "Display note" button in the Notes-panel response. */
  function findNoteControls(rawXml) {
    const raw = String(rawXml || "");
    const tableM = raw.match(/id="(WD[0-9A-F]+)"\s+ct="ST"\s+lsdata='\{"0":"Notes"/i);
    const btnM = raw.match(/id="(WD[0-9A-F]+)"\s+ct="B"\s+lsdata='\{"0":"Display(?:&#x20;|\s)note"/i);
    const rows = [];
    const cellRe = /<td id="(WD[0-9A-F]+)"[^>]*subct="STC"[^>]*\scc="(\d+)"[^>]*>\s*<span id="[^"]+-r"[^>]*>\s*<span id="(WD[0-9A-F]+)" ct="TV"[^>]*TDTITLE_E[^>]*>([^<]*)</gi;
    let m;
    while ((m = cellRe.exec(raw)) !== null) {
      if (rows.some((r) => r.cellId === m[1])) continue;
      rows.push({ cellId: m[1], colIndex: Number(m[2]), focusId: m[3], title: cleanSapCellText(decodeHtmlEntities(m[4])), rowIndex: rows.length + 1 });
    }
    return { tableId: tableM ? tableM[1] : null, displayBtnId: btnM ? btnM[1] : null, rows };
  }

  /** Extracts the note body and popup window id from the "Display note" response. */
  function parseNotePopup(rawXml) {
    const raw = String(rawXml || "");
    const popM = raw.match(/id="(WDWL\d+)_POP_CONT"/i);
    const texts = Array.from(raw.matchAll(/<textarea[^>]*>([^<]*)<\/textarea>/gi))
      .map((x) => cleanSapCellText(decodeHtmlEntities(x[1])))
      .filter(Boolean);
    return { popupId: popM ? popM[1] : "WDWL1", text: texts.join("\n") };
  }

  /** A note title that already tells us the level (or No Level) does not need to be opened. */
  function titleRevealsLevel(title) {
    return /no\s*level|\bbeg(?:inner)?\b|\b[ABC][0-2](?:\.\d)?\b|primary|starter|secondary|fail|راسب|ساقط/i.test(title || "");
  }

  function applySapDeltaUpdates(xmlOrHtml, vdomContainer) {
    const text = String(xmlOrHtml || "");
    const updatedIds = [];

    if (text.includes("<html") || text.includes("sap.client.SsrClient.form")) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      if (doc && doc.body) {
        vdomContainer.innerHTML = doc.body.innerHTML;
      }
    }

    const controlRegex =
      /<(?:control-update|window-update|content-update)\s+[^>]*id="([^"]+)"[^>]*>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/(?:control-update|window-update|content-update)>/gi;
    let match;
    while ((match = controlRegex.exec(text)) !== null) {
      const targetId = match[1];
      const htmlContent = match[2];
      updatedIds.push(targetId);

      const isPartial = match[0].includes('updateMethod="PARTIAL"');
      const existing = vdomContainer.querySelector(`[id="${CSS.escape(targetId)}"]`);
      if (existing) {
        const temp = document.createElement("div");
        temp.innerHTML = htmlContent;
        if (isPartial) {
          // If this is a PARTIAL table fragment update, append new rows instead of replacing existing table
          const newRows = Array.from(temp.querySelectorAll("tr"));
          if (newRows.length > 0) {
            const tbody = existing.querySelector("tbody") || existing;
            newRows.forEach((tr) => tbody.appendChild(tr));
          } else {
            existing.appendChild(temp.firstElementChild || temp);
          }
        } else if (temp.firstElementChild) {
          existing.replaceWith(temp.firstElementChild);
        } else {
          existing.innerHTML = htmlContent;
        }
      } else {
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-delta-id", targetId);
        wrapper.innerHTML = htmlContent;
        vdomContainer.appendChild(wrapper);
      }
    }

    if (updatedIds.length === 0 && text.includes("<![CDATA[")) {
      const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
      let cm;
      while ((cm = cdataRegex.exec(text)) !== null) {
        const chunk = cm[1];
        if (chunk.includes("<div") || chunk.includes("<table") || chunk.includes("<span")) {
          const wrapper = document.createElement("div");
          wrapper.innerHTML = chunk;
          vdomContainer.appendChild(wrapper);
        }
      }
    }

    return updatedIds;
  }

  function discoverSearchControls(vdom, rawXml) {
    const controls = { ...DEFAULT_CONTROLS };
    if (!vdom && !rawXml) return controls;

    if (vdom) {
      const buttons = vdom.querySelectorAll('[ct="B"], button, [role="button"]');
      buttons.forEach((btn) => {
        const txt = cleanSapCellText(
          btn.textContent || btn.getAttribute("title") || btn.getAttribute("aria-label") || ""
        );
        const id = btn.getAttribute("id");
        if (!id) return;
        if (/^Search$/i.test(txt)) controls.searchBtn = id;
        if (/^Clear Entries$/i.test(txt)) controls.clearBtn = id;
        if (/^Reset to Default$/i.test(txt)) controls.resetBtn = id;
      });

      const titledInputs = vdom.querySelectorAll('input[id^="WD"][title]');
      titledInputs.forEach((inp) => {
        const id = inp.getAttribute("id");
        const title = cleanSapCellText(inp.getAttribute("title") || "");
        if (!id || !title) return;
        if (/^Student ID number$/i.test(title)) controls.studentId = id;
        else if (/^First Name$/i.test(title)) controls.firstName = id;
        else if (/^Last Name$/i.test(title)) controls.lastName = id;
        else if (/^First or last name$/i.test(title)) controls.anyName = id;
        else if (/^E-Mail Address$/i.test(title)) controls.email = id;
        else if (/^Telephone$/i.test(title)) controls.telephone = id;
      });

      const tbl = vdom.querySelector('table[ct="STCS"], table[data-hint*="DYNAMIC_TABLE"], table[crc]');
      if (tbl && tbl.id) controls.resultsTable = tbl.id;
    }

    // Also parse directly from latest rawXml so new dynamic WD IDs override any stale DOM nodes
    if (rawXml) {
      const decoded = decodeHtmlEntities(String(rawXml));
      const btnRe = /id="(WD[0-9A-F]+)"[^>]*ct="B"[^>]*lsdata='\{[^']*?"0"\s*:\s*"([^"]+)"/gi;
      let bm;
      while ((bm = btnRe.exec(decoded)) !== null) {
        const id = bm[1];
        const label = cleanSapCellText(bm[2]);
        if (/^Search$/i.test(label)) controls.searchBtn = id;
        else if (/^Clear Entries$/i.test(label)) controls.clearBtn = id;
        else if (/^Reset to Default$/i.test(label)) controls.resetBtn = id;
      }

      const inpRe = /<input[^>]+id="(WD[0-9A-F]+)"[^>]+title="([^"]+)"/gi;
      let im;
      while ((im = inpRe.exec(decoded)) !== null) {
        const id = im[1];
        const title = cleanSapCellText(im[2]);
        if (/^Student ID number$/i.test(title)) controls.studentId = id;
        else if (/^First Name$/i.test(title)) controls.firstName = id;
        else if (/^Last Name$/i.test(title)) controls.lastName = id;
        else if (/^First or last name$/i.test(title)) controls.anyName = id;
        else if (/^E-Mail Address$/i.test(title)) controls.email = id;
        else if (/^Telephone$/i.test(title)) controls.telephone = id;
      }

      const tblM = decoded.match(/id="(WD[0-9A-F]+)"[^>]+(?:ct="STCS"|data-hint="[^"]*DYNAMIC_TABLE)/i);
      if (tblM) controls.resultsTable = tblM[1];
    }

    return controls;
  }

  function parseSearchResults(vdom, rawXml, existingStudents = []) {
    const students = Array.isArray(existingStudents) ? [...existingStudents] : [];
    const seenStudentNums = new Set(students.map((s) => s.studentNumber));
    const decodedXml = decodeHtmlEntities(rawXml || "");

    const allLinks = Array.from(
      vdom.querySelectorAll('[ct="LN"], a[id^="WD"], span[id^="WD"][lsevents*="Link_Activate"]')
    );

    allLinks.forEach((linkEl) => {
      const linkText = cleanSapCellText(linkEl.textContent || "");
      const linkId = linkEl.getAttribute("id");
      if (!linkId) return;

      if (/^\d{7,12}$/.test(linkText)) {
        const tr = linkEl.closest("tr");
        if (!tr) return;

        const stcCells = Array.from(tr.querySelectorAll('td[subct="STC"]'));
        const cells = (stcCells.length > 0 ? stcCells : Array.from(tr.querySelectorAll("td"))).map((td) =>
          cleanSapCellText(td.textContent || "")
        );

        const studentIdx = cells.findIndex((c) => c === linkText);

        let bpNumber = "";
        let studentNumber = linkText;
        let firstName = "";
        let lastName = "";
        let dob = "";
        let email = "";
        let country = "";
        let teachingCentre = "";
        let courseHold = "";

        if (studentIdx >= 0) {
          bpNumber = cells[studentIdx - 1] || "";
          firstName = cells[studentIdx + 1] || "";
          lastName = cells[studentIdx + 2] || "";
          dob = cells[studentIdx + 3] || "";
          email = cells[studentIdx + 4] || "";
          country = cells[studentIdx + 5] || "";
          teachingCentre = cells[studentIdx + 6] || "";
          courseHold = cells[studentIdx + 7] || "";
        } else {
          cells.forEach((c) => {
            if (/^\d{2}\.\d{2}\.\d{4}$/.test(c) && !dob) dob = c;
            else if (c.includes("@") && !email) email = c;
            else if (/^\d{7,10}$/.test(c) && c !== studentNumber && !bpNumber) bpNumber = c;
          });
        }

        if (!seenStudentNums.has(studentNumber)) {
          seenStudentNums.add(studentNumber);
          const fName = formatStudentName(firstName);
          const lName = formatStudentName(lastName);
          const full = formatStudentName(`${firstName} ${lastName}`.trim());
          students.push({
            linkId,
            bpNumber,
            studentNumber,
            firstName: fName,
            lastName: lName,
            fullName: full,
            rawFullName: `${firstName} ${lastName}`.trim(),
            dob,
            email,
            country,
            teachingCentre,
            courseHold,
          });
        }
      }
    });

    // Fallback or supplementary extraction via SAP WebAssistant tags in rawXml
    if (decodedXml) {
      const linkRegex = /<a[^>]+id="([A-Za-z0-9_]+)"[^>]+ct="LN"[^>]+lsdata='\{[^']*?"1":"(0061\d{6}|\d{7,10})"[^']*?\}'/gi;
      let lm;
      while ((lm = linkRegex.exec(decodedXml)) !== null) {
        const linkId = lm[1];
        const studentNumber = lm[2];

        const existing = students.find((s) => s.studentNumber === studentNumber);
        if (existing && existing.fullName) continue;

        const pre = decodedXml.slice(0, lm.index);
        let trStart = pre.lastIndexOf("<tr");
        if (trStart < 0) trStart = Math.max(0, lm.index - 500);
        let trEnd = decodedXml.indexOf("</tr>", lm.index);
        if (trEnd < 0) trEnd = Math.min(decodedXml.length, lm.index + 12000);
        const rowSnippet = decodedXml.slice(trStart, trEnd + 5);

        const getField = (fName) => {
          const m = rowSnippet.match(new RegExp(fName + '[\\s\\S]*?>([^<]+)<\\/span>', 'i'));
          return m ? cleanSapCellText(m[1]) : "";
        };

        const vorna = getField("VORNA_FPM_CE");
        const nachn = getField("NACHN_FPM_CE");
        const fullName = `${vorna} ${nachn}`.trim();
        const formattedFull = formatStudentName(fullName);
        const dob = getField("GBDAT_FPM_CE") || (rowSnippet.match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1] || "";
        const email = getField("EMAIL_FPM_CE") || (rowSnippet.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/) || [])[1] || "";
        const teachingCentre = getField("MASTER_INST_FPM_CE");
        const country = getField("NATIO_FPM_CE");

        if (existing) {
          if (!existing.fullName && fullName) {
            existing.fullName = formattedFull;
            existing.rawFullName = fullName;
            existing.firstName = formatStudentName(vorna);
            existing.lastName = formatStudentName(nachn);
          }
          if (!existing.dob && dob) existing.dob = dob;
          if (!existing.email && email) existing.email = email;
          if (!existing.teachingCentre && teachingCentre) existing.teachingCentre = teachingCentre;
          if (!existing.country && country) existing.country = country;
        } else {
          seenStudentNums.add(studentNumber);
          students.push({
            linkId,
            bpNumber: "",
            studentNumber,
            firstName: formatStudentName(vorna),
            lastName: formatStudentName(nachn),
            fullName: formattedFull,
            rawFullName: fullName,
            dob,
            email,
            country,
            teachingCentre,
            courseHold: "",
          });
        }
      }
    }

    return students;
  }

  function parseStudentDetailScreen(vdom, rawXml) {
    const unescapedXml = String(rawXml || "")
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const decodedXml = decodeHtmlEntities(unescapedXml);
    const fullText = cleanSapCellText(vdom.textContent || "");

    let headerTitle = "";
    let studentIdFromHeader = "";
    let nameFromHeader = "";
    let levelFromHeader = "";

    const headerMatch = (decodedXml + " " + fullText).match(
      /Show\s+student:\s*([^,<"\r\n]+)(?:,\s*([^,<"\r\n]+))?(?:,\s*([^<"\r\n]+))?/i
    );
    if (headerMatch) {
      headerTitle = headerMatch[0].trim();
      studentIdFromHeader = (headerMatch[1] || "").trim();
      nameFromHeader = (headerMatch[2] || "").trim();
      levelFromHeader = (headerMatch[3] || "").trim();
    }

    const fields = {};

    const titledInputs = Array.from(vdom.querySelectorAll("input[title]"));
    titledInputs.forEach((inp) => {
      const t = cleanSapCellText(inp.getAttribute("title") || "");
      const v = cleanSapCellText(inp.value || inp.getAttribute("value") || "");
      if (t && (v || !(t in fields))) {
        fields[t] = v;
      }
    });

    const inputRegex = /<input[^>]+title="([^"]+)"[^>]+value="([^"]*)"/gi;
    let im;
    while ((im = inputRegex.exec(decodedXml)) !== null) {
      const t = cleanSapCellText(im[1]);
      const v = cleanSapCellText(im[2]);
      if (t && (v || !(t in fields))) {
        fields[t] = v;
      }
    }

    const labels = Array.from(vdom.querySelectorAll("label, [ct='L']"));
    labels.forEach((lbl) => {
      const rawLabel = cleanSapCellText((lbl.textContent || "").replace(/[*:\u00a0]/g, ""));
      if (!rawLabel || rawLabel.length > 60) return;

      let val = "";
      const forId = lbl.getAttribute("for") || lbl.getAttribute("f");
      if (forId) {
        const targetEl = vdom.querySelector(`[id="${CSS.escape(forId)}"]`);
        if (targetEl) {
          if (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA") {
            val = targetEl.value || targetEl.getAttribute("value") || "";
          } else {
            const innerInput = targetEl.querySelector("input, textarea");
            val = innerInput
              ? innerInput.value || innerInput.getAttribute("value") || ""
              : targetEl.getAttribute("value") || targetEl.textContent || "";
          }
        }
      }

      val = cleanSapCellText(val);
      if (rawLabel && (val || !(rawLabel in fields))) {
        fields[rawLabel] = val;
      }
    });

    const notesAndHolds = [];
    const rawNotesList = [];

    // 1. Textarea / Note text edits
    const textEdits = Array.from(vdom.querySelectorAll("textarea, [ct='TEXTEDIT'], div[id*='Note'], div[id*='note']"));
    textEdits.forEach((te) => {
      const val = cleanSapCellText(te.value || te.textContent || "");
      if (val && val.length > 2 && !rawNotesList.includes(val)) {
        rawNotesList.push(val);
      }
    });

    // 2. Table notes & holds
    const hdrTables = Array.from(vdom.querySelectorAll('table[id$="-mrss-hdr-none-content"], table'));
    hdrTables.forEach((hdrTbl) => {
      const headers = Array.from(hdrTbl.querySelectorAll("th, [role='columnheader']")).map((h) =>
        cleanSapCellText(h.textContent || "")
      );
      if (headers.some((h) => /Note|Hold|Comment|Remark|Text/i.test(h))) {
        const baseId = (hdrTbl.getAttribute("id") || "").replace(/-mrss-hdr-none-content$/, "");
        const contTbl = baseId
          ? vdom.querySelector(`[id="${CSS.escape(baseId + "-mrss-cont-none-content")}"]`)
          : hdrTbl;
        if (!contTbl) return;

        const rows = Array.from(contTbl.querySelectorAll('tr[id*="-Row-"], tbody tr'));
        rows.forEach((r) => {
          if (r.querySelector("th, [role='columnheader']")) return;
          const stcCells = Array.from(r.querySelectorAll('td[subct="STC"]'));
          const rawTds = stcCells.length > 0 ? stcCells : Array.from(r.querySelectorAll("td"));
          const cells = rawTds.map((td) => {
            const cb = td.querySelector("input[type='checkbox'], [role='checkbox'], [ct='CBX']");
            if (cb) {
              const checked =
                cb.checked || cb.getAttribute("aria-checked") === "true" || cb.classList.contains("lsCB--checked");
              return checked ? "Active Hold" : "No Hold";
            }
            return cleanSapCellText(td.textContent || "");
          });
          const nonEmpty = cells.filter(Boolean);
          if (nonEmpty.length > 0 && !nonEmpty.every((c) => c === "No Hold")) {
            const rowStr = nonEmpty.join(" • ");
            notesAndHolds.push(rowStr);
            rawNotesList.push(rowStr);
          }
        });
      }
    });

    // 3. Smart level detection from notes (e.g. A0 / Beg A)
    let detectedLevelFromNotes = null;
    const combinedNotesStr = rawNotesList.join(" ").toLowerCase();
    if (combinedNotesStr.includes("a0") || combinedNotesStr.includes("a 0") || combinedNotesStr.includes("beginner a") || combinedNotesStr.includes("beg a") || combinedNotesStr.includes("beg-a")) {
      detectedLevelFromNotes = "Beginner A (A0)";
    } else if (combinedNotesStr.includes("beginner b") || combinedNotesStr.includes("beg b") || combinedNotesStr.includes("beg-b")) {
      detectedLevelFromNotes = "Beginner B";
    } else if (combinedNotesStr.includes("beginner c") || combinedNotesStr.includes("beg c")) {
      detectedLevelFromNotes = "Beginner C";
    } else if (combinedNotesStr.includes("beginner d") || combinedNotesStr.includes("beg d")) {
      detectedLevelFromNotes = "Beginner D";
    } else if (combinedNotesStr.includes("beginner e") || combinedNotesStr.includes("beg e")) {
      detectedLevelFromNotes = "Beginner E";
    }

    let historyPopupId = DEFAULT_CONTROLS.historyPopupId;
    let bookingHistoryItemId = DEFAULT_CONTROLS.bookingHistoryItemId;
    let historyMenuBtn = DEFAULT_CONTROLS.historyMenuBtn;

    const histBtnMatch =
      decodedXml.match(
        /id="(WD[0-9A-F]+)"[^>]*ct="B"[^>]*lsdata='[^']*"0"\s*:\s*"History"[^']*"15"\s*:\s*"(WD[0-9A-F]+)"/i
      ) ||
      decodedXml.match(
        /ct="B"[^>]*id="(WD[0-9A-F]+)"[^>]*lsdata='[^']*"0"\s*:\s*"History"[^']*"15"\s*:\s*"(WD[0-9A-F]+)"/i
      );
    if (histBtnMatch) {
      historyMenuBtn = histBtnMatch[1];
      historyPopupId = histBtnMatch[2];
    }

    const bookingItemMatch =
      decodedXml.match(/<tr[^>]*ct="POMNI"[^>]*lsdata='[^']*Booking\s+history[^']*'[^>]*id="(WD[0-9A-F]+)"/i) ||
      decodedXml.match(/<tr[^>]*id="(WD[0-9A-F]+)"[^>]*ct="POMNI"[^>]*lsdata='[^']*Booking\s+history/i) ||
      decodedXml.match(/<tr[^>]*id="(WD[0-9A-F]+)"[^>]*aria-label="Booking\s+history"/i);

    if (bookingItemMatch) {
      bookingHistoryItemId = bookingItemMatch[1];
      if (!histBtnMatch) {
        const beforeText = decodedXml.slice(0, bookingItemMatch.index);
        const pomnMatches = Array.from(beforeText.matchAll(/<table[^>]*id="(WD[0-9A-F]+)"[^>]*ct="POMN"/gi));
        if (pomnMatches.length > 0) {
          historyPopupId = pomnMatches[pomnMatches.length - 1][1];
        }
        const hexNum = parseInt(bookingHistoryItemId.replace(/^WD/, ""), 16);
        if (!isNaN(hexNum)) {
          historyMenuBtn = "WD" + (hexNum - 1).toString(16).toUpperCase().padStart(4, "0");
        }
      }
    }

    const backToSearchMatch =
      decodedXml.match(/id="(WD[0-9A-F]+)"[^>]*ct="B"[^>]*lsdata='[^']*"0"\s*:\s*"Back\s+to\s+search"/i) ||
      decodedXml.match(/ct="B"[^>]*id="(WD[0-9A-F]+)"[^>]*lsdata='[^']*"0"\s*:\s*"Back\s+to\s+search"/i);
    const backToSearchBtn = backToSearchMatch ? backToSearchMatch[1] : null;

    const regBtnMatch =
      decodedXml.match(/id="(WD[0-9A-F]+)"[^>]*ct="B"[^>]*lsdata='[^']*"0"\s*:\s*"Registration"/i) ||
      decodedXml.match(/ct="B"[^>]*id="(WD[0-9A-F]+)"[^>]*lsdata='[^']*"0"\s*:\s*"Registration"/i);
    const registrationBtn = regBtnMatch ? regBtnMatch[1] : "WD0A50";

    const dob = fields["Date of Birth"] || fields["Date of birth"] || "";

    const rawFull = nameFromHeader || `${fields["First Name"] || ""} ${fields["Last Name"] || ""}`.trim();
    const formattedFull = formatStudentName(rawFull);

    return {
      headerTitle,
      studentId: studentIdFromHeader,
      fullName: formattedFull,
      rawFullName: rawFull,
      outsideLevel: (levelFromHeader || fields["Recommended academic level"] || fields["Qualification"] || "").trim(),
      levelFromHeader,
      level: (levelFromHeader || fields["Recommended academic level"] || fields["Qualification"] || "No level assigned").trim(),
      detectedLevelFromNotes: null,
      rawNotesList,
      dob,
      firstName: formatStudentName(fields["First Name"] || ""),
      lastName: formatStudentName(fields["Last Name"] || ""),
      language: fields["Communication lang."] || "",
      country: fields["Country"] || "",
      phonePrefix: fields["Mobile phone prefix"] || "",
      phone: fields["Mobile phone"] || "",
      email: fields["Standard E-mail address"] || fields["E-Mail Address"] || "",
      notesAndHolds,
      menuIds: {
        historyPopupId,
        bookingHistoryItemId,
        historyMenuBtn,
        backToSearchBtn,
        registrationBtn,
      },
    };
  }

  function parseNotesScreen(vdom, rawXml) {
    const unescaped = String(rawXml || "")
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const decodedXml = decodeHtmlEntities(unescaped);

    const backBtnM =
      decodedXml.match(/id="(WD[0-9A-F]+)"[^>]*ct="B"[^>]*lsdata='\{[^']*?"0"\s*:\s*"Back"/i) ||
      decodedXml.match(/ct="B"[^>]*id="(WD[0-9A-F]+)"[^>]*lsdata='\{[^']*?"0"\s*:\s*"Back"/i);
    const backFromHistoryBtn = backBtnM ? backBtnM[1] : null;

    const notesList = [];
    const rawNotesList = [];

    function addNote(type, title, date, author, text = "") {
      const cleanTitle = cleanSapCellText(title || "").trim();
      if (!cleanTitle || /^empty$/i.test(cleanTitle) || /^no\s*data\s*available$/i.test(cleanTitle)) return;
      // Do not allow advisor usernames or raw dates to become note titles
      if (/^[A-Za-z0-9_]{3,16}$/.test(cleanTitle) && (cleanTitle === author || /^(?:MNASSER|FSADEK|RCHERUKUPALL|FELGENDY|YELNAGGAR)$/i.test(cleanTitle))) return;
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(cleanTitle)) return;
      if (/^to\s*select/i.test(cleanTitle) || /^content\s*of\s*list$/i.test(cleanTitle)) return;

      const cleanType = cleanSapCellText(type || "General note").trim() || "General note";
      const cleanDate = cleanSapCellText(date || "").trim();
      const cleanAuthor = cleanSapCellText(author || "").trim();

      const key = `${cleanTitle}|${cleanDate}`;
      if (notesList.some((n) => `${n.title}|${n.createdOn}` === key)) return;

      const det = detectLevelFromNotesText(`${cleanTitle} ${text || ""}`);
      notesList.push({
        type: cleanType,
        title: cleanTitle,
        createdOn: cleanDate,
        createdBy: cleanAuthor,
        text: text || cleanTitle,
        detectedLevel: det.detectedLevel,
        isNoLevel: det.isNoLevel,
        dateNum: parseSapDateToNum(cleanDate),
      });
      rawNotesList.push([cleanType, cleanTitle, cleanDate, cleanAuthor].filter(Boolean).join(" • "));
    }

    // 1. Table row-based extraction from decoded XML (isolated from stale VDOM nodes)
    const tempContainer = document.createElement("div");
    tempContainer.innerHTML = decodedXml;
    const searchRoots = [tempContainer];

    searchRoots.forEach((root) => {
      const rows = Array.from(root.querySelectorAll("tr"));
      rows.forEach((tr) => {
        const cellEls = Array.from(tr.querySelectorAll('td[subct="STC"], td'));
        if (cellEls.length < 3) return;
        const cells = cellEls.map((td) => cleanSapCellText(td.textContent || "").trim());

        // Find date column (Created On)
        const dateIdx = cells.findIndex((c) => /^\d{2}\.\d{2}\.\d{4}$/.test(c));
        if (dateIdx >= 2) {
          // Standard SAP Notes Table layout:
          // [0] checkbox, [1] Type of note, [2] Note Title, [3] Created On, [4] Created By, [5] Changed By, [6] Changed on
          const type = cells[dateIdx - 2];
          const title = cells[dateIdx - 1];
          const date = cells[dateIdx];
          const author = cells[dateIdx + 1] || "";
          if (type && title) {
            addNote(type, title, date, author);
          }
        } else if (dateIdx === 1 && cells[0]) {
          // Alternative layout: [0] Note Title, [1] Created On, [2] Created By
          addNote("General note", cells[0], cells[1], cells[2] || "");
        }
      });
    });

    // 2. Direct XML regex fallback if DOM rows produced nothing
    if (notesList.length === 0) {
      const tvMatches = Array.from(decodedXml.matchAll(/<span[^>]+ct="TV"[^>]*>([^<]+)<\/span>/gi))
        .map((m) => cleanSapCellText(m[1]).trim())
        .filter(Boolean);
      const noise = new Set(["status", "note type", "valid from", "valid until", "empty", "content of list", "to select all, press the spacebar", "to select a row, press the spacebar."]);
      const cleaned = tvMatches.filter((v) => !noise.has(v.toLowerCase()));

      for (let i = 0; i < cleaned.length; i++) {
        const v = cleaned[i];
        const nextIsDate = cleaned[i + 1] && /\d{2}\.\d{2}\.\d{4}/.test(cleaned[i + 1]);
        if (nextIsDate && !/^[A-Z0-9_]{3,15}$/.test(v)) {
          const type = i > 0 && /^(?:General note|Academic|Data Migration|Registration|Attendance)$/i.test(cleaned[i - 1]) ? cleaned[i - 1] : "General note";
          const title = v;
          const date = cleaned[i + 1];
          const author = cleaned[i + 2] && /^[A-Za-z0-9_]{3,16}$/.test(cleaned[i + 2]) ? cleaned[i + 2] : "";
          addNote(type, title, date, author);
        }
      }
    }

    // Direct XML detection for No Level note (as logged by British Council advisors)
    const noLevelMatch = decodedXml.match(/\b(No\s*Level)\b/i);
    if (noLevelMatch && !notesList.some((n) => /no\s*level/i.test(n.title))) {
      const nearChunk = decodedXml.slice(Math.max(0, noLevelMatch.index - 120), Math.min(decodedXml.length, noLevelMatch.index + 200));
      const dateM = nearChunk.match(/(\d{2}\.\d{2}\.\d{4})/);
      const userM = nearChunk.match(/\b([A-Z0-9_]{4,15})\b/);
      const author = userM && userM[1] !== "HTML" && userM[1] !== "SPAN" && userM[1] !== "NONE" ? userM[1] : "Advisor";
      const nlDate = dateM ? dateM[1] : "";
      notesList.unshift({
        type: "Placement Test Result",
        title: "No Level",
        createdOn: nlDate,
        createdBy: author,
        text: "Student did not achieve passing score on placement test assessment.",
        detectedLevel: "No Level (Failed PT)",
        isNoLevel: true,
        dateNum: parseSapDateToNum(nlDate),
      });
      rawNotesList.unshift(["No Level", nlDate, author].filter(Boolean).join(" • "));
    }

    // 3. Textarea or multi-line note content inside the current Notes response
    const textareas = Array.from(tempContainer.querySelectorAll("textarea, [ct='TE']"));
    textareas.forEach((ta) => {
      const val = cleanSapCellText(ta.value || ta.textContent || "").trim();
      if (val && !rawNotesList.includes(val)) {
        rawNotesList.push(val);
        if (!notesList.some((n) => n.title === val || n.text === val)) {
          const det = detectLevelFromNotesText(val);
          notesList.push({
            type: "Note Detail",
            title: val,
            text: val,
            detectedLevel: det.detectedLevel,
            isNoLevel: det.isNoLevel,
            dateNum: 0,
          });
        }
      }
    });

    // 4. Level detection from notes (sorted chronologically newest first by Created On date)
    const notesWithLevel = notesList
      .filter((n) => n.detectedLevel)
      .sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));

    if (notesWithLevel.length > 0) {
      const newest = notesWithLevel[0];
      return {
        notesList,
        rawNotesList,
        detectedLevel: newest.detectedLevel,
        isNoLevel: newest.isNoLevel,
        detectedLevelDate: newest.createdOn || "",
        detectedLevelDateNum: newest.dateNum || 0,
      };
    }

    const notesOnlyText = (rawNotesList.join(" ") + " " + notesList.map((n) => `${n.title || ""} ${n.text || ""}`).join(" "));
    const lvl = detectLevelFromNotesText(notesOnlyText, decodedXml);
    return {
      notesList,
      rawNotesList,
      detectedLevel: lvl.detectedLevel,
      isNoLevel: lvl.isNoLevel,
      detectedLevelDate: "",
      detectedLevelDateNum: 0,
    };
  }

  function parseSapDateToNum(dateStr) {
    if (!dateStr) return 0;
    const s = String(dateStr).trim();
    const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmy) {
      return parseInt(dmy[3], 10) * 10000 + parseInt(dmy[2], 10) * 100 + parseInt(dmy[1], 10);
    }
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
      return parseInt(ymd[1], 10) * 10000 + parseInt(ymd[2], 10) * 100 + parseInt(ymd[3], 10);
    }
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
    }
    return 0;
  }

  /** Level rules: detects No Level, Early Years, Starter A/B, Primary Plus 1-6, Secondary/Upper Secondary Plus, Beginner A-E, and CEFR levels in notes. */
  function detectLevelFromNotesText(text, extraXml) {
    const t = String(text || "");
    // Note: "No level assigned" in the SAP header is merely an unassigned placeholder, NOT a failed PT!
    if (!/no\s*level\s*assigned/i.test(t) && (/(?:\bno\s*level\b|\bnot\s*placed\b|\bunplaced\b|ساقط|راسب|لم يجتز)/i.test(t) || /\bNo\s*Level\b/i.test(String(extraXml || "")))) {
      return { detectedLevel: "No Level (Failed PT)", isNoLevel: true };
    }
    // Early Years
    if (/\b(?:ey\s*2|early\s*years\s*2|ducks)\b/i.test(t)) return { detectedLevel: "Early Years 2", isNoLevel: false };
    if (/\b(?:ey\s*3|early\s*years\s*3|owls)\b/i.test(t)) return { detectedLevel: "Early Years 3", isNoLevel: false };
    // Starter A / B
    if (/\b(?:lp\s*starter\s*a|primary\s*starter\s*a|starter\s*a|psta|sta)\b/i.test(t)) return { detectedLevel: "Starter A", isNoLevel: false };
    if (/\b(?:up\s*starter\s*b|lp\s*starter\s*b|primary\s*starter\s*b|starter\s*b|pstb|stb)\b/i.test(t)) return { detectedLevel: "Starter B", isNoLevel: false };
    // Primary Plus 1-6
    const ppM = t.match(/\b(?:(?:lp|up)\s*)?(?:primary\s*plus|pri\s*plus|pp)[\s\-_]*([1-6])\b/i);
    if (ppM) return { detectedLevel: `Primary Plus ${ppM[1]}`, isNoLevel: false };
    if (/\bcamels\b/i.test(t)) return { detectedLevel: "Primary Plus 1", isNoLevel: false };
    if (/\bcrocodiles\b/i.test(t)) return { detectedLevel: "Primary Plus 2", isNoLevel: false };
    if (/\beagles\b/i.test(t)) return { detectedLevel: "Primary Plus 4", isNoLevel: false };
    if (/\bwhales\b/i.test(t)) return { detectedLevel: "Primary Plus 6", isNoLevel: false };
    // Upper Secondary Plus
    if (/\b(?:upper\s*secondary(?:\s*plus)?\s*a1|usec(?:\s*plus)?\s*a1|usa1|us\s*elementary)\b/i.test(t)) return { detectedLevel: "Upper Secondary Plus A1", isNoLevel: false };
    if (/\b(?:upper\s*secondary(?:\s*plus)?\s*a2|usec(?:\s*plus)?\s*a2|usa2|us\s*pre[\s\-]*int(?:ermediate)?(?:\+)?)\b/i.test(t)) return { detectedLevel: "Upper Secondary Plus A2", isNoLevel: false };
    if (/\b(?:upper\s*secondary(?:\s*plus)?\s*b1(?:\.1)?|usec(?:\s*plus)?\s*b1(?:\.1)?|usb1(?:\.1)?)\b/i.test(t)) return { detectedLevel: "Upper Secondary Plus B1.1", isNoLevel: false };
    if (/\b(?:upper\s*secondary(?:\s*plus)?\s*b2(?:\.1)?|usec(?:\s*plus)?\s*b2(?:\.1)?|usb2(?:\.1)?)\b/i.test(t)) return { detectedLevel: "Upper Secondary Plus B2.1", isNoLevel: false };
    if (/\b(?:upper\s*secondary(?:\s*plus)?\s*c1(?:\.1)?|usec(?:\s*plus)?\s*c1(?:\.1)?|usc1(?:\.1)?|us\s*c1)\b/i.test(t)) return { detectedLevel: "Upper Secondary Plus C1.1", isNoLevel: false };
    // Lower Secondary Plus
    if (/\b(?:(?:lower\s*)?secondary(?:\s*plus)?\s*a1|sec(?:\s*plus)?\s*a1|sa1|secondary\s*elementary)\b/i.test(t)) return { detectedLevel: "Secondary Plus A1", isNoLevel: false };
    if (/\b(?:(?:lower\s*)?secondary(?:\s*plus)?\s*a2|sec(?:\s*plus)?\s*a2|sa2|secondary\s*pre[\s\-]*int(?:ermediate)?(?:\+)?)\b/i.test(t)) return { detectedLevel: "Secondary Plus A2", isNoLevel: false };
    if (/\b(?:(?:lower\s*)?secondary(?:\s*plus)?\s*b1(?:\.2)?|sec(?:\s*plus)?\s*b1(?:\.2)?|secb1(?:\.2)?)\b/i.test(t)) return { detectedLevel: "Secondary Plus B1.2", isNoLevel: false };
    if (/\b(?:(?:lower\s*)?secondary(?:\s*plus)?\s*b2(?:\.2)?|sec(?:\s*plus)?\s*b2(?:\.2)?|secb2(?:\.2)?)\b/i.test(t)) return { detectedLevel: "Secondary Plus B2.2", isNoLevel: false };
    // Beginner A-E / A0
    const begMatch = t.match(/\b(?:BEG(?:INNER)?|LEVEL)[\s\-_]*([A-E])\b/i);
    if (begMatch) return { detectedLevel: `Beginner ${begMatch[1].toUpperCase()}`, isNoLevel: false };
    if (/\bA0\b/i.test(t)) return { detectedLevel: "Beginner (A0)", isNoLevel: false };
    // Explicit CEFR sub-levels or standalone CEFR
    if (/\bB1\.1\b/i.test(t)) return { detectedLevel: "Upper Secondary Plus B1.1", isNoLevel: false };
    if (/\bB1\.2\b/i.test(t)) return { detectedLevel: "Secondary Plus B1.2", isNoLevel: false };
    if (/\bB2\.1\b/i.test(t)) return { detectedLevel: "Upper Secondary Plus B2.1", isNoLevel: false };
    if (/\bB2\.2\b/i.test(t)) return { detectedLevel: "Secondary Plus B2.2", isNoLevel: false };
    if (/\bC1\.1\b/i.test(t)) return { detectedLevel: "Upper Secondary Plus C1.1", isNoLevel: false };
    const cefrM = t.trim().match(/^(?:level[\s:=-]*)?(A1|A2|B1|B2|C1)$/i) || t.match(/\b(?:level|placed(?:\s+in)?|result|pt)[\s:=-]+(A1|A2|B1|B2|C1)\b/i);
    if (cefrM) return { detectedLevel: cefrM[1].toUpperCase(), isNoLevel: false };
    return { detectedLevel: null, isNoLevel: false };
  }

  function parseBookingHistoryScreen(vdom, rawXml, existingBookings = []) {
    const bookings = Array.isArray(existingBookings) ? [...existingBookings] : [];
    const seenRowKeys = new Set(
      bookings.map(
        (b) =>
          `${b.courseCode}|${b.classTitle}|${b.className}|${b.session}|${b.status}|${b.bookingDate}|${b.bookingTime}`
      )
    );

    const unescaped = String(rawXml || "")
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const decodedXml = decodeHtmlEntities(unescaped);

    const backBtnM =
      decodedXml.match(/id="(WD[0-9A-F]+)"[^>]*ct="B"[^>]*lsdata='\{[^']*?"0"\s*:\s*"Back"/i) ||
      decodedXml.match(/ct="B"[^>]*id="(WD[0-9A-F]+)"[^>]*lsdata='\{[^']*?"0"\s*:\s*"Back"/i);
    const backFromHistoryBtn = backBtnM ? backBtnM[1] : null;

    // 1. Semantic ATS extraction using SAP WebAssistant data-hints (FPM_LIST_UIBB_ATS)
    // Every row in SAP WebDynpro ATS tables is identified by id="<tableId>-mrss-cont-none-Row-<index>"
    // and carries semantic field tags like LIST_VIEW.E_STEXT_FPM_CE, LIST_VIEW.SMSTATUST_FPM_CE, etc.
    const rowIdRegex = /id="[A-Za-z0-9_\-]+-mrss-cont-none-Row-(\d+)"/g;
    const rowPositions = [];
    let rm;
    while ((rm = rowIdRegex.exec(decodedXml)) !== null) {
      rowPositions.push({ rowIndex: parseInt(rm[1], 10), index: rm.index });
    }

    if (rowPositions.length > 0) {
      for (let i = 0; i < rowPositions.length; i++) {
        const start = rowPositions[i].index;
        const end = i + 1 < rowPositions.length ? rowPositions[i + 1].index : decodedXml.indexOf('id="WD', start + 12000);
        const chunk = decodedXml.slice(start, end > start ? end : start + 35000);

        function getHint(field) {
          const re = new RegExp('LIST_VIEW\\.' + field + '[^"]*"[^>]*>([\\s\\S]*?)<', 'i');
          const m = chunk.match(re);
          if (m && m[1]) {
            return cleanSapCellText(m[1].replace(/<[^>]+>/g, ""));
          }
          return "";
        }

        const courseCode = getHint("E_SHORT_FPM_CE") || getHint("SM_SHORT_FPM_CE");
        const courseDescription = getHint("SM_STEXT_FPM_CE");
        const classTitle = getHint("E_SHORT_FPM_CE") || courseCode;
        const className = getHint("E_STEXT_FPM_CE");
        const teacherName = getHint("TEACHER_FPM_CE");
        const teachingCentre = getHint("O_STEXT_FPM_CE");
        const sessionParts = [getHint("PERYR_FPM_CE"), getHint("PERIT_FPM_CE"), getHint("PERID_BEGDA_FPM_CE"), getHint("PERID_ENDDA_FPM_CE")].filter(Boolean);
        const session = sessionParts.join(" ");
        const bookingSource = getHint("ORIGIN_FPM_CE");
        const bookingType = getHint("BOOKING_TYPE_FPM_CE");
        const status = getHint("SMSTATUST_FPM_CE");
        const bookingDate = getHint("BOOKDATE_FPM_CE");
        const bookingTime = getHint("BOOKTIME_FPM_CE");

        if (courseCode || courseDescription || className) {
          // Key MUST include className and status so prebooked options at the exact same minute are preserved
          const key = `${courseCode}|${classTitle}|${className}|${session}|${status}|${bookingDate}|${bookingTime}`;
          if (!seenRowKeys.has(key)) {
            seenRowKeys.add(key);
            bookings.push({
              courseCode,
              courseDescription,
              classTitle,
              className,
              teacherName,
              teachingCentre,
              session,
              bookingSource,
              bookingType,
              status,
              bookingDate,
              bookingTime,
            });
          }
        }
      }
    }

    // 2. DOM-based extraction (for live VDOM or standard non-ATS tables)
    if (bookings.length === 0) {
      const tempContainer = document.createElement("div");
      applySapDeltaUpdates(rawXml, tempContainer);
      const searchRoots = [tempContainer, vdom].filter(Boolean);

      searchRoots.forEach((root) => {
        const hdrTables = Array.from(root.querySelectorAll('table[id$="-mrss-hdr-none-content"], table'));

        hdrTables.forEach((hdrTbl) => {
          const ths = Array.from(hdrTbl.querySelectorAll("th, [role='columnheader']")).map((th) =>
            cleanSapCellText(th.textContent || "")
          );
          if (ths.length === 0) return;

          const isCourseTable = ths.some((h) => /Course|Teaching centre|Bkg\.\s*Status|Booking Date/i.test(h));
          if (!isCourseTable) return;

          const hdrId = hdrTbl.getAttribute("id") || "";
          let contTbl = hdrTbl;
          if (hdrId.endsWith("-mrss-hdr-none-content")) {
            const baseId = hdrId.replace(/-mrss-hdr-none-content$/, "");
            const foundCont = root.querySelector(`[id="${CSS.escape(baseId + "-mrss-cont-none-content")}"]`);
            if (foundCont) contTbl = foundCont;
          }

          // Select outer table rows only (avoid nested tables)
          const rows = Array.from(contTbl.querySelectorAll('tr[id*="-mrss-cont-none-Row-"]'));
          const targetRows = rows.length > 0 ? rows : Array.from(contTbl.querySelectorAll('tbody > tr')).filter((r) => !r.querySelector("th"));

          targetRows.forEach((tr) => {
            const stcTds = Array.from(tr.querySelectorAll('td[subct="STC"]'));
            const allTds = stcTds.length >= 5 ? stcTds : Array.from(tr.children).filter((el) => el.tagName === "TD");
            if (allTds.length < 5) return;

            const tds = allTds.map((td) => cleanSapCellText(td.textContent || ""));
            const nonEmpty = tds.filter(Boolean);
            if (nonEmpty.length < 3) return;

            const courseCode = tds[0] || "";
            const courseDescription = tds[1] || "";
            const classTitle = tds[2] || "";
            const className = tds[3] || "";
            const teacherName = tds[4] || "";
            const teachingCentre = tds[5] || "";
            const session = tds[6] || "";
            const bookingSource = tds[7] || "";
            const bookingType = tds[8] || "";
            const status = tds[9] || "";
            const bookingDate = tds[10] || "";
            const bookingTime = tds[11] || "";

            if (!courseCode && !courseDescription && !session) return;
            const key = `${courseCode}|${classTitle}|${className}|${session}|${status}|${bookingDate}|${bookingTime}`;
            if (!seenRowKeys.has(key)) {
              seenRowKeys.add(key);
              bookings.push({
                courseCode,
                courseDescription,
                classTitle,
                className,
                teacherName,
                teachingCentre,
                session,
                bookingSource,
                bookingType,
                status,
                bookingDate,
                bookingTime,
              });
            }
          });
        });
      });
    }

    return { bookings, backFromHistoryBtn };
  }

  function parseRecommendedAcademicLevel(vdom, rawXml) {
    const unescapedXml = String(rawXml || "")
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const decodedXml = decodeHtmlEntities(unescapedXml);

    const recLevels = [];
    const container = document.createElement("div");
    container.innerHTML = decodedXml;

    const searchRoots = [container, vdom].filter(Boolean);

    // 1. Precise row-by-row parsing from table rows (TR elements)
    const lvlRegex = /^(?:[A-C][1-2](?:\.[1-2])?|Beginner(?:\s+[A-E]|\s*\(A0\))?|Primary\s+Plus\s+\d|Primary\s+Starter\s+[AB]|Secondary\s+Plus\s+[A-C]\d?|Pre-School\s+\d|IELTS[\w\s-]*)$/i;
    searchRoots.forEach((root) => {
      if (recLevels.length > 0) return;
      const rows = Array.from(root.querySelectorAll("tr"));
      rows.forEach((tr) => {
        const cellEls = Array.from(tr.querySelectorAll('td[subct="STC"], td'));
        if (cellEls.length < 3) return;
        const cells = cellEls.map((td) => cleanSapCellText(td.textContent || "").trim());

        const lvlIdx = cells.findIndex((c) => lvlRegex.test(c));
        if (lvlIdx >= 0) {
          const level = cells[lvlIdx];
          const dates = cells.filter((c) => /^\d{2}\.\d{2}\.\d{4}/.test(c));
          const origin = cells.find((c) => /^(?:Placement\s*test|Manually|Webshop|Front\s*office|Back\s*office)$/i.test(c)) || "";
          const reference = cells.find((c) => /Consultation|Course|Level|Test/i.test(c)) || "";
          const changedBy = cells.find((c) => /^[A-Z0-9_]{3,15}$/.test(c) && !/^(?:HTML|SPAN|DIV|NONE)$/i.test(c) && c !== level) || "";
          const isSelected = Boolean(tr.querySelector('input[type="radio"]:checked, [aria-checked="true"], [role="radio"][aria-checked="true"]'));

          recLevels.push({
            level,
            origin,
            reference,
            note: "",
            timestamp: dates[0] || "",
            validUntil: dates[1] || "",
            changedBy,
            changedOn: dates[2] || dates[0] || "",
            selected: isSelected,
          });
        }
      });
    });

    // 2. Fallback to flat cells if table rows were not found
    if (recLevels.length === 0) {
      let cells = [];
      searchRoots.forEach((root) => {
        if (cells.length > 0) return;
        const stcTds = Array.from(root.querySelectorAll('td[subct="STC"]'));
        if (stcTds.length > 0) {
          cells = stcTds.map((td) => cleanSapCellText(td.textContent || ""));
        }
      });

      if (cells.length === 0) {
        const stcMatches = Array.from(decodedXml.matchAll(/subct="STC"[^>]*>([\s\S]*?)<\/td>/gi));
        cells = stcMatches.map((m) => cleanSapCellText(m[1]));
      }

      let currentRow = null;
      cells.forEach((c) => {
        if (!c) return;
        const isLevel = lvlRegex.test(c);
        if (isLevel) {
          if (currentRow && currentRow.level) {
            recLevels.push(currentRow);
          }
          currentRow = {
            level: c,
            origin: "",
            reference: "",
            note: "",
            timestamp: "",
            validUntil: "",
            changedBy: "",
            changedOn: "",
          };
        } else if (currentRow) {
          if (/^\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2}:\d{2})?$/.test(c)) {
            if (!currentRow.timestamp) currentRow.timestamp = c;
            else if (!currentRow.validUntil) currentRow.validUntil = c;
            else if (!currentRow.changedOn) currentRow.changedOn = c;
          } else if (/^(?:Placement\s*test|Manually|Webshop|Front\s*office|Back\s*office)$/i.test(c)) {
            currentRow.origin = c;
          } else if (/Consultation|Course|Level|Test/i.test(c)) {
            currentRow.reference = c;
          } else if (/^[A-Z0-9_]{3,15}$/.test(c) && !/^(?:HTML|SPAN|DIV|NONE)$/i.test(c)) {
            currentRow.changedBy = c;
          } else if (c.length > 2 && !currentRow.note) {
            currentRow.note = c;
          }
        }
      });
      if (currentRow && currentRow.level) {
        recLevels.push(currentRow);
      }
    }

    // Annotate each recLevel with dateNum and sort chronologically to find the newest entry
    recLevels.forEach((r) => {
      const dStr = r.changedOn || (r.timestamp ? r.timestamp.split(" ")[0] : "");
      r.dateStr = dStr;
      r.dateNum = parseSapDateToNum(dStr);
    });
    const sortedByDate = [...recLevels].sort((a, b) => (b.dateNum || 0) - (a.dateNum || 0));
    const selectedRec = recLevels.find((r) => r.selected);
    const latestRec = (sortedByDate.length > 0 && sortedByDate[0].dateNum > 0)
      ? sortedByDate[0]
      : (selectedRec || (recLevels.length > 0 ? recLevels[recLevels.length - 1] : null));
    const latestRecLevel = latestRec ? latestRec.level : null;
    const latestRecDate = latestRec ? (latestRec.dateStr || "") : "";
    const latestRecDateNum = latestRec ? (latestRec.dateNum || 0) : 0;

    return {
      recLevels,
      latestRec,
      latestRecLevel,
      latestRecDate,
      latestRecDateNum,
    };
  }

  function parseSapNumber(raw) {
    if (!raw) return 0;
    let s = String(raw).trim();
    let isNeg = false;
    if (s.endsWith("-")) {
      isNeg = true;
      s = s.slice(0, -1).trim();
    } else if (s.startsWith("-")) {
      isNeg = true;
      s = s.slice(1).trim();
    }
    s = s.replace(/\./g, "").replace(/,/g, ".");
    const num = parseFloat(s) || 0;
    return isNeg ? -num : num;
  }

  function parseAccountBalance(htmlOrXml) {
    if (!htmlOrXml) {
      return {
        open: 0,
        currency: "EGP",
        isCredit: false,
        isDebt: false,
        isSettled: true,
        amount: 0,
        formatted: "0 EGP",
      };
    }

    const unescaped = String(htmlOrXml)
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const decoded = decodeHtmlEntities(unescaped);

    const totalMatches = Array.from(decoded.matchAll(/class="[^"]*urColorTotal[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/gi));
    const totalTexts = totalMatches.map((m) => cleanSapCellText(m[1])).filter(Boolean);

    let currency = "EGP";
    const foundCur = totalTexts.find((t) => /^[A-Z]{3}$/.test(t));
    if (foundCur) currency = foundCur;

    let openStr = "0,00";
    let debitStr = "0,00";
    let creditStr = "0,00";

    const numberItems = totalTexts.filter((t) => /\d+,\d{2}/.test(t));
    if (numberItems.length >= 3) {
      debitStr = numberItems[0];
      creditStr = numberItems[1];
      openStr = numberItems[2];
    } else if (numberItems.length > 0) {
      openStr = numberItems[numberItems.length - 1];
    } else {
      const openLblMatch = Array.from(decoded.matchAll(/id="[^"]*lbl\[106,\d+\]"[^>]*>([\s\S]*?)<\/(?:div|span)>/gi));
      if (openLblMatch.length > 0) {
        const last = cleanSapCellText(openLblMatch[openLblMatch.length - 1][1]);
        if (/\d+,\d{2}/.test(last)) openStr = last;
      }
    }

    const open = parseSapNumber(openStr);
    const debit = parseSapNumber(debitStr);
    const credit = parseSapNumber(creditStr);
    const isCredit = open < 0;
    const isDebt = open > 0;
    const isSettled = open === 0;
    const amount = Math.abs(open);
    const formatted = `${open < 0 ? "-" : open > 0 ? "+" : ""}${Math.round(amount).toLocaleString("en-US")} ${currency}`;

    return {
      open,
      debit,
      credit,
      currency,
      isCredit,
      isDebt,
      isSettled,
      amount,
      formatted,
    };
  }

  function sortSameNameDuplicates(rows, cache = {}) {
    if (!Array.isArray(rows) || rows.length < 2) return rows;

    const nameCount = {};
    rows.forEach((r) => {
      const k = normalizeStudentName(r.fullName || `${r.firstName} ${r.lastName}`);
      nameCount[k] = (nameCount[k] || 0) + 1;
    });

    const hasSameName = Object.values(nameCount).some((c) => c > 1);
    if (!hasSameName) return rows; // Different names (siblings) -> preserve natural order!

    const grouped = {};
    const groupOrder = [];
    rows.forEach((r) => {
      const k = normalizeStudentName(r.fullName || `${r.firstName} ${r.lastName}`);
      if (!grouped[k]) {
        grouped[k] = [];
        groupOrder.push(k);
      }
      grouped[k].push(r);
    });

    const result = [];
    groupOrder.forEach((k) => {
      const group = grouped[k];
      if (group.length > 1) {
        // Sort duplicate accounts by Level Rank: highest rank FIRST (e.g. Beginner B > generic A0 > No Level)
        group.sort((a, b) => {
          const idA = String(a.studentNumber || "").padStart(10, "0");
          const idB = String(b.studentNumber || "").padStart(10, "0");
          const recA = cache[idA];
          const recB = cache[idB];
          const aProf = (recA && recA.profile) || a;
          const bProf = (recB && recB.profile) || b;
          const rankA = getLevelRank(aProf);
          const rankB = getLevelRank(bProf);
          return rankB - rankA;
        });
      }
      result.push(...group);
    });

    return result;
  }

  // ==========================================================================
  // Registration & Live Class Schedules (ZHER_WA_REGISTRATION)
  // ==========================================================================
  const TEACHING_CENTRES = [
    { key: "05001351", sapCentreKey: "05001351", code: "AGU", name: "Agouza Teaching Centre", shortName: "Agouza" },
    { key: "05001353", sapCentreKey: "05001353", code: "CTS", name: "CityStars Teaching Centre", shortName: "CityStars" },
    { key: "05001355", sapCentreKey: "05001355", code: "OCT", name: "6th of October Teaching Centre", shortName: "6th of October" },
    { key: "05001352", sapCentreKey: "05001352", code: "HEL", name: "Heliopolis Teaching Centre", shortName: "Heliopolis" },
    { key: "05001677", sapCentreKey: "05001677", code: "AIS", name: "Aspire School New Cairo", shortName: "New Cairo" },
    { key: "05001354", sapCentreKey: "05001354", code: "ALX", name: "Alexandria Teaching Centre (ALX)", shortName: "Alex (ALX)" },
    { key: "05001354_KLS", sapCentreKey: "05001354", code: "KLS", name: "Alexandria Teaching Centre (KLS)", shortName: "Alex (KLS)" },
  ];

  const ACADEMIC_LEVEL_KEYS = {
    "Pre-School 1": "0200",
    "Pre-School 2": "0202",
    "Early Years": "0200",
    "Primary Starter A": "0220",
    "Primary Starter B": "0222",
    "Primary Plus 1": "0320",
    "Primary Plus 2": "0322",
    "Primary Plus 3": "0324",
    "Primary Plus 4": "0326",
    "Primary Plus 5": "0328",
    "Primary Plus 6": "0330",
    "Secondary Plus A1": "0628",
    "Secondary Plus A2": "0634",
    "Secondary Plus B1.1": "0642",
    "Secondary Plus B1.2": "0644",
    "Secondary Plus B2.1": "0648",
    "Secondary Plus B2.2": "0650",
    "Upper Secondary Plus A1": "0628",
    "Upper Secondary Plus A2": "0634",
    "Upper Secondary Plus B1.1": "0642",
    "Upper Secondary Plus B1.2": "0644",
    "Upper Secondary Plus B2.1": "0648",
    "Upper Secondary Plus B2.2": "0650",
    "Upper Secondary Plus C1.1": "0654",
    "Upper Secondary Plus C1.2": "0656",
    "A0": "0627",
    "Beginner": "0627",
    "Beginner (A0)": "0627",
    "Beginner A": "0627",
    "Beginner B": "0627",
    "Beginner C": "0627",
    "Beginner D": "0627",
    "Beginner E": "0627",
    "A1": "0628",
    "A1.1": "0630",
    "A1.2": "0632",
    "A2": "0634",
    "A2.1": "0636",
    "A2.2": "0638",
    "B1": "0640",
    "B1.1": "0642",
    "B1.2": "0644",
    "B2": "0646",
    "B2.1": "0648",
    "B2.2": "0650",
    "C1": "0652",
    "C1.1": "0654",
    "C1.2": "0656",
    "C2": "0658",
  };

  /**
   * Maps a branch code (e.g. AGU, CTS, OCT) and a student's recommended level
   * to the SAP Course Abbreviation (e.g. AGU-AD Beg, AGU-BCE, AGU-PP1) and sub-filter.
   */
  function resolveSapCourseForLevel(branchCode, levelStr, isAdult = true) {
    const b = String(branchCode || "AGU").toUpperCase();
    const lvl = String(levelStr || "").trim();

    // 1. Beginner A-E or A0
    const begSubMatch = lvl.match(/Beginner\s+([A-E])\b/i) || lvl.match(/\bBeg\s+([A-E])\b/i);
    if (begSubMatch || /Beginner|^A0\b/i.test(lvl)) {
      const subLetter = begSubMatch ? begSubMatch[1].toUpperCase() : "";
      return {
        courseCode: `${b}-AD Beg`,
        courseSuffix: "AD Beg",
        courseType: "BEG",
        academicLevelKey: "0627",
        subLevelFilter: subLetter ? `Beg ${subLetter}` : "",
        label: subLetter ? `Beginner ${subLetter}` : "Beginner",
      };
    }

    // 2. IELTS (Adult or YL)
    if (/IELTS/i.test(lvl)) {
      const suffix = isAdult ? "IELTS" : "IELTS YL";
      return {
        courseCode: `${b}-${suffix}`,
        courseSuffix: isAdult ? "IELTS" : "IELTS YL",
        courseType: "IELTS",
        academicLevelKey: "",
        subLevelFilter: "",
        label: isAdult ? "IELTS Preparation" : "IELTS for Teens",
      };
    }

    // 3. For Adult students (isAdult === true):
    // Adults MUST always map to Adult English (BCE), NEVER to Young Learner courses (PP1-PP6, SA1-SC1, USA2-USC1, EY1-EY3).
    // Even if student has an old YL level on record (e.g. Upper Secondary Plus B1.1), map to BCE with their CEFR level!
    if (isAdult) {
      const cefrMatch = lvl.match(/\b([A-C][12])(?:\.[12])?\b/i);
      const cefr = cefrMatch ? cefrMatch[1].toUpperCase() : "";
      return {
        courseCode: `${b}-BCE`,
        courseSuffix: "BCE",
        courseType: "ADULT",
        academicLevelKey: cefr ? (ACADEMIC_LEVEL_KEYS[cefr] || "") : "",
        subLevelFilter: "",
        label: cefr ? `British Council English (${cefr})` : "British Council English (BCE)",
      };
    }

    // 4. Primary Starter A / B
    const pstMatch = lvl.match(/Starter\s*([AB])/i);
    if (pstMatch) {
      const l = pstMatch[1].toUpperCase();
      return {
        courseCode: `${b}-PSt${l}`,
        courseSuffix: `PSt${l}`,
        courseType: "YL",
        academicLevelKey: l === "A" ? "0220" : "0222",
        subLevelFilter: "",
        label: `Primary Starter ${l}`,
      };
    }

    // 5. Primary Plus 1-6
    const ppMatch = lvl.match(/Primary\s*Plus\s*(\d)/i);
    if (ppMatch) {
      const n = ppMatch[1];
      return {
        courseCode: `${b}-PP${n}`,
        courseSuffix: `PP${n}`,
        courseType: "YL",
        academicLevelKey: ACADEMIC_LEVEL_KEYS[`Primary Plus ${n}`] || "",
        subLevelFilter: "",
        label: `Primary Plus ${n}`,
      };
    }

    // 6. Early Years / Pre-School (Ducks = EY2, Owls = EY3)
    if (/Early\s*Years|Pre-School|Ducks|Owls|\bEY\d?\b/i.test(lvl)) {
      if (/Owls|\bEY3\b|Years\s*3/i.test(lvl)) {
        return {
          courseCode: `${b}-EY3`,
          courseSuffix: "EY3",
          courseType: "YL",
          academicLevelKey: "0202",
          subLevelFilter: "Owls",
          label: "Early Years 3 (Owls)",
        };
      }
      if (/Ducks|\bEY2\b|Years\s*2/i.test(lvl)) {
        return {
          courseCode: `${b}-EY2`,
          courseSuffix: "EY2",
          courseType: "YL",
          academicLevelKey: "0201",
          subLevelFilter: "Ducks",
          label: "Early Years 2 (Ducks)",
        };
      }
      return {
        courseCode: `${b}-EY`,
        courseSuffix: "EY",
        courseType: "YL",
        academicLevelKey: "0200",
        subLevelFilter: "",
        label: "Early Years",
      };
    }

    // 7. Secondary / Upper Secondary Plus (full names or codes like USA1, SA1, USB1.1, etc.)
    const secMatch = lvl.match(/(Upper\s*)?Secondary(?:\s*Plus)?\s*([A-C][12](?:\.[12])?)/i) ||
      lvl.match(/^(US|S)\s*([A-C][12](?:\.[12])?)$/i);
    if (secMatch) {
      const isUpper = Boolean(secMatch[1] && /Upper|US/i.test(secMatch[1]));
      const cefr = secMatch[2].toUpperCase();
      const suffix = `${isUpper ? "US" : "S"}${cefr}`;
      const fullName = `${isUpper ? "Upper " : ""}Secondary Plus ${cefr}`;
      return {
        courseCode: `${b}-${suffix}`,
        courseSuffix: suffix,
        courseType: "YL",
        academicLevelKey: ACADEMIC_LEVEL_KEYS[fullName] || ACADEMIC_LEVEL_KEYS[cefr] || "",
        subLevelFilter: "",
        label: fullName,
      };
    }

    // 8. Adult CEFR levels (A1, A2, B1, B2, C1) -> British Council English (BCE)
    const cefrMatch = lvl.match(/\b([A-C][12](?:\.[12])?)\b/i);
    if (cefrMatch) {
      const cefr = cefrMatch[1].toUpperCase();
      const baseCefr = cefr.slice(0, 2); // A1, A2, B1, B2, C1
      const suffix = isAdult ? "BCE" : `S${cefr}`;
      return {
        courseCode: `${b}-${suffix}`,
        courseSuffix: suffix,
        courseType: isAdult ? "BCE" : "YL",
        academicLevelKey: ACADEMIC_LEVEL_KEYS[baseCefr] || ACADEMIC_LEVEL_KEYS[cefr] || "",
        subLevelFilter: "",
        label: isAdult ? `British Council English (${baseCefr})` : `Secondary ${cefr}`,
      };
    }

    // Default fallback
    const defSuffix = isAdult ? "BCE" : "PP1";
    return {
      courseCode: `${b}-${defSuffix}`,
      courseSuffix: defSuffix,
      courseType: isAdult ? "BCE" : "YL",
      academicLevelKey: "",
      subLevelFilter: "",
      label: lvl || (isAdult ? "British Council English" : "Primary Plus"),
    };
  }

  function stepHexId(wdId, offset = 1) {
    if (!wdId || !/^WD[0-9A-F]+$/i.test(wdId)) return null;
    const num = parseInt(wdId.slice(2), 16) + offset;
    if (isNaN(num) || num <= 0) return null;
    const hex = num < 0x100 ? num.toString(16).toUpperCase().padStart(2, "0") : num.toString(16).toUpperCase().padStart(4, "0");
    return `WD${hex}`;
  }

  function addOneYearToSapDate(sapDateStr) {
    const m = String(sapDateStr || "").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return "";
    const day = m[1];
    const month = m[2];
    const nextYear = parseInt(m[3], 10) + 1;
    return `${day}.${month}.${nextYear}`;
  }

  const DEFAULT_REG_CONTROLS = {
    centreComboId: "WD62",
    cancelPopupBtn: null,
    okPopupBtn: "WD0FC3",
    saveBtn: null,
    backBtn: "WD028A",
    settingsBtn: "WDAF",
    panelStackId: null,
    headerTabPanelId: null,
    registrationsTabPanelId: null,
    bookingBtnId: null,
    bookingPopupId: null,
    addReservationItemId: null,
    addWaitlistItemId: null,
    courseInputId: "WD02E1",
    yearInputId: "WD030B",
    sessionInputId: "WD0330",
    locationInputId: "WD0397",
    eventTypeInputId: "WD03BF",
    academicLevelInputId: "WD03E6",
    classDescInputId: "WD04A8",
    searchBtnId: "WD0562",
    scheduleTableId: "WD0592",
    tacCheckboxId: "WD1050",
    tacCheckboxIds: [],
    uncheckedTacCheckboxIds: [],
    guardianComboId: null,
    addCollectorBtnId: null,
    collectorStartInputId: null,
    collectorEndInputId: null,
    guardiansList: [],
  };

  function parseRegistrationControls(rawXml, includeDefaults = false) {
    const unescaped = String(rawXml || "")
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const dec = decodeHtmlEntities(unescaped);

    const findInputByTitle = (titleRe) => {
      const re = new RegExp(`<input[^>]*\\btitle="${titleRe}"[^>]*>`, "gi");
      let m;
      while ((m = re.exec(dec)) !== null) {
        const tag = m[0];
        const idM = tag.match(/\bid="(WD[0-9A-F]+)"/i);
        if (idM) return idM[1];
      }
      return null;
    };

    const findTagIdByHint = (hintRe) => {
      const re = new RegExp(`<[^>]*${hintRe}[^>]*>`, "gi");
      let m;
      while ((m = re.exec(dec)) !== null) {
        const tag = m[0];
        if (/^<label\b/i.test(tag) || /\bct="L"/i.test(tag) || /_LABEL\b/i.test(tag)) {
          const forM = tag.match(/\bfor="(WD[0-9A-F]+)"/i);
          if (forM) return forM[1];
          continue;
        }
        const idM = tag.match(/\bid="(WD[0-9A-F]+)"/i) || tag.match(/\bname="(WD[0-9A-F]+)"/i);
        if (idM) return idM[1];
      }
      return null;
    };

    const findInputByHintOrTitle = (pattern) => {
      // 1. Direct input tag with hint or title
      const directRe1 = new RegExp(`<input[^>]*\\bid="(WD[0-9A-F]+)"[^>]*(?:${pattern})[^>]*>`, "i");
      let m = directRe1.exec(dec);
      if (m) return m[1];

      const directRe2 = new RegExp(`<input[^>]*(?:${pattern})[^>]*\\bid="(WD[0-9A-F]+)"[^>]*>`, "i");
      m = directRe2.exec(dec);
      if (m) return m[1];

      // 2. Container tag (td/span/div) with hint -> look ahead inside chunk for child <input>
      const contRe = new RegExp(`<(?:td|span|div)[^>]*(?:${pattern})[^>]*>`, "gi");
      while ((m = contRe.exec(dec)) !== null) {
        const chunk = dec.slice(m.index, m.index + 800);
        const inputM = chunk.match(/<input[^>]*\bid="(WD[0-9A-F]+)"[^>]*>/i);
        if (inputM) return inputM[1];
      }
      return null;
    };

    const findBtnByText = (txtRe) => {
      const re = new RegExp(`<[^>]*\\bct="B"[^>]*>`, "gi");
      const lsRe = new RegExp(`["']0["']\\s*:\\s*["']${txtRe}["']`, "i");
      let m;
      let foundId = null;
      while ((m = re.exec(dec)) !== null) {
        const tag = m[0];
        if (lsRe.test(tag)) {
          const idM = tag.match(/\bid="(WD[0-9A-F]+)"/i);
          if (idM) foundId = idM[1]; // Take latest match (e.g. active popup OK/Cancel)
        }
      }
      return foundId;
    };

    // PanelStack (WDBD / WD38) and Tabs (Header data vs Registrations)
    let panelStackId = null;
    let activePanelId = null;
    let activePanelTitle = null;
    const pstMatch =
      dec.match(/<table[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="PST"[^>]*lsdata='\{[^']*?"8"\s*:\s*"(WD[0-9A-F]+)"[^']*?"11"\s*:\s*"([^"]+)"/i) ||
      dec.match(/<table[^>]*\bct="PST"[^>]*\bid="(WD[0-9A-F]+)"[^>]*lsdata='\{[^']*?"8"\s*:\s*"(WD[0-9A-F]+)"[^']*?"11"\s*:\s*"([^"]+)"/i) ||
      dec.match(/<table[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="PST"/i);
    if (pstMatch) {
      panelStackId = pstMatch[1];
      if (pstMatch[2]) activePanelId = pstMatch[2];
      if (pstMatch[3]) activePanelTitle = cleanSapCellText(pstMatch[3]);
    }

    let headerTabPanelId = null;
    let registrationsTabPanelId = null;
    const pTagRe = /<div[^>]*\bct="P"[^>]*>/gi;
    let pm;
    while ((pm = pTagRe.exec(dec)) !== null) {
      const tag = pm[0];
      const idM = tag.match(/\bid="(WD[0-9A-F]+)"/i);
      if (!idM) continue;
      if (/"(?:8|10)"\s*:\s*"Header(?:\s+|&#x20;)data"/i.test(tag) || /Header(?:\s+|&#x20;)data/i.test(tag)) {
        headerTabPanelId = idM[1];
        const endIdM = tag.match(/"6"\s*:\s*"(WD[0-9A-F]+)"/i);
        if (endIdM && !registrationsTabPanelId) {
          registrationsTabPanelId = stepHexId(endIdM[1], 1);
        }
      } else if (/"(?:8|10)"\s*:\s*"Registrations"/i.test(tag) || /Registrations/i.test(tag)) {
        registrationsTabPanelId = idM[1];
      }
    }
    if (!registrationsTabPanelId && activePanelTitle === "Registrations" && activePanelId) {
      registrationsTabPanelId = activePanelId;
    }

    // Save button: look for FPM_SAVE in data-hint, then B with "Save"
    let saveBtn = null;
    const saveHintM =
      dec.match(/<[^>]*\bid="(WD[0-9A-F]+)"[^>]*data-hint="[^"]*PAGE_FOOTER[^"]*FPM_SAVE/i) ||
      dec.match(/<[^>]*data-hint="[^"]*PAGE_FOOTER[^"]*FPM_SAVE[^"]*\\bid="(WD[0-9A-F]+)"/i);
    if (saveHintM) {
      saveBtn = saveHintM[1];
    }
    if (!saveBtn) {
      saveBtn = findBtnByText("Save");
    }

    // Booking menu button & POMNI items ("Add reservation" / "Add waitlist booking")
    let bookingBtnId = null;
    let bookingPopupId = null;
    let addReservationItemId = null;
    let addWaitlistItemId = null;

    const bookingBtnM = dec.match(/<div[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="B"[^>]*lsdata='\{[^']*?"0"\s*:\s*"Booking"[^']*?"15"\s*:\s*"(WD[0-9A-F]+)"/i);
    if (bookingBtnM) {
      bookingBtnId = bookingBtnM[1];
      bookingPopupId = bookingBtnM[2];
    }

    const pomniRe = /<tr[^>]*\bct="POMNI"[^>]*>/gi;
    let trM;
    while ((trM = pomniRe.exec(dec)) !== null) {
      const tag = trM[0];
      const idM = tag.match(/\bid="(WD[0-9A-F]+)"/i);
      if (!idM) continue;
      if (/Add\s+reservation/i.test(tag)) {
        addReservationItemId = idM[1];
        // Find enclosing ct="POMN" table right before this POMNI row
        const beforeChunk = dec.slice(Math.max(0, trM.index - 600), trM.index);
        const pomnM = beforeChunk.match(/<table[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="POMN"/i);
        if (pomnM) bookingPopupId = pomnM[1];
        if (!bookingBtnId) bookingBtnId = stepHexId(addReservationItemId, -1);
      } else if (/Add\s+waitlist/i.test(tag)) {
        addWaitlistItemId = idM[1];
      }
    }

    // Registrations table ID & row count (FPM_LIST_UIBB_ATS.ID_00010018:LIST_VIEW.DYNAMIC_TABLE)
    let regListTableId = null;
    const regTableM =
      dec.match(/id="(WD[0-9A-F]+)"[^>]*data-hint="[^"]*ID_00010018:LIST_VIEW\.DYNAMIC_TABLE/i) ||
      dec.match(/data-hint="[^"]*ID_00010018:LIST_VIEW\.DYNAMIC_TABLE[^"]*id="(WD[0-9A-F]+)"/i);
    if (regTableM) {
      regListTableId = regTableM[1];
    }
    const hasSpacerFragment = /bIsSpacerFragment="true"/i.test(dec);
    const tableCrcM = (regListTableId ? dec.match(new RegExp(`id="${regListTableId}"[^>]*crc="(\\d+)"`, "i")) : null) ||
      dec.match(/data-hint="[^"]*ID_00010018:LIST_VIEW\.DYNAMIC_TABLE"[^>]*crc="(\d+)"/i);
    const regRowCount = tableCrcM ? parseInt(tableCrcM[1], 10) : 0;

    // TAC checkbox(es) in registration table (LIST_VIEW.TAC_FPM_CE) — supports single & multi-term rows
    // Note: SAP Web Dynpro (FPM_LIST_UIBB_ATS) only emits data-hint="...LIST_VIEW.TAC_FPM_CE..." on Row 1 (rr="1")
    // and the column header, NOT on Row 2 (rr="2"), Row 3 (rr="3"), etc. So we scan all <tr rr="k"> rows
    // of the entire LIST_VIEW table (which spans multiple <tbody iRowIndexOffset="..."> fragments)
    // and pick the Terms & Conditions checkbox (last checkbox column in each row).
    let tacCheckboxId = null;
    const tacCheckboxIds = [];
    const uncheckedTacCheckboxIds = [];
    const seenTacIds = new Set();

    const recordTacTag = (cbTag) => {
      if (!cbTag || /CPT_FPM_HEADER/i.test(cbTag)) return;
      const idM = cbTag.match(/\bid="(WD[0-9A-F]+)"/i);
      if (!idM) return;
      const id = idM[1];
      const isChecked = /aria-checked="true"/i.test(cbTag) || /["']1["']\s*:\s*true/i.test(cbTag);
      if (!seenTacIds.has(id)) {
        seenTacIds.add(id);
        tacCheckboxIds.push(id);
        if (!isChecked) {
          uncheckedTacCheckboxIds.push(id);
        }
      }
    };

    // 1. Find the non-header LIST_VIEW.TAC_FPM_CE inside Row 1 (<tr rr="1">) and scan its enclosing
    // table (...-mrss-cont-none-content) containing all tbody row fragments.
    let dataTacIdx = -1;
    const tacFindRe = /<[^>]*LIST_VIEW\.TAC_FPM_CE[^>]*>/gi;
    let tfm;
    while ((tfm = tacFindRe.exec(dec)) !== null) {
      if (/CPT_FPM_HEADER/i.test(tfm[0])) continue;
      dataTacIdx = tfm.index;
      break;
    }

    if (dataTacIdx !== -1) {
      const tblStart = dec.lastIndexOf("<table", dataTacIdx);
      const tblEndIdx = dec.indexOf("</table>", dataTacIdx);
      const tblEnd = tblEndIdx !== -1 ? Math.min(dec.length, tblEndIdx + 8) : Math.min(dec.length, dataTacIdx + 45000);
      const listViewTableHtml = dec.slice(tblStart !== -1 ? tblStart : Math.max(0, dataTacIdx - 2000), tblEnd);

      const trRe = /<tr\b[^>]*\brr="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRe.exec(listViewTableHtml)) !== null) {
        const rr = parseInt(trMatch[1], 10);
        if (!rr || rr < 1) continue;
        const rowHtml = trMatch[2];
        const cbTags = Array.from(
          rowHtml.matchAll(/<(?:span|input)\b[^>]*\bct="(?:C|CB|C_standards)"[^>]*>/gi)
        ).map((m) => m[0]);
        if (cbTags.length === 0) continue;
        const explicitTac = cbTags.find((t) => /LIST_VIEW\.TAC_FPM_CE/i.test(t));
        // In LIST_VIEW, "Terms and Conditions" is the last column (after "Vario")
        const chosenTag = explicitTac || cbTags[cbTags.length - 1];
        recordTacTag(chosenTag);
      }
    }

    // 2. Also scan any direct tags with LIST_VIEW.TAC_FPM_CE (in case of partial cell-only delta updates)
    const tacHintRe = /<[^>]*LIST_VIEW\.TAC_FPM_CE[^>]*>/gi;
    let tacM;
    while ((tacM = tacHintRe.exec(dec)) !== null) {
      const tag = tacM[0];
      if (/CPT_FPM_HEADER/i.test(tag) || /^<label\b/i.test(tag) || /\bct="L"/i.test(tag)) continue;
      if (/\bct="(?:C|CB|C_standards)"/i.test(tag)) {
        recordTacTag(tag);
      } else {
        const chunk = dec.slice(tacM.index, tacM.index + 1200);
        const innerCheck = chunk.match(/<(?:span|input)\b[^>]*\bct="(?:C|CB|C_standards)"[^>]*>/i);
        if (innerCheck) recordTacTag(innerCheck[0]);
      }
    }

    if (uncheckedTacCheckboxIds.length > 0) {
      tacCheckboxId = uncheckedTacCheckboxIds[uncheckedTacCheckboxIds.length - 1];
    } else if (tacCheckboxIds.length > 0) {
      tacCheckboxId = tacCheckboxIds[tacCheckboxIds.length - 1];
    } else {
      tacCheckboxId = findTagIdByHint("LIST_VIEW\\.TAC_FPM_CE");
      if (tacCheckboxId) {
        tacCheckboxIds.push(tacCheckboxId);
        uncheckedTacCheckboxIds.push(tacCheckboxId);
      }
    }

    // Table ID in search popup
    const scheduleTblMatch =
      dec.match(/id="(WD[0-9A-F]+)-mrss-cont/i) ||
      dec.match(/<table[^>]+id="(WD[0-9A-F]+)"[^>]*ct="ST/i) ||
      dec.match(/id="(WD[0-9A-F]+)"[^>]+(?:ct="STCS"|data-hint="[^"]*DYNAMIC_TABLE)/i);
    const scheduleTableId = scheduleTblMatch ? scheduleTblMatch[1] : (findTagIdByHint("V_LIST\\.DYNAMIC_TABLE") || "WD0592");

    // Guardian / Sponsor / Related Person ComboBox & Guardians List in Header Data
    let guardianComboId =
      findInputByHintOrTitle("FGL2_0265DC6D81EA1EECA6F97BB478815B9C") ||
      findTagIdByHint("FGL2_0265DC6D81EA1EECA6F97BB478815B9C");
    if (!guardianComboId) {
      const cbBpRe = /<input[^>]*\bct="CB"[^>]*\btitle="Business Partner"[^>]*>/gi;
      const cbBpM = cbBpRe.exec(dec);
      if (cbBpM) {
        const idM = cbBpM[0].match(/\bid="(WD[0-9A-F]+)"/i);
        if (idM) guardianComboId = idM[1];
      }
    }

    const guardiansList = [];
    const seenGuardianKeys = new Set();
    const libItemRe = /<div[^>]*\bct="LIB_I"[^>]*\bdata-itemkey="(\d{9,10})"[^>]*\bdata-itemvalue1="([^"]*)"[^>]*>/gi;
    let gm;
    while ((gm = libItemRe.exec(dec)) !== null) {
      const gKey = gm[1];
      const gName = cleanSapCellText(gm[2]);
      // Exclude Teaching Centre / Location / Course / Fee keys (8-digit 0500xxxx, 1000xxxx, 0011xxxx, 9999xxxx)
      if (/^(?:0500|1000|0011|9999)\d*$/.test(gKey)) continue;
      if (/^(?:EG\s+|YL\s+|AD\s+|IELTS\s+)/i.test(gName) || /Teaching\s+Centre/i.test(gName)) continue;
      if (gKey && !seenGuardianKeys.has(gKey)) {
        seenGuardianKeys.add(gKey);
        guardiansList.push({ key: gKey, name: gName || gKey });
      }
      if (!guardianComboId) {
        const beforeLib = dec.slice(Math.max(0, gm.index - 1500), gm.index);
        const libPM = Array.from(beforeLib.matchAll(/<div[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="LIB_P"/gi));
        if (libPM.length > 0) {
          const lastLibId = libPM[libPM.length - 1][1];
          guardianComboId = stepHexId(lastLibId, -1);
        }
      }
    }

    // Add collector button in Header Data (Contacts and Safeguarding)
    let addCollectorBtnId =
      findBtnByText("Add\\s+collector") ||
      findBtnByText("Add\\s*collector") ||
      (dec.match(/<[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="B"[^>]*lsdata='[^']*?["']0["']\s*:\s*["']Add\s+collector["']/i)?.[1]) ||
      (dec.match(/<span[^>]*\bid="(WD[0-9A-F]+)-caption"[^>]*>\s*Add\s+collector\s*<\/span>/i)?.[1]) ||
      (dec.match(/<[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="B"[^>]*data-hint='[^']*?ADD_COLLECTOR/i)?.[1]) ||
      null;

    // Collector Start Date & End Date inputs in Header Data (FPM_LIST_UIBB_ATS.ID_00010018 / ID_00010019)
    // Note: SAP renders table cell InputFields in FPM_LIST_UIBB_ATS as <span role="textbox" id="WDxxxx" ct="I" data-hint="...VALID_FROM_FPM_CE...">
    const findCollectorDateField = (hintPattern) => {
      const tagRe = new RegExp(`<(?:input|span)\\b[^>]*?(?:${hintPattern})[^>]*>`, "gi");
      let m;
      while ((m = tagRe.exec(dec)) !== null) {
        const tag = m[0];
        if (/\bct="I"/i.test(tag)) {
          const idM = tag.match(/\bid="(WD[0-9A-F]+)"/i);
          if (idM) return idM[1];
        }
      }
      const contRe = new RegExp(`<(?:td|span|div)\\b[^>]*?(?:${hintPattern})[^>]*>`, "gi");
      while ((m = contRe.exec(dec)) !== null) {
        if (/CPT_FPM_HEADER/i.test(m[0])) continue;
        const chunk = dec.slice(m.index, m.index + 800);
        const innerM =
          chunk.match(/<(?:input|span)\b[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="I"[^>]*>/i) ||
          chunk.match(/<(?:input|span)\b[^>]*\bct="I"[^>]*\bid="(WD[0-9A-F]+)"[^>]*>/i);
        if (innerM) return innerM[1];
      }
      return null;
    };

    let collectorStartInputId =
      findCollectorDateField("VALID_FROM_FPM_CE") ||
      findCollectorDateField("BEGDA_FPM_CE");

    let collectorEndInputId =
      findCollectorDateField("VALID_TO_FPM_CE") ||
      findCollectorDateField("ENDDA_FPM_CE");

    // Fallback: search inside contacts table rows containing "collector" for ct="I" fields
    if (!collectorStartInputId || !collectorEndInputId) {
      const colMatch = dec.match(/TYPE_FPM_CE[^>]*>\s*collector\s*</i);
      if (colMatch && colMatch.index !== undefined) {
        const chunk = dec.slice(colMatch.index, colMatch.index + 4000);
        const rowInputs = Array.from(
          chunk.matchAll(/<(?:input|span)\b[^>]*?\bid="(WD[0-9A-F]+)"[^>]*?\bct="I"[^>]*>|<(?:input|span)\b[^>]*?\bct="I"[^>]*?\bid="(WD[0-9A-F]+)"[^>]*>/gi)
        )
          .map((m) => m[1] || m[2])
          .filter(Boolean);
        if (rowInputs.length >= 2) {
          if (!collectorStartInputId) collectorStartInputId = rowInputs[0];
          if (!collectorEndInputId) collectorEndInputId = rowInputs[1];
        } else if (rowInputs.length === 1) {
          if (!collectorStartInputId) collectorStartInputId = rowInputs[0];
          if (!collectorEndInputId) collectorEndInputId = stepHexId(rowInputs[0], 2);
        }
      }
    }

    const hasOpenPopup = Boolean(dec.match(/<div[^>]*\bct="PW"[^>]*id="WDWL1"/i)) && !dec.includes('<div id="WDWL1_POP_CONT" ct="CO" lsdata=\'{}\' class=""></div>');
    const hasPackagePopup = Boolean(dec.match(/<div[^>]*\bct="PW"[^>]*id="WDWL1"/i)) && /Bundle\s*selection|Package\s*selection/i.test(dec) && !dec.includes('<div id="WDWL1_POP_CONT" ct="CO" lsdata=\'{}\' class=""></div>');

    const discovered = {
      hasOpenPopup,
      hasPackagePopup,
      centreComboId: findInputByTitle("ObjectID"),
      cancelPopupBtn: (dec.match(/<div[^>]*\bct="PW"[^>]*id="WDWL1"[\s\S]*?<div[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="B"[^>]*lsdata='[^']*?["']0["']\s*:\s*["']Cancel["']/i)?.[1]) || findBtnByText("Cancel"),
      okPopupBtn: (dec.match(/<div[^>]*\bct="PW"[^>]*lsdata='\{[^']*?"7"\s*:\s*"(WD[0-9A-F]+)"/i)?.[1]) || findBtnByText("OK") || (dec.match(/<[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="B"[^>]*lsdata='[^']*?["']0["']\s*:\s*["']OK["']/i)?.[1]) || null,
      saveBtn,
      backBtn: findBtnByText("Back"),
      settingsBtn: findBtnByText("Settings"),
      panelStackId,
      activePanelId,
      activePanelTitle,
      headerTabPanelId,
      registrationsTabPanelId,
      bookingBtnId,
      bookingPopupId,
      addReservationItemId,
      addWaitlistItemId,
      courseInputId: findInputByTitle("Course"),
      yearInputId: findInputByTitle("Year"),
      sessionInputId: findInputByTitle("Session"),
      locationInputId: findInputByTitle("Location"),
      eventTypeInputId: findInputByTitle("Event type"),
      academicLevelInputId: findInputByTitle("Academic Level"),
      classDescInputId: findInputByTitle("Class description"),
      searchBtnId: findBtnByText("Search"),
      scheduleTableId,
      regListTableId,
      hasSpacerFragment,
      regRowCount,
      tacCheckboxId,
      tacCheckboxIds: tacCheckboxIds.length > 0 ? tacCheckboxIds : null,
      uncheckedTacCheckboxIds: tacCheckboxIds.length > 0 ? uncheckedTacCheckboxIds : null,
      guardianComboId,
      addCollectorBtnId,
      collectorStartInputId,
      collectorEndInputId,
      guardiansList: guardiansList.length > 0 ? guardiansList : null,
    };

    const result = includeDefaults ? { ...DEFAULT_REG_CONTROLS } : {};
    Object.keys(discovered).forEach((k) => {
      if (discovered[k] !== null && discovered[k] !== undefined) {
        result[k] = discovered[k];
      }
    });
    return result;
  }

  function to12HourStr(hhStr, mmStr) {
    const h = parseInt(hhStr, 10);
    if (isNaN(h) || h < 0 || h > 23) return `${hhStr}:${mmStr}`;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${mmStr} ${ampm}`;
  }

  /**
   * Converts 24-hour times inside a class name or string into 12-hour AM/PM format.
   * Example: "CTS Beg D Sun/Mon18:00-19:30 T1" -> "CTS Beg D Sun/Mon 6:00 PM - 7:30 PM T1"
   */
  function formatClassTime12h(str) {
    if (!str) return "";
    return String(str)
      .replace(/([A-Za-z])(\d{1,2}:\d{2})/g, "$1 $2")
      .replace(/\b(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\b/g, (_, h1, m1, h2, m2) => {
        return `${to12HourStr(h1, m1)} - ${to12HourStr(h2, m2)}`;
      })
      .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:AM|PM|am|pm))/g, (_, h1, m1) => {
        return to12HourStr(h1, m1);
      });
  }

  /**
   * Extracts structured schedule info (12h/24h display name, 12h/24h time range, days, term T1/T2/T3...T11, and startMinutes for sorting)
   */
  function parseClassScheduleInfo(className, sessionText = "") {
    const raw = String(className || "");
    const sess = String(sessionText || "");
    const combined = `${raw} ${sess}`;
    const displayClassName = formatClassTime12h(raw);
    const displayClassName24h = raw.replace(/([A-Za-z])(\d{1,2}:\d{2})/g, "$1 $2");
    let timeRange12h = "";
    let timeRange24h = "";
    let startMinutes = 9999;
    const rangeMatch = raw.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (rangeMatch) {
      timeRange12h = `${to12HourStr(rangeMatch[1], rangeMatch[2])} - ${to12HourStr(rangeMatch[3], rangeMatch[4])}`;
      timeRange24h = `${rangeMatch[1].padStart(2, "0")}:${rangeMatch[2]} - ${rangeMatch[3].padStart(2, "0")}:${rangeMatch[4]}`;
      startMinutes = parseInt(rangeMatch[1], 10) * 60 + parseInt(rangeMatch[2], 10);
    }
    const daysMatch = raw.match(/\b((?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:\/(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat))*)/i);
    const daysText = daysMatch ? daysMatch[1] : "";
    const termMatch = combined.match(/\b(?:Term\s*|T)(\d{1,2})\b/i);
    const termText = termMatch ? `T${termMatch[1]}` : "";
    const termNum = termMatch ? parseInt(termMatch[1], 10) : 999;
    return {
      displayClassName,
      displayClassName24h,
      timeRange12h,
      timeRange24h,
      daysText,
      termText,
      termNum,
      startMinutes,
    };
  }

  function parseRegistrationClasses(rawXml) {
    const unescaped = String(rawXml || "")
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const dec = decodeHtmlEntities(unescaped);

    const classes = [];
    const tblMatch =
      dec.match(/id="(WD[0-9A-F]+)-mrss-cont/i) ||
      dec.match(/<table[^>]+id="(WD[0-9A-F]+)"[^>]*ct="ST/i) ||
      dec.match(/id="(WD[0-9A-F]+)"[^>]+(?:ct="STCS"|data-hint="[^"]*DYNAMIC_TABLE)/i) ||
      dec.match(/id="(WD[0-9A-F]+)"[^>]*ct="ST"[^>]*V_LIST\.DYNAMIC_TABLE/i) ||
      dec.match(/<[^>]*V_LIST\.DYNAMIC_TABLE[^>]*\bid="(WD[0-9A-F]+)"/i);
    const tableId = tblMatch ? tblMatch[1] : "WD0592";

    const rowRegex = /<tr[^>]+rr="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm;
    while ((rm = rowRegex.exec(dec)) !== null) {
      const rr = parseInt(rm[1], 10);
      if (!rr || rr < 1) continue;
      const rowTag = rm[0];
      const rowHtml = rm[2];

      const rowTblM = rowTag.match(/id="(WD[0-9A-F]+)-mrss-cont/i);
      const rowTableId = rowTblM ? rowTblM[1] : tableId;

      const getField = (hintCode) => {
        const tdRe = new RegExp(`<td[^>]*V_LIST\\.${hintCode}[^>]*>([\\s\\S]*?)<\\/td>`, "i");
        const tdM = rowHtml.match(tdRe);
        if (tdM) {
          const content = tdM[1];
          const inpM = content.match(/<input[^>]+value="([^"]*)"/i);
          if (inpM) return cleanSapCellText(inpM[1]);
          const spans = content.match(/<span[^>]*>([^<]+)<\/span>/gi);
          if (spans && spans.length > 0) {
            for (let i = spans.length - 1; i >= 0; i--) {
              const textM = spans[i].match(/<span[^>]*>([^<]+)<\/span>/i);
              if (textM && textM[1] && textM[1].trim()) {
                const t = cleanSapCellText(textM[1]);
                if (t && t !== "&nbsp;") return t;
              }
            }
          }
        }
        const reSpan = new RegExp(`V_LIST\\.${hintCode}[^>]*>([\\s\\S]*?)<\\/span>`, "i");
        const mSpan = rowHtml.match(reSpan);
        if (mSpan && mSpan[1]) return cleanSapCellText(mSpan[1]);
        const reInput = new RegExp(`<input[^>]+V_LIST\\.${hintCode}[^>]*value="([^"]*)"`, "i");
        const mInp = rowHtml.match(reInput);
        if (mInp && mInp[1]) return cleanSapCellText(mInp[1]);
        const reInput2 = new RegExp(`<input[^>]+value="([^"]*)"[^>]*V_LIST\\.${hintCode}`, "i");
        const mInp2 = rowHtml.match(reInput2);
        if (mInp2 && mInp2[1]) return cleanSapCellText(mInp2[1]);
        return "";
      };

      const className = getField("E_STEXT_E");
      if (!className) continue;

      const startDate = getField("EV_BEGDA_E");
      const endDate = getField("EV_ENDDA_E");
      const location = getField("F_SHORT_E");
      const academicLevel = getField("SM_LEVEL_E");
      const year = getField("PERYR_E");
      const session = getField("PERIT_E");
      const remainCapRaw = getField("CAPA_REMAIN_E");
      const optCapRaw = getField("CAPA_OPTIMUM_E");
      const maxCapRaw = getField("CAPA_MAXIMUM_E");
      const eventType = getField("D_STEXT_E");

      // Find selection cell ID (subct="SC") first, then fallback to STC or any td
      const scMatch = rowHtml.match(/<td[^>]+id="(WD[0-9A-F]+)"[^>]*subct="SC"/i) ||
        rowHtml.match(/<td[^>]+subct="SC"[^>]*id="(WD[0-9A-F]+)"/i);
      const stcMatch = rowHtml.match(/<td[^>]+id="(WD[0-9A-F]+)"[^>]*subct="STC"/i) ||
        rowHtml.match(/<td[^>]+subct="STC"[^>]*id="(WD[0-9A-F]+)"/i);
      const anyTdMatch = rowHtml.match(/<td[^>]+id="(WD[0-9A-F]+)"/i);
      const triggerCellId = (scMatch && scMatch[1]) || (stcMatch && stcMatch[1]) || (anyTdMatch && anyTdMatch[1]) || "";

      const hasRemainCap = remainCapRaw !== "" && remainCapRaw !== null && remainCapRaw !== undefined;
      const remainCap = hasRemainCap ? (parseInt(String(remainCapRaw).replace(/\./g, ""), 10) || 0) : null;
      const maxCap = parseInt(String(maxCapRaw || "0").replace(/\./g, ""), 10) || 0;
      const schedInfo = parseClassScheduleInfo(className, session);

      classes.push({
        rowIndex: rr,
        tableId: rowTableId,
        triggerCellId,
        className,
        displayClassName: schedInfo.displayClassName,
        displayClassName24h: schedInfo.displayClassName24h,
        timeRange12h: schedInfo.timeRange12h,
        timeRange24h: schedInfo.timeRange24h,
        daysText: schedInfo.daysText,
        termText: schedInfo.termText,
        termNum: schedInfo.termNum,
        startMinutes: schedInfo.startMinutes,
        startDate,
        endDate,
        startDateNum: parseSapDateToNum(startDate),
        endDateNum: parseSapDateToNum(endDate),
        location,
        academicLevel,
        year,
        session,
        remainCapacity: remainCap !== null ? remainCap : 0,
        remainCapacityFormatted: remainCapRaw || "0",
        remainingCapacityNum: remainCap,
        remainingCapacity: remainCapRaw || "—",
        optCapacity: optCapRaw || "",
        maxCapacity: maxCap,
        eventType,
      });
    }

    return classes;
  }

  function parseSapMessages(rawXml) {
    const unescaped = String(rawXml || "")
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const dec = decodeHtmlEntities(unescaped);
    const messages = [];
    const msgRe = /ct="MSG"[^>]*lsdata='\{[^']*?"0"\s*:\s*"([^"]+)"\s*,\s*"1"\s*:\s*"([^"]+)"/gi;
    let m;
    while ((m = msgRe.exec(dec)) !== null) {
      messages.push({ type: m[1], text: cleanSapCellText(m[2]) });
    }
    return messages;
  }

  function isPrebookedBooking(b) {
    if (!b) return false;
    const s = String(b.status || b.bookingStatus || "").trim();
    return /prebook/i.test(s) && !/cancel/i.test(s);
  }

  function isBookedBooking(b) {
    if (!b) return false;
    const s = String(b.status || b.bookingStatus || "").trim();
    if (/cancel/i.test(s)) return false;
    return /booked|completed|confirmed|registered|active|success/i.test(s);
  }

  function isActiveBooking(b) {
    return isPrebookedBooking(b) || isBookedBooking(b);
  }

  function extractBookingTermKey(b) {
    if (!b) return "";
    const combined = `${b.className || ""} ${b.courseDescription || ""} ${b.courseCode || ""} ${b.session || ""}`;

    // 1. Term T1..T11 / Term 1..11
    const tM = combined.match(/\b(?:Term\s*|T)(\d{1,2})\b/i);
    if (tM) {
      const yM = combined.match(/\b(20\d{2})\b/);
      const yr = yM ? yM[1] : "";
      return yr ? `${yr}-T${tM[1]}` : `T${tM[1]}`;
    }

    // 2. Adult BCE month + year (e.g. Jan 27, Nov 26, Mar 26)
    const bceM = combined.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{2,4})\b/i);
    if (bceM) {
      const month = bceM[1].toUpperCase();
      const yr = bceM[2].length === 2 ? `20${bceM[2]}` : bceM[2];
      return `${yr}-${month}`;
    }

    // 3. Fallback to start date
    const dStr = b.start || (b.session && b.session.match(/\d{2}\.\d{2}\.\d{4}/)?.[0]);
    if (dStr) return `DATE-${dStr}`;

    return "";
  }

  function isSameTermBooking(b1, b2) {
    if (!b1 || !b2) return false;
    const k1 = extractBookingTermKey(b1);
    const k2 = extractBookingTermKey(b2);
    if (k1 && k2 && k1.toLowerCase() === k2.toLowerCase()) return true;

    // Compare start dates if present
    if (b1.start && b2.start && b1.start === b2.start) return true;

    // Compare class names
    if (b1.className && b2.className && b1.className.trim().toLowerCase() === b2.className.trim().toLowerCase()) return true;

    return false;
  }

  function isTermAlreadyBooked(cancelledBooking, allBookings) {
    if (!cancelledBooking || !Array.isArray(allBookings)) return false;
    return allBookings.some((other) => {
      if (other === cancelledBooking) return false;
      const isCon = /ylcon|adcon|consultation|placement|assessment/i.test(
        `${other.courseCode || ""} ${other.courseDescription || ""} ${other.className || ""}`
      );
      if (isCon) return false;
      if (isActiveBooking(other) && isSameTermBooking(cancelledBooking, other)) {
        return true;
      }
      return false;
    });
  }

  /**
   * Identifies cancelled course bookings from a student's history,
   * grouping the most recent cancelled batch (e.g. 24h expired reservation session).
   */
  function findRecentCancelledBookings(bookings = []) {
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return { allCancelled: [], latestBatch: [], latestDate: null, count: 0 };
    }

    const isConsultation = (b) =>
      /ylcon|adcon|consultation|placement|assessment/i.test(
        `${b.courseCode || ""} ${b.courseDescription || ""} ${b.className || ""}`
      );

    const isCancelled = (b) =>
      /(?:booking\s*)?cancel/i.test(String(b.status || "")) ||
      /(?:booking\s*)?cancel/i.test(String(b.bookingStatus || ""));

    // If student has ANY active prebooking, hide cancelled suggestion batch
    const hasAnyPrebooked = bookings.some((b) => !isConsultation(b) && isPrebookedBooking(b));
    if (hasAnyPrebooked) {
      return { allCancelled: [], latestBatch: [], latestDate: null, count: 0 };
    }

    // Filter to real course bookings that were cancelled AND whose term is not already booked
    const cancelled = bookings.filter((b) => isCancelled(b) && !isConsultation(b) && !isTermAlreadyBooked(b, bookings));
    if (cancelled.length === 0) {
      return { allCancelled: [], latestBatch: [], latestDate: null, count: 0 };
    }

    // Parse date for comparison
    const parseDateNum = (dStr) => {
      if (!dStr) return 0;
      const str = String(dStr).trim();
      const mDot = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (mDot) return parseInt(mDot[3], 10) * 10000 + parseInt(mDot[2], 10) * 100 + parseInt(mDot[1], 10);
      const mIso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (mIso) return parseInt(mIso[1], 10) * 10000 + parseInt(mIso[2], 10) * 100 + parseInt(mIso[3], 10);
      const dt = Date.parse(str);
      if (!isNaN(dt)) {
        const d = new Date(dt);
        return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      }
      return 0;
    };

    const sorted = [...cancelled].sort((a, b) => {
      const da = parseDateNum(a.bookingDate);
      const db = parseDateNum(b.bookingDate);
      return db - da;
    });

    const latest = sorted[0];
    const latestDate = latest.bookingDate || "";
    const latestDateNum = parseDateNum(latestDate);

    // Collect all cancelled bookings from that latest booking date (or within 2 days of it)
    const latestBatch = sorted.filter((b) => {
      if (!latestDateNum) return true;
      const bNum = parseDateNum(b.bookingDate);
      return Math.abs(latestDateNum - bNum) <= 2;
    });

    return {
      allCancelled: sorted,
      latestBatch,
      latestDate,
      count: latestBatch.length,
    };
  }

  /**
   * Converts a cancelled booking history record into a staged classItem ready for bookClassInSap
   */
  function cancelledBookingToClassItem(b, centres = TEACHING_CENTRES) {
    if (!b) return null;
    const centresList = Array.isArray(centres) && centres.length > 0 ? centres : TEACHING_CENTRES;

    // 1. Resolve Teaching Centre:
    // First, check for explicit centre code in className, courseCode, or session (e.g. BSA/ALX, OCT, CTS, AGU, HEL, AIS, KLS)
    const allText = String(`${b.className || ""} ${b.courseCode || ""} ${b.teachingCentre || ""}`);
    let centre = null;
    if (/\b(BSA|ALX|Alexandria)\b/i.test(allText)) {
      if (/\bKLS\b/i.test(allText)) {
        centre = centresList.find((c) => c.code === "KLS");
      } else {
        centre = centresList.find((c) => c.code === "ALX");
      }
    } else if (/\b(AGU|Agouza)\b/i.test(allText)) {
      centre = centresList.find((c) => c.code === "AGU");
    } else if (/\b(CTS|City\s*Stars)\b/i.test(allText)) {
      centre = centresList.find((c) => c.code === "CTS");
    } else if (/\b(OCT|October|6th)\b/i.test(allText)) {
      centre = centresList.find((c) => c.code === "OCT");
    } else if (/\b(HEL|Heliopolis)\b/i.test(allText)) {
      centre = centresList.find((c) => c.code === "HEL");
    } else if (/\b(AIS|New\s*Cairo)\b/i.test(allText)) {
      centre = centresList.find((c) => c.code === "AIS");
    }

    if (!centre) {
      const tcStr = String(b.teachingCentre || "").toLowerCase();
      centre = centresList.find(
        (c) =>
          (c.shortName && tcStr.includes(c.shortName.toLowerCase())) ||
          (c.code && tcStr.includes(c.code.toLowerCase())) ||
          (c.name && tcStr.includes(c.name.toLowerCase()))
      );
    }

    if (!centre) {
      centre = centresList[0]; // fallback to Agouza
    }

    // 2. Resolve Course Code (e.g. "ALX-AD Beg", "OCT-PP3", "AGU-BCE")
    let rawCourse = String(b.courseCode || "").trim().replace(/^EG\s+/i, "");
    if (!rawCourse || rawCourse === "—" || rawCourse.length < 3) {
      // Deduce from className or courseDescription
      const cls = String(b.className || "");
      const desc = String(b.courseDescription || "");
      if (/Ducks|\bEY2\b|Early Years 2/i.test(cls) || /Ducks|Early Years 2/i.test(desc)) rawCourse = `${centre.code}-EY2`;
      else if (/Owls|\bEY3\b|Early Years 3/i.test(cls) || /Owls|Early Years 3/i.test(desc)) rawCourse = `${centre.code}-EY3`;
      else if (/Early Years 1|\bEY1\b/i.test(cls) || /Early Years 1/i.test(desc)) rawCourse = `${centre.code}-EY1`;
      else if (/Early Years|\bEY\b/i.test(cls) || /Early Years/i.test(desc)) rawCourse = `${centre.code}-EY`;
      else if (/PriPlus1|\bPP1\b/i.test(cls) || /Primary Plus 1/i.test(desc)) rawCourse = `${centre.code}-PP1`;
      else if (/PriPlus2|\bPP2\b/i.test(cls) || /Primary Plus 2/i.test(desc)) rawCourse = `${centre.code}-PP2`;
      else if (/PriPlus3|\bPP3\b/i.test(cls) || /Primary Plus 3/i.test(desc)) rawCourse = `${centre.code}-PP3`;
      else if (/PriPlus4|\bPP4\b/i.test(cls) || /Primary Plus 4/i.test(desc)) rawCourse = `${centre.code}-PP4`;
      else if (/PriPlus5|\bPP5\b/i.test(cls) || /Primary Plus 5/i.test(desc)) rawCourse = `${centre.code}-PP5`;
      else if (/PriPlus6|\bPP6\b/i.test(cls) || /Primary Plus 6/i.test(desc)) rawCourse = `${centre.code}-PP6`;
      else if (/StarterA|\bPStA\b/i.test(cls) || /Primary Starter A/i.test(desc)) rawCourse = `${centre.code}-PStA`;
      else if (/StarterB|\bPStB\b/i.test(cls) || /Primary Starter B/i.test(desc)) rawCourse = `${centre.code}-PStB`;
      else if (/SecPlus A1|\bSA1\b/i.test(cls) || /Secondary Plus A1/i.test(desc)) rawCourse = `${centre.code}-SA1`;
      else if (/SecPlus A2|\bSA2\b/i.test(cls) || /Secondary Plus A2/i.test(desc)) rawCourse = `${centre.code}-SA2`;
      else if (/SecPlus B1\.1|\bSB1\.1\b/i.test(cls) || /Secondary Plus B1\.1/i.test(desc)) rawCourse = `${centre.code}-SB1.1`;
      else if (/SecPlus B1\.2|\bSB1\.2\b/i.test(cls) || /Secondary Plus B1\.2/i.test(desc)) rawCourse = `${centre.code}-SB1.2`;
      else if (/SecPlus B2\.1|\bSB2\.1\b/i.test(cls) || /Secondary Plus B2\.1/i.test(desc)) rawCourse = `${centre.code}-SB2.1`;
      else if (/SecPlus B2\.2|\bSB2\.2\b/i.test(cls) || /Secondary Plus B2\.2/i.test(desc)) rawCourse = `${centre.code}-SB2.2`;
      else if (/SecPlus C1|\bSC1\.1\b/i.test(cls) || /Secondary Plus C1/i.test(desc)) rawCourse = `${centre.code}-SC1.1`;
      else if (/USA1\b|Upper Secondary Plus A1/i.test(cls) || /Upper Secondary Plus A1/i.test(desc)) rawCourse = `${centre.code}-USA1`;
      else if (/USA2\b|Upper Secondary Plus A2/i.test(cls) || /Upper Secondary Plus A2/i.test(desc)) rawCourse = `${centre.code}-USA2`;
      else if (/USB1\.1\b/i.test(cls) || /Upper Secondary Plus B1\.1/i.test(desc)) rawCourse = `${centre.code}-USB1.1`;
      else if (/USB1\.2\b/i.test(cls) || /Upper Secondary Plus B1\.2/i.test(desc)) rawCourse = `${centre.code}-USB1.2`;
      else if (/USB2\.1\b/i.test(cls) || /Upper Secondary Plus B2\.1/i.test(desc)) rawCourse = `${centre.code}-USB2.1`;
      else if (/USB2\.2\b/i.test(cls) || /Upper Secondary Plus B2\.2/i.test(desc)) rawCourse = `${centre.code}-USB2.2`;
      else if (/USC1\b/i.test(cls) || /Upper Secondary Plus C1/i.test(desc)) rawCourse = `${centre.code}-USC1`;
      else if (/AD Beg|Beginner|\bBeg\s+[A-D]\b/i.test(cls) || /Beginner/i.test(desc)) rawCourse = `${centre.code}-AD Beg`;
      else if (/British Council English|\bBCE\b/i.test(cls) || /British Council English/i.test(desc)) rawCourse = `${centre.code}-BCE`;
      else rawCourse = `${centre.code}-BCE`;
    }

    // 3. Extract dates & session
    const dateM = String(b.session || "").match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})/);
    const startDate = dateM ? dateM[1] : (b.start || b.startDate || "");
    const endDate = dateM ? dateM[2] : (b.end || b.endDate || "");

    // 4. Extract year (prioritize startDate e.g. 22.11.2026 -> 2026)
    const yearMatch = String(`${startDate} ${b.session || ""} ${b.className || ""}`).match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

    // 5. Schedule info for 12h display
    const schedInfo = parseClassScheduleInfo(b.className || "", b.session || "");

    return {
      className: b.className || b.courseDescription || rawCourse,
      displayClassName: schedInfo.displayClassName || b.className,
      displayClassName24h: schedInfo.displayClassName24h || b.className,
      timeRange12h: schedInfo.timeRange12h,
      timeRange24h: schedInfo.timeRange24h,
      daysText: schedInfo.daysText,
      termText: schedInfo.termText,
      termNum: schedInfo.termNum,
      startDate,
      endDate,
      startDateNum: parseSapDateToNum(startDate),
      endDateNum: parseSapDateToNum(endDate),
      year,
      session: b.session || "",
      location: centre.name,
      _centreKey: centre.key,
      _centreName: centre.shortName,
      _courseCode: rawCourse,
      originalBooking: b,
    };
  }

  global.SAPClient = {
    BASE_SAP_URL,
    SAP_ORIGIN,
    DEFAULT_CONTROLS,
    decodeHtmlEntities,
    cleanSapCellText,
    sapEscape,
    parsePastedAuth,
    mergeCookies,
    buildLoadingPlaceholderBody,
    buildSearchEventQueue,
    buildLinkActivateQueue,
    buildBookingHistoryQueue,
    buildNotesPanelQueue,
    buildNoteCellSelectQueue,
    buildButtonPressQueue,
    buildPopupCloseQueue,
    findNoteControls,
    parseNotePopup,
    titleRevealsLevel,
    detectLevelFromNotesText,
    applySapDeltaUpdates,
    discoverSearchControls,
    parseSearchResults,
    parseStudentDetailScreen,
    parseNotesScreen,
    parseBookingHistoryScreen,
    parseRecommendedAcademicLevel,
    parseSapNumber,
    parseAccountBalance,
    formatStudentName,
    normalizeStudentName,
    getLevelRank,
    sortSameNameDuplicates,
    TEACHING_CENTRES,
    ACADEMIC_LEVEL_KEYS,
    DEFAULT_REG_CONTROLS,
    stepHexId,
    addOneYearToSapDate,
    formatClassTime12h,
    parseClassScheduleInfo,
    parseSapDateToNum,
    resolveSapCourseForLevel,
    parseRegistrationControls,
    parseRegistrationClasses,
    parseSapMessages,
    findRecentCancelledBookings,
    cancelledBookingToClassItem,
    isPrebookedBooking,
    isBookedBooking,
    isActiveBooking,
    extractBookingTermKey,
    isSameTermBooking,
    isTermAlreadyBooked,
  };
})(window);
