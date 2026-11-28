// Cloudflare Pages Advanced Mode Worker: _worker.js
// Handles /api/location and /api/vehicles serverless endpoints + serves static assets
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Production Clean: 0 Mock Data. Dynamic live telemetry only.

import { createKinematicFilter } from './utils/kalman.js';
import { coerceTelemetryPacket, normalizeEpochMs, processTelemetryPacket } from './utils/telemetryProcessor.js';
import { canonicalVehicleId } from './utils/vehicleId.js';
import { calculateDistanceKm } from './utils/geo.js';
import { computeVehicleAgeState } from './utils/vehicleState.js';

// In-memory telemetry cache for active fleet ambulances
const liveVehicles = new Map();

// Per-vehicle GPS noise filters. Kept separate from the public record so the
// raw covariance state is never serialized to the dashboard.
const vehicleFilters = new Map();

// Durable Object hub forwarding. HTTP trackers are throttled so the free
// Workers Free / Durable Objects request quota is not exhausted. Trackers that
// move to the WebSocket path get immediate updates without this throttle.
const HUB_NAME = 'fleet-history';
const HUB_FORWARD_INTERVAL_MS = 30000;
const HUB_PERSIST_INTERVAL_MS = 5000;
const lastHubForward = new Map();

// Constant-time comparison of two secrets (fixed-length SHA-256 digests)
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const av = new Uint8Array(ha);
  const bv = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

// ── History service ────────────────────────────────────────────────────────
// The history store is a separate SQLite-backed Durable Object. The live
// telemetry path writes to it asynchronously, so a history failure can never
// delay or block the live dashboard.
const HISTORY_NAME = 'fleet-history';
const HISTORY_COOKIE = 'history_session';
const HISTORY_SESSION_SECONDS = 8 * 60 * 60;
const HISTORY_BUCKET_MS = 30 * 1000; // 30-second samples
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const HISTORY_PRUNE_INTERVAL_MS = 60 * 60 * 1000; // hourly alarm
const HISTORY_SLOTS = Math.ceil(HISTORY_RETENTION_MS / HISTORY_BUCKET_MS); // 20,160
const HISTORY_PASSWORD_SALT = 'mQ7B7fLda1aEC-GS4-oOIQ';
const HISTORY_PASSWORD_HASH = 'NhEnOhRT75TkiWp-ntanopnnRUL2NXzJFJZZsGL8PwA';
const HISTORY_PASSWORD_ITERATIONS = 100000;
const historyLoginAttempts = new Map();

// ── Board access ───────────────────────────────────────────────────────────
// The live board is closed by default. A shared board password gives a 30-day
// session; a named, single-use device link gives a 1-year session on one
// browser (the TV). History keeps its own password and is the admin gate.
const BOARD_COOKIE = 'board_session';
const BOARD_PASSWORD_SESSION_SECONDS = 30 * 24 * 60 * 60;
const BOARD_DEVICE_SESSION_SECONDS = 365 * 24 * 60 * 60;
const BOARD_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const boardLoginAttempts = new Map();

function historyJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return '';
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyHistoryPassword(password) {
  const salt = fromBase64Url(HISTORY_PASSWORD_SALT);
  const expected = fromBase64Url(HISTORY_PASSWORD_HASH);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: HISTORY_PASSWORD_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    256
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function verifyBoardPassword(env, password) {
  // A dedicated BOARD_PASSWORD wins. Without one, the board accepts the
  // history password so the gate can be enabled without a new secret.
  if (env.BOARD_PASSWORD) return safeEqual(password, env.BOARD_PASSWORD);
  return verifyHistoryPassword(password);
}

async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(data)))
  );
}

async function createHistorySession(secret, ttlSeconds = HISTORY_SESSION_SECONDS) {
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ exp: Date.now() + ttlSeconds * 1000 }))
  );
  const signature = toBase64Url(await hmacSha256(secret, payload));
  return `${payload}.${signature}`;
}

async function verifyHistorySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = await hmacSha256(secret, payload);
  const supplied = fromBase64Url(signature);
  if (supplied.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= supplied[i] ^ expected[i];
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (!data?.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// ── Board session helpers ──────────────────────────────────────────────────
function boardSecret(env) {
  return env.BOARD_SESSION_SECRET || env.HISTORY_SESSION_SECRET || '';
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createBoardSession(env, { kind, id = '', name = '', ttlSeconds }) {
  const secret = boardSecret(env);
  if (!secret) return '';
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        k: kind,
        id,
        name,
        iat: Date.now(),
        exp: Date.now() + ttlSeconds * 1000,
      })
    )
  );
  const signature = toBase64Url(await hmacSha256(secret, `board.${payload}`));
  return `${payload}.${signature}`;
}

