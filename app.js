// ============================================================================
// SAP Student Sales Copilot — App shell & screens
// Data: SapService (live SAP only)
// Rules & pricing: BCKnowledgeBase only. No hardcoded calculations here.
// ============================================================================
(function (global) {
  const React = global.React;
  const { useState, useEffect, useMemo, useRef } = React;
  const { html, Icon, egp, fmtDate, timeAgo, bookingDates, bookingStatusTone, isConsultation, deriveStudent, breakdown } = global.UIKit;
  const KB = global.BCKnowledgeBase;
  const SAPC = global.SAPClient;
  const Svc = global.SapService;
  const BANKS = KB.PRICING.supportedBanks || []; // configure in bc-kb.js → PRICING.supportedBanks

  const NAV = [
    { id: "lookup", label: "Student Lookup", icon: "home" },
    { id: "pricing", label: "Pricing & Plans", icon: "tag" },
    { id: "mapping", label: "Course Mapping", icon: "swap" },
  ];

  const Pill = ({ tone = "gray", children, icon }) =>
    html`<span className=${`pill pill-${tone}`}>${icon && html`<${Icon} name=${icon} size=${12} strokeWidth=${2.4} />`}${children}</span>`;

  // ==========================================================================
  // Pricing hook — shared by Student Lookup
  // ==========================================================================
  function usePricing(dob, model) {
    const [terms, setTerms] = useState(2);
    const [adultCourseId, setAdultCourseId] = useState("bce");
    const [credits, setCredits] = useState(40);
    const [includePT, setIncludePT] = useState(false);
    const [reReg, setReReg] = useState(false);
    const [sibling, setSibling] = useState(false);
    const [plan, setPlan] = useState("6");
    const [bank, setBank] = useState("");
    const [fallbackAgeGroup, setFallbackAgeGroup] = useState("secondary"); // "primary" | "secondary" | "adult"

    // Auto-apply eligibility when the student changes (agent can still override)
    useEffect(() => {
      if (!model) return;
      setIncludePT(model.analysis.ptRequired);
      setReReg(model.isAdult && model.reReg.eligible);
      setSibling(!model.isAdult && model.sibling.eligible);
      if (model.isAdult && /beginner|beg|a0/i.test(model.level || "")) {
        setAdultCourseId("beginner");
      }
    }, [model]);

    const effectiveDob = dob || (fallbackAgeGroup === "primary" ? "2017-01-01" : fallbackAgeGroup === "adult" ? "2000-01-01" : "2012-01-01");
    const isAdult = model ? model.isAdult : (KB.calculateDetailedAge(effectiveDob) || {}).stageCategory === "Adult";
    const q = useMemo(() => {
      if (!effectiveDob || !KB.calculateDetailedAge(effectiveDob)) return null;
      const baseQuote = KB.calculateSingleStudentQuote({
        dob: effectiveDob, programType: "auto", winterTerms: terms, adultCourseId, adultCredits: credits,
        registrationType: isAdult && reReg ? "re-reg" : "new",
        hasSiblingDiscount: !isAdult && sibling, includePlacementTest: includePT,
      });
      if (!baseQuote) return null;

      // Handle Account Balance (Debt vs Credit)
      // Positive balance: customer owes money (debt) -> add to totalCash and installment totals
      // Negative balance: customer has credit -> deduct from totalCash and installment totals
      let debtAmount = 0;
      let creditAmount = 0;
      if (model && model.balance) {
        if (model.balance.isDebt && model.balance.amount > 0) {
          debtAmount = model.balance.amount;
        } else if (model.balance.isCredit && model.balance.amount > 0) {
          creditAmount = model.balance.amount;
        }
      }

      const totalCash = Math.max(0, baseQuote.totalCash + debtAmount - creditAmount);
      const total6M = baseQuote.total6M ? Math.max(0, baseQuote.total6M + debtAmount - creditAmount) : totalCash;
      const total12M = baseQuote.total12M ? Math.max(0, baseQuote.total12M + debtAmount - creditAmount) : totalCash;
      const monthly6M = Math.round(total6M / 6);
      const monthly12M = Math.round(total12M / 12);

      return {
        ...baseQuote,
        debtAmount,
        creditAmount,
        totalCash,
        total6M,
        total12M,
        monthly6M,
        monthly12M,
      };
    }, [effectiveDob, terms, adultCourseId, credits, includePT, reReg, sibling, isAdult, model]);

    return {
      q, isAdult, terms, setTerms, adultCourseId, setAdultCourseId, credits, setCredits,
      includePT, setIncludePT, reReg, setReReg, sibling, setSibling, plan, setPlan, bank, setBank,
      fallbackAgeGroup, setFallbackAgeGroup
    };
  }

  // ==========================================================================
  // Header & Sidebar
  // ==========================================================================
  function Header({ conn, onRefresh, onSettings, onOpenBooking, hasStudent, refreshing, syncStatus }) {
    const tone = conn.state === "connected" ? "green" : conn.state === "error" ? "red" : "gray";
    const label = { connected: "SAP Connected", error: "SAP Error", idle: "SAP Not connected" }[conn.state];
    return html`<header className="app-header h-14 shrink-0 flex items-center justify-between px-5 border-b" style=${{ borderColor: "var(--line)" }}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-2 gap-[3px]">${[0, 1, 2, 3].map((i) => html`<span key=${i} className="w-[9px] h-[9px] rounded-full" style=${{ background: "var(--bc-navy)" }}></span>`)}</div>
          <div className="leading-[1.05] font-bold text-[12px] tracking-wide" style=${{ color: "var(--bc-navy)" }}>BRITISH<br />COUNCIL</div>
        </div>
        <div className="w-px h-8" style=${{ background: "var(--line)" }}></div>
        <div className="leading-tight">
          <div className="font-semibold text-[15px]" style=${{ color: "var(--bc-navy)" }}>Sales Assistant</div>
          <div className="muted text-[11.5px]">SAP Student Sales Copilot</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        ${typeof onOpenBooking === "function" && html`
          <button
            type="button"
            onClick=${onOpenBooking}
            className=${`btn ${hasStudent ? "btn-primary" : ""} !h-8 !px-3 text-[12px] font-semibold flex items-center gap-1.5`}
            title="Open SAP Course Schedules & Registration popup"
          >
            <${Icon} name="calendar" size=${14} />
            <span>Schedules & Registration</span>
          </button>
        `}
        ${(Svc.isExtensionBridgeActive && Svc.isExtensionBridgeActive()) ? html`
          <span className="pill pill-green h-7 px-2.5 text-[11px] font-medium flex items-center gap-1" title="Direct Chrome Extension Bridge active: Running serverless directly in browser">
            <${Icon} name="zap" size=${13} /> Extension Bridge
          </span>
        ` : (syncStatus && syncStatus.hasCookie && html`
          <span className="pill pill-green h-7 px-2.5 text-[11px] font-medium" title="Extension is actively syncing cookies from SAP">
            <${Icon} name="zap" size=${13} /> Auto-Sync Active
          </span>
        `)}
        <span title=${conn.message || ""} className=${`pill pill-${tone} h-7 px-3`}>
          <span className="w-1.5 h-1.5 rounded-full" style=${{ background: "currentColor" }}></span>${label}
          ${conn.at && conn.state === "connected" && html`<span className="font-normal opacity-70">· ${timeAgo(conn.at)}</span>`}
        </span>
        <button className="btn btn-icon" title="Refresh SAP session" onClick=${onRefresh} disabled=${refreshing}>
          <${Icon} name="refresh" className=${refreshing ? "animate-spin" : ""} />
        </button>
        <button className="btn btn-icon" title="Settings (SAP cookie)" onClick=${onSettings}><${Icon} name="settings" /></button>
      </div>
    </header>`;
  }

  function Sidebar({ page, setPage }) {
    const [collapsed, setCollapsed] = useState(false);
    const item = (n) => html`<button key=${n.id} className=${`nav-item ${page === n.id ? "active" : ""}`} onClick=${() => setPage(n.id)} title=${n.label}>
      <${Icon} name=${n.icon} /><span className="nav-label">${n.label}</span></button>`;
    return html`<aside className=${`app-sidebar ${collapsed ? "collapsed" : ""} w-[196px] shrink-0 border-r flex flex-col p-3 gap-1`} style=${{ borderColor: "var(--line)", background: "#fbfcfe" }}>
      <button className="sidebar-toggle btn btn-icon mb-2" title=${collapsed ? "Expand navigation" : "Collapse navigation"} onClick=${() => setCollapsed((v) => !v)}><${Icon} name=${collapsed ? "chevRight" : "chevLeft"} size=${15} /></button>
      ${NAV.map(item)}
      <div className="mt-auto px-2 text-[11px] muted flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>v2.0 · local</div>
    </aside>`;
  }

  // ==========================================================================
  // Search
  // ==========================================================================
  function SearchBar({ value, onChange, onSearch, onClear, loading, inputRef }) {
    const det = Svc.detectQuery(value);
    return html`<form className="flex items-center gap-2" onSubmit=${(e) => { e.preventDefault(); onSearch(); }}>
      <div className="relative flex-1 max-w-[620px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 muted"><${Icon} name="search" /></span>
        <input ref=${inputRef} className="input pl-9 pr-24 h-10 text-[14px]" placeholder="Enter Student ID, Phone Number, or Email..."
          value=${value} onChange=${(e) => onChange(e.target.value)} onKeyDown=${(e) => e.key === "Escape" && onClear()} />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          ${det && html`<span className="pill pill-gray">${det.label}</span>`}
          ${value && html`<button type="button" className="muted hover:text-slate-800 p-1" title="Clear (Esc)" onClick=${onClear}><${Icon} name="x" size=${14} /></button>`}
        </div>
      </div>
      <button type="submit" className="btn btn-primary h-10 px-4" disabled=${loading || !value.trim()}>
        <${Icon} name=${loading ? "refresh" : "search"} className=${loading ? "animate-spin" : ""} />Search in SAP
      </button>
      <span className="muted text-[11px] hidden xl:inline"><kbd>Enter</kbd> search · <kbd>/</kbd> focus · <kbd>Esc</kbd> clear</span>
    </form>`;
  }

  function Banner({ tone, icon, title, children, action }) {
    const bg = { red: "var(--red-50)", amber: "var(--amber-50)", blue: "var(--bc-blue-50)" }[tone];
    const fg = { red: "var(--red)", amber: "var(--amber)", blue: "var(--bc-blue)" }[tone];
    return html`<div className="rounded-[10px] px-3 py-2 flex items-center gap-2.5 text-[12.5px]" style=${{ background: bg, color: fg }}>
      <${Icon} name=${icon} /><div className="flex-1"><b className="font-semibold">${title}</b> ${children && html`<span className="opacity-90">${children}</span>`}</div>${action}
    </div>`;
  }

  function ResultsPicker({ results, selectedId, onPick, loading, cache }) {
    if (!results || results.length < 2) return null;
    const names = results.map(r => SAPC.normalizeStudentName(r.fullName || `${r.firstName || ""} ${r.lastName || ""}`));
    const isSameStudent = names.length > 1 && new Set(names).size === 1;

    // Sibling discount only applies if real distinct siblings exist under 18 years
    const hasSiblingDiscount = !isSameStudent && results.some((r) => {
      const ag = KB.calculateDetailedAge(r.dob);
      return ag && ag.years < 18;
    });

    return html`<div className="rounded-[12px] p-3 border shadow-sm space-y-2.5 bg-gradient-to-r from-blue-50/70 via-slate-50 to-indigo-50/50" style=${{ borderColor: "#cbdcf8" }}>
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-5 h-5 rounded-full grid place-items-center bg-blue-600 text-white text-[11px] font-bold">
            ${results.length}
          </span>
          <span className="font-semibold text-[13px] text-slate-800 flex items-center gap-1.5">
            <${Icon} name=${isSameStudent ? "user" : "users"} size=${15} className="text-blue-700" />
            <span>${isSameStudent ? `Same Student Account · ${results.length} Profiles Found` : `Family Account · ${results.length} Students on this Contact`}</span>
          </span>
          <span className=${`pill ${isSameStudent ? "pill-blue" : hasSiblingDiscount ? "pill-green" : "pill-blue"} !text-[11px]`}>
            ${isSameStudent ? "Account with Level Prioritized First" : hasSiblingDiscount ? "10% Sibling Discount Applies" : "Multiple Students"}
          </span>
        </div>
        <span className="muted text-[11.5px] hidden sm:inline">
          ${isSameStudent ? "Click tab to switch between duplicate student accounts" : "Click any child to switch profile & pricing"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(results.length, 3)} gap-2.5">
        ${results.map((r) => {
          const ag = KB.calculateDetailedAge(r.dob);
          const active = r.studentNumber === selectedId;
          const cached = cache && cache[r.studentNumber];
          const cachedHasPrebookedPT = cached && ((cached.profile && cached.profile.hasPrebookedPT) || (cached.bookings || []).some((b) => {
            const desc = `${b.courseCode || ""} ${b.courseDescription || ""} ${b.className || ""}`;
            return /ylcon|adcon|consultation|placement|assessment|\bpt\b/i.test(desc) &&
              /prebook|reserv|pending|wait/i.test(b.status || "") &&
              !/cancel/i.test(b.status || "");
          }));
          const cachedIsEarlyYears = cached && ((cached.profile && cached.profile.isEarlyYears) || Boolean(ag && ag.stageCategory === "YL" && (ag.academicYears <= 5 || ag.years <= 5)));
          const cachedLvl = cached && cached.profile ? cached.profile.level : null;
          const isNoLvl = !cachedIsEarlyYears && !cachedHasPrebookedPT && (cached && cached.profile ? (cached.profile.isNoLevel || (!/no\s*level\s*assigned/i.test(cachedLvl || "") && /no level|راسب|ساقط/i.test(cachedLvl || ""))) : false);

          return html`<button
            key=${r.studentNumber}
            type="button"
            onClick=${() => onPick(r)}
            disabled=${loading && active}
            className=${`text-left p-3 rounded-[10px] border transition-all duration-150 flex items-center justify-between gap-3 ${
              active
                ? "bg-white border-blue-600 shadow-md ring-2 ring-blue-500/20"
                : "bg-white/80 hover:bg-white border-slate-200 hover:border-blue-300 text-slate-600 shadow-xs"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className=${`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${
                  active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                <${Icon} name="user" size=${18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className=${`font-bold text-[14px] truncate ${active ? "text-blue-950" : "text-slate-850"}`}>
                    ${SAPC.formatStudentName(r.fullName || `${r.firstName || ""} ${r.lastName || ""}`) || "Student"}
                  </span>
                  ${active && html`<span className="pill pill-blue !text-[10px] !py-0 !px-1.5 font-bold">Active Tab</span>`}
                  ${cachedHasPrebookedPT ? html`
                    <span className="pill pill-amber !text-[10px] !py-0 !px-1.5 font-bold">
                      Pending PT Payment
                    </span>
                  ` : cachedIsEarlyYears ? html`
                    <span className="pill pill-green !text-[10px] !py-0 !px-1.5 font-bold">
                      ${cachedLvl || (ag && (ag.academicYears >= 5 || ag.years >= 5) ? "Early Years 3 (Owls)" : "Early Years 2 (Ducks)")}
                    </span>
                  ` : cachedLvl && html`
                    <span className=${`pill ${isNoLvl ? "pill-red" : /checking/i.test(cachedLvl) ? "pill-blue" : "pill-green"} !text-[10px] !py-0 !px-1.5 font-bold`}>
                      ${isNoLvl ? "No Level (Failed PT)" : cachedLvl}
                    </span>
                  `}
                </div>
                <div className="flex items-center gap-2 text-[11.5px] muted pt-0.5">
                  <span className="font-mono font-medium">ID ${r.studentNumber}</span>
                  <span>·</span>
                  <span>${ag ? `${ag.years}y (${ag.ageGroup ? ag.ageGroup.name : ag.stageCategory})` : r.dob || "—"}</span>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className=${`text-[11.5px] font-semibold flex items-center gap-1 ${active ? "text-blue-700" : "text-slate-400"}`}>
                ${active ? html`<${Icon} name="check" size=${13} /> Selected` : html`Switch <${Icon} name="chevRight" size=${12} />`}
              </span>
            </div>
          </button>`;
        })}
      </div>
    </div>`;
  }

  // ==========================================================================
  // Student Overview
  // ==========================================================================
  function Fact({ icon, label, children }) {
    return html`<div className="flex items-start gap-2.5 min-w-0">
      <span className="mt-0.5 muted"><${Icon} name=${icon} size=${17} /></span>
      <div className="min-w-0"><div className="label">${label}</div><div className="font-semibold text-[13.5px] truncate">${children}</div></div>
    </div>`;
  }
  const Missing = () => html`<span className="muted font-normal">Not in SAP</span>`;

  // ==========================================================================
  // Reusable Collapsible Section
  // ==========================================================================
  function CollapsibleSection({ id, title, icon, badge, actions, defaultOpen = true, children, className = "" }) {
    const [open, setOpen] = useState(() => {
      if (!id) return defaultOpen;
      try {
        const saved = localStorage.getItem(`sec.${id}`);
        return saved !== null ? saved === "1" : defaultOpen;
      } catch (_) {
        return defaultOpen;
      }
    });
    const toggle = () => {
      setOpen((v) => {
        const next = !v;
        if (id) {
          try { localStorage.setItem(`sec.${id}`, next ? "1" : "0"); } catch (_) {}
        }
        return next;
      });
    };

    return html`<div className=${`card p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2 cursor-pointer select-none" onClick=${toggle}>
        <div className="flex items-center gap-2 font-semibold text-[13px] text-slate-800 flex-wrap">
          ${icon && html`<${Icon} name=${icon} size=${15} className="muted shrink-0" />`}
          <span>${title}</span>
          ${badge}
        </div>
        <div className="flex items-center gap-2" onClick=${(e) => e.stopPropagation()}>
          ${actions}
          <button type="button" className="btn btn-icon !h-6 !w-6" onClick=${toggle} title=${open ? "Collapse section" : "Expand section"}>
            <${Icon} name=${open ? "chevUp" : "chevDown"} size=${14} />
          </button>
        </div>
      </div>
      ${open && html`<div className="mt-2.5 pt-2 border-t" style=${{ borderColor: "var(--line)" }}>${children}</div>`}
    </div>`;
  }

  // Compact academic progression card (used as level popover + in Student Notes)
  function ProgressionCard({ prog, floating, pinned, onClose }) {
    if (!prog) return null;
    if (prog.isAdult && prog.isAdultGeneral) return null;

    if (prog.isAdult && prog.isAdultBeginner) {
      const ready = prog.isUpgradeReadyNow;
      const nextLvl = prog.recommendedBookingLevel || prog.nextLevel;
      const begSteps = ["Beg A", "Beg B", "Beg C", "Beg D"];
      if (prog.hasBegENote) begSteps.push("Beg E");
      begSteps.push("A1");

      return html`<div className=${`rounded-[12px] border p-3.5 text-[12px] ${floating ? "shadow-xl bg-white" : ""}`}
        style=${{ borderColor: ready ? "#86efac" : "#bfdbfe", background: floating ? "#fff" : ready ? "#f0fdf4" : "#f5f9ff" }}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className=${`pill font-bold !text-[11.5px] ${ready ? "pill-green" : "pill-blue"}`}>
              ${ready ? `\u2728 UPGRADE READY \u2192 ${nextLvl}` : `Beginner English \u00B7 ${prog.currentLevel}`}
            </span>
            ${pinned && html`<span className="pill pill-gray !text-[10px]">Pinned</span>`}
          </div>
          ${floating && onClose && html`<button type="button" className="btn btn-icon !h-6 !w-6" onClick=${onClose} title="Close"><${Icon} name="x" size=${13} /></button>`}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
          <span className="muted text-[11px]">Beginner Roadmap:</span>
          ${begSteps.map((step) => {
            const isPassed = prog.passedBookings && prog.passedBookings.some((b) => b.level === step && b.isPassed);
            const isCurrent = prog.currentLevel === step;
            const isNext = ready && nextLvl.includes(step);
            return html`<span key=${step} className=${`px-2 py-0.5 rounded-[6px] text-[11px] font-semibold border ${
              isPassed ? "bg-green-600 text-white border-green-700"
              : isNext ? "bg-amber-100 text-amber-900 border-amber-300 font-bold"
              : isCurrent ? "bg-blue-100 text-blue-900 border-blue-300"
              : "bg-white text-slate-400 border-dashed border-slate-300"
            }`}>
              ${step}${isPassed ? " \u2713" : isNext ? " (Next)" : ""}
            </span>`;
          })}
        </div>

        <div className="rounded-[8px] p-2.5 bg-slate-50 border flex items-center justify-between gap-2 mb-2" style=${{ borderColor: ready ? "#bbf7d0" : "#dbeafe" }}>
          <div className="flex items-center gap-2">
            <${Icon} name="check" size=${15} className=${ready ? "text-green-700" : "text-blue-700"} />
            <span className="text-[12px] text-slate-700">Next to book:</span>
            <b className="text-[13px]" style=${{ color: "var(--bc-navy)" }}>${nextLvl}</b>
          </div>
          <span className=${`pill ${ready ? "pill-green" : "pill-blue"} !text-[10.5px] font-bold`}>
            ${ready ? "Completed with Success" : "Current Level"}
          </span>
        </div>

        ${prog.advisorNoteAr && html`
          <div className="text-[11.5px] font-medium text-slate-800 leading-relaxed bg-amber-50/50 p-2 rounded-[6px] border border-amber-200/60" dir="rtl">
            ${prog.advisorNoteAr}
          </div>
        `}
        ${prog.advisorNoteEn && html`
          <div className="text-[11.5px] text-slate-600 leading-relaxed mt-1.5 select-text">
            <b>Advisor note:</b> ${prog.advisorNoteEn}
          </div>
        `}
      </div>`;
    }

    const ready = prog.isUpgradeReadyNow;
    const nextLvl = prog.recommendedBookingLevel || prog.recommendedLevelToBook;
    const chip = (label, state) => html`<span key=${label} className=${`px-2 py-0.5 rounded-[6px] text-[11px] font-semibold border ${
      state === "done" ? "bg-green-600 text-white border-green-700"
      : state === "summer" ? "bg-teal-600 text-white border-teal-700"
      : state === "pre" ? "bg-amber-100 text-amber-900 border-amber-300"
      : "bg-white text-slate-400 border-dashed border-slate-300"}`}
      title=${state === "done" ? "Completed / confirmed" : state === "pre" ? "Prebooked" : state === "summer" ? "Summer term" : "Not taken yet"}>
      ${label}${state === "done" || state === "summer" ? " \u2713" : state === "pre" ? " (Pre)" : ""}
    </span>`;

    return html`<div className=${`rounded-[12px] border p-3.5 text-[12px] ${floating ? "shadow-xl bg-white" : ""}`}
      style=${{ borderColor: ready ? "#86efac" : "#bfdbfe", background: floating ? "#fff" : ready ? "#f0fdf4" : "#f5f9ff" }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className=${`pill font-bold !text-[11.5px] ${ready ? "pill-green" : prog.isUpgradeReadyAfterPrebooked ? "pill-amber" : "pill-blue"}`}>
            ${ready ? `\u2728 UPGRADE READY \u2192 ${prog.nextLevel}` : `${prog.targetLevel} \u00B7 ${prog.totalEffectiveProjected}/4 Terms`}
          </span>
          ${pinned && html`<span className="pill pill-gray !text-[10px]">Pinned</span>`}
        </div>
        ${floating && onClose && html`<button type="button" className="btn btn-icon !h-6 !w-6" onClick=${onClose} title="Close"><${Icon} name="x" size=${13} /></button>`}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
        <span className="muted text-[11px]">Terms in ${prog.targetLevel}:</span>
        ${["T1", "T2", "T3", "T4"].map((t) => chip(t, prog.winterBooked.includes(t) ? "done" : prog.winterProjected.includes(t) ? "pre" : "none"))}
        ${(prog.summerProjected || []).map((st) => chip(st, prog.summerBooked.includes(st) ? "summer" : "pre"))}
      </div>

      <div className="rounded-[8px] p-2.5 bg-slate-50 border flex items-center justify-between gap-2 mb-2" style=${{ borderColor: ready ? "#bbf7d0" : "#dbeafe" }}>
        <div className="flex items-center gap-2">
          <${Icon} name="calendar" size=${15} className=${ready ? "text-green-700" : "text-blue-700"} />
          <span className="text-[12px] text-slate-700">Next to book:</span>
          <b className="text-[13px]" style=${{ color: "var(--bc-navy)" }}>
            ${nextLvl || "\u2014"}${prog.recommendedTermToBook ? ` (${prog.recommendedTermToBook})` : ""}
          </b>
        </div>
        <span className="pill pill-green !text-[10.5px] font-bold">Recommended</span>
      </div>

      ${prog.advisorNoteAr && html`
        <div className="text-[11.5px] font-medium text-slate-800 leading-relaxed bg-amber-50/50 p-2 rounded-[6px] border border-amber-200/60" dir="rtl">
          ${prog.advisorNoteAr}
        </div>
      `}
      ${prog.advisorNoteEn && html`
        <div className="text-[11.5px] text-slate-600 leading-relaxed mt-1.5 select-text">
          <b>Advisor note:</b> ${prog.advisorNoteEn}
        </div>
      `}
    </div>`;
  }

  function StudentOverview({ profile, m, source, fetchedAt, bookingOpen, onToggleBooking, onOpenPricing }) {
    const discount = m.reReg.eligible && m.reReg.appliesTo
      ? { tone: "green", text: "10% Re-registration" }
      : m.sibling.eligible ? { tone: "green", text: "10% Sibling" }
      : { tone: "blue", text: "Bundle (2+ terms)" };
    const phoneStr = [profile.phonePrefix, profile.phone].filter(Boolean).join(" ") || profile.phone || "";
    const emailStr = profile.email || "";
    const [collapsed, setCollapsed] = useState(() => {
      try { return localStorage.getItem("ov.collapsed") === "1"; } catch (_) { return false; }
    });
    const [progPinned, setProgPinned] = useState(false);
    const [progHover, setProgHover] = useState(false);
    const [copyStep, setCopyStep] = useState(null);

    useEffect(() => {
      try { localStorage.setItem("ov.collapsed", collapsed ? "1" : "0"); } catch (_) {}
    }, [collapsed]);
    useEffect(() => { setProgPinned(false); setProgHover(false); }, [profile.studentId]);

    const prog = m.progression && (
      (m.progression.isAdult && m.progression.isAdultBeginner) ||
      (!m.isAdult && (m.progression.bookedTermsList.length > 0 || m.progression.prebookedTermsList.length > 0 || m.progression.overriddenByNewerRecord))
    ) ? m.progression : (m.progression && m.progression.ageTransition ? m.progression : null);
    const showProg = prog && (progPinned || progHover) && (!m.isAdult || prog.isAdultBeginner);

    // Sequential copy: ID → Email → Phone → Name
    // Each written to clipboard with 650ms delay so Windows Clipboard History (Win+V) records all 4 items distinctly!
    const copySequence = async () => {
      const rawName = SAPC.formatStudentName(profile.fullName) || profile.fullName || "";
      const rawId = String(profile.studentId || "").trim();
      const rawEmail = String(profile.email || "").trim();
      const rawPhone = String(profile.phone || phoneStr).trim();

      const items = [
        { label: "ID", text: rawId },
        { label: "Email", text: rawEmail },
        { label: "Phone", text: rawPhone },
        { label: "Name", text: rawName },
      ].filter((x) => x.text);

      if (!items.length) return;

      const writeClip = async (txt) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(txt);
        } else {
          const ta = document.createElement("textarea");
          ta.value = txt;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
      };

      for (let i = 0; i < items.length; i++) {
        try {
          await writeClip(items[i].text);
        } catch (_) {}
        setCopyStep(`${items[i].label} (${i + 1}/${items.length})`);
        if (i < items.length - 1) {
          await new Promise((r) => setTimeout(r, 650));
        }
      }
      setCopyStep("Done \u2713 (Win+V)");
      setTimeout(() => setCopyStep(null), 2500);
    };

    const copySingle = async (label, val) => {
      if (!val) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(String(val).trim());
        }
        setCopyStep(`Copied ${label} \u2713`);
        setTimeout(() => setCopyStep(null), 1500);
      } catch (_) {}
    };

    return html`<section className="card px-4 py-3 relative">
      ${collapsed ? html`
        <div className="flex items-center justify-between gap-3 min-h-[38px]">
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
            <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style=${{ background: "var(--bc-blue-50)", color: "var(--bc-blue)" }}>
              <${Icon} name="user" size=${17} />
            </div>
            <div className="font-semibold text-[14.5px] truncate" style=${{ color: "var(--bc-navy)" }}>
              ${SAPC.formatStudentName(profile.fullName) || "\u2014"}
            </div>
            <span title=${m.status.reason}><${Pill} tone=${m.status.tone}>${m.status.label}</${Pill}></span>
            <button type="button" className="pill pill-gray !text-[11px] font-mono cursor-pointer hover:bg-slate-200 transition-colors"
              onClick=${() => copySingle("ID", profile.studentId)} title="Click to copy ID">
              ID ${profile.studentId}
            </button>
            ${m.balance && (m.balance.isCredit || m.balance.isDebt) && html`
              <span className=${`pill ${m.balance.isCredit ? "pill-blue" : "pill-red"} !text-[11px] font-medium`}>
                ${m.balance.isCredit ? `Credit: ${m.balance.formatted}` : `Debt: +${m.balance.formatted}`}
              </span>
            `}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button type="button" className=${`btn ${copyStep ? "btn-success" : ""} !h-7 !px-2.5 text-[11.5px] flex items-center gap-1.5 font-medium`}
              onClick=${copySequence} disabled=${!!copyStep}
              title="Copy ID, Email, Phone, Name sequentially into clipboard history (Win+V)">
              <${Icon} name=${copyStep && copyStep.includes("Done") ? "check" : "copy"} size=${13} />
              <span>${copyStep || "Copy info (ID, Email, Phone, Name)"}</span>
            </button>
            <button type="button" className="btn btn-icon !h-7 !w-7" onClick=${() => setCollapsed(false)} title="Expand full student details">
              <${Icon} name="chevDown" size=${15} />
            </button>
          </div>
        </div>
      ` : html`
        <div>
          <div className="flex items-center justify-between gap-4 pb-2 border-b" style=${{ borderColor: "var(--line)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-[10px] grid place-items-center shrink-0" style=${{ background: "var(--bc-blue-50)", color: "var(--bc-blue)" }}>
                <${Icon} name="user" size=${20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-[16px] truncate" style=${{ color: "var(--bc-navy)" }}>${SAPC.formatStudentName(profile.fullName) || "\u2014"}</div>
                  <span title=${m.status.reason}><${Pill} tone=${m.status.tone}>${m.status.label}</${Pill}></span>
                  <button type="button" className="pill pill-gray !text-[11px] font-mono cursor-pointer hover:bg-slate-200 transition-colors"
                    onClick=${() => copySingle("ID", profile.studentId)} title="Click to copy ID">
                    ID ${profile.studentId}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button type="button" className=${`btn ${copyStep ? "btn-success" : ""} !h-7 !px-2.5 text-[11.5px] flex items-center gap-1.5 font-semibold`}
                onClick=${copySequence} disabled=${!!copyStep}
                title="Copy ID, Email, Phone, Name sequentially into clipboard history (Win+V)">
                <${Icon} name=${copyStep && copyStep.includes("Done") ? "check" : "copy"} size=${13} />
                <span>${copyStep || "Copy info (ID, Email, Phone, Name)"}</span>
              </button>
              <button type="button" className="btn btn-icon !h-7 !w-7" onClick=${() => setCollapsed(true)} title="Collapse details">
                <${Icon} name="chevUp" size=${15} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1.4fr_1.4fr_1fr] gap-4 py-3 border-b" style=${{ borderColor: "var(--line)" }}>
            <${Fact} icon="calendar" label="Date of Birth">${profile.dob ? fmtDate(profile.dob) : html`<${Missing} />`}</${Fact}>
            <${Fact} icon="users" label=${m.isAdult ? "Age" : `Academic Age (1 Sep ${m.age ? m.age.cutoffYear : ""})`}>
              ${m.age ? html`<span>${m.isAdult ? m.age.years : m.age.academicYears} years <span className="pill pill-blue ml-1">${m.isAdult ? "Adult 18+" : m.age.ageGroup ? m.age.ageGroup.name : "Under 4"}</span></span>` : html`<${Missing} />`}
            </${Fact}>

            <div className="relative">
              <${Fact} icon="cap" label="Current Level">
                ${m.isEarlyYears ? html`
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <b className="text-emerald-950 font-bold">${m.level}</b>
                      <span className="pill pill-green font-bold !text-[10px] !py-0.5">Direct Placement (No PT)</span>
                    </div>
                    <div className="text-[11.5px] text-emerald-800 font-medium mt-0.5">
                      التحاق مباشر للأطفال حسب السن — بدون امتحان تحديد مستوى
                    </div>
                  </div>
                ` : m.hasPrebookedPT ? html`
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-amber-950">Pending PT Payment</span>
                      <span className="pill pill-amber font-bold !text-[10px] !py-0.5">Unpaid (200 EGP)</span>
                    </div>
                    <div className="text-[11.5px] text-amber-800 font-medium mt-0.5">
                      عاوزة تتدفع (200 EGP) — الليفل هيتحدد بعد الدفع واجتياز الاختبار
                    </div>
                  </div>
                ` : html`
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <b>${m.level || html`<${Missing} />`}</b>
                    ${prog && !m.isAdult && html`
                      <button
                        type="button"
                        className=${`pill ${prog.isUpgradeReadyNow ? "pill-green" : prog.isUpgradeReadyAfterPrebooked ? "pill-amber" : "pill-blue"} cursor-pointer hover:shadow-sm transition-all flex items-center gap-1 !py-0.5 !px-2 font-bold`}
                        onClick=${() => setProgPinned((v) => !v)}
                        onMouseEnter=${() => setProgHover(true)}
                        onMouseLeave=${() => setProgHover(false)}
                        title="Click to pin or hover to preview progression details"
                      >
                        <span>${prog.isUpgradeReadyNow
                          ? `\u2191 Book Next: ${prog.recommendedBookingLevel || prog.nextLevel}`
                          : prog.isUpgradeReadyAfterPrebooked
                          ? `${prog.totalEffectiveProjected}/4 Terms (\u2192 ${prog.nextLevel})`
                          : `${prog.totalEffectiveProjected}/4 Terms`}</span>
                        <${Icon} name="chevDown" size=${11} />
                      </button>
                    `}
                    ${prog && m.isAdult && prog.isAdultBeginner && prog.isUpgradeReadyNow && html`
                      <button
                        type="button"
                        className="pill pill-green cursor-pointer hover:shadow-sm transition-all flex items-center gap-1 !py-0.5 !px-2 font-bold"
                        onClick=${() => setProgPinned((v) => !v)}
                        onMouseEnter=${() => setProgHover(true)}
                        onMouseLeave=${() => setProgHover(false)}
                        title="Completed with Success \u2014 Click to view Beginner progression details"
                      >
                        <span>\u2191 Book Next: ${prog.recommendedBookingLevel || prog.nextLevel}</span>
                        <${Icon} name="chevDown" size=${11} />
                      </button>
                    `}
                    ${prog && m.isAdult && prog.isAdultBeginner && !prog.isUpgradeReadyNow && prog.activeBooking && html`
                      <span className="pill pill-blue font-bold !text-[10px] !py-0.5">
                        Enrolled: ${prog.activeBooking.level || prog.currentLevel}
                      </span>
                    `}
                    ${prog && prog.overriddenByNewerRecord && html`
                      <span className="pill pill-amber font-bold !text-[10px] !py-0.5" title=${`Updated by newer ${prog.overriddenByNewerRecord.source} on ${prog.overriddenByNewerRecord.dateStr}`}>
                        Latest ${prog.overriddenByNewerRecord.source} (${prog.overriddenByNewerRecord.dateStr})
                      </span>
                    `}
                    ${prog && prog.ageTransition && html`
                      <span className="pill pill-amber font-bold !text-[10px] !py-0.5 flex items-center gap-1" title=${prog.ageTransition.transitionReasonEn}>
                        <span>🎂 Age Shift: ${prog.ageTransition.targetStageName}</span>
                      </span>
                    `}
                    ${!prog && profile.latestRecLevel && html`<span className="pill pill-green !text-[10px] !py-0">from Rec. Level</span>`}
                  </div>
                `}
              </${Fact}>

              ${showProg && html`
                <div
                  className="absolute left-0 top-full mt-1.5 z-40 w-[420px] max-w-[95vw]"
                  onMouseEnter=${() => setProgHover(true)}
                  onMouseLeave=${() => setProgHover(false)}
                >
                  <${ProgressionCard}
                    prog=${prog}
                    floating=${true}
                    pinned=${progPinned}
                    onClose=${() => { setProgPinned(false); setProgHover(false); }}
                  />
                </div>
              `}
            </div>

            <${Fact} icon="pin" label="Teaching Centre">${m.centre || html`<${Missing} />`}</${Fact}>
          </div>

          <div className="flex items-center gap-6 py-2 text-[12px] text-slate-700 flex-wrap">
            ${phoneStr && html`
              <button type="button" className="flex items-center gap-1.5 font-mono hover:text-blue-700 cursor-pointer text-left"
                onClick=${() => copySingle("Phone", profile.phone || phoneStr)} title="Click to copy phone">
                <${Icon} name="phone" size=${12} className="muted" />
                <span>${phoneStr}</span>
                <${Icon} name="copy" size=${11} className="muted opacity-60" />
              </button>
            `}
            ${emailStr && html`
              <button type="button" className="flex items-center gap-1.5 truncate max-w-[240px] hover:text-blue-700 cursor-pointer text-left"
                onClick=${() => copySingle("Email", emailStr)} title=${`Click to copy email: ${emailStr}`}>
                <${Icon} name="mail" size=${12} className="muted shrink-0" />
                <span className="truncate">${emailStr}</span>
                <${Icon} name="copy" size=${11} className="muted opacity-60 shrink-0" />
              </button>
            `}
          </div>

          ${m.isEarlyYears ? null : m.hasPrebookedPT ? html`
            <div className="mt-2 p-2.5 rounded-[8px] flex items-center justify-between text-[12px] border bg-amber-50/90 border-amber-300 text-amber-950">
              <div className="flex items-center gap-2">
                <${Icon} name="alert" size=${16} className="text-amber-600 shrink-0" />
                <span>
                  <b>Placement Test Prebooked (${(m.prebookedPT && (m.prebookedPT.courseDescription || m.prebookedPT.className)) || "Online/Phone Consultation"}):</b>
                  {" "}امتحان تحديد المستوى محجوز وبانتظار الدفع (200 EGP) — المستوى هيتحدد بعد الدفع واجتياز الاختبار.
                </span>
              </div>
              <span className="pill pill-amber shrink-0 font-bold">Unpaid · Awaiting Payment (200 EGP)</span>
            </div>
          ` : m.isNoLevel ? html`
            <div className="mt-2 p-2.5 rounded-[8px] flex items-center justify-between text-[12px] border" style=${{ background: "var(--red-50)", borderColor: "#fecaca", color: "#991b1b" }}>
              <div className="flex items-center gap-2">
                <${Icon} name="alert" size=${16} className="text-red-600 shrink-0" />
                <span><b>Placement result: No Level (did not pass):</b> recorded in SAP notes. Direct booking is blocked; student must rebook the placement test (200 EGP).</span>
              </div>
              <span className="pill pill-red shrink-0">Retest required</span>
            </div>
          ` : null}
          ${m.balance && m.balance.isCredit && html`
            <div className="mt-2 p-2.5 rounded-[8px] flex items-center justify-between text-[12px] border" style=${{ background: "var(--bc-blue-50)", borderColor: "#93c5fd", color: "#1e40af" }}>
              <div className="flex items-center gap-2">
                <${Icon} name="check" size=${16} className="text-blue-600 shrink-0" />
                <span><b>Student credit balance (${m.balance.formatted}):</b> remaining credit in SAP (FPL9) can be applied to bookings or refunded.</span>
              </div>
              <span className="pill pill-blue shrink-0 font-bold">Credit: ${m.balance.formatted}</span>
            </div>
          `}
          ${m.balance && m.balance.isDebt && html`
            <div className="mt-2 p-2.5 rounded-[8px] flex items-center justify-between text-[12px] border" style=${{ background: "var(--red-50)", borderColor: "#fecaca", color: "#991b1b" }}>
              <div className="flex items-center gap-2">
                <${Icon} name="alert" size=${16} className="text-red-600 shrink-0" />
                <span><b>Outstanding balance owed (${m.balance.formatted}):</b> unpaid balance in SAP (FPL9) is added automatically to the total.</span>
              </div>
              <span className="pill pill-red shrink-0 font-bold">Debt: +${m.balance.formatted}</span>
            </div>
          `}

          <div className="mt-2.5 pt-2 border-t flex items-center gap-5 text-[12px] flex-wrap" style=${{ borderColor: "var(--line)" }}>
            <div className="flex items-center gap-1.5" title=${m.pt.detail}>
              <${Icon} name="clipboard" className="muted" size=${14} /><span className="muted">PT:</span><${Pill} tone=${m.pt.tone}>${m.pt.label}</${Pill}>
            </div>
            <div className="flex items-center gap-1.5" title=${`Re-reg: ${m.reReg.reason}. Sibling: ${m.sibling.reason}`}>
              <${Icon} name="tag" className="muted" size=${14} /><span className="muted">Discount:</span><${Pill} tone=${discount.tone}>${discount.text}</${Pill}>
            </div>
            <div className="flex items-center gap-1.5" title="SAP Account Balance (FPL9)">
              <${Icon} name="card" className="muted" size=${14} /><span className="muted">Balance:</span>
              <${Pill} tone=${m.balance.isCredit ? "blue" : m.balance.isDebt ? "red" : "green"}>
                ${m.balance.isCredit ? `${m.balance.formatted} (Credit)` : m.balance.isDebt ? `+${m.balance.formatted} (Debt)` : "0 EGP (Settled)"}
              </${Pill}>
            </div>
            ${!m.isAdult && html`
              <div className="flex items-center gap-1.5">
                <${Icon} name="swap" className="muted" size=${14} /><span className="muted">Summer:</span>
                ${m.summer ? html`<${Pill} tone="blue">${m.summer}</${Pill}>` : html`<span className="muted">Confirm with senior teacher</span>`}
              </div>
            `}
            ${typeof onOpenPricing === "function" && html`
              <button
                type="button"
                onClick=${onOpenPricing}
                className="btn !h-7 !px-2.5 text-[11.5px] font-semibold flex items-center gap-1 text-blue-700 hover:bg-blue-50"
                title="Open pricing and installment plans in the left tab"
              >
                <${Icon} name="tag" size=${12} />
                <span>View Pricing & Installments</span>
              </button>
            `}
            <div className="ml-auto flex items-center gap-2">
              <span className="muted text-[11px] flex items-center gap-1">
                <${Icon} name="database" size=${12} />${source === "live" ? `Live SAP \u00B7 ${timeAgo(fetchedAt)}` : "SAP data"}
              </span>
              ${typeof onToggleBooking === "function" && html`
                <button
                  type="button"
                  onClick=${onToggleBooking}
                  className="btn btn-primary !h-8 !px-3 text-[12px] font-semibold flex items-center gap-1.5"
                  title="Open course schedules & registration"
                >
                  <${Icon} name="calendar" size=${14} />
                  <span>Schedules & Registration</span>
                </button>
              `}
            </div>
          </div>
        </div>
      `}
    </section>`;
  }

  function OverviewSkeleton() {
    return html`<section className="card px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="skel w-11 h-11"></div>
        <div className="space-y-2"><div className="skel w-44 h-4"></div><div className="skel w-28 h-3"></div></div>
        <div className="flex-1 grid grid-cols-4 gap-4 pl-4">${[1, 2, 3, 4].map((i) => html`<div key=${i} className="space-y-2"><div className="skel w-16 h-3"></div><div className="skel w-24 h-4"></div></div>`)}</div>
      </div>
      <div className="mt-3 pt-3 border-t flex gap-6" style=${{ borderColor: "var(--line)" }}>${[1, 2, 3].map((i) => html`<div key=${i} className="skel w-48 h-5"></div>`)}</div>
    </section>`;
  }

  // ==========================================================================
  // Pricing & Enrollment
  // ==========================================================================
  function Toggle({ checked, onChange, label, hint, disabled, eligible }) {
    return html`<label className=${`flex items-center gap-2 text-[12px] ${disabled ? "opacity-50" : "cursor-pointer"}`} title=${hint || ""}>
      <input type="checkbox" className="accent-[#0b4fd1]" checked=${checked} disabled=${disabled} onChange=${(e) => onChange(e.target.checked)} />
      <span>${label}</span>
      ${eligible !== undefined && html`<span className=${`pill ${eligible ? "pill-green" : "pill-gray"} !text-[10.5px] !py-0`}>${eligible ? "Eligible" : "Not eligible"}</span>`}
    </label>`;
  }

  function PricingPanel({ p, m, compact }) {
    const q = p.q;
    if (!q) return html`<div className="card p-6 text-center muted">Enter a valid date of birth to calculate pricing.</div>`;
    const rows = breakdown(q, { terms: p.terms });
    const course = KB.ADULT_COURSES.find((c) => c.id === p.adultCourseId) || KB.ADULT_COURSES[1];
    const rate = (k) => KB.PRICING[k] * 100;
    const planTotal = p.plan === "12" ? q.total12M : q.total6M;
    const planMonthly = p.plan === "12" ? q.monthly12M : q.monthly6M;
    const planInterest = p.plan === "12" ? q.admin12M : q.admin6M;

    return html`<div className="space-y-2.5">
      ${m && m.hasPrebookedPT ? html`
        <div className="rounded-[10px] p-2.5 flex items-center justify-between text-[12px] border bg-amber-50 border-amber-300 text-amber-950">
          <div className="flex items-center gap-2">
            <${Icon} name="alert" size=${16} className="text-amber-600 shrink-0" />
            <span><b>Placement Test Pending Payment (200 EGP):</b> the student has prebooked a placement test. Payment must be completed, and the English level will be determined after taking the test. Prices below are indicative.</span>
          </div>
          <span className="pill pill-amber shrink-0 font-bold">Unpaid PT (200 EGP)</span>
        </div>
      ` : m && !m.isEarlyYears && !m.hasPrebookedPT && m.isNoLevel ? html`
        <div className="rounded-[10px] p-2.5 flex items-center justify-between text-[12px] border" style=${{ background: "var(--amber-50)", borderColor: "#fed7aa", color: "#9a3412" }}>
          <div className="flex items-center gap-2">
            <${Icon} name="alert" size=${16} className="text-amber-600 shrink-0" />
            <span><b>Enrolment notice:</b> the student is recorded as No Level (did not pass) and must retake the placement test (200 EGP) before the course booking can be confirmed. Prices below are indicative for the next stage.</span>
          </div>
          <span className="pill pill-amber shrink-0">Retest first</span>
        </div>
      ` : null}
      <div className="card p-3.5 grid grid-cols-[1.35fr_1fr] gap-4">
      <div className="min-w-0">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold flex items-center gap-2"><${Icon} name="coins" className="muted" />${q.courseTitle}</div>
          <span className="muted text-[11.5px]">${q.packageSubtitle}</span>
        </div>

        ${p.isAdult
          ? html`<div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">${KB.ADULT_COURSES.map((c) => html`<button key=${c.id} className=${`seg ${p.adultCourseId === c.id ? "active" : ""}`}
                onClick=${() => { p.setAdultCourseId(c.id); if (!c.packages.some((x) => x.credits === p.credits)) p.setCredits(c.packages[c.packages.length - 1].credits); }}>${c.code}</button>`)}</div>
              <div className="grid grid-cols-4 gap-1.5">${course.packages.map((pk) => html`<button key=${pk.id} className=${`seg ${p.credits === pk.credits ? "active" : ""}`} onClick=${() => p.setCredits(pk.credits)}>
                <div>${pk.credits} Credits</div><div className="muted text-[10.5px] num">${egp(pk.price)}</div></button>`)}</div>
            </div>`
          : html`<div className="grid grid-cols-4 gap-1.5">${[1, 2, 3, 4].map((t) => {
              const r = KB.PRICING.bundleDiscounts[t] || 0;
              return html`<button key=${t} className=${`seg ${p.terms === t ? "active" : ""}`} onClick=${() => p.setTerms(t)}>
                <div>${t === 4 ? "Full Year" : `${t} Term${t > 1 ? "s" : ""}`}</div>
                <div className=${`text-[10.5px] ${r ? "text-green-700 font-semibold" : "muted"}`}>${r ? `−${r * 100}%` : "No bundle"}</div></button>`;
            })}</div>`}

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
          <${Toggle} label=${`Placement test (+${egp(KB.PRICING.placementTestFee)})`} checked=${p.includePT} onChange=${p.setIncludePT}
            hint=${m ? m.pt.detail : ""} />
          ${p.isAdult
            ? html`<${Toggle} label="Re-registration 10%" checked=${p.reReg} onChange=${p.setReReg} eligible=${m ? m.reReg.eligible : undefined} hint=${m ? m.reReg.reason : ""} />`
            : html`<${Toggle} label="Sibling 10%" checked=${p.sibling} onChange=${p.setSibling} eligible=${m ? m.sibling.eligible : undefined} hint=${m ? m.sibling.reason : ""} />`}
        </div>

        <div className="mt-2.5 rounded-[10px] p-3 grid grid-cols-[1fr_auto] gap-x-4 text-[12.5px]" style=${{ background: "var(--surface)" }}>
          <div className="space-y-1">
            <div className="flex justify-between"><span className="muted">Base price</span><span className="num">${egp(q.baseTuition + (q.varioDeduction || 0))}</span></div>
            ${rows.length ? rows.map((r) => html`<div key=${r.label} className="flex justify-between text-green-700"><span>${r.label}</span><span className="num">−${egp(r.amount)}</span></div>`)
              : html`<div className="flex justify-between muted"><span>Discounts</span><span>None applied</span></div>`}
            ${q.ptFee > 0 && html`<div className="flex justify-between"><span className="muted">Placement test</span><span className="num">+${egp(q.ptFee)}</span></div>`}
            ${q.debtAmount > 0 && html`<div className="flex justify-between text-red-700 font-semibold"><span>Previous balance (debt)</span><span className="num">+${egp(q.debtAmount)}</span></div>`}
            ${q.creditAmount > 0 && html`<div className="flex justify-between text-blue-700 font-semibold"><span>Available credit</span><span className="num">−${egp(q.creditAmount)}</span></div>`}
          </div>
          <div className="pl-4 border-l flex flex-col justify-center text-right" style=${{ borderColor: "var(--line)" }}>
            <div className="label">Final net total</div>
            <div className="text-[22px] font-bold num leading-tight" style=${{ color: "var(--bc-navy)" }}>${egp(q.totalCash)}</div>
            ${q.debtAmount > 0 && html`<div className="text-red-700 font-semibold text-[11px] num">Includes +${egp(q.debtAmount)} debt</div>`}
            ${q.creditAmount > 0 && html`<div className="text-blue-700 font-semibold text-[11px] num">Includes −${egp(q.creditAmount)} credit</div>`}
            ${q.discountAmount > 0 && html`<div className="text-green-700 font-semibold text-[12px] num">You save ${egp(q.discountAmount)}</div>`}
          </div>
        </div>
      </div>

      <div className="min-w-0 border-l pl-4 flex flex-col" style=${{ borderColor: "var(--line)" }}>
        <div className="font-semibold flex items-center gap-2 mb-2"><${Icon} name="card" className="muted" />Installments (Credit Card)</div>
        ${q.installmentEligible
          ? html`<div className="space-y-1.5">
              ${[["6", rate("installment6MRate"), q.monthly6M, q.total6M], ["12", rate("installment12MRate"), q.monthly12M, q.total12M]].map(([k, r, mo, tot]) => html`
                <label key=${k} className=${`seg flex items-center gap-2.5 !px-3 !py-2 text-left ${p.plan === k ? "active" : ""}`}>
                  <input type="radio" name="plan" className="accent-[#0b4fd1]" checked=${p.plan === k} onChange=${() => p.setPlan(k)} />
                  <div className="flex-1"><div className="text-[12px]"><b>${k} Months</b> <span className="muted">(${r}% interest)</span></div>
                    <div className="font-semibold num" style=${{ color: "var(--bc-blue)" }}>${egp(mo)} / month</div></div>
                  <div className="text-right"><div className="label">Total</div><div className="num font-semibold">${egp(tot)}</div></div>
                </label>`)}
              <div className="text-[11.5px] muted flex justify-between px-1"><span>Interest on ${p.plan}M</span><span className="num">${egp(planInterest)}</span></div>
              ${BANKS.length
                ? html`<select className="input !h-8 text-[12px]" value=${p.bank} onChange=${(e) => p.setBank(e.target.value)}>
                    <option value="">Select bank…</option>${BANKS.map((b) => html`<option key=${b}>${b}</option>`)}</select>`
                : html`<div className="text-[11px] muted flex items-center gap-1"><${Icon} name="info" size=${12} />Supported bank list is not configured.</div>`}
            </div>`
          : html`<div className="rounded-[10px] p-3 text-[12px]" style=${{ background: "var(--amber-50)", color: "var(--amber)" }}>
              <div className="font-semibold mb-0.5">Not eligible for installments</div>${q.installmentReason}</div>`}
        ${!compact && q.installmentEligible && html`<div className="mt-auto pt-2 text-[11px] muted">Selected: ${egp(planMonthly)} × ${p.plan} = ${egp(planTotal)}</div>`}
      </div>
    </div>
  </div>`;
  }

  // Booking history
  // ==========================================================================
  function BookingHistory({ bookings, error, progression, onRebook, maxHeight = 400 }) {
    const counts = {
      all: bookings.length,
      courses: bookings.filter((b) => !isConsultation(b)).length,
      pt: bookings.filter(isConsultation).length
    };
    const defaultFilter = counts.courses > 0 ? "courses" : counts.pt > 0 ? "all" : "courses";
    const [filter, setFilter] = useState(defaultFilter);
    const [sort, setSort] = useState({ key: "bookingDate", dir: -1 });

    useEffect(() => {
      if (counts.courses === 0 && counts.pt > 0 && filter === "courses") {
        setFilter("all");
      }
    }, [bookings.length]);

    const hasAnyPrebooked = (bookings || []).some(
      (b) => !isConsultation(b) && SAPC.isPrebookedBooking && SAPC.isPrebookedBooking(b)
    );
    const rows = useMemo(() => {
      const list = bookings
        .filter((b) => (filter === "all" ? true : filter === "courses" ? !isConsultation(b) : isConsultation(b)))
        .map((b) => ({ ...b, ...bookingDates(b) }));
      const val = (r) => (/date|start|end/i.test(sort.key) ? (KB.parseFlexibleDate(r[sort.key]) || 0) : String(r[sort.key] || ""));
      return list.sort((a, b) => {
        if (a.isNewlyBooked && !b.isNewlyBooked) return -1;
        if (!a.isNewlyBooked && b.isNewlyBooked) return 1;
        return (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir;
      });
    }, [bookings, filter, sort]);
    const th = (key, label) => html`<th onClick=${() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}>
      <span className="inline-flex items-center gap-1">${label}<${Icon} name="sort" size=${11} className=${sort.key === key ? "text-blue-700" : "opacity-40"} /></span></th>`;

    return html`<div className="space-y-3">
      ${progression && progression.yearSummaries && progression.yearSummaries.length > 0 && html`
        <${CollapsibleSection}
          id="progression-summary"
          title=${`Academic Year & Term Progression (${progression.targetLevel})`}
          icon="cap"
          badge=${html`<span className="pill pill-blue !text-[11px]">Academic Year: 1 Sep → End of Summer</span>`}
          defaultOpen=${true}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
            ${progression.yearSummaries.map((ys) => html`
              <div key=${ys.academicYear} className="p-2.5 rounded-[8px] border bg-slate-50/70 flex flex-col gap-1.5" style=${{ borderColor: "var(--line)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Academic Year ${ys.academicYear}</span>
                  <span className="pill pill-gray !text-[10.5px]">${ys.bookedCount} Confirmed Term${ys.bookedCount === 1 ? "" : "s"}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap text-[11.5px]">
                  <span className="muted">Winter:</span>
                  ${ys.winterTerms.length ? ys.winterTerms.map((t) => html`<span key=${t} className="pill pill-blue !text-[10.5px]">${t}</span>`) : html`<span className="muted">None</span>`}
                  <span className="muted ml-2">Summer:</span>
                  ${ys.summerTerms.length ? ys.summerTerms.map((t) => html`<span key=${t} className="pill pill-green !text-[10.5px]">${t}</span>`) : html`<span className="muted">None</span>`}
                </div>
                ${ys.note && html`<div className="text-[11px] text-amber-800 font-medium">${ys.note}</div>`}
              </div>
            `)}
          </div>
        </${CollapsibleSection}>
      `}

      <${CollapsibleSection}
        id="bookings-list"
        title="Bookings & Registrations"
        icon="calendar"
        badge=${html`<span className="pill pill-gray !text-[11px]">${rows.length} records</span>`}
        actions=${html`
          <div className="flex items-center gap-1">
            ${[["courses", "Courses"], ["pt", "Placement / Consultation"], ["all", "All"]].map(([k, l]) => html`
              <button key=${k} className=${`seg !py-0.5 !px-2 text-[11px] ${filter === k ? "active" : ""}`} onClick=${() => setFilter(k)}>
                ${l} <span className="muted">${counts[k]}</span>
              </button>
            `)}
          </div>
        `}
        defaultOpen=${true}
      >
        ${error && html`<div className="mb-2 pill pill-amber flex items-center gap-1" title=${error}><${Icon} name="alert" size=${12} /><span>History partially loaded: ${error}</span></div>`}
        ${rows.length === 0
          ? html`<div className="p-6 text-center muted flex flex-col items-center gap-1"><${Icon} name="inbox" size=${22} />No bookings in this view.</div>`
          : html`<div className="overflow-x-auto">
              <table className="tbl"><thead><tr>${th("courseDescription", "Course")}${th("bookingDate", "Booked on")}${th("start", "Start")}${th("end", "End")}${th("status", "Status")}${th("teachingCentre", "Teaching Centre")}<th className="text-right">Action</th></tr></thead>
              <tbody>${rows.map((r, i) => {
                const fmt12 = SAPC.formatClassTime12h || ((x) => x);
                const isCan = /(?:booking\s*)?cancel/i.test(r.status || "");
                const termAlreadyBooked = SAPC.isTermAlreadyBooked ? SAPC.isTermAlreadyBooked(r, bookings) : false;
                const showRebookBtn = isCan && !isConsultation(r) && !hasAnyPrebooked && !termAlreadyBooked;
                const isNew = Boolean(r.isNewlyBooked || r._isNew);
                return html`<tr key=${i} style=${isNew ? { backgroundColor: "rgba(16, 185, 129, 0.08)", borderLeft: "3.5px solid #10b981" } : null}>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="font-medium">${fmt12(r.courseDescription || r.courseCode)}</div>
                    ${isNew && html`<span className="pill pill-green !text-[10px] !py-0 !px-1.5 font-bold uppercase tracking-wide">Done · New</span>`}
                  </div>
                  <div className="muted text-[11px]">${r.courseCode}${r.className && r.className !== r.courseDescription ? ` · ${fmt12(r.className)}` : ""}</div>
                </td>
                <td className="num whitespace-nowrap">${fmtDate(r.bookingDate)}</td>
                <td className="num whitespace-nowrap">${r.start ? fmtDate(r.start) : "—"}</td>
                <td className="num whitespace-nowrap">${r.end ? fmtDate(r.end) : "—"}</td>
                <td>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <${Pill} tone=${bookingStatusTone(r.status)}>${r.status || "—"}</${Pill}>
                    ${isConsultation(r) && /prebook|reserv/i.test(r.status || "") && !/cancel/i.test(r.status || "") && html`
                      <span className="pill pill-amber !text-[9.5px] !py-0 font-bold" title="امتحان تحديد المستوى غير مسدد — يلزم الدفع لحضور الاختبار">
                        Unpaid (200 EGP) · عاوزه تتدفع
                      </span>
                    `}
                    ${isNew && html`<span className="text-[11px] font-bold text-emerald-700">✓ Done</span>`}
                  </div>
                </td>
                <td className="whitespace-nowrap">${(r.teachingCentre || "—").replace(/\s*Teaching Centre/i, "")}</td>
                <td className="text-right whitespace-nowrap">
                  ${showRebookBtn ? html`
                    <button
                      type="button"
                      className="btn !h-6 !px-2 text-[11px] font-semibold !bg-amber-50 hover:!bg-amber-100 !text-amber-800 !border-amber-300 flex items-center gap-1 ml-auto shadow-2xs"
                      onClick=${() => onRebook && onRebook(r)}
                      title="Re-book this exact cancelled slot in SAP"
                    >
                      <${Icon} name="zap" size=${11} className="text-amber-600" />
                      <span>Re-book</span>
                    </button>
                  ` : html`<span className="text-slate-300 text-[11px]">—</span>`}
                </td>
              </tr>`;
              })}</tbody></table></div>`}
      </${CollapsibleSection}>
    </div>`;
  }

  function RecentBookings({ bookings, onViewAll }) {
    const recent = bookings.filter((b) => !isConsultation(b)).slice(0, 3);
    const fmt12 = SAPC.formatClassTime12h || ((x) => x);
    return html`<div className="card p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2"><div className="font-semibold flex items-center gap-2"><${Icon} name="calendar" className="muted" />Recent bookings</div>
        <span className="muted text-[11.5px]">${bookings.length} total</span></div>
      <div className="flex-1 space-y-1.5">
        ${recent.length === 0 && html`<div className="muted text-[12px] py-3 text-center">No course bookings yet.</div>`}
        ${recent.map((b, i) => { const d = bookingDates(b); return html`<div key=${i} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0" style=${{ borderColor: "#f0f2f6" }}>
          <div className="min-w-0"><div className="font-medium truncate">${fmt12(b.courseDescription || b.courseCode)}</div><div className="muted text-[11px] truncate">${d.sessionName || fmtDate(b.bookingDate)}</div></div>
          <${Pill} tone=${bookingStatusTone(b.status)}>${b.status}</${Pill}></div>`; })}
      </div>
      <button className="btn w-full justify-center mt-2" onClick=${onViewAll}>View full history<${Icon} name="chevRight" size=${14} /></button>
    </div>`;
  }

  function CancelledReservationsBanner({ cancelledInfo, onRebook }) {
    if (!cancelledInfo || cancelledInfo.count === 0) return null;
    const isMultiple = cancelledInfo.count > 1;
    const fmt12 = SAPC.formatClassTime12h || ((x) => x);
    return html`
      <div className="card p-3 border-amber-300 bg-amber-50/85 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-200/70 text-amber-800 grid place-items-center shrink-0 mt-0.5 font-bold">
            <${Icon} name="refresh" size=${16} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-amber-950 text-[13px]">
                ${isMultiple ? `${cancelledInfo.count} Cancelled Reservations Detected` : "Cancelled Reservation Detected"}
              </span>
              <span className="pill pill-red !text-[10px] font-bold">Expired (24h Auto-Cancel)</span>
              ${cancelledInfo.latestDate && html`
                <span className="text-amber-800 text-[11.5px] font-medium">Booked on: ${fmtDate(cancelledInfo.latestDate)}</span>
              `}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11.5px]">
              ${cancelledInfo.latestBatch.map((b, idx) => {
                const dates = bookingDates(b);
                const branchName = b.teachingCentre ? b.teachingCentre.replace(/\s*Teaching Centre/i, "") : "";
                return html`
                  <span key=${idx} className="inline-flex items-center gap-1.5 bg-white/90 border border-amber-200 px-2.5 py-1 rounded-[6px] text-slate-800 shadow-2xs">
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1 rounded">#${idx + 1}</span>
                    <b className="text-slate-800">${fmt12(b.className || b.courseDescription || b.courseCode)}</b>
                    ${branchName && html`<span className="text-slate-500 text-[11px]">(${branchName})</span>`}
                    ${dates.start && html`<span className="text-slate-400 text-[10.5px] num">${dates.start} → ${dates.end}</span>`}
                  </span>
                `;
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          <button
            type="button"
            className="btn btn-primary !h-8 !px-3 text-[12px] font-bold !bg-amber-600 hover:!bg-amber-700 !border-amber-600 text-white flex items-center gap-1.5 shadow-sm"
            onClick=${() => onRebook(cancelledInfo.latestBatch)}
          >
            <${Icon} name="bolt" size=${13} />
            <span>${isMultiple ? `Re-book All (${cancelledInfo.count} Classes)` : "Re-book Slot in 1-Click"}</span>
          </button>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // Student Lookup screen
  // ==========================================================================
  function LookupScreen({ ctx }) {
    const { query, setQuery, runSearch, clear, loading, step, error, setError, results, current, pick, model, pricing, inputRef, cache, openSettings, bookingOpen, onToggleBooking, onRebookCancelled, setPage, studentTab, setStudentTab } = ctx;
    const tab = studentTab || "history";
    const setTab = setStudentTab || (() => {});
    useEffect(() => { setTab("history"); }, [current && current.profile && current.profile.studentId]);

    return html`<div className="flex flex-col gap-3 pb-6">
      <${SearchBar} value=${query} onChange=${setQuery} onSearch=${runSearch} onClear=${clear} loading=${loading} inputRef=${inputRef} />

      ${loading && html`<div className="muted text-[12px] flex items-center gap-2"><${Icon} name="refresh" size=${13} className="animate-spin" />${step}</div>`}
      ${error && html`<${Banner} tone="red" icon=${error.code === "NO_COOKIE" || error.code === "EXPIRED" ? "wifiOff" : "alert"} title=${error.code === "EXPIRED" ? "SAP session expired." : error.code === "NO_COOKIE" ? "SAP not configured." : "Search failed."}
          action=${html`<div className="flex gap-1.5">${(error.code === "NO_COOKIE" || error.code === "EXPIRED") && html`<button className="btn !h-7" onClick=${openSettings}>Open Settings</button>`}<button className="btn btn-icon !h-7 !w-7" onClick=${() => setError(null)}><${Icon} name="x" size=${13} /></button></div>`}>${error.message}</${Banner}>`}
      ${results && results.length === 0 && !loading && html`<div className="card p-8 text-center flex flex-col items-center gap-1.5">
          <${Icon} name="search" size=${24} className="muted" /><div className="font-semibold">No students found</div>
          <div className="muted text-[12.5px]">Nothing in SAP matches “${query}”. Check the number format, or try the email instead.</div></div>`}

      ${results && html`<${ResultsPicker} results=${results} selectedId=${current && current.profile.studentId} onPick=${pick} loading=${loading} cache=${cache} />`}

      ${loading && !current && html`<${OverviewSkeleton} />`}
      ${!results && !loading && !current && html`<div className="card p-12 grid place-items-center text-center">
          <div className="flex flex-col items-center gap-2 max-w-[380px]">
            <div className="w-12 h-12 rounded-xl grid place-items-center" style=${{ background: "var(--bc-blue-50)", color: "var(--bc-blue)" }}><${Icon} name="search" size=${22} /></div>
            <div className="font-semibold text-[15px]">Look up a student</div>
            <div className="muted">Type a Student ID, phone number, or email and press <kbd>Enter</kbd>. Age, level, eligibility and pricing appear instantly.</div>
          </div></div>`}

      ${current && model && html`
        <${StudentOverview}
          profile=${current.profile}
          m=${model}
          source=${current.source}
          fetchedAt=${current.fetchedAt}
          bookingOpen=${bookingOpen}
          onToggleBooking=${onToggleBooking}
          onOpenPricing=${() => setPage && setPage("pricing")}
        />
        <div className="border-b flex" style=${{ borderColor: "var(--line)" }}>
          ${[
            ["history", `Booking History (${current.bookings.length})`, "calendar"],
            ["notes", "Student Notes", "note"],
            ["pricing", "Pricing & Enrollment", "tag"]
          ].map(([k, l, ic]) =>
            html`<button key=${k} className=${`tab ${tab === k ? "active" : ""}`} onClick=${() => setTab(k)}><${Icon} name=${ic} size=${14} />${l}</button>`)}
        </div>
        <div>
          ${tab === "history" && html`<${BookingHistory} bookings=${current.bookings} error=${current.historyError} progression=${model.progression} onRebook=${onRebookCancelled} />`}
          ${tab === "notes" && html`<${NotesPanel} profile=${current.profile} progression=${model.progression} model=${model} />`}
          ${tab === "pricing" && html`<div className="grid grid-cols-[260px_1fr] gap-3">
              <${RecentBookings} bookings=${current.bookings} onViewAll=${() => setTab("history")} />
              <${PricingPanel} p=${pricing} m=${model} />
            </div>`}
        </div>
      `}
    </div>`;
  }

  function NotesPanel({ profile, progression, model }) {
    const structuredNotes = profile.notesList || [];
    const notes = profile.notesAndHolds || [];
    const rawNotes = profile.rawNotesList || [];
    const allNotes = Array.from(new Set([...notes, ...rawNotes]));
    const detected = profile.detectedLevelFromNotes;
    const [noteQuery, setNoteQuery] = useState("");
    const [copiedNote, setCopiedNote] = useState(null);

    const copyText = async (label, text) => {
      if (!text) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        }
        setCopiedNote(label);
        setTimeout(() => setCopiedNote(null), 1500);
      } catch (_) {}
    };

    const copyAllNotes = () => {
      const items = structuredNotes.length > 0
        ? structuredNotes.map((n) => `[${n.type || "Note"}] ${n.title || ""}\n${n.text ? n.text + "\n" : ""}Date: ${n.createdOn || "—"} | Advisor: ${n.createdBy || "—"}`)
        : allNotes;
      copyText("all", items.join("\n\n---\n\n"));
    };

    const filteredNotes = structuredNotes.filter((n) => {
      if (!noteQuery) return true;
      const q = noteQuery.toLowerCase();
      return `${n.type || ""} ${n.title || ""} ${n.text || ""} ${n.createdBy || ""}`.toLowerCase().includes(q);
    });

    return html`<div className="space-y-3">
      ${progression && (progression.advisorNoteEn || progression.advisorNoteAr) && html`
        <${CollapsibleSection}
          id="progression-note"
          title="Smart Advisor Note — Progression & Next Booking"
          icon=${progression.isUpgradeReadyNow ? "sparkle" : "info"}
          badge=${progression.recommendedBookingLevel || progression.recommendedLevelToBook ? html`
            <span className="pill pill-green !text-[11px] font-bold">
              Book: ${progression.recommendedBookingLevel || progression.recommendedLevelToBook}${progression.recommendedTermToBook ? ` (${progression.recommendedTermToBook})` : ""}
            </span>
          ` : null}
          actions=${html`
            <button type="button" className="btn !h-6 !px-2 text-[11px] flex items-center gap-1"
              onClick=${() => copyText("advisor", [progression.advisorNoteEn, progression.advisorNoteAr].filter(Boolean).join("\n\n"))}
              title="Copy advisor progression note">
              <${Icon} name=${copiedNote === "advisor" ? "check" : "copy"} size=${12} />
              <span>${copiedNote === "advisor" ? "Copied \u2713" : "Copy Note"}</span>
            </button>
          `}
          defaultOpen=${true}
        >
          <div className="space-y-2 text-[12.5px]">
            ${progression.advisorNoteAr && html`
              <div className="font-semibold text-slate-900 leading-relaxed p-2.5 rounded-[8px] bg-amber-50/70 border border-amber-200" dir="rtl">
                ${progression.advisorNoteAr}
              </div>
            `}
            ${progression.advisorNoteEn && html`
              <div className="text-slate-800 leading-relaxed p-2 rounded-[8px] bg-slate-50 border border-slate-200 select-text">
                <b>Advisor note:</b> ${progression.advisorNoteEn}
              </div>
            `}
          </div>
        </${CollapsibleSection}>
      `}

      ${model && model.hasPrebookedPT ? html`
        <div className="rounded-[10px] p-3 flex items-center justify-between text-[12.5px] border bg-amber-50/90 border-amber-300 text-amber-950">
          <div className="flex items-center gap-2">
            <${Icon} name="alert" size=${17} className="text-amber-600 shrink-0" />
            <span>
              <b>Placement test prebooked (${(model.prebookedPT && (model.prebookedPT.courseDescription || model.prebookedPT.className)) || "Online/Phone Consultation"}):</b>
              {" "}امتحان تحديد المستوى محجوز وبانتظار الدفع (200 EGP) — المستوى هيتحدد بعد الدفع واجتياز الاختبار.
            </span>
          </div>
          <span className="pill pill-amber shrink-0 font-bold">Unpaid · Awaiting Payment (200 EGP)</span>
        </div>
      ` : (!profile.isEarlyYears && !(model && model.isEarlyYears) && !profile.hasPrebookedPT && !(model && model.hasPrebookedPT) && (profile.isNoLevel || (!/no\s*level\s*assigned/i.test(detected || "") && /no level|راسب|ساقط/i.test(detected || "")))) ? html`
        <div className="rounded-[10px] p-3 flex items-center justify-between text-[12.5px] border" style=${{ background: "var(--red-50)", borderColor: "#fecaca", color: "#991b1b" }}>
          <div className="flex items-center gap-2">
            <${Icon} name="alert" size=${17} className="text-red-600 shrink-0" />
            <span><b>Placement test result — No Level (did not pass):</b> student did not achieve the required score. Direct booking is blocked; placement test rebooking is required (200 EGP).</span>
          </div>
          <span className="pill pill-red shrink-0">Retest required</span>
        </div>
      ` : detected && html`
        <div className="rounded-[10px] p-3 flex items-center justify-between text-[12.5px] border" style=${{ background: "var(--green-50)", borderColor: "#bbf7d0", color: "var(--green)" }}>
          <div className="flex items-center gap-2">
            <${Icon} name="check" size=${16} />
            <span><b>Outside Level was A0:</b> Sub-level <span className="font-bold underline">${detected}</span> extracted from Advisor Notes and applied to profile.</span>
          </div>
          <span className="pill pill-green">Adult Beginner Package</span>
        </div>
      `}

      <div className="grid grid-cols-[1.5fr_1fr] gap-3">
        <${CollapsibleSection}
          id="notes-advising"
          title="SAP Student Notes & Advising"
          icon="note"
          badge=${html`<span className="pill pill-gray !text-[11px]">${structuredNotes.length || allNotes.length} entries</span>`}
          actions=${html`
            <div className="flex items-center gap-2">
              ${structuredNotes.length > 2 && html`
                <input
                  type="text"
                  placeholder="Filter notes..."
                  value=${noteQuery}
                  onChange=${(e) => setNoteQuery(e.target.value)}
                  className="input !h-6 !px-2 text-[11px] w-28"
                  onClick=${(e) => e.stopPropagation()}
                />
              `}
              <button type="button" className="btn !h-6 !px-2 text-[11px] flex items-center gap-1" onClick=${copyAllNotes} title="Copy all notes">
                <${Icon} name=${copiedNote === "all" ? "check" : "copy"} size=${12} />
                <span>${copiedNote === "all" ? "Copied \u2713" : "Copy All"}</span>
              </button>
            </div>
          `}
          defaultOpen=${true}
        >
          ${structuredNotes.length > 0 ? html`
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style=${{ width: 110 }}>Type</th>
                    <th>Title & Content</th>
                    <th style=${{ width: 110 }}>Created On</th>
                    <th style=${{ width: 90 }}>Advisor</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredNotes.map((n, i) => {
                    const isNoLvl = !(model && (model.isEarlyYears || model.hasPrebookedPT)) && Boolean(n.isNoLevel || (!/no\s*level\s*assigned/i.test(n.title || n.text || "") && /no\s*level|راسب|ساقط|fail/i.test(n.title || n.text || "")));
                    const hasLvl = !isNoLvl && Boolean(n.detectedLevel || /BEG|A0|Beginner/i.test(n.title || n.text || ""));
                    const isHold = !isNoLvl && /hold|alert|warning/i.test(n.type || n.title || "");
                    const isAr = /[\u0600-\u06FF]/.test(n.title || n.text || "");
                    return html`<tr key=${i} style=${isNoLvl ? { background: "var(--red-50)" } : hasLvl ? { background: "var(--green-50)" } : null}>
                      <td>
                        <span className=${`pill ${isNoLvl ? "pill-red" : hasLvl ? "pill-green" : isHold ? "pill-amber" : "pill-gray"} !text-[10px]`}>
                          ${isNoLvl ? "No Level (Failed PT)" : n.detectedLevel ? `Level: ${n.detectedLevel}` : (n.type || "Note")}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-start justify-between gap-1.5">
                          <div className=${`font-medium text-[12px] ${isNoLvl ? "text-red-800 font-bold" : hasLvl ? "text-green-800 font-bold" : "text-slate-800"}`} dir=${isAr ? "rtl" : "ltr"}>
                            ${isNoLvl && html`<${Icon} name="alert" size=${13} className="text-red-600 inline mr-1" />`}
                            ${n.title || n.text}
                          </div>
                          <button type="button" className="muted hover:text-blue-700 p-0.5 shrink-0" onClick=${() => copyText(i, `${n.title || ""}\n${n.text || ""}`)} title="Copy note">
                            <${Icon} name=${copiedNote === i ? "check" : "copy"} size=${12} />
                          </button>
                        </div>
                        ${n.text && n.text !== n.title && html`
                          <div className="text-[11.5px] muted whitespace-pre-wrap mt-1 leading-relaxed" dir=${isAr ? "rtl" : "ltr"}>
                            ${n.text}
                          </div>
                        `}
                      </td>
                      <td className="num whitespace-nowrap text-[11.5px]">${n.createdOn || "—"}</td>
                      <td className="text-[11.5px] font-mono">${n.createdBy || "—"}</td>
                    </tr>`;
                  })}
                </tbody>
              </table>
            </div>
          ` : allNotes.length ? html`
            <div className="space-y-1.5">
              ${allNotes.map((n, i) => html`<div key=${i} className="py-2 border-b last:border-0 flex items-start justify-between gap-2 text-[12px]" style=${{ borderColor: "#f0f2f6" }}>
                <div className="flex items-start gap-2">
                  <${Icon} name=${/active hold/i.test(n) ? "alert" : "note"} size=${14} className=${/active hold/i.test(n) ? "text-red-700 mt-0.5" : "muted mt-0.5"} />
                  <span className="leading-relaxed select-text font-medium">${n}</span>
                </div>
                <button type="button" className="muted hover:text-blue-700 p-0.5 shrink-0" onClick=${() => copyText(i, n)} title="Copy">
                  <${Icon} name=${copiedNote === i ? "check" : "copy"} size=${12} />
                </button>
              </div>`)}
            </div>
          ` : html`<div className="muted text-[12px] py-6 text-center">No notes or holds recorded on this SAP profile.</div>`}
        </${CollapsibleSection}>

        <${CollapsibleSection}
          id="notes-contact"
          title="Contact & Account Info"
          icon="user"
          defaultOpen=${true}
        >
          <div className="space-y-1">
            ${[
              ["phone", "Mobile", [profile.phonePrefix, profile.phone].filter(Boolean).join(" ")],
              ["mail", "Email", profile.email],
              ["user", "Language", profile.language],
              ["pin", "Country", profile.country],
              ["building", "Centre", profile.teachingCentre],
              ["clipboard", "Student ID", profile.studentId],
            ].map(([ic, l, v]) => html`
              <div key=${l} className="flex items-center justify-between gap-2 py-1.5 text-[12px] border-b last:border-0" style=${{ borderColor: "#f0f2f6" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <${Icon} name=${ic} size=${13} className="muted shrink-0" />
                  <span className="muted w-20 shrink-0">${l}</span>
                  <span className="truncate font-medium">${v || "—"}</span>
                </div>
                ${v && html`
                  <button type="button" className="muted hover:text-blue-700 p-0.5 shrink-0" onClick=${() => copyText(l, v)} title=${`Copy ${l}`}>
                    <${Icon} name=${copiedNote === l ? "check" : "copy"} size=${12} />
                  </button>
                `}
              </div>
            `)}
          </div>
          <div className="mt-3 p-2 rounded-[6px] bg-slate-50 text-[11px] muted flex items-center gap-1.5">
            <${Icon} name="info" size=${13} />
            <span>Profile and notes synced live from SAP.</span>
          </div>
        </${CollapsibleSection}>
      </div>

      ${profile.recLevels && profile.recLevels.length > 0 && html`
        <${CollapsibleSection}
          id="notes-reclevels"
          title="Recommended Academic Level History (SAP)"
          icon="cap"
          badge=${html`<span className="pill pill-green !text-[11px] font-bold">Latest: ${profile.latestRecLevel || profile.level}</span>`}
          defaultOpen=${true}
        >
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Academic Level</th>
                  <th>Booking Origin</th>
                  <th>Reference</th>
                  <th>Valid Until</th>
                  <th>Advisor</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${profile.recLevels.map((r, i) => {
                  const isLatest = r.level === (profile.latestRecLevel || profile.level);
                  return html`<tr key=${i} style=${isLatest ? { background: "var(--green-50)" } : null}>
                    <td>
                      <span className=${`pill ${isLatest ? "pill-green font-bold" : "pill-blue"} !text-[11px]`}>
                        ${r.level} ${isLatest ? "(Current)" : ""}
                      </span>
                    </td>
                    <td className="text-[12px]">${r.origin || "—"}</td>
                    <td className="text-[12px] font-medium">${r.reference || "—"}</td>
                    <td className="num text-[11.5px] whitespace-nowrap">${r.validUntil || "—"}</td>
                    <td className="text-[11.5px] font-mono">${r.changedBy || "—"}</td>
                    <td className="num text-[11.5px] whitespace-nowrap">${r.changedOn || (r.timestamp ? r.timestamp.split(" ")[0] : "—")}</td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>
        </${CollapsibleSection}>
      `}

      ${profile.accountBalance && html`
        <${CollapsibleSection}
          id="notes-balance"
          title="Account Balance Details (FPL9)"
          icon="card"
          badge=${html`<span className=${`pill ${profile.accountBalance.isCredit ? "pill-blue" : profile.accountBalance.isDebt ? "pill-red" : "pill-green"} !text-[11px] font-bold`}>
            ${profile.accountBalance.isCredit ? `Credit: ${profile.accountBalance.formatted}` : profile.accountBalance.isDebt ? `Amount due: +${profile.accountBalance.formatted}` : "Fully settled (0 EGP)"}
          </span>`}
          defaultOpen=${true}
        >
          <div className="grid grid-cols-3 gap-3 text-[12px]">
            <div className="p-2.5 rounded-[8px] bg-slate-50 border border-slate-100">
              <div className="muted text-[11px]">Total Debit</div>
              <div className="text-[15px] font-bold num mt-0.5">${egp(profile.accountBalance.debit || 0)}</div>
            </div>
            <div className="p-2.5 rounded-[8px] bg-slate-50 border border-slate-100">
              <div className="muted text-[11px]">Total Credit</div>
              <div className="text-[15px] font-bold num mt-0.5">${egp(profile.accountBalance.credit || 0)}</div>
            </div>
            <div className=${`p-2.5 rounded-[8px] border ${profile.accountBalance.isCredit ? "bg-blue-50/60 border-blue-200 text-blue-900" : profile.accountBalance.isDebt ? "bg-red-50/60 border-red-200 text-red-900" : "bg-slate-50 border-slate-100"}`}>
              <div className="text-[11px] font-medium opacity-80">Open Balance (net)</div>
              <div className="text-[16px] font-bold num mt-0.5">${profile.accountBalance.formatted}</div>
            </div>
          </div>
          <div className="mt-2 text-[11.5px] muted">
            ${profile.accountBalance.isCredit
              ? "Credit (negative open balance): the student has money held with us in SAP that can be used for bookings or refunded."
              : profile.accountBalance.isDebt
              ? "Previous debt (positive open balance): the student owes a remaining amount, which is added automatically to the total when booking."
              : "Fully settled (zero balance): no overdue amounts or pending credits."}
          </div>
        </${CollapsibleSection}>
      `}
    </div>`;
  }

  // ==========================================================================
  // Pricing Screen (Standalone or for selected student)
  // ==========================================================================
  function PricingScreen({ model, current, pricing, onBackToLookup }) {
    const p = pricing;
    return html`<div className="space-y-3">
      <${PageTitle} title="Pricing & Installment Plans" sub="Calculate tuition fees, package bundles, credit card installment plans, and student balance">
        ${current && current.profile && html`
          <button type="button" className="btn !h-8 !px-3 text-[12px] flex items-center gap-1.5 font-semibold" onClick=${onBackToLookup}>
            <${Icon} name="chevRight" size=${14} className="rotate-180" /> Back to Student Lookup
          </button>
        `}
      </${PageTitle}>

      ${current && current.profile ? html`
        <div className="card p-3 bg-gradient-to-r from-blue-50/80 via-white to-slate-50 border flex items-center justify-between flex-wrap gap-2" style=${{ borderColor: "#cbdcf8" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 grid place-items-center">
              <${Icon} name="user" size=${20} />
            </div>
            <div>
              <div className="font-bold text-[14.5px] text-slate-800 flex items-center gap-2">
                <span>${SAPC.formatStudentName(current.profile.fullName) || current.profile.fullName}</span>
                <span className="pill pill-blue !text-[11px] font-mono">ID ${current.profile.studentId}</span>
                ${model && model.status && html`<span className=${`pill pill-${model.status.tone} !text-[10.5px]`}>${model.status.label}</span>`}
              </div>
              <div className="text-[12px] muted flex items-center gap-3 mt-0.5 flex-wrap">
                <span>Level: <b className="text-slate-800">${model ? model.level : current.profile.level || "—"}</b></span>
                <span>Academic Age: <b>${model && model.age ? `${model.age.academicYears || model.age.years} years` : "—"}</b></span>
                <span>Centre: <b>${current.profile.teachingCentre || "—"}</b></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            ${model && model.balance && html`
              <span className=${`pill ${model.balance.isCredit ? "pill-blue" : model.balance.isDebt ? "pill-red" : "pill-green"} font-semibold text-[11.5px]`}>
                Account Balance: ${model.balance.formatted}
              </span>
            `}
            <button type="button" className="btn btn-primary !h-8 !px-3 text-[12px] flex items-center gap-1.5" onClick=${onBackToLookup}>
              <${Icon} name="home" size=${13} /> View Student Bookings & Notes
            </button>
          </div>
        </div>
      ` : html`
        <div className="card p-3.5 border flex items-center justify-between bg-blue-50/50 flex-wrap gap-2" style=${{ borderColor: "#cbdcf8" }}>
          <div className="flex items-center gap-2.5">
            <${Icon} name="info" size=${17} className="text-blue-600 shrink-0" />
            <span className="text-[12.5px] text-slate-700">
              No student is currently selected. Showing standard tuition and installment pricing.
              Select an age group below, or look up a student to apply their specific level, discounts, and SAP account balance.
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            ${[
              ["primary", "Primary Plus (Age 6-10)"],
              ["secondary", "Secondary Plus (Age 11-17)"],
              ["adult", "Adults (18+)"],
            ].map(([id, label]) => html`
              <button
                key=${id}
                type="button"
                className=${`seg !py-1 !px-2.5 text-[11.5px] ${p.fallbackAgeGroup === id ? "active" : ""}`}
                onClick=${() => p.setFallbackAgeGroup(id)}
              >
                ${label}
              </button>
            `)}
          </div>
        </div>
      `}

      <${PricingPanel} p=${p} m=${model} />
    </div>`;
  }

  const PageTitle = ({ title, sub, children }) => html`<div className="flex items-end justify-between mb-3"><div><h1 className="text-[16px] font-semibold" style=${{ color: "var(--bc-navy)" }}>${title}</h1><div className="muted text-[12px]">${sub}</div></div>${children}</div>`;

  function MappingScreen({ model, current }) {
    const [subTab, setSubTab] = useState("chart"); // 'chart' | 'summer'
    const [q, setQ] = useState("");
    const profile = (current && current.profile) || (model && model.profile) || null;
    const studentName = profile ? (profile.fullName || `${profile.firstName || ""} ${profile.lastName || ""}`.trim()) : "";
    const matchedLevel = model && model.analysis && model.analysis.levelInfo && model.analysis.levelInfo.matchedLevelObj;
    const list = KB.YL_LEVELS.filter((l) => `${l.name} ${l.ageGroupName} ${l.summerMapping}`.toLowerCase().includes(q.toLowerCase()));
    const chart = KB.BC_LEVEL_PROGRESSION_CHART || [];

    return html`<div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight" style=${{ color: "var(--bc-navy)" }}>Course & Progression Mapping</h1>
          <p className="text-[12px] muted">British Council English Language Level Progression Chart & Summer Equivalents</p>
        </div>
        <div className="flex items-center gap-1.5 p-1 rounded-[8px] border bg-slate-100" style=${{ borderColor: "var(--line)" }}>
          <button
            type="button"
            className=${`btn !h-7 !px-3 text-[12px] font-semibold ${subTab === "chart" ? "btn-primary shadow-sm" : "btn-ghost text-slate-600"}`}
            onClick=${() => setSubTab("chart")}
          >
            Level Progression Chart
          </button>
          <button
            type="button"
            className=${`btn !h-7 !px-3 text-[12px] font-semibold ${subTab === "summer" ? "btn-primary shadow-sm" : "btn-ghost text-slate-600"}`}
            onClick=${() => setSubTab("summer")}
          >
            Winter ⇄ Summer Equivalents
          </button>
        </div>
      </div>

      ${profile && html`
        <div className="card p-3 mb-4 flex items-center justify-between gap-3 text-[12px] border-l-4" style=${{ borderLeftColor: "var(--bc-blue)" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="muted font-semibold">Loaded Student:</span>
            <b className="text-[13px]">${studentName}</b>
            <span className="pill pill-blue !text-[11px]">${model && model.age ? `${model.age.academicYears}y (${model.age.stageCategory})` : ""}</span>
            <span className="muted">·</span>
            <span className="muted">Level:</span>
            <b className="text-[13px]">${model ? model.level : "—"}</b>
            ${model && model.progression && model.progression.ageTransition && html`
              <span className="pill pill-amber font-bold !text-[11px]">
                🎂 Age Shift: Now in ${model.progression.ageTransition.targetStageName} → Recommended: ${model.progression.recommendedBookingLevel}
              </span>
            `}
          </div>
          ${model && model.progression && html`
            <span className="pill pill-green font-bold !text-[11.5px]">
              Next to Book: ${model.progression.recommendedBookingLevel} (${model.progression.recommendedTermToBook})
            </span>
          `}
        </div>
      `}

      ${subTab === "chart" && html`
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">British Council English Language Level Progression Chart</h2>
              <p className="text-[11.5px] muted">Mapping of Age Progression vs. CEFR Levels & Age Category Transitions</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400"></span>Upper Secondary (15–17y)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-400"></span>Lower Secondary (12–14y)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500"></span>Upper Primary (9–11y)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sky-400"></span>Lower Primary (6–8y)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cyan-400"></span>Early Years (4–5y)</span>
            </div>
          </div>

          <div className="overflow-auto scroll-thin border rounded-[10px]" style=${{ borderColor: "var(--line)" }}>
            <table className="w-full text-center text-[12px] border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b text-slate-700" style=${{ borderColor: "var(--line)" }}>
                  <th rowSpan="2" className="p-2.5 font-bold border-r w-[120px]" style=${{ borderColor: "var(--line)" }}>
                    <div className="text-[10.5px] uppercase tracking-wider text-slate-500">Progression</div>
                    <div className="text-[13px]">Age</div>
                  </th>
                  <th colSpan="6" className="p-2 font-bold uppercase tracking-wider text-[12px] bg-slate-200/70 border-b" style=${{ borderColor: "var(--line)" }}>
                    CEFR Levels Or Equivalent
                  </th>
                </tr>
                <tr className="bg-slate-100/80 border-b text-slate-700 font-bold" style=${{ borderColor: "var(--line)" }}>
                  <th className="p-2 border-r" style=${{ borderColor: "var(--line)" }}>A0 (Pre-A1)</th>
                  <th className="p-2 border-r" style=${{ borderColor: "var(--line)" }}>A1</th>
                  <th className="p-2 border-r" style=${{ borderColor: "var(--line)" }}>A2</th>
                  <th className="p-2 border-r" style=${{ borderColor: "var(--line)" }}>B1</th>
                  <th className="p-2 border-r" style=${{ borderColor: "var(--line)" }}>B2</th>
                  <th className="p-2">C1</th>
                </tr>
              </thead>
              <tbody>
                ${chart.map((row) => html`
                  <tr key=${row.stage + row.ageRange} className=${`border-b transition-colors ${row.rowClass}`} style=${{ borderColor: "var(--line)" }}>
                    <td className="p-2.5 font-bold border-r text-left pl-3" style=${{ borderColor: "var(--line)" }}>
                      <span className=${`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${row.badgeClass}`}>
                        ${row.ageRange}
                      </span>
                    </td>
                    ${row.cells.map((cell) => html`
                      <td key=${cell.cefr} className="p-2 border-r text-[11.5px]" style=${{ borderColor: "var(--line)" }}>
                        ${cell.empty ? html`<span className="text-slate-300">—</span>` : html`
                          <div className="font-semibold text-slate-800">${cell.text}</div>
                        `}
                      </td>
                    `)}
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      `}

      ${subTab === "summer" && html`
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <input className="input w-64" placeholder="Filter levels…" value=${q} onChange=${(e) => setQ(e.target.value)} />
            <span className="muted text-[12px]">Showing ${list.length} levels</span>
          </div>
          <div className="mapping-table-card card overflow-auto scroll-thin">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Winter level</th>
                  <th>Age group</th>
                  <th>Terms to complete</th>
                  <th>Summer equivalent</th>
                  <th>PT</th>
                </tr>
              </thead>
              <tbody>
                ${list.map((l) => html`
                  <tr key=${l.id} style=${current && current.id === l.id ? { background: "var(--bc-blue-50)" } : null}>
                    <td className="font-medium">${l.name}</td>
                    <td className="muted">${l.ageGroupName}</td>
                    <td>${l.termsToComplete}</td>
                    <td>${l.summerMapping ? html`<${Pill} tone="blue">${l.summerMapping}</${Pill}>` : html`<span className="muted">—</span>`}</td>
                    <td>${l.ptRequired ? html`<${Pill} tone="amber">Required</${Pill}>` : html`<${Pill} tone="green">Not needed</${Pill}>`}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>`;
  }

  function SettingsModal({ onClose, onSaved }) {
    const [val, setVal] = useState(Svc.getCookie());
    const [testing, setTesting] = useState(false);
    const [testError, setTestError] = useState("");
    const [testStep, setTestStep] = useState("");
    const [testSuccess, setTestSuccess] = useState(false);
    const [modalTab, setModalTab] = useState("autosync"); // 'autosync' | 'manual'

    const parsed = SAPC.parsePastedAuth(val);
    const hasSessionId = /SAP_SESSIONID/i.test(parsed.cookie);

    async function handleSaveAndTest() {
      setTestError("");
      setTestSuccess(false);

      if (!val.trim()) {
        Svc.setCookie("");
        onSaved(null);
        return;
      }

      setTesting(true);
      try {
        const res = await Svc.testAndSave(val.trim(), setTestStep);
        setTestSuccess(true);
        setTimeout(() => {
          onSaved(res.session);
        }, 800);
      } catch (err) {
        setTestError(err.message || "Failed to connect to SAP.");
      } finally {
        setTesting(false);
        setTestStep("");
      }
    }

    async function handleCheckAutoSync() {
      setTestError("");
      setTestSuccess(false);
      setTesting(true);
      setTestStep("Checking for cookies synced from Extension...");
      try {
        const res = await Svc.fetchServerSyncedCookie();
        if (!res || !res.cookie) {
          throw new Error("No cookies received from the extension yet. Make sure the extension is installed and an SAP page is open in the browser.");
        }
        setTestStep("Testing handshake with SAP...");
        const sess = await Svc.connect(setTestStep);
        setTestSuccess(true);
        setTimeout(() => {
          onSaved(sess);
        }, 800);
      } catch (err) {
        setTestError(err.message || "Failed to connect using synced cookies.");
      } finally {
        setTesting(false);
        setTestStep("");
      }
    }

    return html`<div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm grid place-items-center z-50 p-4" onClick=${onClose}>
      <div className="card w-full max-w-[640px] p-5 shadow-2xl overflow-hidden" onClick=${(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg grid place-items-center" style=${{ background: "var(--bc-blue-50)", color: "var(--bc-blue)" }}>
              <${Icon} name="settings" size=${17} />
            </div>
            <div>
              <div className="font-semibold text-[15px]" style=${{ color: "var(--bc-navy)" }}>SAP Connection & Cookies</div>
              <div className="muted text-[11.5px]">Paste your SAP session cookie or "Copy as fetch"</div>
            </div>
          </div>
          <button className="btn btn-icon" onClick=${onClose}><${Icon} name="x" /></button>
        </div>

        <!-- Mode Switcher -->
        <div className="flex border-b mb-3 text-[12.5px]" style=${{ borderColor: "var(--line)" }}>
          <button
            type="button"
            className=${`tab !mr-4 ${modalTab === "autosync" ? "active" : ""}`}
            onClick=${() => setModalTab("autosync")}
          >
            <${Icon} name="zap" size=${14} /> Auto-Sync ⚡
          </button>
          <button
            type="button"
            className=${`tab !mr-4 ${modalTab === "manual" ? "active" : ""}`}
            onClick=${() => setModalTab("manual")}
          >
            <${Icon} name="copy" size=${14} /> Paste cookies manually
          </button>
        </div>

        ${modalTab === "autosync" ? html`
          <!-- Auto-Sync Extension Guide -->
          <div className="rounded-[10px] p-3.5 text-[12.5px] border space-y-2.5" style=${{ background: "var(--surface)", borderColor: "var(--line)" }}>
            <div className="font-semibold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-2 text-blue-700">
                <${Icon} name="zap" size=${16} /> Keep the SAP session synced automatically
              </span>
              <span className="pill pill-green !text-[11px]">One-time setup</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[12px]">
              A lightweight Edge/Chrome extension pulls the latest cookies from the SAP page automatically every minute and updates the assistant instantly:
            </p>
            <div className="space-y-2 text-slate-700 text-[12px] bg-white p-3 rounded-lg border border-slate-200">
              <div className="flex items-start gap-2">
                <span className="pill pill-blue !text-[11px] !px-1.5 !py-0 shrink-0">1</span>
                <span>Open a new Edge tab and type in the address bar: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-blue-700 font-mono">edge://extensions</code> then press Enter.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="pill pill-blue !text-[11px] !px-1.5 !py-0 shrink-0">2</span>
                <span>Turn on <b>Developer mode</b> from the sidebar or the top of the page.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="pill pill-blue !text-[11px] !px-1.5 !py-0 shrink-0">3</span>
                <span>Click <b>Load unpacked</b> and select this folder:</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 bg-slate-50 p-2 rounded border border-slate-200 font-mono text-[11px] text-slate-800">
                <span className="truncate flex-1">Select the <b>extension</b> folder from this project in your browser's extension manager.</span>
              </div>
            </div>
            <div className="text-green-700 font-medium text-[11.5px] flex items-center gap-1.5">
              <${Icon} name="check" size=${14} /> Once installed, the extension keeps the local assistant connected in the background.
            </div>
          </div>
        ` : html`
          <!-- Manual Paste -->
          <div className="space-y-2">
            <div className="text-[12px] text-slate-600">
              Copy <code>Copy as fetch</code> from the Network tab on the SAP page and paste it here:
            </div>
            <textarea
              className="input !h-28 py-2 font-mono text-[11px] leading-relaxed resize-none"
              value=${val}
              onChange=${(e) => { setVal(e.target.value); setTestError(""); }}
              placeholder=${'fetch("https://prd-sap.sms.britishcouncil.org/sap/bc/webdynpro/sap/z_her_wa_student?...", { "headers": { "cookie": "SAP_SESSIONID_S4P_100=...; sap-usercontext=..." } })'}
            ></textarea>
          </div>
        `}

        <!-- Status & Validation Info -->
        <div className="mt-2.5 flex items-center justify-between text-[12px]">
          <div>
            ${!val.trim()
              ? html`<span className="muted">Empty — connect SAP to search live records</span>`
              : hasSessionId
              ? html`<${Pill} tone="green" icon="check">SAP_SESSIONID found</${Pill}>`
              : html`<${Pill} tone="amber" icon="alert">Warning: No SAP_SESSIONID detected in input</${Pill}>`}
          </div>
          ${testing && html`<span className="muted flex items-center gap-1.5 text-[11.5px]">
            <${Icon} name="refresh" size=${13} className="animate-spin text-blue-600" />
            ${testStep || "Testing connection with SAP…"}
          </span>`}
          ${testSuccess && html`<span className="text-green-700 font-semibold flex items-center gap-1">
            <${Icon} name="check" size=${14} /> Connected successfully!
          </span>`}
        </div>

        ${testError && html`<div className="mt-2.5 rounded-[8px] p-2.5 text-[12px] flex items-start gap-2" style=${{ background: "var(--red-50)", color: "var(--red)" }}>
          <${Icon} name="alert" size=${16} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <b>Connection Failed: </b>${testError}
            <div className="mt-1 opacity-90 text-[11px]">If you see 403 Forbidden, the cookies have expired — refresh the SAP page and copy a new fetch request.</div>
          </div>
        </div>`}

        <div className="flex items-center justify-between mt-4 pt-3 border-t" style=${{ borderColor: "var(--line)" }}>
          <button className="btn" type="button" onClick=${() => { setVal(""); Svc.setCookie(""); onSaved(null); }} disabled=${testing}>
            Clear Search
          </button>
          <div className="flex gap-2">
            <button className="btn" type="button" onClick=${onClose} disabled=${testing}>Cancel</button>
            ${modalTab === "autosync" ? html`
              <button
                className="btn btn-primary"
                type="button"
                onClick=${handleCheckAutoSync}
                disabled=${testing}
              >
                <${Icon} name=${testing ? "refresh" : "zap"} size=${14} className=${testing ? "animate-spin" : ""} />
                ${testing ? "Checking..." : "Verify Auto-Sync Connection"}
              </button>
            ` : html`
              <button
                className="btn btn-primary"
                type="button"
                onClick=${handleSaveAndTest}
                disabled=${testing}
              >
                <${Icon} name=${testing ? "refresh" : "zap"} size=${14} className=${testing ? "animate-spin" : ""} />
                ${testing ? "Testing..." : "Save & Connect"}
              </button>
            `}
          </div>
        </div>
      </div>
    </div>`;
  }

  // ==========================================================================
  // App
  // ==========================================================================
  function App() {
    const [page, setPage] = useState("lookup");
    const [settings, setSettings] = useState(() => location.hash.includes("settings"));
    const [conn, setConn] = useState({ state: "idle" });
    const [refreshing, setRefreshing] = useState(false);
    const [query, setQuery] = useState(() => decodeURIComponent((location.hash.match(/q=([^&]+)/) || [])[1] || ""));
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState("");
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);
    const [current, setCurrent] = useState(null); // { profile, bookings, source, fetchedAt, historyError }
    const [cache, setCache] = useState({});
    const [syncStatus, setSyncStatus] = useState(null);
    const [bookingOpen, setBookingOpen] = useState(false);
    const [bookingInitialClasses, setBookingInitialClasses] = useState(null);
    const [studentTab, setStudentTab] = useState("history");
    const [toast, setToast] = useState(null);
    const inputRef = useRef(null);
    const searchSeqRef = useRef(0);

    // Auto-dismiss toast after 7s
    useEffect(() => {
      if (!toast) return;
      const t = setTimeout(() => setToast(null), 7000);
      return () => clearTimeout(t);
    }, [toast]);

    useEffect(() => {
      async function checkSync() {
        try {
          const res = await Svc.fetchServerSyncedCookie();
          if (res) {
            setSyncStatus(res);
            if (res.hasSessionId) {
              setConn({ state: "connected", at: new Date() });
              if (!location.hash.includes("settings")) {
                setSettings(false);
              }
            }
          }
        } catch (e) {}
      }
      checkSync();
      const interval = setInterval(checkSync, 25000);
      return () => clearInterval(interval);
    }, []);

    const model = useMemo(() => (current ? deriveStudent(current.profile, current.bookings, results) : null), [current, results]);
    const pricing = usePricing(current ? current.profile.dob : "", model);

    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
          e.preventDefault(); setPage("lookup"); setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    const fail = (e) => {
      setError({ message: e.message, code: e.code });
      setConn({ state: "error", message: e.message });
    };

    function makeInitialRecord(row) {
      const sId = String(row.studentNumber || row.studentId || "").padStart(10, "0");
      const fullName = SAPC.formatStudentName(row.fullName || `${row.firstName || ""} ${row.lastName || ""}`);
      const firstName = SAPC.formatStudentName(row.firstName || "");
      const lastName = SAPC.formatStudentName(row.lastName || "");
      return {
        profile: {
          studentId: sId,
          fullName: fullName || "Student",
          firstName: firstName,
          lastName: lastName,
          dob: row.dob || "",
          phone: row.phone || "",
          email: row.email || "",
          teachingCentre: row.teachingCentre || "",
          country: row.country || "Egypt",
          level: row.level || "Checking level…",
          outsideLevel: row.level || "",
          levelSource: "SAP Search",
          notesList: [],
          rawNotesList: [],
          recLevels: [],
          accountBalance: row.accountBalance || { open: 0, isSettled: true, amount: 0, formatted: "0 EGP" },
          isPartial: true,
        },
        bookings: [],
        source: "live",
        fetchedAt: new Date(),
        isPartial: true,
      };
    }

    async function openRow(row, seq = searchSeqRef.current, forceReload = false) {
      const sId = String(row.studentNumber || row.studentId || "").padStart(10, "0");
      // Instant tab switch from memory cache if already fetched!
      if (!forceReload && cache[sId] && !cache[sId].isPartial) {
        setCurrent(cache[sId]);
        return;
      }

      // 1. Immediately show initial student card from row info so user sees it right away!
      const initialRec = cache[sId] || makeInitialRecord(row);
      setCurrent(initialRec);
      setLoading(true);

      try {
        const r = await Svc.openStudent(
          row,
          (msg) => {
            if (seq === searchSeqRef.current) setStep(msg);
          },
          (partial) => {
            if (seq !== searchSeqRef.current) return;
            const liveRec = { ...partial, source: "live", fetchedAt: new Date() };
            setCache((prev) => ({ ...prev, [sId]: liveRec }));
            setCurrent((curr) => {
              if (!curr || !curr.profile || String(curr.profile.studentId).padStart(10, "0") === sId) {
                return liveRec;
              }
              return curr;
            });
          }
        );
        if (seq !== searchSeqRef.current) return;
        const finalRec = { ...r, source: "live", isPartial: false };
        setCache((prev) => ({ ...prev, [sId]: finalRec }));
        setCurrent((curr) => {
          if (!curr || !curr.profile || String(curr.profile.studentId).padStart(10, "0") === sId) {
            return finalRec;
          }
          return curr;
        });
        setConn({ state: "connected", at: new Date() });
      } catch (e) {
        if (seq === searchSeqRef.current) fail(e);
      } finally {
        if (seq === searchSeqRef.current) {
          setLoading(false);
          setStep("");
        }
      }
    }

    async function runSearch() {
      if (!query.trim()) return;
      const mySeq = ++searchSeqRef.current;
      setError(null); setResults(null); setCurrent(null);
      if (!Svc.hasCookie()) {
        setError({ code: "NO_COOKIE", message: "Connect SAP before searching live records." });
        return;
      }
      setLoading(true);
      try {
        const { results: res } = await Svc.search(query, (msg) => {
          if (mySeq === searchSeqRef.current) setStep(msg);
        });
        if (mySeq !== searchSeqRef.current) return;
        setConn({ state: "connected", at: new Date() });

        if (!res || res.length === 0) {
          setResults([]);
          setLoading(false);
          setStep("");
          return;
        }

        // 1. Instantly display search results & student cards!
        setResults(res);
        setLoading(false);
        setStep("");

        // 2. Open first student right away with progressive background streaming, then check duplicates if any!
        await openRow(res[0], mySeq);
        if (mySeq !== searchSeqRef.current) return;

        // Additional matches stay lightweight; fetch details only when selected.
      } catch (e) {
        if (mySeq === searchSeqRef.current) fail(e);
      } finally {
        if (mySeq === searchSeqRef.current) {
          setLoading(false);
          setStep("");
        }
      }
    }

    async function refreshSession() {
      if (!Svc.hasCookie()) { setSettings(true); return; }
      setRefreshing(true); Svc.reset();
      try { await Svc.connect(); setConn({ state: "connected", at: new Date() }); setError(null); }
      catch (e) { fail(e); } finally { setRefreshing(false); }
    }

    // Deep link: http://localhost:8787/#q=<id|phone|email> runs the search on load
    useEffect(() => { if (query) runSearch(); }, []);

    const clear = () => { setQuery(""); setResults(null); setCurrent(null); setCache({}); setError(null); inputRef.current && inputRef.current.focus(); };

    function handleRebookCancelled(classesOrList) {
      const list = (Array.isArray(classesOrList) ? classesOrList : [classesOrList]).filter(Boolean);
      if (list.length === 0) return;
      const classItems = list.map((b) => (SAPC.cancelledBookingToClassItem ? SAPC.cancelledBookingToClassItem(b) : b));
      setBookingInitialClasses(classItems);
      setBookingOpen(true);
    }

    function handleBookingCompleted(bookedItems, meta = {}) {
      if (!current || !current.profile) return;
      const profile = current.profile;
      const sId = String(profile.studentId || profile.studentNumber || "").padStart(10, "0");
      const items = (Array.isArray(bookedItems) ? bookedItems : [bookedItems]).filter(Boolean);
      if (items.length === 0) return;

      const isWaitlist = (meta && meta.bookingAction === "waitlist") || false;
      const statusStr = isWaitlist ? "Waitlisted" : "Reserved";
      const now = new Date();
      const todayStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

      const newBookingRecords = items.map((cls) => {
        const courseCode = cls._courseCode || (model ? (model.recommendedBookingLevel || model.level) : "") || "COURSE";
        const centreName = cls._centreName || (meta && meta.centreName) || ((SAPC.TEACHING_CENTRES || []).find((c) => c.key === cls._centreKey) || {}).shortName || "Teaching Centre";
        const startD = cls.startDate || "";
        const endD = cls.endDate || "";
        const termIdentity = cls.termText || (cls.termNum && cls.termNum < 900 ? `Term ${cls.termNum}` : "") || "";
        const sessionParts = [cls.year || now.getFullYear(), termIdentity, startD, endD].filter(Boolean);
        const sessionText = sessionParts.join(" ");

        return {
          courseCode: courseCode,
          courseDescription: cls.className,
          classTitle: courseCode,
          className: cls.className,
          teacherName: cls.teacherName || "",
          teachingCentre: centreName.toLowerCase().includes("centre") ? centreName : `${centreName} Teaching Centre`,
          session: sessionText,
          bookingSource: "Live Registration",
          bookingType: isWaitlist ? "Waiting List" : "Reservation",
          status: statusStr,
          bookingDate: todayStr,
          bookingTime: timeStr,
          start: startD,
          end: endD,
          isNewlyBooked: true,
          _isNew: true,
          bookedAtTimestamp: Date.now(),
        };
      });

      // 1. Instantly update current.bookings so the Booking History tab updates IMMEDIATELY!
      const existing = current.bookings || [];
      const updatedBookings = [...newBookingRecords, ...existing];
      const updatedCurrent = {
        ...current,
        bookings: updatedBookings,
        fetchedAt: new Date(),
      };

      setCurrent(updatedCurrent);
      setCache((prev) => ({ ...prev, [sId]: updatedCurrent }));

      // 2. Switch tab to Booking History
      setStudentTab("history");

      // 3. Trigger Toast Notification
      const classTitles = items.map((c) => (SAPC.formatClassTime12h ? SAPC.formatClassTime12h(c.className) : c.className)).join(", ");
      setToast({
        id: Date.now(),
        type: "success",
        title: "Done! Booking Confirmed",
        message: items.length > 1
          ? `Successfully booked ${items.length} terms in SAP for ${SAPC.formatStudentName(profile.fullName)}.`
          : `Reserved in SAP: ${classTitles}`,
        items: items,
      });

      // 4. Background re-sync with SAP: fetch authoritative updated booking list without blocking the UI
      setTimeout(async () => {
        try {
          const freshData = await Svc.openStudent({ ...profile, studentNumber: sId });
          if (freshData && freshData.bookings) {
            const bookedNames = new Set(items.map((it) => it.className));
            const mergedBookings = (freshData.bookings || []).map((b) => {
              if (bookedNames.has(b.className)) {
                return { ...b, isNewlyBooked: true, _isNew: true };
              }
              return b;
            });
            const mergedCurrent = {
              ...freshData,
              bookings: mergedBookings.length > 0 ? mergedBookings : updatedBookings,
            };
            setCache((prev) => ({ ...prev, [sId]: mergedCurrent }));
            setCurrent((curr) => {
              if (curr && curr.profile && String(curr.profile.studentId).padStart(10, "0") === sId) {
                return mergedCurrent;
              }
              return curr;
            });
          }
        } catch (e) {
          console.warn("Background history sync after booking completed with note:", e);
        }
      }, 600);
    }

    const ctx = { query, setQuery, runSearch, clear, loading, step, error, setError, results, current, model, pricing, inputRef, cache,
      pick: (r) => openRow(r), openSettings: () => setSettings(true),
      bookingOpen, onToggleBooking: () => setBookingOpen((v) => !v),
      onRebookCancelled: handleRebookCancelled,
      setPage,
      studentTab, setStudentTab };

    return html`<div className="h-full flex flex-col">
      <${Header} conn=${conn} onRefresh=${refreshSession} onSettings=${() => setSettings(true)} onOpenBooking=${() => setBookingOpen(true)} hasStudent=${Boolean(current && current.profile)} refreshing=${refreshing} syncStatus=${syncStatus} />
      <div className="flex flex-1 min-h-0">
        <${Sidebar} page=${page} setPage=${setPage} />
        <main className="page-enter flex-1 min-w-0 p-4 overflow-auto scroll-thin" style=${{ background: "var(--surface)" }}>
          ${page === "lookup" && html`<${LookupScreen} ctx=${ctx} />`}
          ${page === "pricing" && html`<${PricingScreen} model=${model} current=${current} pricing=${pricing} onBackToLookup=${() => setPage("lookup")} />`}
          ${page === "mapping" && html`<${MappingScreen} model=${model} current=${current} />`}
        </main>
      </div>
      ${bookingOpen && global.BookingModal && html`<${global.BookingModal}
        current=${current}
        model=${model}
        pricing=${pricing}
        initialClasses=${bookingInitialClasses}
        onClose=${() => { setBookingOpen(false); setBookingInitialClasses(null); }}
        onBookingCompleted=${(items, meta) => handleBookingCompleted(items, meta)}
      />`}
      ${settings && html`<${SettingsModal}
        onClose=${() => setSettings(false)}
        onSaved=${(connectedSession) => {
          setSettings(false);
          if (connectedSession) {
            setConn({ state: "connected", at: new Date() });
            setError(null);
          } else {
            Svc.reset();
            setConn({ state: "idle" });
            setError(null);
          }
        }} />`}
      ${toast && html`
        <div className="fixed bottom-6 right-6 z-[100] max-w-[440px] bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-[14px] shadow-2xl border border-emerald-500/40 flex items-start gap-3 toast-slide">
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center shrink-0 mt-0.5">
            <${Icon} name="check" size=${20} className="stroke-[2.5]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[14px] flex items-center gap-2">
              <span>${toast.title || "Done!"}</span>
              <span className="pill pill-green !text-[10px] !py-0 font-bold uppercase tracking-wider">Done ✓</span>
            </div>
            <div className="text-[12px] text-slate-300 mt-1 leading-snug">${toast.message}</div>
            ${toast.items && toast.items.length > 0 && html`
              <div className="mt-2 space-y-1">
                ${toast.items.map((it, idx) => html`
                  <div key=${idx} className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-medium truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                    <span className="truncate">${it.className}</span>
                    ${it.startDate && html`<span className="text-slate-400 text-[10px] num">(${it.startDate})</span>`}
                  </div>
                `)}
              </div>
            `}
          </div>
          <button type="button" onClick=${() => setToast(null)} className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors">
            <${Icon} name="x" size=${14} />
          </button>
        </div>
      `}
    </div>`;
  }

  ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
})(window);
