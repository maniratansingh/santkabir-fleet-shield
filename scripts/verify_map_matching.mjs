// Standalone verification for src/utils/mapMatching.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { snapToRoad, clearSnapCache } from '../src/utils/mapMatching.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const roadRoutes = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../src/data/roadRoutes.json'), 'utf8')
);

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

const firstCorridor = Object.values(roadRoutes)[0];
const [roadLon, roadLat] = firstCorridor.coordinates[0];

// A point about 7 m off the road should snap.
const near = snapToRoad(roadLat + 0.00006, roadLon + 0.00006, 25);
assert(near.snapped === true, 'Point within 25 m snaps to the road');
assert(near.distanceM <= 25, `Snap distance is within 25 m (${near.distanceM.toFixed(2)} m)`);
assert(
  Math.abs(near.lat - roadLat) < 0.0002 && Math.abs(near.lon - roadLon) < 0.0002,
  'Snapped coordinate lands on the road centreline'
);

// A point about 1.1 km away must remain unsnapped.
const far = snapToRoad(roadLat + 0.01, roadLon + 0.01, 25);
assert(far.snapped === false, 'Point beyond 25 m remains unsnapped');
assert(far.lat === roadLat + 0.01 && far.lon === roadLon + 0.01, 'Unsnapped point preserves raw coordinates');

// Cache should return the same object for the same rounded coordinate.
clearSnapCache();
const a = snapToRoad(roadLat + 0.00006, roadLon + 0.00006, 25);
const b = snapToRoad(roadLat + 0.00006, roadLon + 0.00006, 25);
assert(a === b, 'Repeated coordinates use the snap cache');

console.log(`\n🎉 MAP MATCHING VERIFICATION: ${passed}/${total} PASSED`);
