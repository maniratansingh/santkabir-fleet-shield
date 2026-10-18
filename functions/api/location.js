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

  let accuracy = 0;
  let charge = false;

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
    accuracy = parseFloat(url.searchParams.get('accuracy') || '0');
    batt = parseFloat(url.searchParams.get('batt') || url.searchParams.get('battery') || '100');
    const chargeParam = url.searchParams.get('charge');
    charge = chargeParam === 'true' || chargeParam === '1';

    const tsParam = url.searchParams.get('timestamp') || url.searchParams.get('time');
    if (tsParam) {
      const parsed = parseInt(tsParam, 10);
      if (!isNaN(parsed)) {
        timestamp = parsed > 10000000000 ? parsed : parsed * 1000;
      }
    }
  } else if (request.method === 'POST') {
    // Traccar OsmAnd passes data as URL query parameters in POST
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
    accuracy = parseFloat(url.searchParams.get('accuracy') || '0');
    batt = parseFloat(url.searchParams.get('batt') || url.searchParams.get('battery') || '100');
    const chargeParam = url.searchParams.get('charge');
    charge = chargeParam === 'true' || chargeParam === '1';

    const tsParam = url.searchParams.get('timestamp') || url.searchParams.get('time');
    if (tsParam) {
      const parsed = parseInt(tsParam, 10);
      if (!isNaN(parsed)) {
        timestamp = parsed > 10000000000 ? parsed : parsed * 1000;
      }
    }

    // Fallback: If body contains payload
    if (isNaN(lat) || isNaN(lon) || !id) {
      try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const body = await request.json();
          if (!id) id = body.id || body.uniqueId || body.deviceId || body.deviceid;
          if (!driver) driver = body.driver || body.driverName || '';
          if (isNaN(lat)) lat = parseFloat(body.lat || body.latitude);
          if (isNaN(lon)) lon = parseFloat(body.lon || body.lng || body.longitude);
          if (body.speed !== undefined) rawSpeed = parseFloat(body.speed || 0);
          if (body.bearing !== undefined) bearing = parseFloat(body.bearing || body.heading || 0);
          if (body.altitude !== undefined) altitude = parseFloat(body.altitude || 0);
          if (body.accuracy !== undefined) accuracy = parseFloat(body.accuracy || 0);
          if (body.batt !== undefined || body.battery !== undefined) batt = parseFloat(body.batt || body.battery || 100);
          if (body.charge !== undefined) charge = Boolean(body.charge);
          if (body.timestamp) {
            timestamp = new Date(body.timestamp).getTime() || Date.now();
          }
        } else {
          const formData = await request.formData();
          if (!id) id = formData.get('id') || formData.get('uniqueId') || formData.get('deviceid');
          if (!driver) driver = formData.get('driver') || formData.get('driverName') || '';
          if (isNaN(lat)) lat = parseFloat(formData.get('lat') || formData.get('latitude'));
          if (isNaN(lon)) lon = parseFloat(formData.get('lon') || formData.get('lng') || formData.get('longitude'));
          if (formData.has('speed')) rawSpeed = parseFloat(formData.get('speed') || '0');
          if (formData.has('bearing')) bearing = parseFloat(formData.get('bearing') || formData.get('heading') || '0');
          if (formData.has('altitude')) altitude = parseFloat(formData.get('altitude') || '0');
          if (formData.has('accuracy')) accuracy = parseFloat(formData.get('accuracy') || '0');
          if (formData.has('batt')) batt = parseFloat(formData.get('batt') || formData.get('battery') || '100');
          if (formData.has('charge')) charge = formData.get('charge') === 'true' || formData.get('charge') === '1';
        }
      } catch (e) {
        // Empty body is standard for OsmAnd POST
      }
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

  // OsmAnd protocol: knots to km/h (1 knot = 1.852 km/h)
  let speedKmH = 0;
  if (rawSpeed > 0) {
    speedKmH = Math.min(130, Math.round(rawSpeed * 1.852));
  }

  const record = {
    id: String(id).trim().toUpperCase(),
    driver: driver ? String(driver).trim() : undefined,
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    speed: speedKmH,
    speedKnots: Number(rawSpeed.toFixed(2)),
    bearing: Math.round(((bearing % 360) + 360) % 360),
    altitude: Math.round(altitude),
    accuracy: isNaN(accuracy) ? 0 : Number(accuracy.toFixed(1)),
    batt: Math.min(100, Math.max(0, Math.round(batt))),
    battery: Math.min(100, Math.max(0, Math.round(batt))),
    charge: Boolean(charge),
    lastSeen: timestamp,
    updatedAt: Date.now(),
    isLive: true,
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
