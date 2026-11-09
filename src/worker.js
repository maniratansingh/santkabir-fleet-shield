// Cloudflare Pages Advanced Mode Worker: _worker.js
// Handles /api/location and /api/vehicles serverless endpoints + serves static assets
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Production Clean: 0 Mock Data. Dynamic live telemetry only.

import { createKinematicFilter } from './utils/kalman.js';
import { coerceTelemetryPacket, processTelemetryPacket } from './utils/telemetryProcessor.js';

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

      const vehId = String(id).trim().toUpperCase();
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

    // 3. Endpoint: /api/vehicles (Returns dynamically registered live fleet)
    if (url.pathname === '/api/vehicles' || url.pathname === '/api/vehicles/') {
      // 3-Stage Rural Lifecycle: Live (<60s) -> Signal Gap (1m - 15m) -> Parked (15m - 35m) -> Decommission (>35m)
      const now = Date.now();
      const DECOMMISSION_TIMEOUT_MS = 35 * 60 * 1000; // 35 minutes

      for (const [vKey, vVal] of liveVehicles.entries()) {
        const lastSeen = vVal.updatedAt || vVal.lastSeen || 0;
        if (now - lastSeen > DECOMMISSION_TIMEOUT_MS) {
          liveVehicles.delete(vKey);
          vehicleFilters.delete(vKey);
          lastHubForward.delete(vKey);
        }
      }

      const reportedList = Array.from(liveVehicles.values()).map(vVal => {
        const lastSeen = vVal.updatedAt || vVal.lastSeen || 0;
        const ageSec = Math.max(0, Math.floor((now - lastSeen) / 1000));
        const gapMinutes = Math.floor(ageSec / 60);

        const isLive = ageSec < 60;
        const isSignalGap = ageSec >= 60 && ageSec <= 15 * 60;
        const isParked = ageSec > 15 * 60;

        return {
          ...vVal,
          ageSec,
          gapMinutes,
          isLive,
          isSignalGap,
          isParked,
          networkState: isLive ? 'live' : (isSignalGap ? 'gap' : 'parked'),
        };
      });

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
  constructor(state, env) {
    this.state = state;
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
        this.vehicles = new Map(saved.filter(v => v && v.id).map(v => [String(v.id), v]));
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
      this.state.acceptWebSocket(server);
      try { server.serializeAttachment({ role }); } catch (e) {}

      try {
        if (role === 'dashboard') {
          server.send(JSON.stringify({
            type: 'snapshot',
            vehicles: Array.from(this.vehicles.values()),
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
        if (record && record.id && !this.wsTrackerIds.has(String(record.id))) {
          this.vehicles.set(String(record.id), record);
          this.broadcast({ type: 'delta', vehicle: record });
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
        vehicles: Array.from(this.vehicles.values()),
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

      const id = String(packet.id || '').trim().toUpperCase();
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
      try { ws.serializeAttachment({ role: 'tracker', id: record.id }); } catch (e) {}
      this.broadcast({ type: 'delta', vehicle: record });
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
          vehicles: Array.from(this.vehicles.values()),
          timestamp: Date.now(),
        }));
      } else if (data?.type === 'track' && data.vehicle?.id) {
        this.vehicles.set(String(data.vehicle.id), data.vehicle);
        this.broadcast({ type: 'delta', vehicle: data.vehicle });
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

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      const role = ws.deserializeAttachment?.()?.role;
      if (role === 'tracker') continue;
      try { ws.send(payload); } catch (e) {}
    }
  }

  persistSnapshotIfDue() {
    const now = Date.now();
    if (now - this.lastSnapshotAt < 60000) return;
    this.lastSnapshotAt = now;
    const snapshot = Array.from(this.vehicles.values());
    if (this.state.waitUntil) {
      this.state.waitUntil(this.state.storage.put('fleet_snapshot', snapshot));
    } else {
      this.state.storage.put('fleet_snapshot', snapshot).catch(() => {});
    }
  }
}
