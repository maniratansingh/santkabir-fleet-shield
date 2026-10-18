import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_HOST = process.argv[2] || 'https://fleet.mrps.in';
const DURATION_SECONDS = parseInt(process.argv[3] || '300', 10); // 5 minutes
const REPORT_INTERVAL_MS = 15000; // Log status every 15s

console.log('========================================================================');
console.log('🔥 MASSIVE HIGH-THROUGHPUT FLEET LOAD TEST (5 MINUTES)');
console.log(`🎯 Target Host:       ${TARGET_HOST}`);
console.log(`⏱️  Duration:          ${DURATION_SECONDS} seconds (5.0 minutes)`);
console.log(`🚑 Fleet Size:        60 Active Ambulances`);
console.log(`🖥️  Wallboard Viewers: 25 Concurrent Monitors`);
console.log(`⚡ Target Throughput:  150 - 250+ Requests/Sec`);
console.log('========================================================================\n');

// High-capacity HTTPS agent with connection pooling
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 256,
  maxFreeSockets: 64,
  timeout: 10000,
});

// Generate 60 Distinct Ambulances across Uttar Pradesh corridors
const DRIVERS = [
  'Ramesh Yadav', 'Suresh Kumar', 'Amit Verma', 'Manoj Singh', 'Vikas Tiwari',
  'Deepak Maurya', 'Rajesh Mishra', 'Sunil Gupta', 'Pawan Pandey', 'Anil Sharma',
  'Dharmendra Chauhan', 'Santosh Pal', 'Ajay Srivastava', 'Pramod Dubey', 'Rakesh Bind',
  'Arun Patel', 'Vijay Yadav', 'Sachin Shukla', 'Neeraj Singh', 'Dinesh Rawat',
  'Kamlesh Verma', 'Satish Chaurasia', 'Mukesh Jaiswal', 'Sanjay Giri', 'Harish Chandra',
  'Gopal Tiwari', 'Vinod Rajbhar', 'Pankaj Nishad', 'Brijesh Maurya', 'Santosh Yadav',
  'Ravindra Sahni', 'Sunil Gautam', 'Mahesh Tripathi', 'Ashok Kashyap', 'Pradeep Saroj',
  'Ram Asrey', 'Shailendra Kushwaha', 'Ranjit Paswan', 'Akhilesh Yadav', 'Suraj Bhan',
  'Kundan Kumar', 'Chandan Singh', 'Subhash Chandra', 'Rohit Prajapati', 'Deepak Soni',
  'Alok Pandey', 'Gaurav Dubey', 'Sumit Shukla', 'Hemant Tripathi', 'Abhishek Singh',
  'Naveen Yadav', 'Manish Maurya', 'Vishal Verma', 'Ankit Mishra', 'Praveen Sharma',
  'Rahul Chauhan', 'Jitendra Rawat', 'Mohan Lal', 'Bhupendra Yadav', 'Shiv Kumar',
];

const CORRIDORS = [
  { name: 'NH-27 Lucknow-Ayodhya-Basti-Gorakhpur', baseLat: 26.7973, baseLon: 82.7184, radius: 1.2 },
  { name: 'NH-19 Varanasi-Prayagraj-Kanpur', baseLat: 25.3176, baseLon: 82.9739, radius: 1.5 },
  { name: 'NH-28 Khalilabad-Bansi-Dumariyaganj', baseLat: 26.8500, baseLon: 82.7500, radius: 0.8 },
  { name: 'SH-26 Tanda-Akbarpur-Sultanpur', baseLat: 26.5500, baseLon: 82.6500, radius: 0.7 },
  { name: 'Purvanchal Expressway Sector', baseLat: 26.4000, baseLon: 82.2000, radius: 1.0 },
];

