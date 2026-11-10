// ============================================================================
// Live Booking & Schedules — large popup window (modal)
// Uses SapService.searchAvailableClasses / searchAllBranchesSchedules / bookClassInSap
// ============================================================================
(function (global) {
  const React = global.React;
  const { useState, useEffect } = React;
  const { html, Icon } = global.UIKit;
  const SAPC = global.SAPClient;
  const Svc = global.SapService;

  const COURSE_OPTIONS = [
    { value: "EY", label: "Early Years (General • EY)" },
    { value: "EY2", label: "Early Years 2 (Ducks • 4y • EY2)" },
    { value: "EY3", label: "Early Years 3 (Owls • 5y • EY3)" },
    { value: "EY1", label: "Early Years 1 (3y • EY1)" },
    { value: "PStA", label: "Primary Starter A (PStA)" },
    { value: "PStB", label: "Primary Starter B (PStB)" },
    { value: "PP1", label: "Primary Plus 1 (PP1)" },
    { value: "PP2", label: "Primary Plus 2 (PP2)" },
    { value: "PP3", label: "Primary Plus 3 (PP3)" },
    { value: "PP4", label: "Primary Plus 4 (PP4)" },
    { value: "PP5", label: "Primary Plus 5 (PP5)" },
    { value: "PP6", label: "Primary Plus 6 (PP6)" },
    { value: "SA1", label: "Secondary Plus A1 (SA1)" },
    { value: "SA2", label: "Secondary Plus A2 (SA2)" },
    { value: "SB1.1", label: "Secondary Plus B1.1 (SB1.1)" },
    { value: "SB1.2", label: "Secondary Plus B1.2 (SB1.2)" },
    { value: "SB2.1", label: "Secondary Plus B2.1 (SB2.1)" },
    { value: "SB2.2", label: "Secondary Plus B2.2 (SB2.2)" },
    { value: "SC1.1", label: "Secondary Plus C1 (SC1.1)" },
    { value: "USA1", label: "Upper Secondary Plus A1 (USA1)" },
    { value: "USA2", label: "Upper Secondary Plus A2 (USA2)" },
    { value: "USB1.1", label: "Upper Secondary Plus B1.1 (USB1.1)" },
    { value: "USB1.2", label: "Upper Secondary Plus B1.2 (USB1.2)" },
    { value: "USB2.1", label: "Upper Secondary Plus B2.1 (USB2.1)" },
    { value: "USB2.2", label: "Upper Secondary Plus B2.2 (USB2.2)" },
    { value: "USC1", label: "Upper Secondary Plus C1 (USC1)" },
    { value: "AD Beg", label: "Adult Beginner (AD Beg)" },
    { value: "BCE", label: "British Council English (BCE)" },
    { value: "IELTS", label: "IELTS Preparation" },
  ];

  const EVENT_TYPES = [
    { value: "", label: "All BCE packages" },
    { value: "10L", label: "10 Credits (2 months)" },
    { value: "20L", label: "20 Credits (3 months)" },
    { value: "40L", label: "40 Credits (6 months)" },
    { value: "60L", label: "60 Credits (9 months)" },
  ];

  const matchBcePackage = (cls, pkgValue) => {
    if (!pkgValue) return true;
    const str = `${(cls && cls.className) || ""} ${(cls && cls.displayClassName) || ""} ${(cls && cls.eventType) || ""} ${(cls && cls.session) || ""}`;
    if (pkgValue === "10L" || pkgValue === "10" || pkgValue.includes("10L")) {
      return /\b10\s*L\b|\b10\s*Credits\b|\b10L\/2M\b/i.test(str);
    }
    if (pkgValue === "20L" || pkgValue === "20" || pkgValue.includes("20L")) {
      return /\b20\s*L\b|\b20\s*Credits\b|\b20L\/3M\b/i.test(str);
    }
    if (pkgValue === "40L" || pkgValue === "40" || pkgValue.includes("40L")) {
      return /\b40\s*L\b|\b40\s*Credits\b|\b40L\/6M\b/i.test(str);
    }
    if (pkgValue === "60L" || pkgValue === "60" || pkgValue.includes("60L")) {
      return /\b60\s*L\b|\b60\s*Credits\b|\b60L\/9M\b/i.test(str);
    }
    return str.toLowerCase().includes(pkgValue.toLowerCase());
  };

  const cleanName = (s) => String(s || "").trim();

  function BookingModal({ current, model, pricing, initialClasses = null, onClose, onBookingCompleted }) {
    const profile = current ? current.profile : null;
    const studentId = profile ? String(profile.studentId || "").padStart(10, "0") : "";
    const centres = SAPC.TEACHING_CENTRES || [];

    const recentCancelledInfo = React.useMemo(() => {
      return current && current.bookings && SAPC.findRecentCancelledBookings
        ? SAPC.findRecentCancelledBookings(current.bookings)
        : null;
    }, [current && current.bookings]);

    const detectDefaultCentreKey = () => {
      const tc = String((model && model.centre) || (profile && profile.teachingCentre) || "").toLowerCase();
      if (tc.includes("kls")) {
        const kls = centres.find((c) => c.code === "KLS");
        if (kls) return kls.key;
      }
      if (tc.includes("alex") || tc.includes("alx") || tc.includes("bsa")) {
        const alx = centres.find((c) => c.code === "ALX");
        if (alx) return alx.key;
      }
      const found = centres.find((c) => tc && (tc.includes(cleanName(c.shortName).toLowerCase()) || tc.includes(c.code.toLowerCase())));
      return found ? found.key : "05001351";
    };

    const [mode, setMode] = useState("single"); // 'single' | 'all'
    const [selectedCentreKey, setSelectedCentreKey] = useState(detectDefaultCentreKey);
    const [bookingAction, setBookingAction] = useState("reservation"); // 'reservation' | 'waitlist'
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [courseSuffix, setCourseSuffix] = useState("AD Beg");
    const [subLevelFilter, setSubLevelFilter] = useState("");
    const [eventTypeFilter, setEventTypeFilter] = useState("");
    const [quickFilter, setQuickFilter] = useState("");
    const [onlyAvailable, setOnlyAvailable] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: "startDate", dir: 1 }); // dir: 1 = asc, -1 = desc
    const [selectedTerms, setSelectedTerms] = useState([]); // array of integers e.g. [2, 3]; empty = all
    const [use12Hour, setUse12Hour] = useState(() => {
      try {
        return localStorage.getItem("sap_hub_time_format") !== "24h";
      } catch (_) {
        return true;
      }
    });

    const toggleTimeFormat = (to12h) => {
      const next = typeof to12h === "boolean" ? to12h : !use12Hour;
      setUse12Hour(next);
      try {
        localStorage.setItem("sap_hub_time_format", next ? "12h" : "24h");
      } catch (_) {}
    };

    const toggleTerm = (tNum) => {
      setSelectedTerms((prev) => {
        if (prev.includes(tNum)) {
          return prev.filter((x) => x !== tNum);
        } else {
          return [...prev, tNum].sort((a, b) => a - b);
        }
      });
    };

    const clearTerms = () => setSelectedTerms([]);

    const toggleSort = (key) => {
      setSortConfig((prev) => ({
        key,
        dir: prev.key === key ? -prev.dir : key === "seats" ? -1 : 1,
      }));
    };

    const [loading, setLoading] = useState(false);
    const [stepMsg, setStepMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [classesList, setClassesList] = useState([]);
    const [searched, setSearched] = useState(false);
    const [branchResultsMap, setBranchResultsMap] = useState({});
    const [bookingBusyId, setBookingBusyId] = useState(null);
    const [bookingResult, setBookingResult] = useState(null);
    const [confirmClasses, setConfirmClasses] = useState(null); // array of classes to confirm & book
    const [cartClasses, setCartClasses] = useState([]); // multi-term cart selection
    const [guardianKey, setGuardianKey] = useState("");
    const [collectorStartDate, setCollectorStartDate] = useState("");
    const [collectorEndDate, setCollectorEndDate] = useState("");

    const handleCloseModal = () => {
      if (bookingBusyId) return;
      if (Svc.releaseRegistrationSession) {
        Svc.releaseRegistrationSession();
      }
      onClose && onClose();
    };

    // Release SAP Registration session on unmount so EZ_COURSE_REG is never left locked
    useEffect(() => {
      return () => {
        if (Svc.releaseRegistrationSession) {
          Svc.releaseRegistrationSession();
        }
      };
    }, []);

    const getCartKey = (cls) =>
      `${(cls && cls._centreKey) || selectedCentreKey}_${(cls && cls.className) || ""}_${(cls && cls.startDate) || ""}`;

    const getCartTermIdentity = (c) => {
      if (!c) return "";
      if (c.termText) return String(c.termText).trim().toUpperCase();
      if (c.termNum !== undefined && c.termNum !== null && c.termNum < 900) return `T${c.termNum}`;
      const combined = `${c.className || ""} ${c.session || ""}`;
      const tm = combined.match(/\b(?:Term\s*|T)(\d{1,2})\b/i);
      if (tm) return `T${parseInt(tm[1], 10)}`;
      const sm = combined.match(/\b(?:SC|Summer\s*(?:Camp\s*)?)(\d{1,2})\b/i);
      if (sm) return `SC${parseInt(sm[1], 10)}`;
      if (c.session && String(c.session).trim()) return String(c.session).trim().toUpperCase();
      return "";
    };

    const isInCart = (cls) => cartClasses.some((c) => getCartKey(c) === getCartKey(cls));

    const isSameTermInCart = (cls) => {
      if (isInCart(cls)) return false;
      const tId = getCartTermIdentity(cls);
      if (!tId) return false;
      return cartClasses.some((cc) => getCartTermIdentity(cc) === tId);
    };

    const toggleCartClass = (cls) => {
      const k = getCartKey(cls);
      setCartClasses((prev) => {
        if (prev.some((c) => getCartKey(c) === k)) {
          return prev.filter((c) => getCartKey(c) !== k);
        }
        const tId = getCartTermIdentity(cls);
        if (tId && prev.some((c) => getCartTermIdentity(c) === tId)) {
          return prev;
        }
        const next = [...prev, cls];
        next.sort((a, b) => {
          const da = a.startDateNum || (SAPC.parseSapDateToNum ? SAPC.parseSapDateToNum(a.startDate) : 0);
          const db = b.startDateNum || (SAPC.parseSapDateToNum ? SAPC.parseSapDateToNum(b.startDate) : 0);
          return da - db;
        });
        return next;
      });
    };

    const removeFromCart = (cls) => {
      const k = getCartKey(cls);
      setCartClasses((prev) => prev.filter((c) => getCartKey(c) !== k));
    };

    const clearCart = () => setCartClasses([]);

    const getValidGuardians = () =>
      ((Svc.getCachedGuardians && Svc.getCachedGuardians(studentId)) || []).filter(
        (g) => g && g.key && !/^(?:0500|1000)\d*$/.test(g.key)
      );

    const openConfirmModal = (clsOrList) => {
      const list = (Array.isArray(clsOrList) ? clsOrList : [clsOrList]).filter(Boolean);
      if (list.length === 0) return;
      const sorted = list.slice().sort((a, b) => {
        const da = a.startDateNum || (SAPC.parseSapDateToNum ? SAPC.parseSapDateToNum(a.startDate) : 0);
        const db = b.startDateNum || (SAPC.parseSapDateToNum ? SAPC.parseSapDateToNum(b.startDate) : 0);
        return da - db;
      });
      const earliestCls = sorted[0];
      const latestCls = sorted[sorted.length - 1];
      const startD = earliestCls.startDate || "";
      const endD = (SAPC.addOneYearToSapDate && SAPC.addOneYearToSapDate(startD)) || latestCls.endDate || "";
      setCollectorStartDate(startD);
      setCollectorEndDate(endD);
      const gList = getValidGuardians();
      if (gList.length > 0 && (!guardianKey || !gList.some((g) => g.key === guardianKey))) {
        setGuardianKey(gList[0].key);
      } else if (gList.length === 0) {
        setGuardianKey("");
      }
      setConfirmClasses(sorted);
    };

    // Close on Escape
    useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape" && !bookingBusyId) handleCloseModal(); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [bookingBusyId]);

    function handleCourseChange(val) {
      setCourseSuffix(val);
      if (val === "EY2" && (!subLevelFilter || subLevelFilter === "Owls")) {
        setSubLevelFilter("Ducks");
      } else if (val === "EY3" && (!subLevelFilter || subLevelFilter === "Ducks")) {
        setSubLevelFilter("Owls");
      } else if (val === "EY" && (subLevelFilter === "Ducks" || subLevelFilter === "Owls")) {
        setSubLevelFilter("");
      }
    }

    // Auto-fill course + sub-level from the student's recommended level
    useEffect(() => {
      if (!profile || !model) return;
      const defaultKey = detectDefaultCentreKey();
      setSelectedCentreKey(defaultKey);
      const cObj = centres.find((c) => c.key === defaultKey) || centres[0];
      const targetBookingLvl = model.recommendedBookingLevel || model.level;
      const resolved = SAPC.resolveSapCourseForLevel(cObj ? cObj.code : "AGU", targetBookingLvl, model.isAdult) || {};
      const fallbackSuffix = model.isAdult
        ? "BCE"
        : (model.isEarlyYears
          ? (model.age && (model.age.academicYears >= 5 || model.age.years >= 5) ? "EY3" : "EY2")
          : "PP1");
      setCourseSuffix(resolved.courseSuffix || fallbackSuffix);
      setSubLevelFilter(resolved.subLevelFilter || (model.isEarlyYears ? (fallbackSuffix === "EY3" ? "Owls" : "Ducks") : ""));
      if (pricing && String(pricing.adultCourseId || "").toLowerCase() === "bce") {
        const cr = Number(pricing.credits) || 20;
        setEventTypeFilter({ 10: "10L", 20: "20L", 40: "40L", 60: "60L" }[cr] || "");
      } else {
        setEventTypeFilter("");
      }
      setClassesList([]);
      setSelectedTerms([]);
      setCartClasses([]);
      setSearched(false);
      setBranchResultsMap({});
      setErrorMsg("");
      setBookingResult(null);
      setGuardianKey("");
    }, [studentId, model && model.level, model && model.recommendedBookingLevel]);

    // Stage & open confirmation automatically if initialClasses (e.g. Re-book Cancelled) are passed
    useEffect(() => {
      if (initialClasses && initialClasses.length > 0) {
        const first = initialClasses[0];
        if (first._centreKey) setSelectedCentreKey(first._centreKey);
        if (first._courseCode) {
          const suffix = first._courseCode.replace(/^[^-]+-/, "");
          setCourseSuffix(suffix);
        }
        const itemY = first.year || (first.startDate && first.startDate.match(/\b(20\d{2})\b/)?.[1]);
        if (itemY) setYear(itemY);
        setSubLevelFilter("");
        setCartClasses(initialClasses);
        openConfirmModal(initialClasses);
      }
    }, [initialClasses]);

    const activeCentre = centres.find((c) => c.key === selectedCentreKey) || centres[0];
    const fullCourseCode = `${activeCentre ? activeCentre.code : "AGU"}-${courseSuffix}`;

    async function fetchSingleBranch(targetCentreKey = selectedCentreKey) {
      if (!studentId || loading) return;
      setMode("single");
      setSelectedCentreKey(targetCentreKey);
      setLoading(true);
      setErrorMsg("");
      setBookingResult(null);
      setSearched(true);
      const cObj = centres.find((c) => c.key === targetCentreKey) || centres[0];
      try {
        const res = await Svc.searchAvailableClasses({
          studentId,
          centreKey: targetCentreKey,
          courseCode: `${cObj.code}-${courseSuffix}`,
          year,
          eventType: "", // BCE packages filtered client-side by class name
          subLevelFilter,
          bookingAction,
          onStep: (msg) => setStepMsg(msg),
        });
        const list = (res.classes || []).map((c) => ({ ...c, _centreKey: cObj.key, _centreName: cleanName(cObj.shortName), _courseCode: `${cObj.code}-${courseSuffix}` }));
        setClassesList(list);
        setBranchResultsMap((prev) => ({ ...prev, [cObj.key]: { classes: list } }));
      } catch (err) {
        setErrorMsg(err.message || "Could not load schedules from SAP.");
      } finally {
        setLoading(false);
        setStepMsg("");
      }
    }

    async function fetchAllBranches() {
      if (!studentId || loading) return;
      setMode("all");
      setLoading(true);
      setErrorMsg("");
      setBookingResult(null);
      setBranchResultsMap({});
      setClassesList([]);
      setSearched(true);
      const tag = (bRes) => (bRes.classes || []).map((c) => ({
        ...c, _centreKey: bRes.centre.key, _centreName: cleanName(bRes.centre.shortName), _courseCode: bRes.courseCode,
      }));
      try {
        const allRes = await Svc.searchAllBranchesSchedules({
          studentId,
          levelStr: courseSuffix || (model ? (model.recommendedBookingLevel || model.level) : ""),
          isAdult: model ? model.isAdult : true,
          year,
          eventType: "", // BCE packages filtered client-side by class name
          subLevelFilter,
          onStep: (msg) => setStepMsg(msg),
          onBranchResult: (centreKey, bRes) => {
            if (!bRes || !bRes.centre) return;
            setBranchResultsMap((prev) => ({ ...prev, [centreKey]: bRes }));
            setClassesList((prev) => [...prev.filter((x) => x._centreKey !== centreKey), ...tag(bRes)]);
          },
        });
        const merged = [];
        Object.values(allRes || {}).forEach((bRes) => {
          if (bRes && bRes.centre) merged.push(...tag(bRes));
        });
        setClassesList(merged);
      } catch (err) {
        setErrorMsg(err.message || "Could not load schedules for all branches.");
      } finally {
        setLoading(false);
        setStepMsg("");
      }
    }

    async function bookClasses(clsOrList) {
      const items = (Array.isArray(clsOrList) ? clsOrList : [clsOrList]).filter(Boolean);
      setConfirmClasses(null);
      if (!studentId || bookingBusyId || items.length === 0) return;
      const firstCls = items[0];
      let targetCentreKey = firstCls._centreKey || selectedCentreKey;
      if (/\b(BSA|ALX)\b/i.test(firstCls.className || "") && !targetCentreKey.startsWith("05001354")) {
        const alx = centres.find((c) => c.code === "ALX");
        if (alx) targetCentreKey = alx.key;
      }
      const cObj = centres.find((c) => c.key === targetCentreKey) || activeCentre;
      const classYear = firstCls.year || (firstCls.startDate && firstCls.startDate.match(/\b(20\d{2})\b/)?.[1]) || year;
      const itemKey = items.length > 1 ? "CART_BULK" : `${targetCentreKey}_${firstCls.rowIndex}_${firstCls.className}`;
      setBookingBusyId(itemKey);
      setBookingResult(null);
      setErrorMsg("");
      try {
        const res = await Svc.bookClassInSap({
          studentId,
          centreKey: targetCentreKey,
          courseCode: firstCls._courseCode || `${cObj.code}-${courseSuffix}`,
          year: classYear,
          eventType: "",
          subLevelFilter,
          classItem: firstCls,
          classItems: items,
          bookingAction,
          isAdult: model ? model.isAdult : true,
          guardianKey,
          collectorStartDate: collectorStartDate || firstCls.startDate,
          collectorEndDate: collectorEndDate || (SAPC.addOneYearToSapDate && SAPC.addOneYearToSapDate(firstCls.startDate)) || firstCls.endDate,
          onStep: (msg) => setStepMsg(msg),
        });
        if (res.ok) {
          const bookedKeys = new Set(items.map((c) => getCartKey(c)));
          setCartClasses((prev) => prev.filter((c) => !bookedKeys.has(getCartKey(c))));
          onBookingCompleted && onBookingCompleted(items, {
            bookingAction,
            centreName: cleanName(cObj && cObj.shortName),
            courseSuffix,
            messages: res.messages || [],
          });
        }
        setBookingResult({
          ok: res.ok,
          bookingAction,
          className: firstCls.className,
          bookedClasses: items,
          centreName: cleanName(cObj && cObj.shortName),
          messages: res.messages || [],
        });
      } catch (err) {
        setBookingResult({
          ok: false,
          className: firstCls.className,
          bookedClasses: items,
          centreName: cleanName(cObj && cObj.shortName),
          messages: [{ type: "ERROR", text: err.message || "Booking failed in SAP." }],
        });
      } finally {
        setBookingBusyId(null);
        setStepMsg("");
      }
    }

    const fmt12 = (s) => (SAPC.formatClassTime12h ? SAPC.formatClassTime12h(s) : String(s || ""));
    const fmt24 = (s) => String(s || "").replace(/([A-Za-z])(\d{1,2}:\d{2})/g, "$1 $2");
    const fmtClass = (clsOrStr) => {
      if (!clsOrStr) return "";
      if (typeof clsOrStr === "string") return use12Hour ? fmt12(clsOrStr) : fmt24(clsOrStr);
      return use12Hour
        ? clsOrStr.displayClassName || fmt12(clsOrStr.className)
        : clsOrStr.displayClassName24h || fmt24(clsOrStr.className);
    };
    const dateNum = (s) => (SAPC.parseSapDateToNum ? SAPC.parseSapDateToNum(s) : 0);
    const getTermNum = (c) => {
      if (c && c.termNum !== undefined && c.termNum !== null && c.termNum < 900) return c.termNum;
      const combined = `${(c && c.className) || ""} ${(c && c.session) || ""}`;
      const m = combined.match(/\b(?:Term\s*|T)(\d{1,2})\b/i);
      return m ? parseInt(m[1], 10) : 999;
    };
    const getTermText = (c) => {
      if (c && c.termText) return c.termText;
      const tn = getTermNum(c);
      return tn < 900 ? `T${tn}` : "";
    };

    // Dynamic term list (at least up to Term 11, or max found in data)
    const maxFoundTerm = classesList.reduce((m, c) => Math.max(m, (c && c.termNum && c.termNum < 99) ? c.termNum : 0), 0);
    const termListMax = Math.max(11, maxFoundTerm);
    const termList = Array.from({ length: termListMax }, (_, i) => i + 1);

    // Filter classes matching the package if BCE for term counting
    const classesForTerms = courseSuffix === "BCE" && eventTypeFilter
      ? classesList.filter((c) => matchBcePackage(c, eventTypeFilter))
      : classesList;

    const termCounts = {};
    classesForTerms.forEach((c) => {
      const t = getTermNum(c);
      if (t && t <= termListMax) {
        termCounts[t] = (termCounts[t] || 0) + 1;
      }
    });

    const filtered = classesList
      .filter((c) => {
        if (courseSuffix === "BCE" && eventTypeFilter && !matchBcePackage(c, eventTypeFilter)) {
          return false;
        }
        if (selectedTerms.length > 0) {
          const tn = getTermNum(c);
          if (!selectedTerms.includes(tn)) return false;
        }
        if (onlyAvailable && c.remainingCapacityNum !== null && c.remainingCapacityNum !== undefined && c.remainingCapacityNum <= 0) return false;
        if (!quickFilter.trim()) return true;
        const q = quickFilter.toLowerCase();
        const disp = c.displayClassName || fmt12(c.className);
        return `${c.className} ${disp} ${c.startDate} ${c.endDate} ${c.location} ${c.academicLevel} ${c.eventType} ${c.session} ${c._centreName}`.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => {
        if (sortConfig.key === "default") return 0;
        const dir = sortConfig.dir || 1;
        if (sortConfig.key === "term") {
          const tA = getTermNum(a);
          const tB = getTermNum(b);
          if (tA !== tB) return (tA - tB) * dir;
          const da = a.startDateNum || dateNum(a.startDate);
          const db = b.startDateNum || dateNum(b.startDate);
          if (da !== db) return da - db;
          const ta = a.startMinutes !== undefined ? a.startMinutes : 9999;
          const tb = b.startMinutes !== undefined ? b.startMinutes : 9999;
          return ta - tb;
        }
        if (sortConfig.key === "startDate") {
          const da = a.startDateNum || dateNum(a.startDate);
          const db = b.startDateNum || dateNum(b.startDate);
          if (da !== db) return (da - db) * dir;
          const ta = a.startMinutes !== undefined ? a.startMinutes : 9999;
          const tb = b.startMinutes !== undefined ? b.startMinutes : 9999;
          return (ta - tb) * dir;
        }
        if (sortConfig.key === "endDate") {
          const da = a.endDateNum || dateNum(a.endDate);
          const db = b.endDateNum || dateNum(b.endDate);
          if (da !== db) return (da - db) * dir;
          const ta = a.startMinutes !== undefined ? a.startMinutes : 9999;
          const tb = b.startMinutes !== undefined ? b.startMinutes : 9999;
          return (ta - tb) * dir;
        }
        if (sortConfig.key === "time") {
          const ta = a.startMinutes !== undefined ? a.startMinutes : 9999;
          const tb = b.startMinutes !== undefined ? b.startMinutes : 9999;
          if (ta !== tb) return (ta - tb) * dir;
          const da = a.startDateNum || dateNum(a.startDate);
          const db = b.startDateNum || dateNum(b.startDate);
          return da - db;
        }
        if (sortConfig.key === "seats") {
          const sa = a.remainingCapacityNum !== null && a.remainingCapacityNum !== undefined ? a.remainingCapacityNum : -1;
          const sb = b.remainingCapacityNum !== null && b.remainingCapacityNum !== undefined ? b.remainingCapacityNum : -1;
          return (sa - sb) * dir;
        }
        if (sortConfig.key === "branch") {
          return String(a._centreName || a.location || "").localeCompare(String(b._centreName || b.location || "")) * dir;
        }
        if (sortConfig.key === "className") {
          return String(fmtClass(a)).localeCompare(String(fmtClass(b))) * dir;
        }
        return 0;
      });

    const sortHeader = (key, title, alignRight = false) => {
      const active = sortConfig.key === key;
      const arrow = active ? (sortConfig.dir === 1 ? "↑" : "↓") : "↕";
      return html`<th
        onClick=${() => toggleSort(key)}
        className=${`cursor-pointer select-none hover:bg-slate-100 transition-colors ${alignRight ? "text-right" : ""}`}
        title=${`Sort by ${title}`}
      >
        <span className="inline-flex items-center gap-1">
          <span>${title}</span>
          <span className=${`text-[11px] font-bold ${active ? "text-blue-600" : "text-slate-400"}`}>${arrow}</span>
        </span>
      </th>`;
    };

    const seatPill = (c) => {
      const rem = c.remainingCapacityNum;
      if (rem === null || rem === undefined) return html`<span className="pill pill-gray !text-[10px] !py-0 !px-1.5">${c.remainingCapacity || "—"}</span>`;
      if (rem <= 0) return html`<span className="pill pill-red !text-[10px] !py-0 !px-1.5 font-semibold">Full</span>`;
      if (rem <= 3) return html`<span className="pill pill-amber !text-[10px] !py-0 !px-1.5 font-semibold">${rem} left</span>`;
      return html`<span className="pill pill-green !text-[10px] !py-0 !px-1.5 font-semibold">${rem} seats</span>`;
    };

    const label = (t) => html`<div className="label !text-[10.5px] mb-1 font-semibold text-slate-500">${t}</div>`;

    return html`<div className="fixed inset-0 z-50 flex items-center justify-center p-3" style=${{ background: "rgba(15,23,42,0.55)" }}
        onMouseDown=${(e) => { if (e.target === e.currentTarget && !bookingBusyId) handleCloseModal(); }}>
      <div className="bg-white rounded-[12px] shadow-2xl flex flex-col overflow-hidden" style=${{ width: "min(1320px, 97vw)", height: "min(880px, 94vh)" }}>

        <!-- Header -->
        <div className="px-4 py-2 flex items-center justify-between shrink-0" style=${{ background: "var(--bc-navy)", color: "#fff" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/15 grid place-items-center shrink-0"><${Icon} name="calendar" size=${16} /></div>
            <div className="min-w-0">
              <div className="font-semibold text-[14px] flex items-center gap-2 flex-wrap">
                <span>Course Schedules & Registration</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/15 font-mono">SAP Live</span>
                ${model && model.progression && model.progression.recommendedLevelToBook && html`
                  <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-100 font-bold">
                    ${model.progression.isUpgradeReadyNow ? "★ Upgraded → " : "Next Booking: "}${model.progression.recommendedLevelToBook}${model.progression.recommendedTermToBook ? ` (${model.progression.recommendedTermToBook})` : ""}
                  </span>
                `}
              </div>
              <div className="text-[11.5px] text-blue-100 truncate">
                ${profile ? `${SAPC.formatStudentName(profile.fullName)} · ID ${studentId}` : "No student selected"}
                ${model && model.level ? ` · Recommended level: ${model.level}` : ""}
                ${model && model.centre ? ` · Centre: ${model.centre}` : ""}
              </div>
            </div>
          </div>
          <button type="button" onClick=${handleCloseModal} disabled=${!!bookingBusyId} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center" title="Close (Esc)">
            <${Icon} name="x" size=${15} />
          </button>
        </div>

        ${!profile ? html`
          <div className="flex-1 grid place-items-center text-center muted p-8">
            <div className="space-y-2 max-w-[340px]">
              <${Icon} name="search" size=${28} className="mx-auto" />
              <div className="font-semibold text-slate-700">Look up a student first</div>
              <div className="text-[12.5px]">Once a student is selected, their recommended level and the available classes across all branches will appear here.</div>
            </div>
          </div>
        ` : html`
          <div className="flex-1 min-h-0 flex">

            <!-- Left: filters (compact 260px) -->
            <div className="w-[260px] shrink-0 border-r p-3 space-y-3 overflow-auto scroll-thin bg-slate-50" style=${{ borderColor: "var(--line)" }}>
              <div>
                ${label("Booking type")}
                <div className="grid grid-cols-2 gap-1">
                  ${[["reservation", "Reservation"], ["waitlist", "Waitlist"]].map(([k, l]) => html`
                    <button key=${k} type="button" onClick=${() => setBookingAction(k)}
                      className=${`seg !py-1 text-[11.5px] ${bookingAction === k ? "active" : ""}`}>${l}</button>`)}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">${label("Branch")}<span className="text-[10px] muted font-mono">${fullCourseCode}</span></div>
                <div className="grid grid-cols-2 gap-1">
                  ${centres.map((c) => {
                    const isSel = mode === "single" && selectedCentreKey === c.key;
                    const info = branchResultsMap[c.key];
                    return html`<button key=${c.key} type="button" disabled=${loading} onClick=${() => fetchSingleBranch(c.key)}
                      className=${`px-2 py-1.5 rounded-[6px] text-[11.5px] border text-left flex items-center justify-between gap-1 transition-all ${
                        (c.code === "AIS" || c.code === "NCA") ? "col-span-2" : ""
                      } ${isSel ? "bg-blue-600 text-white border-blue-600 font-semibold" : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"}`}>
                      <span className="truncate">${cleanName(c.shortName)}</span>
                      <span className=${`text-[9.5px] px-1 rounded font-mono ${isSel ? "bg-white/20" : info && info.classes && info.classes.length ? "bg-green-100 text-green-800" : "text-slate-400"}`}>
                        ${info ? (info.classes ? info.classes.length : 0) : c.code}
                      </span>
                    </button>`;
                  })}
                </div>
                <button type="button" disabled=${loading} onClick=${fetchAllBranches}
                  className=${`btn w-full justify-center mt-1.5 !h-7 text-[11.5px] font-semibold ${mode === "all" ? "btn-primary" : ""}`}>
                  <${Icon} name="building" size=${13} /> Search all branches
                </button>
              </div>

              <div>
                ${label("Course")}
                <select className="input !h-7 text-[11.5px]" value=${courseSuffix} onChange=${(e) => handleCourseChange(e.target.value)}>
                  ${(model && model.isAdult
                    ? COURSE_OPTIONS.filter((o) => ["AD Beg", "BCE", "IELTS"].includes(o.value))
                    : COURSE_OPTIONS
                  ).map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
                </select>
              </div>

              ${courseSuffix === "BCE" && html`<div>
                ${label("Package (event type)")}
                <select className="input !h-7 text-[11.5px]" value=${eventTypeFilter} onChange=${(e) => setEventTypeFilter(e.target.value)}>
                  ${EVENT_TYPES.map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
                </select>
              </div>`}

              <div className="grid grid-cols-[1fr_80px] gap-1.5">
                <div>
                  ${label("Class description filter")}
                  <input className="input !h-7 text-[11.5px]" placeholder="e.g. Ducks, Owls, Beg B" value=${subLevelFilter} onChange=${(e) => setSubLevelFilter(e.target.value)} />
                </div>
                <div>
                  ${label("Year")}
                  <input className="input !h-7 text-[11.5px] num" value=${year} onChange=${(e) => setYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))} />
                </div>
              </div>

              <button type="button" disabled=${loading} onClick=${() => fetchSingleBranch(selectedCentreKey)} className="btn btn-primary w-full justify-center !h-8 font-semibold text-[12px]">
                <${Icon} name=${loading ? "refresh" : "search"} size=${14} className=${loading ? "animate-spin" : ""} />
                ${loading ? "Searching…" : `Search ${activeCentre ? cleanName(activeCentre.shortName) : ""}`}
              </button>

              <div className="text-[10.5px] muted leading-relaxed flex gap-1.5 pt-1">
                <${Icon} name="info" size=${12} className="mt-0.5 shrink-0" />
                <span>Classes loaded live from SAP registration (ZHER_WA_REGISTRATION).</span>
              </div>
            </div>

            <!-- Right: results -->
            <div className="flex-1 min-w-0 flex flex-col">
              <!-- Top Toolbar (compact) -->
              <div className="px-3 py-2 border-b flex items-center gap-2 flex-wrap" style=${{ borderColor: "var(--line)" }}>
                <div className="relative flex-1 min-w-[180px]">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 muted"><${Icon} name="search" size=${13} /></span>
                  <input className="input !h-7 pl-7 text-[11.5px]" placeholder="Quick filter by days, time, branch, level…"
                    value=${quickFilter} onChange=${(e) => setQuickFilter(e.target.value)} />
                </div>
                <div className="flex items-center gap-1 text-[11.5px] shrink-0">
                  <span className="muted text-[11px]">Sort:</span>
                  <select
                    className="input !h-7 !w-auto !px-2 text-[11.5px] font-medium"
                    value=${`${sortConfig.key}:${sortConfig.dir}`}
                    onChange=${(e) => {
                      const [k, d] = e.target.value.split(":");
                      setSortConfig({ key: k, dir: parseInt(d, 10) || 1 });
                    }}
                  >
                    <option value="startDate:1">Start Date: Earliest first (↑)</option>
                    <option value="startDate:-1">Start Date: Latest first (↓)</option>
                    <option value="term:1">Term: T1 → T2 → T3 (↑)</option>
                    <option value="term:-1">Term: T3 → T2 → T1 (↓)</option>
                    <option value="time:1">Time: Morning → Evening (↑)</option>
                    <option value="time:-1">Time: Evening → Morning (↓)</option>
                    <option value="endDate:1">End Date: Earliest (↑)</option>
                    <option value="endDate:-1">End Date: Latest (↓)</option>
                    <option value="seats:-1">Available Seats (↓)</option>
                    <option value="branch:1">Branch: A → Z (↑)</option>
                    <option value="default:1">SAP Default Order</option>
                  </select>
                </div>
                <div className="inline-flex rounded-[6px] border bg-slate-100 p-0.5 shrink-0" style=${{ borderColor: "var(--line)" }} title="Switch between 12-hour (AM/PM) and 24-hour time format">
                  <button
                    type="button"
                    onClick=${() => toggleTimeFormat(true)}
                    className=${`px-1.5 py-0.5 rounded-[5px] text-[11px] font-semibold transition-all ${use12Hour ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    12h
                  </button>
                  <button
                    type="button"
                    onClick=${() => toggleTimeFormat(false)}
                    className=${`px-1.5 py-0.5 rounded-[5px] text-[11px] font-semibold transition-all ${!use12Hour ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    24h
                  </button>
                </div>
                <label className="flex items-center gap-1 text-[11.5px] cursor-pointer whitespace-nowrap select-none">
                  <input type="checkbox" className="accent-[#0b4fd1]" checked=${onlyAvailable} onChange=${(e) => setOnlyAvailable(e.target.checked)} />
                  Available only
                </label>
                <span className="text-[11px] muted whitespace-nowrap ml-auto">
                  <b>${filtered.length}</b> ${filtered.length === 1 ? "class" : "classes"}
                  ${classesList.length !== filtered.length ? ` (of ${classesList.length})` : ""}
                </span>
              </div>

              <!-- Term Filter Bar (Dynamic T1..T11, multi-select) -->
              <div className="px-3 py-1.5 bg-slate-50/90 border-b flex items-center gap-1 flex-wrap text-[11px]" style=${{ borderColor: "var(--line)" }}>
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mr-1">Terms:</span>
                <button
                  type="button"
                  onClick=${clearTerms}
                  className=${`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all border ${
                    selectedTerms.length === 0
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  All Terms
                </button>
                ${termList.map((t) => {
                  const isSel = selectedTerms.includes(t);
                  const count = termCounts[t] || 0;
                  const hasClasses = classesList.length > 0;
                  return html`<button
                    key=${t}
                    type="button"
                    onClick=${() => toggleTerm(t)}
                    className=${`px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all border inline-flex items-center gap-1 ${
                      isSel
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : hasClasses && count === 0
                          ? "bg-white/50 text-slate-400 border-slate-200 hover:border-slate-300"
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                    title=${`Filter by T${t}${hasClasses ? ` (${count} classes)` : ""}`}
                  >
                    <span>T${t}</span>
                    ${hasClasses && count > 0 && html`<span className=${`text-[9.5px] px-1 rounded-full font-mono ${isSel ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"}`}>${count}</span>`}
                  </button>`;
                })}
                ${selectedTerms.length > 0 && html`
                  <button
                    type="button"
                    onClick=${clearTerms}
                    className="text-[10.5px] text-blue-600 hover:underline ml-1 font-semibold"
                  >
                    Clear (${selectedTerms.map((t) => `T${t}`).join(", ")})
                  </button>
                `}
              </div>

              ${cartClasses.length === 0 && recentCancelledInfo && recentCancelledInfo.count > 0 && html`
                <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2 text-[11.5px] text-amber-950">
                  <div className="flex items-center gap-1.5 truncate">
                    <${Icon} name="clock" size=${13} className="text-amber-600 shrink-0" />
                    <span className="font-semibold">Cancelled reservation from history (${recentCancelledInfo.count}):</span>
                    <span className="truncate text-slate-700">${recentCancelledInfo.latestBatch.map((c) => fmtClass(c.className)).join(", ")}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary !h-6 !px-2.5 text-[11px] font-bold !bg-amber-600 hover:!bg-amber-700 !border-amber-600 whitespace-nowrap shadow-2xs shrink-0"
                    onClick=${() => {
                      const cItems = recentCancelledInfo.latestBatch.map((b) => SAPC.cancelledBookingToClassItem(b));
                      setCartClasses(cItems);
                      openConfirmModal(cItems);
                    }}
                  >
                    <${Icon} name="bolt" size=${11} />
                    <span>Re-book ${recentCancelledInfo.count > 1 ? `All (${recentCancelledInfo.count})` : "Slot"}</span>
                  </button>
                </div>
              `}

              ${cartClasses.length > 0 && html`
                <div className="px-3 py-2 bg-emerald-50/90 border-b border-emerald-200 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold shrink-0">
                      <${Icon} name="check" size=${12} />
                      <span>${cartClasses.length} ${cartClasses.length === 1 ? "Term" : "Terms"} in Cart</span>
                    </span>
                    ${cartClasses.length >= 2 && html`
                      <span className="pill pill-green !text-[10px] !py-0 !px-1.5 font-bold shrink-0">Bundle (${cartClasses.length} Terms)</span>
                    `}
                    <div className="flex items-center gap-1 flex-wrap min-w-0">
                      ${cartClasses.map((cc, idx) => {
                        const tBadge = getTermText(cc);
                        return html`<span
                          key=${getCartKey(cc) + "_" + idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-white border border-emerald-300 text-slate-800 text-[11px] shadow-2xs"
                          title=${cc.className}
                        >
                          ${tBadge && html`<span className="font-mono font-bold text-amber-700 bg-amber-100 px-1 rounded text-[10px]">${tBadge}</span>`}
                          <span className="font-semibold truncate max-w-[210px]">${fmtClass(cc)}</span>
                          <span className="text-[10px] text-slate-500 num">(${cc.startDate || ""})</span>
                          <button
                            type="button"
                            onClick=${() => removeFromCart(cc)}
                            className="text-slate-400 hover:text-red-600 ml-0.5"
                            title="Remove from cart"
                          >
                            <${Icon} name="x" size=${11} />
                          </button>
                        </span>`;
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled=${!!bookingBusyId || loading}
                      onClick=${clearCart}
                      className="btn !h-7 !px-2.5 text-[11px] text-slate-600 bg-white hover:bg-slate-100"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled=${!!bookingBusyId || loading}
                      onClick=${() => openConfirmModal(cartClasses)}
                      className="btn btn-primary !h-7 !px-3 text-[11.5px] font-bold !bg-emerald-600 hover:!bg-emerald-700 !border-emerald-600 shadow-xs"
                    >
                      ${bookingBusyId === "CART_BULK"
                        ? html`<${Icon} name="refresh" size=${13} className="animate-spin" />Booking ${cartClasses.length} Terms…`
                        : html`<${Icon} name="check" size=${13} />Book Selected (${cartClasses.length})`}
                    </button>
                  </div>
                </div>
              `}

              ${(loading || stepMsg) && html`
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-900 text-[12px] flex items-center gap-2">
                  <${Icon} name="refresh" size=${14} className="animate-spin" />
                  <span className="truncate">${stepMsg || "Connecting to SAP…"}</span>
                </div>`}

              ${model && model.hasPrebookedPT && html`
                <div className="mx-4 mt-2.5 p-2 rounded-[8px] bg-amber-50 border border-amber-300 text-amber-950 text-[11.5px] flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <${Icon} name="alert" size=${14} className="text-amber-600 shrink-0" />
                    <span><b>Placement Test Prebooked:</b> ${(model.prebookedPT && (model.prebookedPT.courseDescription || model.prebookedPT.className)) || "Online/Phone Consultation"} محجوز وبانتظار الدفع (200 EGP) — الليفل هيتحدد بعد الدفع.</span>
                  </span>
                  <span className="pill pill-amber shrink-0 !text-[10px] font-bold">Unpaid PT</span>
                </div>
              `}

              ${errorMsg && html`
                <div className="mx-4 mt-3 p-2.5 rounded-[8px] bg-red-50 border border-red-200 text-red-900 text-[12px] flex items-start justify-between gap-2">
                  <span className="flex gap-2"><${Icon} name="alert" size=${15} className="text-red-600 mt-0.5" />${errorMsg}</span>
                  <button type="button" className="text-[11px] underline" onClick=${() => setErrorMsg("")}>Dismiss</button>
                </div>`}

              ${bookingResult && html`
                <div className=${`mx-4 mt-3 p-3 rounded-[10px] border text-[12px] ${bookingResult.ok ? "bg-green-50 border-green-300 text-green-900" : "bg-red-50 border-red-300 text-red-900"}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold flex items-center gap-1.5 text-[13px]">
                      <${Icon} name=${bookingResult.ok ? "check" : "alert"} size=${16} />
                      ${bookingResult.ok
                        ? bookingResult.bookedClasses && bookingResult.bookedClasses.length > 1
                          ? `Booked ${bookingResult.bookedClasses.length} Terms in SAP (& Released SAP Lock)`
                          : "Booking submitted in SAP (& Released SAP Lock)"
                        : "SAP returned a message"}
                    </div>
                    <button type="button" onClick=${() => setBookingResult(null)}><${Icon} name="x" size=${14} /></button>
                  </div>
                  ${bookingResult.bookedClasses && bookingResult.bookedClasses.length > 1 ? html`
                    <div className="mt-1.5 space-y-1">
                      ${bookingResult.bookedClasses.map((bc, bi) => html`
                        <div key=${bi} className="flex items-center gap-1.5 text-[11.5px]">
                          ${getTermText(bc) && html`<span className="pill pill-amber font-mono !text-[10px] !py-0 !px-1.5 font-bold">${getTermText(bc)}</span>`}
                          <b>${fmtClass(bc)}</b>
                          <span className="muted num">(${bc.startDate} → ${bc.endDate})</span>
                        </div>
                      `)}
                    </div>
                  ` : html`
                    <div className="mt-1">Class: <b>${fmtClass(bookingResult.className)}</b>${bookingResult.centreName ? ` (${bookingResult.centreName})` : ""}</div>
                  `}
                  ${bookingResult.messages.length > 0 && html`<div className="mt-1.5 pt-1.5 border-t border-black/10 space-y-1">
                    ${bookingResult.messages.map((m, i) => html`<div key=${i} className="flex items-start gap-1.5">
                      <span className=${`pill !text-[10px] !py-0 ${m.type === "ERROR" ? "pill-red" : m.type === "WARNING" ? "pill-amber" : "pill-green"}`}>${m.type}</span>
                      <span className="select-text">${m.text}</span></div>`)}
                  </div>`}
                </div>`}

              <div className="flex-1 min-h-0 overflow-auto scroll-thin">
                ${filtered.length === 0 ? html`
                  <div className="h-full grid place-items-center text-center muted p-8">
                    ${loading ? html`<div className="flex items-center gap-2"><${Icon} name="refresh" size=${16} className="animate-spin" />Loading classes from SAP…</div>` : html`
                    <div className="space-y-3 max-w-[380px]">
                      <div className="w-11 h-11 rounded-full bg-slate-100 grid place-items-center mx-auto"><${Icon} name="calendar" size=${20} /></div>
                      <div className="font-semibold text-slate-700">${!searched ? "Pick a branch or search all branches" : classesList.length ? "No classes match the current filter" : "No classes found in SAP for this search"}</div>
                      <div className="text-[12px]">${!searched ? "Course and level are pre-filled from the student's recommended level. You can change them on the left." : "Try another branch, a different course, or clear the class description filter."}</div>
                      <div className="flex justify-center gap-2">
                        <button type="button" className="btn btn-primary !h-8" onClick=${() => fetchSingleBranch(selectedCentreKey)}><${Icon} name="search" size=${13} />Search ${activeCentre ? cleanName(activeCentre.shortName) : ""}</button>
                        <button type="button" className="btn !h-8" onClick=${fetchAllBranches}><${Icon} name="building" size=${13} />All branches</button>
                      </div>
                    </div>`}
                  </div>
                ` : html`
                  <table className="tbl tbl-compact">
                    <thead><tr>
                      ${sortHeader("branch", "Branch")}
                      ${sortHeader("className", `Class (${use12Hour ? "12h" : "24h"})`)}
                      ${sortHeader("term", "Term")}
                      ${sortHeader("startDate", "Start")}
                      ${sortHeader("endDate", "End")}
                      <th>Level</th>
                      <th>Session / Event</th>
                      ${sortHeader("seats", "Seats")}
                      <th className="text-right">Action</th>
                    </tr></thead>
                    <tbody>
                      ${filtered.map((cls, i) => {
                        const itemKey = `${cls._centreKey || selectedCentreKey}_${cls.rowIndex}_${cls.className}`;
                        const busy = bookingBusyId === itemKey;
                        const full = cls.remainingCapacityNum !== null && cls.remainingCapacityNum !== undefined && cls.remainingCapacityNum <= 0;
                        const inCart = isInCart(cls);
                        const sameTermTaken = isSameTermInCart(cls);
                        const displayClsName = fmtClass(cls);
                        const termBadge = getTermText(cls);
                        return html`<tr key=${itemKey + "_" + i} style=${inCart ? { background: "rgba(16, 185, 129, 0.07)" } : full ? { background: "#fafafa" } : null}>
                          <td className="whitespace-nowrap"><span className="pill pill-blue !text-[10px] !py-0 !px-1.5 font-medium">${cls._centreName || cls.location || "—"}</span></td>
                          <td>
                            <div className="font-semibold select-text text-[11.5px] text-slate-800 leading-tight" title=${cls.className}>${displayClsName}</div>
                            ${cls.location && html`<div className="text-[10px] text-slate-400 font-mono mt-0.5">${cls.location}</div>`}
                          </td>
                          <td className="whitespace-nowrap">
                            ${termBadge ? html`<span className="pill pill-amber font-mono !text-[10px] !py-0 !px-1.5 font-bold">${termBadge}</span>` : html`<span className="muted text-[11px]">—</span>`}
                          </td>
                          <td className="num whitespace-nowrap font-medium text-[11.5px]">${cls.startDate || "—"}</td>
                          <td className="num whitespace-nowrap text-[11.5px]">${cls.endDate || "—"}</td>
                          <td className="whitespace-nowrap">${cls.academicLevel ? html`<span className="pill pill-gray font-mono !text-[10px] !py-0 !px-1.5">${cls.academicLevel}</span>` : "—"}</td>
                          <td className="text-[11px]"><div>${cls.session || "—"}</div>${cls.eventType && html`<div className="muted text-[10px]">${cls.eventType}</div>`}</td>
                          <td className="whitespace-nowrap">${seatPill(cls)}</td>
                          <td className="text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                disabled=${!!bookingBusyId || loading || sameTermTaken}
                                onClick=${() => toggleCartClass(cls)}
                                title=${
                                  inCart
                                    ? "Remove from multi-term cart"
                                    : sameTermTaken
                                      ? `Another schedule from ${termBadge || "this term"} is already in your cart. Remove it first to choose a different ${termBadge || "term"} schedule.`
                                      : "Add to cart to book multiple terms together"
                                }
                                className=${`btn !h-6 !px-2 text-[11px] font-semibold transition-all ${
                                  inCart
                                    ? "!bg-emerald-600 !text-white !border-emerald-600 hover:!bg-emerald-700"
                                    : sameTermTaken
                                      ? "!bg-slate-100 !text-slate-400 !border-slate-200 cursor-not-allowed opacity-70"
                                      : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/50"
                                }`}
                              >
                                ${inCart
                                  ? html`<${Icon} name="check" size=${11} />In Cart`
                                  : sameTermTaken
                                    ? `${termBadge || "Term"} Taken`
                                    : "+ Cart"}
                              </button>
                              <button type="button" disabled=${!!bookingBusyId || loading} onClick=${() => openConfirmModal([cls])}
                                className=${`btn !h-6 !px-2 text-[11px] font-semibold ${full && bookingAction === "reservation" ? "" : "btn-primary"}`}>
                                ${busy ? html`<${Icon} name="refresh" size=${12} className="animate-spin" />Booking…` : html`<${Icon} name="zap" size=${12} />${bookingAction === "waitlist" ? "Waitlist" : "Book"}`}
                              </button>
                            </div>
                          </td>
                        </tr>`;
                      })}
                    </tbody>
                  </table>
                `}
              </div>
            </div>
          </div>
        `}
      </div>

      ${confirmClasses && confirmClasses.length > 0 && html`
        <div className="fixed inset-0 z-[60] grid place-items-center" style=${{ background: "rgba(15,23,42,0.35)" }}>
          <div className="bg-white rounded-[12px] shadow-2xl p-5 w-[520px] max-w-[95vw] space-y-3">
            <div className="font-semibold text-[15px] flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <${Icon} name="alert" size=${17} className="text-amber-600" />
                <span>${confirmClasses.length > 1 ? `Confirm Multi-Term Booking (${confirmClasses.length} Terms)` : "Confirm booking in SAP"}</span>
              </span>
              ${confirmClasses.length > 1 && html`
                <span className="pill pill-green !text-[10.5px] font-bold">Bundle · ${confirmClasses.length} Terms</span>
              `}
            </div>
            <div className="text-[12.5px] space-y-1.5">
              <div><span className="muted">Student:</span> <b>${SAPC.formatStudentName(profile.fullName)}</b> (${studentId})</div>
              ${confirmClasses.length === 1 ? html`
                <div><span className="muted">Class:</span> <b className="text-slate-900 select-text font-bold" title=${confirmClasses[0].className}>${fmtClass(confirmClasses[0])}</b></div>
                <div><span className="muted">Dates:</span> <span className="font-medium text-slate-800">${confirmClasses[0].startDate} → ${confirmClasses[0].endDate}</span></div>
                <div><span className="muted">Branch:</span> <span className="font-medium text-slate-800">${confirmClasses[0]._centreName || "—"}</span></div>
              ` : html`
                <div className="pt-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Selected Classes (${confirmClasses.length}):</div>
                  <div className="max-h-[160px] overflow-auto scroll-thin space-y-1.5 p-2 rounded-[8px] bg-slate-50 border border-slate-200">
                    ${confirmClasses.map((cc, idx) => html`
                      <div key=${idx} className="flex items-center justify-between gap-2 text-[11.5px] bg-white px-2.5 py-1.5 rounded border border-slate-200/80">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-bold text-slate-400">#${idx + 1}</span>
                          ${getTermText(cc) && html`<span className="pill pill-amber font-mono !text-[10px] !py-0 !px-1.5 font-bold">${getTermText(cc)}</span>`}
                          <b className="truncate text-slate-900 select-text" title=${cc.className}>${fmtClass(cc)}</b>
                        </div>
                        <span className="text-[11px] text-slate-600 num whitespace-nowrap">${cc.startDate} → ${cc.endDate}</span>
                      </div>
                    `)}
                  </div>
                </div>
              `}
              <div><span className="muted">Type:</span> ${bookingAction === "waitlist" ? "Waitlist booking" : "Reservation"}</div>
            </div>

            ${model && !model.isAdult && html`
              <div className="p-3 rounded-[9px] bg-blue-50/70 border border-blue-200 space-y-2.5 text-[12px]">
                <div className="font-semibold text-blue-900 flex items-center justify-between">
                  <span>Young Learner — Guardian & Collector Validity</span>
                  <span className="pill pill-blue !text-[10px]">Required by SAP</span>
                </div>
                <div>
                  ${label("Guardian / Related Person (Header data)")}
                  ${getValidGuardians().length > 0 ? html`
                    <select className="input !h-8 text-[12px] bg-white" value=${guardianKey} onChange=${(e) => setGuardianKey(e.target.value)}>
                      ${getValidGuardians().map((g) => html`<option key=${g.key} value=${g.key}>${g.name} (${g.key})</option>`)}
                    </select>
                  ` : html`
                    <div className="text-[11.5px] text-slate-700 bg-white px-2.5 py-1.5 rounded border border-slate-200">
                      Auto-selects student's linked Guardian / Sponsor in SAP Header data
                    </div>
                  `}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    ${label("Collector Start Date (Valid From)")}
                    <input className="input !h-8 text-[12px] num bg-white" value=${collectorStartDate}
                      onChange=${(e) => setCollectorStartDate(e.target.value)} placeholder="DD.MM.YYYY" />
                  </div>
                  <div>
                    ${label("Collector End Date (Valid To)")}
                    <input className="input !h-8 text-[12px] num bg-white" value=${collectorEndDate}
                      onChange=${(e) => setCollectorEndDate(e.target.value)} placeholder="DD.MM.YYYY" />
                  </div>
                </div>
              </div>
            `}

            <div className="text-[11.5px] muted">
              ${model && !model.isAdult
                ? `This will add ${confirmClasses.length > 1 ? `all ${confirmClasses.length} classes` : "the class"} to one SAP registration, accept Terms & Conditions for each row, assign the Guardian & Collector validity dates in Header data, save in SAP, and immediately unlock EZ_COURSE_REG.`
                : `This will create a real ${bookingAction === "waitlist" ? "waitlist booking" : "reservation"} for ${confirmClasses.length > 1 ? `all ${confirmClasses.length} classes` : "the selected class"} in SAP, accept Terms & Conditions, and unlock EZ_COURSE_REG.`}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn" onClick=${() => setConfirmClasses(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick=${() => bookClasses(confirmClasses)}>
                <${Icon} name="check" size=${14} />
                ${confirmClasses.length > 1 ? `Confirm & Book (${confirmClasses.length} Terms)` : "Confirm & Book"}
              </button>
            </div>
          </div>
        </div>`}

      ${bookingResult && bookingResult.ok && html`
        <div className="fixed inset-0 z-[70] grid place-items-center" style=${{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(2px)" }}>
          <div className="bg-white rounded-[16px] shadow-2xl p-6 w-[540px] max-w-[95vw] space-y-4 border border-emerald-100 modal-pop">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center shrink-0 shadow-inner">
                <${Icon} name="check" size=${26} className="stroke-[2.5]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Booking Confirmed · Done!</h3>
                  <span className="pill pill-green !text-[11px] font-bold uppercase tracking-wider">Done ✓</span>
                </div>
                <p className="text-[12.5px] text-slate-500 mt-0.5">
                  The reservation was successfully created in SAP, and the session lock was released.
                </p>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 grid place-items-center transition-colors"
                onClick=${() => setBookingResult(null)}
                title="Close"
              >
                <${Icon} name="x" size=${16} />
              </button>
            </div>

            <div className="p-3 rounded-[10px] bg-slate-50 border border-slate-200/80 flex items-center justify-between text-[12px]">
              <div>
                <span className="muted text-[11px] block font-medium">Student</span>
                <span className="font-bold text-slate-800">${profile ? SAPC.formatStudentName(profile.fullName) : "Student"}</span>
                <span className="font-mono text-slate-500 text-[11px] ml-1.5">(${studentId})</span>
              </div>
              <div className="text-right">
                <span className="muted text-[11px] block font-medium">Booking Status</span>
                <span className="pill pill-green !text-[11px] font-bold">${bookingResult.bookingAction === "waitlist" ? "Waiting List" : "Reserved"}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Booked Classes (${(bookingResult.bookedClasses || []).length}):
              </div>
              <div className="max-h-[190px] overflow-auto scroll-thin space-y-1.5 pr-0.5">
                ${(bookingResult.bookedClasses || []).map((bc, idx) => html`
                  <div key=${idx} className="p-2.5 rounded-[9px] bg-emerald-50/60 border border-emerald-200 flex flex-col gap-1 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 text-[10.5px] font-bold grid place-items-center shrink-0">#${idx + 1}</span>
                        ${getTermText(bc) && html`<span className="pill pill-amber font-mono !text-[10px] !py-0 !px-1.5 font-bold">${getTermText(bc)}</span>`}
                        <span className="font-bold text-slate-900 truncate">${fmtClass(bc)}</span>
                      </div>
                      <span className="pill pill-green !text-[10px] font-bold shrink-0">Done ✓</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-slate-600 text-[11px] pl-6.5">
                      <span className="num font-medium">${bc.startDate} → ${bc.endDate}</span>
                      <span>•</span>
                      <span>${bc._centreName || bookingResult.centreName || "Teaching Centre"}</span>
                    </div>
                  </div>
                `)}
              </div>
            </div>

            ${bookingResult.messages && bookingResult.messages.length > 0 && html`
              <div className="p-2.5 rounded-[8px] bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                <span className="font-semibold text-slate-700 block">SAP System Messages:</span>
                ${bookingResult.messages.map((m, mi) => html`
                  <div key=${mi} className="flex items-start gap-1.5 text-slate-600">
                    <span className=${`pill !text-[9.5px] !py-0 shrink-0 ${m.type === "ERROR" ? "pill-red" : m.type === "WARNING" ? "pill-amber" : "pill-green"}`}>${m.type}</span>
                    <span className="select-text">${m.text}</span>
                  </div>
                `)}
              </div>
            `}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                className="btn !h-8 !px-3 text-[12px] font-medium text-slate-600 hover:text-slate-800"
                onClick=${() => setBookingResult(null)}
              >
                Keep Searching
              </button>
              <button
                type="button"
                className="btn btn-primary !h-8 !px-4 text-[12px] font-bold !bg-emerald-600 hover:!bg-emerald-700 !border-emerald-600 text-white flex items-center gap-1.5 shadow-sm"
                onClick=${() => {
                  setBookingResult(null);
                  handleCloseModal();
                }}
              >
                <${Icon} name="check" size=${14} />
                <span>Done — View Booking History</span>
              </button>
            </div>
          </div>
        </div>
      `}

      ${bookingResult && !bookingResult.ok && html`
        <div className="fixed inset-0 z-[70] grid place-items-center" style=${{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(2px)" }}>
          <div className="bg-white rounded-[16px] shadow-2xl p-6 w-[520px] max-w-[95vw] space-y-4 border border-red-200 modal-pop">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 grid place-items-center shrink-0 shadow-inner">
                <${Icon} name="alert" size=${24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[17px] font-bold text-slate-900 tracking-tight">Booking Not Completed in SAP</h3>
                <p className="text-[12.5px] text-slate-500 mt-0.5">
                  SAP returned messages preventing this booking. The registration lock was released.
                </p>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 grid place-items-center transition-colors"
                onClick=${() => setBookingResult(null)}
                title="Close"
              >
                <${Icon} name="x" size=${16} />
              </button>
            </div>

            <div className="p-3 rounded-[10px] bg-red-50 border border-red-200 text-[12px] space-y-2">
              <div className="font-semibold text-red-950">Messages from SAP:</div>
              ${bookingResult.messages.map((m, mi) => html`
                <div key=${mi} className="flex items-start gap-2 text-red-800">
                  <span className=${`pill !text-[9.5px] !py-0 shrink-0 ${m.type === "ERROR" ? "pill-red" : "pill-amber"}`}>${m.type}</span>
                  <span className="select-text">${m.text}</span>
                </div>
              `)}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                className="btn btn-primary !h-8 !px-4 text-[12px] font-bold"
                onClick=${() => setBookingResult(null)}
              >
                Dismiss & Try Again
              </button>
            </div>
          </div>
        </div>
      `}
    </div>`;
  }

  global.BookingModal = BookingModal;
})(window);

