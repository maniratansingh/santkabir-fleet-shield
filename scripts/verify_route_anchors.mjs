// Regression guard: every route must start at the one real base,
// Sant Kabir Eye Hospital, Basti.
//
// Fails if:
//  - a village route does not start within 0.75 km of the base;
//  - a fleet routeWaypoints array does not start within 0.75 km of the base;
//  - any route starts at the old Khalilabad origin;
//  - a generator script hardcodes the old origin.
//
// Run with: npm run test:routes

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE_LAT, BASE_LON } from '../src/utils/baseLocation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const BASE = [BASE_LON, BASE_LAT];
const OLD_KHALILABAD = [83.0722, 26.7797];
const ANCHOR_TOLERANCE_KM = 0.75;

let pass = 0;
let fail = 0;

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function ok(message) {
  pass++;
  console.log(`✅ [PASS] ${message}`);
}

function bad(message) {
  fail++;
  console.log(`❌ [FAIL] ${message}`);
}

function checkRoute(label, coords) {
  if (!Array.isArray(coords) || coords.length < 2) {
    bad(`${label}: missing or truncated coordinates`);
    return;
  }
  const first = coords[0];
  const baseKm = haversineKm(first, BASE);
  const oldKm = haversineKm(first, OLD_KHALILABAD);
  if (baseKm > ANCHOR_TOLERANCE_KM) {
    bad(`${label}: starts ${baseKm.toFixed(2)} km from Basti (${first.join(', ')})`);
  } else if (oldKm < 0.5) {
    bad(`${label}: starts at the old Khalilabad origin`);
  } else {
    ok(`${label}: ${baseKm.toFixed(2)} km from base · ${coords.length} points`);
  }
}

console.log('=== Route anchor verification ===');
console.log(`Base: Sant Kabir Eye Hospital, Basti [${BASE_LON}, ${BASE_LAT}]`);
console.log(`Old Khalilabad origin must NOT appear: [${OLD_KHALILABAD.join(', ')}]\n`);

const villageRoutes = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/allVillagesRoadRoutes.json'), 'utf8')
);
for (const [name, route] of Object.entries(villageRoutes)) {
  checkRoute(`village ${name}`, route.coordinates);
}

const { INITIAL_17_FLEET } = await import('../src/data/initial17Fleet.js');
for (const vehicle of INITIAL_17_FLEET) {
  checkRoute(`fleet ${vehicle.id} (${vehicle.villageName})`, vehicle.routeWaypoints);
}

const fleet15 = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/purvanchal15FleetData.json'), 'utf8')
);
for (const vehicle of fleet15) {
  checkRoute(`fleet15 ${vehicle.id} (${vehicle.village})`, vehicle.coords);
}

const { INITIAL_11_FLEET } = await import('../src/data/initial11Fleet.js');
for (const vehicle of INITIAL_11_FLEET) {
  checkRoute(`fleet11 ${vehicle.id} (${vehicle.villageName})`, vehicle.routeWaypoints);
}

for (const script of ['scripts/build_all_75_road_routes.mjs', 'scripts/build_all_13_districts_routes.mjs']) {
  const text = fs.readFileSync(path.join(root, script), 'utf8');
  if (/const\s+BASE_(LON|LAT)\s*=\s*(83\.0722|26\.7797)/.test(text)) {
    bad(`${script}: still hardcodes the old Khalilabad base`);
  } else {
    ok(`${script}: uses the shared Basti base`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log('🎉 ROUTE ANCHOR VERIFICATION PASSED');