async function verifyBoardToken(token, env) {
  const secret = boardSecret(env);
  if (!secret || !token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = await hmacSha256(secret, `board.${payload}`);
  const supplied = fromBase64Url(signature);
  if (supplied.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= supplied[i] ^ expected[i];
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (data?.v !== 1 || !data?.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

async function boardDeviceActive(env, id) {
  if (!id) return false;
  const stub = historyStub(env);
  if (!stub) return false;
  try {
    const response = await stub.fetch(`https://history/board/status?id=${encodeURIComponent(id)}`);
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.valid);
  } catch (e) {
    return false;
  }
}

async function requireBoardSession(request, env) {
  const token = getCookie(request, BOARD_COOKIE);
  const session = await verifyBoardToken(token, env);
  if (!session) return null;
  if (session.k === 'device' && !(await boardDeviceActive(env, session.id))) return null;
  return session;
}

function boardCookie(token, url, maxAgeSeconds = BOARD_DEVICE_SESSION_SECONDS) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${BOARD_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function boardNotice(title, message, status = 200) {
  const safeTitle = String(title).replace(/[<>&]/g, '');
  const safeMessage = String(message).replace(/[<>&]/g, '');
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" />
<title>${safeTitle}</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:#060d17;color:#f1f5f9;
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif}
  .card{max-width:360px;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:rgba(11,23,40,.92);padding:22px}
  h1{margin:0 0 8px;font-size:17px} p{margin:0;color:#94a3b8;font-size:12px;line-height:1.6}
  a{display:inline-block;margin-top:14px;color:#38bdf8;font-size:12px;text-decoration:none}
</style></head><body><div class="card"><h1>${safeTitle}</h1><p>${safeMessage}</p>
<a href="/login">Board login</a></div></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function boardLoginPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>Fleet Shield · Board access</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif;
    background: radial-gradient(120% 90% at 50% 0%, #10233a 0%, #0a1526 55%, #060d17 100%); color: #f1f5f9; }
  .card { width: 100%; max-width: 360px; border: 1px solid rgba(255,255,255,.12); border-radius: 24px;
    background: rgba(11,23,40,.92); box-shadow: 0 24px 60px -24px rgba(0,0,0,.8); padding: 24px; }
  .logo { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center;
    background: rgba(56,189,248,.15); color: #38bdf8; margin-bottom: 14px; }
  .logo svg { width: 24px; height: 24px; }
  h1 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
  p { margin: 6px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.5; }
  label { display: block; margin: 18px 0 6px; font-size: 11px; font-weight: 600; color: #cbd5e1; }
  input { width: 100%; height: 44px; border-radius: 12px; border: 1px solid rgba(255,255,255,.14);
    background: rgba(255,255,255,.06); color: #f8fafc; padding: 0 12px; font-size: 14px; outline: none; }
  input:focus { border-color: rgba(56,189,248,.7); box-shadow: 0 0 0 3px rgba(56,189,248,.15); }
  button { width: 100%; height: 44px; margin-top: 14px; border: 0; border-radius: 12px;
    background: #38bdf8; color: #04121c; font-size: 13px; font-weight: 700; cursor: pointer; }
  button:disabled { opacity: .55; cursor: default; }
  .err { margin-top: 12px; font-size: 11px; color: #fda4af; min-height: 14px; }
  .foot { margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.1);
    font-size: 10px; color: #64748b; display: flex; align-items: center; gap: 6px; }
  .foot svg { width: 13px; height: 13px; }
</style>
</head>
<body>
  <form class="card" id="form">
    <div class="logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>
      </svg>
    </div>
    <h1>Fleet Shield</h1>
    <p>Board access. Enter the board password, or open the device link created for this screen.</p>
    <label for="password">Board password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required placeholder="Enter password" />
    <button id="submit" type="submit">Open board</button>
    <div class="err" id="err" role="alert"></div>
    <div class="foot">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      Sant Kabir Eye Hospital · private board
    </div>
  </form>
<script>
  const form = document.getElementById('form');
  const err = document.getElementById('err');
  const button = document.getElementById('submit');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    err.textContent = '';
    button.disabled = true;
    try {
      const response = await fetch('/api/board/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('password').value })
      });
      const nextParam = new URLSearchParams(location.search).get('next');
      const nextUrl = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
      if (response.ok) { window.location.replace(nextUrl); return; }
      const data = await response.json().catch(() => ({}));
      err.textContent = data.error || 'Could not open the board';
    } catch (e) {
      err.textContent = 'Network error. Try again.';
    } finally {
      button.disabled = false;
    }
  });
</script>
</body>
</html>`;
}


function historyDayKey(ms) {
  return new Date(Number(ms) + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function analyzeHistory(points) {
  const pts = (points || [])
    .map((p) => ({
      t: Number(p.device_time),
      lat: Number(p.lat),
      lon: Number(p.lon),
      speed: Number(p.speed) || 0,
      accuracy: Number(p.accuracy) || 0,
    }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .sort((a, b) => a.t - b.t);

  const intervals = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i - 1].t) / 1000;
    if (dt > 0) intervals.push(dt);
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 30;
  const gapMs = Math.max(10 * 60000, median * 2.5 * 1000);

  /* stops: within 150 m for at least 5 min, merged within 250 m / 20 min */
  const rawStops = [];
  let cluster = [];
  const flush = () => {
    if (cluster.length > 1) {
      const first = cluster[0];
      const last = cluster[cluster.length - 1];
      const minutes = (last.t - first.t) / 60000;
      const lat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
      const lon = cluster.reduce((s, p) => s + p.lon, 0) / cluster.length;
      const spread = Math.max(...cluster.map((p) => calculateDistanceKm(lat, lon, p.lat, p.lon) * 1000));
      if (minutes >= 5 && spread <= 250) {
        rawStops.push({ start: first.t, end: last.t, lat, lon, minutes, points: cluster.length });
      }
    }
    cluster = [];
  };
  for (const p of pts) {
    if (!cluster.length) { cluster = [p]; continue; }
    const lat = cluster.reduce((s, q) => s + q.lat, 0) / cluster.length;
    const lon = cluster.reduce((s, q) => s + q.lon, 0) / cluster.length;
    if (calculateDistanceKm(lat, lon, p.lat, p.lon) * 1000 <= 150) cluster.push(p);
    else { flush(); cluster = [p]; }
  }
  flush();

  const mergedStops = [];
  for (const s of rawStops) {
    const near = mergedStops.find((m) => calculateDistanceKm(m.lat, m.lon, s.lat, s.lon) * 1000 < 250 && s.start - m.end < 20 * 60000);
    if (near) {
      const total = near.points + s.points;
      near.lat = (near.lat * near.points + s.lat * s.points) / total;
      near.lon = (near.lon * near.points + s.lon * s.points) / total;
      near.points = total;
      near.end = s.end;
      near.minutes = (near.end - near.start) / 60000;
    } else {
      mergedStops.push({ ...s });
    }
  }

  const stopWindows = mergedStops.map((s) => [s.start, s.end]);
  const moving = pts.filter((p) => !stopWindows.some(([a, b]) => p.t >= a && p.t <= b));

  /* trips: moving runs split by stop, gap, or IST day change */
  const rawTrips = [];
  let run = [];
  let prev = null;
  for (const p of moving) {
    if (prev && (p.t - prev.t > gapMs || historyDayKey(p.t) !== historyDayKey(prev.t))) {
      if (run.length > 1) rawTrips.push(run);
      run = [];
    }
    run.push(p);
    prev = p;
  }
  if (run.length > 1) rawTrips.push(run);

  const trips = rawTrips.map((arr, index) => {
    let distance = 0;
    let movingMs = 0;
    let maxSpeed = 0;
    for (let i = 1; i < arr.length; i++) {
      const dt = arr[i].t - arr[i - 1].t;
      if (dt <= 0 || dt > gapMs) continue;
      const d = calculateDistanceKm(arr[i - 1].lat, arr[i - 1].lon, arr[i].lat, arr[i].lon);
      distance += d;
      if (arr[i].speed > 3) movingMs += dt;
      if (arr[i].speed > maxSpeed) maxSpeed = arr[i].speed;
    }
    return {
      index,
      day: historyDayKey(arr[0].t),
      startTime: arr[0].t,
      endTime: arr[arr.length - 1].t,
      startLat: arr[0].lat,
      startLon: arr[0].lon,
      endLat: arr[arr.length - 1].lat,
      endLon: arr[arr.length - 1].lon,
      distanceKm: Math.round(distance * 10) / 10,
      durationMin: Math.round((arr[arr.length - 1].t - arr[0].t) / 60000),
      movingMin: Math.round(movingMs / 60000),
      averageSpeed: movingMs > 0 ? Math.round(distance / (movingMs / 3600000)) : 0,
      maxSpeed: Math.round(maxSpeed),
      points: arr.length,
    };
  }).filter((t) => t.distanceKm >= 0.2 || t.movingMin >= 2);

  return { points: pts.length, stops: mergedStops, trips };
}


function summarizeHistoryDays(analysis) {
  const days = new Map();
  for (const trip of analysis.trips) {
    const d = days.get(trip.day) || { day: trip.day, distanceKm: 0, movingMin: 0, trips: 0, stops: 0, maxSpeed: 0, points: 0 };
    d.distanceKm += trip.distanceKm;
    d.movingMin += trip.movingMin;
    d.trips += 1;
    d.points += trip.points || 0;
    d.maxSpeed = Math.max(d.maxSpeed, trip.maxSpeed);
    days.set(trip.day, d);
  }
  for (const stop of analysis.stops) {
    const key = historyDayKey(stop.start);
    const d = days.get(key) || { day: key, distanceKm: 0, movingMin: 0, trips: 0, stops: 0, maxSpeed: 0, points: 0 };
    d.stops += 1;
    days.set(key, d);
  }
  return Array.from(days.values())
    .map((d) => ({ ...d, distanceKm: Math.round(d.distanceKm * 10) / 10, averageSpeed: d.movingMin > 0 ? Math.round(d.distanceKm / (d.movingMin / 60)) : 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function historyStub(env) {
  if (!env.FLEET_HUB) return null;
  return env.FLEET_HUB.get(env.FLEET_HUB.idFromName(HUB_NAME));
}

function auditHistory(env, action, vehicleId = '', detail = '', actor = 'admin') {
  const stub = historyStub(env);
  if (!stub) return null;
  return stub
    .fetch('https://history/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, vehicleId, detail, actor }),
    })
    .catch(() => null);
}

async function requireHistoryAuth(request, env) {
  if (!env.HISTORY_SESSION_SECRET) {
    return historyJson({ error: 'History authentication is not configured' }, 503);
  }
  const token = getCookie(request, HISTORY_COOKIE);
  const session = await verifyHistorySession(token, env.HISTORY_SESSION_SECRET);
  if (!session) return historyJson({ error: 'Unauthorized' }, 401);
  return null;
}

function writeHistory(env, record) {
  const stub = historyStub(env);
  if (!stub || !record) return null;
  return stub
    .fetch('https://history/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    })
    .catch((error) => {
      console.error('history write failed', error?.message || error);
      return null;
    });
}

const BASE_LAT = 26.797313;
const BASE_LON = 82.718401;

// Haversine formula to calculate accurate distance in km
// Golden Ratio HSL Unique Color Engine for 100+ ambulances


// Live simulation is handled client-side in src/App.jsx


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Explicit 404 for any legacy APK or download paths
    if (url.pathname.endsWith('.apk') || url.pathname.startsWith('/downloads/')) {
      return new Response('Not Found', { status: 404 });
    }

    // WebSocket hub: dashboard clients and, later, tracker clients connect here.
    // The Durable Object holds the single global fleet state and hibernates idle
    // sockets at zero duration cost.
    if (url.pathname === '/api/ws' || url.pathname === '/api/ws/') {
      const boardSession = await requireBoardSession(request, env);
      if (!boardSession) {
        return new Response(JSON.stringify({ error: 'Board access required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      if (!env.FLEET_HUB) {
        return new Response(JSON.stringify({ error: 'WebSocket hub not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      const hub = env.FLEET_HUB.get(env.FLEET_HUB.idFromName(HUB_NAME));
      return hub.fetch(request);
    }

    // 1. Endpoint: Universal Telemetry Receiver (Supports Traccar Client, OsmAnd, GPSLogger, Sant Kabir Fleet Shield Android App)
    // Works with:
    // - Traccar OsmAnd endpoint: /api/track (as defined in Android Master Integration Spec)
    // - Direct Root URL: https://fleet.mrps.in/?id=12345&lat=26.79&lon=82.71... (Standard Traccar default)
    // - Standard paths: /api/track, /api/location, /location, /track, /telemetry, /api/v1/telemetry
    const hasTraccarParams = (url.searchParams.has('id') || url.searchParams.has('uniqueId') || url.searchParams.has('deviceId') || url.searchParams.has('deviceid')) && 
                             (url.searchParams.has('lat') || url.searchParams.has('latitude'));
    const isTelemetryPath = url.pathname === '/api/track' || url.pathname === '/api/track/' ||
                           url.pathname === '/api/location' || url.pathname === '/api/location/' ||
                           url.pathname === '/api/v1/telemetry' || url.pathname === '/api/v1/telemetry/' ||
                           url.pathname === '/location' || url.pathname === '/track' || url.pathname === '/telemetry';

    if (isTelemetryPath || hasTraccarParams || (request.method === 'POST' && url.pathname === '/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
            'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
          },
        });
      }

      // Check query params first (Traccar OsmAnd passes all data as URL-encoded query parameters)
      let id = url.searchParams.get('id') || url.searchParams.get('uniqueId') || url.searchParams.get('deviceid') || url.searchParams.get('deviceId');
      let driver = url.searchParams.get('driver') || url.searchParams.get('driverName') || '';
      let lat = parseFloat(url.searchParams.get('lat') || url.searchParams.get('latitude') || '');
      let lon = parseFloat(url.searchParams.get('lon') || url.searchParams.get('lng') || url.searchParams.get('longitude') || '');
      let rawSpeed = parseFloat(url.searchParams.get('speed') || '0');
      let bearing = parseFloat(url.searchParams.get('bearing') || url.searchParams.get('heading') || '0');
      let altitude = parseFloat(url.searchParams.get('altitude') || '0');
      let accuracy = parseFloat(url.searchParams.get('accuracy') || '0');
      let batt = parseFloat(url.searchParams.get('batt') || url.searchParams.get('battery') || '100');
      let chargeParam = url.searchParams.get('charge');
      let charge = chargeParam === 'true' || chargeParam === '1';
      const mockParam = url.searchParams.get('mock');
      let isMock = mockParam === 'true' || mockParam === '1';

      let timestamp = Date.now();
      const tsParam = url.searchParams.get('timestamp') || url.searchParams.get('time');
      if (tsParam) {
        const parsed = parseInt(tsParam, 10);
        if (!isNaN(parsed)) timestamp = parsed > 10000000000 ? parsed : parsed * 1000;
      }

      // If POST with body (JSON or form-data) and params were not in query:
      if (request.method === 'POST' && (isNaN(lat) || isNaN(lon) || !id)) {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const body = await request.json();
            if (!id) id = body.id || body.uniqueId || body.deviceId;
            if (!driver) driver = body.driver || body.driverName || '';
            if (isNaN(lat)) lat = parseFloat(body.lat || body.latitude);
            if (isNaN(lon)) lon = parseFloat(body.lon || body.lng || body.longitude);
            if (body.speed !== undefined) rawSpeed = parseFloat(body.speed);
            if (body.bearing !== undefined) bearing = parseFloat(body.bearing || body.heading);
            if (body.altitude !== undefined) altitude = parseFloat(body.altitude);
            if (body.accuracy !== undefined) accuracy = parseFloat(body.accuracy);
            if (body.batt !== undefined || body.battery !== undefined) batt = parseFloat(body.batt || body.battery);
            if (body.charge !== undefined) charge = Boolean(body.charge);
            if (body.mock !== undefined) isMock = body.mock === true || body.mock === 'true' || body.mock === 1 || body.mock === '1';
            if (body.timestamp) timestamp = normalizeEpochMs(body.timestamp);
          } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            if (!id) id = formData.get('id') || formData.get('uniqueId') || formData.get('deviceId');
            if (!driver) driver = formData.get('driver') || formData.get('driverName') || '';
            if (isNaN(lat)) lat = parseFloat(formData.get('lat') || formData.get('latitude'));
            if (isNaN(lon)) lon = parseFloat(formData.get('lon') || formData.get('lng') || formData.get('longitude'));
            if (formData.has('speed')) rawSpeed = parseFloat(formData.get('speed'));
            if (formData.has('bearing')) bearing = parseFloat(formData.get('bearing') || formData.get('heading'));
            if (formData.has('altitude')) altitude = parseFloat(formData.get('altitude'));
            if (formData.has('accuracy')) accuracy = parseFloat(formData.get('accuracy'));
            if (formData.has('batt')) batt = parseFloat(formData.get('batt') || formData.get('battery'));
            if (formData.has('charge')) charge = formData.get('charge') === 'true' || formData.get('charge') === '1';
            if (formData.has('mock')) isMock = formData.get('mock') === 'true' || formData.get('mock') === '1';
          }
        } catch (e) {
          // Empty body is standard for Traccar OsmAnd query-param POST
        }
      }

      if (!id || isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        if (url.pathname === '/' && request.method === 'GET') {
          return env.ASSETS.fetch(request);
        }
        return new Response(JSON.stringify({ 
          error: 'Missing or invalid parameters. Required: id, lat (-90..90), lon (-180..180)' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const vehId = canonicalVehicleId(id);
      if (isMock) {
        return new Response(JSON.stringify({ success: true, skipped: 'mock' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      const existing = liveVehicles.get(vehId) || {};

      let filter = vehicleFilters.get(vehId);
      if (!filter) {
        filter = createKinematicFilter();
        vehicleFilters.set(vehId, filter);
      }

      const record = processTelemetryPacket({
        id: vehId,
        driver,
        lat,
        lon,
        speedKnots: rawSpeed,
        bearing,
        altitude,
        accuracy,
        batt,
        charge,
        timestamp,
      }, { existing, filter });

      if (!record) {
        return new Response(JSON.stringify({ error: 'Invalid telemetry' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // Store in edge memory cache for this isolate, then hand the fix to the
      // single Durable Object. That one call updates live state, writes the
      // history row and broadcasts the delta.
      liveVehicles.set(vehId, record);

      if (env.FLEET_HUB) {
        const ingest = env.FLEET_HUB
          .get(env.FLEET_HUB.idFromName(HUB_NAME))
          .fetch('https://fleet-hub/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          })
          .then(async (response) => {
            // The hub is authoritative for the blocklist. If it rejected the
            // packet, drop the edge copy too so a purged vehicle cannot leak
            // back through the fallback cache.
            try {
              const data = await response.json();
              if (data?.skipped === 'blocked') liveVehicles.delete(vehId);
            } catch (e) {}
            return response;
          })
          .catch((error) => {
            console.error('ingest failed', error?.message || error);
            return null;
          });
        if (ctx?.waitUntil) ctx.waitUntil(ingest);
      }

      // Immediate HTTP 200 OK required by Android app
      return new Response(JSON.stringify({ 
        success: true, 
        app: 'Sant Kabir Fleet Shield',
        developer: 'Mani Ratan Singh (mrps.in)',
        vehicle: record 
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
        },
      });
    }

    // 2. Endpoint: /api/clear (Admin-only: clears in-memory live telemetry cache)
    if (url.pathname === '/api/clear' || url.pathname === '/api/clear/') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
          },
        });
      }

      if (request.method !== 'POST' && request.method !== 'DELETE') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Allow': 'POST, DELETE, OPTIONS',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Fail closed if the deployment secret was never provisioned.
      if (!env.ADMIN_SECRET_KEY) {
        return new Response(JSON.stringify({ error: 'Admin endpoint not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const suppliedKey = request.headers.get('X-Admin-Key') || '';
      if (!(await safeEqual(suppliedKey, env.ADMIN_SECRET_KEY))) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      liveVehicles.clear();
      vehicleFilters.clear();
      lastHubForward.clear();
      if (env.FLEET_HUB) {
        const hubClear = env.FLEET_HUB
          .get(env.FLEET_HUB.idFromName(HUB_NAME))
          .fetch('https://fleet-hub/clear', { method: 'DELETE' })
          .catch(() => null);
        if (ctx?.waitUntil) ctx.waitUntil(hubClear);
      }
      return new Response(JSON.stringify({
        success: true,
        message: 'Live telemetry cache cleared',
        count: 0
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 2b. Endpoint: /api/remove (Admin-only: removes one vehicle record)
    // Used for test devices, uninstalled phones, renamed drivers and ghosts.
    if (url.pathname === '/api/remove' || url.pathname === '/api/remove/') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
          },
        });
      }

      if (request.method !== 'POST' && request.method !== 'DELETE') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Allow': 'POST, DELETE, OPTIONS',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      if (!env.ADMIN_SECRET_KEY) {
        return new Response(JSON.stringify({ error: 'Admin endpoint not configured' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const suppliedKey = request.headers.get('X-Admin-Key') || '';
      if (!(await safeEqual(suppliedKey, env.ADMIN_SECRET_KEY))) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const ids = new Set();
      const queryId = url.searchParams.get('id');
      if (queryId) ids.add(canonicalVehicleId(queryId));

      if (request.method === 'POST') {
        try {
          const body = await request.json();
          if (body?.id) ids.add(canonicalVehicleId(body.id));
          if (Array.isArray(body?.ids)) {
            body.ids.forEach((value) => {
              const id = canonicalVehicleId(value);
              if (id) ids.add(id);
            });
          }
        } catch (e) {
          // Query-string and empty bodies are valid
        }
      }

      const cleanIds = Array.from(ids).filter(Boolean);
      if (cleanIds.length === 0) {
        return new Response(JSON.stringify({ error: 'Missing id' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      for (const id of cleanIds) {
        liveVehicles.delete(id);
        vehicleFilters.delete(id);
        lastHubForward.delete(id);
      }

      if (env.FLEET_HUB) {
        const hubRemove = env.FLEET_HUB
          .get(env.FLEET_HUB.idFromName(HUB_NAME))
          .fetch('https://fleet-hub/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: cleanIds }),
          })
          .catch(() => null);
        if (ctx?.waitUntil) ctx.waitUntil(hubRemove);
      }

      return new Response(JSON.stringify({
        success: true,
        removed: cleanIds,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 3. Endpoint: /api/vehicles (Returns the dynamically registered fleet)
    //
    // Records are persisted. Going quiet no longer deletes a driver: the age
    // of the last packet maps to live / no signal / parked / offline.
    if (url.pathname === '/api/vehicles' || url.pathname === '/api/vehicles/') {
      const boardSession = await requireBoardSession(request, env);
      if (!boardSession) {
        return new Response(JSON.stringify({ error: 'Board access required' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        });
      }
      const now = Date.now();
      let list = [];
      let hubOk = false;

      if (env.FLEET_HUB) {
        try {
          const hub = env.FLEET_HUB.get(env.FLEET_HUB.idFromName(HUB_NAME));
          const res = await hub.fetch('https://fleet-hub/live', { headers: { 'Content-Type': 'application/json' } });
          const data = await res.json().catch(() => ({}));
          if (Array.isArray(data.vehicles)) {
            list = data.vehicles;
            hubOk = true;
          }
        } catch (error) {
          console.error('live snapshot failed', error?.message || error);
        }
      }

      // Only fall back to the edge cache when the hub itself failed. An empty
      // hub list is authoritative; otherwise a purged vehicle could reappear.
      if (!hubOk) {
        list = Array.from(liveVehicles.values()).map(vVal => ({ ...vVal, ...computeVehicleAgeState(vVal, now) }));
      }

      return new Response(JSON.stringify({
        success: true,
        vehicles: list,
        count: list.length,
        timestamp: now,
        app: 'Sant Kabir Fleet Shield',
        developer: 'Mani Ratan Singh (mrps.in)',
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'CDN-Cache-Control': 'no-store',
          'Cloudflare-CDN-Cache-Control': 'no-store',
          'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
        },
      });
    }

    // 4. Endpoint: /api/route (Dynamic Turn-by-Turn Routing Engine for Full UP Coverage)
    if (url.pathname === '/api/route' || url.pathname === '/api/route/') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }

      let fromLon = parseFloat(url.searchParams.get('fromLon') || '');
      let fromLat = parseFloat(url.searchParams.get('fromLat') || '');
      const fromParam = url.searchParams.get('from');
      if (fromParam && (isNaN(fromLon) || isNaN(fromLat))) {
        const parts = fromParam.split(',');
        if (parts.length === 2) {
          fromLon = parseFloat(parts[0]);
          fromLat = parseFloat(parts[1]);
        }
      }

      let toLon = parseFloat(url.searchParams.get('toLon') || '');
      let toLat = parseFloat(url.searchParams.get('toLat') || '');
      const toParam = url.searchParams.get('to');
      if (toParam && (isNaN(toLon) || isNaN(toLat))) {
        const parts = toParam.split(',');
        if (parts.length === 2) {
          toLon = parseFloat(parts[0]);
          toLat = parseFloat(parts[1]);
        }
      }

      if (isNaN(toLon) || isNaN(toLat)) {
        toLon = BASE_LON;
        toLat = BASE_LAT;
      }

      if (isNaN(fromLon) || isNaN(fromLat)) {
        return new Response(JSON.stringify({ error: 'Missing coordinates' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
        const res = await fetch(osrmUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'SantKabirFleetShield/1.0 (https://fleet.mrps.in)' },
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`OSRM status ${res.status}`);
        const data = await res.json();
        if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
          const primaryRoute = data.routes[0];
          return new Response(JSON.stringify({
            success: true,
            source: 'osrm-driving',
            roadDistanceKm: Math.round((primaryRoute.distance / 1000) * 10) / 10,
            roadDistanceMeters: Math.round(primaryRoute.distance),
            durationMin: Math.round(primaryRoute.duration / 60),
            coordinates: primaryRoute.geometry.coordinates,
            pointsCount: primaryRoute.geometry.coordinates.length,
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
        throw new Error('No route returned by OSRM');
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          error: err.name === 'AbortError' ? 'Route query timed out' : err.message,
          fallbackRequired: true,
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // 4b. History service (separate store, separate admin gate)
    // ── Board access ───────────────────────────────────────────────────────
    if (url.pathname === '/login' && request.method === 'GET') {
      const session = await requireBoardSession(request, env);
      if (session) {
        const next = url.searchParams.get('next');
        const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
        return Response.redirect(new URL(destination, request.url), 302);
      }
      return new Response(boardLoginPage(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }

    if (url.pathname === '/api/board/login' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const now = Date.now();
      const attempts = (boardLoginAttempts.get(ip) || []).filter((time) => now - time < 10 * 60 * 1000);
      if (attempts.length >= 5) {
        return historyJson({ error: 'Too many attempts. Try again later.' }, 429);
      }
      let password = '';
      try {
        const body = await request.json();
        password = String(body?.password || '');
      } catch (e) {
        password = '';
      }
      if (!(await verifyBoardPassword(env, password))) {
        attempts.push(now);
        boardLoginAttempts.set(ip, attempts);
        return historyJson({ error: 'Invalid password' }, 401);
      }
      boardLoginAttempts.delete(ip);
      const token = await createBoardSession(env, {
        kind: 'password',
        name: 'Password',
        ttlSeconds: BOARD_PASSWORD_SESSION_SECONDS,
      });
      if (!token) return historyJson({ error: 'Board sessions are not configured' }, 503);
      return historyJson({ success: true }, 200, {
        'Set-Cookie': boardCookie(token, url, BOARD_PASSWORD_SESSION_SECONDS),
      });
    }

    if (url.pathname.startsWith('/s/') && request.method === 'GET') {
      const token = decodeURIComponent(url.pathname.slice(3)).trim();
      const stub = historyStub(env);
      let vehicle = '';
      let expires = 0;
      if (stub) {
        const resolved = await stub
          .fetch(`https://history/share/resolve?token=${encodeURIComponent(token)}`)
          .catch(() => null);
        const data = resolved ? await resolved.json().catch(() => ({})) : {};
        if (resolved?.ok && data?.valid) {
          vehicle = data.vehicle_id || '';
          expires = Number(data.expires_at) || 0;
        }
      }
      if (!expires) {
        // Compatibility with the earlier long signed share tokens.
        const legacy = await verifyBoardToken(token, env);
        if (legacy?.k === 'share' && legacy.exp > Date.now()) {
          vehicle = legacy.id || '';
          expires = legacy.exp;
        } else {
          return boardNotice('Share link', 'This live share link has expired or is not valid.', 410);
        }
      }
      const existing = await verifyBoardToken(getCookie(request, BOARD_COOKIE), env);
      if (existing && existing.k !== 'share') {
        const target = vehicle ? `/?vehicle=${encodeURIComponent(vehicle)}` : '/';
        return new Response(null, {
          status: 302,
          headers: { Location: target, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
        });
      }
      const remaining = Math.max(1, Math.ceil((expires - Date.now()) / 1000));
      const session = await createBoardSession(env, {
        kind: 'share',
        id: vehicle,
        name: 'Shared live view',
        ttlSeconds: remaining,
      });
      if (!session) return boardNotice('Share link', 'Board sessions are not configured.', 503);
      const params = new URLSearchParams({ shared: '1', exp: String(expires) });
      if (vehicle) params.set('vehicle', vehicle);
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/?${params.toString()}`,
          'Set-Cookie': boardCookie(session, url, remaining),
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }

    if (url.pathname.startsWith('/d/') && request.method === 'GET') {
      const token = decodeURIComponent(url.pathname.slice(3)).trim();
      if (!token) return boardNotice('Device link', 'This link is missing its token.', 400);
      const stub = historyStub(env);
      if (!stub) return boardNotice('Device link', 'The history store is not configured.', 503);
      const redeemResponse = await stub
        .fetch('https://history/board/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        .catch(() => null);
      const data = redeemResponse ? await redeemResponse.json().catch(() => ({})) : {};
      if (!redeemResponse || !redeemResponse.ok) {
        return boardNotice('Device link', data.error || 'This device link is not valid.', redeemResponse?.status || 500);
      }
      if (data.already) {
        const existing = await verifyBoardToken(getCookie(request, BOARD_COOKIE), env);
        if (existing?.k === 'device' && existing.id === data.device?.id) {
          return Response.redirect(new URL('/', request.url), 302);
        }
        return boardNotice(
          'Link already used',
          'This device link has already been opened on another device. Create a new link from History → Advanced → Devices.',
          410
        );
      }
      const session = await createBoardSession(env, {
        kind: 'device',
        id: data.device.id,
        name: data.device.name,
        ttlSeconds: BOARD_DEVICE_SESSION_SECONDS,
      });
      if (!session) return boardNotice('Device link', 'Board sessions are not configured.', 503);
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/',
          'Set-Cookie': boardCookie(session, url, BOARD_DEVICE_SESSION_SECONDS),
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }

    if (url.pathname === '/api/board/share' && request.method === 'POST') {
      const session = await requireBoardSession(request, env);
      if (!session) return historyJson({ error: 'Board access required' }, 401);
      if (session.k === 'share') {
        return historyJson({ error: 'A shared view cannot create another share link' }, 403);
      }
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      const body = await request.json().catch(() => ({}));
      const response = await stub.fetch('https://history/share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: canonicalVehicleId(body?.vehicle) || '',
          hours: Number(body?.hours),
        }),
      });
      const data = await response.json().catch(() => ({ error: 'Share store error' }));
      if (!response.ok || !data?.token) {
        return historyJson({ error: data?.error || 'Could not create the link' }, response.status || 500);
      }
      const host = request.headers.get('host') || url.host;
      return historyJson({
        success: true,
        url: `${url.protocol}//${host}/s/${data.token}`,
        hours: Number(body?.hours),
        expires_at: data.expires_at,
      });
    }

    if (url.pathname === '/api/board/devices') {
      const unauthorized = await requireHistoryAuth(request, env);
      if (unauthorized) return unauthorized;
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      if (request.method === 'POST') {
        const response = await stub.fetch('https://history/board/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: await request.text(),
        });
        const data = await response.json().catch(() => ({ error: 'Board store error' }));
        if (data?.token) {
          const host = request.headers.get('host') || url.host;
          data.url = `${url.protocol}//${host}/d/${data.token}`;
        }
        return historyJson(data, response.status);
      }
      const response = await stub.fetch('https://history/board/devices');
      const data = await response.json().catch(() => ({ error: 'Board store error' }));
      return historyJson(data, response.status);
    }

    if (url.pathname === '/api/board/revoke' && request.method === 'POST') {
      const unauthorized = await requireHistoryAuth(request, env);
      if (unauthorized) return unauthorized;
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      const response = await stub.fetch('https://history/board/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await request.text(),
      });
      const data = await response.json().catch(() => ({ error: 'Board store error' }));
      return historyJson(data, response.status);
    }

    if (url.pathname === '/api/history/login' && request.method === 'POST') {
      if (!env.HISTORY_SESSION_SECRET) {
        return historyJson({ error: 'History authentication is not configured' }, 503);
      }

      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const now = Date.now();
      const attempts = (historyLoginAttempts.get(ip) || []).filter(
        (time) => now - time < 10 * 60 * 1000
      );
      if (attempts.length >= 5) {
        return historyJson({ error: 'Too many attempts. Try again later.' }, 429);
      }

      let password = '';
      try {
        const body = await request.json();
        password = String(body?.password || '');
      } catch (e) {
        password = '';
      }

      if (!(await verifyHistoryPassword(password))) {
        attempts.push(now);
        historyLoginAttempts.set(ip, attempts);
        if (ctx?.waitUntil) ctx.waitUntil(auditHistory(env, 'login_failed', '', '', 'unknown'));
        return historyJson({ error: 'Invalid password' }, 401);
      }

      historyLoginAttempts.delete(ip);
      const token = await createHistorySession(env.HISTORY_SESSION_SECRET);
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      if (ctx?.waitUntil) ctx.waitUntil(auditHistory(env, 'login', '', '', 'admin'));
      return historyJson({ success: true }, 200, {
        'Set-Cookie': `${HISTORY_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${HISTORY_SESSION_SECONDS}${secure}`,
      });
    }

    if (url.pathname === '/api/history/logout' && request.method === 'POST') {
      if (ctx?.waitUntil) ctx.waitUntil(auditHistory(env, 'logout', '', '', 'admin'));
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      return historyJson({ success: true }, 200, {
        'Set-Cookie': `${HISTORY_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
      });
    }

    if (url.pathname === '/api/history/health') {
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      const response = await stub.fetch('https://history/health');
      const data = await response.json().catch(() => ({}));
      return historyJson(data, response.status);
    }

    if (url.pathname === '/api/history/vehicles') {
      const unauthorized = await requireHistoryAuth(request, env);
      if (unauthorized) return unauthorized;
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      const response = await stub.fetch('https://history/vehicles');
      const data = await response.json().catch(() => ({ error: 'History store error' }));
      return historyJson(data, response.status);
    }

    if (url.pathname === '/api/history/delete' && request.method === 'POST') {
      const unauthorized = await requireHistoryAuth(request, env);
      if (unauthorized) return unauthorized;
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      const body = await request.json().catch(() => ({}));
      const response = await stub.fetch('https://history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({ error: 'History store error' }));
      return historyJson(data, response.status);
    }

    if (url.pathname === '/api/history/purge' && request.method === 'POST') {
      const unauthorized = await requireHistoryAuth(request, env);
      if (unauthorized) return unauthorized;
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      const body = await request.json().catch(() => ({}));
      const response = await stub.fetch('https://history/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({ error: 'Purge error' }));
      return historyJson(data, response.status);
    }

    if (url.pathname === '/api/history/unblock' && request.method === 'POST') {
      const unauthorized = await requireHistoryAuth(request, env);
      if (unauthorized) return unauthorized;
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      const body = await request.json().catch(() => ({}));
      const response = await stub.fetch('https://history/unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({ error: 'Unblock error' }));
      return historyJson(data, response.status);
    }

    if (url.pathname === '/api/history/blocked') {
      const unauthorized = await requireHistoryAuth(request, env);
      if (unauthorized) return unauthorized;
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      const response = await stub.fetch('https://history/blocked');
      const data = await response.json().catch(() => ({ error: 'Blocked list error' }));
      return historyJson(data, response.status);
    }

    for (const report of ['trips', 'stops', 'summary', 'all']) {
      if (url.pathname === `/api/history/reports/${report}`) {
        const unauthorized = await requireHistoryAuth(request, env);
        if (unauthorized) return unauthorized;
        const stub = historyStub(env);
        if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
        const response = await stub.fetch(`https://history/reports/${report}${url.search}`);
        const data = await response.json().catch(() => ({ error: 'Report error' }));
        return historyJson(data, response.status);
      }
    }

    if (url.pathname === '/api/history') {
      const unauthorized = await requireHistoryAuth(request, env);
      if (unauthorized) return unauthorized;
      const stub = historyStub(env);
      if (!stub) return historyJson({ error: 'History store is not configured' }, 503);
      const response = await stub.fetch(`https://history/history${url.search}`);
      const data = await response.json().catch(() => ({ error: 'History store error' }));
      return historyJson(data, response.status);
    }

    if (url.pathname === '/history' || url.pathname === '/history/') {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/history.html';
      const historyAsset = await env.ASSETS.fetch(new Request(assetUrl, request));
      const headers = new Headers(historyAsset.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      return new Response(historyAsset.body, {
        status: historyAsset.status,
        statusText: historyAsset.statusText,
        headers,
      });
    }

    if (url.pathname === '/history-demo' || url.pathname === '/history-demo/') {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/history-demo.html';
      const demoAsset = await env.ASSETS.fetch(new Request(assetUrl, request));
      const headers = new Headers(demoAsset.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      headers.set('X-Robots-Tag', 'noindex, nofollow');
      return new Response(demoAsset.body, {
        status: demoAsset.status,
        statusText: demoAsset.statusText,
        headers,
      });
    }

    // Board page gate. Telemetry GETs with query params were handled above;
    // this only sees a plain page request. /?demo stays public for the showcase.
    if (
      (url.pathname === '/' || url.pathname === '/index.html') &&
      request.method === 'GET' &&
      !url.searchParams.has('demo') &&
      !url.searchParams.has('dev')
    ) {
      const boardSession = await requireBoardSession(request, env);
      if (!boardSession) {
        const next = `${url.pathname}${url.search}`;
        return Response.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url), 302);
      }
    }

    // 5. Fallback: Serve static assets with strict Zero-Cache for HTML & Live App
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html');

    if (isHtml) {
      const freshHeaders = new Headers(assetResponse.headers);
      freshHeaders.set('Referrer-Policy', 'no-referrer');
      freshHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      freshHeaders.set('Pragma', 'no-cache');
      freshHeaders.set('Expires', '0');
      freshHeaders.set('Surrogate-Control', 'no-store');
      freshHeaders.set('CDN-Cache-Control', 'no-store');
      freshHeaders.set('Cloudflare-CDN-Cache-Control', 'no-store');

      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers: freshHeaders,
      });
    }

    return assetResponse;
  },
};

// Global fleet coordinator. One SQLite-backed Durable Object owns the live
// fleet mirror and all hibernating WebSocket connections. Dashboards receive a
// snapshot on connect and deltas on movement.
export class PurvanchalFleetHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.state = ctx;
    this.env = env;
    this.vehicles = new Map();
    this.filters = new Map();
    this.wsTrackerIds = new Set();
    this.lastSnapshotAt = 0;

    if (typeof WebSocketRequestResponsePair !== 'undefined') {
      // Plain-text "ping" is answered without waking the hibernating object.
      this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }

    this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get('fleet_snapshot');
      if (Array.isArray(saved)) {
        // Records are kept long-term. Canonicalise ids on load so legacy
        // spellings collapse into a single fleet record instead of ghosts.
        const next = new Map();
        for (const v of saved) {
          if (!v) continue;
          const id = canonicalVehicleId(v.id);
          if (!id) continue;
          next.set(id, { ...v, id, name: id });
        }
        this.vehicles = next;
        if (next.size !== saved.length) {
          await this.state.storage.put('fleet_snapshot', Array.from(next.values()));
        }
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const jsonHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };

    if (url.pathname.endsWith('/ws')) {
      const upgrade = request.headers.get('Upgrade');
      if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
        return new Response(JSON.stringify({ error: 'Expected WebSocket upgrade' }), {
          status: 426,
          headers: jsonHeaders,
        });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const role = url.searchParams.get('role') === 'tracker' ? 'tracker' : 'dashboard';
      this.ctx.acceptWebSocket(server);
      try { server.serializeAttachment({ role }); } catch (e) {}

      try {
        if (role === 'dashboard') {
          server.send(JSON.stringify({
            type: 'snapshot',
            vehicles: this.getFleetSnapshot(),
            timestamp: Date.now(),
          }));
        } else {
          server.send(JSON.stringify({ type: 'ready', role: 'tracker', timestamp: Date.now() }));
        }
      } catch (e) {}
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith('/track') && request.method === 'POST') {
      try {
        const record = await request.json();
        const id = canonicalVehicleId(record?.id);
        if (id && !this.wsTrackerIds.has(id)) {
          const stored = { ...record, id, name: id };
          this.vehicles.set(id, stored);
          this.pushHistory(stored);
          this.broadcast({ type: 'delta', vehicle: { ...stored, ...computeVehicleAgeState(stored) } });
          this.persistSnapshotIfDue();
        }
      } catch (e) {}
      return new Response(JSON.stringify({ success: true, count: this.vehicles.size }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    if (url.pathname.endsWith('/vehicles')) {
      return new Response(JSON.stringify({
        success: true,
        vehicles: this.getFleetSnapshot(),
        count: this.vehicles.size,
        timestamp: Date.now(),
      }), { status: 200, headers: jsonHeaders });
    }

    if (url.pathname.endsWith('/clear') && (request.method === 'DELETE' || request.method === 'POST')) {
      this.vehicles.clear();
      this.filters.clear();
      this.wsTrackerIds.clear();
      this.broadcast({ type: 'clear', timestamp: Date.now() });
      if (this.state.waitUntil) {
        this.state.waitUntil(this.state.storage.put('fleet_snapshot', []));
      }
      return new Response(JSON.stringify({ success: true, count: 0 }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    if (url.pathname.endsWith('/remove') && (request.method === 'POST' || request.method === 'DELETE')) {
      let ids = [];
      try {
        const body = await request.json();
        if (body?.id) ids.push(body.id);
        if (Array.isArray(body?.ids)) ids.push(...body.ids);
      } catch (e) {
        ids = url.searchParams.getAll('id');
      }
      ids = Array.from(new Set(ids.map(canonicalVehicleId).filter(Boolean)));

      const removed = [];
      for (const id of ids) {
        if (this.vehicles.delete(id)) removed.push(id);
        this.filters.delete(id);
        this.wsTrackerIds.delete(id);
      }

      if (removed.length) {
        await this.state.storage.put('fleet_snapshot', Array.from(this.vehicles.values()));
        this.broadcast({ type: 'remove', ids: removed, timestamp: Date.now() });
      }

      return new Response(JSON.stringify({
        success: true,
        removed,
        count: this.vehicles.size,
      }), { status: 200, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: jsonHeaders,
    });
  }

  webSocketMessage(ws, message) {
    const attachment = ws.deserializeAttachment?.() || {};
    if (attachment.role === 'tracker') {
      let raw = message;
      if (typeof raw !== 'string') {
        try { raw = new TextDecoder().decode(raw); } catch (e) { raw = ''; }
      }
      const packet = coerceTelemetryPacket(raw);
      if (!packet) return;

      const id = canonicalVehicleId(packet.id);
      if (!id) return;

      const existing = this.vehicles.get(id) || {};
      let filter = this.filters.get(id);
      if (!filter) {
        filter = createKinematicFilter();
        this.filters.set(id, filter);
      }

      const record = processTelemetryPacket(packet, { existing, filter, now: Date.now() });
      if (!record) return;

      this.vehicles.set(record.id, record);
      this.wsTrackerIds.add(record.id);
      this.pushHistory(record);
      try { ws.serializeAttachment({ role: 'tracker', id: record.id }); } catch (e) {}
      this.broadcast({ type: 'delta', vehicle: { ...record, ...computeVehicleAgeState(record) } });
      this.persistSnapshotIfDue();
      try {
        ws.send(JSON.stringify({ type: 'ack', id: record.id, timestamp: Date.now() }));
      } catch (e) {}
      return;
    }

    try {
      const data = JSON.parse(message);
      if (data?.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      } else if (data?.type === 'subscribe') {
        ws.send(JSON.stringify({
          type: 'snapshot',
          vehicles: this.getFleetSnapshot(),
          timestamp: Date.now(),
        }));
      } else if (data?.type === 'track' && data.vehicle?.id) {
        const id = canonicalVehicleId(data.vehicle.id);
        if (!id) return;
        if (this.isBlocked(id)) return;
        const stored = { ...data.vehicle, id, name: id };
        this.vehicles.set(id, stored);
        this.pushHistory(stored);
        this.broadcast({ type: 'delta', vehicle: { ...stored, ...computeVehicleAgeState(stored) } });
        this.persistSnapshotIfDue();
      }
    } catch (e) {
      if (message === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    }
  }

  webSocketClose(ws, code, reason, wasClean) {
    const attachment = ws.deserializeAttachment?.() || {};
    if (attachment.role === 'tracker' && attachment.id) {
      this.wsTrackerIds.delete(String(attachment.id));
    }
    try { ws.close(code, 'Hub closing connection'); } catch (e) {}
  }

  webSocketError(ws, error) {
    try { ws.close(1011, 'Hub socket error'); } catch (e) {}
  }

  pushHistory(record) {
    if (!this.env?.HISTORY_DB || !record) return;
    const stub = this.env.HISTORY_DB.get(this.env.HISTORY_DB.idFromName(HISTORY_NAME));
    const task = stub
      .fetch('https://history/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })
      .catch((error) => {
        console.error('history write failed', error?.message || error);
        return null;
      });
    if (this.state.waitUntil) this.state.waitUntil(task);
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      const role = ws.deserializeAttachment?.()?.role;
      if (role === 'tracker') continue;
      try { ws.send(payload); } catch (e) {}
    }
  }

  getFleetSnapshot() {
    const now = Date.now();
    return Array.from(this.vehicles.values()).map((record) => ({
      ...record,
      ...computeVehicleAgeState(record, now),
    }));
  }

  persistSnapshotIfDue() {
    const now = Date.now();
    if (now - this.lastSnapshotAt < HUB_PERSIST_INTERVAL_MS) return;
    this.lastSnapshotAt = now;
    const snapshot = Array.from(this.vehicles.values());
    if (this.state.waitUntil) {
      this.state.waitUntil(this.state.storage.put('fleet_snapshot', snapshot));
    } else {
      this.state.storage.put('fleet_snapshot', snapshot).catch(() => {});
    }
  }
}

// Separate history store. One SQLite-backed Durable Object with a 30-day
// retention window. It never blocks the live telemetry path.
export class FleetHistory {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.state = ctx;
    this.env = env;
    this.fleet = new Map();
    this.filters = new Map();
    this.wsTrackerIds = new Set();
    this.lastSnapshotAt = 0;

    if (typeof WebSocketRequestResponsePair !== 'undefined') {
      this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }

    this.state.blockConcurrencyWhile(async () => {
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS history (
          vehicle_id TEXT NOT NULL,
          slot INTEGER NOT NULL,
          device_time INTEGER NOT NULL,
          received_at INTEGER NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          speed REAL,
          bearing REAL,
          accuracy REAL,
          battery INTEGER,
          PRIMARY KEY (vehicle_id, slot)
        )
      `);
      this.state.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS history_time ON history(vehicle_id, device_time)'
      );
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS history_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          at INTEGER NOT NULL,
          action TEXT NOT NULL,
          vehicle_id TEXT,
          detail TEXT,
          actor TEXT
        )
      `);
      // New single-row-per-fix table. Keeps the old slot table as a backup.
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS history_points (
          vehicle_id TEXT NOT NULL,
          device_time INTEGER NOT NULL,
          received_at INTEGER NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          speed REAL,
          bearing REAL,
          accuracy REAL,
          battery INTEGER,
          PRIMARY KEY (vehicle_id, device_time)
        )
      `);
      this.state.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS history_points_time ON history_points(vehicle_id, device_time)'
      );
      try { this.state.storage.sql.exec('ALTER TABLE history_points ADD COLUMN raw_lat REAL'); } catch (e) {}
      try { this.state.storage.sql.exec('ALTER TABLE history_points ADD COLUMN raw_lon REAL'); } catch (e) {}
      try { this.state.storage.sql.exec('ALTER TABLE history_points ADD COLUMN altitude REAL'); } catch (e) {}
      try { this.state.storage.sql.exec('ALTER TABLE history_points ADD COLUMN charge INTEGER'); } catch (e) {}
      // Index on device_time alone. The retention delete and MIN/MAX must not
      // scan the whole table.
      this.state.storage.sql.exec(
        'CREATE INDEX IF NOT EXISTS history_points_device ON history_points(device_time)'
      );
      // Per-vehicle counters so the vehicle picker never runs a full GROUP BY.
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS history_stats (
          vehicle_id TEXT PRIMARY KEY,
          last_seen INTEGER NOT NULL,
          points INTEGER NOT NULL
        )
      `);
      // Named device links for the live board. The token is stored hashed and
      // can be redeemed once; the session lives in a signed cookie for a year.
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS board_devices (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          link_expires_at INTEGER NOT NULL,
          redeemed_at INTEGER,
          session_expires_at INTEGER,
          last_seen INTEGER,
          revoked_at INTEGER
        )
      `);
      this.state.storage.sql.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS board_devices_token ON board_devices(token_hash)'
      );
      // Purged vehicles are blocked here. Ingest drops them before live state
      // or history can be written, so a phone that keeps sending cannot make
      // the vehicle reappear.
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS blocked_vehicles (
          vehicle_id TEXT PRIMARY KEY,
          blocked_at INTEGER NOT NULL,
          reason TEXT
        )
      `);
      // Short, revocable live-share tokens. The URL only carries the 12-char
      // token; expiry and scope live here, not in a long signed string.
      this.state.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS share_links (
          token TEXT PRIMARY KEY,
          vehicle_id TEXT,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          revoked_at INTEGER
        )
      `);

      // Import whatever the legacy slot table still holds, then empty it.
      // Once empty this costs nothing, and it heals the table if an older
      // worker repopulated it during a rollback.
      const legacy = this.state.storage.sql
        .exec('SELECT COUNT(*) AS n FROM history')
        .toArray()[0]?.n || 0;
      if (legacy > 0) {
        this.state.storage.sql.exec(`
          INSERT OR IGNORE INTO history_points
            (vehicle_id, device_time, received_at, lat, lon, speed, bearing, accuracy, battery)
          SELECT vehicle_id, device_time, received_at, lat, lon, speed, bearing, accuracy, battery
          FROM history
        `);
        this.state.storage.sql.exec('DELETE FROM history');
      }

      // Safety net: rebuild the counters when they are missing or stale.
      // Stats can fall behind if an older worker wrote points without updating
      // them, which is exactly what happened during the experimental rollback.
      const newestPoint = this.state.storage.sql
        .exec('SELECT MAX(device_time) AS newest FROM history_points')
        .toArray()[0]?.newest || 0;
      const newestStat = this.state.storage.sql
        .exec('SELECT MAX(last_seen) AS newest FROM history_stats')
        .toArray()[0]?.newest || 0;
      if (newestPoint > newestStat) {
        this.state.storage.sql.exec(`
          INSERT OR REPLACE INTO history_stats (vehicle_id, last_seen, points)
          SELECT vehicle_id, MAX(device_time), COUNT(*) FROM history_points GROUP BY vehicle_id
        `);
      }

      const pendingAlarm = await this.state.storage.getAlarm();
      if (pendingAlarm === null) {
        await this.state.storage.setAlarm(Date.now() + HISTORY_PRUNE_INTERVAL_MS);
      }

      const saved = await this.state.storage.get('fleet_snapshot');
      if (Array.isArray(saved)) {
        const next = new Map();
        for (const v of saved) {
          if (!v) continue;
          const id = canonicalVehicleId(v.id);
          if (!id) continue;
          next.set(id, { ...v, id, name: id });
        }
        this.fleet = next;
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/ws')) {
      return this.handleSocket(request);
    }
    if (url.pathname.endsWith('/ingest') && request.method === 'POST') {
      return this.ingest(request);
    }
    if (url.pathname.endsWith('/track') && request.method === 'POST') {
      return this.ingest(request);
    }
    if (url.pathname.endsWith('/live')) {
      return this.live();
    }
    if (url.pathname.endsWith('/health')) {
      return this.health();
    }
    if (url.pathname.endsWith('/clear') && (request.method === 'DELETE' || request.method === 'POST')) {
      return this.clearLive();
    }
    if (url.pathname.endsWith('/remove') && (request.method === 'POST' || request.method === 'DELETE')) {
      return this.removeLive(request);
    }
    if (url.pathname.endsWith('/write') && request.method === 'POST') {
      return this.write(request);
    }
    if (url.pathname.endsWith('/vehicles')) {
      return this.vehicles();
    }
    if (url.pathname.endsWith('/history')) {
      return this.history(url);
    }
    if (url.pathname.endsWith('/reports/trips')) {
      return this.reportTrips(url);
    }
    if (url.pathname.endsWith('/reports/stops')) {
      return this.reportStops(url);
    }
    if (url.pathname.endsWith('/reports/summary')) {
      return this.reportSummary(url);
    }
    if (url.pathname.endsWith('/reports/all')) {
      return this.reportAll(url);
    }
    if (url.pathname.endsWith('/delete') && request.method === 'POST') {
      return this.remove(request);
    }
    if (url.pathname.endsWith('/audit') && request.method === 'POST') {
      return this.audit(request);
    }
    if (url.pathname.endsWith('/share/create') && request.method === 'POST') {
      return this.shareCreate(request);
    }
    if (url.pathname.endsWith('/share/resolve')) {
      return this.shareResolve(url);
    }
    if (url.pathname.endsWith('/purge') && request.method === 'POST') {
      return this.purge(request);
    }
    if (url.pathname.endsWith('/unblock') && request.method === 'POST') {
      return this.unblock(request);
    }
    if (url.pathname.endsWith('/blocked')) {
      return this.blockedList();
    }
    if (url.pathname.endsWith('/board/devices')) {
      if (request.method === 'POST') return this.boardCreate(request);
      return this.boardList();
    }
    if (url.pathname.endsWith('/board/redeem') && request.method === 'POST') {
      return this.boardRedeem(request);
    }
    if (url.pathname.endsWith('/board/revoke') && request.method === 'POST') {
      return this.boardRevoke(request);
    }
    if (url.pathname.endsWith('/board/status')) {
      return this.boardStatus(url);
    }

    return historyJson({ error: 'Not found' }, 404);
  }

  handleSocket(request) {
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return historyJson({ error: 'Expected WebSocket upgrade' }, 426);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const role = new URL(request.url).searchParams.get('role') === 'tracker' ? 'tracker' : 'dashboard';
    this.ctx.acceptWebSocket(server);
    try { server.serializeAttachment({ role }); } catch (e) {}
    try {
      if (role === 'dashboard') {
        server.send(JSON.stringify({ type: 'snapshot', vehicles: this.getFleetSnapshot(), timestamp: Date.now() }));
      } else {
        server.send(JSON.stringify({ type: 'ready', role: 'tracker', timestamp: Date.now() }));
      }
    } catch (e) {}
    return new Response(null, { status: 101, webSocket: client });
  }

  async ingest(request) {
    let record = null;
    try { record = await request.json(); } catch (e) { record = null; }
    if (!record) return historyJson({ error: 'Invalid body' }, 400);
    const id = canonicalVehicleId(record.id);
    const lat = Number(record.lat);
    const lon = Number(record.lon);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return historyJson({ error: 'Invalid vehicle' }, 400);

    if (record.mock) return historyJson({ success: true, skipped: 'mock', id });
    if (this.isBlocked(id)) return historyJson({ success: true, skipped: 'blocked', id });
    const stored = { ...record, id, name: id, lat, lon };
    const previous = this.fleet.get(id);
    if (previous && Number(previous.lastSeen) > Number(stored.lastSeen)) {
      return historyJson({ success: true, skipped: 'stale', id });
    }
    this.fleet.set(id, stored);
    this.writeRecord(stored);
    this.broadcast({ type: 'delta', vehicle: { ...stored, ...computeVehicleAgeState(stored) } });
    this.persistSnapshotIfDue();
    return historyJson({ success: true, id, count: this.fleet.size });
  }

  health() {
    const sql = this.state.storage.sql;
    const stats = sql
      .exec('SELECT COALESCE(SUM(points), 0) AS newCount, COUNT(*) AS vehicles FROM history_stats')
      .toArray()[0] || {};
    const range = sql
      .exec('SELECT MIN(device_time) AS oldest, MAX(device_time) AS newest FROM history_points')
      .toArray()[0] || {};
    const oldCount = sql.exec('SELECT COUNT(*) AS n FROM history').toArray()[0]?.n || 0;
    return historyJson({
      success: true,
      oldCount,
      newCount: stats.newCount || 0,
      vehicles: stats.vehicles || 0,
      oldest: range.oldest ?? null,
      newest: range.newest ?? null,
    });
  }

  async boardCreate(request) {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name || '').trim().slice(0, 40);
    if (!name) return historyJson({ error: 'Device name required' }, 400);
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await sha256Hex(token);
    const now = Date.now();
    const linkExpires = now + BOARD_LINK_TTL_MS;
    this.state.storage.sql.exec(
      `INSERT INTO board_devices (id, name, token_hash, created_at, link_expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      name,
      hash,
      now,
      linkExpires
    );
    return historyJson({
      success: true,
      device: { id, name, created_at: now, link_expires_at: linkExpires },
      token,
    });
  }

  async boardRedeem(request) {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || '');
    if (!token) return historyJson({ error: 'Missing token' }, 400);
    const hash = await sha256Hex(token);
    const now = Date.now();
    const row = this.state.storage.sql
      .exec('SELECT * FROM board_devices WHERE token_hash = ?', hash)
      .toArray()[0];
    if (!row) return historyJson({ error: 'Unknown device link' }, 404);
    if (row.revoked_at) return historyJson({ error: 'This device link was revoked' }, 410);
    if (row.link_expires_at < now) return historyJson({ error: 'This device link expired' }, 410);
    if (row.redeemed_at) {
      return historyJson({
        success: true,
        already: true,
        device: { id: row.id, name: row.name, session_expires_at: row.session_expires_at },
      });
    }
    const sessionExpires = now + BOARD_DEVICE_SESSION_SECONDS * 1000;
    this.state.storage.sql.exec(
      'UPDATE board_devices SET redeemed_at = ?, session_expires_at = ?, last_seen = ? WHERE id = ?',
      now,
      sessionExpires,
      now,
      row.id
    );
    return historyJson({
      success: true,
      already: false,
      device: { id: row.id, name: row.name, session_expires_at: sessionExpires },
    });
  }

  boardList() {
    const rows = this.state.storage.sql
      .exec(
        `SELECT id, name, created_at, link_expires_at, redeemed_at, session_expires_at, last_seen, revoked_at
         FROM board_devices ORDER BY created_at DESC`
      )
      .toArray();
    return historyJson({ success: true, devices: rows, count: rows.length });
  }

  async boardRevoke(request) {
    const body = await request.json().catch(() => ({}));
    const now = Date.now();
    if (body?.all) {
      this.state.storage.sql.exec(
        'UPDATE board_devices SET revoked_at = ? WHERE revoked_at IS NULL',
        now
      );
      return historyJson({ success: true, all: true });
    }
    const id = String(body?.id || '').trim();
    if (!id) return historyJson({ error: 'Missing id' }, 400);
    this.state.storage.sql.exec('UPDATE board_devices SET revoked_at = ? WHERE id = ?', now, id);
    return historyJson({ success: true, id });
  }

  boardStatus(url) {
    const id = String(url.searchParams.get('id') || '');
    if (!id) return historyJson({ valid: false });
    const now = Date.now();
    const row = this.state.storage.sql
      .exec('SELECT revoked_at, session_expires_at FROM board_devices WHERE id = ?', id)
      .toArray()[0];
    if (!row || row.revoked_at) return historyJson({ valid: false });
    if (row.session_expires_at && row.session_expires_at < now) return historyJson({ valid: false });
    this.state.storage.sql.exec(
      'UPDATE board_devices SET last_seen = ? WHERE id = ? AND (last_seen IS NULL OR last_seen < ?)',
      now,
      id,
      now - 5 * 60 * 1000
    );
    return historyJson({ valid: true });
  }

  async shareCreate(request) {
    const body = await request.json().catch(() => ({}));
    const vehicle = canonicalVehicleId(body?.vehicle) || '';
    const hours = Number(body?.hours);
    if (![1, 2, 4, 8, 24].includes(hours)) {
      return historyJson({ error: 'Choose 1, 2, 4, 8 or 24 hours' }, 400);
    }
    const now = Date.now();
    const token = toBase64Url(crypto.getRandomValues(new Uint8Array(9)));
    const expires = now + hours * 3600 * 1000;
    const sql = this.state.storage.sql;
    sql.exec('DELETE FROM share_links WHERE expires_at < ?', now - 24 * 60 * 60 * 1000);
    sql.exec(
      'INSERT OR REPLACE INTO share_links (token, vehicle_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      token,
      vehicle,
      now,
      expires
    );
    return historyJson({ success: true, token, vehicle, expires_at: expires });
  }

  shareResolve(url) {
    const token = String(url.searchParams.get('token') || '').trim();
    if (!token) return historyJson({ valid: false }, 404);
    const row = this.state.storage.sql
      .exec('SELECT * FROM share_links WHERE token = ?', token)
      .toArray()[0];
    if (!row) return historyJson({ valid: false }, 404);
    if (row.revoked_at) return historyJson({ valid: false, reason: 'revoked' }, 410);
    if (row.expires_at < Date.now()) return historyJson({ valid: false, reason: 'expired' }, 410);
    return historyJson({
      valid: true,
      vehicle_id: row.vehicle_id || '',
      expires_at: row.expires_at,
    });
  }

  isBlocked(id) {
    return Boolean(
      this.state.storage.sql
        .exec('SELECT 1 AS n FROM blocked_vehicles WHERE vehicle_id = ?', id)
        .toArray()[0]
    );
  }

  async purge(request) {
    const body = await request.json().catch(() => ({}));
    const id = canonicalVehicleId(body?.id);
    if (!id) return historyJson({ error: 'Missing id' }, 400);
    const now = Date.now();
    const sql = this.state.storage.sql;
    sql.exec('DELETE FROM history_points WHERE vehicle_id = ?', id);
    sql.exec('DELETE FROM history WHERE vehicle_id = ?', id);
    sql.exec('DELETE FROM history_stats WHERE vehicle_id = ?', id);
    sql.exec(
      `INSERT INTO blocked_vehicles (vehicle_id, blocked_at, reason) VALUES (?, ?, ?)
       ON CONFLICT(vehicle_id) DO UPDATE SET blocked_at = excluded.blocked_at, reason = excluded.reason`,
      id,
      now,
      'deleted forever'
    );
    const wasLive = this.fleet.delete(id);
    this.filters.delete(id);
    this.wsTrackerIds.delete(id);
    try {
      await this.state.storage.put('fleet_snapshot', Array.from(this.fleet.values()));
    } catch (e) {}
    this.broadcast({ type: 'remove', ids: [id], timestamp: now });
    try {
      sql.exec(
        'INSERT INTO history_audit (at, action, vehicle_id, detail, actor) VALUES (?, ?, ?, ?, ?)',
        now,
        'purge',
        id,
        'history + live + block',
        'admin'
      );
    } catch (e) {}
    return historyJson({ success: true, id, blocked: true, wasLive });
  }

  async unblock(request) {
    const body = await request.json().catch(() => ({}));
    const id = canonicalVehicleId(body?.id);
    if (!id) return historyJson({ error: 'Missing id' }, 400);
    this.state.storage.sql.exec('DELETE FROM blocked_vehicles WHERE vehicle_id = ?', id);
    try {
      this.state.storage.sql.exec(
        'INSERT INTO history_audit (at, action, vehicle_id, detail, actor) VALUES (?, ?, ?, ?, ?)',
        Date.now(),
        'unblock',
        id,
        '',
        'admin'
      );
    } catch (e) {}
    return historyJson({ success: true, id, blocked: false });
  }

  blockedList() {
    const rows = this.state.storage.sql
      .exec('SELECT vehicle_id AS id, blocked_at, reason FROM blocked_vehicles ORDER BY blocked_at DESC')
      .toArray();
    return historyJson({ success: true, blocked: rows, count: rows.length });
  }

  live() {
    return historyJson({      success: true,
      vehicles: this.getFleetSnapshot(),
      count: this.fleet.size,
      timestamp: Date.now(),
    });
  }

  writeRecord(record) {
    if (!record) return { success: false, skipped: 'empty' };
    const id = canonicalVehicleId(record.id);
    const lat = Number(record.lat);
    const lon = Number(record.lon);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return { success: false, skipped: 'invalid' };
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { success: false, skipped: 'invalid' };

    const now = Date.now();
    let deviceTime = Number(record.lastSeen ?? record.updatedAt ?? now);
    if (!Number.isFinite(deviceTime)) deviceTime = now;
    if (deviceTime < now - HISTORY_RETENTION_MS) return { success: false, skipped: 'too-old' };
    if (deviceTime > now + 5 * 60 * 1000) deviceTime = now;

    const speed = Number(record.speed);
    const bearing = Number(record.bearing);
    const accuracy = Number(record.accuracy);
    const battery = Number(record.batt ?? record.battery);

    this.state.storage.sql.exec(
      `INSERT OR IGNORE INTO history_points (
         vehicle_id, device_time, received_at, lat, lon, speed, bearing, accuracy, battery, raw_lat, raw_lon, altitude, charge
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      deviceTime,
      now,
      lat,
      lon,
      Number.isFinite(speed) ? speed : 0,
      Number.isFinite(bearing) ? bearing : 0,
      Number.isFinite(accuracy) ? accuracy : 0,
      Number.isFinite(battery) ? Math.round(battery) : null,
      Number.isFinite(Number(record.rawLat)) ? Number(record.rawLat) : lat,
      Number.isFinite(Number(record.rawLon)) ? Number(record.rawLon) : lon,
      Number.isFinite(Number(record.altitude)) ? Number(record.altitude) : 0,
      record.charge ? 1 : 0
    );

    const inserted = (this.state.storage.sql.exec('SELECT changes() AS n').toArray()[0]?.n || 0) > 0;
    if (inserted) {
      this.state.storage.sql.exec(
        `INSERT INTO history_stats (vehicle_id, last_seen, points) VALUES (?, ?, 1)
         ON CONFLICT(vehicle_id) DO UPDATE SET
           last_seen = MAX(last_seen, excluded.last_seen),
           points = points + 1`,
        id,
        deviceTime
      );
    } else {
      this.state.storage.sql.exec(
        'UPDATE history_stats SET last_seen = MAX(last_seen, ?) WHERE vehicle_id = ?',
        deviceTime,
        id
      );
    }
    return { success: true, id, deviceTime };
  }

  // Hourly retention. Alarms survive hibernation, so a cold start never
  // triggers a full-table prune.
  async alarm() {
    try {
      const cutoff = Date.now() - HISTORY_RETENTION_MS;
      const sql = this.state.storage.sql;
      const expired = sql
        .exec(
          'SELECT vehicle_id, COUNT(*) AS n FROM history_points WHERE device_time < ? GROUP BY vehicle_id',
          cutoff
        )
        .toArray();
      if (expired.length) {
        sql.exec('DELETE FROM history_points WHERE device_time < ?', cutoff);
        for (const row of expired) {
          sql.exec(
            'UPDATE history_stats SET points = MAX(0, points - ?) WHERE vehicle_id = ?',
            row.n,
            row.vehicle_id
          );
        }
      }
    } catch (e) {
      // A failed prune must not stop future alarms.
    } finally {
      await this.state.storage.setAlarm(Date.now() + HISTORY_PRUNE_INTERVAL_MS);
    }
  }

  webSocketMessage(ws, message) {
    const attachment = ws.deserializeAttachment?.() || {};
    if (attachment.role === 'tracker') {
      let raw = message;
      if (typeof raw !== 'string') {
        try { raw = new TextDecoder().decode(raw); } catch (e) { raw = ''; }
      }
      const packet = coerceTelemetryPacket(raw);
      if (!packet) return;
      const id = canonicalVehicleId(packet.id);
      if (!id) return;
      if (this.isBlocked(id)) {
        try { ws.send(JSON.stringify({ type: 'ack', id, skipped: 'blocked', timestamp: Date.now() })); } catch (e) {}
        return;
      }
      const existing = this.fleet.get(id) || {};
      let filter = this.filters.get(id);
      if (!filter) { filter = createKinematicFilter(); this.filters.set(id, filter); }
      const record = processTelemetryPacket(packet, { existing, filter, now: Date.now() });
      if (!record) return;
      this.fleet.set(record.id, record);
      this.wsTrackerIds.add(record.id);
      this.writeRecord(record);
      try { ws.serializeAttachment({ role: 'tracker', id: record.id }); } catch (e) {}
      this.broadcast({ type: 'delta', vehicle: { ...record, ...computeVehicleAgeState(record) } });
      this.persistSnapshotIfDue();
      try { ws.send(JSON.stringify({ type: 'ack', id: record.id, timestamp: Date.now() })); } catch (e) {}
      return;
    }

    try {
      const data = JSON.parse(message);
      if (data?.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      } else if (data?.type === 'subscribe') {
        ws.send(JSON.stringify({ type: 'snapshot', vehicles: this.getFleetSnapshot(), timestamp: Date.now() }));
      } else if (data?.type === 'track' && data.vehicle?.id) {
        const id = canonicalVehicleId(data.vehicle.id);
        if (!id) return;
        const stored = { ...data.vehicle, id, name: id };
        const previous = this.fleet.get(id);
        if (previous && Number(previous.lastSeen) > Number(stored.lastSeen)) return;
        this.fleet.set(id, stored);
        this.writeRecord(stored);
        this.broadcast({ type: 'delta', vehicle: { ...stored, ...computeVehicleAgeState(stored) } });
        this.persistSnapshotIfDue();
      }
    } catch (e) {
      if (message === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() })); } catch (err) {}
      }
    }
  }

  webSocketClose(ws, code, reason, wasClean) {
    const attachment = ws.deserializeAttachment?.() || {};
    if (attachment.role === 'tracker' && attachment.id) this.wsTrackerIds.delete(String(attachment.id));
    try { ws.close(code, 'Hub closing connection'); } catch (e) {}
  }

  webSocketError(ws, error) {
    try { ws.close(1011, 'Hub socket error'); } catch (e) {}
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      const role = ws.deserializeAttachment?.()?.role;
      if (role === 'tracker') continue;
      try { ws.send(payload); } catch (e) {}
    }
  }

  getFleetSnapshot() {
    const now = Date.now();
    return Array.from(this.fleet.values()).map((record) => ({ ...record, ...computeVehicleAgeState(record, now) }));
  }

  persistSnapshotIfDue() {
    const now = Date.now();
    if (now - this.lastSnapshotAt < HUB_PERSIST_INTERVAL_MS) return;
    this.lastSnapshotAt = now;
    const snapshot = Array.from(this.fleet.values());
    if (this.state.waitUntil) this.state.waitUntil(this.state.storage.put('fleet_snapshot', snapshot));
    else this.state.storage.put('fleet_snapshot', snapshot).catch(() => {});
  }

  clearLive() {
    this.fleet.clear();
    this.filters.clear();
    this.wsTrackerIds.clear();
    this.broadcast({ type: 'clear', timestamp: Date.now() });
    if (this.state.waitUntil) this.state.waitUntil(this.state.storage.put('fleet_snapshot', []));
    return historyJson({ success: true, count: 0 });
  }

  async removeLive(request) {
    let ids = [];
    try {
      const body = await request.json();
      if (body?.id) ids.push(body.id);
      if (Array.isArray(body?.ids)) ids.push(...body.ids);
    } catch (e) {
      ids = new URL(request.url).searchParams.getAll('id');
    }
    ids = Array.from(new Set(ids.map(canonicalVehicleId).filter(Boolean)));
    const removed = [];
    for (const id of ids) {
      if (this.fleet.delete(id)) removed.push(id);
      this.filters.delete(id);
      this.wsTrackerIds.delete(id);
    }
    if (removed.length) {
      await this.state.storage.put('fleet_snapshot', Array.from(this.fleet.values()));
      this.broadcast({ type: 'remove', ids: removed, timestamp: Date.now() });
    }
    return historyJson({ success: true, removed, count: this.fleet.size });
  }

  async write(request) {
    const record = await request.json().catch(() => null);
    if (!record) return historyJson({ error: 'Invalid body' }, 400);
    const result = this.writeRecord(record);
    if (!result.success && result.skipped === 'invalid') return historyJson({ error: 'Invalid vehicle' }, 400);
    return historyJson(result);
  }

  vehicles() {
    const rows = this.state.storage.sql
      .exec(
        `SELECT vehicle_id AS id, last_seen, points
         FROM history_stats
         WHERE points > 0
         ORDER BY last_seen DESC`
      )
      .toArray();
    return historyJson({ success: true, vehicles: rows, count: rows.length });
  }

  reportPoints(url) {
    const id = canonicalVehicleId(url.searchParams.get('id'));
    if (!id) return null;
    const now = Date.now();
    const from = Number(url.searchParams.get('from') || now - HISTORY_RETENTION_MS);
    const to = Number(url.searchParams.get('to') || now);
    return this.state.storage.sql
      .exec(
        `SELECT device_time, lat, lon, speed, accuracy
         FROM history_points
         WHERE vehicle_id = ? AND device_time >= ? AND device_time <= ?
         ORDER BY device_time ASC LIMIT 100000`,
        id, from, to
      )
      .toArray();
  }

  reportTrips(url) {
    const points = this.reportPoints(url);
    if (!points) return historyJson({ error: 'Missing id' }, 400);
    const analysis = analyzeHistory(points);
    return historyJson({ success: true, trips: analysis.trips, count: analysis.trips.length, points: analysis.points });
  }

  reportStops(url) {
    const points = this.reportPoints(url);
    if (!points) return historyJson({ error: 'Missing id' }, 400);
    const analysis = analyzeHistory(points);
    return historyJson({ success: true, stops: analysis.stops, count: analysis.stops.length, points: analysis.points });
  }

  reportSummary(url) {
    const points = this.reportPoints(url);
    if (!points) return historyJson({ error: 'Missing id' }, 400);
    const analysis = analyzeHistory(points);
    const rows = summarizeHistoryDays(analysis);
    return historyJson({ success: true, days: rows, count: rows.length, points: analysis.points });
  }

  reportAll(url) {
    const points = this.reportPoints(url);
    if (!points) return historyJson({ error: 'Missing id' }, 400);
    const analysis = analyzeHistory(points);
    const days = summarizeHistoryDays(analysis);
    return historyJson({
      success: true,
      days,
      trips: analysis.trips,
      stops: analysis.stops,
      points: analysis.points,
    });
  }

  history(url) {
    const id = canonicalVehicleId(url.searchParams.get('id'));
    if (!id) return historyJson({ error: 'Missing id' }, 400);

    const now = Date.now();
    const from = Number(url.searchParams.get('from') || now - HISTORY_RETENTION_MS);
    const to = Number(url.searchParams.get('to') || now);
    const limit = Math.min(
      100000,
      Math.max(1, Number(url.searchParams.get('limit') || 100000))
    );

    const points = this.state.storage.sql
      .exec(
        `SELECT device_time, received_at, lat, lon, speed, bearing, accuracy, battery, raw_lat, raw_lon, altitude, charge
         FROM history_points
         WHERE vehicle_id = ? AND device_time >= ? AND device_time <= ?
         ORDER BY device_time ASC
         LIMIT ?`,
        id,
        Number.isFinite(from) ? from : now - HISTORY_RETENTION_MS,
        Number.isFinite(to) ? to : now,
        limit
      )
      .toArray();

    // Compute the reports from the same rows the map needs. Previously the UI
    // fetched /reports/all too, which scanned the identical range a second time.
    const analysis = analyzeHistory(points);
    const days = summarizeHistoryDays(analysis);

    const MAX_MAP_POINTS = 7000;
    let out = points;
    if (points.length > MAX_MAP_POINTS) {
      const step = Math.ceil(points.length / MAX_MAP_POINTS);
      out = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    }
    return historyJson({
      success: true,
      id,
      from,
      to,
      count: out.length,
      total: points.length,
      downsampled: out.length !== points.length,
      points: out,
      days,
      trips: analysis.trips,
      stops: analysis.stops,
    });
  }

  async remove(request) {
    const body = await request.json().catch(() => ({}));
    const all = Boolean(body.all);
    const id = canonicalVehicleId(body.id);
    const from = Number(body.from);
    const to = Number(body.to);

    if (!all && !id) return historyJson({ error: 'Missing id' }, 400);

    if (all) {
      this.state.storage.sql.exec('DELETE FROM history_points');
      this.state.storage.sql.exec('DELETE FROM history');
      this.state.storage.sql.exec('DELETE FROM history_stats');
    } else if (id && Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > 0) {
      this.state.storage.sql.exec('DELETE FROM history_points WHERE vehicle_id = ? AND device_time BETWEEN ? AND ?', id, from, to);
      this.state.storage.sql.exec('DELETE FROM history WHERE vehicle_id = ? AND device_time BETWEEN ? AND ?', id, from, to);
      const row = this.state.storage.sql
        .exec('SELECT MAX(device_time) AS last_seen, COUNT(*) AS points FROM history_points WHERE vehicle_id = ?', id)
        .toArray()[0];
      if (row?.points) {
        this.state.storage.sql.exec(
          'INSERT OR REPLACE INTO history_stats (vehicle_id, last_seen, points) VALUES (?, ?, ?)',
          id,
          row.last_seen,
          row.points
        );
      } else {
        this.state.storage.sql.exec('DELETE FROM history_stats WHERE vehicle_id = ?', id);
      }
    } else {
      this.state.storage.sql.exec('DELETE FROM history_points WHERE vehicle_id = ?', id);
      this.state.storage.sql.exec('DELETE FROM history WHERE vehicle_id = ?', id);
      this.state.storage.sql.exec('DELETE FROM history_stats WHERE vehicle_id = ?', id);
    }

    this.state.storage.sql.exec(
      `INSERT INTO history_audit (at, action, vehicle_id, detail, actor)
       VALUES (?, ?, ?, ?, ?)`,
      Date.now(),
      'delete',
      all ? '*' : id,
      JSON.stringify({ all, from: Number.isFinite(from) ? from : null, to: Number.isFinite(to) ? to : null }),
      'admin'
    );

    return historyJson({ success: true, deleted: all ? 'all' : id });
  }

  async audit(request) {
    const body = await request.json().catch(() => ({}));
    this.state.storage.sql.exec(
      `INSERT INTO history_audit (at, action, vehicle_id, detail, actor)
       VALUES (?, ?, ?, ?, ?)`,
      Date.now(),
      String(body.action || 'event'),
      String(body.vehicleId || ''),
      String(body.detail || ''),
      String(body.actor || '')
    );
    return historyJson({ success: true });
  }
}
