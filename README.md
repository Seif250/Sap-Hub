# SAP Student Hub (Sales Assistant)

Local SAP-only web app for looking up British Council students, calculating pricing, tracking academic progression, and booking classes live.

An active SAP session is required. The application does not include offline or demo student records.

## Deploy to Cloudflare Pages (Free & Serverless)
You can deploy this repository directly to Cloudflare Pages as a live web application:
1. Push this repo to your GitHub or GitLab account (or upload directly in Cloudflare Pages dashboard).
2. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Select your repository with these settings:
   - **Framework preset**: `None`
   - **Build command**: *(leave completely empty)*
   - **Build output directory**: `.` *(or leave empty / root)*
4. Click **Save and Deploy**. Your site will be live at `https://<your-project>.pages.dev`!
5. In your browser (Chrome or Edge):
   - Go to `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
   - Click **Load unpacked** and select the `extension/` folder.
   - Now open your Cloudflare Pages URL — the extension bridge connects directly to SAP in your browser with zero local server needed!

## Run Locally
1. Double-click `start-sap-hub.bat` (no Node.js needed — runs `server.ps1` via PowerShell).
2. Open http://localhost:8787

## SAP Cookie Auto-Sync & Direct Bridge Extension
1. Open `edge://extensions` (or `chrome://extensions`) and enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder inside this repo (or click reload if already installed).
3. The extension automatically syncs cookies and bridges SAP requests directly from your browser.

## Structure
| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `icons.js` | Shell & styles |
| `app.js`, `ui-kit.js`, `booking-modal.js` | UI |
| `bc-kb.js` | Knowledge base: pricing, levels, academic progression rules |
| `sap-client.js`, `sap-service.js` | SAP Web Dynpro integration |
| `server.ps1` | Local static server + SAP proxy |
| `extension/` | Cookie & traffic sync browser extension |

