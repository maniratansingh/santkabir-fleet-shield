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

// Golden Ratio HSL Unique Color Engine for 100+ ambulances
const PRIMARY_PALETTE = [
  { line: '#007AFF', glow: '#38BDF8' }, // Apple Blue
  { line: '#10B981', glow: '#34D399' }, // Emerald Green
  { line: '#F59E0B', glow: '#FBBF24' }, // Vivid Amber
  { line: '#8B5CF6', glow: '#A78BFA' }, // Royal Violet
  { line: '#EC4899', glow: '#F472B6' }, // Rose Pink
  { line: '#06B6D4', glow: '#22D3EE' }, // Electric Cyan
  { line: '#84CC16', glow: '#A3E635' }, // Lime Green
  { line: '#F97316', glow: '#FB923C' }, // Tangerine
  { line: '#6366F1', glow: '#818CF8' }, // Indigo
  { line: '#14B8A6', glow: '#2DD4BF' }, // Teal
  { line: '#E11D48', glow: '#FB7185' }, // Crimson Coral
  { line: '#D946EF', glow: '#E879F9' }, // Magenta
];

const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;

function hslToHex(h, s, l) {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function getVehicleColors(id = '') {
  const cleanId = String(id).trim().toUpperCase();
  const match = cleanId.match(/AMB-(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num >= 1 && num <= PRIMARY_PALETTE.length) {
      return PRIMARY_PALETTE[num - 1];
    }
  }

  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) hash = (hash * 31 + cleanId.charCodeAt(i)) & 0xffffffff;
  const seed = Math.abs(hash);
  let hue = Math.floor(((seed * GOLDEN_RATIO_CONJUGATE) % 1) * 360);
  return {
    line: hslToHex(hue, 88, 50),
    glow: hslToHex(hue, 92, 68),
  };
}

const KEY_VILLAGES = [
  { name: 'Maghar Gram', block: 'Khalilabad', district: 'Sant Kabir Nagar', lat: 26.7583, lon: 83.1311 },
  { name: 'Semariyawan Gram', block: 'Semariyawan', district: 'Sant Kabir Nagar', lat: 26.8856, lon: 82.9847 },
  { name: 'Belhar Kala Gram', block: 'Belhar Kala', district: 'Sant Kabir Nagar', lat: 26.9650, lon: 83.0520 },
  { name: 'Baghnagar Gram', block: 'Semariyawan', district: 'Sant Kabir Nagar', lat: 26.8620, lon: 82.9340 },
  { name: 'Mehdawal Bazar', block: 'Mehdawal', district: 'Sant Kabir Nagar', lat: 26.9800, lon: 83.1200 },
  { name: 'Dhanghata Bazar', block: 'Dhanghata', district: 'Sant Kabir Nagar', lat: 26.5800, lon: 83.0200 },
  { name: 'Hainsar Bazar', block: 'Hainsar', district: 'Sant Kabir Nagar', lat: 26.5400, lon: 83.0700 },
  { name: 'Nathnagar Gram', block: 'Nathnagar', district: 'Sant Kabir Nagar', lat: 26.6500, lon: 83.0500 },
  { name: 'Harraiya Gram', block: 'Harraiya', district: 'Basti', lat: 26.7972, lon: 82.4636 },
  { name: 'Rudhauli Bazar', block: 'Rudhauli', district: 'Basti', lat: 27.0000, lon: 82.7800 },
  { name: 'Walterganj Gram', block: 'Saltaua', district: 'Basti', lat: 26.9000, lon: 82.7200 },
  { name: 'Captainganj Gram', block: 'Captainganj', district: 'Basti', lat: 26.7800, lon: 82.6000 },
  { name: 'Bansi Nagar', block: 'Bansi', district: 'Siddharthnagar', lat: 27.1700, lon: 82.9300 },
  { name: 'Domariyaganj Bazar', block: 'Domariyaganj', district: 'Siddharthnagar', lat: 27.2000, lon: 82.6800 },
  { name: 'Itwa Gram', block: 'Itwa', district: 'Siddharthnagar', lat: 27.3200, lon: 82.7500 },
  { name: 'Tanda Nagar', block: 'Tanda', district: 'Ambedkar Nagar', lat: 26.5500, lon: 82.6600 },
  { name: 'Akbarpur Sadar', block: 'Akbarpur', district: 'Ambedkar Nagar', lat: 26.4300, lon: 82.5400 },
  { name: 'Sahjanwa Bazar', block: 'Sahjanwa', district: 'Gorakhpur', lat: 26.7700, lon: 83.1900 },
];

