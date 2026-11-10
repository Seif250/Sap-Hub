// Cloudflare Pages Function: /api/ping
export async function onRequest() {
  return new Response(
    JSON.stringify({
      ok: true,
      status: "running",
      platform: "Cloudflare Pages",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  );
}

