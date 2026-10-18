import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_HOST = process.argv[2] || 'http://localhost:3000';
const ENDPOINT = `${TARGET_HOST.replace(/\/+$/, '')}/api/track`;

const roadData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/data/roadRoutes.json'), 'utf8')
);

// Bearing calculation helper
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

// 4 Strategic Ambulances across Uttar Pradesh
const CARS = [
  {
    id: 'AMB-01',
    driver: 'Ramesh Yadav',
    corridor: 'CAMP-HARRAIYA',
    coords: roadData['CAMP-HARRAIYA']?.coordinates || [],
    index: 80, // mid-route towards Basti
    stepDir: -1, // returning to base
    speedKmH: 52,
    batt: 94,
    charge: true,
  },
  {
    id: 'AMB-02',
    driver: 'Suresh Kumar',
    corridor: 'HIGHWAY-NH27-LUCKNOW',
    coords: roadData['HIGHWAY-NH27-LUCKNOW']?.coordinates || [],
    index: 240, // Ayodhya sector (~50km out)
    stepDir: -1, // returning
    speedKmH: 64,
    batt: 88,
    charge: false,
  },
  {
    id: 'AMB-LUCKNOW',
    driver: 'Amit Verma',
    corridor: 'HIGHWAY-NH27-LUCKNOW',
    coords: roadData['HIGHWAY-NH27-LUCKNOW']?.coordinates || [],
    index: 410, // Barabanki / Lucknow border (~165km out)
    stepDir: -1, // heading east along NH-27
    speedKmH: 74,
    batt: 82,
    charge: true,
  },
  {
    id: 'AMB-GORAKHPUR',
    driver: 'Manoj Singh',
    corridor: 'HIGHWAY-NH27-GORAKHPUR',
    coords: roadData['HIGHWAY-NH27-GORAKHPUR']?.coordinates || [],
    index: 150, // Sahjanwa / Khalilabad sector (~35km out)
    stepDir: -1, // returning to base
    speedKmH: 58,
    batt: 91,
    charge: true,
  },
];

console.log('====================================================');
console.log(`🚑 4-CAR LIVE DUMMY TELEMETRY STREAMER`);
console.log(`🎯 Target Endpoint: ${ENDPOINT}`);
console.log(`📡 Simulating 4 Ambulances across Uttar Pradesh:`);
CARS.forEach(c => console.log(`   - ${c.id.padEnd(14)} Driver: ${c.driver.padEnd(14)} Corridor: ${c.corridor}`));
console.log('====================================================\n');

async function sendCarPing(car) {
  if (!car.coords || car.coords.length < 2) return;

  // Move index along road
  car.index += car.stepDir;
  if (car.index <= 0) {
    car.index = 0;
    car.stepDir = 1; // reverse direction
  } else if (car.index >= car.coords.length - 1) {
    car.index = car.coords.length - 1;
    car.stepDir = -1;
  }

  const currentCoord = car.coords[car.index];
  const nextIdx = Math.max(0, Math.min(car.coords.length - 1, car.index + car.stepDir));
  const nextCoord = car.coords[nextIdx];
  const bearing = calculateBearing(currentCoord, nextCoord);

  // Speed with slight natural variance
  const jitter = (Math.random() - 0.5) * 4;
  const currentSpeedKmH = Math.max(20, Math.round(car.speedKmH + jitter));
  // Convert km/h to knots (1 knot = 1.852 km/h)
  const speedKnots = Number((currentSpeedKmH / 1.852).toFixed(1));

  const nowEpoch = Math.floor(Date.now() / 1000);

  // Strict OsmAnd Protocol URL Query parameters
  const params = new URLSearchParams({
    id: car.id,
    driver: car.driver,
    timestamp: String(nowEpoch),
    lat: String(currentCoord[1]),
    lon: String(currentCoord[0]),
    speed: String(speedKnots),
    bearing: String(bearing),
    altitude: '120.0',
    accuracy: '6.5',
    batt: String(car.batt),
    charge: String(car.charge),
  });

  const url = `${ENDPOINT}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (res.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] ✅ ${car.id.padEnd(14)} (${car.driver}) -> Lat: ${currentCoord[1].toFixed(4)}, Lon: ${currentCoord[0].toFixed(4)} | Speed: ${currentSpeedKmH} km/h (${speedKnots} kts) | Bearing: ${bearing}° | HTTP 200`);
    } else {
      console.error(`[${new Date().toLocaleTimeString()}] ❌ ${car.id} failed with HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ ${car.id} network error:`, err.message);
  }
}

async function cycleAllCars() {
  for (const car of CARS) {
    await sendCarPing(car);
  }
}

// Initial transmission for all 4 cars immediately
console.log('Sending initial telemetry batch for 4 cars...');
await cycleAllCars();

// Stream continuous movement every 2.5 seconds
const isContinuous = process.argv.includes('--stream') || process.argv.includes('-c');
if (isContinuous) {
  console.log('\nStreaming continuous live vehicle movements every 2.5s (Press Ctrl+C to stop)...');
  setInterval(cycleAllCars, 2500);
} else {
  console.log('\n✅ Initial 4-car batch sent! To stream continuous road movement, run with --stream.');
}