const AMBULANCES = Array.from({ length: 60 }, (_, i) => {
  const corridor = CORRIDORS[i % CORRIDORS.length];
  const angle = (i / 60) * 2 * Math.PI;
  const dist = (Math.random() * 0.4 + 0.1) * corridor.radius;
  return {
    id: `AMB-${String(i + 1).padStart(3, '0')}`,
    driver: DRIVERS[i % DRIVERS.length],
    lat: corridor.baseLat + Math.sin(angle) * dist,
    lon: corridor.baseLon + Math.cos(angle) * dist,
    heading: Math.floor(Math.random() * 360),
    speed: Math.floor(Math.random() * 45) + 35, // 35 - 80 km/h
    batt: Math.floor(Math.random() * 30) + 70, // 70 - 100%
  };
});

const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/avatar.png',
  '/assets/index-C8c5TzG0.css',
  '/assets/vendor-Cl8tYlKU.js',
  '/assets/index-D3UU3YnS.js',
  '/assets/maplibre-DBE96hFo.css',
];

// Metrics collector
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  statusCodes: {},
  endpoints: {
    telemetry_track: { sent: 0, ok: 0, fail: 0, latencies: [] },
    vehicles_poll: { sent: 0, ok: 0, fail: 0, latencies: [] },
    static_assets: { sent: 0, ok: 0, fail: 0, latencies: [] },
    route_calc: { sent: 0, ok: 0, fail: 0, latencies: [] },
  },
  allLatencies: [],
  errors: [],
};

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = Math.round((sum / sorted.length) * 10) / 10;
  const p = (pct) => sorted[Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length))];

  return {
    min: sorted[0],
    p50: p(50),
    p90: p(90),
    p95: p(95),
    p99: p(99),
    max: sorted[sorted.length - 1],
    avg,
  };
}

async function recordRequest(category, requestFn) {
  const start = performance.now();
  stats.totalRequests++;
  stats.endpoints[category].sent++;

  try {
    const res = await requestFn();
    const duration = Math.round(performance.now() - start);

    stats.statusCodes[res.status] = (stats.statusCodes[res.status] || 0) + 1;
    stats.allLatencies.push(duration);
    stats.endpoints[category].latencies.push(duration);

    if (res.status >= 200 && res.status < 400) {
      stats.successfulRequests++;
      stats.endpoints[category].ok++;
    } else {
      stats.failedRequests++;
      stats.endpoints[category].fail++;
      if (stats.errors.length < 25) {
        stats.errors.push(`[HTTP ${res.status}] ${category} (${duration}ms)`);
      }
    }
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    stats.failedRequests++;
    stats.endpoints[category].fail++;
    stats.statusCodes['ERR'] = (stats.statusCodes['ERR'] || 0) + 1;
    if (stats.errors.length < 25) {
      stats.errors.push(`[Network Error] ${category}: ${err.message}`);
    }
  }
}

// Telemetry Ping (/api/track)
function sendTelemetryPing(amb) {
  amb.lat += (Math.random() - 0.5) * 0.002;
  amb.lon += (Math.random() - 0.5) * 0.002;
  amb.heading = (amb.heading + Math.floor((Math.random() - 0.5) * 10) + 360) % 360;
  const speedKnots = (amb.speed / 1.852).toFixed(1);
  const nowEpoch = Math.floor(Date.now() / 1000);

  const query = new URLSearchParams({
    id: amb.id,
    driver: amb.driver,
    lat: amb.lat.toFixed(6),
    lon: amb.lon.toFixed(6),
    speed: speedKnots,
    bearing: String(amb.heading),
    timestamp: String(nowEpoch),
    batt: String(amb.batt),
    charge: '1',
  });

  return recordRequest('telemetry_track', () =>
    fetch(`${TARGET_HOST}/api/track?${query.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      agent,
    })
  );
}

// Wallboard Poll (/api/vehicles)
function pollVehicles() {
  return recordRequest('vehicles_poll', () =>
    fetch(`${TARGET_HOST}/api/vehicles`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      agent,
    })
  );
}

// Edge CDN Static Asset Fetch
function fetchStaticAsset() {
  const asset = STATIC_ASSETS[Math.floor(Math.random() * STATIC_ASSETS.length)];
  return recordRequest('static_assets', () =>
    fetch(`${TARGET_HOST}${asset}`, {
      method: 'GET',
      agent,
    })
  );
}

// Turn-by-Turn Route Engine
function queryRoute() {
  const fromLon = 82.7184;
  const fromLat = 26.7973;
  const toLon = (82.2000 + (Math.random() - 0.5) * 0.3).toFixed(4);
  const toLat = (26.7990 + (Math.random() - 0.5) * 0.3).toFixed(4);

  return recordRequest('route_calc', () =>
    fetch(`${TARGET_HOST}/api/route?fromLon=${fromLon}&fromLat=${fromLat}&toLon=${toLon}&toLat=${toLat}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      agent,
    })
  );
}

