// 35-Ambulance Continuous Real-time GPS Telemetry Streamer for Sant Kabir Fleet Shield
// Simulates 35 live ambulances distributed across all 7 authentic highway corridors into Sant Kabir Hospital
// Protocol: HTTP POST telemetry packets every 2.5 seconds into /api/location

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER = process.argv[2] || 'https://fleet.mrps.in';
const ENDPOINT = `${SERVER}/api/location`;
const PING_INTERVAL_MS = 2500; // 2.5 seconds

const roadData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/roadRoutes.json'), 'utf8'));

const CORRIDORS = [
  { id: 'CAMP-HARRAIYA', name: 'NH-27 West (Harraiya)' },
  { id: 'CAMP-BANSI', name: 'SH-88 North (Bansi)' },
  { id: 'CAMP-KHALILABAD', name: 'NH-27 East (Khalilabad)' },
  { id: 'CAMP-DOMARIYAGANJ', name: 'SH-88A NW (Domariyaganj)' },
  { id: 'KALWARI-SOUTH', name: 'SH-61 South (Kalwari)' },
  { id: 'CITY-EAST', name: 'City East Corridor' },
  { id: 'RUDHAULI-NORTH', name: 'Rudhauli Road North' },
];

const DRIVER_NAMES = [
  'Ramesh Yadav', 'Manoj Kumar', 'Suresh Maurya', 'Sunil Yadav', 'Rajesh Verma',
  'Vikram Singh', 'Anita Patel', 'Deepak Verma', 'Amit Mishra', 'Pooja Sharma',
  'Sanjay Gupta', 'Rakesh Tiwari', 'Kavita Singh', 'Vinod Pandey', 'Dinesh Chauhan',
  'Santosh Pal', 'Neeraj Shahi', 'Arun Kumar', 'Pankaj Dubey', 'Ashok Bind',
  'Virendra Yadav', 'Alok Srivastava', 'Pramod Giri', 'Harish Chandra', 'Ajay Tripathi',
  'Brijesh Mourya', 'Gyanendra Rai', 'Rohit Tiwari', 'Kamlesh Gautam', 'Sachin Shukla',
  'Manish Jaiswal', 'Suraj Maurya', 'Satish Chaubey', 'Dhirendra Singh', 'Anand Upadhyay'
];

// Generate 35 ambulances (5 per corridor across 7 corridors)
const VEHICLES = [];

for (let i = 0; i < 35; i++) {
  const corridorObj = CORRIDORS[i % CORRIDORS.length];
  const corridorWaypoints = roadData[corridorObj.id]?.coordinates || [];
  const carIndexInCorridor = Math.floor(i / CORRIDORS.length);
  // Stagger positions: 15%, 35%, 55%, 75%, 90%
  const offset = Number(((carIndexInCorridor * 0.18 + 0.12) % 0.95).toFixed(2));
  const idNum = String(i + 1).padStart(2, '0');

  VEHICLES.push({
    id: `SK-AMB-${idNum}`,
    driver: DRIVER_NAMES[i] || `Driver ${i + 1}`,
    corridorId: corridorObj.id,
    corridorName: corridorObj.name,
    waypoints: corridorWaypoints,
    offset: offset,
    baseSpeed: 38 + (i % 6) * 4,
    batt: 80 + (i % 19),
  });
}

console.log(`\n================================================================`);
console.log(`🚑 SANT KABIR FLEET SHIELD — 35 AMBULANCES LIVE TELEMETRY STREAM`);
console.log(`🛣️ Corridors: 7 major regional corridors (5 ambulances per corridor)`);
console.log(`🎯 Destination Server: ${ENDPOINT}`);
console.log(`⚡ Ping Interval: ${PING_INTERVAL_MS}ms`);
console.log(`================================================================\n`);

const startTime = Date.now();
let pingCount = 0;

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

  console.log(`\n[T+${Math.round(elapsedSec)}s] 🛰️ Broadcast Wave #${pingCount} (35 Ambulances):`);

  let successCount = 0;
  let statusCodes = {};

  const promises = VEHICLES.map(async (v) => {
    const wps = v.waypoints;
    const totalWps = wps.length;
    if (totalWps < 2) return;

    // Ambulances smoothly cruise along highway
    const cycleDuration = 180; // 3-minute round-trip patrol
    const cycleFloat = ((elapsedSec / cycleDuration) + v.offset) % 1.0;
    const ratio = cycleFloat < 0.5 ? (1 - cycleFloat * 2) : ((cycleFloat - 0.5) * 2);

    const floatIdx = ratio * (totalWps - 1);
    const idx = Math.min(totalWps - 2, Math.max(0, Math.floor(floatIdx)));
    const frac = floatIdx - idx;

    const p1 = wps[idx];
    const p2 = wps[idx + 1];

    const currentLon = Number((p1[0] + (p2[0] - p1[0]) * frac).toFixed(6));
    const currentLat = Number((p1[1] + (p2[1] - p1[1]) * frac).toFixed(6));
    const bearing = calculateBearing(p1, p2);
    const currentSpeed = Math.max(25, Math.round(v.baseSpeed + (Math.sin(elapsedSec * 0.15 + v.offset * 10) * 6)));
    const currentBatt = Math.max(20, v.batt - Math.floor(elapsedSec / 180));

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

      statusCodes[res.status] = (statusCodes[res.status] || 0) + 1;
      if (res.ok) successCount++;
    } catch (err) {
      statusCodes['ERR'] = (statusCodes['ERR'] || 0) + 1;
    }
  });

  await Promise.all(promises);

  const statusSummary = Object.entries(statusCodes).map(([k, v]) => `HTTP ${k}: ${v}`).join(' | ');
  console.log(`  └─ Sent 35 ambulances -> [ ${statusSummary} ]`);
  
  // Print detailed sample of 3 vehicles
  const samples = [VEHICLES[0], VEHICLES[14], VEHICLES[28]];
  samples.forEach(s => {
    console.log(`     • ${s.id} (${s.driver.padEnd(14)}) | Corridor: ${s.corridorName}`);
  });
}

// Start pulses immediately
sendTelemetryPulse();
setInterval(sendTelemetryPulse, PING_INTERVAL_MS);
