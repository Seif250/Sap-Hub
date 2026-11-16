// ============================================================================
// SAP Student Sales Copilot — Secondary Screens & Modals
// (PricingPanel, PricingScreen, MappingScreen, SettingsModal)
// ============================================================================
(function (global) {
  const React = global.React;
  const { useState } = React;
  const { html, Icon, egp, breakdown } = global.UIKit;
  const KB = global.BCKnowledgeBase;
  const SAPC = global.SAPClient;
  const Svc = global.SapService;
  const BANKS = KB.PRICING.supportedBanks || [];

  const Pill = ({ tone = "gray", children, icon }) =>
    html`<span className=${`pill pill-${tone}`}>${icon && html`<${Icon} name=${icon} size=${12} strokeWidth=${2.4} />`}${children}</span>`;

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

  global.AppScreens = {
    Toggle,
    PricingPanel,
    PricingScreen,
    PageTitle,
    MappingScreen,
    SettingsModal,
  };
})(window);