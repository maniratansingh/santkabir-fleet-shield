// Cloudflare Pages Advanced Mode Worker: _worker.js
// Handles /api/location and /api/vehicles serverless endpoints + serves static assets
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Production Clean: 0 Mock Data. Dynamic live telemetry only.

// In-memory telemetry cache for active fleet ambulances
const liveVehicles = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Endpoint: /api/location (Receives GPS telemetry from Fleet Shield APK)
    if (url.pathname === '/api/location' || url.pathname === '/api/location/') {
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

      let id = null;
      let driver = null;
      let lat = null;
      let lon = null;
      let rawSpeed = 0;
      let bearing = 0;
      let altitude = 0;
      let batt = 100;
      let timestamp = Date.now();

      if (request.method === 'GET') {
        id = url.searchParams.get('id') || url.searchParams.get('uniqueId') || url.searchParams.get('deviceid');
        driver = url.searchParams.get('driver') || url.searchParams.get('driverName') || '';
        lat = parseFloat(url.searchParams.get('lat') || url.searchParams.get('latitude') || '');
        lon = parseFloat(url.searchParams.get('lon') || url.searchParams.get('lng') || url.searchParams.get('longitude') || '');
        rawSpeed = parseFloat(url.searchParams.get('speed') || '0');
        bearing = parseFloat(url.searchParams.get('bearing') || url.searchParams.get('heading') || '0');
        altitude = parseFloat(url.searchParams.get('altitude') || '0');
        batt = parseFloat(url.searchParams.get('batt') || url.searchParams.get('battery') || '100');
        const tsParam = url.searchParams.get('timestamp') || url.searchParams.get('time');
        if (tsParam) {
          const parsed = parseInt(tsParam, 10);
          if (!isNaN(parsed)) timestamp = parsed > 10000000000 ? parsed : parsed * 1000;
        }
      } else if (request.method === 'POST') {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const body = await request.json();
            id = body.id || body.uniqueId || body.deviceId;
            driver = body.driver || body.driverName || '';
            lat = parseFloat(body.lat || body.latitude);
            lon = parseFloat(body.lon || body.lng || body.longitude);
            rawSpeed = parseFloat(body.speed || 0);
            bearing = parseFloat(body.bearing || body.heading || 0);
            altitude = parseFloat(body.altitude || 0);
            batt = parseFloat(body.batt || body.battery || 100);
            if (body.timestamp) timestamp = new Date(body.timestamp).getTime() || Date.now();
          } else {
            const formData = await request.formData();
            id = formData.get('id') || formData.get('uniqueId');
            driver = formData.get('driver') || formData.get('driverName') || '';
            lat = parseFloat(formData.get('lat') || formData.get('latitude'));
            lon = parseFloat(formData.get('lon') || formData.get('lng') || formData.get('longitude'));
            rawSpeed = parseFloat(formData.get('speed') || '0');
            bearing = parseFloat(formData.get('bearing') || formData.get('heading') || '0');
            batt = parseFloat(formData.get('batt') || formData.get('battery') || '100');
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: 'Invalid payload: ' + e.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
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
        speedKmH = rawSpeed > 60 ? Math.min(130, Math.round(rawSpeed)) : Math.min(130, Math.round(rawSpeed * 3.6));
      }

      const vehId = String(id).trim().toUpperCase();
      const existing = liveVehicles.get(vehId) || {};

      const record = {
        id: vehId,
        name: existing.name || `Ambulance ${vehId}`,
        type: 'ambulance',
        driverName: driver ? String(driver).trim() : (existing.driverName || 'Driver'),
        driverPhone: existing.driverPhone || '',
        status: speedKmH > 3 ? 'moving' : 'in_field',
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
        speed: speedKmH,
        bearing: Math.round(((bearing % 360) + 360) % 360),
        altitude: Math.round(altitude),
        batt: Math.min(100, Math.max(0, Math.round(batt))),
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
