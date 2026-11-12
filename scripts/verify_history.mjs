// History Durable Object + auth verification.
//
// Start the local Worker first:
//   npx wrangler dev --port 8787 --local
// Then run:
//   node scripts/verify_history.mjs
//
// The local .dev.vars uses HISTORY_PASSWORD=test-history. The real production
// password is a Cloudflare secret and is never stored in the repository.

const BASE = 'http://localhost:8787';
const PASSWORD = process.env.HISTORY_PASSWORD || 'test-history';
const ID = `HISTORY-CHECK-${Date.now()}`;

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. Unauthenticated access is rejected.
const unauth = await fetch(`${BASE}/api/history/vehicles`);
assert(unauth.status === 401, 'History API rejects unauthenticated requests');

// 2. Wrong password is rejected.
const wrong = await fetch(`${BASE}/api/history/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'wrong-password' }),
});
assert(wrong.status === 401, 'History login rejects a wrong password');

// 3. Correct password sets a session cookie.
const login = await fetch(`${BASE}/api/history/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
});
const setCookie = login.headers.get('set-cookie') || '';
const cookie = setCookie.split(';')[0];
assert(login.status === 200, 'History login accepts the configured password');
assert(cookie.startsWith('history_session='), 'History login sets a session cookie');

// 4. Ingest a telemetry packet. The history write is asynchronous.
const nowSeconds = Math.floor(Date.now() / 1000);
const track = await fetch(
  `${BASE}/api/track?id=${encodeURIComponent(ID)}&lat=26.8500&lon=82.8500&speed=10&bearing=90&batt=80&timestamp=${nowSeconds}`,
  { method: 'POST' }
);
assert(track.status === 200, 'Telemetry ingestion still returns 200');
await sleep(1500);

// 5. The vehicle appears in history.
const vehicles = await fetch(`${BASE}/api/history/vehicles`, {
  headers: { Cookie: cookie },
});
const vehiclesJson = await vehicles.json();
assert(
  vehiclesJson.vehicles?.some((vehicle) => vehicle.id === ID),
  'History lists the ingested vehicle'
);

// 6. The point is queryable for the range.
const from = (nowSeconds - 3600) * 1000;
const to = (nowSeconds + 3600) * 1000;
const history = await fetch(
  `${BASE}/api/history?id=${encodeURIComponent(ID)}&from=${from}&to=${to}`,
  { headers: { Cookie: cookie } }
);
const historyJson = await history.json();
assert(historyJson.count === 1, 'History returns the 30-minute bucket point');
assert(historyJson.points?.[0]?.lat === 26.85, 'History preserves latitude');
assert(historyJson.points?.[0]?.lon === 82.85, 'History preserves longitude');

// 7. Delete the test vehicle's history.
const remove = await fetch(`${BASE}/api/history/delete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ id: ID }),
});
assert(remove.status === 200, 'History delete returns 200');

const after = await fetch(
  `${BASE}/api/history?id=${encodeURIComponent(ID)}&from=${from}&to=${to}`,
  { headers: { Cookie: cookie } }
);
const afterJson = await after.json();
assert(afterJson.count === 0, 'History is empty after delete');

console.log(`\n🎉 HISTORY VERIFICATION: ${passed}/${total} PASSED`);
