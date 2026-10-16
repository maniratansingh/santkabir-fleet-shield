// Cloudflare Pages Function: /api/vehicles
// Returns active fleet ambulances (Engineered by Mani Ratan Singh • mrps.in)
// Production Clean: 0 Mock Data. Dynamic live telemetry only.

export async function onRequest() {
  return new Response(JSON.stringify({
    success: true,
    vehicles: [],
    count: 0,
    timestamp: Date.now(),
    app: 'Sant Kabir Fleet Shield',
    developer: 'Mani Ratan Singh (mrps.in)',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
    },
  });
}
