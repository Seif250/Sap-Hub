// Cloudflare Pages Function: /api/sap
// Proxies SAP Web Dynpro requests from Cloudflare Edge

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function onRequestPost({ request }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8",
  };

  try {
    const payload = await request.json();
    const { url, method = "GET", cookie, body, referer } = payload;

    if (!url) {
      return new Response(JSON.stringify({ ok: false, error: "Missing target URL" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const fetchHeaders = {
      "Accept": "*/*",
      "Accept-Language": "en-GB,en;q=0.9,en-US;q=0.8",
      "X-Requested-With": "XMLHttpRequest",
      "X-XHR-Logon": "accept",
      "Referer": referer || "https://prd-sap.sms.britishcouncil.org/sap/bc/webdynpro/sap/z_her_wa_student?WDCONFIGURATIONID=Z_HER_AC_STUDENT",
    };

    if (cookie) {
      fetchHeaders["Cookie"] = cookie;
    }
    if (method.toUpperCase() === "POST") {
      fetchHeaders["Content-Type"] = "application/x-www-form-urlencoded; charset=utf-8";
    }

    const sapResp = await fetch(url, {
      method: method.toUpperCase(),
      headers: fetchHeaders,
      body: method.toUpperCase() === "POST" ? body : undefined,
      redirect: "follow",
    });

    const bodyText = await sapResp.text();
    const setCookie = sapResp.headers.get("set-cookie") || "";
    const sessionState = sapResp.headers.get("sap-session-state") || "";

    return new Response(
      JSON.stringify({
        ok: sapResp.ok,
        status: sapResp.status,
        finalUrl: sapResp.url,
        setCookie,
        sessionState,
        body: bodyText,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        status: 502,
        error: "Cloudflare cannot connect directly to internal SAP IP (100.64.1.44) without Chrome Extension Bridge or Cloudflare Tunnel: " + err.message,
      }),
      { status: 200, headers: corsHeaders }
    );
  }
}

