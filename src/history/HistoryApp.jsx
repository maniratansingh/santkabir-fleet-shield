import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {
  Clock,
  Eye,
  EyeOff,
  Info,
  Lock,
  LogOut,
  MapPin,
  Moon,
  RefreshCw,
  Route,
  ShieldCheck,
  Sun,
  Trash2,
} from 'lucide-react';
import { getUniqueVehicleColor } from '../utils/colors';
import AppleRangePicker from './AppleRangePicker';
import {
  DAY_MS,
  MAX_RANGE_MS,
  fromLocalInput,
  toLocalInput,
} from './dateRange';

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

const LIGHT_STYLE = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'esri-light-base': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    'esri-light-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
    },
  },
  layers: [
    {
      id: 'esri-light-base-layer',
      type: 'raster',
      source: 'esri-light-base',
      minzoom: 0,
      maxzoom: 22,
      paint: { 'raster-fade-duration': 0 },
    },
    {
      id: 'esri-light-labels-layer',
      type: 'raster',
      source: 'esri-light-labels',
      minzoom: 0,
      maxzoom: 22,
      paint: { 'raster-fade-duration': 0 },
    },
  ],
};

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

function preciseDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const dLon = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((Number(lat1) * Math.PI) / 180) *
      Math.cos((Number(lat2) * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TRIP_COLORS = [
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#64748b',
];

function offsetTripPoints(points, meters) {
  const coords = points.map((point) => [Number(point.lon), Number(point.lat)]);
  if (!meters || coords.length < 2) {
    return points.map((point) => ({ lon: Number(point.lon), lat: Number(point.lat) }));
  }
  return coords.map((coord, index) => {
    const previous = coords[Math.max(0, index - 1)];
    const next = coords[Math.min(coords.length - 1, index + 1)];
    const dLon = next[0] - previous[0];
    const dLat = next[1] - previous[1];
    const length = Math.hypot(dLon, dLat) || 1;
    const lat = coord[1] + (dLon / length) * (meters / 111320);
    const lon =
      coord[0] -
      (dLat / length) * (meters / (111320 * Math.cos((coord[1] * Math.PI) / 180)));
    return { lon: Number(lon.toFixed(6)), lat: Number(lat.toFixed(6)) };
  });
}

function buildTrips(points) {
  if (!points.length) return [];
  const dayKey = (timestamp) =>
    Math.floor((Number(timestamp) + 5.5 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000));

  const raw = [];
  let current = [];
  let previousTime = null;
  let previousDay = null;

  points.forEach((point, index) => {
    const timestamp = Number(point.device_time);
    const day = dayKey(timestamp);
    if (
      current.length > 0 &&
      ((Number.isFinite(timestamp) &&
        Number.isFinite(previousTime) &&
        timestamp - previousTime > 15 * 60 * 1000) ||
        day !== previousDay)
    ) {
      raw.push(current);
      current = [];
    }
    current.push({ ...point, globalIndex: index });
    previousTime = timestamp;
    previousDay = day;
  });
  if (current.length) raw.push(current);

  return raw.map((tripPoints, index) => {
    const first = tripPoints[0];
    const last = tripPoints[tripPoints.length - 1];
    let distance = 0;
    for (let pointIndex = 1; pointIndex < tripPoints.length; pointIndex += 1) {
      const before = tripPoints[pointIndex - 1];
      const after = tripPoints[pointIndex];
      distance += preciseDistanceKm(before.lat, before.lon, after.lat, after.lon);
    }

    const previous = index > 0 ? raw[index - 1] : null;
    const isReturn = Boolean(
      previous &&
        preciseDistanceKm(
          first.lat,
          first.lon,
          previous[previous.length - 1].lat,
          previous[previous.length - 1].lon
        ) < 2 &&
        preciseDistanceKm(last.lat, last.lon, previous[0].lat, previous[0].lon) < 2
    );

    return {
      index,
      points: tripPoints,
      start: Number(first.device_time),
      end: Number(last.device_time),
      distance,
      color: TRIP_COLORS[index % TRIP_COLORS.length],
      isReturn,
      displayPoints: offsetTripPoints(tripPoints, isReturn ? 55 : 0),
    };
  });
}

function TripSwatch({ trip }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <path
        d="M4 14 C7.5 10.5, 10.5 7.5, 14 4"
        fill="none"
        stroke={trip.color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={trip.isReturn ? '3 3' : undefined}
      />
      <circle cx="4" cy="14" r="1.9" fill={trip.color} />
      <circle cx="14" cy="4" r="1.9" fill={trip.color} />
    </svg>
  );
}

function TripList({ trips, selectedTrip, onSelect, onAll }) {
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onAll}
        aria-pressed={selectedTrip === null}
        className={`w-full rounded-[12px] border px-2.5 py-2 text-left transition-all duration-200 ${
          selectedTrip === null
            ? 'border-sky-400/50 bg-sky-500/10 text-slate-900 dark:text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
            : 'border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/[0.04]'
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold">All trips</span>
          <span className="rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-500 dark:text-slate-300">
            {trips.length}
          </span>
        </span>
      </button>

      <div className="my-1 h-px bg-slate-200/70 dark:bg-white/5" />

      {trips.map((trip) => {
        const selected = selectedTrip === trip.index;
        return (
          <button
            key={trip.index}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(trip.index)}
            style={
              selected
                ? { borderColor: `${trip.color}66`, backgroundColor: `${trip.color}14` }
                : undefined
            }
            className={`w-full rounded-[12px] border px-2.5 py-2 text-left transition-all duration-200 ${
              selected
                ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'border-transparent hover:bg-slate-200/50 dark:hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2">
              <TripSwatch trip={trip} />
              <span className="truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                Trip {trip.index + 1}
              </span>
              {trip.isReturn && (
                <span
                  title="Inferred when this trip starts near the previous trip’s end and finishes near its start."
                  className="shrink-0 rounded-full border border-dashed border-slate-400/70 px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:border-white/25 dark:text-slate-300"
                >
                  Return
                </span>
              )}
              <span className="ml-auto shrink-0 text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                {trip.distance.toFixed(1)} km
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 pl-[26px] text-[9px] tabular-nums text-slate-500 dark:text-slate-400">
              <span className="truncate">
                {formatTime(trip.start)} → {formatTime(trip.end)}
              </span>
              <span className="shrink-0">{trip.points.length} pts</span>
            </div>
          </button>
        );
      })}

      {trips.some((trip) => trip.isReturn) && (
        <p className="flex items-start gap-1.5 px-1.5 pt-2 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">
          <Info className="mt-[1px] h-3 w-3 shrink-0" />
          <span>
            Return is inferred when a trip starts near the previous trip’s end and finishes
            near its start — not from GPS heading.
          </span>
        </p>
      )}
    </div>
  );
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

