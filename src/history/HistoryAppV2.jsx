import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {
  ChevronDown,
  Eye,
  EyeOff,
  Info,
  Lock,
  LogOut,
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
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);

  const trips = useMemo(() => buildTrips(points), [points]);
  const selected = vehicles.find((v) => v.id === selectedId);
  const vehicleColor = selectedId ? getUniqueVehicleColor(selectedId).line : '#38bdf8';

  const stats = useMemo(() => {
    if (!points.length) return { km: 0, moving: 0, stops: 0, interval: 0, accuracy: 0, badPct: 0 };
    let distance = 0;
    let movingMs = 0;
    const intervals = [];
    const accs = [];
    for (let i = 1; i < points.length; i++) {
      const dt = Number(points[i].device_time) - Number(points[i - 1].device_time);
      if (dt > 0) intervals.push(dt / 1000);
      if (dt > 0 && dt <= 15 * 60000) {
        distance += haversine([points[i - 1].lon, points[i - 1].lat], [points[i].lon, points[i].lat]);
        if (Number(points[i].speed) > 3) movingMs += dt;
      }
    }
    points.forEach((p) => { const a = Number(p.accuracy); if (Number.isFinite(a) && a > 0) accs.push(a); });
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
    return {
      km: distance / 1000,
      moving: movingMs,
      stops: stopCount,
      interval: median(intervals),
      accuracy: Math.round(median(accs)),
      badPct: accs.length ? Math.round((bad / accs.length) * 100) : 0,
    };
  }, [points, trips]);

  /* theme */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
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
  }, [selectedId, appliedFrom, appliedTo]);

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
    if (!map || !mapReady) return undefined;
    markersRef.current.forEach((m) => { try { m.remove(); } catch {} });
    markersRef.current = [];
    ['quality-line', 'trail', 'casing', 'stops-dot', 'stops-halo', 'gap-caps', 'bad-ring'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ['runs', 'quality', 'stops', 'caps', 'bad'].forEach((id) => { if (map.getSource(id)) map.removeSource(id); });

    if (!points.length) return undefined;

    const runs = [];
    trips.forEach((t) => tripRuns(t).forEach((coords) => runs.push({ coords, trip: t.index })));
    const features = runs.map((r) => ({
      type: 'Feature',
      properties: { trip: r.trip, color: mode === 'trips' ? TRIP_COLORS[r.trip % TRIP_COLORS.length] : vehicleColor },
      geometry: { type: 'LineString', coordinates: r.coords },
    }));
    map.addSource('runs', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    map.addLayer({
      id: 'casing', type: 'line', source: 'runs',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': theme === 'dark' ? 'rgba(2,7,12,.92)' : 'rgba(255,255,255,.96)', 'line-width': mode === 'trips' ? 8 : 9, 'line-offset': 0 },
    });
    map.addLayer({
      id: 'trail', type: 'line', source: 'runs',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': mode === 'trips' ? 3.6 : 4.6, 'line-offset': 0, 'line-opacity': 1 },
    });

    /* quality segments */
    const segs = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const dt = Number(b.device_time) - Number(a.device_time);
      if (dt <= 0 || dt > 15 * 60000) continue;
      const acc = Math.max(Number(a.accuracy) || 0, Number(b.accuracy) || 0);
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

    /* stops: low speed for >=5 min */
    const stops = [];
    let run = [];
    points.forEach((p) => {
      if (Number(p.speed) < 3) run.push(p);
      else { if (run.length && Number(run[run.length - 1].device_time) - Number(run[0].device_time) >= 5 * 60000) stops.push(run); run = []; }
    });
    if (run.length && Number(run[run.length - 1].device_time) - Number(run[0].device_time) >= 5 * 60000) stops.push(run);
    map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: stops.map((s) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [Number(s[Math.floor(s.length / 2)].lon), Number(s[Math.floor(s.length / 2)].lat)] } })) } });
    map.addLayer({ id: 'stops-halo', type: 'circle', source: 'stops', paint: { 'circle-radius': 13, 'circle-color': vehicleColor, 'circle-opacity': 0.12 } });
    map.addLayer({ id: 'stops-dot', type: 'circle', source: 'stops', paint: { 'circle-radius': 5.5, 'circle-color': theme === 'dark' ? '#0b1118' : '#ffffff', 'circle-stroke-color': vehicleColor, 'circle-stroke-width': 2.5 } });

    /* gap caps */
    const caps = [];
    for (const t of trips) {
      const limit = gapThreshold(t.points) * 1000;
      for (let i = 1; i < t.points.length; i++) {
        if (Number(t.points[i].device_time) - Number(t.points[i - 1].device_time) > limit) {
          caps.push([Number(t.points[i - 1].lon), Number(t.points[i - 1].lat)]);
          caps.push([Number(t.points[i].lon), Number(t.points[i].lat)]);
        }
      }
    }
    map.addSource('caps', { type: 'geojson', data: { type: 'FeatureCollection', features: caps.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) } });
    map.addLayer({ id: 'gap-caps', type: 'circle', source: 'caps', paint: { 'circle-radius': 5, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': theme === 'dark' ? '#eef4fa' : '#0a1119', 'circle-stroke-width': 1.6, 'circle-stroke-opacity': 0.55 } });

    const startEl = document.createElement('div');
    startEl.style.cssText = 'width:12px;height:12px;border-radius:99px;background:#30d158;border:2.5px solid #04121c;box-shadow:0 0 0 3px rgba(0,0,0,.18)';
    markersRef.current.push(new maplibregl.Marker({ element: startEl }).setLngLat([Number(points[0].lon), Number(points[0].lat)]).addTo(map));
    const endEl = document.createElement('div');
    endEl.style.cssText = 'width:12px;height:12px;border-radius:99px;background:#ff453a;border:2.5px solid #04121c;box-shadow:0 0 0 3px rgba(0,0,0,.18)';
    markersRef.current.push(new maplibregl.Marker({ element: endEl }).setLngLat([Number(points[points.length - 1].lon), Number(points[points.length - 1].lat)]).addTo(map));

    const coords = points.map((p) => [Number(p.lon), Number(p.lat)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    if (coords.length) {
      const b = coords.reduce((acc, c) => acc.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(b, { padding: { top: 150, bottom: 280, left: 90, right: 90 }, maxZoom: 14, duration: 400 });
    }
    return undefined;
  }, [points, trips, mapReady, mode, quality, theme, vehicleColor]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setTime((t) => {
        const next = (t || appliedFrom) + 120000;
        if (next >= appliedTo) { setPlaying(false); return appliedTo; }
        return next;
      });
    }, 140);
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

  if (authed === null) {
    return <div className="min-h-screen w-screen bg-[#060d17] text-slate-300 flex items-center justify-center text-sm"><ShieldCheck className="w-5 h-5 text-sky-500 mr-2" /> Checking history access…</div>;
  }

  if (authed === false) {
    return (
      <div className="min-h-screen w-screen bg-[#060d17] text-slate-100 flex items-center justify-center p-5">
        <form onSubmit={handleLogin} className="w-full max-w-sm rounded-[26px] border border-white/10 bg-[#0b1728]/95 p-6 shadow-2xl">
          <div className="w-12 h-12 rounded-[16px] bg-sky-500/15 text-sky-400 flex items-center justify-center mb-4"><Lock className="w-6 h-6" /></div>
          <h1 className="text-xl font-semibold tracking-tight">Fleet History</h1>
          <p className="text-sm text-slate-400 mt-1">Restricted access. Enter the history password.</p>
          <div className="relative mt-5">
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus placeholder="Enter password" className="w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-2.5 pr-11 text-sm outline-none focus:border-sky-400/60" />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          </div>
          {loginError && <div className="mt-3 rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{loginError}</div>}
          <button type="submit" disabled={loggingIn || !password} className="mt-4 w-full min-h-11 rounded-[12px] bg-sky-500 text-slate-950 font-semibold text-sm disabled:opacity-50">{loggingIn ? 'Checking…' : 'Open history'}</button>
          <div className="mt-5 pt-4 border-t border-white/10 text-[11px] text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Sant Kabir Eye Hospital · Mani Ratan Singh</div>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#060d17] text-slate-100 flex flex-col overflow-hidden">
      <style>{`
        .maplibregl-ctrl-group { background: rgba(11,23,40,.92) !important; border: 1px solid rgba(255,255,255,.12) !important; box-shadow: 0 12px 30px -12px rgba(0,0,0,.6) !important; }
        .maplibregl-ctrl-group button span { filter: invert(1); }
        .maplibregl-ctrl-attrib { background: rgba(11,23,40,.8) !important; color: #94a3b8 !important; }
        .maplibregl-ctrl-attrib a { color: #cbd5e1 !important; }
      `}</style>
      <header className="shrink-0 border-b border-white/10 bg-[#081321]/95 px-4 py-2.5 flex items-center gap-3 z-20">
        <div className="w-9 h-9 rounded-[12px] bg-sky-500/15 text-sky-400 flex items-center justify-center"><Route className="w-5 h-5" /></div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight">Fleet History</h1>
          <p className="text-[10px] text-slate-400 leading-tight">Sant Kabir Eye Hospital · by Mani Ratan Singh</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setRefreshKey((v) => v + 1)} className="p-2.5 rounded-full hover:bg-white/10 text-slate-300" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2.5 rounded-full hover:bg-white/10 text-slate-300" aria-label="Theme">{theme === 'dark' ? '☀' : '☾'}</button>
          <button onClick={async () => { await fetch('/api/history/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); setAuthed(false); }} className="p-2.5 rounded-full hover:bg-white/10 text-slate-300" aria-label="Lock"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <main className="relative flex-1 min-h-0">
        <div className="absolute inset-0"><div ref={mapContainerRef} className="h-full w-full" /></div>

        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center gap-2 z-10">
          <button onClick={() => setVehiclesOpen((v) => !v)} className="h-10 pl-2.5 pr-3 rounded-full border border-white/10 bg-[#0b1728]/85 backdrop-blur-xl flex items-center gap-2 text-xs font-semibold shadow-xl">
            <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${vehicleColor}22` }}><span className="w-2 h-2 rounded-full" style={{ background: vehicleColor }} /></span>
            <span>{selectedId || 'No vehicle'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button onClick={() => setRangeOpen((v) => !v)} className="h-10 px-3 rounded-full border border-white/10 bg-[#0b1728]/85 backdrop-blur-xl flex items-center gap-2 text-xs font-semibold shadow-xl">
            {rangeLabel} <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex p-1 rounded-full border border-white/10 bg-[#0b1728]/85 backdrop-blur-xl text-[11px] font-semibold">
              <button onClick={() => setMode('maps')} className={`px-3 h-7 rounded-full ${mode === 'maps' ? 'bg-white text-slate-900' : 'text-slate-400'}`}>Maps</button>
              <button onClick={() => setMode('trips')} className={`px-3 h-7 rounded-full ${mode === 'trips' ? 'bg-white text-slate-900' : 'text-slate-400'}`}>Trips</button>
            </div>
            <button onClick={() => setQuality((v) => !v)} className={`h-9 px-3 rounded-full border text-[11px] font-semibold ${quality ? 'bg-sky-500 text-slate-950 border-transparent' : 'border-white/10 bg-[#0b1728]/85 text-slate-300'}`}>Quality</button>
            <button onClick={() => setLegendOpen((v) => !v)} className="w-9 h-9 rounded-full border border-white/10 bg-[#0b1728]/85 text-slate-300" aria-label="Key"><Info className="w-4 h-4" /></button>
          </div>
        </div>

        <section className="absolute left-3 bottom-3 right-3 md:right-auto md:w-[560px] rounded-[22px] border border-white/10 bg-[#0b1728]/90 backdrop-blur-xl p-4 shadow-2xl z-10">
          <div className="flex items-start gap-4">
            <div>
              <div className="text-[10px] text-slate-400">{rangeLabel} · {fmtDate(appliedFrom)}</div>
              <div className="flex items-baseline gap-1.5 mt-0.5"><b className="text-[30px] tracking-tight tabular-nums">{stats.km.toFixed(1)}</b><span className="text-xs text-slate-400">km</span></div>
              <div className="text-[11px] text-slate-400 mt-0.5">{trips.length} trip{trips.length === 1 ? '' : 's'} · {stats.stops} stop{stats.stops === 1 ? '' : 's'}</div>
            </div>
            <div className="ml-auto grid grid-cols-2 gap-x-5 gap-y-2 text-[11px]">
              <div><div className="text-[9px] uppercase tracking-wider text-slate-500">Moving</div><div className="font-semibold tabular-nums">{fmtDur(stats.moving)}</div></div>
              <div><div className="text-[9px] uppercase tracking-wider text-slate-500">Sampling</div><div className="font-semibold tabular-nums">{Math.round(stats.interval)}s</div></div>
              <div><div className="text-[9px] uppercase tracking-wider text-slate-500">Accuracy</div><div className="font-semibold tabular-nums">{stats.accuracy}m</div></div>
              <div><div className="text-[9px] uppercase tracking-wider text-slate-500">Poor fixes</div><div className="font-semibold tabular-nums">{stats.badPct}%</div></div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button onClick={() => setPlaying((v) => !v)} className="w-8 h-8 rounded-full bg-white text-slate-900 grid place-items-center" aria-label="Play">{playing ? '❚❚' : '▶'}</button>
            <div className="flex-1">
              <div
                className="relative h-3 rounded-full bg-white/10 overflow-hidden cursor-pointer"
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
                    <button key={b.index} onClick={() => { setSelectedTrip(selectedTrip === b.index ? null : b.index); setTime(b.start); }} className="absolute top-0 bottom-0" style={{ left: `${left}%`, width: `${width}%`, background: mode === 'trips' ? TRIP_COLORS[b.index % TRIP_COLORS.length] : vehicleColor, opacity: selectedTrip === null || selectedTrip === b.index ? 0.95 : 0.25 }} title={`Trip ${b.index + 1}`} />
                  );
                })}
                <div id="fh-head" className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-white" style={{ left: '0%' }} />
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 mt-1 tabular-nums"><span>{fmt(appliedFrom)}</span><span>{fmt((appliedFrom + appliedTo) / 2)}</span><span>{fmt(appliedTo)}</span></div>
            </div>
            <div className="text-xs font-semibold tabular-nums">{fmt(time || appliedFrom)}</div>
          </div>

          <div className="flex gap-1.5 mt-3 overflow-x-auto">
            <button onClick={() => setSelectedTrip(null)} className={`shrink-0 h-7 px-2.5 rounded-full border text-[10px] font-semibold ${selectedTrip === null ? 'border-sky-400/50 bg-sky-500/10' : 'border-white/10 text-slate-400'}`}>All</button>
            {trips.map((t) => (
              <button key={t.index} onClick={() => setSelectedTrip(selectedTrip === t.index ? null : t.index)} className={`shrink-0 h-7 px-2.5 rounded-full border text-[10px] font-semibold flex items-center gap-1.5 ${selectedTrip === t.index ? 'border-sky-400/50 bg-sky-500/10' : 'border-white/10 text-slate-400'}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: mode === 'trips' ? TRIP_COLORS[t.index % TRIP_COLORS.length] : vehicleColor }} />
                Trip {t.index + 1}
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: QUALITY_COLOR[t.quality] }} />
              </button>
            ))}
          </div>

          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Built by <a href="https://mrps.in" className="underline decoration-white/20">Mani Ratan Singh</a> · mrps.in</div>
        </section>

        {vehiclesOpen && (
          <div className="absolute left-3 top-14 w-[300px] rounded-[18px] border border-white/10 bg-[#0b1728]/95 backdrop-blur-xl p-3 shadow-2xl z-30">
            <div className="flex items-center justify-between mb-2"><b className="text-xs">Vehicles</b><button onClick={() => setVehiclesOpen(false)}><X className="w-3.5 h-3.5 text-slate-400" /></button></div>
            <input value={vehicleQuery} onChange={(e) => setVehicleQuery(e.target.value)} placeholder="Search driver or ID" className="w-full h-8 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11px] outline-none" />
            <div className="mt-2 max-h-[300px] overflow-auto">
              {filteredVehicles.map((v) => (
                <button key={v.id} onClick={() => { setSelectedId(v.id); setVehiclesOpen(false); }} className={`w-full flex items-center gap-2 p-2 rounded-lg text-left ${v.id === selectedId ? 'bg-sky-500/10 border border-sky-400/40' : 'hover:bg-white/5 border border-transparent'}`}>
                  <span className="w-2 h-2 rounded-full" style={{ background: getUniqueVehicleColor(v.id).line }} />
                  <span className="min-w-0"><span className="block text-[11px] font-semibold truncate">{v.id}</span><span className="block text-[9px] text-slate-500">{v.points} pts</span></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {rangeOpen && (
          <div className="absolute left-3 top-14 w-[320px] rounded-[18px] border border-white/10 bg-[#0b1728]/98 backdrop-blur-xl p-3 shadow-2xl z-30 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-2"><b className="text-xs">Range</b><button onClick={() => setRangeOpen(false)}><X className="w-3.5 h-3.5 text-slate-400" /></button></div>
            <AppleRangePicker preset={preset} rangeLabel={rangeLabel} fromValue={fromInput} toValue={toInput} minMs={Date.now() - MAX_RANGE_MS} maxMs={Date.now()} onFromChange={setFromInput} onToChange={setToInput} onPreset={applyPreset} onApply={applyCustom} error={error} inline />
          </div>
        )}

        {legendOpen && (
          <div className="absolute right-3 top-16 w-[240px] rounded-[18px] border border-white/10 bg-[#0b1728]/95 backdrop-blur-xl p-3 shadow-2xl z-30 text-[10px]">
            <div className="flex items-center justify-between mb-2"><b className="text-[10px] uppercase tracking-wider text-slate-400">Map key</b><button onClick={() => setLegendOpen(false)}><X className="w-3.5 h-3.5 text-slate-400" /></button></div>
            <div className="flex items-center gap-2 mt-2"><span className="w-6 h-1 rounded" style={{ background: vehicleColor }} /> Trip</div>
            <div className="flex items-center gap-2 mt-2"><span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: vehicleColor }} /> Stop</div>
            <div className="flex items-center gap-2 mt-2"><span className="w-6 border-t-2 border-dashed border-slate-400" /> No data</div>
            {quality && <div className="flex items-center gap-2 mt-2"><span className="w-2.5 h-2.5 rounded-full border-2 border-rose-500" /> Poor fix</div>}
            <div className="mt-3 pt-2 border-t border-white/10 text-slate-500">Esri, HERE, Garmin | Fleet Shield · Mani Ratan Singh</div>
          </div>
        )}
      </main>
    </div>
  );
}
