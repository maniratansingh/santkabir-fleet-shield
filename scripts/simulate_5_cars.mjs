// 5-Ambulance Continuous Real-time GPS Telemetry Streamer for Sant Kabir Fleet Shield
// Simulates 5 live ambulances strictly following authentic road network geometries
// Protocol: OsmAnd HTTP POST telemetry packets every 2.5 seconds into /api/location

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER = process.argv[2] || 'http://localhost:4173';
const ENDPOINT = `${SERVER}/api/location`;
const PING_INTERVAL_MS = 2500; // 2.5 seconds

const roadData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/roadRoutes.json'), 'utf8'));

const VEHICLES = [
  {
    id: 'SK-AMB-01',
    driver: 'Ramesh Kumar',
    baseSpeed: 58,
    batt: 94,
    corridorId: 'CAMP-HARRAIYA',
    // NH-27 West Corridor (Faizabad/Harraiya to Basti)
    waypoints: roadData['CAMP-HARRAIYA'].coordinates,
    // Start at ~75% down the highway
    offset: 0.72,
  },
  {
    id: 'SK-AMB-02',
    driver: 'Sunil Yadav',
    baseSpeed: 52,
    batt: 88,
    corridorId: 'KALWARI-SOUTH',
    // SH-61 South Corridor (Kalwari Road to Basti)
    waypoints: roadData['KALWARI-SOUTH'].coordinates,
    // Start at ~65% down the highway
    offset: 0.65,
  },
  {
    id: 'SK-AMB-03',
    driver: 'Vikram Singh',
    baseSpeed: 64,
    batt: 91,
    corridorId: 'CAMP-KHALILABAD',
    // NH-27 East Corridor (Khalilabad / Sant Kabir Nagar to Basti)
    waypoints: roadData['CAMP-KHALILABAD'].coordinates,
    // Start at ~80% down the highway
    offset: 0.80,
  },
  {
    id: 'SK-AMB-04',
    driver: 'Anita Patel',
    baseSpeed: 46,
    batt: 85,
    corridorId: 'CAMP-BANSI',
    // SH-88 North Corridor (Bansi to Basti)
    waypoints: roadData['CAMP-BANSI'].coordinates,
    // Start at ~70% down the highway
    offset: 0.70,
  },
  {
    id: 'SK-AMB-05',
    driver: 'Rajesh Verma',
    baseSpeed: 42,
    batt: 96,
    corridorId: 'CITY-EAST',
    // Gandhi Nagar / Company Bagh City Corridor
    waypoints: roadData['CITY-EAST'].coordinates,
    // Start at ~85% down the corridor
    offset: 0.85,
  },
];

console.log(`\n================================================================`);
console.log(`🚑 SANT KABIR FLEET SHIELD — CONTINUOUS ROAD TELEMETRY SIMULATION`);
console.log(`🛣️ Streaming 5 ambulances along 5 authentic highway corridors`);
console.log(`🎯 Destination Server: ${ENDPOINT}`);
console.log(`⚡ Ping Interval: ${PING_INTERVAL_MS}ms`);
console.log(`================================================================\n`);

const startTime = Date.now();
let pingCount = 0;

// Helper: calculate bearing in degrees between two coordinates
function calculateBearing(c1, c2) {
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

async function sendTelemetryPulse() {
  const now = Date.now();
  const elapsedSec = (now - startTime) / 1000;
  pingCount++;

  console.log(`\n[T+${Math.round(elapsedSec)}s] 🛰️ Broadcast Wave #${pingCount}:`);

  const promises = VEHICLES.map(async (v) => {
    const wps = v.waypoints;
    const totalWps = wps.length;

    // Ambulances progress smoothly toward Base Hospital (index 0)
    // One full round trip patrol takes ~150 seconds
    const cycleDuration = 150;
    const cycleFloat = ((elapsedSec / cycleDuration) + v.offset) % 1.0;
    // Ping-pong between outer sector and base hospital
    const ratio = cycleFloat < 0.5 ? (1 - cycleFloat * 2) : ((cycleFloat - 0.5) * 2);

    const floatIdx = ratio * (totalWps - 1);
    const idx = Math.min(totalWps - 2, Math.max(0, Math.floor(floatIdx)));
    const frac = floatIdx - idx;

    const p1 = wps[idx];
    const p2 = wps[idx + 1];

    const currentLon = Number((p1[0] + (p2[0] - p1[0]) * frac).toFixed(6));
    const currentLat = Number((p1[1] + (p2[1] - p1[1]) * frac).toFixed(6));

    // Direction along the road segment
    const bearing = calculateBearing(p1, p2);
    const currentSpeed = Math.max(25, Math.round(v.baseSpeed + (Math.sin(elapsedSec * 0.2) * 5)));
    const currentBatt = Math.max(15, v.batt - Math.floor(elapsedSec / 120));

    const query = new URLSearchParams({
      id: v.id,
      driver: v.driver,
      lat: currentLat.toString(),
      lon: currentLon.toString(),
      speed: currentSpeed.toString(),
      bearing: bearing.toString(),
      batt: currentBatt.toString(),
      timestamp: now.toString(),
    });

    const payload = {
      id: v.id,
      driver: v.driver,
      lat: currentLat,
      lon: currentLon,
      speed: currentSpeed,
      bearing: bearing,
      batt: currentBatt,
      timestamp: now,
    };

    try {
      const res = await fetch(`${ENDPOINT}?${query.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'SantKabirFleetShield/1.0',
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let dist = 'N/A';
      try {
        const json = JSON.parse(text);
        if (json.vehicle) dist = `${json.vehicle.distFromBaseKm}km`;
      } catch (e) {}

      console.log(`  └─ [HTTP ${res.status}] ${v.id} (${v.driver.padEnd(12)}) | Pos: ${currentLat}, ${currentLon} | Speed: ${currentSpeed} km/h | Dist: ${dist} | Response: ${text.slice(0, 60)}`);
    } catch (err) {
      console.error(`  └─ ❌ ${v.id} Error: ${err.message}`);
    }
  });

  await Promise.all(promises);
}

// Start live pulses
sendTelemetryPulse();
setInterval(sendTelemetryPulse, PING_INTERVAL_MS);
