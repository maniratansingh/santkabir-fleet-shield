// Cloudflare Pages Function: /api/location
// Universal Receiver for Sant Kabir Fleet Shield APK pings (Engineered by Mani Ratan Singh • mrps.in)
// 100% Pure Cloudflare Pages Serverless (No external database or KV required)

export async function onRequest(context) {
  const { request } = context;

  // Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MRPS-Auth',
        'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
      },
    });
  }

  const url = new URL(request.url);
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
    id = url.searchParams.get('id') || 
         url.searchParams.get('uniqueId') || 
         url.searchParams.get('deviceid') || 
         url.searchParams.get('deviceId');

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
      if (!isNaN(parsed)) {
        timestamp = parsed > 10000000000 ? parsed : parsed * 1000;
      }
    }
  } else if (request.method === 'POST') {
    try {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await request.json();
        id = body.id || body.uniqueId || body.deviceId || body.deviceid;
        driver = body.driver || body.driverName || '';
        lat = parseFloat(body.lat || body.latitude);
        lon = parseFloat(body.lon || body.lng || body.longitude);
        rawSpeed = parseFloat(body.speed || 0);
        bearing = parseFloat(body.bearing || body.heading || 0);
        altitude = parseFloat(body.altitude || 0);
        batt = parseFloat(body.batt || body.battery || 100);
        if (body.timestamp) {
          timestamp = new Date(body.timestamp).getTime() || Date.now();
        }
      } else {
        const formData = await request.formData();
        id = formData.get('id') || formData.get('uniqueId') || formData.get('deviceid');
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
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*',
          'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
        },
      });
    }
  }

  // Validate coordinates
  if (!id || isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return new Response(JSON.stringify({ 
      error: 'Missing or invalid parameters. Required: id, lat (-90..90), lon (-180..180)' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*',
        'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
      },
    });
  }

  // Smart Speed Normalization:
  // Convert m/s to km/h if <= 60, clamp sanity at 130 km/h
  let speedKmH = 0;
  if (rawSpeed > 0) {
    if (rawSpeed > 60) {
      speedKmH = Math.min(130, Math.round(rawSpeed));
    } else {
      speedKmH = Math.min(130, Math.round(rawSpeed * 3.6));
    }
  }

  const record = {
    id: String(id).trim().toUpperCase(),
    driver: driver ? String(driver).trim() : undefined,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    speed: speedKmH,
    bearing: Math.round(((bearing % 360) + 360) % 360),
    altitude: Math.round(altitude),
    batt: Math.min(100, Math.max(0, Math.round(batt))),
    lastSeen: timestamp,
    updatedAt: Date.now(),
  };

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
