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
          // If this is a PARTIAL SapTableCS fragment update, merge/replace rows cleanly by ID (preserving hpm="left"/"none")
          const newTbodies = Array.from(temp.querySelectorAll("tbody"));
          const newRows = Array.from(temp.querySelectorAll("tr"));
          if (newRows.length > 0) {
            newRows.forEach((tr) => {
              const rId = tr.getAttribute("id");
              if (rId) {
                const prevRow = vdomContainer.querySelector(`[id="${CSS.escape(rId)}"]`);
                if (prevRow) {
                  prevRow.replaceWith(tr);
                  return;
                }
              }
              const hpm = (tr.parentElement && tr.parentElement.getAttribute("hpm")) || "";
              const targetTbody =
                (hpm && existing.querySelector(`tbody[hpm="${hpm}"]`)) ||
                (rId && rId.includes("-mrss-cont-left-") && existing.querySelector(`[id$="-mrss-cont-left-content"] tbody`)) ||
                (rId && rId.includes("-mrss-cont-none-") && existing.querySelector(`[id$="-mrss-cont-none-content"] tbody`)) ||
                existing.querySelector(`[id$="-mrss-cont-none-content"] tbody`) ||
                existing.querySelector("tbody") ||
                existing;
              targetTbody.appendChild(tr);
            });
          } else if (newTbodies.length > 0) {
            newTbodies.forEach((tb) => existing.appendChild(tb));
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

    let historyPopupId = null;
    let bookingHistoryItemId = null;
    let historyMenuBtn = null;

    const histBtnMatch =
      decodedXml.match(
        /id="(WD[0-9A-F]+)"[^>]*ct="B"[^>]*lsdata='[^']*["']0["']\s*:\s*["']History["'][^']*["']15["']\s*:\s*["'](WD[0-9A-F]+)["']/i
      ) ||
      decodedXml.match(
        /ct="B"[^>]*id="(WD[0-9A-F]+)"[^>]*lsdata='[^']*["']0["']\s*:\s*["']History["'][^']*["']15["']\s*:\s*["'](WD[0-9A-F]+)["']/i
      ) ||
      decodedXml.match(
        /id="(WD[0-9A-F]+)"[^>]*ct="B"[^>]*lsdata='[^']*["']15["']\s*:\s*["'](WD[0-9A-F]+)["'][^']*["']0["']\s*:\s*["']History["']/i
      );
    if (histBtnMatch) {
      historyMenuBtn = histBtnMatch[1];
      historyPopupId = histBtnMatch[2];
    }

    const bookingItemMatch =
      decodedXml.match(/<tr[^>]*ct="POMNI"[^>]*lsdata='[^']*Booking\s+history[^']*'[^>]*id="(WD[0-9A-F]+)"/i) ||
      decodedXml.match(/<tr[^>]*id="(WD[0-9A-F]+)"[^>]*ct="POMNI"[^>]*lsdata='[^']*Booking\s+history/i) ||
      decodedXml.match(/<tr[^>]*id="(WD[0-9A-F]+)"[^>]*aria-label="Booking\s+history"/i) ||
      decodedXml.match(/<tr[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="POMNI"[^>]*>[\s\S]{0,450}?Booking\s+history/i);

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

    // DOM fallback on cumulative vdom (catches cases where rawXml was partial or lsdata order differed)
    if (vdom && (!bookingHistoryItemId || !historyPopupId || !historyMenuBtn)) {
      if (!historyMenuBtn || !historyPopupId) {
        const btns = Array.from(vdom.querySelectorAll('[ct="B"][id^="WD"]'));
        const histBtn = btns.find((b) => /\bHistory\b/i.test(b.textContent || b.getAttribute("lsdata") || ""));
        if (histBtn) {
          if (!historyMenuBtn) historyMenuBtn = histBtn.getAttribute("id");
          const ls = histBtn.getAttribute("lsdata") || "";
          const popM = ls.match(/["']15["']\s*:\s*["'](WD[0-9A-F]+)["']/i);
          if (popM && !historyPopupId) historyPopupId = popM[1];
        }
      }
      if (!bookingHistoryItemId) {
        const pomniRows = Array.from(vdom.querySelectorAll('tr[ct="POMNI"][id^="WD"]'));
        const histRow = pomniRows.find((tr) =>
          /Booking\s+history/i.test(`${tr.textContent || ""} ${tr.getAttribute("lsdata") || ""} ${tr.getAttribute("aria-label") || ""}`)
        );
        if (histRow) {
          bookingHistoryItemId = histRow.getAttribute("id");
          if (!historyPopupId) {
            const parentPomn = histRow.closest('table[ct="POMN"][id^="WD"]');
            if (parentPomn) historyPopupId = parentPomn.getAttribute("id");
          }
          if (!historyMenuBtn && bookingHistoryItemId) {
            const hexNum = parseInt(bookingHistoryItemId.replace(/^WD/, ""), 16);
            if (!isNaN(hexNum)) {
              historyMenuBtn = "WD" + (hexNum - 1).toString(16).toUpperCase().padStart(4, "0");
            }
          }
        }
      }
    }

    historyPopupId = historyPopupId || DEFAULT_CONTROLS.historyPopupId;
    bookingHistoryItemId = bookingHistoryItemId || DEFAULT_CONTROLS.bookingHistoryItemId;
    historyMenuBtn = historyMenuBtn || DEFAULT_CONTROLS.historyMenuBtn;

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
          const re = new RegExp('LIST_VIEW\\.' + field + '[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:span|td|div|a)', 'i');
          const m = chunk.match(re);
          if (m && m[1]) {
            const cleaned = cleanSapCellText(m[1].replace(/<[^>]+>/g, ""));
            if (cleaned) return cleaned;
          }
          const inpRe = new RegExp('<input[^>]*LIST_VIEW\\.' + field + '[^>]*value="([^"]*)"', 'i');
          const im = chunk.match(inpRe);
          if (im && im[1]) return cleanSapCellText(im[1]);
          return "";
        }

        const linkM =
          chunk.match(/<a[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="LN"[^>]*>/i) ||
          chunk.match(/<a[^>]*\bct="LN"[^>]*\bid="(WD[0-9A-F]+)"[^>]*>/i) ||
          chunk.match(/<a[^>]*\bid="(WD[0-9A-F]+)"[^>]*>/i);
        const linkId = (linkM && linkM[1]) || "";
        const courseCode = getHint("E_SHORT_FPM_CE") || getHint("SM_SHORT_FPM_CE");
        const courseDescription = getHint("SM_STEXT_FPM_CE");
        const classTitle = getHint("E_SHORT_FPM_CE") || courseCode;
        const className = getHint("E_STEXT_FPM_CE");
        const teacherName = getHint("TEACHER_FPM_CE");
        const teachingCentre = getHint("O_STEXT_FPM_CE");
        const periodStart = getHint("PERID_BEGDA_FPM_CE");
        const periodEnd = getHint("PERID_ENDDA_FPM_CE");
        const classStart = getHint("EV_BEGDA_FPM_CE") || getHint("E_BEGDA_FPM_CE") || getHint("BEGDA_FPM_CE");
        const classEnd = getHint("EV_ENDDA_FPM_CE") || getHint("E_ENDDA_FPM_CE") || getHint("ENDDA_FPM_CE");
        const sessionParts = [getHint("PERYR_FPM_CE"), getHint("PERIT_FPM_CE"), periodStart, periodEnd].filter(Boolean);
        const session = sessionParts.join(" ");
        const bookingSource = getHint("ORIGIN_FPM_CE");
        const bookingType = getHint("BOOKING_TYPE_FPM_CE");
        const status = getHint("SMSTATUST_FPM_CE");
        const bookingDate = getHint("BOOKDATE_FPM_CE") || getHint("CREATED_ON_FPM_CE") || getHint("CRDAT_FPM_CE");
        const bookingTime = getHint("BOOKTIME_FPM_CE") || getHint("CREATED_AT_FPM_CE");

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
              actualStartDate: classStart || "",
              actualEndDate: classEnd || "",
              linkId,
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
            const linkEl = tr.querySelector('a[id^="WD"][ct="LN"], a[id^="WD"]');
            const linkId = (linkEl && linkEl.getAttribute("id")) || "";

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
                linkId,
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
    parseSapDateToNum,
  };
})(window);