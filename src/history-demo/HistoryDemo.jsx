import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Info, MapPin, Moon, Route, Sun } from 'lucide-react';
import { calculateDistanceKm } from '../data/mockData';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

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

const BASE_TIME = Date.now() - 3 * 60 * 60 * 1000;

const RAW_POINTS = [
  { min: 0, lat: 26.7800, lon: 82.6900, accuracy: 12, buffered: 0 },
  { min: 10, lat: 26.7850, lon: 82.7000, accuracy: 15, buffered: 0 },
  { min: 20, lat: 26.7920, lon: 82.7100, accuracy: 20, buffered: 0 },
  { min: 30, lat: 26.8000, lon: 82.7200, accuracy: 18, buffered: 0 },
  { min: 40, lat: 26.8080, lon: 82.7300, accuracy: 25, buffered: 0 },
  { min: 50, lat: 26.8150, lon: 82.7400, accuracy: 180, buffered: 0 },
  { min: 60, lat: 26.8200, lon: 82.7480, accuracy: 35, buffered: 20 },
  { min: 120, lat: 26.8600, lon: 82.7800, accuracy: 20, buffered: 0 },
  { min: 130, lat: 26.8700, lon: 82.7900, accuracy: 22, buffered: 0 },
  { min: 132, lat: 26.9000, lon: 82.8200, accuracy: 30, buffered: 0 },
  { min: 142, lat: 26.9100, lon: 82.8300, accuracy: 25, buffered: 0 },
  { min: 152, lat: 26.9200, lon: 82.8400, accuracy: 20, buffered: 0 },
  { min: 162, lat: 26.9300, lon: 82.8500, accuracy: 18, buffered: 0 },
];

const LINKS = [];
for (let index = 1; index < RAW_POINTS.length; index += 1) {
  const from = RAW_POINTS[index - 1];
  const to = RAW_POINTS[index];
  const dtMinutes = to.min - from.min;
  const distanceKm = calculateDistanceKm(from.lat, from.lon, to.lat, to.lon);
  const speedKmh = dtMinutes > 0 ? distanceKm / (dtMinutes / 60) : Infinity;
  let type = 'valid';
  if (dtMinutes > 30) type = 'gap';
  else if (speedKmh > 120) type = 'suspect';
  LINKS.push({ from, to, dtMinutes, distanceKm, speedKmh, type });
}

const POINTS = RAW_POINTS.map((point) => {
  let kind = 'normal';
  if (point.accuracy > 50) kind = 'low';
  else if (point.buffered > 10) kind = 'buffered';
  return { ...point, kind };
});
for (const link of LINKS) {
  if (link.type !== 'suspect') continue;
  const targetIndex = RAW_POINTS.indexOf(link.to);
  if (targetIndex >= 0) POINTS[targetIndex].kind = 'suspect';
}

const startPoint = POINTS[0];
const endPoint = POINTS[POINTS.length - 1];

function pointFeatures() {
  return POINTS.map((point, index) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
    properties: {
      index,
      kind: point.kind,
      accuracy: point.accuracy,
      buffered: point.buffered,
    },
  }));
}

function linkFeatures(type) {
  return LINKS.filter((link) => link.type === type).map((link, index) => ({
    type: 'Feature',
    id: `${type}-${index}`,
    geometry: {
      type: 'LineString',
      coordinates: [
        [link.from.lon, link.from.lat],
        [link.to.lon, link.to.lat],
      ],
    },
    properties: { type },
  }));
}

function allLineFeature() {
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: POINTS.map((point) => [point.lon, point.lat]),
    },
    properties: {},
  };
}

function formatMinute(minute) {
  const date = new Date(BASE_TIME + minute * 60 * 1000);
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function LegendItem({ symbol, label, note }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-5 shrink-0 flex justify-center pt-0.5">{symbol}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-slate-800 dark:text-slate-100">
          {label}
        </span>
        {note && (
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
            {note}
          </span>
        )}
      </span>
    </div>
  );
}

