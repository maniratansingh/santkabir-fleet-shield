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

    // Explicit 404 for any legacy APK or download paths
    if (url.pathname.endsWith('.apk') || url.pathname.startsWith('/downloads/')) {
      return new Response('Not Found', { status: 404 });
    }

    // 1. Endpoint: Universal Telemetry Receiver (Supports Traccar Client, OsmAnd, GPSLogger)
    // Works with:
    // - Direct Root URL: https://fleet.mrps.in/?id=12345&lat=26.79&lon=82.71... (Standard Traccar default)
    // - Standard paths: /api/location, /location, /track, /telemetry, /api/v1/telemetry
    const hasTraccarParams = (url.searchParams.has('id') || url.searchParams.has('uniqueId') || url.searchParams.has('deviceId') || url.searchParams.has('deviceid')) && 
                             (url.searchParams.has('lat') || url.searchParams.has('latitude'));
    const isTelemetryPath = url.pathname === '/api/location' || url.pathname === '/api/location/' ||
                           url.pathname === '/api/v1/telemetry' || url.pathname === '/api/v1/telemetry/' ||
                           url.pathname === '/location' || url.pathname === '/track' || url.pathname === '/telemetry';

    if (isTelemetryPath || hasTraccarParams || (request.method === 'POST' && url.pathname === '/')) {
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
      let id = url.searchParams.get('id') || url.searchParams.get('uniqueId') || url.searchParams.get('deviceid') || url.searchParams.get('deviceId');
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
            if (!id) id = formData.get('id') || formData.get('uniqueId') || formData.get('deviceId');
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
        if (url.pathname === '/' && request.method === 'GET') {
          return env.ASSETS.fetch(request);
        }
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
        name: vehId,
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
        isLive: true,
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

    // 3. Fallback: Serve static assets (HTML, JS, CSS, images)
    return env.ASSETS.fetch(request);
  },
};
