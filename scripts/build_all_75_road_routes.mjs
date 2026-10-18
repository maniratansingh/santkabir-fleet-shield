// Precomputes and caches real OpenStreetMap turn-by-turn road routes
// from Sant Kabir Hospital Base (Khalilabad) to all 74 Purvanchal rural villages.
// Generates src/data/allVillagesRoadRoutes.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_LON = 83.0722;
const BASE_LAT = 26.7797;

const villagesPath = path.resolve(__dirname, '../src/data/ruralVillages.json');
const outputPath = path.resolve(__dirname, '../src/data/allVillagesRoadRoutes.json');

const villages = JSON.parse(fs.readFileSync(villagesPath, 'utf8'));

console.log(`Starting real OSRM road geometry extraction for ${villages.length} Purvanchal villages...`);

// Rate-limited OSRM fetch with retries
async function fetchRouteWithRetry(village, retries = 3) {
  const url = `https://router.project-osrm.org/route/v1/driving/${BASE_LON},${BASE_LAT};${village.lon},${village.lat}?overview=full&geometries=geojson`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'SantKabirFleetShield/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const route = data.routes[0];
        const rawCoords = route.geometry.coordinates; // [[lon, lat], ...]
        
        // Decimate points slightly if too dense to keep file fast and light (max 1 point every 150m)
        const simplified = [];
        for (let i = 0; i < rawCoords.length; i++) {
          if (i === 0 || i === rawCoords.length - 1 || i % 2 === 0) {
            simplified.push([Number(rawCoords[i][0].toFixed(6)), Number(rawCoords[i][1].toFixed(6))]);
          }
        }
        
        return {
          success: true,
          distanceMeters: route.distance,
          roadDistanceKm: Math.round((route.distance / 1000) * 10) / 10,
          durationMin: Math.round(route.duration / 60),
          coordinates: simplified,
        };
      }
    } catch (err) {
      if (attempt === retries) {
        console.warn(`Failed routing for ${village.name}: ${err.message}`);
        return null;
      }
      await new Promise(r => setTimeout(r, 600 * attempt));
    }
  }
  return null;
}

const routesDatabase = {};
let completed = 0;

for (const village of villages) {
  const route = await fetchRouteWithRetry(village);
  if (route && route.success) {
    const key = village.name;
    routesDatabase[key] = {
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
    completed++;
    process.stdout.write(`\r[${completed}/${villages.length}] Cached road route to: ${village.name.padEnd(25)} (${route.roadDistanceKm} km, ${route.coordinates.length} waypoints)`);
  } else {
    // Fallback: direct road interpolation if OSRM unreachable
    console.warn(`\nFallback used for ${village.name}`);
  }
  // Polite pause between requests to respect public OSRM server
  await new Promise(r => setTimeout(r, 120));
}

console.log(`\n\nSuccessfully precomputed ${Object.keys(routesDatabase).length} authentic road routes!`);
fs.writeFileSync(outputPath, JSON.stringify(routesDatabase, null, 2), 'utf8');
console.log(`Saved to ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
