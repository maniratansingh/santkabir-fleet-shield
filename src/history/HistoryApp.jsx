import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {
  Clock,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  MapPin,
  RefreshCw,
  Route,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { calculateDistanceKm } from '../data/mockData';
import { getUniqueVehicleColor } from '../utils/colors';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const BASE = { lat: 26.797313, lon: 82.718401 };

const DARK_STYLE = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'esri-dark-base': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    'esri-dark-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
    },
  },
  layers: [
    {
      id: 'esri-dark-base-layer',
      type: 'raster',
      source: 'esri-dark-base',
      minzoom: 0,
      maxzoom: 22,
      paint: { 'raster-fade-duration': 0 },
    },
    {
      id: 'esri-dark-labels-layer',
      type: 'raster',
      source: 'esri-dark-labels',
      minzoom: 0,
      maxzoom: 22,
      paint: { 'raster-fade-duration': 0 },
    },
  ],
};

const RANGES = [
  { key: '24h', label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
];

function formatAge(timestamp) {
  if (!timestamp) return '—';
  const seconds = Math.max(1, Math.round((Date.now() - Number(timestamp)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTime(timestamp) {
  if (!timestamp) return '—';
  return new Date(Number(timestamp)).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
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

export default function HistoryApp() {
  const [authed, setAuthed] = useState(null); // null checking, false login, true ready
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [vehicles, setVehicles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [range, setRange] = useState('7d');
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);

  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    setError('');
    try {
      const data = await api('/api/history/vehicles');
      const list = Array.isArray(data.vehicles) ? data.vehicles : [];
      setVehicles(list);
      setAuthed(true);
      setSelectedId((current) =>
        current && list.some((vehicle) => vehicle.id === current)
          ? current
          : list[0]?.id || ''
      );
    } catch (err) {
      if (err.status === 401) {
        setAuthed(false);
      } else {
        setError(err.message || 'Could not load history');
        setAuthed(true);
      }
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const rangeMs = useMemo(
    () => RANGES.find((item) => item.key === range)?.ms || RANGES[1].ms,
    [range]
  );

  useEffect(() => {
    if (authed !== true || !selectedId) {
      setPoints([]);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const to = Date.now();
        const from = to - rangeMs;
        const data = await api(
          `/api/history?id=${encodeURIComponent(selectedId)}&from=${from}&to=${to}`
        );
        if (!cancelled) setPoints(Array.isArray(data.points) ? data.points : []);
      } catch (err) {
        if (err.status === 401) {
          setAuthed(false);
        } else if (!cancelled) {
          setError(err.message || 'Could not load history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [authed, selectedId, rangeMs, refreshKey]);

  useEffect(() => {
    if (authed !== true || !mapContainerRef.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: DARK_STYLE,
      center: [BASE.lon, BASE.lat],
      zoom: 7.2,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      setMapReady(true);
      map.resize();
    });
    const handleResize = () => map.resize();
    window.addEventListener('resize', handleResize);
    mapRef.current = map;
    return () => {
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [authed]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const coordinates = points
      .map((point) => [Number(point.lon), Number(point.lat)])
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));

    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates.length > 1 ? coordinates : [],
      },
      properties: {},
    };

    if (map.getSource('history-trail')) {
      map.getSource('history-trail').setData(geojson);
    } else {
      map.addSource('history-trail', { type: 'geojson', data: geojson });
      map.addLayer({
        id: 'history-trail-line',
        type: 'line',
        source: 'history-trail',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#38bdf8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 5, 14, 7],
          'line-opacity': 0.92,
        },
      });
    }

    if (coordinates.length > 0) {
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];

      const startEl = document.createElement('div');
      startEl.style.cssText =
        'width:14px;height:14px;border-radius:9999px;background:#30d158;border:3px solid #052e16;box-shadow:0 0 0 4px rgba(48,209,88,.18);';
      markersRef.current.push(
        new maplibregl.Marker({ element: startEl }).setLngLat(first).addTo(map)
      );

      if (coordinates.length > 1) {
        const endEl = document.createElement('div');
        endEl.style.cssText =
          'width:14px;height:14px;border-radius:9999px;background:#ff453a;border:3px solid #450a0a;box-shadow:0 0 0 4px rgba(255,69,58,.18);';
        markersRef.current.push(
          new maplibregl.Marker({ element: endEl }).setLngLat(last).addTo(map)
        );
      }

      const bounds = coordinates.reduce(
        (acc, coordinate) => acc.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      );
      map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 500 });
    }
  }, [points, mapReady]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      await api('/api/history/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setAuthed(true);
      await loadVehicles();
    } catch (err) {
      setLoginError(err.message || 'Invalid password');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/history/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) {
      // Clear the local view regardless.
    }
    setAuthed(false);
    setVehicles([]);
    setSelectedId('');
    setPoints([]);
  };

  const handleDelete = async (all = false) => {
    const target = all ? 'all history' : `history for ${selectedId}`;
    if (!window.confirm(`Delete ${target}? This cannot be undone.`)) return;
    try {
      await api('/api/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(all ? { all: true } : { id: selectedId }),
      });
      setPoints([]);
      await loadVehicles();
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedId);
  const vColor = selectedId ? getUniqueVehicleColor(selectedId).line : '#38bdf8';
  const distanceKm = points.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = points[index - 1];
    return (
      total +
      calculateDistanceKm(
        Number(previous.lat),
        Number(previous.lon),
        Number(point.lat),
        Number(point.lon)
      )
    );
  }, 0);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (authed === null) {
    return (
      <div className="min-h-screen w-screen bg-[#060d17] text-slate-200 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <ShieldCheck className="w-5 h-5 text-sky-400" />
          Checking history access…
        </div>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div className="min-h-screen w-screen bg-[#060d17] text-slate-100 flex items-center justify-center p-5">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-[26px] border border-white/10 bg-[#0b1728]/95 p-6 shadow-2xl"
        >
          <div className="w-12 h-12 rounded-[16px] bg-sky-500/15 text-sky-400 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Fleet History</h1>
          <p className="text-sm text-slate-400 mt-1">
            Restricted access. Enter the history password to continue.
          </p>

          <label htmlFor="history-password" className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mt-5 mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              id="history-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              className="w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-2.5 pr-11 text-sm text-slate-100 outline-none focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20"
              placeholder="Enter password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-full text-slate-400 hover:text-slate-200"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {loginError && (
            <div className="mt-3 rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={loggingIn || !password}
            className="mt-4 w-full min-h-11 rounded-[12px] bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors"
          >
            {loggingIn ? 'Checking…' : 'Open history'}
          </button>

          <div className="mt-5 pt-4 border-t border-white/10 text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Sant Kabir Eye Hospital · Basti · 30-minute snapshots
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#060d17] text-slate-100 flex flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/10 bg-[#081321]/95 px-4 sm:px-5 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-[12px] bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
          <Route className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight leading-tight">Fleet History</h1>
          <p className="text-[11px] text-slate-400 leading-tight mt-0.5">
            30-minute snapshots · 7 days · {vehicles.length} vehicles
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="ui-press p-2.5 rounded-full text-slate-300 hover:bg-white/5"
            aria-label="Refresh history"
            title="Refresh history"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="ui-press p-2.5 rounded-full text-slate-300 hover:bg-white/5"
            aria-label="Lock history"
            title="Lock history"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="hidden md:flex w-[290px] shrink-0 border-r border-white/10 bg-[#081321]/70 flex-col min-h-0">
          <div className="p-3 border-b border-white/10">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Range
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {RANGES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setRange(item.key)}
                  className={`min-h-9 rounded-[10px] text-xs font-semibold transition-colors ${
                    range === item.key
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Vehicles
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {vehicles.length === 0 && !vehiclesLoading && (
              <div className="px-3 py-6 text-xs text-slate-500 text-center">
                No history yet.
              </div>
            )}
            {vehicles.map((vehicle) => {
              const color = getUniqueVehicleColor(vehicle.id).line;
              const isSelected = vehicle.id === selectedId;
              return (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => setSelectedId(vehicle.id)}
                  className={`w-full text-left rounded-[12px] border px-3 py-2.5 transition-colors ${
                    isSelected
                      ? 'border-sky-400/50 bg-sky-500/10'
                      : 'border-transparent hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}88` }}
                    />
                    <span className="text-sm font-mono font-semibold truncate">{vehicle.id}</span>
                  </div>
                  <div className="mt-1 pl-[18px] text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {formatAge(vehicle.last_seen)} · {vehicle.points} points
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t border-white/10 space-y-1.5">
            <button
              type="button"
              onClick={() => handleDelete(false)}
              disabled={!selectedId}
              className="w-full min-h-9 rounded-[10px] border border-rose-500/25 bg-rose-500/10 text-rose-300 text-xs font-semibold disabled:opacity-40"
            >
              Delete this vehicle
            </button>
            <button
              type="button"
              onClick={() => handleDelete(true)}
              className="w-full min-h-9 rounded-[10px] border border-white/10 text-slate-400 hover:text-rose-300 hover:border-rose-500/25 text-xs font-semibold"
            >
              Delete all history
            </button>
          </div>
        </aside>

        <main className="relative flex-1 min-w-0 overflow-hidden">
          <div className="absolute inset-0">
            <div ref={mapContainerRef} className="h-full w-full" />
          </div>

          <div className="md:hidden absolute top-3 left-3 right-3 z-10 flex gap-2">
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="flex-1 min-w-0 rounded-[10px] border border-white/10 bg-[#0b1728]/95 px-3 py-2 text-xs text-slate-100"
            >
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.id}
                </option>
              ))}
            </select>
            <select
              value={range}
              onChange={(event) => setRange(event.target.value)}
              className="rounded-[10px] border border-white/10 bg-[#0b1728]/95 px-3 py-2 text-xs text-slate-100"
            >
              {RANGES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="absolute left-3 bottom-3 z-10 max-w-[calc(100%-1.5rem)] rounded-[16px] border border-white/10 bg-[#0b1728]/95 backdrop-blur px-3.5 py-3 shadow-xl">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: vColor, boxShadow: `0 0 6px ${vColor}88` }}
              />
              <span className="font-mono text-sm font-bold truncate">{selectedId || 'No vehicle'}</span>
              <span className="text-[11px] text-slate-400">· {range === '24h' ? '24 hours' : '7 days'}</span>
            </div>

            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-1.5 text-[11px]">
              <div>
                <div className="text-slate-500">Points</div>
                <div className="font-mono font-semibold text-slate-200">{points.length}</div>
              </div>
              <div>
                <div className="text-slate-500">Distance</div>
                <div className="font-mono font-semibold text-slate-200">{distanceKm.toFixed(1)} km</div>
              </div>
              <div>
                <div className="text-slate-500">First</div>
                <div className="font-mono font-semibold text-slate-200">{formatTime(firstPoint?.device_time)}</div>
              </div>
              <div>
                <div className="text-slate-500">Last</div>
                <div className="font-mono font-semibold text-slate-200">{formatTime(lastPoint?.device_time)}</div>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
              <MapPin className="w-3 h-3" />
              Green start · Red end · 30-minute snapshots
            </div>
          </div>

          {loading && (
            <div className="absolute inset-0 z-20 bg-[#060d17]/40 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
              <div className="rounded-full border border-white/10 bg-[#0b1728]/95 px-4 py-2 text-xs text-slate-300 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                Loading history…
              </div>
            </div>
          )}

          {!loading && points.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-6">
              <div className="max-w-xs text-center rounded-[18px] border border-white/10 bg-[#0b1728]/95 px-5 py-4 shadow-xl">
                <Route className="w-6 h-6 text-slate-500 mx-auto" />
                <p className="mt-2 text-sm font-semibold text-slate-200">No history in this range</p>
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                  The 30-minute collector stores one point per vehicle per bucket. Try the 7-day range.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute top-3 left-3 right-3 md:left-3 md:right-auto md:max-w-sm z-30 rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}
        </main>
      </div>

      {selectedVehicle && (
        <div className="md:hidden shrink-0 border-t border-white/10 bg-[#081321] px-4 py-2 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Last point {formatAge(selectedVehicle.last_seen)}
          </span>
          <button
            type="button"
            onClick={() => handleDelete(false)}
            className="flex items-center gap-1 text-rose-300 font-semibold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
