import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_HOST = process.argv[2] || 'https://fleet.mrps.in';
const DURATION_SECONDS = parseInt(process.argv[3] || '300', 10); // 5 minutes default
const REPORT_INTERVAL_MS = 30000; // Log status every 30s

console.log('========================================================================');
console.log('🚀 COMPREHENSIVE 5-MINUTE LOAD TESTING SUITE');
console.log(`🎯 Target Host:     ${TARGET_HOST}`);
console.log(`⏱️  Duration:        ${DURATION_SECONDS} seconds (5.0 minutes)`);
console.log(`📊 Report Cadence:  Every ${REPORT_INTERVAL_MS / 1000} seconds`);
console.log('========================================================================\n');

// Telemetry ambulances (8 distinct units along NH-27, NH-19, SH-26)
const AMBULANCES = [
  { id: 'AMB-01', driver: 'Ramesh Yadav', lat: 26.7746, lon: 82.6589, heading: 85, speed: 52 },
  { id: 'AMB-02', driver: 'Suresh Kumar', lat: 26.7993, lon: 82.4225, heading: 98, speed: 64 },
  { id: 'AMB-03', driver: 'Amit Verma', lat: 26.9183, lon: 81.2178, heading: 104, speed: 76 },
  { id: 'AMB-04', driver: 'Manoj Singh', lat: 26.7908, lon: 82.9505, heading: 280, speed: 58 },
  { id: 'AMB-05', driver: 'Vikas Tiwari', lat: 26.7845, lon: 82.7210, heading: 190, speed: 45 },
  { id: 'AMB-06', driver: 'Deepak Maurya', lat: 26.8312, lon: 82.7450, heading: 45, speed: 60 },
  { id: 'AMB-07', driver: 'Rajesh Mishra', lat: 26.6850, lon: 82.7050, heading: 350, speed: 55 },
  { id: 'AMB-08', driver: 'Sunil Gupta', lat: 26.7950, lon: 82.5500, heading: 110, speed: 68 },
];

const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/assets/index-C8c5TzG0.css',
  '/assets/vendor-Cl8tYlKU.js',
  '/assets/index-D3UU3YnS.js',
];

// Stats collector
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

async function recordRequest(endpointCategory, requestFn) {
  const start = performance.now();
  stats.totalRequests++;
  stats.endpoints[endpointCategory].sent++;

  try {
    const res = await requestFn();
    const duration = Math.round(performance.now() - start);

    stats.statusCodes[res.status] = (stats.statusCodes[res.status] || 0) + 1;
    stats.allLatencies.push(duration);
    stats.endpoints[endpointCategory].latencies.push(duration);

    if (res.status >= 200 && res.status < 400) {
      stats.successfulRequests++;
      stats.endpoints[endpointCategory].ok++;
    } else {
      stats.failedRequests++;
      stats.endpoints[endpointCategory].fail++;
      if (stats.errors.length < 20) {
        stats.errors.push(`[HTTP ${res.status}] ${endpointCategory} (${duration}ms)`);
      }
    }
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    stats.failedRequests++;
    stats.endpoints[endpointCategory].fail++;
    stats.statusCodes['ERR'] = (stats.statusCodes['ERR'] || 0) + 1;
    if (stats.errors.length < 20) {
      stats.errors.push(`[Network Error] ${endpointCategory}: ${err.message}`);
    }
  }
}

// 1. Worker: Send Live Telemetry Ping (/api/track)
async function sendTelemetryPing(amb) {
  const jitterLat = (Math.random() - 0.5) * 0.005;
  const jitterLon = (Math.random() - 0.5) * 0.005;
  const curLat = (amb.lat + jitterLat).toFixed(6);
  const curLon = (amb.lon + jitterLon).toFixed(6);
  const speedKnots = (amb.speed / 1.852).toFixed(1);
  const nowEpoch = Math.floor(Date.now() / 1000);

  const query = new URLSearchParams({
    id: amb.id,
    driver: amb.driver,
    lat: curLat,
    lon: curLon,
    speed: speedKnots,
    bearing: String(amb.heading),
    timestamp: String(nowEpoch),
    batt: '92',
    charge: '1',
  });

  return recordRequest('telemetry_track', () =>
    fetch(`${TARGET_HOST}/api/track?${query.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
  );
}

// 2. Worker: Poll Fleet Vehicles (/api/vehicles)
async function pollVehicles() {
  return recordRequest('vehicles_poll', () =>
    fetch(`${TARGET_HOST}/api/vehicles`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
  );
}

// 3. Worker: Request Static Asset
async function fetchStaticAsset() {
  const assetPath = STATIC_ASSETS[Math.floor(Math.random() * STATIC_ASSETS.length)];
  return recordRequest('static_assets', () =>
    fetch(`${TARGET_HOST}${assetPath}`, {
      method: 'GET',
    })
  );
}

// 4. Worker: Query Route Engine (/api/route)
async function queryRoute() {
  const fromLon = 82.7184;
  const fromLat = 26.7973;
  const toLon = (82.2000 + (Math.random() - 0.5) * 0.1).toFixed(4);
  const toLat = (26.7990 + (Math.random() - 0.5) * 0.1).toFixed(4);

  return recordRequest('route_calc', () =>
    fetch(`${TARGET_HOST}/api/route?fromLon=${fromLon}&fromLat=${fromLat}&toLon=${toLon}&toLat=${toLat}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    })
  );
}

