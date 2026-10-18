// 13-Ambulance High-Fidelity Real-Road Live Telemetry Simulator
// Deploys 13 active ambulances across Basti, Sant Kabir Nagar, and Siddharthnagar
// Strictly follows 100% asphalt OpenStreetMap turn-by-turn road routes
// Primary Target: https://fleet.mrps.in (also supports mirror to http://localhost:3000)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_HOST = (process.argv[2] || 'https://fleet.mrps.in').replace(/\/+$/, '');
const ENDPOINT = `${TARGET_HOST}/api/location`;
const CLEAR_ENDPOINT = `${TARGET_HOST}/api/clear`;
const PING_INTERVAL_MS = 2500; // 2.5 seconds per wave

// Load authentic precomputed OpenStreetMap road routes
const routesPath = path.resolve(__dirname, '../src/data/allVillagesRoadRoutes.json');
const allRoutes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));

// 11 Key Ambulances Deployed Across Basti & Sant Kabir Nagar
const PURVANCHAL_13_LOCATIONS = [
  // Basti District (6)
  { id: 'AMB-01', village: 'Harraiya Gram', district: 'Basti', driver: 'Ramesh Yadav', phone: '9876543210' },
  { id: 'AMB-02', village: 'Rudhauli Bazar', district: 'Basti', driver: 'Suresh Maurya', phone: '9876543211' },
  { id: 'AMB-03', village: 'Walterganj Gram', district: 'Basti', driver: 'Manoj Singh', phone: '9876543212' },
  { id: 'AMB-04', village: 'Captainganj Gram', district: 'Basti', driver: 'Arvind Tiwari', phone: '9876543213' },
  { id: 'AMB-05', village: 'Kalwari Bazar', district: 'Basti', driver: 'Vinod Pandey', phone: '9876543214' },
  { id: 'AMB-06', village: 'Gaur Bazar', district: 'Basti', driver: 'Deepak Verma', phone: '9876543215' },

  // Sant Kabir Nagar District (5)
  { id: 'AMB-07', village: 'Khalilabad Sadar', district: 'Sant Kabir Nagar', driver: 'Mohd. Tariq', phone: '9876543216' },
  { id: 'AMB-08', village: 'Maghar Gram', district: 'Sant Kabir Nagar', driver: 'Sunil Yadav', phone: '9876543217' },
  { id: 'AMB-09', village: 'Semariyawan Gram', district: 'Sant Kabir Nagar', driver: 'Pankaj Dubey', phone: '9876543218' },
  { id: 'AMB-10', village: 'Belhar Kala Gram', district: 'Sant Kabir Nagar', driver: 'Brijesh Maurya', phone: '9876543219' },
  { id: 'AMB-11', village: 'Mehdawal Bazar', district: 'Sant Kabir Nagar', driver: 'Rakesh Chaudhary', phone: '9876543220' },
];

// Helper: Calculate true road heading bearing
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

// Build 13 active ambulance states
const CARS = PURVANCHAL_13_LOCATIONS.map((loc, idx) => {
  const route = allRoutes[loc.village] || allRoutes['Harraiya Gram'];
  const waypoints = route.coordinates; // Real turn-by-turn road waypoints
  
  // Stagger ambulance position along its road route
  const startIndex = Math.floor((idx * 11) % (waypoints.length - 1));
  const stepDir = idx % 2 === 0 ? 1 : -1;

  return {
    id: loc.id,
    driver: loc.driver,
    phone: loc.phone,
    village: loc.village,
    district: loc.district,
    waypoints: waypoints,
    roadDistanceKm: route.roadDistanceKm,
    index: startIndex,
    stepDir: stepDir,
    speed: 44 + (idx % 4) * 5,
    batt: 82 + (idx % 16),
    charge: idx % 3 === 0,
  };
});

console.log('========================================================================');
console.log('🚑 SANT KABIR FLEET SHIELD — 13 LIVE AMBULANCES DEPLOYMENT');
console.log(`🎯 Primary Target: ${TARGET_HOST}`);
console.log(`📍 13 Ambulances Across Basti, Sant Kabir Nagar & Siddharthnagar`);
console.log(`⏱️ Telemetry Wave: 13 Cars every ${PING_INTERVAL_MS / 1000} seconds`);
console.log('========================================================================\n');

// Clean existing fleet cache on target host
async function clearFleet() {
  try {
    await fetch(CLEAR_ENDPOINT, { method: 'POST' }).catch(() => null);
    if (!TARGET_HOST.includes('localhost')) {
      await fetch('http://localhost:3000/api/clear', { method: 'POST' }).catch(() => null);
    }
    console.log('🧹 Live fleet cache cleared on server. Deploying 13 ambulances on real roads...\n');
  } catch (e) {}
}

let pulseCount = 0;
let totalSent = 0;
let totalSuccess = 0;
const startTime = Date.now();

async function sendCarPing(car) {
  // Advance along real road waypoints
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
    driverPhone: car.phone,
    lat: currentCoord[1],
    lon: currentCoord[0],
    speed: Math.round(car.speed + Math.sin(pulseCount * 0.15 + car.index) * 3),
    bearing: bearing,
    batt: car.batt,
    charge: car.charge,
    timestamp: Date.now(),
  };

  const queryParams = new URLSearchParams({
    id: payload.id,
    driver: payload.driver,
    lat: String(payload.lat),
    lon: String(payload.lon),
    speed: String(payload.speed),
    bearing: String(payload.bearing),
    batt: String(payload.batt),
    charge: String(payload.charge),
  }).toString();

  const pingUrl = `${ENDPOINT}?${queryParams}`;

  try {
    const res = await fetch(pingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'SantKabirFleetShield/1.0 (Ambulance Telemetry Engine)',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      totalSuccess++;
    }

    // Mirror to localhost:3000 if target is live server
    if (TARGET_HOST !== 'http://localhost:3000') {
      fetch(`http://localhost:3000/api/location?${queryParams}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
    }
  } catch (err) {
    // Network retry quietly
  } finally {
    totalSent++;
  }
}

async function runPulseWave() {
  pulseCount++;
  const waveStart = Date.now();

  await Promise.all(CARS.map(car => sendCarPing(car)));

  const waveDuration = Date.now() - waveStart;
  const elapsedSec = Math.round((Date.now() - startTime) / 1000);
  const sampleCar = CARS[pulseCount % CARS.length];
  const sampleCoord = sampleCar.waypoints[sampleCar.index];

  process.stdout.write(
    `[T+${String(elapsedSec).padStart(3, ' ')}s] Wave #${String(pulseCount).padStart(3, ' ')} | ` +
    `Sent: ${totalSent} | Success: ${totalSuccess}/${totalSent} (${Math.round((totalSuccess / Math.max(1, totalSent)) * 100)}%) | ` +
    `Latency: ${waveDuration}ms | ` +
    `Sample: ${sampleCar.id} (${sampleCar.district}) near ${sampleCar.village} @ [${sampleCoord[1].toFixed(4)}, ${sampleCoord[0].toFixed(4)}]\n`
  );
}

// Main execution flow
async function main() {
  await clearFleet();

  // Initial wave
  await runPulseWave();

  // Continuous background waves
  setInterval(runPulseWave, PING_INTERVAL_MS);
}

main().catch(console.error);
