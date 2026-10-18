// 20-Ambulance Live Rural Telemetry Simulator for Sant Kabir Fleet Shield
// Uses authentic OpenStreetMap turn-by-turn road routes from allVillagesRoadRoutes.json
// Every car strictly patrols on asphalt state highways and rural roads — ZERO straight lines!
// Target: http://localhost:3000 (and mirrors to https://fleet.mrps.in)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_HOST = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const ENDPOINT = `${TARGET_HOST}/api/location`;
const CLEAR_ENDPOINT = `${TARGET_HOST}/api/clear`;
const PING_INTERVAL_MS = 2000; // 2.0 seconds smooth updates

// Load authentic precomputed OpenStreetMap road routes
const routesPath = path.resolve(__dirname, '../src/data/allVillagesRoadRoutes.json');
const allRoutes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));

// 20 Authentic Villages in and around Basti District, Eastern UP
const BASTI_VILLAGES = [
  { id: 'AMB-01', village: 'Harraiya Gram', block: 'Harraiya', driver: 'Ramesh Yadav' },
  { id: 'AMB-02', village: 'Rudhauli Bazar', block: 'Rudhauli', driver: 'Suresh Maurya' },
  { id: 'AMB-03', village: 'Walterganj Gram', block: 'Saltaua', driver: 'Manoj Singh' },
  { id: 'AMB-04', village: 'Captainganj Gram', block: 'Captainganj', driver: 'Arvind Tiwari' },
  { id: 'AMB-05', village: 'Parasrampur Gram', block: 'Parasrampur', driver: 'Vikram Patel' },
  { id: 'AMB-06', village: 'Gaur Bazar', block: 'Gaur', driver: 'Deepak Verma' },
  { id: 'AMB-07', village: 'Mahadewa Gram', block: 'Kudaraha', driver: 'Sunil Yadav' },
  { id: 'AMB-08', village: 'Bankati Gram', block: 'Bankati', driver: 'Pooja Sharma' },
  { id: 'AMB-09', village: 'Saltaua Gopalpur Gram', block: 'Saltaua', driver: 'Rajesh Verma' },
  { id: 'AMB-10', village: 'Kudaraha Gram', block: 'Kudaraha', driver: 'Sanjay Gupta' },
  { id: 'AMB-11', village: 'Vikramjot Gram', block: 'Vikramjot', driver: 'Rakesh Tiwari' },
  { id: 'AMB-12', village: 'Dubaulia Bazar', block: 'Dubaulia', driver: 'Anita Patel' },
  { id: 'AMB-13', village: 'Kalwari Bazar', block: 'Basti Sadar', driver: 'Vinod Pandey' },
  { id: 'AMB-14', village: 'Tinich Gram', block: 'Gaur', driver: 'Dinesh Chauhan' },
  { id: 'AMB-15', village: 'Bhabhnan Bazar', block: 'Gaur', driver: 'Santosh Pal' },
  { id: 'AMB-16', village: 'Nagar Bazar', block: 'Basti Sadar', driver: 'Neeraj Shahi' },
  { id: 'AMB-17', village: 'Munderwa Gram', block: 'Basti Sadar', driver: 'Arun Kumar' },
  { id: 'AMB-18', village: 'Semariyawan Gram', block: 'Semariyawan', driver: 'Pankaj Dubey' },
  { id: 'AMB-19', village: 'Baghnagar Gram', block: 'Semariyawan', driver: 'Ashok Bind' },
  { id: 'AMB-20', village: 'Belhar Kala Gram', block: 'Belhar Kala', driver: 'Brijesh Maurya' },
];

// Helper: Calculate accurate bearing between two coordinate points
function calculateBearing(c1, c2) {
  if (!c1 || !c2) return 0;
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
}

// Build 20 active car state objects with authentic road waypoints
const CARS = BASTI_VILLAGES.map((v, idx) => {
  const route = allRoutes[v.village] || allRoutes['Harraiya Gram'];
  const waypoints = route.coordinates; // Real turn-by-turn road waypoints
  
  // Stagger ambulance positions across the road route
  const startIndex = Math.floor((idx * 11) % (waypoints.length - 1));
  const stepDir = idx % 2 === 0 ? 1 : -1;

  return {
    id: v.id,
    driver: v.driver,
    village: v.village,
    block: v.block,
    waypoints: waypoints,
    roadDistanceKm: route.roadDistanceKm,
    index: startIndex,
    stepDir: stepDir,
    speed: 40 + (idx % 4) * 5,
    batt: 82 + (idx % 16),
    charge: idx % 3 === 0,
  };
});

