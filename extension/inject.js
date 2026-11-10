// ============================================================================
// SAP Traffic & Action Interceptor (Injected directly into SAP page DOM)
// Intercepts all Web Dynpro XHR calls (search, student clicks, notes, history)
// ============================================================================
(function() {
  if (window.__sapCopilotInjected) return;
  window.__sapCopilotInjected = true;

  console.log("[SAP Copilot] Traffic Recorder Injected into SAP page.");

  // Track the most recent user interaction (click, input) to explain SAP requests automatically
  let lastUserClick = null;
  let lastUserInput = null;

  document.addEventListener("click", function(e) {
    try {
      const target = e.target.closest("button, a, [role='button'], [ct='B'], [ct='LN'], [ct='POMNI'], [ct='PST'], [ct='TAB'], tr, td") || e.target;
      const text = (target.innerText || target.textContent || "").trim().slice(0, 80);
      const title = target.getAttribute("title") || target.getAttribute("aria-label") || "";
      const id = target.getAttribute("id") || "";
      const ct = target.getAttribute("ct") || "";
      lastUserClick = { text, title, id, ct, tag: target.tagName, time: Date.now() };
    } catch (err) {}
  }, true);

  document.addEventListener("change", function(e) {
    try {
      const target = e.target;
      const title = target.getAttribute("title") || target.getAttribute("aria-label") || target.name || "";
      const id = target.getAttribute("id") || "";
      const val = (target.value || "").slice(0, 100);
      lastUserInput = { title, id, value: val, time: Date.now() };
    } catch (err) {}
  }, true);

  const rawOpen = XMLHttpRequest.prototype.open;
  const rawSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._sapMethod = method;
    this._sapUrl = url;
    return rawOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;
    const url = xhr._sapUrl || "";
    const method = xhr._sapMethod || "POST";
    const requestBody = typeof body === "string" ? body : "";

    const clickCtx = (lastUserClick && (Date.now() - lastUserClick.time < 5000)) ? lastUserClick : null;
    const inputCtx = (lastUserInput && (Date.now() - lastUserInput.time < 5000)) ? lastUserInput : null;

    // Identify user action from click and SAPEVENTQUEUE
    let actionDesc = "SAP Web Dynpro Event";
    if (clickCtx && (clickCtx.text || clickCtx.title)) {
      actionDesc = `Clicked "${clickCtx.text || clickCtx.title}" (${clickCtx.id})`;
    } else if (requestBody.includes("LoadingPlaceHolder")) {
      actionDesc = "LoadingPlaceHolder Init";
    } else if (requestBody.includes("Button_Press") && requestBody.includes("Search")) {
      actionDesc = "Search Button Click";
    } else if (requestBody.includes("Link_Activate") || requestBody.includes("Link_Select")) {
      actionDesc = "Open Student Link Click";
    } else if (requestBody.toLowerCase().includes("note") || requestBody.includes("WD0A4A")) {
      actionDesc = "Notes / History Navigation";
    }

    xhr.addEventListener("load", function() {
      try {
        const responseText = xhr.responseText || "";
        const status = xhr.status;

        // Dispatch captured event to content script (capture full registration & webgui responses)
        const isLargeScreen = url.includes("webgui") || url.includes("zher_wa_registration") || requestBody.includes("ZHER_WA_REGISTRATION") || actionDesc.includes("Account balance") || actionDesc.includes("Registration");
        const maxSnippetLen = isLargeScreen ? 800000 : 120000;
        window.postMessage({
          source: "SAP_COPILOT_RECORDER",
          type: "XHR_COMPLETED",
          action: actionDesc,
          userClick: clickCtx,
          userInput: inputCtx,
          method: method,
          url: url,
          requestBody: requestBody,
          status: status,
          responseSnippet: responseText.slice(0, maxSnippetLen),
          responseLength: responseText.length,
          timestamp: new Date().toISOString()
        }, "*");
      } catch (e) {
        console.error("[SAP Copilot] Error capturing response:", e);
      }
    });

    return rawSend.apply(this, arguments);
  };
})();

