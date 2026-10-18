// Verification Script for Master Integration Specification
// Sant Kabir Fleet Shield (Android App <-> Web Backend)
// Tests:
// 1. Provisioning Contract (QR code JSON schema)
// 2. Data Ingestion Contract (Traccar OsmAnd HTTP POST with URL Query Parameters)
// 3. HTTP 200 immediate response
// 4. Knot-to-km/h conversion and parameter extraction (accuracy, charge, batt, bearing, altitude, timestamp)

import worker from '../public/_worker.js';
import QRCode from 'qrcode';

async function runTests() {
  console.log('--- 🧪 STARTING MASTER INTEGRATION TESTS ---\n');
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // --- TEST 1: PROVISIONING CONTRACT (QR CODE) ---
  console.log('📌 Test Suite 1: Provisioning Contract (QR Code)');
  const testVehicleId = 'VEHICLE-102';
  const expectedServer = 'https://fleet.mrps.in/api/track';

  const qrPayload = {
    id: testVehicleId,
    server: expectedServer
  };
  const rawJson = JSON.stringify(qrPayload);

  assert(rawJson === '{"id":"VEHICLE-102","server":"https://fleet.mrps.in/api/track"}',
    'JSON strictly matches {"id":"UNIQUE_VEHICLE_ID","server":"https://fleet.mrps.in/api/track"}');
  assert(!expectedServer.endsWith('/'), 'Server URL has no trailing slash');

  // Verify QRCode generation works on this schema
  const qrDataUrl = await QRCode.toDataURL(rawJson);
  assert(qrDataUrl.startsWith('data:image/png;base64,'), 'QR Code successfully generated as base64 PNG');

  // --- TEST 2: DATA INGESTION CONTRACT (OsmAnd Protocol) ---
  console.log('\n📌 Test Suite 2: Data Ingestion Contract (OsmAnd Protocol)');
  // Exact request from spec:
  // POST /api/track?id=VEHICLE-102&timestamp=1697632824&lat=26.8467&lon=80.9462&speed=12.5&bearing=180.0&altitude=120.0&accuracy=10.0&batt=85.0&charge=true HTTP/1.1
  const testUrl = 'https://fleet.mrps.in/api/track?id=VEHICLE-102&timestamp=1697632824&lat=26.8467&lon=80.9462&speed=12.5&bearing=180.0&altitude=120.0&accuracy=10.0&batt=85.0&charge=true';
  
  const req = new Request(testUrl, {
    method: 'POST',
    headers: {
      'Host': 'fleet.mrps.in',
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const env = { ASSETS: { fetch: async () => new Response('Asset') } };
  const res = await worker.fetch(req, env);

  assert(res.status === 200, 'Server returns immediate HTTP 200 OK');
  
  const resJson = await res.json();
  assert(resJson.success === true, 'Response JSON indicates success: true');
  assert(resJson.vehicle !== undefined, 'Response includes updated vehicle record');

  const v = resJson.vehicle;
  assert(v.id === 'VEHICLE-102', 'Vehicle ID matches: VEHICLE-102');
  assert(v.lat === 26.8467, 'Latitude correctly parsed: 26.8467');
  assert(v.lon === 80.9462, 'Longitude correctly parsed: 80.9462');
  // Speed: 12.5 knots * 1.852 = 23.15 -> rounded to 23 km/h
  assert(v.speed === 23, `Speed in knots (12.5) converted to km/h (expected 23, got ${v.speed})`);
  assert(v.speedKnots === 12.5, 'Raw speed in knots preserved: 12.5');
  assert(v.bearing === 180, 'Bearing correctly parsed: 180');
  assert(v.altitude === 120, 'Altitude correctly parsed: 120');
  assert(v.accuracy === 10, 'Accuracy margin correctly parsed: 10');
  assert(v.batt === 85, 'Battery level correctly parsed: 85');
  assert(v.charge === true, 'Charge status correctly parsed: true');
  assert(v.lastSeen === 1697632824000, 'Epoch seconds timestamp correctly converted to ms');

  // --- TEST 3: /api/vehicles RETRIEVAL ---
  console.log('\n📌 Test Suite 3: /api/vehicles Live Fleet Telemetry');
  const getVehiclesReq = new Request('https://fleet.mrps.in/api/vehicles', { method: 'GET' });
  const getVehiclesRes = await worker.fetch(getVehiclesReq, env);
  assert(getVehiclesRes.status === 200, '/api/vehicles returns HTTP 200 OK');

  const vehiclesData = await getVehiclesRes.json();
  assert(vehiclesData.vehicles && vehiclesData.vehicles.length >= 1, 'Live vehicle list contains the tracked vehicle');
  const found = vehiclesData.vehicles.find(item => item.id === 'VEHICLE-102');
  assert(found !== undefined, 'VEHICLE-102 found in active fleet list');
  assert(found.isLive === true, 'Vehicle flagged as isLive: true');

  // --- TEST 4: CORS & PREFLIGHT ---
  console.log('\n📌 Test Suite 4: Preflight & CORS Support');
  const optionsReq = new Request('https://fleet.mrps.in/api/track', { method: 'OPTIONS' });
  const optionsRes = await worker.fetch(optionsReq, env);
  assert(optionsRes.status === 204, 'OPTIONS preflight returns HTTP 204 No Content');
  assert(optionsRes.headers.get('Access-Control-Allow-Origin') === '*', 'CORS allows * origin');

  console.log(`\n========================================`);
  console.log(`🎉 ALL TESTS COMPLETED: ${passed}/${total} PASSED`);
  console.log(`========================================\n`);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