// Start timers and load workers
const startTime = Date.now();
let lastIntervalTotal = 0;
let lastIntervalTime = startTime;

console.log('⚡ Launching continuous multi-threaded stress workers...');

// Worker 1: 60 Ambulances sending telemetry every 500ms in 2 staggered groups
const group1 = AMBULANCES.slice(0, 30);
const group2 = AMBULANCES.slice(30);

const ambGroup1Interval = setInterval(() => {
  for (const amb of group1) sendTelemetryPing(amb);
}, 500);

const ambGroup2Interval = setInterval(() => {
  for (const amb of group2) sendTelemetryPing(amb);
}, 500);

// Worker 2: 25 Concurrent Wallboard Polling clients querying every 1s
const wallboardInterval = setInterval(() => {
  for (let i = 0; i < 25; i++) {
    pollVehicles();
  }
}, 1000);

// Worker 3: 15 CDN static cache readers querying every 800ms
const staticAssetInterval = setInterval(() => {
  for (let i = 0; i < 15; i++) {
    fetchStaticAsset();
  }
}, 800);

// Worker 4: Routing queries every 2s
const routeInterval = setInterval(() => {
  queryRoute();
}, 2000);

// Worker 5: Periodic burst of 30 parallel pings every 2.5s
const burstInterval = setInterval(() => {
  for (let i = 0; i < 30; i++) {
    const amb = AMBULANCES[Math.floor(Math.random() * AMBULANCES.length)];
    sendTelemetryPing(amb);
  }
}, 2500);

// Live console reporting every 15s
const statusInterval = setInterval(() => {
  const now = Date.now();
  const elapsedSec = Math.round((now - startTime) / 1000);
  const remainingSec = Math.max(0, DURATION_SECONDS - elapsedSec);
  const progressPct = Math.min(100, Math.round((elapsedSec / DURATION_SECONDS) * 100));

  const intervalReqs = stats.totalRequests - lastIntervalTotal;
  const intervalSeconds = (now - lastIntervalTime) / 1000;
  const currentRps = (intervalReqs / intervalSeconds).toFixed(1);
  const cumulativeRps = (stats.totalRequests / elapsedSec).toFixed(1);

  lastIntervalTotal = stats.totalRequests;
  lastIntervalTime = now;

  const lat = calculatePercentiles(stats.allLatencies);
  const successRate = stats.totalRequests > 0 
    ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)
    : '100.00';

  const barFilled = Math.floor(progressPct / 5);
  const bar = `[${'='.repeat(barFilled)}${'>'}${'.'.repeat(Math.max(0, 20 - barFilled))}]`;

  console.log(`⏱️  ${bar} ${progressPct}% | Elapsed: ${elapsedSec}s / ${DURATION_SECONDS}s (Remaining: ${remainingSec}s)`);
  console.log(`   📦 Requests: ${stats.totalRequests.toLocaleString()} | Success: ${stats.successfulRequests.toLocaleString()} (${successRate}%) | Failed: ${stats.failedRequests}`);
  console.log(`   ⚡ Current Throughput: ${currentRps} req/s | Cumulative RPS: ${cumulativeRps} req/s`);
  console.log(`   ⏱️  Latencies -> Min: ${lat.min}ms | P50: ${lat.p50}ms | P90: ${lat.p90}ms | P95: ${lat.p95}ms | P99: ${lat.p99}ms | Max: ${lat.max}ms`);
  console.log(`   🏷️  Status Codes: ${JSON.stringify(stats.statusCodes)}\n`);
}, REPORT_INTERVAL_MS);

