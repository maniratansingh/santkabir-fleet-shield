// Local-only sample generator for the history page.
//
// The points are sampled along the project's real precomputed road routes, so
// the trail follows the road instead of jumping across fields.
//
// Creates six trails:
//   SAMPLE EXCELLENT  — 30 s points, high accuracy, no gaps
//   SAMPLE VERY GOOD  — 30 s points, mostly high accuracy, one poor fix
//   SAMPLE GOOD       — 60 s points, some poor fixes, one gap
//   SAMPLE MEDIUM     — 2 min points, more poor fixes, one gap
//   SAMPLE POOR       — 5 min points, poor accuracy, two gaps
//   SAMPLE BAD        — 15 min points, very poor accuracy, two long gaps
//
// Usage:
//   HISTORY_TEST_PASSWORD='...' node scripts/seed_history_samples.mjs
//
// If HISTORY_TEST_PASSWORD is set, existing history is cleared first.
// This script only talks to the local Worker.

import fs from 'node:fs';

const BASE = process.env.HISTORY_BASE || 'http://localhost:8787';
const PASSWORD = process.env.HISTORY_TEST_PASSWORD;
const ROUTES = JSON.parse(
  fs.readFileSync(new URL('../src/data/allVillagesRoadRoutes.json', import.meta.url), 'utf8')
);

const SAMPLE_DEFS = [
  {
    id: 'SAMPLE EXCELLENT',
    routeName: 'Harraiya Gram',
    intervalSec: 30,
    durationMin: 120,
    accuracy: [5, 12],
  },
  {
    id: 'SAMPLE VERY GOOD',
    routeName: 'Khalilabad Sadar',
    intervalSec: 30,
    durationMin: 120,
    accuracy: [8, 25],
    poorFixAt: 120,
  },
  {
    id: 'SAMPLE GOOD',
    routeName: 'Tanda Nagar',
    intervalSec: 60,
    durationMin: 120,
    accuracy: [15, 45],
    gaps: [{ after: 50, minutes: 10 }],
    poorFixAt: 70,
  },
  {
    id: 'SAMPLE MEDIUM',
    routeName: 'Maghar Gram',
    intervalSec: 120,
    durationMin: 120,
    accuracy: [30, 80],
    gaps: [{ after: 25, minutes: 15 }],
    poorFixAt: 30,
  },
  {
    id: 'SAMPLE POOR',
    routeName: 'Bansi Nagar',
    intervalSec: 300,
    durationMin: 120,
    accuracy: [60, 150],
    gaps: [{ after: 10, minutes: 20 }, { after: 18, minutes: 15 }],
  },
  {
    id: 'SAMPLE BAD',
    routeName: 'Domariyaganj Bazar',
    intervalSec: 900,
    durationMin: 120,
    accuracy: [100, 300],
    gaps: [{ after: 3, minutes: 50 }, { after: 6, minutes: 50 }],
  },
];

const rand = (min, max) => min + Math.random() * (max - min);

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function routeMetrics(coordinates) {
  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    total += distanceKm(coordinates[i - 1], coordinates[i]);
    cumulative.push(total);
  }
  return { cumulative, total };
}

function pointAtDistance(coordinates, cumulative, target) {
  if (target <= 0) return coordinates[0];
  if (target >= cumulative[cumulative.length - 1]) return coordinates[coordinates.length - 1];
  let low = 0;
  let high = cumulative.length - 1;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (cumulative[mid] <= target) low = mid;
    else high = mid;
  }
  const span = cumulative[low + 1] - cumulative[low] || 1;
  const ratio = (target - cumulative[low]) / span;
  const a = coordinates[low];
  const b = coordinates[low + 1];
  return [
    Number((a[0] + (b[0] - a[0]) * ratio).toFixed(6)),
    Number((a[1] + (b[1] - a[1]) * ratio).toFixed(6)),
  ];
}

function buildPoints(def) {
  const route = ROUTES[def.routeName];
  if (!route?.coordinates?.length) throw new Error(`Missing route ${def.routeName}`);

  const { cumulative, total } = routeMetrics(route.coordinates);
  const count = Math.floor((def.durationMin * 60) / def.intervalSec) + 1;
  const now = Date.now();
  let time = now - def.durationMin * 60 * 1000;
  const times = [];

  for (let index = 0; index < count; index += 1) {
    times.push(time);
    time += def.intervalSec * 1000;
    const gap = def.gaps?.find((item) => item.after === index);
    if (gap) time += gap.minutes * 60 * 1000;
  }

  if (times[times.length - 1] > now) {
    const shift = times[times.length - 1] - now;
    for (let index = 0; index < times.length; index += 1) times[index] -= shift;
  }

  return times.map((timestamp, index) => {
    const fraction = count > 1 ? index / (count - 1) : 0;
    const [lon, lat] = pointAtDistance(route.coordinates, cumulative, total * fraction);
    let accuracy = rand(def.accuracy[0], def.accuracy[1]);
    if (def.poorFixAt === index) accuracy = Math.max(accuracy, 150);
    if (index % 29 === 0) accuracy = Math.min(300, Math.max(accuracy, 90));
    return {
      time: timestamp,
      lat,
      lon,
      accuracy: Math.round(accuracy),
    };
  });
}

if (PASSWORD) {
  const login = await fetch(`${BASE}/api/history/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  if (login.status === 200 && cookie) {
    const cleared = await fetch(`${BASE}/api/history/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ all: true }),
    });
    console.log('clear history:', cleared.status);
  } else {
    console.log('login failed; leaving existing history in place');
  }
}

const summary = [];

for (const def of SAMPLE_DEFS) {
  const points = buildPoints(def);
  let sent = 0;

  for (let start = 0; start < points.length; start += 40) {
    const batch = points.slice(start, start + 40);
    await Promise.all(
      batch.map((point) =>
        fetch(
          `${BASE}/api/track?id=${encodeURIComponent(def.id)}&lat=${point.lat}&lon=${point.lon}&speed=8&bearing=45&batt=80&accuracy=${point.accuracy}&timestamp=${Math.floor(point.time / 1000)}`,
          { method: 'POST' }
        ).then((response) => {
          if (response.ok) sent += 1;
        })
      )
    );
  }

  summary.push({ id: def.id, route: def.routeName, points: sent });
  console.log(`${def.id}: ${sent} points on ${def.routeName}`);
}

await new Promise((resolve) => setTimeout(resolve, 2500));
console.log('done', JSON.stringify(summary));
