// Cloudflare Pages Function: /api/track
// Traccar OsmAnd Protocol Ingestion Endpoint for Sant Kabir Fleet Shield
// Compatible with the customized Sant Kabir Fleet Shield Android App
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)

export async function onRequest(context) {
  const { request } = context;

  // Handle CORS Preflight
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

  const url = new URL(request.url);

  // Extract Traccar OsmAnd Protocol query parameters:
  // POST /api/track?id=VEHICLE-102&timestamp=1697632824&lat=26.8467&lon=80.9462&speed=12.5&bearing=180.0&altitude=120.0&accuracy=10.0&batt=85.0&charge=true
  let id = url.searchParams.get('id') || 
           url.searchParams.get('uniqueId') || 
           url.searchParams.get('deviceId') || 
           url.searchParams.get('deviceid');

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
    if (!isNaN(parsed)) {
      // If seconds (epoch < 10000000000), convert to ms
      timestamp = parsed > 10000000000 ? parsed : parsed * 1000;
    }
  }

  // Fallback: If POST with body and params were not in query URL
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
        if (formData.has('accuracy')) accuracy = parseFloat(formData.get('accuracy'));
        if (formData.has('batt')) batt = parseFloat(formData.get('batt') || formData.get('battery'));
        if (formData.has('charge')) charge = formData.get('charge') === 'true' || formData.get('charge') === '1';
      }
    } catch (e) {
      // Empty body is standard for Traccar OsmAnd query-param POST
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

  // Speed in knots -> km/h (1 knot = 1.852 km/h)
  let speedKmH = 0;
  if (rawSpeed > 0) {
    speedKmH = Math.min(130, Math.round(rawSpeed * 1.852));
  }

  const vehId = String(id).trim().toUpperCase();
  const record = {
    id: vehId,
    name: vehId,
    type: 'ambulance',
    driverName: driver ? String(driver).trim() : 'Assigned Driver',
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
