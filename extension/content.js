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

let localLogBackoffUntil = 0;

async function postToLocalRecorder(payload) {
  if (Date.now() < localLogBackoffUntil) return;
  try {
    await fetch("http://localhost:8787/api/log-traffic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // Local server is stopped; pause logging attempts for 30s to avoid spamming SAP tab
    localLogBackoffUntil = Date.now() + 30000;
  }
}

// 2. Listen for captured XHR events from inject.js
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.source !== "SAP_COPILOT_RECORDER") {
    return;
  }
  postToLocalRecorder(event.data);
});

// 3. Scan DOM for visible notes or tabs periodically when user interacts (only if local server isn't in backoff)
function scanVisibleNotes() {
  if (Date.now() < localLogBackoffUntil) return;
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
      postToLocalRecorder({
        source: "SAP_COPILOT_RECORDER",
        type: "DOM_NOTES_SCAN",
        action: "DOM Notes Detected",
        notes: extractedNotes,
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {}
}

document.addEventListener("click", () => {
  setTimeout(scanVisibleNotes, 1500);
});

injectRecorderScript();

