// Rebuilds every static fleet routeWaypoints array from the base-anchored
// village route database. One base only: Sant Kabir Eye Hospital, Basti.
//
// Run after: node scripts/build_all_75_road_routes.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE_LAT, BASE_LON } from '../src/utils/baseLocation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../src/data');
const routesPath = path.join(dataDir, 'allVillagesRoadRoutes.json');
const BASE = [BASE_LON, BASE_LAT];

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

function nearestVertex(coords, point) {
  let best = coords[0];
  let bestDist = Infinity;
  for (const coord of coords) {
    const d = haversineKm(coord, point);
    if (d < bestDist) {
      bestDist = d;
      best = coord;
    }
  }
  return best;
}

function assertBaseAnchored(coords, label) {
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error(`${label}: missing route coordinates`);
  }
  const d = haversineKm(coords[0], BASE);
  if (d > 0.75) {
    throw new Error(`${label}: route starts ${d.toFixed(1)} km from Basti, not at the base`);
  }
}

function updateLabelDistance(label, km) {
  if (typeof label !== 'string') return label;
  return label.replace(/(•\s*)[\d.]+(\s*km)/, `$1${km}$2`);
}

const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
const { INITIAL_17_FLEET } = await import('../src/data/initial17Fleet.js?t=' + Date.now());
const { FLEET_15 } = await import('../src/data/purvanchal15FleetData.js?t=' + Date.now());

const fleet17 = JSON.parse(JSON.stringify(INITIAL_17_FLEET));
const fleet15 = JSON.parse(JSON.stringify(FLEET_15));
const missing = [];

for (const vehicle of fleet17) {
  const route = routes[vehicle.villageName];
  if (!route) {
    missing.push(`initial17Fleet ${vehicle.id} → ${vehicle.villageName}`);
    continue;
  }
  assertBaseAnchored(route.coordinates, `initial17Fleet ${vehicle.id}`);
  vehicle.routeWaypoints = route.coordinates;
  vehicle.roadDistFromBaseKm = route.roadDistanceKm;
  const point = nearestVertex(route.coordinates, [vehicle.lon, vehicle.lat]);
  vehicle.lon = point[0];
  vehicle.lat = point[1];
  vehicle.distFromBaseKm = Math.round(haversineKm(BASE, point) * 10) / 10;
  vehicle.villageLabel = updateLabelDistance(vehicle.villageLabel, route.roadDistanceKm);
}

for (const vehicle of fleet15) {
  const route = routes[vehicle.village];
  if (!route) {
    missing.push(`FLEET_15 ${vehicle.id} → ${vehicle.village}`);
    continue;
  }
  assertBaseAnchored(route.coordinates, `FLEET_15 ${vehicle.id}`);
  vehicle.coords = route.coordinates;
  vehicle.roadDistanceKm = route.roadDistanceKm;
}

if (missing.length) {
  console.error('Missing village routes:');
  missing.forEach((m) => console.error(' -', m));
  process.exit(1);
}

const header =
  '// Generated route data. Origin: Sant Kabir Eye Hospital, Basti.\n' +
  '// Do not anchor these routes to Khalilabad or any other town.\n';

fs.writeFileSync(
  path.join(dataDir, 'initial17Fleet.js'),
  `${header}export const INITIAL_17_FLEET = ${JSON.stringify(fleet17, null, 2)};\n`,
  'utf8'
);

fs.writeFileSync(
  path.join(dataDir, 'purvanchal15FleetData.js'),
  `${header}export const FLEET_15 = ${JSON.stringify(fleet15, null, 2)};\nexport default FLEET_15;\n`,
  'utf8'
);

fs.writeFileSync(
  path.join(dataDir, 'purvanchal15FleetData.json'),
  `${JSON.stringify(fleet15, null, 2)}\n`,
  'utf8'
);

console.log(`Updated ${fleet17.length} initial17Fleet routes`);
console.log(`Updated ${fleet15.length} FLEET_15 routes`);
console.log(`Base: ${BASE_LAT}, ${BASE_LON}`);
