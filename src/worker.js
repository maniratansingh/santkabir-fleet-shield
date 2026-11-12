// Cloudflare Pages Advanced Mode Worker: _worker.js
// Handles /api/location and /api/vehicles serverless endpoints + serves static assets
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Production Clean: 0 Mock Data. Dynamic live telemetry only.

import { createKinematicFilter } from './utils/kalman.js';
import { coerceTelemetryPacket, processTelemetryPacket } from './utils/telemetryProcessor.js';
import { canonicalVehicleId } from './utils/vehicleId.js';
import { computeVehicleAgeState } from './utils/vehicleState.js';

// In-memory telemetry cache for active fleet ambulances
const liveVehicles = new Map();

// Per-vehicle GPS noise filters. Kept separate from the public record so the
// raw covariance state is never serialized to the dashboard.
const vehicleFilters = new Map();

// Durable Object hub forwarding. HTTP trackers are throttled so the free
// Workers Free / Durable Objects request quota is not exhausted. Trackers that
// move to the WebSocket path get immediate updates without this throttle.
const HUB_NAME = 'purvanchal-fleet';
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
const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const HISTORY_SLOTS = Math.ceil(HISTORY_RETENTION_MS / HISTORY_BUCKET_MS); // 20,160
const HISTORY_PASSWORD_SALT = 'mQ7B7fLda1aEC-GS4-oOIQ';
const HISTORY_PASSWORD_HASH = 'NhEnOhRT75TkiWp-ntanopnnRUL2NXzJFJZZsGL8PwA';
const HISTORY_PASSWORD_ITERATIONS = 100000;
const historyLoginAttempts = new Map();

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