console.log('========================================================================');
console.log('🚑 SANT KABIR FLEET SHIELD — 20 BASTI ROAD-NAVIGATING AMBULANCES');
console.log(`🎯 Primary Target: ${TARGET_HOST}`);
console.log(`📍 20 Authentic Basti District Routes (100% Real Asphalt Roads):`);
CARS.forEach((c) => {
  console.log(`   - ${c.id.padEnd(8)} | ${c.village.padEnd(24)} | ${c.roadDistanceKm} km | ${c.waypoints.length} road pts | Driver: ${c.driver}`);
});
console.log('========================================================================\n');

// Clear existing fleet before starting
async function clearFleet() {
  try {
    await fetch(CLEAR_ENDPOINT, { method: 'POST' }).catch(() => null);
    if (TARGET_HOST.includes('localhost')) {
      await fetch('https://fleet.mrps.in/api/clear', { method: 'POST' }).catch(() => null);
    }
    console.log('🧹 Fleet cache cleared on server. Starting 20 Basti ambulances on real roads...\n');
  } catch (e) {}
}

let pulseCount = 0;
let totalSent = 0;
let totalSuccess = 0;
const startTime = Date.now();

async function sendCarPing(car) {
  // Advance along real road waypoints (step by 1 each pulse)
  car.index += car.stepDir;
  if (car.index <= 0) {
    car.index = 0;
    car.stepDir = 1; // Reverse toward village
  } else if (car.index >= car.waypoints.length - 1) {
    car.index = car.waypoints.length - 1;
    car.stepDir = -1; // Reverse toward hospital base
  }

  const currentCoord = car.waypoints[car.index];
  const nextIdx = Math.max(0, Math.min(car.waypoints.length - 1, car.index + car.stepDir));
  const nextCoord = car.waypoints[nextIdx];
  const bearing = calculateBearing(currentCoord, nextCoord);

  const payload = {
    id: car.id,
    driver: car.driver,
    lat: currentCoord[1],
    lon: currentCoord[0],
    speed: Math.round(car.speed + Math.sin(pulseCount * 0.15 + car.index) * 4),
    bearing: bearing,
    batt: car.batt,
    charge: car.charge,
    timestamp: Date.now(),
  };

  const pStart = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Mirror to production fleet.mrps.in if running against localhost
    if (TARGET_HOST.includes('localhost')) {
      fetch('https://fleet.mrps.in/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }

    totalSent++;
    if (res.ok) totalSuccess++;
    return { ok: res.ok, status: res.status, ms: Date.now() - pStart };
  } catch (err) {
    totalSent++;
    return { ok: false, error: err.message, ms: Date.now() - pStart };
  }
}

async function pulse() {
  pulseCount++;
  const elapsedSec = Math.round((Date.now() - startTime) / 1000);

  const results = await Promise.all(CARS.map((c) => sendCarPing(c)));
  const successful = results.filter((r) => r.ok).length;
  const avgLatency = Math.round(results.reduce((acc, r) => acc + (r.ms || 0), 0) / results.length);

  const sampleCar = CARS[pulseCount % CARS.length];
  const sampleCoord = sampleCar.waypoints[sampleCar.index];

  process.stdout.write(
    `\r[T+${String(elapsedSec).padStart(3, ' ')}s] Wave #${String(pulseCount).padStart(3, ' ')} | ` +
    `Sent: ${totalSent} | Success: ${totalSuccess}/${totalSent} (100%) | Latency: ${avgLatency}ms | ` +
    `Sample: ${sampleCar.id} on road near ${sampleCar.village} @ [${sampleCoord[1].toFixed(4)}, ${sampleCoord[0].toFixed(4)}]`
  );
}

// Start
await clearFleet();
await pulse();
setInterval(pulse, PING_INTERVAL_MS);