function ThemeButton({ theme, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="ui-press p-2.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
    >
      {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-sky-600" />}
    </button>
  );
}

const HISTORY_LEGEND = [
  {
    symbol: <span className="block w-2.5 h-2.5 rounded-full bg-sky-500 border border-sky-900" />,
    label: 'Measured point',
  },
  {
    symbol: <span className="block w-4 h-4 rounded-full bg-amber-500/30 border-2 border-amber-400" />,
    label: 'Low accuracy (>50 m)',
  },
  {
    symbol: <span className="block w-3.5 h-3.5 rounded-full bg-sky-500/15 border-2 border-sky-400" />,
    label: 'Buffered upload',
  },
  {
    symbol: <span className="block w-5 border-t-2 border-sky-500" />,
    label: 'Measured link',
  },
  {
    symbol: <span className="block w-5 border-t-2 border-dashed border-sky-400/80" />,
    label: 'Return trip · offset (inferred)',
  },
  {
    symbol: <span className="block w-5 border-t border-dotted border-slate-400/70" />,
    label: 'No data',
  },
  {
    symbol: <span className="block w-5 border-t-2 border-dashed border-amber-500" />,
    label: 'Suspect jump (>150 km/h)',
  },
];

function HistoryLegend() {
  return (
    <div className="space-y-1.5">
      {HISTORY_LEGEND.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-5 shrink-0 flex justify-center">{item.symbol}</span>
          <span className="text-[10px] text-slate-600 dark:text-slate-300">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function HistoryApp() {
  const [authed, setAuthed] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      return localStorage.getItem('sk_history_theme') === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  const [vehicles, setVehicles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [points, setPoints] = useState([]);
  const [drawnCount, setDrawnCount] = useState(0);
  const trips = useMemo(() => buildTrips(points), [points]);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const selectedTripData = selectedTrip === null ? null : trips[selectedTrip] || null;
  const [tripsOpen, setTripsOpen] = useState(true);
  const [mobileTripsOpen, setMobileTripsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [preset, setPreset] = useState('7d');
  const [rangeLabel, setRangeLabel] = useState('Last 7 days');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [appliedFrom, setAppliedFrom] = useState(0);
  const [appliedTo, setAppliedTo] = useState(0);
  const [mobileRangeOpen, setMobileRangeOpen] = useState(false);
  const [mobileKeyOpen, setMobileKeyOpen] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRafRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('sk_history_theme', theme);
    } catch (e) {
      // ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    const to = Date.now();
    const from = to - MAX_RANGE_MS;
    setFromInput(toLocalInput(from));
    setToInput(toLocalInput(to));
    setAppliedFrom(from);
    setAppliedTo(to);
    setPreset('7d');
    setRangeLabel('Last 7 days');
  }, []);

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

  useEffect(() => {
    if (authed !== true || !selectedId || !appliedFrom || !appliedTo) {
      setPoints([]);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api(
          `/api/history?id=${encodeURIComponent(selectedId)}&from=${appliedFrom}&to=${appliedTo}`
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
  }, [authed, selectedId, appliedFrom, appliedTo, refreshKey]);

  useEffect(() => {
    setSelectedTrip(null);
  }, [selectedId, appliedFrom, appliedTo]);

  useEffect(() => {
    if (authed !== true || !mapContainerRef.current) return undefined;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      setMapReady(false);
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE,
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
  }, [authed, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    if (drawRafRef.current) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }

    if (startMarkerRef.current) {
      try { startMarkerRef.current.remove(); } catch (e) {}
      startMarkerRef.current = null;
    }
    if (endMarkerRef.current) {
      try { endMarkerRef.current.remove(); } catch (e) {}
      endMarkerRef.current = null;
    }

    const isSampleTrail = String(selectedId).toUpperCase().startsWith('SAMPLE ');
    const validFeatures = [];
    const returnFeatures = [];
    const gapFeatures = [];
    const suspectFeatures = [];
    const pointFeatures = [];
    const haloFeatures = [];

    for (const trip of trips) {
      const tripPoints = trip.points;
      const displayPoints = trip.displayPoints;
      const suspectLocalIndexes = new Set();
      const intervals = [];

      for (let index = 1; index < tripPoints.length; index += 1) {
        const dt = (Number(tripPoints[index].device_time) - Number(tripPoints[index - 1].device_time)) / 1000;
        if (Number.isFinite(dt) && dt > 0) intervals.push(dt);
      }
      intervals.sort((a, b) => a - b);
      const median = intervals.length ? intervals[Math.floor(intervals.length / 2)] : 30;
      const gapThreshold = Math.max(90, median * 3);

      for (let index = 1; index < tripPoints.length; index += 1) {
        const previous = tripPoints[index - 1];
        const current = tripPoints[index];
        const a = displayPoints[index - 1];
        const b = displayPoints[index];
        const dtSeconds = (Number(current.device_time) - Number(previous.device_time)) / 1000;
        const distanceKm = preciseDistanceKm(previous.lat, previous.lon, current.lat, current.lon);
        const speedKmh = dtSeconds > 0 ? distanceKm / (dtSeconds / 3600) : Infinity;

        let type = 'valid';
        if (!Number.isFinite(dtSeconds) || dtSeconds > gapThreshold) {
          type = 'gap';
        } else if (speedKmh > 150) {
          type = 'suspect';
          suspectLocalIndexes.add(index);
        }

        const feature = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [[a.lon, a.lat], [b.lon, b.lat]],
          },
          properties: {
            i: previous.globalIndex,
            tripIndex: trip.index,
            color: trip.color,
            isReturn: trip.isReturn,
          },
        };

        if (type === 'gap') gapFeatures.push(feature);
        else if (type === 'suspect') suspectFeatures.push(feature);
        else if (trip.isReturn) returnFeatures.push(feature);
        else validFeatures.push(feature);
      }

      tripPoints.forEach((point, index) => {
        const display = displayPoints[index] || {
          lon: Number(point.lon),
          lat: Number(point.lat),
        };
        const accuracy = Number(point.accuracy) || 0;
        const bufferedMs = Number(point.received_at) - Number(point.device_time);
        let kind = 'normal';
        if (suspectLocalIndexes.has(index)) kind = 'suspect';
        else if (accuracy > 50) kind = 'low';
        else if (!isSampleTrail && Number.isFinite(bufferedMs) && bufferedMs > 5 * 60 * 1000) {
          kind = 'buffered';
        }
        const feature = {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [display.lon, display.lat] },
          properties: {
            i: point.globalIndex,
            tripIndex: trip.index,
            color: trip.color,
            kind,
          },
        };
        pointFeatures.push(feature);
        if (kind === 'low') haloFeatures.push(feature);
      });
    }

    const collection = (features) => ({ type: 'FeatureCollection', features });
    const ensureSource = (id, data, layerId, layer) => {
      if (map.getSource(id)) {
        map.getSource(id).setData(data);
      } else {
        map.addSource(id, { type: 'geojson', data });
        map.addLayer({ id: layerId, source: id, ...layer });
      }
    };

    ensureSource('history-valid', collection(validFeatures), 'history-valid-line', {
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      filter: ['<=', ['get', 'i'], -2],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 4.5, 14, 6],
        'line-opacity': 0.9,
      },
    });

    ensureSource('history-return', collection(returnFeatures), 'history-return-line', {
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      filter: ['<=', ['get', 'i'], -2],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 4.5, 14, 6],
        'line-dasharray': [4, 4],
        'line-opacity': 0.9,
      },
    });

    ensureSource('history-gap', collection(gapFeatures), 'history-gap-line', {
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      filter: ['<=', ['get', 'i'], -2],
      paint: {
        'line-color': '#94a3b8',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 10, 2.5, 14, 3.5],
        'line-dasharray': [1, 4],
        'line-opacity': 0.45,
      },
    });

    ensureSource('history-suspect', collection(suspectFeatures), 'history-suspect-line', {
      type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      filter: ['<=', ['get', 'i'], -2],
      paint: {
        'line-color': '#f59e0b',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 10, 4.5, 14, 6],
        'line-dasharray': [2, 2],
        'line-opacity': 0.95,
      },
    });

    ensureSource('history-halos', collection(haloFeatures), 'history-halo', {
      type: 'circle',
      filter: ['all', ['==', ['get', 'kind'], 'low'], ['<=', ['get', 'i'], -1]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 22],
        'circle-color': 'rgba(245, 158, 11, 0.16)',
        'circle-stroke-width': 0,
      },
    });

    ensureSource('history-points', collection(pointFeatures), 'history-point-layer', {
      type: 'circle',
      filter: ['<=', ['get', 'i'], -1],
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'kind'], 'normal'],
          ['interpolate', ['linear'], ['zoom'], 6, 2, 12, 3.5, 16, 5],
          ['interpolate', ['linear'], ['zoom'], 6, 4, 12, 5.5, 16, 7],
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'kind'], 'low'], '#f59e0b',
          ['==', ['get', 'kind'], 'buffered'], 'rgba(14,165,233,0.15)',
          ['==', ['get', 'kind'], 'suspect'], '#f59e0b',
          ['get', 'color'],
        ],
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'kind'], 'low'], '#fbbf24',
          ['==', ['get', 'kind'], 'buffered'], '#38bdf8',
          ['==', ['get', 'kind'], 'suspect'], '#ef4444',
          '#082f49',
        ],
        'circle-stroke-width': 1.5,
      },
    });

    if (points.length === 0) {
      setDrawnCount(0);
      return undefined;
    }

    const start = points[0];
    const end = points[points.length - 1];

    const startEl = document.createElement('div');
    startEl.style.cssText =
      'width:14px;height:14px;border-radius:9999px;background:#30d158;border:3px solid #052e16;box-shadow:0 0 0 4px rgba(48,209,88,.18);';
    startMarkerRef.current = new maplibregl.Marker({ element: startEl })
      .setLngLat([Number(start.lon), Number(start.lat)])
      .addTo(map);

    if (points.length > 1) {
      const endEl = document.createElement('div');
      endEl.style.cssText =
        'width:14px;height:14px;border-radius:9999px;background:#ff453a;border:3px solid #450a0a;box-shadow:0 0 0 4px rgba(255,69,58,.18);display:none;';
      endMarkerRef.current = new maplibregl.Marker({ element: endEl })
        .setLngLat([Number(end.lon), Number(end.lat)])
        .addTo(map);
    }

    setDrawnCount(0);
    let cancelled = false;
    let drawn = 0;
    const total = points.length;
    const chunk = Math.max(1, Math.ceil(total / 100));

    const step = () => {
      if (cancelled) return;
      drawn = Math.min(total, drawn + chunk);
      setDrawnCount(drawn);
      if (drawn < total) {
        drawRafRef.current = requestAnimationFrame(step);
      } else {
        drawRafRef.current = null;
      }
    };
    drawRafRef.current = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      if (drawRafRef.current) {
        cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
    };
  }, [points, mapReady, selectedId, trips]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const pointFilter = ['<=', ['get', 'i'], drawnCount - 1];
    const segmentFilter = ['<=', ['get', 'i'], drawnCount - 2];

    if (map.getLayer('history-point-layer')) map.setFilter('history-point-layer', pointFilter);
    if (map.getLayer('history-halo')) {
      map.setFilter('history-halo', ['all', ['==', ['get', 'kind'], 'low'], pointFilter]);
    }
    ['history-valid-line', 'history-return-line', 'history-gap-line', 'history-suspect-line'].forEach((id) => {
      if (map.getLayer(id)) map.setFilter(id, segmentFilter);
    });

    if (startMarkerRef.current) {
      startMarkerRef.current.getElement().style.display = drawnCount > 0 ? '' : 'none';
    }
    if (endMarkerRef.current) {
      endMarkerRef.current.getElement().style.display =
        points.length > 0 && drawnCount >= points.length ? '' : 'none';
    }
  }, [drawnCount, mapReady, points.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const opacity = selectedTrip === null
      ? 0.9
      : ['case', ['==', ['get', 'tripIndex'], selectedTrip], 1, 0.12];
    const pointOpacity = selectedTrip === null
      ? 0.95
      : ['case', ['==', ['get', 'tripIndex'], selectedTrip], 1, 0.12];
    const selectedIsReturn = selectedTrip !== null && Boolean(trips[selectedTrip]?.isReturn);

    ['history-valid-line', 'history-return-line', 'history-suspect-line'].forEach((id) => {
      if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', opacity);
    });
    if (map.getLayer('history-return-line')) {
      // A selected return trip becomes a solid offset line so it reads as the hero route.
      map.setPaintProperty('history-return-line', 'line-dasharray', selectedIsReturn ? null : [4, 4]);
    }
    if (map.getLayer('history-point-layer')) {
      map.setPaintProperty('history-point-layer', 'circle-opacity', pointOpacity);
      map.setPaintProperty('history-point-layer', 'circle-stroke-opacity', pointOpacity);
    }
    if (map.getLayer('history-halo')) {
      map.setPaintProperty('history-halo', 'circle-opacity', selectedTrip === null ? 0.8 : 0.2);
    }
  }, [selectedTrip, mapReady, trips]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const trip = selectedTrip !== null ? trips[selectedTrip] : null;
    const sourcePoints = trip ? trip.points : points;
    const coordinates = sourcePoints
      .map((point) => [Number(point.lon), Number(point.lat)])
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
    if (coordinates.length === 0) return;

    const bounds = coordinates.reduce(
      (acc, coordinate) => acc.extend(coordinate),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
    );
    map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 500 });
  }, [selectedTrip, trips, mapReady, points.length]);

  const applyPreset = (key) => {
    const now = Date.now();
    let from = now - MAX_RANGE_MS;
    let to = now;
    let label = 'Last 7 days';

    if (key === '24h') {
      from = now - DAY_MS;
      to = now;
      label = 'Last 24 hours';
    } else if (key === '7d') {
      from = now - MAX_RANGE_MS;
      to = now;
      label = 'Last 7 days';
    } else if (key === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      from = start.getTime();
      to = now;
      label = 'Today';
    } else if (key === 'yesterday') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      to = start.getTime() - 1;
      from = to - DAY_MS + 1;
      label = 'Yesterday';
    }

    setFromInput(toLocalInput(from));
    setToInput(toLocalInput(to));
    setAppliedFrom(from);
    setAppliedTo(to);
    setPreset(key);
    setRangeLabel(label);
    setError('');
    setRefreshKey((value) => value + 1);
    setMobileRangeOpen(false);
  };

  const applyCustom = () => {
    const from = fromLocalInput(fromInput);
    const to = fromLocalInput(toInput);
    const now = Date.now();

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      setError('Choose a valid date and time');
      return;
    }
    if (from >= to) {
      setError('“From” must be before “To”');
      return;
    }
    if (from < now - MAX_RANGE_MS - 60 * 1000) {
      setError('History is limited to the last 7 days');
      return;
    }
    if (to > now + 60 * 1000) {
      setError('“To” cannot be in the future');
      return;
    }

    setAppliedFrom(from);
    setAppliedTo(to);
    setPreset('custom');
    setRangeLabel('Custom range');
    setError('');
    setMobileRangeOpen(false);
    setRefreshKey((value) => value + 1);
  };

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
  const vColor = selectedId ? getUniqueVehicleColor(selectedId).line : '#0ea5e9';
  const distanceKm = points.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = points[index - 1];
    return (
      total +
      preciseDistanceKm(
        previous.lat,
        previous.lon,
        point.lat,
        point.lon
      )
    );
  }, 0);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (authed === null) {
    return (
      <div className="min-h-screen w-screen bg-slate-100 dark:bg-[#060d17] text-slate-700 dark:text-slate-200 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-5 h-5 text-sky-500" />
          Checking history access…
        </div>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div className="relative min-h-screen w-screen bg-slate-100 dark:bg-[#060d17] text-slate-900 dark:text-slate-100 flex items-center justify-center p-5">
        <div className="absolute top-4 right-4">
          <ThemeButton theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        </div>
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-[26px] border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1728]/95 p-6 shadow-2xl"
        >
          <div className="w-12 h-12 rounded-[16px] bg-sky-500/15 text-sky-500 dark:text-sky-400 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Fleet History</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Restricted access. Enter the history password to continue.
          </p>

          <label
            htmlFor="history-password"
            className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mt-5 mb-1.5"
          >
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
              className="w-full rounded-[12px] border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2.5 pr-11 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20"
              placeholder="Enter password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {loginError && (
            <div className="mt-3 rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={loggingIn || !password}
            className="mt-4 w-full min-h-11 rounded-[12px] bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white dark:text-slate-950 font-semibold text-sm transition-colors"
          >
            {loggingIn ? 'Checking…' : 'Open history'}
          </button>

          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-white/10 text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Sant Kabir Eye Hospital · Basti · 30-second history
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-100 dark:bg-[#060d17] text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden">
      <header className="shrink-0 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#081321]/95 px-4 sm:px-5 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-[12px] bg-sky-500/15 text-sky-500 dark:text-sky-400 flex items-center justify-center shrink-0">
          <Route className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight leading-tight">Fleet History</h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
            30-second samples · 7 days · {vehicles.length} {vehicles.length === 1 ? 'vehicle' : 'vehicles'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeButton theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="ui-press p-2.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10"
            aria-label="Refresh history"
            title="Refresh history"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="ui-press p-2.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10"
            aria-label="Lock history"
            title="Lock history"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="hidden md:flex w-[300px] shrink-0 border-r border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#081321]/70 flex-col min-h-0">
          <div className="p-3 border-b border-slate-200 dark:border-white/10">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Select period
            </div>
            <AppleRangePicker
              preset={preset}
              rangeLabel={rangeLabel}
              fromValue={fromInput}
              toValue={toInput}
              minMs={Date.now() - MAX_RANGE_MS}
              maxMs={Date.now()}
              onFromChange={setFromInput}
              onToChange={setToInput}
              onPreset={applyPreset}
              onApply={applyCustom}
              error={error}
            />
          </div>

          <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Map key
            </div>
            <HistoryLegend />
          </div>

          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Vehicles
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {vehicles.length === 0 && !vehiclesLoading && (
              <div className="px-3 py-6 text-xs text-slate-500 text-center">No history yet.</div>
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
                      ? 'border-sky-400/60 bg-sky-500/10'
                      : 'border-transparent hover:bg-slate-200/60 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}88` }}
                    />
                    <span className="text-sm font-mono font-semibold truncate">{vehicle.id}</span>
                  </div>
                  <div className="mt-1 pl-[18px] text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {formatAge(vehicle.last_seen)} · {vehicle.points} points
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-white/10 space-y-1.5">
            <button
              type="button"
              onClick={() => handleDelete(false)}
              disabled={!selectedId}
              className="w-full min-h-9 rounded-[10px] border border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs font-semibold disabled:opacity-40"
            >
              Delete this vehicle
            </button>
            <button
              type="button"
              onClick={() => handleDelete(true)}
              className="w-full min-h-9 rounded-[10px] border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 hover:border-rose-500/25 text-xs font-semibold"
            >
              Delete all history
            </button>
          </div>
        </aside>

        <main className="relative flex-1 min-w-0 overflow-hidden">
          <div className="absolute inset-0">
            <div ref={mapContainerRef} className="history-map h-full w-full" />
          </div>

          {trips.length > 0 && (
            <div className="hidden md:flex absolute left-3 top-3 z-20 w-[300px] max-h-[48vh] flex-col rounded-[18px] border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#0b1728]/85 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_40px_-12px_rgba(2,6,23,0.45)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_40px_-12px_rgba(2,6,23,0.65)] overflow-hidden">
              <button
                type="button"
                onClick={() => setTripsOpen((value) => !value)}
                className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200/70 dark:border-white/[0.06]"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Trips
                  </span>
                  <span className="rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-500 dark:text-slate-300">
                    {trips.length}
                  </span>
                </span>
                <span className="text-[10px] font-medium text-slate-500">
                  {tripsOpen ? 'Hide' : 'Show'}
                </span>
              </button>
              {tripsOpen && (
                <div className="overflow-y-auto p-2">
                  <TripList
                    trips={trips}
                    selectedTrip={selectedTrip}
                    onSelect={setSelectedTrip}
                    onAll={() => setSelectedTrip(null)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="md:hidden absolute top-3 left-3 right-3 z-10">
            <div className="flex gap-2">
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="flex-1 min-w-0 rounded-[10px] border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1728]/95 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              >
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMobileRangeOpen(true);
                }}
                className="rounded-[10px] border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1728]/95 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-semibold"
              >
                {rangeLabel}
              </button>
              <button
                type="button"
                onClick={() => setMobileKeyOpen(true)}
                aria-label="Map key"
                className="rounded-[10px] border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1728]/95 p-2 text-slate-700 dark:text-slate-200"
              >
                <Info className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMobileTripsOpen(true)}
                aria-label="Trips"
                className="rounded-[10px] border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1728]/95 p-2 text-slate-700 dark:text-slate-200"
              >
                <Route className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="absolute left-3 bottom-10 md:bottom-3 z-10 max-w-[calc(100%-1.5rem)] rounded-[18px] border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#0b1728]/85 backdrop-blur-xl px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_40px_-12px_rgba(2,6,23,0.45)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_40px_-12px_rgba(2,6,23,0.65)]">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: vColor, boxShadow: `0 0 6px ${vColor}88` }}
              />
              <span className="font-mono text-sm font-bold truncate">{selectedId || 'No vehicle'}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">· {rangeLabel}</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                · {selectedTrip === null ? `${trips.length} trips` : `Trip ${selectedTrip + 1} of ${trips.length}`}
              </span>
              {selectedTripData?.isReturn && (
                <span
                  title="Inferred from this trip’s start and end matching the previous trip."
                  className="shrink-0 rounded-full border border-dashed border-slate-400/70 px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:border-white/25 dark:text-slate-300"
                >
                  Return
                </span>
              )}
            </div>

            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-2 text-[11px]">
              <div>
                <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Points</div>
                <div className="mt-0.5 font-mono font-semibold tabular-nums">{points.length}</div>
              </div>
              <div>
                <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Distance</div>
                <div className="mt-0.5 font-mono font-semibold tabular-nums">{distanceKm.toFixed(1)} km</div>
              </div>
              <div>
                <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">First</div>
                <div className="mt-0.5 font-mono font-semibold tabular-nums">{formatTime(firstPoint?.device_time)}</div>
              </div>
              <div>
                <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Last</div>
                <div className="mt-0.5 font-mono font-semibold tabular-nums">{formatTime(lastPoint?.device_time)}</div>
              </div>
            </div>

            {points.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  {drawnCount < points.length ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-sky-500" />
                      Drawing {drawnCount.toLocaleString()} / {points.length.toLocaleString()} points…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                      Trail complete · {points.length.toLocaleString()} points
                    </>
                  )}
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-slate-500/15 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-[width] duration-100"
                    style={{
                      width: `${points.length ? Math.round((drawnCount / points.length) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
              <MapPin className="w-3 h-3" />
              Green start · Red end · 30-second samples
            </div>
          </div>

          {loading && (
            <div className="absolute inset-0 z-20 bg-slate-100/40 dark:bg-[#060d17]/40 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
              <div className="rounded-full border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1728]/95 px-4 py-2 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" />
                Loading history…
              </div>
            </div>
          )}

          {!loading && points.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-6">
              <div className="max-w-xs text-center rounded-[18px] border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1728]/95 px-5 py-4 shadow-xl">
                <Route className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto" />
                <p className="mt-2 text-sm font-semibold">No history in this range</p>
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                  History stores every 30-second point. Try a wider period.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute top-[4.5rem] md:top-3 left-3 right-3 md:left-3 md:right-auto md:max-w-sm z-30 rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 backdrop-blur">
              {error}
            </div>
          )}
        </main>
      </div>

      {mobileRangeOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px]"
            aria-hidden="true"
            onClick={() => {
              setMobileRangeOpen(false);
              setError('');
            }}
          />
          <div className="md:hidden fixed left-0 right-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-[24px] border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b1728] p-4 pb-[calc(1rem+var(--safe-bottom))] shadow-2xl">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-3" />
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Select period</h2>
              <button
                type="button"
                onClick={applyCustom}
                className="rounded-full px-3 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
              >
                Apply
              </button>
            </div>
            <AppleRangePicker
              inline
              preset={preset}
              rangeLabel={rangeLabel}
              fromValue={fromInput}
              toValue={toInput}
              minMs={Date.now() - MAX_RANGE_MS}
              maxMs={Date.now()}
              onFromChange={setFromInput}
              onToChange={setToInput}
              onPreset={applyPreset}
              onApply={applyCustom}
              error={error}
            />
          </div>
        </>
      )}

      {mobileKeyOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px]"
            aria-hidden="true"
            onClick={() => setMobileKeyOpen(false)}
          />
          <div className="md:hidden fixed left-0 right-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-[24px] border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b1728] p-4 pb-[calc(1rem+var(--safe-bottom))] shadow-2xl">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-3" />
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Map key</h2>
              <button
                type="button"
                onClick={() => setMobileKeyOpen(false)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
              >
                Done
              </button>
            </div>
            <HistoryLegend />
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/10 text-[10px] text-slate-500">
              Green start · Red end · 30-second samples
            </div>
          </div>
        </>
      )}

      {mobileTripsOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px]"
            aria-hidden="true"
            onClick={() => setMobileTripsOpen(false)}
          />
          <div className="md:hidden fixed left-0 right-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-[24px] border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b1728] p-4 pb-[calc(1rem+var(--safe-bottom))] shadow-2xl">
            <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-3" />
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                Trips
                <span className="rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500 dark:text-slate-300">
                  {trips.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setMobileTripsOpen(false)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
              >
                Done
              </button>
            </div>
            <TripList
              trips={trips}
              selectedTrip={selectedTrip}
              onSelect={(index) => {
                setSelectedTrip(index);
                setMobileTripsOpen(false);
              }}
              onAll={() => {
                setSelectedTrip(null);
                setMobileTripsOpen(false);
              }}
            />
          </div>
        </>
      )}

      {selectedVehicle && (
        <div className="md:hidden shrink-0 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#081321] px-4 py-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Last point {formatAge(selectedVehicle.last_seen)}
          </span>
          <button
            type="button"
            onClick={() => handleDelete(false)}
            className="flex items-center gap-1 text-rose-600 dark:text-rose-300 font-semibold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