function historyStub(env) {
  if (!env.HISTORY_DB) return null;
  return env.HISTORY_DB.get(env.HISTORY_DB.idFromName(HISTORY_NAME));
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
            if (body.timestamp) timestamp = new Date(body.timestamp).getTime() || Date.now();
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

      // Store in edge memory cache
      liveVehicles.set(vehId, record);

      // Write to the separate history store. This is intentionally async:
      // a history failure must never delay or block the live response.
      if (env.HISTORY_DB) {
        const historyPush = writeHistory(env, record);
        if (ctx?.waitUntil) ctx.waitUntil(historyPush);
      }

      // Mirror the processed record into the global Durable Object hub.
      // HTTP ingestion is throttled to one forward per vehicle per 30 s so the
      // free DO request quota is not exhausted. WebSocket trackers bypass this.
      if (env.FLEET_HUB) {
        const nowMs = Date.now();
        const lastForward = lastHubForward.get(vehId) || 0;
        if (nowMs - lastForward >= HUB_FORWARD_INTERVAL_MS) {
          lastHubForward.set(vehId, nowMs);
          const hubPush = env.FLEET_HUB
            .get(env.FLEET_HUB.idFromName(HUB_NAME))
            .fetch('https://fleet-hub/track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(record),
            })
            .catch(() => null);
          if (ctx?.waitUntil) ctx.waitUntil(hubPush);
        }
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
      const now = Date.now();

      const reportedList = Array.from(liveVehicles.values()).map(vVal => ({
        ...vVal,
        ...computeVehicleAgeState(vVal, now),
      }));

      // Clean Live Telemetry Mode: Return reported live telemetry (0 dummy data)
      const list = reportedList;

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

    // 5. Fallback: Serve static assets with strict Zero-Cache for HTML & Live App
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html');

    if (isHtml) {
      const freshHeaders = new Headers(assetResponse.headers);
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

// Separate history store. One SQLite-backed Durable Object with a fixed
// 7-day, 30-minute ring buffer. It never blocks the live telemetry path.
export class FleetHistory {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.state = ctx;
    this.env = env;

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
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/write') && request.method === 'POST') {
      return this.write(request);
    }
    if (url.pathname.endsWith('/vehicles')) {
      return this.vehicles();
    }
    if (url.pathname.endsWith('/history')) {
      return this.history(url);
    }
    if (url.pathname.endsWith('/delete') && request.method === 'POST') {
      return this.remove(request);
    }
    if (url.pathname.endsWith('/audit') && request.method === 'POST') {
      return this.audit(request);
    }

    return historyJson({ error: 'Not found' }, 404);
  }

  async write(request) {
    const record = await request.json().catch(() => null);
    if (!record) return historyJson({ error: 'Invalid body' }, 400);

    const id = canonicalVehicleId(record.id);
    const lat = Number(record.lat);
    const lon = Number(record.lon);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return historyJson({ error: 'Invalid vehicle' }, 400);
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return historyJson({ error: 'Invalid coordinates' }, 400);
    }

    const now = Date.now();
    let deviceTime = Number(record.lastSeen ?? record.updatedAt ?? now);
    if (!Number.isFinite(deviceTime)) deviceTime = now;

    // Drop a backlog older than the ring window. A future clock is clamped to
    // server time so a bad device clock cannot poison the ring.
    if (deviceTime < now - HISTORY_RETENTION_MS) {
      return historyJson({ success: true, skipped: 'too-old' });
    }
    if (deviceTime > now + 5 * 60 * 1000) deviceTime = now;

    const slot = Math.floor(deviceTime / HISTORY_BUCKET_MS) % HISTORY_SLOTS;
    const speed = Number(record.speed);
    const bearing = Number(record.bearing);
    const accuracy = Number(record.accuracy);
    const battery = Number(record.batt);

    this.state.storage.sql.exec(
      `INSERT INTO history (
         vehicle_id, slot, device_time, received_at,
         lat, lon, speed, bearing, accuracy, battery
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(vehicle_id, slot) DO UPDATE SET
         device_time = excluded.device_time,
         received_at = excluded.received_at,
         lat = excluded.lat,
         lon = excluded.lon,
         speed = excluded.speed,
         bearing = excluded.bearing,
         accuracy = excluded.accuracy,
         battery = excluded.battery
       WHERE excluded.device_time >= history.device_time`,
      id,
      slot,
      deviceTime,
      now,
      lat,
      lon,
      Number.isFinite(speed) ? speed : 0,
      Number.isFinite(bearing) ? bearing : 0,
      Number.isFinite(accuracy) ? accuracy : 0,
      Number.isFinite(battery) ? Math.round(battery) : null
    );

    return historyJson({ success: true, id, slot, deviceTime });
  }

  vehicles() {
    const rows = this.state.storage.sql
      .exec(
        `SELECT vehicle_id AS id,
                MAX(device_time) AS last_seen,
                COUNT(*) AS points
         FROM history
         GROUP BY vehicle_id
         ORDER BY last_seen DESC`
      )
      .toArray();
    return historyJson({ success: true, vehicles: rows, count: rows.length });
  }

  history(url) {
    const id = canonicalVehicleId(url.searchParams.get('id'));
    if (!id) return historyJson({ error: 'Missing id' }, 400);

    const now = Date.now();
    const from = Number(url.searchParams.get('from') || now - HISTORY_RETENTION_MS);
    const to = Number(url.searchParams.get('to') || now);
    const limit = Math.min(
      25000,
      Math.max(1, Number(url.searchParams.get('limit') || 25000))
    );

    const points = this.state.storage.sql
      .exec(
        `SELECT device_time, received_at, lat, lon, speed, bearing, accuracy, battery
         FROM history
         WHERE vehicle_id = ? AND device_time >= ? AND device_time <= ?
         ORDER BY device_time ASC
         LIMIT ?`,
        id,
        Number.isFinite(from) ? from : now - HISTORY_RETENTION_MS,
        Number.isFinite(to) ? to : now,
        limit
      )
      .toArray();

    return historyJson({
      success: true,
      id,
      from,
      to,
      count: points.length,
      points,
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
      this.state.storage.sql.exec('DELETE FROM history');
    } else if (id && Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > 0) {
      this.state.storage.sql.exec(
        'DELETE FROM history WHERE vehicle_id = ? AND device_time BETWEEN ? AND ?',
        id,
        from,
        to
      );
    } else {
      this.state.storage.sql.exec('DELETE FROM history WHERE vehicle_id = ?', id);
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
