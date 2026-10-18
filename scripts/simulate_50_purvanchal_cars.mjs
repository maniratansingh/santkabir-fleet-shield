// 50-Ambulance High-Concurrency Real-Road Telemetry Simulator
// Deploys 50 distinct ambulances across 13 Purvanchal districts
// Strictly follows 100% asphalt OpenStreetMap turn-by-turn road routes
// Primary Target: http://localhost:3000 (also mirrors to https://fleet.mrps.in)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_HOST = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const ENDPOINT = `${TARGET_HOST}/api/location`;
const CLEAR_ENDPOINT = `${TARGET_HOST}/api/clear`;
const PING_INTERVAL_MS = 2500; // 2.5 seconds per wave

// Load authentic precomputed OpenStreetMap road routes
const routesPath = path.resolve(__dirname, '../src/data/allVillagesRoadRoutes.json');
const allRoutes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));

// 50 Authentic Towns/Blocks across all 13 Purvanchal Districts
const PURVANCHAL_50_LOCATIONS = [
  // Basti (8)
  { village: 'Harraiya Gram', district: 'Basti', driver: 'Ramesh Yadav' },
  { village: 'Rudhauli Bazar', district: 'Basti', driver: 'Suresh Maurya' },
  { village: 'Walterganj Gram', district: 'Basti', driver: 'Manoj Singh' },
  { village: 'Captainganj Gram', district: 'Basti', driver: 'Arvind Tiwari' },
  { village: 'Kalwari Bazar', district: 'Basti', driver: 'Vinod Pandey' },
  { village: 'Gaur Bazar', district: 'Basti', driver: 'Deepak Verma' },
  { village: 'Mahadewa Gram', district: 'Basti', driver: 'Sunil Yadav' },
  { village: 'Bankati Gram', district: 'Basti', driver: 'Pooja Sharma' },

  // Sant Kabir Nagar (7)
  { village: 'Maghar Gram', district: 'Sant Kabir Nagar', driver: 'Mohd. Tariq' },
  { village: 'Semariyawan Gram', district: 'Sant Kabir Nagar', driver: 'Pankaj Dubey' },
  { village: 'Belhar Kala Gram', district: 'Sant Kabir Nagar', driver: 'Brijesh Maurya' },
  { village: 'Baghnagar Gram', district: 'Sant Kabir Nagar', driver: 'Ashok Bind' },
  { village: 'Mehdawal Bazar', district: 'Sant Kabir Nagar', driver: 'Rakesh Chaudhary' },
  { village: 'Bakhira Gram', district: 'Sant Kabir Nagar', driver: 'Dharmendra Sahni' },
  { village: 'Dhanghata Bazar', district: 'Sant Kabir Nagar', driver: 'Santosh Kumar' },

  // Siddharthnagar (6)
  { village: 'Naugarh Sadar', district: 'Siddharthnagar', driver: 'Sanjay Gupta' },
  { village: 'Bansi Nagar', district: 'Siddharthnagar', driver: 'Rajesh Verma' },
  { village: 'Domariyaganj Bazar', district: 'Siddharthnagar', driver: 'Anita Patel' },
  { village: 'Itwa Gram', district: 'Siddharthnagar', driver: 'Vikram Singh' },
  { village: 'Shohratgarh Bazar', district: 'Siddharthnagar', driver: 'Mahesh Pandey' },
  { village: 'Barhni Bazar', district: 'Siddharthnagar', driver: 'Raju Chaurasia' },

  // Azamgarh (5)
  { village: 'Phoolpur Azamgarh', district: 'Azamgarh', driver: 'Arun Kumar' },
  { village: 'Sagri Jiyanpur', district: 'Azamgarh', driver: 'Virendra Yadav' },
  { village: 'Lalganj Azamgarh', district: 'Azamgarh', driver: 'Neeraj Shahi' },
  { village: 'Nizamabad Bazar', district: 'Azamgarh', driver: 'Pramod Prajapati' },
  { village: 'Atraulia Bazar', district: 'Azamgarh', driver: 'Shivkumar Nishad' },

  // Gonda (4)
  { village: 'Mankapur Bazar', district: 'Gonda', driver: 'Dinesh Chauhan' },
  { village: 'Colonelganj Bazar', district: 'Gonda', driver: 'Anand Mishra' },
  { village: 'Tarabganj Bazar', district: 'Gonda', driver: 'Gyanendra Shukla' },
  { village: 'Chhapia Gram', district: 'Gonda', driver: 'Hariom Tiwari' },

  // Balrampur (3)
  { village: 'Tulsipur Bazar', district: 'Balrampur', driver: 'Santosh Pal' },
  { village: 'Utraula Bazar', district: 'Balrampur', driver: 'Abdul Wahid' },
  { village: 'Pachperwa Bazar', district: 'Balrampur', driver: 'Rohit Sonkar' },

  // Shravasti (2)
  { village: 'Bhinga Sadar', district: 'Shravasti', driver: 'Ravindra Nath' },
  { village: 'Ikauna Bazar', district: 'Shravasti', driver: 'Ashwani Pathak' },

  // Bahraich (3)
  { village: 'Nanpara Bazar', district: 'Bahraich', driver: 'Suraj Pal' },
  { village: 'Kaiserganj Bazar', district: 'Bahraich', driver: 'Manish Awasthi' },
  { village: 'Payagpur Bazar', district: 'Bahraich', driver: 'Subhash Singh' },

  // Ambedkar Nagar (3)
  { village: 'Akbarpur Sadar', district: 'Ambedkar Nagar', driver: 'Avinash Srivastava' },
  { village: 'Tanda Nagar', district: 'Ambedkar Nagar', driver: 'Mohd. Salim' },
  { village: 'Jalalpur Bazar', district: 'Ambedkar Nagar', driver: 'Babban Rajbhar' },

  // Ayodhya (3)
  { village: 'Rudauli Bazar', district: 'Ayodhya', driver: 'Kamlesh Yadav' },
  { village: 'Bikapur Gram', district: 'Ayodhya', driver: 'Sanjay Rawat' },
  { village: 'Milkipur Gram', district: 'Ayodhya', driver: 'Akhilesh Pandey' },

  // Sultanpur (2)
  { village: 'Kadipur Bazar', district: 'Sultanpur', driver: 'Surendra Pratap' },
  { village: 'Jaisinghpur Gram', district: 'Sultanpur', driver: 'Vijay Bahadur' },

  // Amethi (2)
  { village: 'Gauriganj Sadar', district: 'Amethi', driver: 'Pradeep Tripathi' },
  { village: 'Tiloi Bazar', district: 'Amethi', driver: 'Rajeshwar Singh' },

  // Pratapgarh (2)
  { village: 'Kunda Bazar', district: 'Pratapgarh', driver: 'Brijendra Patel' },
  { village: 'Patti Bazar', district: 'Pratapgarh', driver: 'Alok Dubey' },
];

