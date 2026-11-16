import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Moon,
  Sun,
  RefreshCw,
  Route,
  ShieldCheck,
  X,
} from 'lucide-react';
import AppleRangePicker from './AppleRangePicker';
import { DAY_MS, MAX_RANGE_MS, fromLocalInput, toLocalInput } from './dateRange';
import { getUniqueVehicleColor } from '../utils/colors';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const BASE = { lat: 26.797313, lon: 82.718401 };
const TZ_OFFSET = 5.5 * 60 * 60 * 1000;
const TRIP_COLORS = ['#38bdf8', '#30d158', '#ffd60a', '#ff9f0a', '#bf5af2', '#64d2ff'];
const QUALITY_COLOR = { clean: '#30d158', good: '#ffd60a', bad: '#ff453a' };

const DARK_STYLE = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'esri-dark-base': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16, attribution: 'Esri, HERE, Garmin' },
    'esri-dark-labels': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16 },
  },
  layers: [
    { id: 'base', type: 'raster', source: 'esri-dark-base', paint: { 'raster-fade-duration': 0 } },
    { id: 'labels', type: 'raster', source: 'esri-dark-labels', paint: { 'raster-fade-duration': 0 } },
  ],
};

const LIGHT_STYLE = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'esri-light-base': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16, attribution: 'Esri, HERE, Garmin' },
    'esri-light-labels': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16 },
  },
  layers: [
    { id: 'base', type: 'raster', source: 'esri-light-base', paint: { 'raster-fade-duration': 0 } },
    { id: 'labels', type: 'raster', source: 'esri-light-labels', paint: { 'raster-fade-duration': 0 } },
  ],
};

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmt(ts) {
  if (!ts) return '—';
  return new Date(Number(ts)).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDate(ts) {
  return new Date(Number(ts)).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
}
function fmtFull(ts) {
  return new Date(Number(ts)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}
function median(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function pct(list, p) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
function gapThreshold(arr) {
  const ds = [];
  for (let i = 1; i < arr.length; i++) {
    const dt = (arr[i].device_time - arr[i - 1].device_time) / 1000;
    if (dt > 0) ds.push(dt);
  }
  if (!ds.length) return 90;
  return Math.max(90, median(ds) * 2.5);
}

function buildTrips(points, gapMs = 15 * 60000) {
  if (!points.length) return [];
  const dayKey = (t) => Math.floor((Number(t) + TZ_OFFSET) / 86400000);
  const groups = [];
  let current = [];
  let prev = null;
  for (const p of points) {
    const day = dayKey(p.device_time);
    if (current.length && prev && (Number(p.device_time) - Number(prev.device_time) > gapMs || dayKey(prev.device_time) !== day)) {
      groups.push(current);
      current = [];
    }
    current.push(p);
    prev = p;
  }
  if (current.length) groups.push(current);

  return groups.map((arr, index) => {
    const first = arr[0];
    const last = arr[arr.length - 1];
    let distance = 0;
    let movingMs = 0;
    const intervals = [];
    const accs = [];
    for (let i = 1; i < arr.length; i++) {
      const dt = Number(arr[i].device_time) - Number(arr[i - 1].device_time);
      if (dt > 0) intervals.push(dt / 1000);
      if (dt > 0 && dt <= gapMs) {
        const d = haversine([arr[i - 1].lon, arr[i - 1].lat], [arr[i].lon, arr[i].lat]);
        distance += d;
        if (Number(arr[i].speed) > 3) movingMs += dt;
      }
    }
    arr.forEach((p) => { const a = Number(p.accuracy); if (Number.isFinite(a) && a > 0) accs.push(a); });
    const med = median(accs);
    const quality = med > 50 ? 'bad' : med > 20 ? 'good' : 'clean';
    return {
      index,
      points: arr,
      start: Number(first.device_time),
      end: Number(last.device_time),
      distance,
      movingMs,
      medianInterval: median(intervals),
      medianAccuracy: Math.round(med),
      quality,
      color: TRIP_COLORS[index % TRIP_COLORS.length],
    };
  });
}

function tripRuns(trip) {
  const limit = gapThreshold(trip.points) * 1000;
  const runs = [];
  let run = [];
  let prev = null;
  for (const p of trip.points) {
    if (prev && Number(p.device_time) - Number(prev.device_time) > limit) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
    run.push([Number(p.lon), Number(p.lat)]);
    prev = p;
  }
  if (run.length > 1) runs.push(run);
  return runs;
}


function bearingBetween(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function smoothCoords(coords, iterations = 2) {
  let out = coords;
  for (let k = 0; k < iterations; k++) {
    if (out.length < 3) return out;
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      const b = out[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

function speedColorFor(v) {
  if (v < 10) return '#38bdf8';
  if (v < 25) return '#30d158';
  if (v < 45) return '#ffd60a';
  return '#ff453a';
}

function positionAt(arr, t) {
  if (!arr.length) return null;
  if (t <= arr[0].t) return { ...arr[0], bearing: 0 };
  if (t >= arr[arr.length - 1].t) return { ...arr[arr.length - 1], bearing: 0 };
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].t >= t) {
      const a = arr[i - 1];
      const b = arr[i];
      const span = b.t - a.t || 1;
      const f = Math.max(0, Math.min(1, (t - a.t) / span));
      return {
        lon: a.lon + (b.lon - a.lon) * f,
        lat: a.lat + (b.lat - a.lat) * f,
        speed: a.speed + (b.speed - a.speed) * f,
        bearing: bearingBetween([a.lon, a.lat], [b.lon, b.lat]),
      };
    }
  }
  return arr[arr.length - 1];
}

function nearestByTime(arr, t) {
  if (!arr.length) return null;
  let best = arr[0];
  let bd = Infinity;
  for (const p of arr) {
    const d = Math.abs(p.t - t);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function convexHull(coords) {
  if (coords.length < 3) return coords;
  const pts = [...coords].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function prepareTrail(points, trips) {
  const sorted = points
    .filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && Number(p.lat) !== 0 && Number(p.lon) !== 0)
    .map((p) => ({ ...p, lon: Number(p.lon), lat: Number(p.lat), t: Number(p.device_time), speed: Number(p.speed) || 0, accuracy: Number(p.accuracy) || 0 }))
    .sort((a, b) => a.t - b.t);

  /* drop spikes: a jump that implies an impossible speed */
  const clean = [];
  for (const p of sorted) {
    const prev = clean[clean.length - 1];
    if (prev) {
      const dt = (p.t - prev.t) / 1000;
      const d = haversine([prev.lon, prev.lat], [p.lon, p.lat]);
      const implied = dt > 0 ? (d / dt) * 3.6 : 0;
      if (dt > 0 && d > 1.2 && implied > 180) continue;
      if (dt <= 0) continue;
    }
    clean.push(p);
  }

  /* collapse parked jitter into stop bubbles */
  const stops = [];
  const stopWindows = [];
  let cluster = [];
  const flush = () => {
    if (cluster.length > 1) {
      const first = cluster[0];
      const last = cluster[cluster.length - 1];
      const minutes = (last.t - first.t) / 60000;
      const cLon = cluster.reduce((s, p) => s + p.lon, 0) / cluster.length;
      const cLat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
      const spread = Math.max(...cluster.map((p) => haversine([cLon, cLat], [p.lon, p.lat]) * 1000));
      if (minutes >= 8 && spread <= 250) {
        stops.push({ lon: cLon, lat: cLat, start: first.t, end: last.t, minutes, points: cluster.length });
        stopWindows.push([first.t, last.t]);
      }
    }
    cluster = [];
  };
  for (const p of clean) {
    if (!cluster.length) { cluster = [p]; continue; }
    const cLon = cluster.reduce((s, q) => s + q.lon, 0) / cluster.length;
    const cLat = cluster.reduce((s, q) => s + q.lat, 0) / cluster.length;
    if (haversine([cLon, cLat], [p.lon, p.lat]) * 1000 <= 220) cluster.push(p);
    else { flush(); cluster = [p]; }
  }
  flush();

  const mergedStops = [];
  for (const s of stops) {
    const near = mergedStops.find((m) => haversine([m.lon, m.lat], [s.lon, s.lat]) * 1000 < 300 && s.start - m.end < 30 * 60000);
    if (near) {
      const total = near.points + s.points;
      near.lon = (near.lon * near.points + s.lon * s.points) / total;
      near.lat = (near.lat * near.points + s.lat * s.points) / total;
      near.points = total;
      near.end = s.end;
      near.minutes = (near.end - near.start) / 60000;
    } else {
      mergedStops.push({ ...s });
    }
  }

  const inStop = (t) => stopWindows.some(([a, b]) => t >= a && t <= b);
  const moving = clean.filter((p) => !inStop(p.t));

  const intervals = [];
  for (let i = 1; i < clean.length; i++) {
    const dt = (clean[i].t - clean[i - 1].t) / 1000;
    if (dt > 0) intervals.push(dt);
  }
  const gapMs = Math.max(10 * 60000, median(intervals) * 2.5 * 1000);

  const rawRuns = [];
  let run = [];
  let prev = null;
  for (const p of moving) {
    if (prev && p.t - prev.t > gapMs) {
      if (run.length > 1) rawRuns.push(run);
      run = [];
    }
    run.push(p);
    prev = p;
  }
  if (run.length > 1) rawRuns.push(run);

  const runs = rawRuns.map((arr) => {
    const trip = trips.find((t) => arr[0].t >= t.start - 60000 && arr[0].t <= t.end + 60000);
    return {
      coords: smoothCoords(arr.map((p) => [p.lon, p.lat]), 2),
      trip: trip ? trip.index : 0,
      start: arr[0].t,
      end: arr[arr.length - 1].t,
    };
  });

  const arrows = [];
  runs.forEach((r) => {
    const step = Math.max(6, Math.floor(r.coords.length / 8));
    for (let i = step; i < r.coords.length - step; i += step) {
      arrows.push({ coord: r.coords[i], bearing: bearingBetween(r.coords[i - 1], r.coords[i + 1]) });
    }
  });

  const caps = [];
  for (let i = 1; i < clean.length; i++) {
    if (clean[i].t - clean[i - 1].t > gapMs) {
      caps.push([clean[i - 1].lon, clean[i - 1].lat]);
      caps.push([clean[i].lon, clean[i].lat]);
    }
  }

  return { clean, stops: mergedStops, runs, arrows, caps, gapMs };
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export default function HistoryAppV2() {
  const [authed, setAuthed] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('sk_history_theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });

  const [vehicles, setVehicles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [preset, setPreset] = useState('24h');
  const [rangeLabel, setRangeLabel] = useState('Last 24 hours');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [appliedFrom, setAppliedFrom] = useState(0);
  const [appliedTo, setAppliedTo] = useState(0);

  const [mode, setMode] = useState('maps');
  const [quality, setQuality] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [speedColor, setSpeedColor] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(0);
  const [follow, setFollow] = useState(true);
  const [reportTab, setReportTab] = useState('map');
  const [reports, setReports] = useState({ summary: [], trips: [], stops: [] });
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [rangeOpen, setRangeOpen] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const movingMarkerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const trips = useMemo(() => {
    if (reports.trips.length) {
      return reports.trips.map((t, i) => ({
        index: Number.isFinite(t.index) ? t.index : i,
        start: t.startTime,
        end: t.endTime,
        distance: (t.distanceKm || 0) * 1000,
        movingMs: (t.movingMin || 0) * 60000,
        quality: t.quality || 'clean',
        medianAccuracy: t.medianAccuracy || 0,
        points: [],
      }));
    }
    return buildTrips(points);
  }, [reports.trips, points]);
  const prepared = useMemo(() => prepareTrail(points, trips), [points, trips]);
  const viewMode = advanced ? mode : 'trips';
  const confidence = useMemo(() => {
    const ints = [];
    const accs = [];
    for (let i = 1; i < prepared.clean.length; i++) {
      const dt = prepared.clean[i].t - prepared.clean[i - 1].t;
      if (dt > 0) ints.push(dt / 1000);
    }
    prepared.clean.forEach((p) => { if (p.accuracy > 0) accs.push(p.accuracy); });
    const medInt = median(ints);
    const medAcc = median(accs);
    const hull = convexHull(prepared.clean.map((p) => [p.lon, p.lat]));
    let area = 0;
    if (hull.length > 2) {
      let sum = 0;
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        sum += a[0] * b[1] - b[0] * a[1];
      }
      const lat = prepared.clean.reduce((s, p) => s + p.lat, 0) / prepared.clean.length;
      area = Math.abs(sum / 2) * (111.32 * 111.32 * Math.cos(rad(lat)));
    }
    const reportKm = reports.trips.reduce((s, t) => s + (t.distanceKm || 0), 0);
    return { low: medInt >= 300 || (medAcc >= 60 && reportKm < 5), medInt, medAcc, area };
  }, [prepared, reports]);
  const selected = vehicles.find((v) => v.id === selectedId);
  const vehicleColor = selectedId ? getUniqueVehicleColor(selectedId).line : '#38bdf8';

  const stats = useMemo(() => {
    if (!prepared.clean.length) return { km: 0, moving: 0, stops: 0, interval: 0, accuracy: 0, badPct: 0, avgSpeed: 0, maxSpeed: 0 };
    let distance = 0;
    let movingMs = 0;
    const intervals = [];
    const accs = [];
    const speeds = [];
    for (let i = 1; i < prepared.clean.length; i++) {
      const dt = prepared.clean[i].t - prepared.clean[i - 1].t;
      if (dt > 0) intervals.push(dt / 1000);
      if (dt > 0 && dt <= 15 * 60000) {
        distance += haversine([prepared.clean[i - 1].lon, prepared.clean[i - 1].lat], [prepared.clean[i].lon, prepared.clean[i].lat]);
        if (Number(prepared.clean[i].speed) > 3) movingMs += dt;
        if (Number(prepared.clean[i].speed) > 0) speeds.push(Number(prepared.clean[i].speed));
      }
    }
    prepared.clean.forEach((p) => { const a = Number(p.accuracy); if (Number.isFinite(a) && a > 0) accs.push(a); });
    const bad = accs.filter((a) => a > 50).length;
    let stopCount = 0;
    let lowRun = null;
    for (const p of points) {
      if (Number(p.speed) < 3) {
        if (lowRun === null) lowRun = Number(p.device_time);
      } else {
        if (lowRun !== null && Number(p.device_time) - lowRun >= 5 * 60000) stopCount += 1;
        lowRun = null;
      }
    }
    if (lowRun !== null && Number(points[points.length - 1]?.device_time) - lowRun >= 5 * 60000) stopCount += 1;
    const useServer = reports.trips.length > 0;
    const serverKm = reports.trips.reduce((s, t) => s + (t.distanceKm || 0), 0);
    const serverMoving = reports.trips.reduce((s, t) => s + (t.movingMin || 0) * 60000, 0);
    const serverMax = reports.trips.reduce((s, t) => Math.max(s, t.maxSpeed || 0), 0);
    return {
      km: useServer ? serverKm : distance / 1000,
      moving: useServer ? serverMoving : movingMs,
      stops: reports.stops.length,
      avgSpeed: (useServer ? serverMoving : movingMs) > 0 ? (useServer ? serverKm : distance / 1000) / ((useServer ? serverMoving : movingMs) / 3600000) : 0,
      maxSpeed: useServer ? serverMax : (speeds.length ? Math.max(...speeds) : 0),
      interval: median(intervals),
      accuracy: Math.round(median(accs)),
      badPct: accs.length ? Math.round((bad / accs.length) * 100) : 0,
    };
  }, [prepared]);

  /* theme */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    try { localStorage.setItem('sk_history_theme', theme); } catch {}
  }, [theme]);

  /* range init */
  useEffect(() => {
    const to = Date.now();
    const from = to - DAY_MS;
    setFromInput(toLocalInput(from));
    setToInput(toLocalInput(to));
    setAppliedFrom(from);
    setAppliedTo(to);
    setPreset('24h');
    setRangeLabel('Last 24 hours');
  }, []);

  const loadVehicles = useCallback(async () => {
    setError('');
    try {
      const data = await api('/api/history/vehicles');
      const list = Array.isArray(data.vehicles) ? data.vehicles : [];
      setVehicles(list);
      setAuthed(true);
      setSelectedId((cur) => (cur && list.some((v) => v.id === cur) ? cur : list[0]?.id || ''));
    } catch (err) {
      if (err.status === 401) setAuthed(false);
      else { setError(err.message || 'Could not load history'); setAuthed(true); }
    }
  }, []);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  useEffect(() => {
    if (authed !== true || !selectedId || !appliedFrom || !appliedTo) { setPoints([]); return undefined; }
    let cancelled = false;
    setLoading(true);
    setError('');
    api(`/api/history?id=${encodeURIComponent(selectedId)}&from=${appliedFrom}&to=${appliedTo}`)
      .then((data) => { if (!cancelled) setPoints(Array.isArray(data.points) ? data.points : []); })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) setAuthed(false);
        else setError(err.message || 'Could not load history');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authed, selectedId, appliedFrom, appliedTo, refreshKey]);

  useEffect(() => {
    setSelectedTrip(null);
    setTime(appliedFrom);
    const span = appliedTo - appliedFrom;
    setReportTab(span > 2 * DAY_MS ? 'summary' : 'map');
  }, [selectedId, appliedFrom, appliedTo]);

  useEffect(() => {
    if (!selectedId || !appliedFrom || !appliedTo) return undefined;
    let cancelled = false;
    setReportLoading(true);
    Promise.all(['summary', 'trips', 'stops'].map((kind) =>
      api(`/api/history/reports/${kind}?id=${encodeURIComponent(selectedId)}&from=${appliedFrom}&to=${appliedTo}`)
        .then((data) => ({ kind, rows: Array.isArray(data[kind === 'summary' ? 'days' : kind]) ? data[kind === 'summary' ? 'days' : kind] : [] }))
        .catch(() => ({ kind, rows: [] }))
    )).then((results) => {
      if (cancelled) return;
      const next = { summary: [], trips: [], stops: [] };
      results.forEach((r) => { next[r.kind] = r.rows; });
      setReports(next);
    }).finally(() => { if (!cancelled) setReportLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, appliedFrom, appliedTo, refreshKey]);

  /* map */
  useEffect(() => {
    if (authed !== true || !mapContainerRef.current) return undefined;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; setMapReady(false); }
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE,
      center: [BASE.lon, BASE.lat],
      zoom: 9.6,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Fleet Shield · Mani Ratan Singh (mrps.in)' }), 'bottom-right');
    map.on('load', () => {
      requestAnimationFrame(() => {
        map.resize();
        requestAnimationFrame(() => { map.resize(); setMapReady(true); });
      });
    });
    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainerRef.current);
    mapRef.current = map;
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [authed, theme]);

  /* draw */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return undefined;
    markersRef.current.forEach((m) => { try { m.remove(); } catch {} });
    markersRef.current = [];
    ['quality-line', 'trail', 'casing', 'stops-dot', 'stops-halo', 'stops-label', 'gap-caps', 'bad-ring', 'arrows', 'cloud', 'hull-fill', 'hull-line', 'area-centre', 'speed-line', 'bridges'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ['runs', 'quality', 'stops', 'caps', 'bad', 'arrows', 'cloud', 'hull', 'area-centre', 'speed', 'bridges'].forEach((id) => { if (map.getSource(id)) map.removeSource(id); });

    if (!points.length) return undefined;
    if (!advanced && reportTab !== 'map') return undefined;
    if (appliedTo - appliedFrom > 2 * DAY_MS) return undefined;

    if (confidence.low) {
      const hull = convexHull(prepared.clean.map((p) => [p.lon, p.lat]));
      if (hull.length > 2) {
        map.addSource('hull', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...hull, hull[0]]] } } });
        map.addLayer({ id: 'hull-fill', type: 'fill', source: 'hull', paint: { 'fill-color': vehicleColor, 'fill-opacity': 0.16 } });
        map.addLayer({ id: 'hull-line', type: 'line', source: 'hull', paint: { 'line-color': vehicleColor, 'line-width': 1.5, 'line-opacity': 0.4 } });
      }
      const cLon = prepared.clean.reduce((s, p) => s + p.lon, 0) / prepared.clean.length;
      const cLat = prepared.clean.reduce((s, p) => s + p.lat, 0) / prepared.clean.length;
      map.addSource('area-centre', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [cLon, cLat] } } });
      map.addLayer({ id: 'area-centre', type: 'circle', source: 'area-centre', paint: { 'circle-radius': 5, 'circle-color': vehicleColor, 'circle-stroke-color': theme === 'dark' ? '#0b1118' : '#ffffff', 'circle-stroke-width': 2.5 } });
    }

    const runs = confidence.low ? [] : prepared.runs;
    const features = runs.map((r) => ({
      type: 'Feature',
      properties: { trip: r.trip, color: viewMode === 'trips' ? TRIP_COLORS[r.trip % TRIP_COLORS.length] : vehicleColor },
      geometry: { type: 'LineString', coordinates: r.coords },
    }));
    map.addSource('runs', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addLayer({
      id: 'casing', type: 'line', source: 'runs',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': theme === 'dark' ? 'rgba(2,7,12,.9)' : 'rgba(255,255,255,.96)',
        'line-width': viewMode === 'trips' ? 8 : 9,
        'line-opacity': selectedTrip === null ? 0.95 : ['case', ['==', ['get', 'trip'], selectedTrip], 0.95, 0.25],
      },
    });
    map.addLayer({
      id: 'trail', type: 'line', source: 'runs',
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: speedColor ? 'none' : 'visible' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': viewMode === 'trips' ? 3.8 : 4.6,
        'line-opacity': selectedTrip === null ? 1 : ['case', ['==', ['get', 'trip'], selectedTrip], 1, 0.18],
      },
    });

    if (!advanced && !confidence.low) {
      const bridges = [];
      const ordered = [...prepared.runs].sort((a, b) => a.start - b.start);
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1];
        const next = ordered[i];
        const a = prev.coords[prev.coords.length - 1];
        const b = next.coords[0];
        const meters = haversine(a, b) * 1000;
        if (meters <= 500) bridges.push({ type: 'Feature', properties: { kind: 'bridge' }, geometry: { type: 'LineString', coordinates: [a, b] } });
        else if (meters <= 20000) bridges.push({ type: 'Feature', properties: { kind: 'link' }, geometry: { type: 'LineString', coordinates: [a, b] } });
      }
      if (bridges.length) {
        map.addSource('bridges', { type: 'geojson', data: { type: 'FeatureCollection', features: bridges } });
        map.addLayer({ id: 'bridges', type: 'line', source: 'bridges', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': vehicleColor, 'line-width': ['case', ['==', ['get', 'kind'], 'bridge'], 3.4, 1.3], 'line-opacity': ['case', ['==', ['get', 'kind'], 'bridge'], 0.55, 0.18] } });
      }
    }

    /* direction arrows */
    const arrowId = theme === 'dark' ? 'fh-arrow-light' : 'fh-arrow-dark';
    if (!map.hasImage(arrowId)) {
      const size = 36;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.translate(size / 2, size / 2);
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath();
      ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#0f172a';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme === 'dark' ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.75)';
      ctx.stroke();
      const img = ctx.getImageData(0, 0, size, size);
      map.addImage(arrowId, img);
    }
    if (!confidence.low && prepared.arrows.length) {
      map.addSource('arrows', { type: 'geojson', data: { type: 'FeatureCollection', features: prepared.arrows.map((a) => ({ type: 'Feature', properties: { bearing: a.bearing }, geometry: { type: 'Point', coordinates: a.coord } })) } });
      map.addLayer({
        id: 'arrows', type: 'symbol', source: 'arrows',
        layout: { 'icon-image': arrowId, 'icon-size': 0.55, 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
        paint: { 'icon-opacity': 0.9 },
      });
    }

    /* quality segments, cleaned */
    const segs = [];
    for (let i = 1; !confidence.low && i < prepared.clean.length; i++) {
      const a = prepared.clean[i - 1];
      const b = prepared.clean[i];
      const dt = b.t - a.t;
      if (dt <= 0 || dt > prepared.gapMs) continue;
      const acc = Math.max(a.accuracy || 0, b.accuracy || 0);
      segs.push({
        type: 'Feature',
        properties: { c: acc > 50 ? '#ff453a' : acc > 20 ? '#ffd60a' : '#30d158' },
        geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
      });
    }
    map.addSource('quality', { type: 'geojson', data: { type: 'FeatureCollection', features: segs } });
    map.addLayer({
      id: 'quality-line', type: 'line', source: 'quality',
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: quality ? 'visible' : 'none' },
      paint: { 'line-color': ['get', 'c'], 'line-width': 6, 'line-opacity': 0.95 },
    });

    /* speed-coloured segments (Traccar-style route report) */
    const speedSegs = [];
    for (let i = 1; i < prepared.clean.length; i++) {
      const a = prepared.clean[i - 1];
      const b = prepared.clean[i];
      if (b.t - a.t <= 0 || b.t - a.t > prepared.gapMs) continue;
      speedSegs.push({
        type: 'Feature',
        properties: { c: speedColorFor(Number(b.speed) || 0) },
        geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
      });
    }
    map.addSource('speed', { type: 'geojson', data: { type: 'FeatureCollection', features: speedSegs } });
    map.addLayer({
      id: 'speed-line', type: 'line', source: 'speed',
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: speedColor ? 'visible' : 'none' },
      paint: { 'line-color': ['get', 'c'], 'line-width': 5, 'line-opacity': 1 },
    });

    /* stops as bubbles, not path */
    if (advanced && reports.stops.length && !confidence.low) {
      map.addSource('stops', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: reports.stops.map((s) => ({ type: 'Feature', properties: { minutes: s.minutes, label: `${Math.round(s.minutes)}m` }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })),
        },
      });
      map.addLayer({
        id: 'stops-halo', type: 'circle', source: 'stops',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'minutes'], 8, 11, 60, 22], 'circle-color': vehicleColor, 'circle-opacity': 0.16 },
      });
      map.addLayer({
        id: 'stops-dot', type: 'circle', source: 'stops',
        paint: { 'circle-radius': 5.5, 'circle-color': theme === 'dark' ? '#0b1118' : '#ffffff', 'circle-stroke-color': vehicleColor, 'circle-stroke-width': 2.5 },
      });
      map.addLayer({
        id: 'stops-label', type: 'symbol', source: 'stops', minzoom: 10.5,
        layout: { 'text-field': ['get', 'label'], 'text-size': 10, 'text-offset': [0, 1.8], 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-font': ['Open Sans Regular'] },
        paint: { 'text-color': theme === 'dark' ? '#e2e8f0' : '#0f172a', 'text-halo-color': theme === 'dark' ? 'rgba(2,7,12,.85)' : 'rgba(255,255,255,.9)', 'text-halo-width': 2 },
      });
    }

    /* gap caps */
    if (advanced && prepared.caps.length) {
      map.addSource('caps', { type: 'geojson', data: { type: 'FeatureCollection', features: prepared.caps.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) } });
      map.addLayer({ id: 'gap-caps', type: 'circle', source: 'caps', paint: { 'circle-radius': 4.5, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': theme === 'dark' ? '#eef4fa' : '#0a1119', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.5 } });
    }

    const movingEl = document.createElement('div');
    movingEl.className = 'fh-car';
    movingEl.innerHTML = `<span class="fh-car-halo" style="--c:${vehicleColor}"></span><svg viewBox="0 0 28 44" width="26" height="40" aria-hidden="true">
      <defs><linearGradient id="fhCarBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dbe4ee"/></linearGradient></defs>
      <rect x="3" y="8" width="22" height="30" rx="7" fill="url(#fhCarBody)" stroke="${theme === 'dark' ? '#0b1728' : '#94a3b8'}" stroke-width="1.4"/>
      <rect x="6" y="13" width="16" height="8" rx="3" fill="#0f2a3d" opacity=".9"/>
      <rect x="6" y="26" width="16" height="3" rx="1.5" fill="${vehicleColor}" opacity=".9"/>
      <rect x="6" y="31" width="16" height="3" rx="1.5" fill="${vehicleColor}" opacity=".55"/>
      <circle cx="8.5" cy="10" r="1.8" fill="#ff453a"/>
      <circle cx="19.5" cy="10" r="1.8" fill="#ff453a"/>
    </svg>`;
    movingMarkerRef.current = new maplibregl.Marker({ element: movingEl }).setLngLat([prepared.clean[0].lon, prepared.clean[0].lat]).addTo(map);
    markersRef.current.push(movingMarkerRef.current);

    const startEl = document.createElement('div');
    startEl.style.cssText = 'width:12px;height:12px;border-radius:99px;background:#30d158;border:2.5px solid #04121c;box-shadow:0 0 0 3px rgba(0,0,0,.18)';
    markersRef.current.push(new maplibregl.Marker({ element: startEl }).setLngLat([prepared.clean[0].lon, prepared.clean[0].lat]).addTo(map));
    const endEl = document.createElement('div');
    endEl.style.cssText = 'width:12px;height:12px;border-radius:99px;background:#ff453a;border:2.5px solid #04121c;box-shadow:0 0 0 3px rgba(0,0,0,.18)';
    markersRef.current.push(new maplibregl.Marker({ element: endEl }).setLngLat([prepared.clean[prepared.clean.length - 1].lon, prepared.clean[prepared.clean.length - 1].lat]).addTo(map));

    const coords = prepared.clean.map((p) => [p.lon, p.lat]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    if (coords.length) {
      const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(b, { padding: { top: 150, bottom: 280, left: 90, right: 90 }, maxZoom: 14, duration: 400 });
    }
    return undefined;
  }, [prepared, reports.stops, confidence, mapReady, mode, viewMode, advanced, reportTab, quality, speedColor, theme, vehicleColor, selectedTrip]);

  useEffect(() => {
    const p = positionAt(prepared.clean, time || appliedFrom);
    if (p && movingMarkerRef.current) {
      movingMarkerRef.current.setLngLat([p.lon, p.lat]);
      const el = movingMarkerRef.current.getElement();
      const car = el.querySelector('svg');
      if (car) car.style.transform = `rotate(${p.bearing || 0}deg)`;
      setPlaySpeed(Math.round(Number(p.speed) || 0));
      if (follow && playing && mapRef.current) {
        const center = mapRef.current.getCenter();
        const map = mapRef.current;
        const pt = map.project([p.lon, p.lat]);
        const w = map.getCanvas().clientWidth;
        const h = map.getCanvas().clientHeight;
        const outside = pt.x < w * 0.22 || pt.x > w * 0.78 || pt.y < h * 0.22 || pt.y > h * 0.7;
        if (outside) map.easeTo({ center: [p.lon, p.lat], duration: 900, easing: (t) => 1 - Math.pow(1 - t, 3), essential: true });
      }
    }
  }, [time, prepared, mapReady, follow, playing]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setTime((t) => {
        const next = (t || appliedFrom) + 30000;
        if (next >= appliedTo) { setPlaying(false); return appliedTo; }
        return next;
      });
    }, 60);
    return () => clearInterval(id);
  }, [playing, appliedFrom, appliedTo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (selectedTrip === null) {
      if (map.getLayer('trail')) map.setPaintProperty('trail', 'line-opacity', 1);
      return;
    }
    if (map.getLayer('trail')) {
      map.setPaintProperty('trail', 'line-opacity', ['case', ['==', ['get', 'trip'], selectedTrip], 1, 0.18]);
    }
    const trip = trips[selectedTrip];
    if (trip) {
      const coords = trip.points.map((p) => [Number(p.lon), Number(p.lat)]);
      if (coords.length) {
        const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(b, { padding: { top: 150, bottom: 280, left: 90, right: 90 }, maxZoom: 14, duration: 500 });
      }
    }
  }, [selectedTrip, mapReady, trips]);

  /* playhead */
  useEffect(() => {
    const el = document.getElementById('fh-head');
    if (!el || !appliedFrom || !appliedTo) return;
    el.style.left = `${((time - appliedFrom) / (appliedTo - appliedFrom)) * 100}%`;
  }, [time, appliedFrom, appliedTo]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      await api('/api/history/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      setPassword('');
      setAuthed(true);
      await loadVehicles();
    } catch (err) {
      setLoginError(err.message || 'Invalid password');
    } finally {
      setLoggingIn(false);
    }
  };

  const applyPreset = (key) => {
    const now = Date.now();
    let from = now - DAY_MS;
    let label = 'Last 24 hours';
    if (key === '7d') { from = now - MAX_RANGE_MS; label = 'Last 7 days'; }
    if (key === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); from = d.getTime(); label = 'Today'; }
    if (key === 'yesterday') { const d = new Date(); d.setHours(0, 0, 0, 0); from = d.getTime() - DAY_MS; label = 'Yesterday'; }
    const to = key === 'yesterday' ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - 1; })() : now;
    setFromInput(toLocalInput(from));
    setToInput(toLocalInput(to));
    setAppliedFrom(from);
    setAppliedTo(to);
    setPreset(key);
    setRangeLabel(label);
    setRangeOpen(false);
  };

  const applyCustom = () => {
    const from = fromLocalInput(fromInput);
    const to = fromLocalInput(toInput);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) { setError('Choose a valid range'); return; }
    setAppliedFrom(from);
    setAppliedTo(to);
    setPreset('custom');
    setRangeLabel('Custom range');
    setRangeOpen(false);
    setError('');
  };

  const timelineBlocks = useMemo(() => {
    const blocks = trips.map((t) => ({ type: 'trip', start: t.start, end: t.end, index: t.index, quality: t.quality }));
    return blocks.sort((a, b) => a.start - b.start);
  }, [trips]);

  const filteredVehicles = vehicles.filter((v) => !vehicleQuery || v.id.toLowerCase().includes(vehicleQuery.toLowerCase()));

  const openDay = (day) => {
    const from = Date.parse(`${day}T00:00:00+05:30`);
    const to = from + DAY_MS - 1;
    if (!Number.isFinite(from)) return;
    setFromInput(toLocalInput(from));
    setToInput(toLocalInput(to));
    setAppliedFrom(from);
    setAppliedTo(to);
    setPreset('custom');
    setRangeLabel('Custom range');
    setReportTab('map');
  };

  const openTrip = (trip) => {
    setFromInput(toLocalInput(trip.startTime));
    setToInput(toLocalInput(trip.endTime));
    setAppliedFrom(trip.startTime);
    setAppliedTo(trip.endTime);
    setPreset('custom');
    setRangeLabel('Custom range');
    setReportTab('map');
  };

  const openStop = (stop) => {
    const from = stop.start - 5 * 60000;
    const to = stop.end + 5 * 60000;
    setFromInput(toLocalInput(from));
    setToInput(toLocalInput(to));
    setAppliedFrom(from);
    setAppliedTo(to);
    setPreset('custom');
    setRangeLabel('Custom range');
    setReportTab('map');
  };

  const exportCsv = () => {
    const rows = reports[reportTab] || [];
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selectedId}-${reportTab}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (authed === null) {
    return <div className="fh2 min-h-screen w-screen fh2-bg fh2-soft flex items-center justify-center text-sm"><ShieldCheck className="w-5 h-5 text-sky-500 mr-2" /> Checking history access…</div>;
  }

  if (authed === false) {
    return (
      <div className="fh2 min-h-screen w-screen fh2-bg text-current flex items-center justify-center p-5">
        <form onSubmit={handleLogin} className="w-full max-w-sm rounded-[26px] border fh2-border fh2-panel p-6 shadow-2xl">
          <div className="w-12 h-12 rounded-[16px] bg-sky-500/15 text-sky-400 flex items-center justify-center mb-4"><Lock className="w-6 h-6" /></div>
          <h1 className="text-xl font-semibold tracking-tight">Fleet History</h1>
          <p className="text-sm fh2-muted mt-1">Restricted access. Enter the history password.</p>
          <div className="relative mt-5">
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus placeholder="Enter password" className="w-full rounded-[12px] border fh2-border fh2-input px-3 py-2.5 pr-11 text-sm outline-none focus:border-sky-400/60" />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 fh2-muted">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          </div>
          {loginError && <div className="mt-3 rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{loginError}</div>}
          <button type="submit" disabled={loggingIn || !password} className="mt-4 w-full min-h-11 rounded-[12px] bg-sky-500 text-[var(--bg)] font-semibold text-sm disabled:opacity-50">{loggingIn ? 'Checking…' : 'Open history'}</button>
          <div className="mt-5 pt-4 border-t fh2-border text-[11px] fh2-muted flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Sant Kabir Eye Hospital · Mani Ratan Singh</div>
        </form>
      </div>
    );
  }

  return (
    <div className="fh2 h-screen w-screen fh2-bg text-current flex flex-col overflow-hidden">
      <style>{`
        .maplibregl-ctrl-group { background: rgba(11,23,40,.92) !important; border: 1px solid rgba(255,255,255,.12) !important; box-shadow: 0 12px 30px -12px rgba(0,0,0,.6) !important; }
        .maplibregl-ctrl-group button span { filter: invert(1); }
        .maplibregl-ctrl-attrib { background: rgba(11,23,40,.8) !important; color: #94a3b8 !important; }
        .maplibregl-ctrl-attrib a { color: #cbd5e1 !important; }
        .fh2 { --bg:#060d17; --panel:rgba(11,23,40,.92); --border:rgba(255,255,255,.10); --text:#f1f5f9; --muted:#94a3b8; --soft:#cbd5e1; --hover:rgba(255,255,255,.08); --track:rgba(255,255,255,.12); }
        html.light .fh2 { --bg:#eef1f5; --panel:rgba(255,255,255,.94); --border:rgba(15,23,42,.12); --text:#0f172a; --muted:#64748b; --soft:#334155; --hover:rgba(15,23,42,.06); --track:rgba(15,23,42,.12); }
        .fh2-bg { background: var(--bg); color: var(--text); }
        .fh2-panel { background: var(--panel); border-color: var(--border); }
        .fh2-muted { color: var(--muted); }
        .fh2-soft { color: var(--soft); }
        .fh2-border { border-color: var(--border); }
        .fh2-hover:hover { background: var(--hover); }
        .fh2-input { background: var(--hover); border-color: var(--border); color: var(--text); }
        .fh2-track { background: var(--track); }
        .fh2-active { background: var(--text); color: var(--bg); }
        html.light .maplibregl-ctrl-attrib { background: rgba(255,255,255,.86) !important; color: #475569 !important; }
        html.light .maplibregl-ctrl-attrib a { color: #334155 !important; }
        html.light .maplibregl-ctrl-group button span { filter: none; }
        html.light .maplibregl-ctrl-group { background: rgba(255,255,255,.94) !important; border-color: rgba(15,23,42,.12) !important; }

        .fh2 { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
        .fh2-panel { -webkit-backdrop-filter: blur(24px) saturate(180%); backdrop-filter: blur(24px) saturate(180%); box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 18px 50px -22px rgba(0,0,0,.55); }
        html.light .fh2-panel { box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 18px 50px -26px rgba(15,23,42,.28); }
        .fh2 button { transition: transform 120ms cubic-bezier(.2,.8,.2,1), background-color 160ms ease, color 160ms ease, border-color 160ms ease, opacity 160ms ease; }
        .fh2 button:active { transform: scale(.97); }
        .fh2 button:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
        .fh2-pop { animation: fh2-pop 200ms cubic-bezier(.2,.9,.3,1); transform-origin: top left; }
        @keyframes fh2-pop { from { opacity: 0; transform: scale(.96) translateY(-4px); } to { opacity: 1; transform: none; } }
        .fh2 .tabular-nums { font-variant-numeric: tabular-nums; }
        .fh-car { position: relative; width: 26px; height: 40px; will-change: transform; }
        .fh-car svg { display: block; transition: transform 320ms cubic-bezier(.2,.8,.2,1); filter: drop-shadow(0 6px 10px rgba(0,0,0,.45)); }
        .fh-car-halo { position: absolute; left: 50%; top: 55%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 99px; background: radial-gradient(circle, var(--c) 0%, transparent 65%); opacity: .22; animation: fh-pulse 2.2s ease-in-out infinite; }
        @keyframes fh-pulse { 0%,100% { transform: scale(.8); opacity: .12; } 50% { transform: scale(1.1); opacity: .26; } }
        @media (prefers-reduced-motion: reduce) {
          .fh2 *, .fh2 *::before, .fh2 *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }
        }
        @media (prefers-reduced-transparency: reduce) {
          .fh2-panel { background: var(--bg) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
        }
      `}</style>
      <header className="shrink-0 border-b fh2-border fh2-panel px-4 py-2.5 flex items-center gap-3 z-20">
        <div className="w-9 h-9 rounded-[12px] bg-sky-500/15 text-sky-400 flex items-center justify-center"><Route className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight">Fleet History</h1>
          <p className="text-[10px] fh2-muted leading-tight">Sant Kabir Eye Hospital · by Mani Ratan Singh</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setRefreshKey((v) => v + 1)} className="p-2.5 rounded-full fh2-hover fh2-soft" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2.5 rounded-full fh2-hover fh2-soft" aria-label="Theme">{theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
          <button onClick={async () => { await fetch('/api/history/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); setAuthed(false); }} className="p-2.5 rounded-full fh2-hover fh2-soft" aria-label="Lock"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <main className="relative flex-1 min-h-0">
        <div className="absolute inset-0"><div ref={mapContainerRef} className="h-full w-full" /></div>

        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center gap-2 z-10">
          <button onClick={() => setVehiclesOpen((v) => !v)} className="h-10 pl-2.5 pr-3 rounded-full border fh2-border fh2-panel backdrop-blur-xl flex items-center gap-2 text-xs font-semibold shadow-xl">
            <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${vehicleColor}22` }}><span className="w-2 h-2 rounded-full" style={{ background: vehicleColor }} /></span>
            <span>{selectedId || 'No vehicle'}</span>
            <ChevronDown className="w-3.5 h-3.5 fh2-muted" />
          </button>
          <button onClick={() => setRangeOpen((v) => !v)} className="h-10 px-3 rounded-full border fh2-border fh2-panel backdrop-blur-xl flex items-center gap-2 text-xs font-semibold shadow-xl">
            {rangeLabel} <ChevronDown className="w-3.5 h-3.5 fh2-muted" />
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {advanced && <div className="flex p-1 rounded-full border fh2-border fh2-panel backdrop-blur-xl text-[11px] font-semibold">
              <button onClick={() => setMode('maps')} className={`px-3 h-7 rounded-full ${mode === 'maps' ? 'fh2-active' : 'fh2-muted'}`}>Maps</button>
              <button onClick={() => setMode('trips')} className={`px-3 h-7 rounded-full ${mode === 'trips' ? 'fh2-active' : 'fh2-muted'}`}>Trips</button>
            </div>}
            <button onClick={() => setAdvanced((v) => !v)} className={`h-9 px-3 rounded-full border text-[11px] font-semibold ${advanced ? 'fh2-active border-transparent' : 'fh2-border fh2-panel fh2-soft'}`}>{advanced ? 'Advanced on' : 'Advanced'}</button>
            {advanced && <button onClick={() => setQuality((v) => !v)} className={`h-9 px-3 rounded-full border text-[11px] font-semibold ${quality ? 'bg-sky-500 text-white border-transparent' : 'fh2-border fh2-panel fh2-soft'}`}>Quality</button>}
            {advanced && <button onClick={() => setSpeedColor((v) => !v)} className={`h-9 px-3 rounded-full border text-[11px] font-semibold ${speedColor ? 'fh2-active border-transparent' : 'fh2-border fh2-panel fh2-soft'}`}>Speed</button>}
          </div>
        </div>

        {reportTab === 'map' && appliedTo - appliedFrom > 2 * DAY_MS && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-6">
            <div className="rounded-[16px] border fh2-border fh2-panel px-4 py-3 text-center text-[11px] fh2-muted shadow-2xl">
              Select a day in <span className="font-semibold" style={{ color: 'var(--text)' }}>Summary</span> to see its route.
            </div>
          </div>
        )}

        <section className="absolute left-3 bottom-3 right-3 md:right-auto md:w-[560px] rounded-[22px] border fh2-border fh2-panel backdrop-blur-xl p-4 shadow-2xl z-10">
          <div className="flex items-start gap-4">
            <div>
              <div className="text-[10px] fh2-muted flex items-center gap-1.5">
                {rangeLabel} · {fmtDate(appliedFrom)}
                {confidence.low && <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/25">Low-confidence area</span>}
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <b className="text-[30px] tracking-tight tabular-nums">{confidence.low ? confidence.area.toFixed(2) : stats.km.toFixed(1)}</b>
                <span className="text-xs fh2-muted">{confidence.low ? 'km² area' : 'km'}</span>
              </div>
              <div className="text-[11px] fh2-muted mt-0.5">{confidence.low ? `${prepared.clean.length} fixes · area view` : `${trips.length} trip${trips.length === 1 ? '' : 's'} · ${stats.stops} stop${stats.stops === 1 ? '' : 's'}`}</div>
            </div>
            <div className={`ml-auto grid ${advanced ? 'grid-cols-2' : 'grid-cols-1'} gap-x-5 gap-y-2 text-[11px] text-right`}>
              <div><div className="text-[9px] uppercase tracking-wider fh2-muted">Moving</div><div className="font-semibold tabular-nums">{fmtDur(stats.moving)}</div></div>
              {advanced && <>
                <div><div className="text-[9px] uppercase tracking-wider fh2-muted">Sampling</div><div className="font-semibold tabular-nums">{Math.round(stats.interval)}s</div></div>
                <div><div className="text-[9px] uppercase tracking-wider fh2-muted">Accuracy</div><div className="font-semibold tabular-nums">{stats.accuracy}m</div></div>
                <div><div className="text-[9px] uppercase tracking-wider fh2-muted">Poor fixes</div><div className="font-semibold tabular-nums">{stats.badPct}%</div></div>
                <div><div className="text-[9px] uppercase tracking-wider fh2-muted">Avg speed</div><div className="font-semibold tabular-nums">{Math.round(stats.avgSpeed)} km/h</div></div>
                <div><div className="text-[9px] uppercase tracking-wider fh2-muted">Max speed</div><div className="font-semibold tabular-nums">{Math.round(stats.maxSpeed)} km/h</div></div>
              </>}
            </div>
          </div>

          {advanced && <div className="mt-3 flex items-center gap-1 p-1 rounded-full border fh2-border fh2-track text-[10px] font-semibold">
            {['map', 'summary', 'trips', 'stops'].map((tab) => (
              <button
                key={tab}
                onClick={() => setReportTab(tab)}
                className={`flex-1 h-7 rounded-full capitalize ${reportTab === tab ? 'fh2-active' : 'fh2-muted'}`}
              >
                {tab}
              </button>
            ))}
            {reportTab !== 'map' && <button onClick={exportCsv} className="h-7 px-2 rounded-full fh2-muted" title="Download CSV">CSV</button>}
          </div>}

          {reportTab !== 'map' ? (
            <div className="mt-3 max-h-[230px] overflow-auto rounded-[12px] border fh2-border">
              {reportLoading ? (
                <div className="p-4 text-[11px] fh2-muted">Loading {reportTab}…</div>
              ) : (reports[reportTab] || []).length === 0 ? (
                <div className="p-4 text-[11px] fh2-muted">No {reportTab} in this range.</div>
              ) : (
                <table className="w-full text-[10px] tabular-nums">
                  <thead className="sticky top-0 fh2-panel">
                    <tr className="text-left fh2-muted">
                      {reportTab === 'summary' && <><th className="p-2">Day</th><th className="p-2">km</th><th className="p-2">Moving</th><th className="p-2">Trips</th><th className="p-2">Stops</th><th className="p-2">Avg</th></>}
                      {reportTab === 'trips' && <><th className="p-2">Start</th><th className="p-2">End</th><th className="p-2">km</th><th className="p-2">Moving</th><th className="p-2">Avg/Max</th></>}
                      {reportTab === 'stops' && <><th className="p-2">Start</th><th className="p-2">Duration</th><th className="p-2">Location</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {(reports[reportTab] || []).map((row, i) => (
                      <tr key={i} onClick={() => reportTab === 'summary' ? openDay(row.day) : reportTab === 'trips' ? openTrip(row) : openStop(row)} className="cursor-pointer border-t fh2-border fh2-hover">
                        {reportTab === 'summary' && <><td className="p-2">{row.day}</td><td className="p-2">{row.distanceKm}</td><td className="p-2">{fmtDur(row.movingMin * 60000)}</td><td className="p-2">{row.trips}</td><td className="p-2">{row.stops}</td><td className="p-2">{row.averageSpeed} km/h</td></>}
                        {reportTab === 'trips' && <><td className="p-2">{fmt(row.startTime)}</td><td className="p-2">{fmt(row.endTime)}</td><td className="p-2">{row.distanceKm}</td><td className="p-2">{fmtDur(row.movingMin * 60000)}</td><td className="p-2">{row.averageSpeed}/{row.maxSpeed}</td></>}
                        {reportTab === 'stops' && <><td className="p-2">{fmt(row.start)}</td><td className="p-2">{Math.round(row.minutes)}m</td><td className="p-2">{row.lat.toFixed(4)}, {row.lon.toFixed(4)}</td></>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}

          {reportTab === 'map' && speedColor && (
            <div className="mt-2 flex items-center gap-2 text-[9px] fh2-muted">
              <span>0</span>
              <span className="h-1.5 flex-1 rounded-full" style={{ background: 'linear-gradient(90deg,#38bdf8,#30d158,#ffd60a,#ff453a)' }} />
              <span>45+ km/h</span>
            </div>
          )}

          {reportTab === 'map' && <div className="mt-3 flex items-center gap-3">
            <button onClick={() => setPlaying((v) => !v)} className="w-8 h-8 rounded-full fh2-active grid place-items-center" aria-label="Play">{playing ? '❚❚' : '▶'}</button>
            <div className="flex-1">
              <div
                className="relative h-3 rounded-full fh2-track overflow-hidden cursor-pointer"
                onPointerDown={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                  setTime(appliedFrom + f * (appliedTo - appliedFrom));
                }}
              >
                {timelineBlocks.map((b) => {
                  const span = appliedTo - appliedFrom || 1;
                  const left = ((b.start - appliedFrom) / span) * 100;
                  const width = Math.max(0.6, ((b.end - b.start) / span) * 100);
                  return (
                    <button key={b.index} onClick={() => { setSelectedTrip(selectedTrip === b.index ? null : b.index); setTime(b.start); }} className="absolute top-0 bottom-0" style={{ left: `${left}%`, width: `${width}%`, background: viewMode === 'trips' ? TRIP_COLORS[b.index % TRIP_COLORS.length] : vehicleColor, opacity: selectedTrip === null || selectedTrip === b.index ? 0.95 : 0.25 }} title={`Trip ${b.index + 1}`} />
                  );
                })}
                <div id="fh-head" className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-white" style={{ left: '0%' }} />
              </div>
              <div className="flex justify-between text-[9px] fh2-muted mt-1 tabular-nums"><span>{fmt(appliedFrom)}</span><span>{fmt((appliedFrom + appliedTo) / 2)}</span><span>{fmt(appliedTo)}</span></div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold tabular-nums">{fmt(time || appliedFrom)}</div>
              <div className="text-[9px] fh2-muted tabular-nums">{playSpeed} km/h</div>
            </div>
          </div>}

          {advanced && reportTab === 'map' && !confidence.low && <div className="flex gap-1.5 mt-3 overflow-x-auto">
            <button onClick={() => setSelectedTrip(null)} className={`shrink-0 h-7 px-2.5 rounded-full border text-[10px] font-semibold ${selectedTrip === null ? 'border-sky-400/50 bg-sky-500/10' : 'fh2-border fh2-muted'}`}>All</button>
            {trips.map((t) => (
              <button key={t.index} onClick={() => setSelectedTrip(selectedTrip === t.index ? null : t.index)} className={`shrink-0 h-7 px-2.5 rounded-full border text-[10px] font-semibold flex items-center gap-1.5 ${selectedTrip === t.index ? 'border-sky-400/50 bg-sky-500/10' : 'fh2-border fh2-muted'}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: viewMode === 'trips' ? TRIP_COLORS[t.index % TRIP_COLORS.length] : vehicleColor }} />
                Trip {t.index + 1}
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: QUALITY_COLOR[t.quality] }} />
              </button>
            ))}
          </div>}

          <div className="mt-2 text-[10px] fh2-muted flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Built by <a href="https://mrps.in" className="underline decoration-white/20">Mani Ratan Singh</a> · mrps.in</div>
        </section>

        {vehiclesOpen && (
          <div className="fh2-pop absolute left-3 top-14 w-[300px] rounded-[18px] border fh2-border fh2-panel backdrop-blur-xl p-3 shadow-2xl z-30">
            <div className="flex items-center justify-between mb-2"><b className="text-xs">Vehicles</b><button onClick={() => setVehiclesOpen(false)}><X className="w-3.5 h-3.5 fh2-muted" /></button></div>
            <input value={vehicleQuery} onChange={(e) => setVehicleQuery(e.target.value)} placeholder="Search driver or ID" className="w-full h-8 rounded-lg border fh2-border fh2-input px-2.5 text-[11px] outline-none" />
            <div className="mt-2 max-h-[300px] overflow-auto">
              {filteredVehicles.map((v) => (
                <button key={v.id} onClick={() => { setSelectedId(v.id); setVehiclesOpen(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-left ${v.id === selectedId ? 'bg-sky-500/10 border border-sky-400/40' : 'fh2-hover border border-transparent'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: getUniqueVehicleColor(v.id).line }} />
                  <span className="min-w-0"><span className="block text-[11px] font-semibold truncate">{v.id}</span><span className="block text-[9px] fh2-muted">{v.points} pts</span></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {rangeOpen && (
          <div className="fh2-pop absolute left-3 top-14 w-[320px] rounded-[18px] border fh2-border fh2-panel backdrop-blur-xl p-3 shadow-2xl z-30 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-2"><b className="text-xs">Range</b><button onClick={() => setRangeOpen(false)}><X className="w-3.5 h-3.5 fh2-muted" /></button></div>
            <AppleRangePicker preset={preset} rangeLabel={rangeLabel} fromValue={fromInput} toValue={toInput} minMs={Date.now() - MAX_RANGE_MS} maxMs={Date.now()} onFromChange={setFromInput} onToChange={setToInput} onPreset={applyPreset} onApply={applyCustom} error={error} inline />
          </div>
        )}

      </main>
    </div>
  );
}
