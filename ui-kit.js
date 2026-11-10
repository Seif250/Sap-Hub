// ============================================================================
// UI Kit — icons, copy button, formatting helpers, derived student model,
// and dynamic message builders. No SAP calls here.
// ============================================================================
(function (global) {
  const React = global.React;
  const { useState } = React;
  const html = global.htm.bind(React.createElement);
  const KB = global.BCKnowledgeBase;

  // ---- Icons (Lucide paths, stroke-based) ----------------------------------
  const P = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    whatsapp: '<path d="M3 21l1.7-5A9 9 0 1 1 8 19.3z"/><path d="M9 10a1 1 0 0 0 1 1 5 5 0 0 0 4 4 1 1 0 0 0 1-1v-1l-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2H9z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.3 18"/><path d="M7 6h1v4"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<path d="m10.3 3.9-8.2 14A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-3.1l-8.2-14a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2-1.5M12 20h.01"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    chevUp: '<path d="m18 15-6-6-6 6"/>',
    chevRight: '<path d="m9 18 6-6-6-6"/>',
    sort: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  };
  function Icon({ name, size = 16, className = "", strokeWidth = 1.8 }) {
    return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth=${strokeWidth} strokeLinecap="round" strokeLinejoin="round" className=${"shrink-0 " + className}
      dangerouslySetInnerHTML=${{ __html: P[name] || "" }} />`;
  }

  // ---- Formatting ----------------------------------------------------------
  const egp = (n) => `${Math.round(Number(n) || 0).toLocaleString("en-US")} EGP`;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(d) {
    const dt = d instanceof Date ? d : KB.parseFlexibleDate(d);
    if (!dt || isNaN(dt)) return d || "—";
    return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
  }
  function timeAgo(d) {
    if (!d) return "";
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    return `${Math.floor(s / 3600)} h ago`;
  }

  // ---- Booking helpers -----------------------------------------------------
  function bookingDates(b) {
    const m = String(b.session || "").match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})/);
    return {
      start: m ? m[1] : b.start || "",
      end: m ? m[2] : b.end || "",
      sessionName: String(b.session || "").replace(/\s*\d{2}\.\d{2}\.\d{4}.*/, "")
    };
  }
  function bookingStatusTone(status) {
    const s = (status || "").toLowerCase();
    if (s.includes("cancel")) return "red";
    if (s.includes("completed")) return "green";
    if (s.includes("booked")) return "blue";
    if (s.includes("wait") || s.includes("reserv")) return "amber";
    return "gray";
  }
  const isConsultation = (b) =>
    /ylcon|adcon|consultation|placement|assessment/i.test(`${b.courseCode} ${b.courseDescription} ${b.className}`);

  // ---- Derived student model (all rules come from bc-kb.js) -----------------
  function deriveStudent(profile, bookings, siblings) {
    const a = KB.analyzeSapStudentAndHistory(profile, bookings);
    const age = a.ageInfo;
    const isAdult = !!(age && age.stageCategory === "Adult");
    const isEarlyYears = Boolean(
      (age && (age.stageCategory === "YL" || age.isEarlyYears) && (age.academicYears <= 5 || age.years <= 5)) ||
      a.isEarlyYears
    );

    const acadYrs = (age && typeof age.academicYears === "number") ? age.academicYears : (age ? age.years : 4);
    let eyLevel = acadYrs >= 5 ? "Early Years 3 (Owls)" : "Early Years 2 (Ducks)";
    if (acadYrs <= 3) eyLevel = "Early Years 1 (Pre-School)";

    const rawLvl = String((profile && profile.level) || "").trim();
    if (rawLvl && /ducks/i.test(rawLvl)) eyLevel = "Early Years 2 (Ducks)";
    else if (rawLvl && /owls/i.test(rawLvl)) eyLevel = "Early Years 3 (Owls)";

    const hasSpecificAssignedLevel = Boolean(
      rawLvl &&
      !/^a0(\s|$)/i.test(rawLvl) &&
      !/no\s*level|راسب|ساقط|no\s*level\s*assigned|checking/i.test(rawLvl)
    );

    // Check for prebooked / pending payment Placement Test (PT / Consultation)
    // E.g. "EG Adult Online/Phone Consultation", "YL Consultation", etc.
    const prebookedConsultation = (profile && profile.hasPrebookedPT && profile.prebookedPT) || (a && a.prebookedPT) || (bookings || []).find((b) => {
      const desc = `${b.courseCode || ""} ${b.courseDescription || ""} ${b.classTitle || ""} ${b.className || ""} ${b.session || ""}`;
      const isPT = /ylcon|adcon|consultation|placement|assessment|\bpt\b/i.test(desc);
      if (!isPT) return false;
      const s = String(b.status || "").toLowerCase();
      if (s.includes("cancel")) return false;
      return s.includes("prebook") || s.includes("reserv") || s.includes("pending") || s.includes("wait");
    });
    const hasPrebookedPT = Boolean(prebookedConsultation);

    // Early Years children (Age 4-5 / Ducks & Owls) NEVER take or fail a Placement Test!
    // Students with prebooked PT are awaiting payment/test, NOT failed!
    // "No level assigned" in SAP is merely an unassigned placeholder, NOT a failed PT!
    const isNoLevel = !isEarlyYears && !hasPrebookedPT && Boolean(
      profile &&
      !hasSpecificAssignedLevel && (
        profile.isNoLevel ||
        (!/no\s*level\s*assigned/i.test(rawLvl) && /no\s*level|راسب|ساقط/i.test(rawLvl)) ||
        /no\s*level|راسب|ساقط/i.test(profile.detectedLevelFromNotes || "") ||
        (Array.isArray(profile.notesList) && profile.notesList.some((n) => /\bno\s*level\b|راسب|ساقط/i.test(n.title || n.text || "")))
      )
    );

    let status = { label: "New", tone: "gray", reason: "No bookings found in SAP" };
    if (isEarlyYears) {
      status = a.activeBookings.length
        ? { label: "Active", tone: "green", reason: "Has a current booking" }
        : a.completedCourses.length
        ? { label: "Inactive", tone: "amber", reason: "Past student, no current booking" }
        : { label: "New (Early Years)", tone: "green", reason: `${eyLevel}: Direct enrollment without Placement Test` };
    } else if (hasPrebookedPT) {
      status = {
        label: "PT Prebooked (Unpaid)",
        tone: "amber",
        reason: "Placement test is prebooked and awaiting payment (200 EGP). Level will be determined after payment.",
      };
    } else if (isNoLevel) {
      status = {
        label: "No Level (Failed PT)",
        tone: "red",
        reason: "Did not pass placement — No Level recorded in notes",
      };
    } else if (a.hasActiveHold) {
      status = { label: "On Hold", tone: "red", reason: "Active hold on SAP record" };
    } else if (a.activeBookings.length) {
      status = { label: "Active", tone: "green", reason: "Has a current booking" };
    } else if (a.completedCourses.length) {
      status = { label: "Inactive", tone: "amber", reason: "Past student, no current booking" };
    }

    // Sibling eligibility: must be DIFFERENT under-18 children (distinct names, case-insensitive)
    const uniqueKids = [];
    const seenNames = new Set();
    (siblings || []).forEach((s) => {
      const sNorm = (global.SAPClient && global.SAPClient.normalizeStudentName)
        ? global.SAPClient.normalizeStudentName(s.fullName || `${s.firstName || ""} ${s.lastName || ""}`)
        : String(s.fullName || `${s.firstName || ""} ${s.lastName || ""}`).trim().toLowerCase().replace(/\s+/g, " ");
      const ag = KB.calculateDetailedAge(s.dob);
      if (ag && ag.years < 18 && !seenNames.has(sNorm)) {
        seenNames.add(sNorm);
        uniqueKids.push(s);
      }
    });
    let siblingEligible = false;
    let siblingReason = "No siblings found on this contact";
    if (!isAdult && uniqueKids.length >= 2) {
      const me = KB.parseFlexibleDate(profile.dob);
      const eldest = uniqueKids.map((k) => KB.parseFlexibleDate(k.dob)).filter(Boolean).sort((x, y) => x - y)[0];
      siblingEligible = !!(me && eldest && me > eldest);
      siblingReason = siblingEligible
        ? `${uniqueKids.length} children on this contact — younger sibling`
        : `Eldest of ${uniqueKids.length} children — discount applies to younger siblings`;
    }

    const lastCourse = a.completedCourses.slice().sort((x, y) => (y.parsedDate || 0) - (x.parsedDate || 0))[0];

    let pt;
    if (isEarlyYears) {
      pt = {
        label: "Exempt",
        tone: "green",
        fee: 0,
        detail: `${eyLevel} · Ages 4 & 5 do NOT need a Placement Test (Direct Enrollment)`,
      };
    } else if (hasPrebookedPT) {
      pt = {
        label: "Prebooked (Unpaid)",
        tone: "amber",
        fee: KB.PRICING.placementTestFee,
        detail: `200 EGP prebooked (${prebookedConsultation.courseDescription || prebookedConsultation.className || "Placement Test"}) · awaiting payment — level will be set after payment & test`,
      };
    } else if (isNoLevel) {
      pt = {
        label: "Retest Required",
        tone: "red",
        fee: KB.PRICING.placementTestFee,
        detail: `${egp(KB.PRICING.placementTestFee)} · did not pass the previous placement test — retest needed`,
      };
    } else if (a.ptRequired) {
      pt = {
        label: "Required",
        tone: "amber",
        fee: KB.PRICING.placementTestFee,
        detail: `${egp(KB.PRICING.placementTestFee)} · no valid test or level on record`,
      };
    } else {
      pt = {
        label: "Exempt",
        tone: "green",
        fee: 0,
        detail: a.isEarlyYears
          ? "Early Years (age 4–5)"
          : a.hasValidRecentPT
            ? `Test taken ${a.daysSinceLastPT} days ago`
            : a.levelInfo.hasAssignedLevel
              ? "Level assigned in SAP"
              : "Recent course on record",
      };
    }

    const prog = a.progression || null;
    const hasAgeTransition = Boolean(isAdult && prog && prog.ageTransition && prog.ageTransition.hasAgedUp);
    const adultTransitionLevel = hasAgeTransition ? prog.ageTransition.recommendedLevel : null;

    const rawAssignedLevel = isEarlyYears
      ? eyLevel
      : hasPrebookedPT
      ? "Pending PT Payment (Unpaid)"
      : isNoLevel
      ? "No Level (Failed PT)"
      : (prog && prog.targetLevel
      ? prog.targetLevel
      : (profile.level && !/no level/i.test(profile.level) ? profile.level : null));
    const normalizedWinterStream = a.levelInfo && a.levelInfo.winterStream ? a.levelInfo.winterStream : rawAssignedLevel;

    // For Adult students (18+):
    // 1. Beginner (Beg A-E): linear progression when passed with success.
    // 2. Advanced / General English (A1-C2): just read what is written on record, no term counters, no new level proposed.
    const isYlLevel = /primary|secondary|early\s*years|starter|pre-school|ducks|owls|sec\b/i.test(rawAssignedLevel || "");
    let currentActualLevel;
    let recommendedBookingLevel;

    if (isEarlyYears) {
      currentActualLevel = eyLevel;
      recommendedBookingLevel = eyLevel;
    } else if (hasPrebookedPT) {
      currentActualLevel = "Pending PT Payment (Unpaid)";
      recommendedBookingLevel = "Pending PT Payment";
    } else if (isNoLevel) {
      currentActualLevel = "No Level (Failed PT)";
      recommendedBookingLevel = currentActualLevel;
    } else if (isAdult && prog && prog.isAdult) {
      currentActualLevel = prog.currentLevel;
      recommendedBookingLevel = prog.recommendedBookingLevel || prog.currentLevel;
    } else if (isAdult && (adultTransitionLevel || isYlLevel)) {
      const cefrMatch = (rawAssignedLevel || "").match(/\b([A-C][12])(?:\.[12])?\b/i);
      const cefr = cefrMatch ? cefrMatch[1].toUpperCase() : "";
      const baseAdultLevel = adultTransitionLevel || (cefr ? `BCE ${cefr}` : "BCE");
      currentActualLevel = baseAdultLevel;
      recommendedBookingLevel = baseAdultLevel;
    } else {
      currentActualLevel = (prog && prog.targetLevel) || normalizedWinterStream || rawAssignedLevel;
      recommendedBookingLevel = (!isNoLevel && prog && prog.recommendedBookingLevel)
        ? prog.recommendedBookingLevel
        : currentActualLevel;
    }

    return {
      profile,
      analysis: a,
      progression: prog,
      age,
      isAdult,
      isEarlyYears,
      isNoLevel,
      hasPrebookedPT,
      prebookedPT: prebookedConsultation || null,
      status,
      rawAssignedLevel,
      level: currentActualLevel,
      recommendedBookingLevel,
      levelSource: (isAdult && (adultTransitionLevel || isYlLevel))
        ? `Age Transition to Adult 18+ (from ${rawAssignedLevel || profile.levelSource || "SAP Record"})`
        : (prog && prog.overriddenByNewerRecord)
        ? `${prog.overriddenByNewerRecord.source} (${prog.overriddenByNewerRecord.dateStr})`
        : (profile.levelSource || "SAP Record"),
      centre: a.matchedBranch ? a.matchedBranch.name : (profile.teachingCentre || a.detectedCentre || "").replace(/\s*Teaching Centre/i, "") || null,
      branch: a.matchedBranch,
      summer: a.levelInfo.summerEquivalent,
      pt,
      reReg: {
        eligible: !isNoLevel && a.eligibleForReRegDiscount,
        appliesTo: isAdult,
        reason: isNoLevel
          ? "Not eligible for re-registration discount (did not pass placement)"
          : a.daysSinceLastCourse == null
            ? "No previous course"
            : `Last course activity ${a.daysSinceLastCourse} days ago`,
      },
      sibling: { eligible: siblingEligible, reason: siblingReason },
      lastCourse,
      balance: profile.accountBalance || {
        open: 0,
        debit: 0,
        credit: 0,
        currency: "EGP",
        isCredit: false,
        isDebt: false,
        isSettled: true,
        amount: 0,
        formatted: "0 EGP",
      },
      recLevels: profile.recLevels || [],
      latestRecLevel: profile.latestRecLevel || null,
    };
  }

  // ---- Discount breakdown from KB quote -------------------------------------
  function breakdown(q, opts) {
    const rows = [];
    if (q.effectiveProgram === "adult") {
      if (q.discountAmount) rows.push({ label: "Re-registration (10%)", amount: q.discountAmount });
    } else {
      const rate = KB.PRICING.bundleDiscounts[opts.terms] || 0;
      const bundle = Math.round(q.baseTuition * rate);
      if (bundle) rows.push({ label: `Bundle (${rate * 100}%)`, amount: bundle });
      const rest = q.discountAmount - (rate ? bundle : 0);
      if (rest > 0) rows.push({ label: "Sibling (10%)", amount: rest });
    }
    return rows;
  }

  // ---- Message builders -----------------------------------------------------
  global.UIKit = { html, Icon, egp, fmtDate, timeAgo, bookingDates, bookingStatusTone, isConsultation, deriveStudent, breakdown };
})(window);