// Helper: Calculate bearing
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

// Build 50 active ambulance states
const CARS = PURVANCHAL_50_LOCATIONS.map((loc, idx) => {
  const vehId = `AMB-${String(idx + 1).padStart(2, '0')}`;
  const route = allRoutes[loc.village] || allRoutes['Harraiya Gram'];
  const waypoints = route.coordinates; // Real turn-by-turn road waypoints
  
  // Stagger ambulance position along its road route
  const startIndex = Math.floor((idx * 7) % (waypoints.length - 1));
  const stepDir = idx % 2 === 0 ? 1 : -1;

  return {
    id: vehId,
    driver: loc.driver,
    village: loc.village,
    district: loc.district,
    waypoints: waypoints,
    roadDistanceKm: route.roadDistanceKm,
    index: startIndex,
    stepDir: stepDir,
    speed: 42 + (idx % 5) * 4,
    batt: 78 + (idx % 22),
    charge: idx % 4 === 0,
  };
});

console.log('========================================================================');
console.log('🚑 SANT KABIR FLEET SHIELD — 50 AMBULANCES FULL PURVANCHAL LOAD TEST');
console.log(`🎯 Primary Target: ${TARGET_HOST}`);
console.log(`📍 50 Ambulances Deployed Across 13 Districts (100% Asphalt Road Routes)`);
console.log(`⏱️ Telemetry Wave: 50 Cars every ${PING_INTERVAL_MS / 1000} seconds`);
console.log('========================================================================\n');

// Clean existing fleet cache
async function clearFleet() {
  try {
    await fetch(CLEAR_ENDPOINT, { method: 'POST' }).catch(() => null);
    if (TARGET_HOST.includes('localhost')) {
      await fetch('https://fleet.mrps.in/api/clear', { method: 'POST' }).catch(() => null);
    }
    console.log('🧹 Fleet cache cleared on server. Starting 50 Purvanchal ambulances on real roads...\n');
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
    lat: currentCoord[1],
    lon: currentCoord[0],
    speed: Math.round(car.speed + Math.sin(pulseCount * 0.12 + car.index) * 4),
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

    // Mirror to production fleet.mrps.in if running locally
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
    `Sent: ${totalSent} | Success: ${totalSuccess}/${totalSent} (${Math.round((totalSuccess / Math.max(1, totalSent)) * 100)}%) | ` +
    `Latency: ${avgLatency}ms | ` +
    `Sample: ${sampleCar.id} (${sampleCar.district}) near ${sampleCar.village} @ [${sampleCoord[1].toFixed(4)}, ${sampleCoord[0].toFixed(4)}]`
  );
}

// Start
await clearFleet();
await pulse();
setInterval(pulse, PING_INTERVAL_MS);
