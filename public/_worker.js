// Cloudflare Pages Advanced Mode Worker: _worker.js
// Handles /api/location and /api/vehicles serverless endpoints + serves static assets
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Production Clean: 0 Mock Data. Dynamic live telemetry only.

// In-memory telemetry cache for active fleet ambulances
const liveVehicles = new Map();

const BASE_LAT = 26.797313;
const BASE_LON = 82.718401;

// Haversine formula to calculate accurate distance in km
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Distinct vibrant Apple palette per ambulance
const COLOR_PALETTE = [
  { line: '#007AFF', glow: '#38BDF8' }, // Apple Blue / Sky
  { line: '#10B981', glow: '#34D399' }, // Emerald
  { line: '#F59E0B', glow: '#FBBF24' }, // Amber
  { line: '#8B5CF6', glow: '#A78BFA' }, // Purple
  { line: '#EC4899', glow: '#F472B6' }, // Rose Pink
  { line: '#06B6D4', glow: '#22D3EE' }, // Cyan
];

function getVehicleColors(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  const idx = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Endpoint: /setup (Handles provisioning deep links from phone camera scans)
    if (url.pathname === '/setup' || url.pathname === '/setup/') {
      const id = url.searchParams.get('id') || 'SK-AMB-01';
      const locUrl = url.searchParams.get('url') || 'https://fleet.mrps.in/api/location';
      const deepLink = `santkabir://setup?id=${encodeURIComponent(id)}&url=${encodeURIComponent(locUrl)}`;
      
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Provisioning Sant Kabir Fleet Shield</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; }
    .card { background: #1e293b; padding: 32px; border-radius: 24px; border: 1px solid #334155; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h2 { margin-top: 0; color: #38bdf8; font-size: 20px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
    .btn { display: inline-block; background: #0284c7; color: white; padding: 12px 24px; border-radius: 12px; font-weight: bold; text-decoration: none; margin-top: 16px; }
    .id-tag { background: #0369a1; padding: 4px 10px; border-radius: 8px; font-family: monospace; font-weight: bold; color: white; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🚑 Sant Kabir Fleet Shield</h2>
    <p>Provisioning Ambulance <span class="id-tag">${id}</span></p>
    <p>Opening Fleet Shield app...</p>
    <a href="${deepLink}" class="btn">Open App to Configure</a>
    <p style="font-size: 12px; margin-top: 20px;">App not installed yet? <a href="/downloads/santkabir-fleet-shield-v1.0.apk" style="color: #38bdf8;">Download APK</a></p>
  </div>
  <script>
    window.location.href = "${deepLink}";
  </script>
</body>
</html>`;
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 1. Endpoint: /api/location and /api/v1/telemetry (Receives GPS telemetry from Fleet Shield APK)
    if (url.pathname === '/api/location' || url.pathname === '/api/location/' ||
        url.pathname === '/api/v1/telemetry' || url.pathname === '/api/v1/telemetry/') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
          },
        });
      }

      // Check query params first (supported in both GET and POST)
      let id = url.searchParams.get('id') || url.searchParams.get('uniqueId') || url.searchParams.get('deviceid');
      let driver = url.searchParams.get('driver') || url.searchParams.get('driverName') || '';
      let lat = parseFloat(url.searchParams.get('lat') || url.searchParams.get('latitude') || '');
      let lon = parseFloat(url.searchParams.get('lon') || url.searchParams.get('lng') || url.searchParams.get('longitude') || '');
      let rawSpeed = parseFloat(url.searchParams.get('speed') || '0');
      let bearing = parseFloat(url.searchParams.get('bearing') || url.searchParams.get('heading') || '0');
      let altitude = parseFloat(url.searchParams.get('altitude') || '0');
      let batt = parseFloat(url.searchParams.get('batt') || url.searchParams.get('battery') || '100');
      let timestamp = Date.now();
      const tsParam = url.searchParams.get('timestamp') || url.searchParams.get('time');
      if (tsParam) {
        const parsed = parseInt(tsParam, 10);
        if (!isNaN(parsed)) timestamp = parsed > 10000000000 ? parsed : parsed * 1000;
      }

      // If POST with body (JSON or form-data) and params were not in query:
      if (request.method === 'POST' && (isNaN(lat) || isNaN(lon) || !id)) {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const body = await request.json();
            if (!id) id = body.id || body.uniqueId || body.deviceId;
            if (!driver) driver = body.driver || body.driverName || '';
            if (isNaN(lat)) lat = parseFloat(body.lat || body.latitude);
            if (isNaN(lon)) lon = parseFloat(body.lon || body.lng || body.longitude);
            if (body.speed !== undefined) rawSpeed = parseFloat(body.speed);
            if (body.bearing !== undefined) bearing = parseFloat(body.bearing || body.heading);
            if (body.altitude !== undefined) altitude = parseFloat(body.altitude);
            if (body.batt !== undefined || body.battery !== undefined) batt = parseFloat(body.batt || body.battery);
            if (body.timestamp) timestamp = new Date(body.timestamp).getTime() || Date.now();
          } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            if (!id) id = formData.get('id') || formData.get('uniqueId');
            if (!driver) driver = formData.get('driver') || formData.get('driverName') || '';
            if (isNaN(lat)) lat = parseFloat(formData.get('lat') || formData.get('latitude'));
            if (isNaN(lon)) lon = parseFloat(formData.get('lon') || formData.get('lng') || formData.get('longitude'));
            if (formData.has('speed')) rawSpeed = parseFloat(formData.get('speed'));
            if (formData.has('bearing')) bearing = parseFloat(formData.get('bearing') || formData.get('heading'));
            if (formData.has('batt')) batt = parseFloat(formData.get('batt') || formData.get('battery'));
          }
        } catch (e) {
          // Empty body is valid for Traccar query-param POST
        }
      }

      if (!id || isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return new Response(JSON.stringify({ 
          error: 'Missing or invalid parameters. Required: id, lat (-90..90), lon (-180..180)' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      let speedKmH = 0;
      if (rawSpeed > 0) {
        // Traccar sends speed in knots (nautical miles per hr); 1 knot = 1.852 km/h
        speedKmH = Math.min(130, Math.round(rawSpeed * 1.852));
      }

      const vehId = String(id).trim().toUpperCase();
      const existing = liveVehicles.get(vehId) || {};
      const colors = getVehicleColors(vehId);
      const cleanLat = Number(lat.toFixed(6));
      const cleanLon = Number(lon.toFixed(6));
      const distKm = calculateDistanceKm(BASE_LAT, BASE_LON, cleanLat, cleanLon);
      const roadDistKm = Math.round(distKm * 1.15 * 10) / 10;

      // Keep last 30 coordinates for live highway trail breadcrumbs
      const prevTrail = Array.isArray(existing.trail) ? existing.trail : [];
      const updatedTrail = [...prevTrail.slice(-29), [cleanLon, cleanLat]];

      const record = {
        id: vehId,
        name: existing.name || `Ambulance ${vehId}`,
        type: 'ambulance',
        driverName: driver ? String(driver).trim() : (existing.driverName || 'Driver'),
        driverPhone: existing.driverPhone || '',
        plate: existing.plate || vehId,
        status: speedKmH > 3 ? 'moving' : (distKm < 0.25 ? 'at_base' : 'in_field'),
        lat: cleanLat,
        lon: cleanLon,
        speed: speedKmH,
        bearing: Math.round(((bearing % 360) + 360) % 360),
        altitude: Math.round(altitude),
        batt: Math.min(100, Math.max(0, Math.round(batt))),
        battery: Math.min(100, Math.max(0, Math.round(batt))),
        distFromBaseKm: distKm,
        roadDistFromBaseKm: roadDistKm,
        lineColor: existing.lineColor || colors.line,
        glowColor: existing.glowColor || colors.glow,
        trail: updatedTrail,
        lastSeen: timestamp,
        updatedAt: Date.now(),
      };

      // Store in edge memory cache
      liveVehicles.set(vehId, record);

      return new Response(JSON.stringify({ 
        success: true, 
        app: 'Sant Kabir Fleet Shield',
        developer: 'Mani Ratan Singh (mrps.in)',
        vehicle: record 
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
        },
      });
    }

    // 2. Endpoint: /api/vehicles (Returns dynamically registered live fleet)
    if (url.pathname === '/api/vehicles' || url.pathname === '/api/vehicles/') {
      // Purge entries inactive for more than 12 hours
      const now = Date.now();
      for (const [vKey, vVal] of liveVehicles.entries()) {
        if (now - (vVal.updatedAt || vVal.lastSeen || 0) > 12 * 60 * 60 * 1000) {
          liveVehicles.delete(vKey);
        }
      }

      const list = Array.from(liveVehicles.values());
      return new Response(JSON.stringify({
        success: true,
        vehicles: list,
        count: list.length,
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

    // 3. Binary APK Downloads (Enforces Android APK MIME headers and blocks HTML fallback into .txt/.zip)
    if (url.pathname.endsWith('.apk') || url.pathname === '/api/download-apk') {
      const assetRes = await env.ASSETS.fetch(new Request(new URL('/downloads/santkabir-fleet-shield-v1.0.apk', request.url)));
      const contentType = assetRes.headers.get('content-type') || '';
      if (assetRes.status === 404 || contentType.includes('text/html')) {
        return new Response(JSON.stringify({
          error: 'Sant Kabir Fleet Shield APK binary has not been placed in public/downloads/ yet.',
          solution: 'Compile santkabir-fleet-shield-v1.0.apk and place it in public/downloads/ before uploading.',
          developer: 'Mani Ratan Singh (mrps.in)',
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      const headers = new Headers(assetRes.headers);
      headers.set('Content-Type', 'application/vnd.android.package-archive');
      headers.set('Content-Disposition', 'attachment; filename="santkabir-fleet-shield-v1.0.apk"; filename*=UTF-8\'\'santkabir-fleet-shield-v1.0.apk');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Cache-Control', 'public, max-age=86400');
      return new Response(assetRes.body, {
        status: 200,
        headers,
      });
    }

    // 4. Fallback: Serve static assets (HTML, JS, CSS, images)
    return env.ASSETS.fetch(request);
  },
};
