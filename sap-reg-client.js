// ============================================================================
// SAP Registration & Live Class Schedules Parser (ZHER_WA_REGISTRATION)
// Extends window.SAPClient with course resolution, schedule & T&C control parsers
// ============================================================================
(function (global) {
  const {
    decodeHtmlEntities,
    cleanSapCellText,
    parseSapDateToNum,
  } = global.SAPClient;

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

    // Registrations table ID & row count (FPM_LIST_UIBB_ATS.LIST_VIEW.DYNAMIC_TABLE or SapTableCS control update)
    let regListTableId = null;
    const regTableM =
      dec.match(/id="(WD[0-9A-F]+)"[^>]*data-hint="[^"]*(?:ID_[0-9A-F]+:)?LIST_VIEW\.DYNAMIC_TABLE/i) ||
      dec.match(/data-hint="[^"]*(?:ID_[0-9A-F]+:)?LIST_VIEW\.DYNAMIC_TABLE[^"]*id="(WD[0-9A-F]+)"/i) ||
      dec.match(/<control-update\b[^>]*\bid="(WD[0-9A-F]+)"[^>]*updateMethod="PARTIAL"[^>]*><content><!\[CDATA\[<table\b[^>]*\b(?:iVisibleContentRowCount|iContentRowCount)/i) ||
      dec.match(/<(?:table|div)\b[^>]*\bid="(WD[0-9A-F]+)"[^>]*\bct="STCS"[^>]*lsdata='\{[^']*?["']0["']\s*:\s*["']LIST_VIEW/i);
    if (regTableM) {
      regListTableId = regTableM[1];
    }
    const hasSpacerFragment = /bIsSpacerFragment="true"/i.test(dec);
    const tableCrcM =
      (regListTableId ? dec.match(new RegExp(`id="${regListTableId}"[^>]*crc="(\\d+)"`, "i")) : null) ||
      dec.match(/data-hint="[^"]*(?:ID_[0-9A-F]+:)?LIST_VIEW\.DYNAMIC_TABLE"[^>]*crc="(\d+)"/i) ||
      dec.match(/<table\b[^>]*\biContentRowCount="(\d+)"/i) ||
      dec.match(/<table\b[^>]*\biVisibleContentRowCount="(\d+)"/i);
    const regRowCount = tableCrcM ? parseInt(tableCrcM[1], 10) : 0;

    // TAC checkbox(es) in registration table (LIST_VIEW.TAC_FPM_CE) — supports single & multi-term rows
    // Note: SAP Web Dynpro (FPM_LIST_UIBB_ATS) only emits data-hint="...LIST_VIEW.TAC_FPM_CE..." on Row 1 (rr="1")
    // and the column header, NOT on Row 2 (rr="2"), Row 3 (rr="3"), etc., nor in subsequent delta updates!
    // So we scan all <tr rr="k"> rows of the entire LIST_VIEW table (which spans multiple <tbody iRowIndexOffset="..."> fragments)
    // and pick the Terms & Conditions checkbox (last checkbox column in each row, excluding ct="CB" ComboBoxes).
    let tacCheckboxId = null;
    const tacCheckboxIds = [];
    const uncheckedTacCheckboxIds = [];
    const seenTacIds = new Set();

    const recordTacTag = (cbTag) => {
      if (!cbTag || /CPT_FPM_HEADER/i.test(cbTag)) return;
      // Strictly exclude ComboBox dropdowns (ct="CB")
      if (/\bct="CB\b/i.test(cbTag)) return;
      const idM = cbTag.match(/\bid="(WD[0-9A-F]+)"/i);
      if (!idM) return;
      const id = idM[1];
      const hasExplicitUnchecked = /\baria-checked="false"/i.test(cbTag);
      const isChecked =
        !hasExplicitUnchecked &&
        (/aria-checked="true"/i.test(cbTag) ||
          /(?:["']1["']|\b1)\s*:\s*true/i.test(cbTag) ||
          /(?:^|\s)checked(?:=(?:"(?:checked|true|1|)"|'(?:checked|true|1|)'|true|1))?(?=[\s>\/]|$)/i.test(cbTag));
      if (!seenTacIds.has(id)) {
        seenTacIds.add(id);
        tacCheckboxIds.push(id);
        if (!isChecked) {
          uncheckedTacCheckboxIds.push(id);
        }
      }
    };

    const isCheckboxTag = (tag) => {
      if (!tag || /\bct="CB\b/i.test(tag) || /^<label\b/i.test(tag) || /\bct="L\b/i.test(tag)) return false;
      return (
        /\bct="(?:C|CBX|C_standards)"/i.test(tag) ||
        /\brole="checkbox"/i.test(tag) ||
        /\bclass="[^"]*lsCheckBox/i.test(tag) ||
        /TAC_FPM_CE/i.test(tag) ||
        /\btype="checkbox"/i.test(tag)
      );
    };

    // 1. Scan ALL table rows <tr rr="k"> across dec (excluding popup table V_LIST)
    const trRe = /<tr\b[^>]*\brr="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRe.exec(dec)) !== null) {
      if (/V_LIST/i.test(trMatch[0])) continue; // Ignore search popup table rows
      const rr = parseInt(trMatch[1], 10);
      if (!rr || rr < 1) continue;
      const rowHtml = trMatch[2];
      const cbTags = Array.from(
        rowHtml.matchAll(/<(?:span|input|div)\b[^>]*>/gi)
      )
        .map((m) => m[0])
        .filter(isCheckboxTag);
      if (cbTags.length === 0) continue;
      const explicitTac = cbTags.find((t) => /LIST_VIEW\.TAC_FPM_CE/i.test(t));
      // In LIST_VIEW, "Terms and Conditions" is the last checkbox column (after "Vario")
      const chosenTag = explicitTac || cbTags[cbTags.length - 1];
      recordTacTag(chosenTag);
    }

    // 2. Also scan any direct tags with LIST_VIEW.TAC_FPM_CE (in case of partial cell-only delta updates)
    const tacHintRe = /<[^>]*LIST_VIEW\.TAC_FPM_CE[^>]*>/gi;
    let tacM;
    while ((tacM = tacHintRe.exec(dec)) !== null) {
      const tag = tacM[0];
      if (/CPT_FPM_HEADER/i.test(tag) || /^<label\b/i.test(tag) || /\bct="L\b/i.test(tag)) continue;
      if (isCheckboxTag(tag)) {
        recordTacTag(tag);
      } else {
        const chunk = dec.slice(tacM.index, tacM.index + 1200);
        const innerCheck = chunk.match(/<(?:span|input|div)\b[^>]*>/i);
        if (innerCheck && isCheckboxTag(innerCheck[0])) recordTacTag(innerCheck[0]);
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

    if (b1.start && b2.start && b1.start === b2.start) return true;
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

    const hasAnyPrebooked = bookings.some((b) => !isConsultation(b) && isPrebookedBooking(b));
    if (hasAnyPrebooked) {
      return { allCancelled: [], latestBatch: [], latestDate: null, count: 0 };
    }

    const cancelled = bookings.filter((b) => isCancelled(b) && !isConsultation(b) && !isTermAlreadyBooked(b, bookings));
    if (cancelled.length === 0) {
      return { allCancelled: [], latestBatch: [], latestDate: null, count: 0 };
    }

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

  function cancelledBookingToClassItem(b, centres = TEACHING_CENTRES) {
    if (!b) return null;
    const centresList = Array.isArray(centres) && centres.length > 0 ? centres : TEACHING_CENTRES;

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
      centre = centresList[0];
    }

    let rawCourse = String(b.courseCode || "").trim().replace(/^EG\s+/i, "");
    if (!rawCourse || rawCourse === "—" || rawCourse.length < 3) {
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

    const dateM = String(b.session || "").match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})/);
    const startDate = dateM ? dateM[1] : (b.start || b.startDate || "");
    const endDate = dateM ? dateM[2] : (b.end || b.endDate || "");

    const yearMatch = String(`${startDate} ${b.session || ""} ${b.className || ""}`).match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

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

  Object.assign(global.SAPClient, {
    TEACHING_CENTRES,
    ACADEMIC_LEVEL_KEYS,
    DEFAULT_REG_CONTROLS,
    stepHexId,
    addOneYearToSapDate,
    formatClassTime12h,
    parseClassScheduleInfo,
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
  });
})(window);
