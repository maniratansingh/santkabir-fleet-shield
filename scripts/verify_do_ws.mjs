// Manual Durable Object + WebSocket integration check.
//
// Start the local Workers runtime first:
//   npx wrangler dev --port 8787 --local
// Then run:
//   node scripts/verify_do_ws.mjs

const BASE = 'http://localhost:8787';
const WS_URL = 'ws://localhost:8787/api/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const messages = [];
const ws = new WebSocket(WS_URL);
ws.onmessage = (event) => {
  try { messages.push(JSON.parse(event.data)); } catch (e) {}
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
  setTimeout(() => reject(new Error('WebSocket open timeout')), 5000);
});

ws.send(JSON.stringify({ type: 'subscribe' }));
await sleep(500);
assert(messages.some((m) => m.type === 'snapshot'), 'Dashboard socket receives an initial snapshot');

// Tracker socket: raw GPS packet in, processed delta out to dashboards.
const trackerMessages = [];
const tracker = new WebSocket(`${WS_URL}?role=tracker`);
tracker.onmessage = (event) => {
  try { trackerMessages.push(JSON.parse(event.data)); } catch (e) {}
};
await new Promise((resolve, reject) => {
  tracker.onopen = resolve;
  tracker.onerror = reject;
  setTimeout(() => reject(new Error('Tracker WebSocket open timeout')), 5000);
});
await sleep(300);
assert(
  trackerMessages.some((m) => m.type === 'ready'),
  'Tracker socket receives a ready handshake'
);

tracker.send(JSON.stringify({
  id: 'WS-AMB-02',
  lat: 26.8500,
  lon: 82.8500,
  speed: 12.5,
  bearing: 90,
  batt: 80,
  charge: true,
  timestamp: Date.now(),
}));
await sleep(1200);

const trackerDelta = messages.find((m) => m.type === 'delta' && m.vehicle?.id === 'WS-AMB-02');
assert(Boolean(trackerDelta), 'Tracker packet is broadcast to the dashboard socket');
assert(trackerDelta?.vehicle?.speed === 23, 'Tracker knots are normalized to km/h');
assert(trackerDelta?.vehicle?.lat === 26.85, 'Tracker delta preserves latitude');
assert(
  trackerMessages.some((m) => m.type === 'ack' && m.id === 'WS-AMB-02'),
  'Tracker socket receives an acknowledgement'
);

// Compact array packet: [id, lat, lon, speed, bearing, timestamp]
tracker.send(JSON.stringify(['WS-AMB-03', 26.8600, 82.8600, 10, 180, Date.now()]));
await sleep(1000);
assert(
  messages.some((m) => m.type === 'delta' && m.vehicle?.id === 'WS-AMB-03'),
  'Compact array tracker packet is accepted'
);
tracker.close();

const httpVehicleId = `DO-AMB-${Date.now()}`;
const trackRes = await fetch(
  `${BASE}/api/track?id=${httpVehicleId}&lat=26.8467&lon=80.9462&speed=12.5&bearing=180&batt=90&charge=true`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
);
assert(trackRes.status === 200, 'HTTP telemetry ingestion returns 200');

await sleep(1800);
const delta = messages.find((m) => m.type === 'delta' && m.vehicle?.id === httpVehicleId);
assert(Boolean(delta), 'Durable Object broadcasts the telemetry delta over WebSocket');
assert(delta?.vehicle?.lat === 26.8467, 'Delta preserves the latitude');
assert(delta?.vehicle?.lon === 80.9462, 'Delta preserves the longitude');

const vehiclesRes = await fetch(`${BASE}/api/vehicles`);
const vehiclesJson = await vehiclesRes.json();
assert(vehiclesJson.count >= 1, 'HTTP fleet endpoint still reports the vehicle');
assert(vehiclesJson.vehicles.some((v) => v.id === httpVehicleId), 'HTTP vehicle appears in the fleet');

ws.close();
console.log(`\n🎉 DO/WS VERIFICATION: ${passed}/${total} PASSED`);
