// ============================================================================
// British Council Egypt — Crisp Lucide SVG Icons & Reusable Copy Components
// ============================================================================
(function (global) {
  const React = global.React;
  const h = React.createElement;

  function createIcon(paths, viewBox = "0 0 24 24") {
    return function IconComponent({ className = "w-4 h-4", title }) {
      return h(
        "svg",
        {
          xmlns: "http://www.w3.org/2000/svg",
          viewBox,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          className,
          "aria-hidden": title ? undefined : "true",
        },
        title ? h("title", null, title) : null,
        ...paths.map((p, idx) => h(p.tag, { key: idx, ...p.attrs }))
      );
    };
  }

  const Icons = {
    Search: createIcon([
      { tag: "circle", attrs: { cx: "11", cy: "11", r: "8" } },
      { tag: "path", attrs: { d: "m21 21-4.3-4.3" } },
    ]),
    Copy: createIcon([
      { tag: "rect", attrs: { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" } },
      { tag: "path", attrs: { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" } },
    ]),
    Check: createIcon([
      { tag: "path", attrs: { d: "M20 6 9 17l-5-5" } },
    ]),
    CheckCircle2: createIcon([
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attrs: { d: "m9 12 2 2 4-4" } },
    ]),
    User: createIcon([
      { tag: "path", attrs: { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" } },
      { tag: "circle", attrs: { cx: "12", cy: "7", r: "4" } },
    ]),
    Users: createIcon([
      { tag: "path", attrs: { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" } },
      { tag: "circle", attrs: { cx: "9", cy: "7", r: "4" } },
      { tag: "path", attrs: { d: "M22 21v-2a4 4 0 0 0-3-3.87" } },
      { tag: "path", attrs: { d: "M16 3.13a4 4 0 0 1 0 7.75" } },
    ]),
    Calendar: createIcon([
      { tag: "path", attrs: { d: "M8 2v4" } },
      { tag: "path", attrs: { d: "M16 2v4" } },
      { tag: "rect", attrs: { width: "18", height: "18", x: "3", y: "4", rx: "2" } },
      { tag: "path", attrs: { d: "M3 10h18" } },
    ]),
    GraduationCap: createIcon([
      { tag: "path", attrs: { d: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" } },
      { tag: "path", attrs: { d: "M22 10v6" } },
      { tag: "path", attrs: { d: "M6 12.5V16a6 3 0 0 0 12 0v-3.5" } },
    ]),
    BookOpen: createIcon([
      { tag: "path", attrs: { d: "M12 7v14" } },
      { tag: "path", attrs: { d: "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" } },
    ]),
    Building2: createIcon([
      { tag: "path", attrs: { d: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" } },
      { tag: "path", attrs: { d: "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" } },
      { tag: "path", attrs: { d: "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" } },
      { tag: "path", attrs: { d: "M10 6h4" } },
      { tag: "path", attrs: { d: "M10 10h4" } },
      { tag: "path", attrs: { d: "M10 14h4" } },
      { tag: "path", attrs: { d: "M10 18h4" } },
    ]),
    Calculator: createIcon([
      { tag: "rect", attrs: { width: "16", height: "20", x: "4", y: "2", rx: "2" } },
      { tag: "line", attrs: { x1: "8", x2: "16", y1: "6", y2: "6" } },
      { tag: "line", attrs: { x1: "16", x2: "16", y1: "14", y2: "18" } },
      { tag: "path", attrs: { d: "M16 10h.01" } },
      { tag: "path", attrs: { d: "M12 10h.01" } },
      { tag: "path", attrs: { d: "M8 10h.01" } },
      { tag: "path", attrs: { d: "M12 14h.01" } },
      { tag: "path", attrs: { d: "M8 14h.01" } },
      { tag: "path", attrs: { d: "M12 18h.01" } },
      { tag: "path", attrs: { d: "M8 18h.01" } },
    ]),
    CreditCard: createIcon([
      { tag: "rect", attrs: { width: "20", height: "14", x: "2", y: "5", rx: "2" } },
      { tag: "line", attrs: { x1: "2", x2: "22", y1: "10", y2: "10" } },
    ]),
    ShieldCheck: createIcon([
      { tag: "path", attrs: { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" } },
      { tag: "path", attrs: { d: "m9 12 2 2 4-4" } },
    ]),
    ShieldAlert: createIcon([
      { tag: "path", attrs: { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" } },
      { tag: "path", attrs: { d: "M12 8v4" } },
      { tag: "path", attrs: { d: "M12 16h.01" } },
    ]),
    AlertTriangle: createIcon([
      { tag: "path", attrs: { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" } },
      { tag: "path", attrs: { d: "M12 9v4" } },
      { tag: "path", attrs: { d: "M12 17h.01" } },
    ]),
    AlertCircle: createIcon([
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
      { tag: "line", attrs: { x1: "12", x2: "12", y1: "8", y2: "12" } },
      { tag: "line", attrs: { x1: "12", x2: "12.01", y1: "16", y2: "16" } },
    ]),
    Clock: createIcon([
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
      { tag: "polyline", attrs: { points: "12 6 12 12 16 14" } },
    ]),
    Sparkles: createIcon([
      { tag: "path", attrs: { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" } },
      { tag: "path", attrs: { d: "M20 3v4" } },
      { tag: "path", attrs: { d: "M22 5h-4" } },
    ]),
    Tag: createIcon([
      { tag: "path", attrs: { d: "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" } },
      { tag: "circle", attrs: { cx: "7.5", cy: "7.5", r: ".5", fill: "currentColor" } },
    ]),
    PhoneCall: createIcon([
      { tag: "path", attrs: { d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" } },
      { tag: "path", attrs: { d: "M14.05 2a9 9 0 0 1 8 7.94" } },
      { tag: "path", attrs: { d: "M14.05 6A5 5 0 0 1 18 10" } },
    ]),
    Mail: createIcon([
      { tag: "rect", attrs: { width: "20", height: "16", x: "2", y: "4", rx: "2" } },
      { tag: "path", attrs: { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" } },
    ]),
    MapPin: createIcon([
      { tag: "path", attrs: { d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" } },
      { tag: "circle", attrs: { cx: "12", cy: "10", r: "3" } },
    ]),
    RotateCcw: createIcon([
      { tag: "path", attrs: { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" } },
      { tag: "path", attrs: { d: "M3 3v5h5" } },
    ]),
    Sliders: createIcon([
      { tag: "line", attrs: { x1: "4", x2: "4", y1: "21", y2: "14" } },
      { tag: "line", attrs: { x1: "4", x2: "4", y1: "10", y2: "3" } },
      { tag: "line", attrs: { x1: "12", x2: "12", y1: "21", y2: "12" } },
      { tag: "line", attrs: { x1: "12", x2: "12", y1: "8", y2: "3" } },
      { tag: "line", attrs: { x1: "20", x2: "20", y1: "21", y2: "16" } },
      { tag: "line", attrs: { x1: "20", x2: "20", y1: "12", y2: "3" } },
      { tag: "line", attrs: { x1: "2", x2: "6", y1: "14", y2: "14" } },
      { tag: "line", attrs: { x1: "10", x2: "14", y1: "8", y2: "8" } },
      { tag: "line", attrs: { x1: "18", x2: "22", y1: "16", y2: "16" } },
    ]),
    Zap: createIcon([
      { tag: "path", attrs: { d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" } },
    ]),
    ExternalLink: createIcon([
      { tag: "path", attrs: { d: "M15 3h6v6" } },
      { tag: "path", attrs: { d: "M10 14 21 3" } },
      { tag: "path", attrs: { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" } },
    ]),
    FileText: createIcon([
      { tag: "path", attrs: { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" } },
      { tag: "path", attrs: { d: "M14 2v4a2 2 0 0 0 2 2h4" } },
      { tag: "path", attrs: { d: "M10 9H8" } },
      { tag: "path", attrs: { d: "M16 13H8" } },
      { tag: "path", attrs: { d: "M16 17H8" } },
    ]),
    Snowflake: createIcon([
      { tag: "line", attrs: { x1: "2", x2: "22", y1: "12", y2: "12" } },
      { tag: "line", attrs: { x1: "12", x2: "12", y1: "2", y2: "22" } },
      { tag: "path", attrs: { d: "m20 16-4-4 4-4" } },
      { tag: "path", attrs: { d: "m4 8 4 4-4 4" } },
      { tag: "path", attrs: { d: "m16 4-4 4-4-4" } },
      { tag: "path", attrs: { d: "m8 20 4-4 4 4" } },
    ]),
    Sun: createIcon([
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "4" } },
      { tag: "path", attrs: { d: "M12 2v2" } },
      { tag: "path", attrs: { d: "M12 20v2" } },
      { tag: "path", attrs: { d: "m4.93 4.93 1.41 1.41" } },
      { tag: "path", attrs: { d: "m17.66 17.66 1.41 1.41" } },
      { tag: "path", attrs: { d: "M2 12h2" } },
      { tag: "path", attrs: { d: "M20 12h2" } },
      { tag: "path", attrs: { d: "m6.34 17.66-1.41 1.41" } },
      { tag: "path", attrs: { d: "m19.07 4.93-1.41 1.41" } },
    ]),
    Layers: createIcon([
      { tag: "path", attrs: { d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" } },
      { tag: "path", attrs: { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" } },
      { tag: "path", attrs: { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" } },
    ]),
    Key: createIcon([
      { tag: "path", attrs: { d: "m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" } },
      { tag: "path", attrs: { d: "m21 2-9.6 9.6" } },
      { tag: "circle", attrs: { cx: "7.5", cy: "15.5", r: "5.5" } },
    ]),
    Plus: createIcon([
      { tag: "path", attrs: { d: "M5 12h14" } },
      { tag: "path", attrs: { d: "M12 5v14" } },
    ]),
    Trash2: createIcon([
      { tag: "path", attrs: { d: "M3 6h18" } },
      { tag: "path", attrs: { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" } },
      { tag: "path", attrs: { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" } },
    ]),
    X: createIcon([
      { tag: "path", attrs: { d: "M18 6 6 18" } },
      { tag: "path", attrs: { d: "m6 6 12 12" } },
    ]),
    ChevronDown: createIcon([
      { tag: "path", attrs: { d: "m6 9 6 6 6-6" } },
    ]),
    ChevronRight: createIcon([
      { tag: "path", attrs: { d: "m9 18 6-6-6-6" } },
    ]),
    HelpCircle: createIcon([
      { tag: "circle", attrs: { cx: "12", cy: "12", r: "10" } },
      { tag: "path", attrs: { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" } },
      { tag: "path", attrs: { d: "M12 17h.01" } },
    ]),
    ArrowRight: createIcon([
      { tag: "path", attrs: { d: "M5 12h14" } },
      { tag: "path", attrs: { d: "m12 5 7 7-7 7" } },
    ]),
    RefreshCw: createIcon([
      { tag: "path", attrs: { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" } },
      { tag: "path", attrs: { d: "M21 3v5h-5" } },
      { tag: "path", attrs: { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" } },
      { tag: "path", attrs: { d: "M8 16H3v5" } },
    ]),
  };

  /**
   * Sleek interactive Copy Button matching https://helpseif.pages.dev/
   * Variants:
   * - 'ghost': compact icon/pill inside data cards & tables
   * - 'navy': primary British Council Navy button (#062A67)
   * - 'teal': accent British Council Teal button
   * - 'outline': white button with crisp slate border
   */
  function CopyBtn({
    text,
    label = "Copy",
    copiedLabel = "Copied!",
    toastMessage,
    onToast,
    variant = "outline",
    size = "sm",
    iconOnly = false,
    className = "",
    title = "Copy to clipboard",
  }) {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = (e) => {
      e.stopPropagation();
      if (text === undefined || text === null || text === "") return;
      navigator.clipboard.writeText(String(text));
      setCopied(true);
      if (onToast) {
        onToast(toastMessage || `Copied: ${String(text).slice(0, 55)}${String(text).length > 55 ? "..." : ""}`);
      }
      setTimeout(() => setCopied(false), 1800);
    };

    const sizeClasses =
      size === "xs"
        ? iconOnly
          ? "p-1 rounded-md text-[10px]"
          : "px-1.5 py-0.5 rounded-md text-[10px] gap-1"
        : size === "md"
        ? "px-3 py-1.5 rounded-xl text-xs gap-1.5"
        : iconOnly
        ? "p-1.5 rounded-lg text-[11px]"
        : "px-2.5 py-1 rounded-lg text-[11px] gap-1.5";

    let variantClasses = "";
    if (copied) {
      variantClasses =
        variant === "navy" || variant === "teal"
          ? "bg-emerald-600 text-white border border-emerald-500 shadow-xs"
          : "bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs";
    } else if (variant === "navy") {
      variantClasses = "bg-[#062A67] hover:bg-[#00205B] text-white border border-[#041d48] shadow-xs";
    } else if (variant === "teal") {
      variantClasses = "bg-teal-500 hover:bg-teal-600 text-slate-950 border border-teal-400 shadow-xs";
    } else if (variant === "ghost") {
      variantClasses = "text-slate-400 hover:text-[#062A67] hover:bg-slate-100 border border-transparent hover:border-slate-200";
    } else {
      variantClasses = "bg-white hover:bg-slate-50 text-slate-700 hover:text-[#062A67] border border-slate-200/90 shadow-2xs";
    }

    const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

    return h(
      "button",
      {
        type: "button",
        onClick: handleCopy,
        title: title,
        className: `inline-flex items-center justify-center font-bold transition-all cursor-pointer select-none flex-shrink-0 ${sizeClasses} ${variantClasses} ${className}`,
      },
      copied
        ? h(Icons.Check, {
            className: `${iconSize} ${variant === "navy" || variant === "teal" ? "text-white" : "text-emerald-600"}`,
          })
        : h(Icons.Copy, {
            className: `${iconSize} ${variant === "navy" ? "text-teal-300" : ""}`,
          }),
      !iconOnly && h("span", null, copied ? copiedLabel : label)
    );
  }

  global.BCIcons = Icons;
  global.CopyBtn = CopyBtn;
})(window);

