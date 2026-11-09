// Standalone verification for src/utils/kalman.js
// This is intentionally separate from the 28-test master contract suite.

import { createKinematicFilter } from '../src/utils/kalman.js';

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

function stdDev(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Deterministic LCG so the test is reproducible.
let seed = 42;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

const BASE_LAT = 26.8467;
const BASE_LON = 80.9462;

// --- Stationary noise rejection ---
const stationary = createKinematicFilter({ processAccel: 0.05 });
const rawLats = [];
const filteredLats = [];
for (let i = 0; i < 60; i++) {
  const rawLat = BASE_LAT + (random() - 0.5) * 0.0002; // about +/- 11 m
  const rawLon = BASE_LON + (random() - 0.5) * 0.0002;
  rawLats.push(rawLat);
  const out = stationary.update(rawLat, rawLon, 10, 1_700_000_000_000 + i * 5000);
  filteredLats.push(out.lat);
}

const rawStd = stdDev(rawLats);
const filteredStd = stdDev(filteredLats);
assert(Number.isFinite(filteredStd), 'Stationary filter produces finite latitude values');
assert(
  filteredStd < rawStd * 0.7,
  `Stationary filter reduces latitude noise (raw ${rawStd.toExponential(2)} -> filtered ${filteredStd.toExponential(2)})`
);

// --- Moving target tracking ---
const moving = createKinematicFilter({ processAccel: 0.05 });
let last = null;
for (let i = 0; i < 20; i++) {
  const rawLat = BASE_LAT + i * 0.0005; // about 55 m per 5 s, roughly 40 km/h
  const rawLon = BASE_LON;
  last = moving.update(rawLat, rawLon, 8, 1_700_000_000_000 + i * 5000);
}
assert(last && Number.isFinite(last.lat), 'Moving filter produces a finite position');
assert(last && last.lat > BASE_LAT, 'Moving filter tracks northbound motion');
assert(last && last.vLat > 0, 'Moving filter estimates a positive northbound velocity');
assert(
  last && Math.abs(last.lat - (BASE_LAT + 19 * 0.0005)) < 0.01,
  'Moving filter stays within 0.01 degrees of the latest raw fix'
);

// --- Reset and first-fix contract ---
moving.reset();
const first = moving.update(BASE_LAT, BASE_LON, 12, 1_700_000_100_000);
assert(first.lat === BASE_LAT && first.lon === BASE_LON, 'First fix after reset is returned raw');
assert(first.filtered === false, 'First fix is marked unfiltered');

console.log(`\n🎉 KALMAN VERIFICATION: ${passed}/${total} PASSED`);
