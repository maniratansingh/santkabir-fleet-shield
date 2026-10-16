// 30-Car Live Telemetry Load Testing Engine for https://fleet.mrps.in
// Sends continuous high-cadence GPS telemetry for 30 cars for 5 minutes (300 seconds)
// Measures throughput, latency, HTTP response codes, and network load.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_HOST = process.argv[2] || 'https://fleet.mrps.in';
const ENDPOINT = `${TARGET_HOST}/api/location`;
const DURATION_SEC = 300; // 5 minutes
const INTERVAL_MS = 2000; // Each car pings every 2 seconds

const roadData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/roadRoutes.json'), 'utf8'));

const CORRIDORS = [
  'CAMP-HARRAIYA',
  'CAMP-BANSI',
  'CAMP-KHALILABAD',
  'CAMP-DOMARIYAGANJ',
  'KALWARI-SOUTH',
  'CITY-EAST',
  'RUDHAULI-NORTH',
];

// Configure exactly 30 cars
const CARS = Array.from({ length: 30 }).map((_, i) => {
  const corridorId = CORRIDORS[i % CORRIDORS.length];
  const wps = roadData[corridorId]?.coordinates || [];
  const idNum = String(i + 1).padStart(2, '0');
  return {
    id: `SK-AMB-${idNum}`,
    driver: `LoadTest-Driver-${idNum}`,
    wps,
    offset: (i * 0.033) % 1.0,
    baseSpeed: 45 + (i % 20),
    batt: 90 - (i % 15),
  };
});

console.log(`\n========================================================================`);
console.log(`🔥 30-CAR HIGH-LOAD TELEMETRY STREAMER (5-MINUTE RUN)`);
console.log(`🎯 Target Endpoint: ${ENDPOINT}`);
console.log(`⏱️ Duration: ${DURATION_SEC} seconds (5:00 minutes)`);
console.log(`🚗 Concurrent Vehicles: 30 ambulances`);
console.log(`⚡ Cadence: 30 telemetry packets every ${INTERVAL_MS}ms (15 req/sec sustained)`);
console.log(`========================================================================\n`);

const startTime = Date.now();
const endTime = startTime + DURATION_SEC * 1000;

let totalRequests = 0;
let totalSuccess = 0;
let totalFailures = 0;
const statusBreakdown = {};
let totalLatencyMs = 0;

function calculateBearing(c1, c2) {
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
}

async function sendCarPacket(car, now) {
  const wps = car.wps;
  const totalWps = wps.length;
  if (totalWps < 2) return;

  const elapsedSec = (now - startTime) / 1000;
  const cycleFloat = ((elapsedSec / 120) + car.offset) % 1.0;
  const ratio = cycleFloat < 0.5 ? (1 - cycleFloat * 2) : ((cycleFloat - 0.5) * 2);
  const floatIdx = ratio * (totalWps - 1);
  const idx = Math.min(totalWps - 2, Math.max(0, Math.floor(floatIdx)));
  const frac = floatIdx - idx;

  const p1 = wps[idx];
  const p2 = wps[idx + 1];
  const lon = Number((p1[0] + (p2[0] - p1[0]) * frac).toFixed(6));
  const lat = Number((p1[1] + (p2[1] - p1[1]) * frac).toFixed(6));
  const bearing = calculateBearing(p1, p2);
  const speed = Math.round(car.baseSpeed + Math.sin(elapsedSec * 0.1) * 5);
  const batt = Math.max(15, car.batt - Math.floor(elapsedSec / 120));

  const payload = {
    id: car.id,
    driver: car.driver,
    lat,
    lon,
    speed,
    bearing,
    batt,
    timestamp: now,
  };

  const query = new URLSearchParams({
    id: car.id,
    driver: car.driver,
    lat: lat.toString(),
    lon: lon.toString(),
    speed: speed.toString(),
    bearing: bearing.toString(),
    batt: batt.toString(),
    timestamp: now.toString(),
  });

  const reqStart = Date.now();
  try {
    const res = await fetch(`${ENDPOINT}?${query.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'SantKabirFleetShield-LoadTester/1.0',
      },
      body: JSON.stringify(payload),
    });

    const latMs = Date.now() - reqStart;
    totalLatencyMs += latMs;
    totalRequests++;
    statusBreakdown[res.status] = (statusBreakdown[res.status] || 0) + 1;
    if (res.ok) totalSuccess++;
    else totalFailures++;
  } catch (err) {
    totalRequests++;
    totalFailures++;
    statusBreakdown['ERR'] = (statusBreakdown['ERR'] || 0) + 1;
  }
}

async function runPulse() {
  const now = Date.now();
  if (now >= endTime) {
    clearInterval(timer);
    printFinalSummary();
    process.exit(0);
  }

  const elapsedSec = Math.round((now - startTime) / 1000);
  const remainingSec = Math.max(0, DURATION_SEC - elapsedSec);
  const mins = Math.floor(elapsedSec / 60);
  const secs = String(elapsedSec % 60).padStart(2, '0');
  const remMins = Math.floor(remainingSec / 60);
  const remSecs = String(remainingSec % 60).padStart(2, '0');

  // Broadcast all 30 cars concurrently
  await Promise.all(CARS.map(c => sendCarPacket(c, now)));

  const avgLat = totalRequests > 0 ? Math.round(totalLatencyMs / totalRequests) : 0;
  const rps = (totalRequests / Math.max(1, elapsedSec)).toFixed(1);
  const breakdownStr = Object.entries(statusBreakdown).map(([c, n]) => `[${c}]: ${n}`).join(' ');

  console.log(`⏱️ [${mins}:${secs} elapsed / ${remMins}:${remSecs} left] Total Sent: ${totalRequests} reqs | Rate: ${rps} req/s | Avg Latency: ${avgLat}ms | ${breakdownStr}`);
}

function printFinalSummary() {
  const durationTotal = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================================================`);
  console.log(`🏁 LOAD TEST COMPLETE (Ran for ${durationTotal}s)`);
  console.log(`📊 Total Requests Sent: ${totalRequests}`);
  console.log(`⚡ Sustained Throughput: ${(totalRequests / durationTotal).toFixed(1)} req/s`);
  console.log(`⏱️ Average Round-Trip Latency: ${Math.round(totalLatencyMs / totalRequests)}ms`);
  console.log(`📈 Response Codes:`);
  Object.entries(statusBreakdown).forEach(([k, v]) => {
    console.log(`   - HTTP ${k}: ${v} requests (${((v / totalRequests) * 100).toFixed(1)}%)`);
  });
  console.log(`========================================================================\n`);
}

// Start pulses
const timer = setInterval(runPulse, INTERVAL_MS);
runPulse();
