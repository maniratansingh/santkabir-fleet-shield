// Live Ambulance GPS Tracker Simulator for Sant Kabir Fleet Shield
// Sends real HTTP POST / GET OsmAnd telemetry packets to the website backend

const SERVER = process.argv[2] || 'http://localhost:4173';
const ENDPOINT = `${SERVER}/api/location`;

const WAYPOINTS = [
  { lat: 26.782000, lon: 82.695000, speed: 55, bearing: 60, batt: 92 },
  { lat: 26.786500, lon: 82.701200, speed: 58, bearing: 62, batt: 91 },
  { lat: 26.790100, lon: 82.705000, speed: 52, bearing: 58, batt: 91 },
  { lat: 26.793200, lon: 82.710100, speed: 46, bearing: 55, batt: 90 },
  { lat: 26.795800, lon: 82.714500, speed: 38, bearing: 50, batt: 90 },
  { lat: 26.797313, lon: 82.718401, speed: 0,  bearing: 45, batt: 89 }, // Arrived at Base Hospital
];

console.log(`🚑 Starting GPS telemetry simulator targeting: ${ENDPOINT}`);
console.log(`📡 Simulating Ambulance SK-AMB-01 (Driver: Ramesh Kumar)...`);

let step = 0;
async function sendPing() {
  const pt = WAYPOINTS[step % WAYPOINTS.length];
  step++;

  // 1. Traccar OsmAnd HTTP POST format (URL query params)
  const url = `${ENDPOINT}?id=SK-AMB-01&driver=Ramesh%20Kumar&lat=${pt.lat}&lon=${pt.lon}&speed=${pt.speed}&bearing=${pt.bearing}&batt=${pt.batt}&timestamp=${Date.now()}`;

  try {
    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Ping #${step}: Lat=${pt.lat}, Lon=${pt.lon}, Speed=${pt.speed}km/h -> HTTP ${res.status}`, data.vehicle ? `(Status: ${data.vehicle.status}, Base Dist: ${data.vehicle.distFromBaseKm}km)` : '');
  } catch (err) {
    console.error(`❌ Ping failed:`, err.message);
  }
}

// Send initial ping immediately, then every 3 seconds
sendPing();
setInterval(sendPing, 3000);