function resolveVillage(lat, lon) {
  let nearest = KEY_VILLAGES[0];
  let minD = calculateDistanceKm(lat, lon, nearest.lat, nearest.lon);
  for (let i = 1; i < KEY_VILLAGES.length; i++) {
    const d = calculateDistanceKm(lat, lon, KEY_VILLAGES[i].lat, KEY_VILLAGES[i].lon);
    if (d < minD) { minD = d; nearest = KEY_VILLAGES[i]; }
  }
  const isCamp = minD <= 4.0;
  return {
    villageName: nearest.name,
    villageBlock: nearest.block,
    villageDistrict: nearest.district,
    villageBadge: isCamp ? `Camp: ${nearest.name}` : `Near ${nearest.name}`,
    villageLabel: isCamp ? `📍 Outreach Camp: ${nearest.name} (${nearest.district}) • ${minD} km` : `📍 Near ${nearest.name} • ${minD} km away`,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Explicit 404 for any legacy APK or download paths
    if (url.pathname.endsWith('.apk') || url.pathname.startsWith('/downloads/')) {
      return new Response('Not Found', { status: 404 });
    }

    // 1. Endpoint: Universal Telemetry Receiver (Supports Traccar Client, OsmAnd, GPSLogger, Sant Kabir Fleet Shield Android App)
    // Works with:
    // - Traccar OsmAnd endpoint: /api/track (as defined in Android Master Integration Spec)
    // - Direct Root URL: https://fleet.mrps.in/?id=12345&lat=26.79&lon=82.71... (Standard Traccar default)
    // - Standard paths: /api/track, /api/location, /location, /track, /telemetry, /api/v1/telemetry
    const hasTraccarParams = (url.searchParams.has('id') || url.searchParams.has('uniqueId') || url.searchParams.has('deviceId') || url.searchParams.has('deviceid')) && 
                             (url.searchParams.has('lat') || url.searchParams.has('latitude'));
    const isTelemetryPath = url.pathname === '/api/track' || url.pathname === '/api/track/' ||
                           url.pathname === '/api/location' || url.pathname === '/api/location/' ||
                           url.pathname === '/api/v1/telemetry' || url.pathname === '/api/v1/telemetry/' ||
                           url.pathname === '/location' || url.pathname === '/track' || url.pathname === '/telemetry';

    if (isTelemetryPath || hasTraccarParams || (request.method === 'POST' && url.pathname === '/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
            'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
          },
        });
      }

      // Check query params first (Traccar OsmAnd passes all data as URL-encoded query parameters)
      let id = url.searchParams.get('id') || url.searchParams.get('uniqueId') || url.searchParams.get('deviceid') || url.searchParams.get('deviceId');
      let driver = url.searchParams.get('driver') || url.searchParams.get('driverName') || '';
      let lat = parseFloat(url.searchParams.get('lat') || url.searchParams.get('latitude') || '');
      let lon = parseFloat(url.searchParams.get('lon') || url.searchParams.get('lng') || url.searchParams.get('longitude') || '');
      let rawSpeed = parseFloat(url.searchParams.get('speed') || '0');
      let bearing = parseFloat(url.searchParams.get('bearing') || url.searchParams.get('heading') || '0');
      let altitude = parseFloat(url.searchParams.get('altitude') || '0');
      let accuracy = parseFloat(url.searchParams.get('accuracy') || '0');
      let batt = parseFloat(url.searchParams.get('batt') || url.searchParams.get('battery') || '100');
      let chargeParam = url.searchParams.get('charge');
      let charge = chargeParam === 'true' || chargeParam === '1';

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
            if (body.accuracy !== undefined) accuracy = parseFloat(body.accuracy);
            if (body.batt !== undefined || body.battery !== undefined) batt = parseFloat(body.batt || body.battery);
            if (body.charge !== undefined) charge = Boolean(body.charge);
            if (body.timestamp) timestamp = new Date(body.timestamp).getTime() || Date.now();
          } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            if (!id) id = formData.get('id') || formData.get('uniqueId') || formData.get('deviceId');
            if (!driver) driver = formData.get('driver') || formData.get('driverName') || '';
            if (isNaN(lat)) lat = parseFloat(formData.get('lat') || formData.get('latitude'));
            if (isNaN(lon)) lon = parseFloat(formData.get('lon') || formData.get('lng') || formData.get('longitude'));
            if (formData.has('speed')) rawSpeed = parseFloat(formData.get('speed'));
            if (formData.has('bearing')) bearing = parseFloat(formData.get('bearing') || formData.get('heading'));
            if (formData.has('altitude')) altitude = parseFloat(formData.get('altitude'));
            if (formData.has('accuracy')) accuracy = parseFloat(formData.get('accuracy'));
            if (formData.has('batt')) batt = parseFloat(formData.get('batt') || formData.get('battery'));
            if (formData.has('charge')) charge = formData.get('charge') === 'true' || formData.get('charge') === '1';
          }
        } catch (e) {
          // Empty body is standard for Traccar OsmAnd query-param POST
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
        // Traccar OsmAnd sends speed in knots (nautical miles per hr); 1 knot = 1.852 km/h
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

      const ruralLoc = resolveVillage(cleanLat, cleanLon);

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
        speedKnots: Number(rawSpeed.toFixed(2)),
        bearing: Math.round(((bearing % 360) + 360) % 360),
        altitude: Math.round(altitude),
        accuracy: isNaN(accuracy) ? 0 : Number(accuracy.toFixed(1)),
        batt: Math.min(100, Math.max(0, Math.round(batt))),
        battery: Math.min(100, Math.max(0, Math.round(batt))),
        charge: Boolean(charge),
        distFromBaseKm: distKm,
        roadDistFromBaseKm: roadDistKm,
        villageName: ruralLoc.villageName,
        villageBlock: ruralLoc.villageBlock,
        villageDistrict: ruralLoc.villageDistrict,
        villageBadge: ruralLoc.villageBadge,
        villageLabel: ruralLoc.villageLabel,
        lineColor: existing.lineColor || colors.line,
        glowColor: existing.glowColor || colors.glow,
        trail: updatedTrail,
        lastSeen: timestamp,
        updatedAt: Date.now(),
        isLive: true,
      };

      // Store in edge memory cache
      liveVehicles.set(vehId, record);

      // Immediate HTTP 200 OK required by Android app
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

    // 2. Endpoint: /api/clear (Clears in-memory live telemetry cache)
    if (url.pathname === '/api/clear' || url.pathname === '/api/clear/') {
      liveVehicles.clear();
      return new Response(JSON.stringify({
        success: true,
        message: 'Live telemetry cache cleared',
        count: 0
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 3. Endpoint: /api/vehicles (Returns dynamically registered live fleet)
    if (url.pathname === '/api/vehicles' || url.pathname === '/api/vehicles/') {
      // 3-Stage Rural Lifecycle: Live (<60s) -> Signal Gap (1m - 15m) -> Parked (15m - 35m) -> Decommission (>35m)
      const now = Date.now();
      const DECOMMISSION_TIMEOUT_MS = 35 * 60 * 1000; // 35 minutes

      for (const [vKey, vVal] of liveVehicles.entries()) {
        const lastSeen = vVal.updatedAt || vVal.lastSeen || 0;
        if (now - lastSeen > DECOMMISSION_TIMEOUT_MS) {
          liveVehicles.delete(vKey);
        }
      }

      const list = Array.from(liveVehicles.values()).map(vVal => {
        const lastSeen = vVal.updatedAt || vVal.lastSeen || 0;
        const ageSec = Math.max(0, Math.floor((now - lastSeen) / 1000));
        const gapMinutes = Math.floor(ageSec / 60);

        const isLive = ageSec < 60;
        const isSignalGap = ageSec >= 60 && ageSec <= 15 * 60;
        const isParked = ageSec > 15 * 60;

        return {
          ...vVal,
          ageSec,
          gapMinutes,
          isLive,
          isSignalGap,
          isParked,
          networkState: isLive ? 'live' : (isSignalGap ? 'gap' : 'parked'),
        };
      });

      return new Response(JSON.stringify({
        success: true,
        vehicles: list,
        count: list.length,
        timestamp: now,
        app: 'Sant Kabir Fleet Shield',
        developer: 'Mani Ratan Singh (mrps.in)',
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'CDN-Cache-Control': 'no-store',
          'Cloudflare-CDN-Cache-Control': 'no-store',
          'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
        },
      });
    }

    // 4. Endpoint: /api/route (Dynamic Turn-by-Turn Routing Engine for Full UP Coverage)
    if (url.pathname === '/api/route' || url.pathname === '/api/route/') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }

      let fromLon = parseFloat(url.searchParams.get('fromLon') || '');
      let fromLat = parseFloat(url.searchParams.get('fromLat') || '');
      const fromParam = url.searchParams.get('from');
      if (fromParam && (isNaN(fromLon) || isNaN(fromLat))) {
        const parts = fromParam.split(',');
        if (parts.length === 2) {
          fromLon = parseFloat(parts[0]);
          fromLat = parseFloat(parts[1]);
        }
      }

      let toLon = parseFloat(url.searchParams.get('toLon') || '');
      let toLat = parseFloat(url.searchParams.get('toLat') || '');
      const toParam = url.searchParams.get('to');
      if (toParam && (isNaN(toLon) || isNaN(toLat))) {
        const parts = toParam.split(',');
        if (parts.length === 2) {
          toLon = parseFloat(parts[0]);
          toLat = parseFloat(parts[1]);
        }
      }

      if (isNaN(toLon) || isNaN(toLat)) {
        toLon = BASE_LON;
        toLat = BASE_LAT;
      }

      if (isNaN(fromLon) || isNaN(fromLat)) {
        return new Response(JSON.stringify({ error: 'Missing coordinates' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
        const res = await fetch(osrmUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'SantKabirFleetShield/1.0 (https://fleet.mrps.in)' },
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`OSRM status ${res.status}`);
        const data = await res.json();
        if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
          const primaryRoute = data.routes[0];
          return new Response(JSON.stringify({
            success: true,
            source: 'osrm-driving',
            roadDistanceKm: Math.round((primaryRoute.distance / 1000) * 10) / 10,
            roadDistanceMeters: Math.round(primaryRoute.distance),
            durationMin: Math.round(primaryRoute.duration / 60),
            coordinates: primaryRoute.geometry.coordinates,
            pointsCount: primaryRoute.geometry.coordinates.length,
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
        throw new Error('No route returned by OSRM');
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          error: err.name === 'AbortError' ? 'Route query timed out' : err.message,
          fallbackRequired: true,
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // 5. Fallback: Serve static assets with strict Zero-Cache for HTML & Live App
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html');

    if (isHtml) {
      const freshHeaders = new Headers(assetResponse.headers);
      freshHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      freshHeaders.set('Pragma', 'no-cache');
      freshHeaders.set('Expires', '0');
      freshHeaders.set('Surrogate-Control', 'no-store');
      freshHeaders.set('CDN-Cache-Control', 'no-store');
      freshHeaders.set('Cloudflare-CDN-Cache-Control', 'no-store');

      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers: freshHeaders,
      });
    }

    return assetResponse;
  },
};
