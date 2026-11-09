// Precomputes authentic OSM road routes from the one and only base:
// Sant Kabir Eye Hospital, Basti (26.797313, 82.718401).
//
// Generates src/data/allVillagesRoadRoutes.json.
//
// Khalilabad is NOT a base and must never be used as the route origin.
// Run with LIMIT=5 for a smoke test, or RESUME=1 to continue after a failure.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE_LAT, BASE_LON } from '../src/utils/baseLocation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_COORD = [BASE_LON, BASE_LAT];
const villagesPath = path.resolve(__dirname, '../src/data/ruralVillages.json');
const outputPath = process.env.OUTPUT_PATH
  ? path.resolve(process.env.OUTPUT_PATH)
  : path.resolve(__dirname, '../src/data/allVillagesRoadRoutes.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const villages = JSON.parse(fs.readFileSync(villagesPath, 'utf8'));
const limit = Number(process.env.LIMIT) || villages.length;
const resume = process.env.RESUME === '1';
const force = process.env.FORCE === '1';
const requestDelayMs = Number(process.env.REQUEST_DELAY_MS) || 300;
const maxRetries = Number(process.env.MAX_RETRIES) || 4;
const anchorToleranceKm = 0.75;

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

function isBaseAnchored(coords) {
  return Array.isArray(coords) && coords.length > 1 && haversineKm(coords[0], BASE_COORD) <= anchorToleranceKm;
}

async function fetchRouteWithRetry(village) {
  const url = `https://router.project-osrm.org/route/v1/driving/${BASE_LON},${BASE_LAT};${village.lon},${village.lat}?overview=full&geometries=geojson`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SantKabirFleetShield/1.0 (https://fleet.mrps.in)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const route = data.routes[0];
        const rawCoords = route.geometry.coordinates;
        const simplified = [];
        for (let i = 0; i < rawCoords.length; i++) {
          if (i === 0 || i === rawCoords.length - 1 || i % 2 === 0) {
            simplified.push([Number(rawCoords[i][0].toFixed(6)), Number(rawCoords[i][1].toFixed(6))]);
          }
        }
        if (!isBaseAnchored(simplified)) {
          throw new Error('OSRM returned a route that does not start at the Basti base');
        }
        return {
          success: true,
          roadDistanceKm: Math.round((route.distance / 1000) * 10) / 10,
          durationMin: Math.round(route.duration / 60),
          coordinates: simplified,
        };
      }
      throw new Error(`OSRM code ${data.code || 'unknown'}`);
    } catch (err) {
      if (attempt === maxRetries) {
        console.warn(`\nFailed routing for ${village.name}: ${err.message}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  return null;
}

let existing = {};
if (resume && fs.existsSync(outputPath)) {
  try { existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')); } catch (e) { existing = {}; }
}

const routesDatabase = {};
if (resume && !force) {
  for (const [key, value] of Object.entries(existing)) {
    if (value && isBaseAnchored(value.coordinates)) routesDatabase[key] = value;
  }
}

console.log('========================================================================');
console.log(`🏥 Base Hospital: Sant Kabir Eye Hospital, Basti [${BASE_LON}, ${BASE_LAT}]`);
console.log(`📍 Villages: ${villages.length} · processing ${Math.min(limit, villages.length)}`);
console.log(`📦 Existing base-anchored routes: ${Object.keys(routesDatabase).length}`);
console.log('========================================================================\n');

const failures = [];
let completed = 0;
let fetched = 0;

for (const village of villages.slice(0, limit)) {
  if (!force && routesDatabase[village.name]?.coordinates?.length > 1) {
    completed++;
    continue;
  }

  const route = await fetchRouteWithRetry(village);
  if (route?.success) {
    routesDatabase[village.name] = {
      name: village.name,
      block: village.block,
      district: village.district,
      lat: village.lat,
      lon: village.lon,
      type: village.type,
      roadDistanceKm: route.roadDistanceKm,
      durationMin: route.durationMin,
      coordinates: route.coordinates,
    };
    fetched++;
    completed++;
    process.stdout.write(
      `\r[${completed}/${Math.min(limit, villages.length)}] ${village.name.padEnd(28)} ${route.roadDistanceKm} km · ${route.coordinates.length} pts`
    );
  } else {
    failures.push(village.name);
  }

  await new Promise((r) => setTimeout(r, requestDelayMs));
}

if (failures.length > 0) {
  const partialPath = path.resolve(__dirname, '../src/data/allVillagesRoadRoutes.partial.json');
  fs.writeFileSync(partialPath, JSON.stringify(routesDatabase, null, 2), 'utf8');
  console.error(`\n\n❌ ${failures.length} route(s) failed. Old data was not replaced.`);
  console.error(`Partial results: ${partialPath}`);
  console.error(`Failed: ${failures.join(', ')}`);
  process.exit(1);
}

fs.writeFileSync(outputPath, JSON.stringify(routesDatabase, null, 2), 'utf8');
console.log(`\n\n✅ Saved ${Object.keys(routesDatabase).length} base-anchored routes to ${outputPath}`);
console.log(`📦 Size: ${(fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2)} MB`);
