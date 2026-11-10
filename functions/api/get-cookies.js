// Cloudflare Pages Function: /api/get-cookies
export async function onRequest({ request }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  };

  return new Response(
    JSON.stringify({
      ok: true,
      hasCookie: false,
      hasSessionId: false,
      cookie: "",
      notice: "On Cloudflare Pages, cookies are provided directly in-browser by the SAP Copilot Chrome Extension Bridge.",
    }),
    { status: 200, headers: corsHeaders }
  );
}