// Completion handler
setTimeout(async () => {
  clearInterval(ambGroup1Interval);
  clearInterval(ambGroup2Interval);
  clearInterval(wallboardInterval);
  clearInterval(staticAssetInterval);
  clearInterval(routeInterval);
  clearInterval(burstInterval);
  clearInterval(statusInterval);

  await new Promise(r => setTimeout(r, 2000)); // drain inflight

  const totalElapsed = (Date.now() - startTime) / 1000;
  const overallLat = calculatePercentiles(stats.allLatencies);
  const successRate = ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2);
  const rps = (stats.totalRequests / totalElapsed).toFixed(2);

  const finalSummary = {
    target: TARGET_HOST,
    fleetSize: 60,
    wallboardClients: 25,
    durationSeconds: Math.round(totalElapsed),
    totalRequests: stats.totalRequests,
    successfulRequests: stats.successfulRequests,
    failedRequests: stats.failedRequests,
    successRatePct: parseFloat(successRate),
    avgRps: parseFloat(rps),
    statusCodes: stats.statusCodes,
    latencyMs: overallLat,
    breakdown: {
      telemetry_track: {
        total: stats.endpoints.telemetry_track.sent,
        success: stats.endpoints.telemetry_track.ok,
        failed: stats.endpoints.telemetry_track.fail,
        latency: calculatePercentiles(stats.endpoints.telemetry_track.latencies),
      },
      vehicles_poll: {
        total: stats.endpoints.vehicles_poll.sent,
        success: stats.endpoints.vehicles_poll.ok,
        failed: stats.endpoints.vehicles_poll.fail,
        latency: calculatePercentiles(stats.endpoints.vehicles_poll.latencies),
      },
      static_assets: {
        total: stats.endpoints.static_assets.sent,
        success: stats.endpoints.static_assets.ok,
        failed: stats.endpoints.static_assets.fail,
        latency: calculatePercentiles(stats.endpoints.static_assets.latencies),
      },
      route_calc: {
        total: stats.endpoints.route_calc.sent,
        success: stats.endpoints.route_calc.ok,
        failed: stats.endpoints.route_calc.fail,
        latency: calculatePercentiles(stats.endpoints.route_calc.latencies),
      },
    },
    sampleErrors: stats.errors,
    completedAt: new Date().toISOString(),
  };

  const resultsPath = path.join(__dirname, '../heavy_load_test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(finalSummary, null, 2), 'utf8');

  console.log('\n========================================================================');
  console.log('🏁 5-MINUTE HEAVY LOAD TEST COMPLETE');
  console.log('========================================================================');
  console.log(`🎯 Target:              ${TARGET_HOST}`);
  console.log(`⏱️  Duration:            ${totalElapsed.toFixed(1)} seconds`);
  console.log(`📦 Total Requests:      ${stats.totalRequests.toLocaleString()}`);
  console.log(`✅ Success Count:       ${stats.successfulRequests.toLocaleString()} (${successRate}%)`);
  console.log(`❌ Failed Count:        ${stats.failedRequests}`);
  console.log(`⚡ Average Throughput:  ${rps} requests/sec`);
  console.log(`⏱️  Latency P50:         ${overallLat.p50} ms`);
  console.log(`⏱️  Latency P95:         ${overallLat.p95} ms`);
  console.log(`⏱️  Latency P99:         ${overallLat.p99} ms`);
  console.log(`⏱️  Latency Max:         ${overallLat.max} ms`);
  console.log(`📊 Results Saved To:    ${resultsPath}`);
  console.log('========================================================================\n');

  process.exit(0);
}, DURATION_SECONDS * 1000);