// Main Load Generator Loop
const startTime = Date.now();
const endTime = startTime + DURATION_SECONDS * 1000;
let lastIntervalTotal = 0;
let lastIntervalTime = startTime;

console.log('⚡ Commencing 5-minute concurrent stress generation...');
console.log('   - 8 telemetry streams transmitting every 1s');
console.log('   - 5 wallboard polling workers querying every 1s');
console.log('   - Static CDN edge cache readers active');
console.log('   - Periodic route queries active\n');

// Launch continuous intervals
const telemetryInterval = setInterval(() => {
  for (const amb of AMBULANCES) {
    sendTelemetryPing(amb);
  }
}, 1000);

const wallboardInterval = setInterval(() => {
  for (let i = 0; i < 5; i++) {
    pollVehicles();
  }
}, 1000);

const staticAssetInterval = setInterval(() => {
  for (let i = 0; i < 3; i++) {
    fetchStaticAsset();
  }
}, 1200);

const routeInterval = setInterval(() => {
  queryRoute();
}, 4000);

// High-speed burst worker every 2.5s
const burstInterval = setInterval(() => {
  for (let i = 0; i < 4; i++) {
    const amb = AMBULANCES[Math.floor(Math.random() * AMBULANCES.length)];
    sendTelemetryPing(amb);
  }
}, 2500);

// Status logging every 30s
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
  console.log(`   📈 Total: ${stats.totalRequests} reqs | Success: ${stats.successfulRequests} (${successRate}%) | Failed: ${stats.failedRequests}`);
  console.log(`   ⚡ Current Throughput: ${currentRps} req/s | Cumulative RPS: ${cumulativeRps} req/s`);
  console.log(`   📊 Latencies -> Min: ${lat.min}ms | P50: ${lat.p50}ms | P90: ${lat.p90}ms | P95: ${lat.p95}ms | P99: ${lat.p99}ms | Max: ${lat.max}ms`);
  console.log(`   🏷️  Status Codes: ${JSON.stringify(stats.statusCodes)}\n`);
}, REPORT_INTERVAL_MS);

// Completion timer
setTimeout(async () => {
  clearInterval(telemetryInterval);
  clearInterval(wallboardInterval);
  clearInterval(staticAssetInterval);
  clearInterval(routeInterval);
  clearInterval(burstInterval);
  clearInterval(statusInterval);

  // Wait 2 seconds for inflight requests to settle
  await new Promise(r => setTimeout(r, 2000));

  const totalElapsed = (Date.now() - startTime) / 1000;
  const overallLat = calculatePercentiles(stats.allLatencies);
  const successRate = ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2);
  const rps = (stats.totalRequests / totalElapsed).toFixed(2);

  const finalSummary = {
    target: TARGET_HOST,
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

  const resultsPath = path.join(__dirname, '../load_test_results_5min.json');
  fs.writeFileSync(resultsPath, JSON.stringify(finalSummary, null, 2), 'utf8');

  console.log('\n========================================================================');
  console.log('🏁 5-MINUTE LOAD TEST COMPLETED SUCCESSFULLY');
  console.log('========================================================================');
  console.log(`🎯 Target:             ${TARGET_HOST}`);
  console.log(`⏱️  Duration:           ${totalElapsed.toFixed(1)} seconds`);
  console.log(`📦 Total Requests:     ${stats.totalRequests}`);
  console.log(`✅ Success Count:      ${stats.successfulRequests} (${successRate}%)`);
  console.log(`❌ Failed Count:       ${stats.failedRequests}`);
  console.log(`⚡ Average Throughput: ${rps} requests/sec`);
  console.log(`⏱️  Latency P50:        ${overallLat.p50} ms`);
  console.log(`⏱️  Latency P95:        ${overallLat.p95} ms`);
  console.log(`⏱️  Latency P99:        ${overallLat.p99} ms`);
  console.log(`⏱️  Latency Max:        ${overallLat.max} ms`);
  console.log(`📊 Results Saved To:   ${resultsPath}`);
  console.log('========================================================================\n');

  process.exit(0);
}, DURATION_SECONDS * 1000);
