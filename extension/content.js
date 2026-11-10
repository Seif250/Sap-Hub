// ============================================================================
// SAP Copilot Extension - Content Script
// Bridges intercepted SAP traffic to local Sales Assistant (localhost:8787)
// ============================================================================

console.log("[SAP Copilot] Content script active on British Council SAP.");

// 1. Inject inject.js into the main page context
function injectRecorderScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("inject.js");
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// 2. Listen for captured XHR events from inject.js
window.addEventListener("message", async (event) => {
  if (event.source !== window || !event.data || event.data.source !== "SAP_COPILOT_RECORDER") {
    return;
  }

  const data = event.data;
  
  // Forward to local server
  try {
    await fetch("http://localhost:8787/api/log-traffic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  } catch (err) {
    // Local server might be stopped, ignore silently
  }
});

// 3. Scan DOM for visible notes or tabs periodically when user interacts
function scanVisibleNotes() {
  try {
    // Look for Notes tab text area or table
    const noteElements = document.querySelectorAll("textarea, [ct='TEXTEDIT'], td[subct='STC']");
    const extractedNotes = [];
    noteElements.forEach(el => {
      const txt = (el.value || el.innerText || "").trim();
      if (txt.length > 5 && (txt.includes("A0") || txt.includes("Beg") || txt.includes("Primary") || txt.includes("PT") || txt.includes("Level") || txt.includes("Hold"))) {
        extractedNotes.push(txt);
      }
    });

    if (extractedNotes.length > 0) {
      fetch("http://localhost:8787/api/log-traffic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "SAP_COPILOT_RECORDER",
          type: "DOM_NOTES_SCAN",
          action: "DOM Notes Detected",
          notes: extractedNotes,
          timestamp: new Date().toISOString()
        })
      }).catch(() => {});
    }
  } catch (e) {}
}

document.addEventListener("click", () => {
  setTimeout(scanVisibleNotes, 1500);
});

injectRecorderScript();

