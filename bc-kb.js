// ============================================================================
// British Council Egypt — Complete Knowledge Base, SAP Analyzer & Pricing Engine
// Synced with https://helpseif.pages.dev/ & SAP Web Dynpro Student Hub
// ============================================================================
(function (global) {
  const PRICING = {
    earlyYearsTermFee: 6400,
    primarySecondaryTermFee: 5800,
    ieltsTeensFee: 5600,
    placementTestFee: 200,
    bundleDiscounts: { 1: 0, 2: 0.05, 3: 0.1, 4: 0.15 },
    siblingDiscountRate: 0.1,
    adultReRegDiscountRate: 0.1,
    installment6MRate: 0.09,
    installment12MRate: 0.15,
    sessionsPerWinterTerm: 9,
    whatsappOfficial: "01022212064",
    academicYearCutoff: { month: 9, day: 1 }, // September 1st
  };

  const BRANCHES = [
    {
      id: "agouza",
      name: "Agouza",
      code: "AGU",
      city: "Cairo & Giza",
      address: "192 El Nil Street, Agouza, Cairo",
      workingHours: "10:00 AM – 7:00 PM",
      workingDays: "Sunday to Thursday",
      customerServiceAvailable: true,
      manager: "Amal El Samahy",
      adultSeniorTeacher: "Maryana Fahmy",
      ylSeniorTeacher: "Rami Emil / Eman Mahmoud",
      emails: ["Amal.ElSamahy@britishcouncil.org.eg", "maryana.fahmy@britishcouncil.org"],
    },
    {
      id: "city-stars",
      name: "City Stars",
      code: "CTS",
      city: "Cairo & Giza",
      address: "Citystars Mall, Makram Ebid St., Gate 5, Phase 1, Floor 6, Nasr City",
      workingHours: "1:00 PM – 8:00 PM",
      workingDays: "Sunday to Thursday",
      customerServiceAvailable: true,
      manager: "Enas Badr",
      adultSeniorTeacher: "Heba Elrafei",
      ylSeniorTeacher: "Mai Mahmoud",
      emails: ["Enas.Badr@britishcouncil.org.eg", "Heba.Elrafei@britishcouncil.org.eg"],
    },
    {
      id: "new-cairo",
      name: "Aspire School New Cairo",
      code: "ASP",
      city: "Cairo & Giza",
      address: "Abdelrahman Tag Street, Al-Banafseg 1st Settlement, New Cairo",
      workingHours: "12:00 PM – 7:00 PM",
      workingDays: "Sunday to Thursday",
      customerServiceAvailable: true,
      manager: "Yasmeen Magdy",
      ylSeniorTeacher: "Fatima Taha",
      emails: ["Yasmeen.Magdy@britishcouncil.org", "Fatima.Taha@britishcouncil.org"],
    },
    {
      id: "october",
      name: "October (Choueifat)",
      code: "OCT",
      city: "Cairo & Giza",
      address: "Dream Land Compound, Gate 3 - Gate 4 of ISC, 6th of October",
      workingHours: "12:00 PM – 7:00 PM",
      workingDays: "Sunday to Thursday",
      customerServiceAvailable: true,
      manager: "Yasmeen Magdy",
      ylSeniorTeacher: "Nani Mohamed",
      emails: ["Yasmeen.Magdy@britishcouncil.org", "Nani.Mohamed@britishcouncil.org"],
    },
    {
      id: "alex-bsa",
      name: "Alexandria (BSA)",
      code: "ALX-BSA",
      city: "Alexandria",
      address: "11 Mahmoud Abou El Ela, Kafr Abdo, Alexandria",
      workingHours: "Teaching center only (No CS desk on site)",
      workingDays: "Sunday to Thursday",
      customerServiceAvailable: false,
      manager: "Asma Helal",
      ylSeniorTeacher: "Hany El Safany",
      emails: ["Asma.Helal@britishcouncil.org.eg"],
    },
    {
      id: "alex-kls",
      name: "Alexandria (KLS)",
      code: "ALX-KLS",
      city: "Alexandria",
      address: "8 Mahmoud Mokhtar St., Off Fouad St., Kafr Abdo, Alexandria",
      workingHours: "11:00 AM – 1:00 PM & 2:00 PM – 6:00 PM",
      workingDays: "Sunday to Thursday",
      customerServiceAvailable: true,
      manager: "Asma Helal",
      ylSeniorTeacher: "Hany El Safany",
      emails: ["Asma.Helal@britishcouncil.org.eg", "Hany.ElSafany@britishcouncil.org.eg"],
    },
  ];

  const YL_AGE_GROUPS = [
    {
      id: "ey2",
      name: "Early Years 2 (Ducks)",
      shortName: "EY2 (Ducks)",
      minAge: 4,
      maxAge: 4.99,
      termFee: 6400,
      ptRequired: false,
      description: "Age 4 • Ducks • Direct enrollment without Placement Test",
    },
    {
      id: "ey3",
      name: "Early Years 3 (Owls)",
      shortName: "EY3 (Owls)",
      minAge: 5,
      maxAge: 5.99,
      termFee: 6400,
      ptRequired: false,
      description: "Age 5 • Owls • Direct enrollment without Placement Test (Complementary to LP Starter A)",
    },
    {
      id: "lower-primary",
      name: "Lower Primary",
      shortName: "Lower Primary (6–8y)",
      minAge: 6,
      maxAge: 8.99,
      termFee: 5800,
      ptRequired: true,
      description: "Ages 6–8 • LP Starter A/B & Primary Plus 1–3",
    },
    {
      id: "upper-primary",
      name: "Upper Primary",
      shortName: "Upper Primary (9–11y)",
      minAge: 9,
      maxAge: 11.99,
      termFee: 5800,
      ptRequired: true,
      description: "Ages 9–11 • UP Starter B & Primary Plus 1–6",
    },
    {
      id: "lower-secondary",
      name: "Lower Secondary",
      shortName: "Lower Secondary (12–14y)",
      minAge: 12,
      maxAge: 14.99,
      termFee: 5800,
      ptRequired: true,
      description: "Ages 12–14 • Secondary Plus A1 to B2.2",
    },
    {
      id: "upper-secondary",
      name: "Upper Secondary",
      shortName: "Upper Secondary (15–17y)",
      minAge: 15,
      maxAge: 17.99,
      termFee: 5800,
      ptRequired: true,
      description: "Ages 15–17 • Upper Secondary Plus A1 to C1.1 & IELTS for Teens",
    },
  ];

  const YL_LEVELS = [
    { id: "ey2-ducks", name: "Early Years 2 (Ducks)", ageGroupId: "ey2", ageGroupName: "Early Years 2 (4 yrs)", minAge: 4, maxAge: 4, termsToComplete: "4 terms", summerMapping: "Ducks", ptRequired: false },
    { id: "ey3-owls", name: "Early Years 3 (Owls)", ageGroupId: "ey3", ageGroupName: "Early Years 3 (5 yrs)", minAge: 5, maxAge: 5, termsToComplete: "4 terms", summerMapping: "Owls", ptRequired: false, notes: "Not equivalent to LP Starter A; complementary" },
    { id: "lp-starter-a", name: "LP Starter A", ageGroupId: "lower-primary", ageGroupName: "Lower Primary (6–8 yrs)", minAge: 6, maxAge: 8, termsToComplete: "3–4 terms", summerMapping: "LP Starter A", ptRequired: true },
    { id: "lp-starter-b", name: "LP Starter B", ageGroupId: "lower-primary", ageGroupName: "Lower Primary (6–8 yrs)", minAge: 6, maxAge: 8, termsToComplete: "3–4 terms", summerMapping: "LP Starter B", ptRequired: true },
    { id: "lp-pp1", name: "LP Primary Plus 1", ageGroupId: "lower-primary", ageGroupName: "Lower Primary (6–8 yrs)", minAge: 6, maxAge: 8, termsToComplete: "4 terms", summerMapping: "LP Camels", ptRequired: true },
    { id: "lp-pp2", name: "LP Primary Plus 2", ageGroupId: "lower-primary", ageGroupName: "Lower Primary (6–8 yrs)", minAge: 6, maxAge: 8, termsToComplete: "4 terms", summerMapping: "LP Crocodiles", ptRequired: true },
    { id: "lp-pp3", name: "LP Primary Plus 3", ageGroupId: "lower-primary", ageGroupName: "Lower Primary (6–8 yrs)", minAge: 6, maxAge: 8, termsToComplete: "4 terms", summerMapping: "LP Crocodiles", ptRequired: true },
    { id: "up-starter-b", name: "UP Starter B", ageGroupId: "upper-primary", ageGroupName: "Upper Primary (9–11 yrs)", minAge: 9, maxAge: 11, termsToComplete: "3–4 terms", summerMapping: "UP Starter B", ptRequired: true },
    { id: "up-pp1", name: "UP Primary Plus 1", ageGroupId: "upper-primary", ageGroupName: "Upper Primary (9–11 yrs)", minAge: 9, maxAge: 11, termsToComplete: "4 terms", summerMapping: "UP Camels", ptRequired: true },
    { id: "up-pp2", name: "UP Primary Plus 2", ageGroupId: "upper-primary", ageGroupName: "Upper Primary (9–11 yrs)", minAge: 9, maxAge: 11, termsToComplete: "4 terms", summerMapping: "UP Crocodiles", ptRequired: true },
    { id: "up-pp3", name: "UP Primary Plus 3", ageGroupId: "upper-primary", ageGroupName: "Upper Primary (9–11 yrs)", minAge: 9, maxAge: 11, termsToComplete: "4 terms", summerMapping: "UP Crocodiles", ptRequired: true },
    { id: "up-pp4", name: "UP Primary Plus 4", ageGroupId: "upper-primary", ageGroupName: "Upper Primary (9–11 yrs)", minAge: 9, maxAge: 11, termsToComplete: "4 terms", summerMapping: "UP Eagles", ptRequired: true },
    { id: "up-pp5", name: "UP Primary Plus 5", ageGroupId: "upper-primary", ageGroupName: "Upper Primary (9–11 yrs)", minAge: 9, maxAge: 11, termsToComplete: "4 terms", summerMapping: "UP Eagles", ptRequired: true },
    { id: "up-pp6", name: "UP Primary Plus 6", ageGroupId: "upper-primary", ageGroupName: "Upper Primary (9–11 yrs)", minAge: 9, maxAge: 11, termsToComplete: "4 terms", summerMapping: "UP Whales", ptRequired: true },
    { id: "sec-a1", name: "Secondary Plus A1", ageGroupId: "lower-secondary", ageGroupName: "Lower Secondary (12–14 yrs)", minAge: 12, maxAge: 14, termsToComplete: "4 terms", summerMapping: "Secondary Elementary", ptRequired: true },
    { id: "sec-a2", name: "Secondary Plus A2", ageGroupId: "lower-secondary", ageGroupName: "Lower Secondary (12–14 yrs)", minAge: 12, maxAge: 14, termsToComplete: "4 terms", summerMapping: "Secondary Pre Int", ptRequired: true },
    { id: "sec-b1-2", name: "Secondary Plus B1.2", ageGroupId: "lower-secondary", ageGroupName: "Lower Secondary (12–14 yrs)", minAge: 12, maxAge: 14, termsToComplete: "4 terms", summerMapping: "Secondary Intermediate+", ptRequired: true },
    { id: "sec-b2-2", name: "Secondary Plus B2.2", ageGroupId: "lower-secondary", ageGroupName: "Lower Secondary (12–14 yrs)", minAge: 12, maxAge: 14, termsToComplete: "4 terms", summerMapping: "Secondary Intermediate+", ptRequired: true },
    { id: "usec-a1", name: "Upper Secondary Plus A1", ageGroupId: "upper-secondary", ageGroupName: "Upper Secondary (15–17 yrs)", minAge: 15, maxAge: 17, termsToComplete: "4 terms", summerMapping: "US Elementary", ptRequired: true },
    { id: "usec-a2", name: "Upper Secondary Plus A2", ageGroupId: "upper-secondary", ageGroupName: "Upper Secondary (15–17 yrs)", minAge: 15, maxAge: 17, termsToComplete: "4 terms", summerMapping: "US Pre Intermediate+", ptRequired: true },
    { id: "usec-b1-1", name: "Upper Secondary Plus B1.1", ageGroupId: "upper-secondary", ageGroupName: "Upper Secondary (15–17 yrs)", minAge: 15, maxAge: 17, termsToComplete: "4 terms", summerMapping: "US Intermediate+", ptRequired: true },
    { id: "usec-b2-1", name: "Upper Secondary Plus B2.1", ageGroupId: "upper-secondary", ageGroupName: "Upper Secondary (15–17 yrs)", minAge: 15, maxAge: 17, termsToComplete: "4 terms", summerMapping: "US Intermediate+", ptRequired: true },
    { id: "usec-c1-1", name: "Upper Secondary Plus C1.1", ageGroupId: "upper-secondary", ageGroupName: "Upper Secondary (15–17 yrs)", minAge: 15, maxAge: 17, termsToComplete: "4 terms", summerMapping: "US C1", ptRequired: true },
  ];

  const SUMMER_CAMPS = [
    {
      campNumber: 1,
      name: "Summer Camp 1",
      displayDates: "5 Jul – 16 Jul 2026",
      durationWeeks: 2,
      durationHours: 30,
      dailySchedule: "3 hrs/day (2h English + 1h Activity), Sun–Thu",
      contentNotes: "Shares identical curriculum with Camp 3 (except Starters A & B)",
    },
    {
      campNumber: 2,
      name: "Summer Camp 2",
      displayDates: "26 Jul – 6 Aug 2026",
      durationWeeks: 2,
      durationHours: 30,
      dailySchedule: "3 hrs/day (2h English + 1h Activity), Sun–Thu",
      contentNotes: "Distinct curriculum — ideal to combine with Camp 1 or Camp 3 for 10% discount",
    },
    {
      campNumber: 3,
      name: "Summer Camp 3",
      displayDates: "9 Aug – 20 Aug 2026",
      durationWeeks: 2,
      durationHours: 30,
      dailySchedule: "3 hrs/day (2h English + 1h Activity), Sun–Thu",
      contentNotes: "Shares identical curriculum with Camp 1 (except Starters A & B)",
    },
  ];

  const ADULT_COURSES = [
    {
      id: "beginner",
      name: "Beginner Courses (A–E)",
      code: "BEG",
      minAge: 18,
      description: "Foundational English for absolute beginners across 5 structured levels (Level E is complimentary upon completing A–D).",
      sessionDuration: "90 mins per session (1 Level = 10 sessions)",
      attendanceMode: "Face-to-face at branch",
      schedule: "5 sessions/week, Sunday to Thursday",
      reRegistrationRule: "10% discount on any package when re-registering within 3 months from last attended session.",
      levels: ["Beginner A", "Beginner B", "Beginner C", "Beginner D", "Beginner E (Complimentary)"],
      packages: [
        { id: "beg-10", credits: 10, durationOrLevels: "1 Level (10 Sessions)", price: 3850, label: "10 Credits — 1 Level" },
        { id: "beg-20", credits: 20, durationOrLevels: "2 Levels (20 Sessions)", price: 6000, label: "20 Credits — 2 Levels" },
        { id: "beg-40", credits: 40, durationOrLevels: "4 Levels (+ Level E Free)", price: 10000, label: "40 Credits — 4 Levels (+E Free)" },
        { id: "beg-60", credits: 60, durationOrLevels: "4 Levels + 20 Credits BCE", price: 13300, label: "60 Credits — 4 Levels + 20 BCE" },
      ],
    },
    {
      id: "bce",
      name: "British Council English (BCE)",
      code: "BCE",
      minAge: 18,
      description: "General Adult English modular credit system covering CEFR levels A1 to C1.",
      sessionDuration: "90 mins classroom (or 60 mins online)",
      attendanceMode: "Classroom / Hybrid",
      schedule: "Flexible booking; Speaking Assessment every 10 speaking classes; Advisory after 15, 30, 50 classes",
      reRegistrationRule: "10% discount when renewing within 3 months + reactivates all expired credits.",
      levels: ["A1 Elementary", "A2 Pre-Intermediate", "B1 Intermediate", "B2 Upper-Intermediate", "C1 Advanced"],
      packages: [
        { id: "bce-10", credits: 10, durationOrLevels: "2 Months (Re-register Only)", price: 3850, reRegisterOnly: true, label: "10 Credits (2M • Re-reg Only)" },
        { id: "bce-20", credits: 20, durationOrLevels: "3 Months Validity", price: 6000, label: "20 Credits (3 Months)" },
        { id: "bce-40", credits: 40, durationOrLevels: "6 Months Validity", price: 10000, label: "40 Credits (6 Months)" },
        { id: "bce-60", credits: 60, durationOrLevels: "9 Months Validity", price: 13300, label: "60 Credits (9 Months)" },
      ],
    },
    {
      id: "ielts-coach",
      name: "IELTS Coach",
      code: "IELTS-C",
      minAge: 18,
      description: "Targeted preparation for IELTS Academic or General Training (Requires minimum B1 level).",
      sessionDuration: "90 mins per session",
      attendanceMode: "Face-to-face (Agouza & City Stars) or Virtual",
      schedule: "Sunday to Wednesday (18:00 or 20:00 starts)",
      reRegistrationRule: "10% discount when renewing within 3 months + recovers expired credits.",
      levels: ["B1 Intermediate Minimum Entry"],
      packages: [
        { id: "ic-10", credits: 10, durationOrLevels: "5 Weeks Validity", price: 4700, label: "10 Credits (5 Weeks)" },
        { id: "ic-20", credits: 20, durationOrLevels: "10 Weeks Validity", price: 7200, label: "20 Credits (10 Weeks)" },
      ],
    },
  ];

  const FAQS = [
    {
      id: "faq-pt",
      category: "Placement Test",
      question: "Does my child need a Placement Test (PT)?",
      answer: "Ages 4 & 5 (Ducks & Owls) do NOT need a Placement Test. Starting from age 6, a Placement Test is mandatory (fee: 200 EGP, 20–30 mins, valid for 6 months across all branches, non-refundable).",
    },
    {
      id: "faq-winter",
      category: "Young Learners",
      question: "How does the Young Learner Winter Block work & what are the fees?",
      answer: "The Winter Block consists of 4 terms per year (9 weekly sessions of 2 hours each on Thu, Fri, or Sat). Ages 4 & 5 (Ducks & Owls) enroll directly for 6,400 EGP/term without a test. Ages 6–17 enroll for 5,800 EGP/term after a 200 EGP placement test. Booking 2 terms saves 5%, 3 terms saves 10%, and 4 terms saves 15%.",
    },
    {
      id: "faq-sibling",
      category: "Fees & Discounts",
      question: "How does the 10% Sibling Discount work?",
      answer: "When registering 2 or more siblings together in the same term, a 10% Sibling Discount applies to the younger child(ren) on all shared terms with the oldest sibling.",
    },
    {
      id: "faq-installments",
      category: "Fees & Discounts",
      question: "Can tuition fees be paid in credit card installments?",
      answer: "Yes! Using a credit card, installments are available over 6 months (+9% admin fee) or 12 months (+15% admin fee). For Adults, valid exclusively on 40-credit (10,000 EGP) and 60-credit (13,300 EGP) packages. For Young Learners, valid when booking 2 terms or more.",
    },
    {
      id: "faq-adult-rereg",
      category: "Adults",
      question: "What is the Adult 10% Re-registration & Expired Credits policy?",
      answer: "When an adult student re-registers within 3 months of their last attended session/expiry, they receive an immediate 10% discount on any new credit package AND recover all previously expired credits.",
    },
    {
      id: "faq-branches",
      category: "Branches",
      question: "What are the branch working hours and official WhatsApp?",
      answer: "All branches operate Sunday to Thursday. Official WhatsApp: 01022212064. Agouza: 10am–7pm. City Stars: 1pm–8pm. Aspire New Cairo & October: 12pm–7pm. Alex KLS: 11am–1pm & 2pm–6pm.",
    },
  ];

  const SYSTEM_LINKS = [
    { id: "sap-sms", title: "SAP Student Search (Web Dynpro)", url: "https://prd-sap.sms.britishcouncil.org/sap/bc/webdynpro/sap/z_her_wa_student?WDCONFIGURATIONID=Z_HER_AC_STUDENT", badge: "SAP SMS" },
    { id: "sap-flp", title: "SAP Fiori Launchpad (FLP)", url: "https://prd-sap.sms.britishcouncil.org/sap/bc/ui2/flp?saml2=disabled&sap-client=100&sap-language=EN", badge: "SAP UI2" },
    { id: "ziwo-cms", title: "ZIWO Telephony / CMS Login", url: "https://englishinperson.britishcouncil.org/v2/cms/students/login", badge: "CMS" },
    { id: "ziwo-app", title: "CMS3 (App ZIWO Console)", url: "https://app.ziwo.io/home", badge: "ZIWO" },
    { id: "myfatoorah", title: "MyFatoorah Payment Portal", url: "https://portal.myfatoorah.com/En/All/Account/LogIn", badge: "Payment" },
  ];

  /**
   * Parses either DD.MM.YYYY (SAP format) or YYYY-MM-DD (HTML date input) into a Date object
   */
  function parseFlexibleDate(dobStr) {
    if (!dobStr) return null;
    const clean = String(dobStr).trim();
    const dmy = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const month = parseInt(dmy[2], 10) - 1;
      const year = parseInt(dmy[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
    const ymd = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
      const year = parseInt(ymd[1], 10);
      const month = parseInt(ymd[2], 10) - 1;
      const day = parseInt(ymd[3], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
    const fallback = new Date(clean);
    if (!isNaN(fallback.getTime())) {
      return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
    }
    return null;
  }

  function toIsoDateString(dobStr) {
    const d = parseFlexibleDate(dobStr);
    if (!d) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function toSapDateString(dobStr) {
    const d = parseFlexibleDate(dobStr);
    if (!d) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${dd}.${mm}.${yyyy}`;
  }

  function diffYearsMonthsDays(birthDate, refDate) {
    let years = refDate.getFullYear() - birthDate.getFullYear();
    let months = refDate.getMonth() - birthDate.getMonth();
    let days = refDate.getDate() - birthDate.getDate();

    if (days < 0) {
      months--;
      const prevMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    const decimalAge = +(years + months / 12 + days / 365.25).toFixed(2);
    return { years, months, days, decimalAge };
  }

  function getAcademicYearStartDate(now = new Date()) {
    const yr = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
    return new Date(yr, PRICING.academicYearCutoff.month - 1, PRICING.academicYearCutoff.day);
  }

  /**
   * Computes both exact age today AND Academic-Year Cutoff age (Sept 1st) + 18th birthday transition alert
   */
  function calculateDetailedAge(dobStr) {
    const birthDate = parseFlexibleDate(dobStr);
    if (!birthDate) return null;
    const now = new Date();
    if (birthDate > now) return null;

    const exact = diffYearsMonthsDays(birthDate, now);
    const cutoffDate = getAcademicYearStartDate(now);
    const academic = birthDate <= cutoffDate ? diffYearsMonthsDays(birthDate, cutoffDate) : { years: 0, months: 0, days: 0, decimalAge: 0 };

    // 18th birthday transition check (turning 18 within 30 days)
    const eighteenthBday = new Date(birthDate.getFullYear() + 18, birthDate.getMonth(), birthDate.getDate());
    const msDiff = eighteenthBday.getTime() - now.getTime();
    const daysUntil18 = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    const turning18Soon = exact.years < 18 && daysUntil18 >= 0 && daysUntil18 <= 35;

    // Determine stage (Adults use actual age >= 18; YL uses Academic Year Sept 1st age)
    let stageCategory = "YL";
    let ageGroup = null;
    const stageLookupAge = exact.years >= 18 ? exact.years : academic.years;

    if (exact.years >= 18) {
      stageCategory = "Adult";
    } else if (stageLookupAge < 4) {
      stageCategory = "UnderAge";
    } else {
      ageGroup =
        YL_AGE_GROUPS.find((g) => stageLookupAge >= g.minAge && stageLookupAge <= Math.floor(g.maxAge)) ||
        YL_AGE_GROUPS[YL_AGE_GROUPS.length - 1];
    }

    return {
      dobFormatted: toSapDateString(dobStr),
      isoDate: toIsoDateString(dobStr),
      years: exact.years,
      months: exact.months,
      days: exact.days,
      decimalAge: exact.decimalAge,
      academicYears: academic.years,
      academicMonths: academic.months,
      academicDays: academic.days,
      academicDecimalAge: academic.decimalAge,
      cutoffYear: cutoffDate.getFullYear(),
      turning18Soon,
      daysUntil18: turning18Soon ? daysUntil18 : null,
      eighteenthDateFormatted: toSapDateString(eighteenthBday),
      stageCategory,
      ageGroup,
    };
  }

  /**
   * Matches a SAP Teaching Centre string (e.g. "CityStars Teaching Centre") to a Branch object
   */
  function matchBranchFromSapCentre(centreStr) {
    if (!centreStr) return null;
    const s = centreStr.toLowerCase();
    if (s.includes("city") || s.includes("stars") || s.includes("cts")) return BRANCHES.find((b) => b.id === "city-stars");
    if (s.includes("agouza") || s.includes("agu") || s.includes("nil")) return BRANCHES.find((b) => b.id === "agouza");
    if (s.includes("aspire") || s.includes("new cairo") || s.includes("asp") || s.includes("tag")) return BRANCHES.find((b) => b.id === "new-cairo");
    if (s.includes("october") || s.includes("choueifat") || s.includes("dream") || s.includes("oct")) return BRANCHES.find((b) => b.id === "october");
    if (s.includes("kls")) return BRANCHES.find((b) => b.id === "alex-kls");
    if (s.includes("bsa") || s.includes("alx") || s.includes("alex") || s.includes("kafr")) return BRANCHES.find((b) => b.id === "alex-bsa") || BRANCHES.find((b) => b.id === "alex-kls");
    return null;
  }

  const NEXT_LEVEL_MAP = {
    "Early Years 2": "Early Years 3",
    "Early Years 3": "Starter A",
    "Starter A": "Starter B",
    "Starter B": "Primary Plus 1",
    "Primary Plus 1": "Primary Plus 2",
    "Primary Plus 2": "Primary Plus 3",
    "Primary Plus 3": "Primary Plus 4",
    "Primary Plus 4": "Primary Plus 5",
    "Primary Plus 5": "Primary Plus 6",
    "Primary Plus 6": "Secondary Plus A1",
    "Secondary Plus A1": "Secondary Plus A2",
    "Secondary Plus A2": "Secondary Plus B1.2",
    "Secondary Plus B1.2": "Secondary Plus B2.2",
    "Secondary Plus B2.2": "Upper Secondary Plus C1.1",
    "Upper Secondary Plus A1": "Upper Secondary Plus A2",
    "Upper Secondary Plus A2": "Upper Secondary Plus B1.1",
    "Upper Secondary Plus B1.1": "Upper Secondary Plus B2.1",
    "Upper Secondary Plus B2.1": "Upper Secondary Plus C1.1",
    "Lower Secondary Plus A1": "Secondary Plus A2",
    "Lower Secondary Plus A2": "Secondary Plus B1.2",
    "Lower Secondary Plus B1.2": "Secondary Plus B2.2",
    "Beginner A": "Beginner B",
    "Beginner B": "Beginner C",
    "Beginner C": "Beginner D",
    "Beginner D": "A1",
    "Beginner E": "A1",
    "Beg A": "Beg B",
    "Beg B": "Beg C",
    "Beg C": "Beg D",
    "Beg D": "A1",
    "Beg E": "A1",
  };

  /**
   * Official British Council English Language Level Progression Chart (Age vs CEFR Level)
   * Used for visual rendering and validation of age-stage transitions.
   */
  const BC_LEVEL_PROGRESSION_CHART = [
    {
      stage: "Upper Secondary",
      stageAr: "المرحلة الثانوية العليا",
      ageRange: "15–17",
      minAge: 15,
      maxAge: 17,
      badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
      rowClass: "bg-amber-50/50 hover:bg-amber-50",
      cells: [
        { cefr: "A0", text: "—", empty: true },
        { cefr: "A1", text: "U Secondary A1", level: "Upper Secondary Plus A1", badge: "A1" },
        { cefr: "A2", text: "U Secondary A2", level: "Upper Secondary Plus A2", badge: "A2" },
        { cefr: "B1", text: "U Secondary B1", level: "Upper Secondary Plus B1.1", badge: "B1" },
        { cefr: "B2", text: "U Secondary B2", level: "Upper Secondary Plus B2.1", badge: "B2" },
        { cefr: "C1", text: "U Secondary C1", level: "Upper Secondary Plus C1.1", badge: "C1" },
      ]
    },
    {
      stage: "Lower Secondary",
      stageAr: "المرحلة الإعدادية",
      ageRange: "12–14",
      minAge: 12,
      maxAge: 14,
      badgeClass: "bg-purple-100 text-purple-900 border-purple-300",
      rowClass: "bg-purple-50/50 hover:bg-purple-50",
      cells: [
        { cefr: "A0", text: "—", empty: true },
        { cefr: "A1", text: "L Secondary A1", level: "Secondary Plus A1", badge: "A1" },
        { cefr: "A2", text: "L Secondary A2", level: "Secondary Plus A2", badge: "A2" },
        { cefr: "B1", text: "L Secondary B1", level: "Secondary Plus B1.2", badge: "B1" },
        { cefr: "B2", text: "L Secondary B2", level: "Secondary Plus B2.2", badge: "B2" },
        { cefr: "C1", text: "—", empty: true },
      ]
    },
    {
      stage: "Upper Primary (11y)",
      stageAr: "الابتدائي الأعلى (11 سنة)",
      ageRange: "11",
      minAge: 11,
      maxAge: 11,
      badgeClass: "bg-green-100 text-green-900 border-green-300",
      rowClass: "bg-green-50/40 hover:bg-green-50",
      cells: [
        { cefr: "A0", text: "UP Starter B", level: "UP Starter B", badge: "A0" },
        { cefr: "A1", text: "UP +1 / UP +2", level: "Primary Plus 1", badge: "A1" },
        { cefr: "A2", text: "UP +3 / Primary +4", level: "Primary Plus 4", badge: "A2" },
        { cefr: "B1", text: "UP +5 / UP +6", level: "Primary Plus 6", badge: "B1" },
        { cefr: "B2", text: "—", empty: true },
        { cefr: "C1", text: "—", empty: true },
      ]
    },
    {
      stage: "Upper Primary (10y)",
      stageAr: "الابتدائي الأعلى (10 سنوات)",
      ageRange: "10",
      minAge: 10,
      maxAge: 10,
      badgeClass: "bg-green-100 text-green-900 border-green-300",
      rowClass: "bg-green-50/40 hover:bg-green-50",
      cells: [
        { cefr: "A0", text: "UP Starter B", level: "UP Starter B", badge: "A0" },
        { cefr: "A1", text: "UP +1 / UP +2", level: "Primary Plus 1", badge: "A1" },
        { cefr: "A2", text: "UP +3 / Primary +4", level: "Primary Plus 4", badge: "A2" },
        { cefr: "B1", text: "UP +5", level: "Primary Plus 5", badge: "B1" },
        { cefr: "B2", text: "—", empty: true },
        { cefr: "C1", text: "—", empty: true },
      ]
    },
    {
      stage: "Upper Primary (9y)",
      stageAr: "الابتدائي الأعلى (9 سنوات)",
      ageRange: "9",
      minAge: 9,
      maxAge: 9,
      badgeClass: "bg-green-100 text-green-900 border-green-300",
      rowClass: "bg-green-50/40 hover:bg-green-50",
      cells: [
        { cefr: "A0", text: "UP Starter B", level: "UP Starter B", badge: "A0" },
        { cefr: "A1", text: "UP +1 / UP +2", level: "Primary Plus 1", badge: "A1" },
        { cefr: "A2", text: "UP +3 / Primary +4", level: "Primary Plus 4", badge: "A2" },
        { cefr: "B1", text: "—", empty: true },
        { cefr: "B2", text: "—", empty: true },
        { cefr: "C1", text: "—", empty: true },
      ]
    },
    {
      stage: "Lower Primary (8y)",
      stageAr: "الابتدائي الأدنى (8 سنوات)",
      ageRange: "8",
      minAge: 8,
      maxAge: 8,
      badgeClass: "bg-sky-100 text-sky-900 border-sky-300",
      rowClass: "bg-sky-50/40 hover:bg-sky-50",
      cells: [
        { cefr: "A0", text: "LP Starter A & B", level: "LP Starter A", badge: "A0" },
        { cefr: "A1", text: "LP +1 / LP +2", level: "LP Primary Plus 1", badge: "A1" },
        { cefr: "A2", text: "LPrimary +3", level: "LP Primary Plus 3", badge: "A2" },
        { cefr: "B1", text: "—", empty: true },
        { cefr: "B2", text: "—", empty: true },
        { cefr: "C1", text: "—", empty: true },
      ]
    },
    {
      stage: "Lower Primary (7y)",
      stageAr: "الابتدائي الأدنى (7 سنوات)",
      ageRange: "7",
      minAge: 7,
      maxAge: 7,
      badgeClass: "bg-sky-100 text-sky-900 border-sky-300",
      rowClass: "bg-sky-50/40 hover:bg-sky-50",
      cells: [
        { cefr: "A0", text: "LP Starter A & B", level: "LP Starter A", badge: "A0" },
        { cefr: "A1", text: "LP +1 / LP +2", level: "LP Primary Plus 1", badge: "A1" },
        { cefr: "A2", text: "—", empty: true },
        { cefr: "B1", text: "—", empty: true },
        { cefr: "B2", text: "—", empty: true },
        { cefr: "C1", text: "—", empty: true },
      ]
    },
    {
      stage: "Lower Primary (6y)",
      stageAr: "الابتدائي الأدنى (6 سنوات)",
      ageRange: "6",
      minAge: 6,
      maxAge: 6,
      badgeClass: "bg-sky-100 text-sky-900 border-sky-300",
      rowClass: "bg-sky-50/40 hover:bg-sky-50",
      cells: [
        { cefr: "A0", text: "LP Starter A & B", level: "LP Starter A", badge: "A0" },
        { cefr: "A1", text: "LP +1", level: "LP Primary Plus 1", badge: "A1" },
        { cefr: "A2", text: "—", empty: true },
        { cefr: "B1", text: "—", empty: true },
        { cefr: "B2", text: "—", empty: true },
        { cefr: "C1", text: "—", empty: true },
      ]
    },
    {
      stage: "Early Years 3",
      stageAr: "الطفولة المبكرة 3",
      ageRange: "5",
      minAge: 5,
      maxAge: 5,
      badgeClass: "bg-cyan-100 text-cyan-900 border-cyan-300",
      rowClass: "bg-cyan-50/30 hover:bg-cyan-50",
      cells: [
        { cefr: "A0", text: "EY 3 (Owls)", level: "Early Years 3", badge: "A0" },
        { cefr: "A1", text: "—", empty: true },
        { cefr: "A2", text: "—", empty: true },
        { cefr: "B1", text: "—", empty: true },
        { cefr: "B2", text: "—", empty: true },
        { cefr: "C1", text: "—", empty: true },
      ]
    },
    {
      stage: "Early Years 2",
      stageAr: "الطفولة المبكرة 2",
      ageRange: "4",
      minAge: 4,
      maxAge: 4,
      badgeClass: "bg-cyan-100 text-cyan-900 border-cyan-300",
      rowClass: "bg-cyan-50/30 hover:bg-cyan-50",
      cells: [
        { cefr: "A0", text: "EY 2 (Ducks)", level: "Early Years 2", badge: "A0" },
        { cefr: "A1", text: "—", empty: true },
        { cefr: "A2", text: "—", empty: true },
        { cefr: "B1", text: "—", empty: true },
        { cefr: "B2", text: "—", empty: true },
        { cefr: "C1", text: "—", empty: true },
      ]
    },
  ];

  /**
   * Resolves progression across age brackets according to the
   * official British Council English Language Level Progression Chart.
   */
  function resolveCrossAgeProgression({ targetLevel, currentAcademicAge, isUpgradeReady }) {
    if (currentAcademicAge == null || !targetLevel) return null;

    // 1. Determine student's CURRENT academic age group (Age on 1 Sep)
    let targetAgeGroup = null;
    let targetStageName = "";
    if (currentAcademicAge >= 18) {
      targetAgeGroup = "adult";
      targetStageName = "Adult (18+)";
    } else if (currentAcademicAge >= 15) {
      targetAgeGroup = "upper-secondary";
      targetStageName = "Upper Secondary (15–17y)";
    } else if (currentAcademicAge >= 12) {
      targetAgeGroup = "lower-secondary";
      targetStageName = "Lower Secondary (12–14y)";
    } else if (currentAcademicAge >= 9) {
      targetAgeGroup = "upper-primary";
      targetStageName = "Upper Primary (9–11y)";
    } else if (currentAcademicAge >= 6) {
      targetAgeGroup = "lower-primary";
      targetStageName = "Lower Primary (6–8y)";
    } else if (currentAcademicAge === 5) {
      targetAgeGroup = "ey3";
      targetStageName = "Early Years 3 (5y)";
    } else if (currentAcademicAge === 4) {
      targetAgeGroup = "ey2";
      targetStageName = "Early Years 2 (4y)";
    } else {
      targetAgeGroup = "underage";
      targetStageName = "Under 4";
    }

    // 2. Identify source age group and CEFR band of targetLevel
    const s = String(targetLevel || "").toLowerCase();
    let sourceAgeGroup = null;
    let sourceStageName = "";
    let cefr = "A0";
    let baseLevel = targetLevel;

    if (/\b(?:ey2|early\s*years\s*2|ducks)\b/i.test(s)) {
      sourceAgeGroup = "ey2";
      sourceStageName = "Early Years 2 (4y)";
      cefr = "A0";
    } else if (/\b(?:ey3|early\s*years\s*3|owls)\b/i.test(s)) {
      sourceAgeGroup = "ey3";
      sourceStageName = "Early Years 3 (5y)";
      cefr = "A0";
    } else if (/\b(?:lp\s*starter\s*a|lp-sta)\b/i.test(s)) {
      sourceAgeGroup = "lower-primary";
      sourceStageName = "Lower Primary (6–8y)";
      cefr = "A0";
      baseLevel = "LP Starter A";
    } else if (/\b(?:lp\s*starter\s*b|lp-stb)\b/i.test(s)) {
      sourceAgeGroup = "lower-primary";
      sourceStageName = "Lower Primary (6–8y)";
      cefr = "A0";
      baseLevel = "LP Starter B";
    } else if (/\b(?:starter\s*a|sta)\b/i.test(s)) {
      sourceAgeGroup = "lower-primary";
      sourceStageName = "Lower Primary (6–8y)";
      cefr = "A0";
      baseLevel = "Starter A";
    } else if (/\b(?:up\s*starter\s*b|up-stb)\b/i.test(s)) {
      sourceAgeGroup = "upper-primary";
      sourceStageName = "Upper Primary (9–11y)";
      cefr = "A0";
      baseLevel = "UP Starter B";
    } else if (/\b(?:starter\s*b|stb)\b/i.test(s)) {
      sourceAgeGroup = currentAcademicAge >= 9 ? "upper-primary" : "lower-primary";
      sourceStageName = sourceAgeGroup === "upper-primary" ? "Upper Primary (9–11y)" : "Lower Primary (6–8y)";
      cefr = "A0";
      baseLevel = "Starter B";
    } else if (/\b(?:primary\s*plus\s*1|priplus1|pp1)\b/i.test(s)) {
      sourceAgeGroup = currentAcademicAge >= 9 ? "upper-primary" : "lower-primary";
      sourceStageName = sourceAgeGroup === "upper-primary" ? "Upper Primary (9–11y)" : "Lower Primary (6–8y)";
      cefr = "A1";
      baseLevel = "Primary Plus 1";
    } else if (/\b(?:primary\s*plus\s*2|priplus2|pp2)\b/i.test(s)) {
      sourceAgeGroup = currentAcademicAge >= 9 ? "upper-primary" : "lower-primary";
      sourceStageName = sourceAgeGroup === "upper-primary" ? "Upper Primary (9–11y)" : "Lower Primary (6–8y)";
      cefr = "A1";
      baseLevel = "Primary Plus 2";
    } else if (/\b(?:primary\s*plus\s*3|priplus3|pp3)\b/i.test(s)) {
      sourceAgeGroup = (currentAcademicAge <= 8 || /lp/i.test(s)) ? "lower-primary" : "upper-primary";
      sourceStageName = sourceAgeGroup === "upper-primary" ? "Upper Primary (9–11y)" : "Lower Primary (6–8y)";
      cefr = "A2";
      baseLevel = "Primary Plus 3";
    } else if (/\b(?:primary\s*plus\s*4|priplus4|pp4)\b/i.test(s)) {
      sourceAgeGroup = "upper-primary";
      sourceStageName = "Upper Primary (9–11y)";
      cefr = "A2";
      baseLevel = "Primary Plus 4";
    } else if (/\b(?:primary\s*plus\s*5|priplus5|pp5)\b/i.test(s)) {
      sourceAgeGroup = "upper-primary";
      sourceStageName = "Upper Primary (9–11y)";
      cefr = "B1";
      baseLevel = "Primary Plus 5";
    } else if (/\b(?:primary\s*plus\s*6|priplus6|pp6)\b/i.test(s)) {
      sourceAgeGroup = "upper-primary";
      sourceStageName = "Upper Primary (9–11y)";
      cefr = "B1";
      baseLevel = "Primary Plus 6";
    } else if (/\bupper\s*secondary|usec\b/i.test(s)) {
      sourceAgeGroup = "upper-secondary";
      sourceStageName = "Upper Secondary (15–17y)";
      if (/a1/i.test(s)) cefr = "A1";
      else if (/a2/i.test(s)) cefr = "A2";
      else if (/b1/i.test(s)) cefr = "B1";
      else if (/b2/i.test(s)) cefr = "B2";
      else if (/c1/i.test(s)) cefr = "C1";
    } else if (/\blower\s*secondary|lsec\b/i.test(s)) {
      sourceAgeGroup = "lower-secondary";
      sourceStageName = "Lower Secondary (12–14y)";
      if (/a1/i.test(s)) cefr = "A1";
      else if (/a2/i.test(s)) cefr = "A2";
      else if (/b1/i.test(s)) cefr = "B1";
      else if (/b2/i.test(s)) cefr = "B2";
    } else if (/\bsecondary\s*plus|secplus\b/i.test(s)) {
      sourceAgeGroup = currentAcademicAge >= 15 ? "upper-secondary" : "lower-secondary";
      sourceStageName = sourceAgeGroup === "upper-secondary" ? "Upper Secondary (15–17y)" : "Lower Secondary (12–14y)";
      if (/a1/i.test(s)) cefr = "A1";
      else if (/a2/i.test(s)) cefr = "A2";
      else if (/b1/i.test(s)) cefr = "B1";
      else if (/b2/i.test(s)) cefr = "B2";
      else if (/c1/i.test(s)) cefr = "C1";
    }

    // Check if the student has crossed into a new age category
    const hasAgedUp = Boolean(
      sourceAgeGroup &&
      targetAgeGroup &&
      sourceAgeGroup !== targetAgeGroup &&
      (
        (sourceAgeGroup === "ey2" && currentAcademicAge >= 5) ||
        (sourceAgeGroup === "ey3" && currentAcademicAge >= 6) ||
        (sourceAgeGroup === "lower-primary" && currentAcademicAge >= 9) ||
        (sourceAgeGroup === "upper-primary" && currentAcademicAge >= 12) ||
        (sourceAgeGroup === "lower-secondary" && currentAcademicAge >= 15) ||
        ((sourceAgeGroup === "upper-secondary" || sourceAgeGroup === "lower-secondary") && currentAcademicAge >= 18)
      )
    );

    if (!hasAgedUp) {
      return {
        hasAgedUp: false,
        sourceAgeGroup,
        targetAgeGroup,
        sourceStageName,
        targetStageName,
        cefr,
        recommendedLevel: null,
      };
    }

    // 3. Resolve exact level in NEW age group according to BC Progression Chart
    let recommendedLevel = targetLevel;
    let transitionReasonEn = "";
    let transitionReasonAr = "";

    // CASE A: Lower Primary (6–8) -> Upper Primary (9–11)
    if (sourceAgeGroup === "lower-primary" && targetAgeGroup === "upper-primary") {
      if (cefr === "A0") {
        if (baseLevel === "Starter B" || baseLevel === "LP Starter B") {
          recommendedLevel = isUpgradeReady ? "UP Primary Plus 1" : "UP Starter B";
        } else {
          recommendedLevel = "UP Starter B";
        }
      } else if (cefr === "A1") {
        if (baseLevel === "Primary Plus 1" || baseLevel === "LP Primary Plus 1") {
          recommendedLevel = isUpgradeReady ? "UP Primary Plus 2" : "UP Primary Plus 1";
        } else {
          // Primary Plus 2 (A1 completed if upgraded)
          recommendedLevel = isUpgradeReady ? "UP Primary Plus 3" : "UP Primary Plus 2";
        }
      } else if (cefr === "A2") {
        // Primary Plus 3 (A2.1)
        recommendedLevel = isUpgradeReady ? "Primary Plus 4" : "UP Primary Plus 3";
      }
      transitionReasonEn = `Age Transition (Ages 6–8 → 9–11 Upper Primary): Student aged up to ${currentAcademicAge} years. Capped by CEFR ${cefr} progression chart to ${recommendedLevel}.`;
      transitionReasonAr = `انتقال مرحلة عمرية (من Lower Primary إلى Upper Primary سن ${currentAcademicAge} سنة): استناداً لجدول مسار المراحل، ينتقل لمستوى ${recommendedLevel} المكافئ لمستواه في CEFR (${cefr}).`;
    }

    // CASE B: Upper Primary (9–11) -> Lower Secondary (12–14)
    else if (sourceAgeGroup === "upper-primary" && targetAgeGroup === "lower-secondary") {
      if (cefr === "A0") {
        recommendedLevel = "Secondary Plus A1";
      } else if (cefr === "A1") {
        if (baseLevel === "Primary Plus 1") {
          recommendedLevel = "Secondary Plus A1";
        } else {
          // Primary Plus 2 (completed A1 if upgraded)
          recommendedLevel = isUpgradeReady ? "Secondary Plus A2" : "Secondary Plus A1";
        }
      } else if (cefr === "A2") {
        if (baseLevel === "Primary Plus 3") {
          recommendedLevel = isUpgradeReady ? "Secondary Plus A2" : "Secondary Plus A2";
        } else {
          // Primary Plus 4 (completed A2 if upgraded)
          recommendedLevel = isUpgradeReady ? "Secondary Plus B1.2" : "Secondary Plus A2";
        }
      } else if (cefr === "B1") {
        if (baseLevel === "Primary Plus 5") {
          recommendedLevel = "Secondary Plus B1.2";
        } else {
          // Primary Plus 6 (completed B1 if upgraded)
          recommendedLevel = isUpgradeReady ? "Secondary Plus B2.2" : "Secondary Plus B1.2";
        }
      }
      transitionReasonEn = `Age Transition (Primary → Lower Secondary 12–14y): Student reached academic age ${currentAcademicAge}y. Chart maps Primary Plus (${cefr}) to Lower Secondary ${recommendedLevel}.`;
      transitionReasonAr = `انتقال مرحلة عمرية (من الابتدائي إلى Lower Secondary سن ${currentAcademicAge} سنة): ينتقل الطالب من Primary Plus إلى ${recommendedLevel} حسب المستوى اللغوي في جدول المجلس الثقافي البريطاني (${cefr}).`;
    }

    // CASE C: Lower Secondary (12–14) -> Upper Secondary (15–17)
    else if (sourceAgeGroup === "lower-secondary" && targetAgeGroup === "upper-secondary") {
      if (cefr === "A1") {
        recommendedLevel = isUpgradeReady ? "Upper Secondary Plus A2" : "Upper Secondary Plus A1";
      } else if (cefr === "A2") {
        recommendedLevel = isUpgradeReady ? "Upper Secondary Plus B1.1" : "Upper Secondary Plus A2";
      } else if (cefr === "B1") {
        recommendedLevel = isUpgradeReady ? "Upper Secondary Plus B2.1" : "Upper Secondary Plus B1.1";
      } else if (cefr === "B2") {
        recommendedLevel = isUpgradeReady ? "Upper Secondary Plus C1.1" : "Upper Secondary Plus B2.1";
      }
      transitionReasonEn = `Age Transition (Lower Secondary → Upper Secondary 15–17y): Student reached academic age ${currentAcademicAge}y. Chart maps to Upper Secondary ${recommendedLevel}.`;
      transitionReasonAr = `انتقال مرحلة عمرية (من الإعدادي إلى Upper Secondary سن ${currentAcademicAge} سنة): ينتقل الطالب لمستوى ${recommendedLevel} المخصص لسن (15–17 سنة).`;
    }

    // CASE D: Secondary (12–17) -> Adult (18+)
    else if (targetAgeGroup === "adult") {
      if (cefr === "A1") recommendedLevel = isUpgradeReady ? "BCE A2" : "BCE A1";
      else if (cefr === "A2") recommendedLevel = isUpgradeReady ? "BCE B1" : "BCE A2";
      else if (cefr === "B1") recommendedLevel = isUpgradeReady ? "BCE B2" : "BCE B1";
      else if (cefr === "B2") recommendedLevel = isUpgradeReady ? "BCE C1" : "BCE B2";
      else if (cefr === "C1") recommendedLevel = "BCE C1 / IELTS";
      transitionReasonEn = `Age Transition (Student turned 18+ — Adult): Capped by CEFR ${cefr} progression chart to Adult General English (${recommendedLevel}).`;
      transitionReasonAr = `انتقال مرحلة عمرية (أتم الطالب 18 سنة — كبار بالغين): ينتقل من برامج الصغار إلى اللغة الإنجليزية للكبار (${recommendedLevel}) حسب مستواه (${cefr}).`;
    }

    // CASE E: Early Years (4–5) -> Lower Primary (6–8)
    else if ((sourceAgeGroup === "ey2" || sourceAgeGroup === "ey3") && targetAgeGroup === "lower-primary") {
      recommendedLevel = "LP Starter A";
      transitionReasonEn = `Age Transition (Early Years → Lower Primary 6–8y): Student reached academic age ${currentAcademicAge}y. Starts at LP Starter A.`;
      transitionReasonAr = `انتقال مرحلة عمرية (من مرحلة الطفولة المبكرة إلى سن 6–8 سنوات): يبدأ في مستوى LP Starter A.`;
    }

    return {
      hasAgedUp: true,
      sourceAgeGroup,
      sourceStageName,
      targetAgeGroup,
      targetStageName,
      currentAcademicAge,
      cefr,
      recommendedLevel,
      transitionReasonEn,
      transitionReasonAr,
    };
  }

  function extractCanonicalLevel(rawStr, contextLevel = null, ageYears = null) {
    const s = String(rawStr || "").toLowerCase();
    if (!s) return null;
    const ctx = String(contextLevel || "").toLowerCase();

    // Early Years
    if (/\b(?:ey2|early[\s-]*years[\s-]*2|ducks)\b/i.test(s)) return "Early Years 2";
    if (/\b(?:ey3|early[\s-]*years[\s-]*3|owls)\b/i.test(s)) return "Early Years 3";

    // Starters
    if (/\b(?:starter[\s-]*a|starters[\s-]*a|sta)\b/i.test(s)) return "Starter A";
    if (/\b(?:starter[\s-]*b|starters[\s-]*b|stb)\b/i.test(s)) return "Starter B";

    // Primary Plus 1 (Camels)
    if (/\b(?:pp1|priplus1|priplus[\s-]*1|primary[\s-]*plus[\s-]*1|camels)\b/i.test(s)) return "Primary Plus 1";

    // Primary Plus 2 & 3 (Crocodiles) — Crocodiles covers BOTH PP2 & PP3 in Summer
    if (/\b(?:pp3|priplus3|priplus[\s-]*3|primary[\s-]*plus[\s-]*3)\b/i.test(s)) return "Primary Plus 3";
    if (/\b(?:crocodiles)\b/i.test(s)) {
      if (/\b(?:pp3|primary[\s-]*plus[\s-]*3)\b/i.test(ctx)) return "Primary Plus 3";
      return "Primary Plus 2";
    }
    if (/\b(?:pp2|priplus2|priplus[\s-]*2|primary[\s-]*plus[\s-]*2)\b/i.test(s)) return "Primary Plus 2";

    // Primary Plus 4 & 5 (Eagles) — Eagles covers BOTH PP4 & PP5 in Summer
    if (/\b(?:pp5|priplus5|priplus[\s-]*5|primary[\s-]*plus[\s-]*5)\b/i.test(s)) return "Primary Plus 5";
    if (/\b(?:eagles)\b/i.test(s)) {
      if (/\b(?:pp5|primary[\s-]*plus[\s-]*5)\b/i.test(ctx)) return "Primary Plus 5";
      return "Primary Plus 4";
    }
    if (/\b(?:pp4|priplus4|priplus[\s-]*4|primary[\s-]*plus[\s-]*4)\b/i.test(s)) return "Primary Plus 4";

    // Primary Plus 6 (Whales)
    if (/\b(?:pp6|priplus6|priplus[\s-]*6|primary[\s-]*plus[\s-]*6|whales)\b/i.test(s)) return "Primary Plus 6";

    // Upper Secondary Plus A1 (Winter + Summer: US Elementary, USElem, USEC-EL, USA1, CTS-USA1, AIS-USA1)
    if (/\b(?:upper[\s-]*secondary[\s-]*plus[\s-]*a1|upper[\s-]*secondary[\s-]*a1|usec(?:ondary)?[\s-]*plus[\s-]*a1|usecplus[\s-]*a1|usa1|usec[\s-]*elem(?:entary)?|u?s[\s-]*elem(?:entary)?|usec[\s-]*el)\b/i.test(s)) return "Upper Secondary Plus A1";

    // Lower Secondary Plus A1 (Winter + Summer: Secondary Elementary, SecElem, SEC-EL, SA1, SecPlus A1)
    if (/\b(?:lower[\s-]*secondary[\s-]*plus[\s-]*a1|lower[\s-]*secondary[\s-]*a1|lsec(?:ondary)?[\s-]*plus[\s-]*a1|lsecplus[\s-]*a1|secondary[\s-]*plus[\s-]*a1|secplus[\s-]*a1|lsa1|sa1|secondary[\s-]*elem(?:entary)?|sec[\s-]*elem(?:entary)?|sec[\s-]*el)\b/i.test(s)) return "Secondary Plus A1";

    // Upper Secondary Plus A2 (Winter + Summer: US Pre-Intermediate, US Pre Intermediate+, USPI, USA2, CTS-USA2, AIS-USA2, HLP-USPI, CTS-USPI, USec PreInt)
    if (/\b(?:upper[\s-]*secondary[\s-]*plus[\s-]*a2|upper[\s-]*secondary[\s-]*a2|usec(?:ondary)?[\s-]*plus[\s-]*a2|usecplus[\s-]*a2|usa2|usec[\s-]*pi|u?s[\s-]*pi|usec[\s-]*pre[\s-]*int(?:ermediate)?(?:\+)?|u?s[\s-]*pre[\s-]*int(?:ermediate)?(?:\+)?)\b/i.test(s)) return "Upper Secondary Plus A2";

    // Lower Secondary Plus A2 (Winter + Summer: Secondary Pre Int, Sec Pre-Int, SecPI, SEC-SA2, SecPlus A2)
    if (/\b(?:lower[\s-]*secondary[\s-]*plus[\s-]*a2|lower[\s-]*secondary[\s-]*a2|lsec(?:ondary)?[\s-]*plus[\s-]*a2|lsecplus[\s-]*a2|secondary[\s-]*plus[\s-]*a2|secplus[\s-]*a2|lsa2|sa2|sec[\s-]*pi|lower[\s-]*secondary[\s-]*pre[\s-]*int(?:ermediate)?(?:\+)?|secondary[\s-]*pre[\s-]*int(?:ermediate)?(?:\+)?|sec[\s-]*pre[\s-]*int(?:ermediate)?(?:\+)?)\b/i.test(s)) return "Secondary Plus A2";

    // Upper Secondary Plus B2.1
    if (/\b(?:upper[\s-]*secondary[\s-]*plus[\s-]*b2\.1|usec(?:ondary)?[\s-]*plus[\s-]*b2\.1|usecplus[\s-]*b2\.1|usb2\.1|usa[\s-]*b2\.1)\b/i.test(s)) return "Upper Secondary Plus B2.1";

    // Upper Secondary Plus B1.1
    if (/\b(?:upper[\s-]*secondary[\s-]*plus[\s-]*b1\.1|usec(?:ondary)?[\s-]*plus[\s-]*b1\.1|usecplus[\s-]*b1\.1|usb1\.1|usa[\s-]*b1\.1)\b/i.test(s)) return "Upper Secondary Plus B1.1";

    // Upper Secondary Summer: US Intermediate+ covers BOTH B1.1 & B2.1
    if (/\b(?:u?s[\s-]*int(?:ermediate)?(?:\+)?|usec[\s-]*int(?:ermediate)?(?:\+)?|upper[\s-]*secondary[\s-]*int(?:ermediate)?(?:\+)?)\b/i.test(s)) {
      if (/\b(?:b2\.1|b2)\b/i.test(ctx)) return "Upper Secondary Plus B2.1";
      return "Upper Secondary Plus B1.1";
    }

    // Lower Secondary Plus B2.2
    if (/\b(?:lower[\s-]*secondary[\s-]*plus[\s-]*b2\.2|secondary[\s-]*plus[\s-]*b2\.2|lsecplus[\s-]*b2\.2|secplus[\s-]*b2\.2|secb2\.2)\b/i.test(s)) return "Secondary Plus B2.2";

    // Lower Secondary Plus B1.2
    if (/\b(?:lower[\s-]*secondary[\s-]*plus[\s-]*b1\.2|secondary[\s-]*plus[\s-]*b1\.2|lsecplus[\s-]*b1\.2|secplus[\s-]*b1\.2|secb1\.2)\b/i.test(s)) return "Secondary Plus B1.2";

    // Lower Secondary Summer: Secondary Intermediate+ covers BOTH B1.2 & B2.2
    if (/\b(?:sec(?:ondary)?[\s-]*int(?:ermediate)?(?:\+)?|lower[\s-]*secondary[\s-]*int(?:ermediate)?(?:\+)?)\b/i.test(s)) {
      if (/\b(?:b2\.2|b2)\b/i.test(ctx)) return "Secondary Plus B2.2";
      return "Secondary Plus B1.2";
    }

    // Upper Secondary Plus C1.1 (Winter + Summer US C1)
    if (/\b(?:upper[\s-]*secondary[\s-]*plus[\s-]*c1(?:\.1)?|usec(?:ondary)?[\s-]*plus[\s-]*c1(?:\.1)?|usecplus[\s-]*c1(?:\.1)?|u?sc1(?:\.1)?|u?s[\s-]*c1|upper[\s-]*secondary[\s-]*c1|secondary[\s-]*c1)\b/i.test(s)) return "Upper Secondary Plus C1.1";

    // Standalone CEFR level in SAP header (e.g. "A1", "A2", "B1", "B2", "C1")
    const isUpper = (ageYears != null && ageYears >= 15) || /\b(?:upper|usec|us)\b/i.test(ctx);
    if (/^\s*a1\s*$/i.test(s)) return isUpper ? "Upper Secondary Plus A1" : "Secondary Plus A1";
    if (/^\s*a2\s*$/i.test(s)) return isUpper ? "Upper Secondary Plus A2" : "Secondary Plus A2";
    if (/^\s*b1(?:\.1)?\s*$/i.test(s)) return isUpper ? "Upper Secondary Plus B1.1" : "Secondary Plus B1.2";
    if (/^\s*b1\.2\s*$/i.test(s)) return "Secondary Plus B1.2";
    if (/^\s*b2(?:\.1)?\s*$/i.test(s)) return isUpper ? "Upper Secondary Plus B2.1" : "Secondary Plus B2.2";
    if (/^\s*b2\.2\s*$/i.test(s)) return "Secondary Plus B2.2";
    if (/^\s*c1(?:\.1)?\s*$/i.test(s)) return "Upper Secondary Plus C1.1";

    return null;
  }

  function extractBookingDatesAndTerm(b) {
    const combined = `${b.courseCode || ""} ${b.courseDescription || ""} ${b.className || ""} ${b.session || ""}`;
    let startDt = b.startDate ? parseFlexibleDate(b.startDate) : null;
    let endDt = b.endDate ? parseFlexibleDate(b.endDate) : null;

    if (!startDt || !endDt) {
      const m = String(b.session || "").match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})/);
      if (m) {
        if (!startDt) startDt = parseFlexibleDate(m[1]);
        if (!endDt) endDt = parseFlexibleDate(m[2]);
      }
    }
    const refDt = startDt || parseFlexibleDate(b.bookingDate);

    // Academic year starts Sep 1 and ends with the end of Summer (Aug 31)
    let acadStartYear = null;
    if (refDt) {
      const m = refDt.getMonth(); // 0=Jan .. 8=Sep
      const d = refDt.getDate();
      acadStartYear = (m >= 8 || (m === 7 && d >= 25)) ? refDt.getFullYear() : refDt.getFullYear() - 1;
    }
    const academicYear = acadStartYear ? `${acadStartYear}/${acadStartYear + 1}` : "Unknown";

    // Check if Summer or Winter
    const explicitWinterM = combined.match(/\b(?:Term|T)\s*([1-4])\b/i);
    const explicitSummerM = combined.match(/\b(?:SC|S|Summer\s*(?:Camp\s*)?|Camp\s*|Session\s*)([1-3])\b/i);
    const hasSummerKeyword = /\b(?:summer|camp|camels|crocodiles|eagles|whales|hol\s*\/\s*int)\b/i.test(combined);
    const isSummerMonth = startDt ? (startDt.getMonth() === 6 || (startDt.getMonth() === 7 && startDt.getDate() < 25)) : false;

    let season = "Winter";
    let term = null;

    if (explicitSummerM || ((hasSummerKeyword || isSummerMonth) && !explicitWinterM)) {
      season = "Summer";
      const sNum = explicitSummerM ? explicitSummerM[1] : null;
      if (sNum) {
        term = `S${sNum}`;
      } else if (startDt) {
        const dayOfYear = startDt.getMonth() === 6 ? startDt.getDate() : 31 + startDt.getDate();
        if (dayOfYear <= 19) term = "S1";
        else if (dayOfYear <= 38) term = "S2";
        else term = "S3";
      } else {
        term = "S1";
      }
    } else {
      season = "Winter";
      if (explicitWinterM) {
        term = `T${explicitWinterM[1]}`;
      } else if (startDt) {
        const m = startDt.getMonth();
        if (m >= 8 && m <= 9) term = "T1";
        else if (m >= 10 && m <= 11) term = "T2";
        else if (m >= 0 && m <= 2) term = "T3";
        else term = "T4";
      }
    }

    return { startDt, endDt, refDt, acadStartYear, academicYear, season, term };
  }

  function countEffectiveSummerTerms(summerSet) {
    // Summer has 3 terms (S1, S2, S3). S1 and S3 share identical curriculum/content!
    // Allowed combinations: S1+S2 or S2+S3 (max 2 unique summer terms). S1+S3 counts as 1 unique content unit.
    const hasS1OrS3 = summerSet.has("S1") || summerSet.has("S3");
    const hasS2 = summerSet.has("S2");
    return (hasS1OrS3 ? 1 : 0) + (hasS2 ? 1 : 0);
  }

  /**
   * Progression rules for Adults (18+):
   * 1. Advanced / General English (A1, A2, B1, B2, C1, C2 - British Council English):
   *    - No lecture/term count, no /4 terms.
   *    - We do NOT suggest any new level. Just read and display what is written on the record!
   *    - recommendedBookingLevel is the current level.
   *
   * 2. Beginner Courses (Beg A, Beg B, Beg C, Beg D, and rare Beg E):
   *    - Structured linear levels: Beg A -> Beg B -> Beg C -> Beg D -> (Beg E if in note / else A1)
   *    - Must be passed ("Completed with Success"):
   *      - Passed Beg A -> Beg B
   *      - Passed Beg B -> Beg C
   *      - Passed Beg C -> Beg D
   *      - Passed Beg D: check notes. If note mentions Beg E -> Beg E, else -> A1
   *      - Passed Beg E -> A1
   *    - If currently booked/in progress, stays at currently booked level.
   *    - If no passed courses, stays at assigned level from notes/placement.
   */
  function calculateAdultProgression(profile, bookings = [], now = new Date()) {
    const rawLvl = String((profile && profile.level) || "").trim();
    const rawNotes = [
      profile && profile.detectedLevelFromNotes,
      profile && profile.notesAndHolds && profile.notesAndHolds.join(" "),
      profile && profile.studentNotes,
      profile && Array.isArray(profile.notesList) ? profile.notesList.map((n) => `${n.title || ""} ${n.text || ""}`).join(" ") : "",
    ].filter(Boolean).join(" ");

    // Check if any note mentions Beg E (rare case for Level E complimentary / special note)
    const hasBegENote = /\b(?:beg(?:inner)?|level)[\s\-_]*e\b/i.test(rawNotes);

    // Helper to extract Beginner level letter (A, B, C, D, E) from a string
    const parseBegLevel = (str) => {
      const s = String(str || "");
      const m = s.match(/\b(?:BEG(?:INNER)?|LEVEL)[\s\-_]*([A-E])\b/i) || s.match(/\bBeg\s+([A-E])\b/i);
      if (m) return `Beg ${m[1].toUpperCase()}`;
      if (/\bA0\b/i.test(s)) return "Beg A";
      return null;
    };

    // 1. Scan student's booking history for Beginner courses
    const parsedBegBookings = [];
    (bookings || []).forEach((b) => {
      const desc = `${b.courseCode || ""} ${b.courseDescription || ""} ${b.className || ""}`;
      const status = String(b.status || "").trim();
      if (/ylcon|adcon|consultation|placement|\bpt\b/i.test(desc)) return;
      if (/cancel/i.test(status)) return;

      const lvl = parseBegLevel(desc) || parseBegLevel(b.courseDescription) || parseBegLevel(b.className);
      if (lvl || /AD Beg|Beginner/i.test(desc)) {
        const detectedLvl = lvl || "Beg A";
        const isPassed = /completed\s+with\s+success/i.test(status) ||
          (/complet/i.test(status) && !/fail|cancel|withdr/i.test(status));
        const isBooked = /booked/i.test(status) && !isPassed;
        parsedBegBookings.push({
          raw: b,
          level: detectedLvl,
          status,
          isPassed,
          isBooked,
          bookingDate: b.bookingDate,
          dt: parseFlexibleDate(b.bookingDate) || parseFlexibleDate(b.startDate) || new Date(0),
        });
      }
    });

    // Sort newest booking first
    parsedBegBookings.sort((a, b) => b.dt.getTime() - a.dt.getTime());

    // Check if student is in Beginner or Advanced English
    const profileBegLevel = parseBegLevel(rawLvl) || parseBegLevel(rawNotes);
    const hasAnyBegBooking = parsedBegBookings.length > 0;
    const isBeginner = Boolean(profileBegLevel || hasAnyBegBooking || /^A0\b/i.test(rawLvl));

    if (isBeginner) {
      const passedBookings = parsedBegBookings.filter((b) => b.isPassed);
      const activeBooking = parsedBegBookings.find((b) => b.isBooked);

      // Check which levels have been passed with success
      const passedSet = new Set(passedBookings.map((b) => b.level));
      let currentLevel = profileBegLevel || (activeBooking ? activeBooking.level : (passedBookings[0] ? passedBookings[0].level : "Beg A"));
      let recommendedBookingLevel = currentLevel;
      let isUpgradeReadyNow = false;
      let nextLevel = currentLevel;
      let passedLevel = null;
      let advisorNoteEn = "";
      let advisorNoteAr = "";

      if (passedSet.has("Beg E")) {
        passedLevel = "Beg E";
        currentLevel = "Beg E";
        nextLevel = "A1";
        recommendedBookingLevel = "BCE A1";
        isUpgradeReadyNow = true;
        advisorNoteEn = "Passed Beginner E with Success -> Move to Adult General English A1 (BCE).";
        advisorNoteAr = "اجتاز مستوى Beginner E بنجاح -> ينتقل إلى المستوى المتقدم A1 (BCE).";
      } else if (passedSet.has("Beg D")) {
        passedLevel = "Beg D";
        currentLevel = "Beg D";
        if (hasBegENote) {
          nextLevel = "Beg E";
          recommendedBookingLevel = "Beg E";
          isUpgradeReadyNow = true;
          advisorNoteEn = "Passed Beginner D with Success. Student note specifies Beginner E -> Book Beg E.";
          advisorNoteAr = "اجتاز مستوى Beginner D بنجاح، ومسجل في الملاحظات دخول Beg E -> ينتقل إلى Beg E.";
        } else {
          nextLevel = "A1";
          recommendedBookingLevel = "BCE A1";
          isUpgradeReadyNow = true;
          advisorNoteEn = "Passed Beginner D with Success -> Move to Adult General English A1 (BCE).";
          advisorNoteAr = "اجتاز مستوى Beginner D بنجاح -> ينتقل إلى المستوى المتقدم A1 (BCE).";
        }
      } else if (passedSet.has("Beg C")) {
        passedLevel = "Beg C";
        currentLevel = "Beg C";
        nextLevel = "Beg D";
        recommendedBookingLevel = "Beg D";
        isUpgradeReadyNow = true;
        advisorNoteEn = "Passed Beginner C with Success -> Progress to Beginner D.";
        advisorNoteAr = "اجتاز مستوى Beg C بنجاح -> ينتقل إلى Beg D.";
      } else if (passedSet.has("Beg B")) {
        passedLevel = "Beg B";
        currentLevel = "Beg B";
        nextLevel = "Beg C";
        recommendedBookingLevel = "Beg C";
        isUpgradeReadyNow = true;
        advisorNoteEn = "Passed Beginner B with Success -> Progress to Beginner C.";
        advisorNoteAr = "اجتاز مستوى Beg B بنجاح -> ينتقل إلى Beg C.";
      } else if (passedSet.has("Beg A")) {
        passedLevel = "Beg A";
        currentLevel = "Beg A";
        nextLevel = "Beg B";
        recommendedBookingLevel = "Beg B";
        isUpgradeReadyNow = true;
        advisorNoteEn = "Passed Beginner A with Success -> Progress to Beginner B.";
        advisorNoteAr = "اجتاز مستوى Beg A بنجاح -> ينتقل إلى Beg B.";
      } else {
        currentLevel = profileBegLevel || (activeBooking ? activeBooking.level : "Beg A");
        recommendedBookingLevel = currentLevel;
        nextLevel = currentLevel;
        isUpgradeReadyNow = false;
        advisorNoteEn = `Assigned to ${currentLevel}. Complete and pass with success to advance to next level.`;
        advisorNoteAr = `المستوى المسجل هو ${currentLevel}. يلزم النجاح واجتياز المستوى للانتقال للمستوى التالي.`;
      }

      // If student is currently active/booked in the next level, they are already taking it
      if (activeBooking && activeBooking.level === recommendedBookingLevel) {
        isUpgradeReadyNow = false;
        currentLevel = activeBooking.level;
      }

      return {
        isAdult: true,
        isAdultBeginner: true,
        isAdultGeneral: false,
        targetLevel: currentLevel,
        currentLevel,
        passedLevel,
        recommendedBookingLevel,
        nextLevel,
        isUpgradeReadyNow,
        isUpgradeReadyAfterPrebooked: false,
        totalEffectiveBooked: 0,
        totalEffectiveProjected: 0,
        passedBookings,
        activeBooking,
        hasBegENote,
        advisorNoteEn,
        advisorNoteAr,
        winterBooked: [],
        winterProjected: [],
        summerBooked: [],
        summerProjected: [],
        missingWinterTerms: [],
        repeatedTerms: [],
      };
    }

    // 2. Adult Advanced / General English (A1, A2, B1, B2, C1, C2)
    // Rule: "ملهوش عدد محاضرات او ترمات او اي حاجه و مش هنقترح ليه اي ليفل جديد انت بس اقراء المكتوب"
    // Just read whatever level is written on their record!
    const cefrMatch = rawLvl.match(/\b([A-C][12])(?:\.[12])?\b/i) || rawNotes.match(/\b([A-C][12])(?:\.[12])?\b/i);
    const cefr = cefrMatch ? cefrMatch[1].toUpperCase() : "";
    let generalLevel = rawLvl;
    if (/primary|secondary|starter|early\s*years/i.test(rawLvl)) {
      // YL level on adult record -> CEFR equivalent in BCE
      generalLevel = cefr ? `BCE ${cefr}` : "British Council English";
    } else if (cefr && !/bce|british council/i.test(generalLevel)) {
      generalLevel = `BCE ${cefr}`;
    } else if (!generalLevel) {
      generalLevel = "British Council English";
    }

    return {
      isAdult: true,
      isAdultBeginner: false,
      isAdultGeneral: true,
      targetLevel: generalLevel,
      currentLevel: generalLevel,
      recommendedBookingLevel: generalLevel, // Same level, NO new level proposed!
      nextLevel: null,
      isUpgradeReadyNow: false,
      isUpgradeReadyAfterPrebooked: false,
      totalEffectiveBooked: 0,
      totalEffectiveProjected: 0,
      advisorNoteEn: "Adult General English: Level determined directly from official record.",
      advisorNoteAr: "اللغة الإنجليزية للكبار: المستوى محدد مباشرة حسب السجل دون مقترح ليفل إضافي.",
      winterBooked: [],
      winterProjected: [],
      summerBooked: [],
      summerProjected: [],
      missingWinterTerms: [],
      repeatedTerms: [],
    };
  }

  /**
   * Calculates Young Learner / Academic Progression, Term Completion, Summer Deduplication,
   * Level Upgrade Eligibility, and Smart Advisor Note for what to book next.
   */
  function calculateAcademicProgression(profile, bookings = [], now = new Date()) {
    const ageInfo = profile && profile.dob ? calculateDetailedAge(profile.dob, now) : null;
    const currentAcademicAge = ageInfo ? ageInfo.academicYears : null;
    const isAdult = !!(ageInfo && (ageInfo.stageCategory === "Adult" || ageInfo.years >= 18 || (currentAcademicAge != null && currentAcademicAge >= 18)));

    if (isAdult) {
      const adultProg = calculateAdultProgression(profile, bookings, now);
      // Check if student had a cross-age transition from Young Learner
      const rawLvl = String((profile && profile.level) || "").trim();
      if (/primary|secondary|early\s*years|starter|pre-school|ducks|owls|sec\b/i.test(rawLvl)) {
        const ageTransition = resolveCrossAgeProgression({
          targetLevel: rawLvl,
          currentAcademicAge: (ageInfo && ageInfo.years) || currentAcademicAge || 18,
          isUpgradeReady: false,
        });
        if (ageTransition && ageTransition.hasAgedUp) {
          adultProg.ageTransition = ageTransition;
        }
      }
      return adultProg;
    }

    const curMonth = now.getMonth();
    const curDay = now.getDate();
    const currentAcadStartYear = (curMonth >= 8 || (curMonth === 7 && curDay >= 25)) ? now.getFullYear() : now.getFullYear() - 1;
    const currentAcademicYear = `${currentAcadStartYear}/${currentAcadStartYear + 1}`;

    // Determine current & upcoming registration period based on today's date
    let currentPeriodTerm = "T1";
    let nextPeriodTerm = "T2";
    let periodDescription = "Term 1 (Sep – Nov)";
    if (curMonth === 8 || (curMonth === 9 && curDay <= 20)) {
      currentPeriodTerm = "T1";
      nextPeriodTerm = "T2";
      periodDescription = "Term 1 (Sep – Nov)";
    } else if (curMonth === 9 || curMonth === 10 || curMonth === 11 || (curMonth === 0 && curDay <= 15)) {
      currentPeriodTerm = "T2";
      nextPeriodTerm = "T3";
      periodDescription = "Term 2 (Nov – Jan)";
    } else if (curMonth === 0 || curMonth === 1 || curMonth === 2) {
      currentPeriodTerm = "T3";
      nextPeriodTerm = "T4";
      periodDescription = "Term 3 (Jan – Apr)";
    } else if (curMonth === 3 || curMonth === 4 || (curMonth === 5 && curDay <= 20)) {
      currentPeriodTerm = "T4";
      nextPeriodTerm = "Summer (S1 / S2)";
      periodDescription = "Term 4 (Apr – Jun)";
    } else {
      currentPeriodTerm = "Summer";
      nextPeriodTerm = "T1";
      periodDescription = "Summer Camps (Jul – Aug)";
    }

    // Parse all non-cancelled, non-consultation course bookings
    const parsedRecords = [];
    bookings.forEach((b) => {
      const desc = `${b.courseCode || ""} ${b.courseDescription || ""} ${b.className || ""}`;
      if (/ylcon|adcon|consultation|placement|\bpt\b|assessment/i.test(desc)) return;
      const status = String(b.status || "").toLowerCase();
      if (status.includes("cancel")) return;

      const targetHint = profile && profile.level;
      const canonLevel = extractCanonicalLevel(desc, targetHint, currentAcademicAge) || extractCanonicalLevel(profile && profile.level, null, currentAcademicAge);
      if (!canonLevel) return;

      const info = extractBookingDatesAndTerm(b);
      const bookDt = parseFlexibleDate(b.bookingDate);
      const actionDt = bookDt || info.startDt || info.refDt;
      const isPrebooked = status.includes("prebook") || status.includes("reserv") || status.includes("wait");
      const isBooked = !isPrebooked && (status.includes("book") || status.includes("complet") || status === "");

      parsedRecords.push({
        raw: b,
        level: canonLevel,
        status: b.status || "Booked",
        isBooked,
        isPrebooked,
        bookDt,
        actionDt,
        ...info,
      });
    });

    // Helper to align cross-age CEFR equivalent levels
    function alignLevelWithAge(lvl) {
      if (!lvl) return null;
      if (currentAcademicAge >= 15) {
        if (lvl === "Secondary Plus A1") return "Upper Secondary Plus A1";
        if (lvl === "Secondary Plus A2") return "Upper Secondary Plus A2";
        if (lvl === "Secondary Plus B1.2") return "Upper Secondary Plus B1.1";
        if (lvl === "Secondary Plus B2.2") return "Upper Secondary Plus B2.1";
      }
      return lvl;
    }

    // Helper to match cross-age CEFR equivalent bookings (e.g. student aged up from Lower to Upper Secondary)
    function isMatchingLevel(recordLevel, tgtLevel) {
      if (!recordLevel || !tgtLevel) return false;
      if (recordLevel === tgtLevel) return true;
      const cefrMap = {
        "Secondary Plus A1": "A1",
        "Upper Secondary Plus A1": "A1",
        "Secondary Plus A2": "A2",
        "Upper Secondary Plus A2": "A2",
        "Secondary Plus B1.2": "B1",
        "Upper Secondary Plus B1.1": "B1",
        "Secondary Plus B2.2": "B2",
        "Upper Secondary Plus B2.1": "B2",
        "Upper Secondary Plus C1.1": "C1",
      };
      return !!(cefrMap[recordLevel] && cefrMap[recordLevel] === cefrMap[tgtLevel]);
    }

    // Collect dated level events from Notes & Recommended Academic Levels to compare chronologically with Bookings
    const noteOrRecEvents = [];
    if (profile && Array.isArray(profile.notesList)) {
      profile.notesList.forEach((n) => {
        const dt = parseFlexibleDate(n.createdOn);
        if (!dt) return;
        const txt = `${n.title || ""} ${n.text || ""}`;
        const isNoLvl = Boolean(n.isNoLevel || /\bno\s*level\b|\bnot\s*placed\b|ساقط|راسب/i.test(txt));
        const cLvl = isNoLvl ? "No Level (Failed PT)" : alignLevelWithAge(extractCanonicalLevel(n.detectedLevel || txt, null, currentAcademicAge));
        if (cLvl) {
          noteOrRecEvents.push({
            source: "Note",
            level: cLvl,
            isNoLevel: isNoLvl,
            date: dt,
            dateStr: n.createdOn,
            rawText: n.title || n.text || "",
          });
        }
      });
    }
    if (profile && Array.isArray(profile.recLevels)) {
      profile.recLevels.forEach((r) => {
        const dStr = r.changedOn || (r.timestamp ? r.timestamp.split(" ")[0] : "");
        const dt = parseFlexibleDate(dStr);
        if (!dt || !r.level) return;
        const isNoLvl = /\bno\s*level\b/i.test(r.level);
        const cLvl = isNoLvl ? "No Level (Failed PT)" : alignLevelWithAge(extractCanonicalLevel(r.level, null, currentAcademicAge));
        if (cLvl) {
          noteOrRecEvents.push({
            source: "Recommended Academic Level",
            level: cLvl,
            isNoLevel: isNoLvl,
            date: dt,
            dateStr: dStr,
            rawText: r.level,
          });
        }
      });
    }
    // Sort newest first; if same date, prefer Note over RecLevel
    noteOrRecEvents.sort((a, b) => {
      const diff = b.date.getTime() - a.date.getTime();
      if (diff !== 0) return diff;
      return a.source === "Note" ? -1 : 1;
    });
    const latestOverride = noteOrRecEvents[0] || null;

    const profileCanonLevel = alignLevelWithAge(extractCanonicalLevel(profile && profile.level, null, currentAcademicAge));
    // Sort bookings by chronological action date (bookingDate or startDate) descending so newest booking is first
    const sortedByDate = [...parsedRecords].sort((a, b) => {
      const tB = (b.actionDt ? b.actionDt.getTime() : 0) || (b.refDt ? b.refDt.getTime() : 0);
      const tA = (a.actionDt ? a.actionDt.getTime() : 0) || (a.refDt ? a.refDt.getTime() : 0);
      if (tB !== tA) return tB - tA;
      return ((b.startDt ? b.startDt.getTime() : 0) - (a.startDt ? a.startDt.getTime() : 0));
    });
    const latestBooking = sortedByDate[0] || null;
    const latestBookingTime = latestBooking ? ((latestBooking.actionDt || latestBooking.refDt)?.getTime() || 0) : 0;
    const latestOverrideTime = latestOverride ? latestOverride.date.getTime() : 0;

    let targetLevel = alignLevelWithAge(latestBooking && latestBooking.level) || profileCanonLevel;
    let overriddenByNewerRecord = null;
    let cutoffResetTime = 0;

    if (
      latestOverride &&
      !latestOverride.isNoLevel &&
      latestOverrideTime > 0 &&
      (latestOverrideTime > latestBookingTime ||
        (latestOverrideTime === latestBookingTime && latestOverride.source === "Note" && !isMatchingLevel(latestOverride.level, targetLevel)))
    ) {
      targetLevel = latestOverride.level;
      overriddenByNewerRecord = latestOverride;
      cutoffResetTime = latestOverrideTime;
    } else if (latestBooking && targetLevel) {
      // Check if an earlier Note/RecLevel set or demoted the student to targetLevel after older bookings in another level
      const matchingOverride = noteOrRecEvents.find((ev) => !ev.isNoLevel && isMatchingLevel(ev.level, targetLevel));
      if (matchingOverride) {
        const olderDifferentBooking = sortedByDate.find(
          (r) => !isMatchingLevel(r.level, targetLevel) && ((r.actionDt || r.refDt)?.getTime() || 0) <= matchingOverride.date.getTime()
        );
        if (olderDifferentBooking) {
          cutoffResetTime = matchingOverride.date.getTime();
        }
      }
    }

    if (!targetLevel) {
      return null;
    }

    const levelRecords = parsedRecords.filter((r) => {
      if (!isMatchingLevel(r.level, targetLevel)) return false;
      if (cutoffResetTime > 0) {
        const rTime = (r.actionDt ? r.actionDt.getTime() : 0) || (r.refDt ? r.refDt.getTime() : 0);
        if (rTime > 0 && rTime < cutoffResetTime) return false;
      }
      return true;
    });
    const byYear = {};
    const allWinterBooked = new Set();
    const allWinterProjected = new Set();
    const allSummerBooked = new Set();
    const allSummerProjected = new Set();
    const prebookedTermsList = [];
    const bookedTermsList = [];
    const termOccurrences = {};

    levelRecords.forEach((r) => {
      const yr = r.academicYear || "Unknown";
      if (!byYear[yr]) {
        byYear[yr] = {
          academicYear: yr,
          acadStartYear: r.acadStartYear,
          winterBooked: new Set(),
          winterProjected: new Set(),
          summerBooked: new Set(),
          summerProjected: new Set(),
          records: [],
        };
      }
      byYear[yr].records.push(r);

      if (r.term) {
        termOccurrences[r.term] = (termOccurrences[r.term] || 0) + 1;
        if (r.season === "Summer") {
          allSummerProjected.add(r.term);
          byYear[yr].summerProjected.add(r.term);
          if (r.isBooked) {
            allSummerBooked.add(r.term);
            byYear[yr].summerBooked.add(r.term);
            bookedTermsList.push(`${r.term} (${yr})`);
          } else if (r.isPrebooked) {
            prebookedTermsList.push(`${r.term} (${yr})`);
          }
        } else {
          allWinterProjected.add(r.term);
          byYear[yr].winterProjected.add(r.term);
          if (r.isBooked) {
            allWinterBooked.add(r.term);
            byYear[yr].winterBooked.add(r.term);
            bookedTermsList.push(`${r.term} (${yr})`);
          } else if (r.isPrebooked) {
            prebookedTermsList.push(`${r.term} (${yr})`);
          }
        }
      }
    });

    const hasSummerS1AndS3Conflict = allSummerProjected.has("S1") && allSummerProjected.has("S3");
    const effectiveSummerBookedCount = countEffectiveSummerTerms(allSummerBooked);
    const effectiveSummerProjectedCount = countEffectiveSummerTerms(allSummerProjected);

    const totalEffectiveBooked = allWinterBooked.size + effectiveSummerBookedCount;
    const totalEffectiveProjected = allWinterProjected.size + effectiveSummerProjectedCount;

    // Check if any finished academic year had >= 3 winter terms (Rule: 3 winter terms + year ended => automatic upgrade)
    let upgradedByFinishedYear3Winter = false;
    let finishedYearWith3Winter = null;
    Object.values(byYear).forEach((yObj) => {
      if (yObj.acadStartYear && yObj.acadStartYear < currentAcadStartYear) {
        if (yObj.winterBooked.size >= 3) {
          upgradedByFinishedYear3Winter = true;
          finishedYearWith3Winter = yObj.academicYear;
        }
      }
    });

    const isUpgradeReadyNow = totalEffectiveBooked >= 4 || upgradedByFinishedYear3Winter;
    const isUpgradeReadyAfterPrebooked = !isUpgradeReadyNow && totalEffectiveProjected >= 4;
    const nextLevel = NEXT_LEVEL_MAP[targetLevel] || `Next Level after ${targetLevel}`;

    const missingWinterTerms = ["T1", "T2", "T3", "T4"].filter((t) => !allWinterProjected.has(t));
    const repeatedTerms = Object.keys(termOccurrences).filter((t) => termOccurrences[t] > 1);

    // Check current year's bookings in targetLevel
    const currentYearObj = byYear[currentAcademicYear] || {
      winterBooked: new Set(),
      winterProjected: new Set(),
      summerBooked: new Set(),
      summerProjected: new Set(),
      records: [],
    };
    const hasCurrentPeriodBooked = currentYearObj.winterBooked.has(currentPeriodTerm);
    const hasCurrentPeriodPrebooked = !hasCurrentPeriodBooked && currentYearObj.winterProjected.has(currentPeriodTerm);

    // Build year-by-year breakdown summary
    const yearSummaries = Object.values(byYear)
      .sort((a, b) => (a.acadStartYear || 0) - (b.acadStartYear || 0))
      .map((yObj) => {
        const wTerms = Array.from(yObj.winterProjected).sort();
        const sTerms = Array.from(yObj.summerProjected).sort();
        const count = yObj.winterBooked.size + countEffectiveSummerTerms(yObj.summerBooked);
        const isPast = yObj.acadStartYear && yObj.acadStartYear < currentAcadStartYear;
        let note = "";
        if (isPast && count < 3) {
          note = `Completed ${count} term${count === 1 ? "" : "s"} only (< 3 terms), so student remained in ${targetLevel}`;
        } else if (isPast && yObj.winterBooked.size >= 3) {
          note = `Completed ${yObj.winterBooked.size} Winter terms in finished year — eligible for upgrade`;
        }
        return {
          academicYear: yObj.academicYear,
          winterTerms: wTerms,
          summerTerms: sTerms,
          bookedCount: count,
          isPast,
          note,
        };
      });

    // Determine what the student should book right now
    let recommendedBookingLevel = isUpgradeReadyNow ? nextLevel : targetLevel;
    let recommendedTermToBook = currentPeriodTerm;
    let advisorNoteEn = "";
    let advisorNoteAr = "";

    if (isUpgradeReadyNow) {
      const reasonEn = upgradedByFinishedYear3Winter
        ? `completed 3 Winter terms in finished academic year (${finishedYearWith3Winter})`
        : `completed ${totalEffectiveBooked} distinct terms (${[...allWinterBooked, ...allSummerBooked].join(", ")})`;
      const reasonAr = upgradedByFinishedYear3Winter
        ? `أتم 3 أترام شتوية في السنة الدراسية المنتهية (${finishedYearWith3Winter})`
        : `أتم ${totalEffectiveBooked} أترام مختلفة (${[...allWinterBooked, ...allSummerBooked].join(", ")})`;

      recommendedBookingLevel = nextLevel;
      recommendedTermToBook = currentPeriodTerm;
      advisorNoteEn = `UPGRADE READY → Book ${nextLevel} (${currentPeriodTerm}): Student ${reasonEn} in ${targetLevel}. Eligible for immediate upgrade to ${nextLevel}.`;
      advisorNoteAr = `مستحق للترقية (Upgrade) ← احجز مستوى ${nextLevel} (${currentPeriodTerm}): الطالب ${reasonAr} في ${targetLevel}، ويترقى مباشرة إلى ${nextLevel}.`;
    } else if (isUpgradeReadyAfterPrebooked) {
      const preStr = prebookedTermsList.join(", ");
      const missingBeforePrebook = ["T1", "T2", "T3", "T4"].filter((t) => !allWinterBooked.has(t));
      recommendedBookingLevel = nextLevel;
      recommendedTermToBook = nextPeriodTerm;
      advisorNoteEn = `In ${targetLevel}: Completed ${totalEffectiveBooked}/4 terms (${Array.from(allWinterBooked).sort().join(", ")}) and has ${preStr} Prebooked (reaches 4/4 terms). Confirm ${preStr} now; once finished, upgrade to ${nextLevel} in ${nextPeriodTerm}.`;
      advisorNoteAr = `في مستوى ${targetLevel}: أتم ${totalEffectiveBooked} من 4 أترام (${Array.from(allWinterBooked).sort().join(", ")}) ولديه (${preStr}) محجوز مسبقاً (Prebooked). بعد تأكيد وإتمام هذا الترم يكمل 4 أترام ويترقى إلى ${nextLevel} في ${nextPeriodTerm}.`;
    } else {
      // Student has < 4 terms even including prebooked
      const coveredTerms = [...Array.from(allWinterProjected).sort(), ...Array.from(allSummerProjected).sort()];
      const remainingCount = Math.max(1, 4 - totalEffectiveProjected);
      const nextMissingTerm = missingWinterTerms.includes(currentPeriodTerm)
        ? currentPeriodTerm
        : missingWinterTerms.includes(nextPeriodTerm)
        ? nextPeriodTerm
        : missingWinterTerms[0] || nextPeriodTerm;

      recommendedBookingLevel = targetLevel;
      recommendedTermToBook = nextMissingTerm;

      const repeatNoteEn = repeatedTerms.length > 0 ? ` (Note: ${repeatedTerms.join(", ")} booked across multiple years)` : "";
      const repeatNoteAr = repeatedTerms.length > 0 ? ` (ملاحظة: الترم ${repeatedTerms.join(", ")} مكرر في أكثر من سنة)` : "";

      const prebookStatusEn = hasCurrentPeriodPrebooked
        ? `Currently Prebooked in ${currentPeriodTerm}. `
        : hasCurrentPeriodBooked
        ? `Currently Booked in ${currentPeriodTerm}. `
        : "";
      const prebookStatusAr = hasCurrentPeriodPrebooked
        ? `مسجل حالياً حجزاً مسبقاً (Prebooked) في ${currentPeriodTerm}. `
        : hasCurrentPeriodBooked
        ? `مسجل حالياً (Booked) في ${currentPeriodTerm}. `
        : "";

      advisorNoteEn = `Stay in ${targetLevel} (${totalEffectiveProjected}/4 distinct terms covered: ${coveredTerms.join(", ")}${repeatNoteEn}). ${prebookStatusEn}Next to book: ${targetLevel} — ${nextMissingTerm} (${remainingCount} distinct term${remainingCount > 1 ? "s" : ""} remaining: ${missingWinterTerms.join(", ")}) to complete 4 terms and upgrade to ${nextLevel}.`;
      advisorNoteAr = `يستمر في ${targetLevel} (أنجز ${totalEffectiveProjected} من 4 أترام مختلفة: ${coveredTerms.join("، ")}${repeatNoteAr}). ${prebookStatusAr}المطلوب حجزه للفترة القادمة: ${targetLevel} — ترم ${nextMissingTerm} (متبقي ${remainingCount} ترم لإكمال 4 أترام مختلفة: ${missingWinterTerms.join("، ")}) وبعدها يترقى إلى ${nextLevel}.`;
    }

    if (hasSummerS1AndS3Conflict) {
      advisorNoteEn += " ⚠️ Warning: Summer Camp 1 (S1) and Summer Camp 3 (S3) share identical curriculum; only one counts toward level progression.";
      advisorNoteAr += " ⚠️ تنبيه: الترم الصيفي الأول (S1) والثالث (S3) لهما نفس المحتوى تماماً، لذلك يُحتسب أحدهما فقط.";
    }

    // Check cross-age transition according to British Council Level Progression Chart
    const ageTransition = resolveCrossAgeProgression({
      targetLevel,
      currentAcademicAge,
      isUpgradeReady: isUpgradeReadyNow,
    });

    if (ageTransition && ageTransition.hasAgedUp && ageTransition.recommendedLevel) {
      recommendedBookingLevel = ageTransition.recommendedLevel;
      advisorNoteEn = `[${ageTransition.transitionReasonEn}] ` + advisorNoteEn;
      advisorNoteAr = `[${ageTransition.transitionReasonAr}] ` + advisorNoteAr;
    }

    if (overriddenByNewerRecord) {
      const ovNoteEn = `[Updated by newer ${overriddenByNewerRecord.source} on ${overriddenByNewerRecord.dateStr}: ${overriddenByNewerRecord.level}] `;
      const ovNoteAr = `[تم تحديث المستوى بناءً على أحدث ${overriddenByNewerRecord.source === "Note" ? "ملاحظة (Note)" : "توصية أكاديمية"} بتاريخ ${overriddenByNewerRecord.dateStr} إلى ${overriddenByNewerRecord.level}] `;
      advisorNoteEn = ovNoteEn + advisorNoteEn;
      advisorNoteAr = ovNoteAr + advisorNoteAr;
    }

    return {
      targetLevel,
      nextLevel,
      overriddenByNewerRecord,
      currentAcademicYear,
      currentPeriodTerm,
      nextPeriodTerm,
      periodDescription,
      winterBooked: Array.from(allWinterBooked).sort(),
      winterProjected: Array.from(allWinterProjected).sort(),
      summerBooked: Array.from(allSummerBooked).sort(),
      summerProjected: Array.from(allSummerProjected).sort(),
      totalEffectiveBooked,
      totalEffectiveProjected,
      missingWinterTerms,
      repeatedTerms,
      prebookedTermsList,
      bookedTermsList,
      hasSummerS1AndS3Conflict,
      upgradedByFinishedYear3Winter,
      finishedYearWith3Winter,
      isUpgradeReadyNow,
      isUpgradeReadyAfterPrebooked,
      recommendedBookingLevel,
      recommendedTermToBook,
      yearSummaries,
      advisorNoteEn,
      advisorNoteAr,
      ageTransition: ageTransition && ageTransition.hasAgedUp ? ageTransition : null,
      cefrBand: ageTransition ? ageTransition.cefr : null,
    };
  }

  /**
   * Maps a SAP Header Level (e.g. "Primary Plus 1", "B1.1", "Starter A") + student age to Winter & Summer stream info
   */
  function mapSapLevelToCurriculum(sapLevel, ageInfo) {
    const raw = (sapLevel || "").trim();
    if (!raw || raw.toLowerCase().includes("no level")) {
      return { hasAssignedLevel: false, rawLevel: "No level assigned", winterStream: null, summerEquivalent: null };
    }

    const norm = raw.toLowerCase();
    const isLowerPrimary = ageInfo && ageInfo.academicYears >= 6 && ageInfo.academicYears <= 8;
    const isUpperSecondary = ageInfo && ageInfo.academicYears >= 15 && ageInfo.academicYears <= 17;

    let matchedYl = YL_LEVELS.find((l) => l.name.toLowerCase() === norm);
    if (!matchedYl) {
      if (norm.includes("primary plus 1") || norm === "pp1") {
        matchedYl = YL_LEVELS.find((l) => l.id === (isLowerPrimary ? "lp-pp1" : "up-pp1"));
      } else if (norm.includes("primary plus 2") || norm === "pp2") {
        matchedYl = YL_LEVELS.find((l) => l.id === (isLowerPrimary ? "lp-pp2" : "up-pp2"));
      } else if (norm.includes("primary plus 3") || norm === "pp3") {
        matchedYl = YL_LEVELS.find((l) => l.id === (isLowerPrimary ? "lp-pp3" : "up-pp3"));
      } else if (norm.includes("primary plus 4")) {
        matchedYl = YL_LEVELS.find((l) => l.id === "up-pp4");
      } else if (norm.includes("primary plus 5")) {
        matchedYl = YL_LEVELS.find((l) => l.id === "up-pp5");
      } else if (norm.includes("primary plus 6")) {
        matchedYl = YL_LEVELS.find((l) => l.id === "up-pp6");
      } else if (norm.includes("starter a")) {
        matchedYl = YL_LEVELS.find((l) => l.id === "lp-starter-a");
      } else if (norm.includes("starter b")) {
        matchedYl = YL_LEVELS.find((l) => l.id === (isLowerPrimary ? "lp-starter-b" : "up-starter-b"));
      } else if (norm.includes("ducks") || norm.includes("ey2") || norm.includes("early years 2")) {
        matchedYl = YL_LEVELS.find((l) => l.id === "ey2-ducks");
      } else if (norm.includes("owls") || norm.includes("ey3") || norm.includes("early years 3")) {
        matchedYl = YL_LEVELS.find((l) => l.id === "ey3-owls");
      } else if (norm === "a1" || norm.includes("secondary plus a1") || norm.includes("sa1")) {
        matchedYl = YL_LEVELS.find((l) => l.id === (isUpperSecondary ? "usec-a1" : "sec-a1"));
      } else if (norm === "a2" || norm.includes("secondary plus a2") || norm.includes("sa2")) {
        matchedYl = YL_LEVELS.find((l) => l.id === (isUpperSecondary ? "usec-a2" : "sec-a2"));
      } else if (norm.includes("b1.1") || (norm === "b1" && isUpperSecondary)) {
        matchedYl = YL_LEVELS.find((l) => l.id === "usec-b1-1");
      } else if (norm.includes("b1.2") || norm === "b1") {
        matchedYl = YL_LEVELS.find((l) => l.id === "sec-b1-2");
      } else if (norm.includes("b2.1") || (norm === "b2" && isUpperSecondary)) {
        matchedYl = YL_LEVELS.find((l) => l.id === "usec-b2-1");
      } else if (norm.includes("b2.2") || norm === "b2") {
        matchedYl = YL_LEVELS.find((l) => l.id === "sec-b2-2");
      } else if (norm.includes("c1")) {
        matchedYl = YL_LEVELS.find((l) => l.id === "usec-c1-1");
      }
    }

    return {
      hasAssignedLevel: true,
      rawLevel: raw,
      winterStream: matchedYl ? matchedYl.name : raw,
      summerEquivalent: matchedYl ? matchedYl.summerMapping : null,
      matchedLevelObj: matchedYl || null,
    };
  }

  /**
   * Analyzes a student's SAP Profile + SAP Booking History and produces smart sales & operational insights
   */
  function analyzeSapStudentAndHistory(profile, bookings = []) {
    const ageInfo = profile && profile.dob ? calculateDetailedAge(profile.dob) : null;

    let activeBookings = [];
    let completedCourses = [];
    let consultations = [];
    let prebookedConsultations = [];
    let detectedCentre = "";
    let latestCourseDate = null;
    let latestConsultationDate = null;

    bookings.forEach((b) => {
      const desc = `${b.courseCode} ${b.courseDescription} ${b.className}`.toLowerCase();
      const status = (b.status || "").toLowerCase();
      const bDate = parseFlexibleDate(b.bookingDate);

      if (b.teachingCentre && !detectedCentre) {
        detectedCentre = b.teachingCentre;
      }

      const isConsultation =
        desc.includes("ylcon") ||
        desc.includes("consultation") ||
        desc.includes("placement") ||
        desc.includes("pt ") ||
        desc.includes("assessment");

      if (isConsultation) {
        consultations.push({ ...b, parsedDate: bDate });
        if (bDate && (!latestConsultationDate || bDate > latestConsultationDate)) {
          latestConsultationDate = bDate;
        }
        if (/prebook|reserv/i.test(status) && !/cancel/i.test(status)) {
          prebookedConsultations.push({ ...b, parsedDate: bDate });
        }
      } else {
        if (status.includes("booked") && !status.includes("cancel")) {
          activeBookings.push({ ...b, parsedDate: bDate });
        }
        if (status.includes("completed") || status.includes("booked")) {
          completedCourses.push({ ...b, parsedDate: bDate });
          if (bDate && (!latestCourseDate || bDate > latestCourseDate)) {
            latestCourseDate = bDate;
          }
        }
      }
    });

    const now = new Date();
    const daysSinceLastCourse = latestCourseDate
      ? Math.floor((now.getTime() - latestCourseDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const daysSinceLastPT = latestConsultationDate
      ? Math.floor((now.getTime() - latestConsultationDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Is Placement Test needed?
    // Exempt if EY (4-5y), OR if student already has an assigned level in SAP, OR valid PT within 180 days (6 months)
    const isEarlyYears = ageInfo && ageInfo.stageCategory === "YL" && ageInfo.academicYears >= 4 && ageInfo.academicYears <= 5;
    const hasValidRecentPT = daysSinceLastPT !== null && daysSinceLastPT <= 180;

    // Is Eligible for Re-registration (within 3 months / 90 days of course activity)?
    const isReturningStudent = completedCourses.length > 0;
    const eligibleForReRegDiscount = daysSinceLastCourse !== null && daysSinceLastCourse <= 95;

    // Active Hold check
    const hasActiveHold =
      profile &&
      Array.isArray(profile.notesAndHolds) &&
      profile.notesAndHolds.some((n) => n.toLowerCase().includes("active hold"));

    const matchedBranch = matchBranchFromSapCentre(detectedCentre);
    const progression = calculateAcademicProgression(profile, bookings, now);
    const effectiveCurriculumLevel = (progression && progression.targetLevel) || (profile ? profile.level : "");
    const levelInfo = mapSapLevelToCurriculum(effectiveCurriculumLevel, ageInfo);
    const ptExemptOrDone = isEarlyYears || levelInfo.hasAssignedLevel || hasValidRecentPT || completedCourses.length > 0;

    return {
      ageInfo,
      levelInfo,
      progression,
      activeBookings,
      completedCourses,
      consultations,
      detectedCentre,
      matchedBranch,
      daysSinceLastCourse,
      daysSinceLastPT,
      isEarlyYears,
      hasValidRecentPT,
      ptRequired: !ptExemptOrDone,
      isReturningStudent,
      eligibleForReRegDiscount,
      hasActiveHold,
      hasPrebookedPT: prebookedConsultations.length > 0,
      prebookedPT: prebookedConsultations[0] || null,
      prebookedConsultations,
    };
  }

  /**
   * Calculates single-student Tuition, Discounts, Placement Test, and 6M/12M Credit Card Installments
   */
  function calculateSingleStudentQuote(config) {
    const {
      dob,
      programType = "auto", // 'auto', 'winter', 'adult', 'summer', 'ielts-teens'
      winterTerms = 2,
      adultCourseId = "bce",
      adultCredits = 40,
      summerCampsCount = 2,
      summerCustomFee = 5800,
      isStarterSummer = false,
      registrationType = "new", // 'new' | 're-reg'
      hasSiblingDiscount = false,
      includePlacementTest = false,
      varioAttendedClasses = 0, // 0, 1, or 2
    } = config;

    const ageInfo = calculateDetailedAge(dob);
    const isAdult = ageInfo ? ageInfo.stageCategory === "Adult" : programType === "adult";
    const effectiveProgram =
      programType === "auto" ? (isAdult ? "adult" : "winter") : programType;

    let baseTuition = 0;
    let courseTitle = "";
    let packageSubtitle = "";
    let discountAmount = 0;
    let discountLabel = "No discount applied";
    let varioDeduction = 0;
    let installmentEligible = false;
    let installmentReason = "";

    if (effectiveProgram === "adult") {
      const course = ADULT_COURSES.find((c) => c.id === adultCourseId) || ADULT_COURSES[1];
      const pkg = course.packages.find((p) => p.credits === Number(adultCredits)) || course.packages[1] || course.packages[0];
      baseTuition = pkg.price;
      courseTitle = course.name;
      packageSubtitle = `${pkg.credits} Credits (${pkg.durationOrLevels})`;

      if (registrationType === "re-reg") {
        discountAmount = Math.round(baseTuition * PRICING.adultReRegDiscountRate);
        discountLabel = "10% Adult Re-registration Discount (within 3M window)";
      }

      installmentEligible = pkg.credits === 40 || pkg.credits === 60;
      installmentReason = installmentEligible
        ? "Eligible (40 & 60 Credits qualify for 6M/12M installments)"
        : "Cash Only (Installments valid for 40 & 60 Credits only)";
    } else if (effectiveProgram === "ielts-teens") {
      const terms = Math.max(1, Math.min(4, Number(winterTerms) || 1));
      const termFee = PRICING.ieltsTeensFee;
      baseTuition = termFee * terms;
      courseTitle = "IELTS for Teens (Ages 15–17)";
      packageSubtitle = `${terms} ${terms === 1 ? "Term" : "Terms"} (${termFee.toLocaleString()} EGP/term)`;

      const bundleRate = PRICING.bundleDiscounts[terms] || 0;
      if (bundleRate > 0) {
        discountAmount = Math.round(baseTuition * bundleRate);
        discountLabel = `${bundleRate * 100}% Multi-Term Bundle Discount (${terms} Terms)`;
      }
      installmentEligible = terms >= 2;
      installmentReason = installmentEligible ? "Eligible (2+ Terms)" : "Single term is Cash Only (Min 2 terms for installment)";
    } else if (effectiveProgram === "summer") {
      const camps = Math.max(1, Math.min(3, Number(summerCampsCount) || 2));
      const campFee = Number(summerCustomFee) || 5800;
      baseTuition = campFee * camps;
      courseTitle = "Summer School 2026";
      packageSubtitle = `${camps} Summer ${camps === 1 ? "Camp" : "Camps"} (${campFee.toLocaleString()} EGP/camp)`;

      if (camps === 2) {
        discountAmount = Math.round(campFee * 0.1);
        discountLabel = "10% Multi-Camp Discount (Applied on 2nd Camp)";
      } else if (camps === 3) {
        discountAmount = Math.round(isStarterSummer ? campFee * 0.1 * 2 : campFee * 0.1);
        discountLabel = isStarterSummer
          ? "10% Starter Multi-Camp Discount (Applied on Camp 2 & Camp 3)"
          : "10% Multi-Camp Discount (Applied on 2nd Camp)";
      }
      installmentEligible = camps >= 2;
      installmentReason = installmentEligible ? "Eligible (2+ Camps)" : "Single camp is Cash Only";
    } else {
      // YL Winter Block
      const terms = Math.max(1, Math.min(4, Number(winterTerms) || 1));
      const isEY = ageInfo && ageInfo.academicYears >= 4 && ageInfo.academicYears <= 5;
      const termFee = isEY ? PRICING.earlyYearsTermFee : PRICING.primarySecondaryTermFee;
      courseTitle = ageInfo && ageInfo.ageGroup ? `Winter Block — ${ageInfo.ageGroup.name}` : "Young Learner Winter Block";
      packageSubtitle = `${terms} ${terms === 1 ? "Term" : "Terms"} × ${termFee.toLocaleString()} EGP`;

      const sessionPrice = termFee / PRICING.sessionsPerWinterTerm;
      if (varioAttendedClasses > 0 && varioAttendedClasses <= 2) {
        varioDeduction = Math.round(sessionPrice * varioAttendedClasses);
      }

      baseTuition = termFee * terms - varioDeduction;

      // Discounts: If Vario is active, only sibling discount can apply (no bundle discount)
      const bundleRate = varioAttendedClasses > 0 ? 0 : PRICING.bundleDiscounts[terms] || 0;
      const bundleDisc = Math.round(baseTuition * bundleRate);
      const siblingDisc = hasSiblingDiscount ? Math.round(termFee * terms * PRICING.siblingDiscountRate) : 0;

      if (hasSiblingDiscount && bundleRate > 0) {
        // Apply bundle on base and sibling 10% on shared terms
        discountAmount = bundleDisc + Math.round((baseTuition - bundleDisc) * PRICING.siblingDiscountRate);
        discountLabel = `${bundleRate * 100}% Bundle + 10% Younger Sibling Discount`;
      } else if (hasSiblingDiscount) {
        discountAmount = siblingDisc;
        discountLabel = "10% Younger Sibling Discount";
      } else if (bundleRate > 0) {
        discountAmount = bundleDisc;
        discountLabel = `${bundleRate * 100}% Winter Bundle Discount (${terms} Terms)`;
      }

      installmentEligible = terms >= 2;
      installmentReason = installmentEligible
        ? "Eligible (2+ Winter Terms qualify for 6M/12M installments)"
        : "Cash Only (Single Winter Term cannot be paid in installments)";
    }

    const netTuition = Math.max(0, baseTuition - discountAmount);
    const ptFee = includePlacementTest ? PRICING.placementTestFee : 0;
    const totalCash = netTuition + ptFee;

    const admin6M = Math.round(totalCash * PRICING.installment6MRate);
    const total6M = totalCash + admin6M;
    const monthly6M = Math.round(total6M / 6);

    const admin12M = Math.round(totalCash * PRICING.installment12MRate);
    const total12M = totalCash + admin12M;
    const monthly12M = Math.round(total12M / 12);

    return {
      ageInfo,
      effectiveProgram,
      courseTitle,
      packageSubtitle,
      baseTuition,
      varioDeduction,
      discountAmount,
      discountLabel,
      netTuition,
      ptFee,
      totalCash,
      installmentEligible,
      installmentReason,
      admin6M,
      total6M,
      monthly6M,
      admin12M,
      total12M,
      monthly12M,
    };
  }

  /**
   * Multi-Child / Sibling Family Calculator (Automatically ranks oldest vs younger siblings by DOB)
   */
  function calculateFamilySiblingsQuote(childrenList) {
    if (!Array.isArray(childrenList) || childrenList.length === 0) return null;

    // Compute age details for each child
    const enriched = childrenList.map((child, idx) => {
      const ageInfo = calculateDetailedAge(child.dob);
      const birthDate = parseFlexibleDate(child.dob);
      return {
        ...child,
        idx,
        ageInfo,
        birthTimestamp: birthDate ? birthDate.getTime() : Number.MAX_SAFE_INTEGER - idx,
        terms: Math.max(1, Math.min(4, Number(child.terms) || 2)),
      };
    });

    // Oldest child has the earliest birthTimestamp (smallest timestamp)
    const sortedByEldest = [...enriched].sort((a, b) => a.birthTimestamp - b.birthTimestamp);
    const eldestId = sortedByEldest[0].id;
    const eldestTerms = sortedByEldest[0].terms;

    let familyBaseTuition = 0;
    let familyBundleSavings = 0;
    let familySiblingSavings = 0;
    let familyPtTotal = 0;
    let familyNetCash = 0;

    const childBreakdowns = enriched.map((c) => {
      const isEldest = c.id === eldestId || enriched.length === 1;
      const isEY = c.ageInfo && c.ageInfo.academicYears >= 4 && c.ageInfo.academicYears <= 5;
      const isAdult = c.ageInfo && c.ageInfo.stageCategory === "Adult";
      const termFee = isEY ? PRICING.earlyYearsTermFee : PRICING.primarySecondaryTermFee;

      const base = termFee * c.terms;
      const bundleRate = PRICING.bundleDiscounts[c.terms] || 0;
      const bundleSaving = Math.round(base * bundleRate);
      const afterBundle = base - bundleSaving;

      // Younger sibling gets 10% on shared terms with eldest sibling
      const sharedTerms = !isEldest && !isAdult ? Math.min(c.terms, eldestTerms) : 0;
      const perTermAfterBundle = afterBundle / c.terms;
      const siblingSaving = sharedTerms > 0 ? Math.round(perTermAfterBundle * sharedTerms * PRICING.siblingDiscountRate) : 0;

      const netCourse = afterBundle - siblingSaving;
      const ptFee = c.includePT && !isEY ? PRICING.placementTestFee : 0;
      const childTotal = netCourse + ptFee;

      familyBaseTuition += base;
      familyBundleSavings += bundleSaving;
      familySiblingSavings += siblingSaving;
      familyPtTotal += ptFee;
      familyNetCash += childTotal;

      return {
        ...c,
        isEldest,
        isEY,
        termFee,
        base,
        bundleRate,
        bundleSaving,
        sharedTerms,
        siblingSaving,
        netCourse,
        ptFee,
        childTotal,
      };
    });

    const totalDiscount = familyBundleSavings + familySiblingSavings;
    const admin6M = Math.round(familyNetCash * PRICING.installment6MRate);
    const total6M = familyNetCash + admin6M;
    const monthly6M = Math.round(total6M / 6);

    const admin12M = Math.round(familyNetCash * PRICING.installment12MRate);
    const total12M = familyNetCash + admin12M;
    const monthly12M = Math.round(total12M / 12);

    return {
      children: childBreakdowns,
      eldestName: sortedByEldest[0].name || "Child 1",
      familyBaseTuition,
      familyBundleSavings,
      familySiblingSavings,
      totalDiscount,
      familyPtTotal,
      familyNetCash,
      installmentEligible: childBreakdowns.some((c) => c.terms >= 2) || childBreakdowns.length >= 2,
      admin6M,
      total6M,
      monthly6M,
      admin12M,
      total12M,
      monthly12M,
    };
  }

  global.BCKnowledgeBase = {
    PRICING,
    BRANCHES,
    YL_AGE_GROUPS,
    YL_LEVELS,
    SUMMER_CAMPS,
    ADULT_COURSES,
    FAQS,
    SYSTEM_LINKS,
    parseFlexibleDate,
    toIsoDateString,
    toSapDateString,
    calculateDetailedAge,
    matchBranchFromSapCentre,
    mapSapLevelToCurriculum,
    extractCanonicalLevel,
    NEXT_LEVEL_MAP,
    BC_LEVEL_PROGRESSION_CHART,
    resolveCrossAgeProgression,
    calculateAcademicProgression,
    calculateAdultProgression,
    analyzeSapStudentAndHistory,
    calculateSingleStudentQuote,
    calculateFamilySiblingsQuote,
  };
})(window);