export default function HistoryDemo() {
  const [mode, setMode] = useState('proposed');
  const [legendOpen, setLegendOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      return localStorage.getItem('sk_history_demo_theme') === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  });
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('sk_history_demo_theme', theme);
    } catch (e) {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (!mapContainerRef.current) return undefined;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      setMapReady(false);
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE,
      center: [82.82, 26.92],
      zoom: 9.2,
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
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    map.addSource('demo-current', {
      type: 'geojson',
      data: allLineFeature(),
    });
    map.addSource('demo-valid', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: linkFeatures('valid') },
    });
    map.addSource('demo-suspect', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: linkFeatures('suspect') },
    });
    map.addSource('demo-points', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: pointFeatures() },
    });
    map.addSource('demo-halos', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: pointFeatures().filter((feature) => feature.properties.kind === 'low'),
      },
    });

    map.addLayer({
      id: 'demo-current-line',
      type: 'line',
      source: 'demo-current',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#0ea5e9',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 5, 14, 7],
        'line-opacity': 0.95,
      },
    });

    map.addLayer({
      id: 'demo-valid-line',
      type: 'line',
      source: 'demo-valid',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#0ea5e9',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3.5, 10, 5.5, 14, 7],
        'line-dasharray': [1.5, 2],
        'line-opacity': 0.9,
      },
    });

    map.addLayer({
      id: 'demo-suspect-line',
      type: 'line',
      source: 'demo-suspect',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#f59e0b',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3.5, 10, 5.5, 14, 7],
        'line-dasharray': [2, 2],
        'line-opacity': 0.95,
      },
    });

    map.addLayer({
      id: 'demo-halo',
      type: 'circle',
      source: 'demo-halos',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 12, 13, 24],
        'circle-color': 'rgba(245, 158, 11, 0.16)',
        'circle-stroke-width': 0,
      },
    });

    map.addLayer({
      id: 'demo-point-layer',
      type: 'circle',
      source: 'demo-points',
      paint: {
        'circle-radius': [
          'case',
          ['==', ['get', 'kind'], 'low'], 9,
          ['==', ['get', 'kind'], 'buffered'], 9,
          ['==', ['get', 'kind'], 'suspect'], 9,
          7,
        ],
        'circle-color': [
          'case',
          ['==', ['get', 'kind'], 'low'], '#f59e0b',
          ['==', ['get', 'kind'], 'buffered'], 'rgba(14,165,233,0.15)',
          ['==', ['get', 'kind'], 'suspect'], '#f59e0b',
          '#0ea5e9',
        ],
        'circle-stroke-color': [
          'case',
          ['==', ['get', 'kind'], 'low'], '#fbbf24',
          ['==', ['get', 'kind'], 'buffered'], '#38bdf8',
          ['==', ['get', 'kind'], 'suspect'], '#ef4444',
          '#082f49',
        ],
        'circle-stroke-width': 2,
      },
    });

    const startEl = document.createElement('div');
    startEl.style.cssText =
      'width:14px;height:14px;border-radius:9999px;background:#30d158;border:3px solid #052e16;box-shadow:0 0 0 4px rgba(48,209,88,.18);';
    markersRef.current.push(
      new maplibregl.Marker({ element: startEl })
        .setLngLat([startPoint.lon, startPoint.lat])
        .addTo(map)
    );

    const endEl = document.createElement('div');
    endEl.style.cssText =
      'width:14px;height:14px;border-radius:9999px;background:#ff453a;border:3px solid #450a0a;box-shadow:0 0 0 4px rgba(255,69,58,.18);';
    markersRef.current.push(
      new maplibregl.Marker({ element: endEl })
        .setLngLat([endPoint.lon, endPoint.lat])
        .addTo(map)
    );

    const bounds = POINTS.reduce(
      (acc, point) => acc.extend([point.lon, point.lat]),
      new maplibregl.LngLatBounds(
        [POINTS[0].lon, POINTS[0].lat],
        [POINTS[0].lon, POINTS[0].lat]
      )
    );
    map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 0 });
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const setVisibility = (id, visible) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    };

    const proposed = mode === 'proposed';
    setVisibility('demo-current-line', !proposed);
    setVisibility('demo-valid-line', proposed);
    setVisibility('demo-suspect-line', proposed);
    setVisibility('demo-halo', proposed);
    setVisibility('demo-point-layer', proposed);
  }, [mode, mapReady]);

  const gapCount = LINKS.filter((link) => link.type === 'gap').length;
  const suspectCount = LINKS.filter((link) => link.type === 'suspect').length;
  const lowCount = POINTS.filter((point) => point.kind === 'low').length;
  const bufferedCount = POINTS.filter((point) => point.kind === 'buffered').length;

  const legend = useMemo(() => {
    if (mode === 'current') {
      return [
        {
          symbol: <span className="block w-5 h-0.5 rounded-full bg-sky-500" />,
          label: 'One continuous line',
          note: 'Includes gaps and suspect jumps',
        },
        {
          symbol: <span className="block w-3 h-3 rounded-full bg-emerald-500" />,
          label: 'Start',
        },
        {
          symbol: <span className="block w-3 h-3 rounded-full bg-rose-500" />,
          label: 'End',
        },
      ];
    }
    return [
      {
        symbol: <span className="block w-2.5 h-2.5 rounded-full bg-sky-500 border border-sky-900" />,
        label: 'Measured point',
        note: 'One dot per real 10-minute sample',
      },
      {
        symbol: (
          <span className="block w-4 h-4 rounded-full bg-amber-500/30 border-2 border-amber-400" />
        ),
        label: 'Low accuracy',
        note: 'GPS accuracy above 50 m',
      },
      {
        symbol: (
          <span className="block w-3.5 h-3.5 rounded-full bg-sky-500/15 border-2 border-sky-400" />
        ),
        label: 'Buffered point',
        note: 'Uploaded later from offline buffer',
      },
      {
        symbol: (
          <span className="block w-4 h-4 rounded-full bg-amber-500 border-2 border-red-500" />
        ),
        label: 'Suspect jump',
        note: 'Implied speed above 120 km/h',
      },
      {
        symbol: <span className="block w-5 border-t-2 border-dashed border-amber-500" />,
        label: 'Suspect segment',
        note: 'Dashed, not a confirmed path',
      },
      {
        symbol: <span className="block w-5 border-t-2 border-dotted border-sky-500" />,
        label: 'Valid link',
        note: 'Dotted; only between plausible points',
      },
      {
        symbol: (
          <span className="relative block w-5 h-0.5">
            <span className="absolute left-0 top-0 w-1.5 h-0.5 bg-slate-400 dark:bg-slate-500" />
            <span className="absolute right-0 top-0 w-1.5 h-0.5 bg-slate-400 dark:bg-slate-500" />
          </span>
        ),
        label: 'Gap — no line',
        note: 'No data; nothing is invented',
      },
    ];
  }, [mode]);

  const renderLegend = () => (
    <div>
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            mode === 'proposed' ? 'bg-sky-500' : 'bg-amber-500'
          }`}
        />
        <span className="text-xs font-semibold">
          {mode === 'proposed' ? 'Proposed point view' : 'Current line view'}
        </span>
      </div>

      <div className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
        {mode === 'proposed'
          ? `${POINTS.length} points · ${gapCount} gap · ${suspectCount} suspect jump · ${lowCount} low accuracy · ${bufferedCount} buffered`
          : 'One solid line through every point, including missing data and suspect jumps.'}
      </div>

      <div className="mt-3 space-y-2">
        {legend.map((item, index) => (
          <LegendItem key={index} {...item} />
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/10 flex items-start gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
        Synthetic demo data. Not live history.
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen bg-slate-100 dark:bg-[#060d17] text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden">
      <header className="shrink-0 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#081321]/95 px-4 sm:px-5 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-[12px] bg-sky-500/15 text-sky-500 dark:text-sky-400 flex items-center justify-center shrink-0">
          <Route className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight leading-tight">
            History Data Demo
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
            Synthetic route · 10-minute samples · {POINTS.length} points
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden sm:flex items-center rounded-[10px] bg-slate-200/70 dark:bg-white/10 p-0.5">
            {[
              { key: 'proposed', label: 'Proposed' },
              { key: 'current', label: 'Current' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key)}
                className={`min-h-8 px-3 rounded-[8px] text-[11px] font-semibold transition-colors ${
                  mode === item.key
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-sky-600" />}
          </button>
          <a
            href="/history"
            className="hidden sm:inline-flex min-h-8 items-center rounded-[9px] border border-slate-200 dark:border-white/10 px-2.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10"
          >
            Real history
          </a>
        </div>
      </header>

      <div className="sm:hidden px-3 py-2 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#081321]/95">
        <div className="flex items-center rounded-[10px] bg-slate-200/70 dark:bg-white/10 p-0.5">
          {[
            { key: 'proposed', label: 'Proposed' },
            { key: 'current', label: 'Current' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              className={`flex-1 min-h-9 rounded-[8px] text-[11px] font-semibold transition-colors ${
                mode === item.key
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <main className="relative flex-1 min-w-0 overflow-hidden">
          <div className="absolute inset-0">
            <div ref={mapContainerRef} className="h-full w-full" />
          </div>

          <div className="absolute top-3 left-3 z-10 rounded-full border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1728]/90 px-3 py-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 shadow-sm">
            {formatMinute(0)} → {formatMinute(162)} · 10-minute samples
          </div>

          <div className="absolute top-3 right-16 z-10 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 shadow-sm flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            Demo
          </div>

          <button
            type="button"
            onClick={() => setLegendOpen(true)}
            className="lg:hidden absolute bottom-16 right-3 z-10 rounded-full border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0b1728]/95 px-3 py-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200 shadow-lg flex items-center gap-1.5"
          >
            <Info className="w-3.5 h-3.5 text-sky-500" />
            Legend
          </button>

          {legendOpen && (
            <>
              <div
                className="lg:hidden fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[1px]"
                aria-hidden="true"
                onClick={() => setLegendOpen(false)}
              />
              <div className="lg:hidden fixed left-0 right-0 bottom-0 z-50 max-h-[82vh] overflow-y-auto rounded-t-[24px] border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b1728] p-4 pb-[calc(1rem+var(--safe-bottom))] shadow-2xl">
                <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-auto mb-3" />
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold">Legend</h2>
                  <button
                    type="button"
                    onClick={() => setLegendOpen(false)}
                    className="rounded-full px-3 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                  >
                    Done
                  </button>
                </div>
                {renderLegend()}
              </div>
            </>
          )}
        </main>

        <aside className="hidden lg:flex w-[340px] shrink-0 border-l border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#081321]/70 p-4 overflow-y-auto">
          {renderLegend()}
        </aside>
      </div>
    </div>
  );
}
