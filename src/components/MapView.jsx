import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { BASE_HOSPITAL, calculateDistanceKm } from '../data/mockData';
import { Layers, Ruler, Navigation } from 'lucide-react';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

// Free, No-API-Key Map Styles (100% Watermark-Free)
const MAP_STYLES = {
  light: {
    name: 'Light Gray',
    style: {
      version: 8,
      sources: {
        'esri-light-base': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
        },
        'esri-light-labels': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
        },
      },
      layers: [
        {
          id: 'esri-light-base-layer',
          type: 'raster',
          source: 'esri-light-base',
          minzoom: 0,
          maxzoom: 19,
        },
        {
          id: 'esri-light-labels-layer',
          type: 'raster',
          source: 'esri-light-labels',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
  dark: {
    name: 'Dark Gray',
    style: {
      version: 8,
      sources: {
        'esri-dark-base': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
        },
        'esri-dark-labels': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
        },
      },
      layers: [
        {
          id: 'esri-dark-base-layer',
          type: 'raster',
          source: 'esri-dark-base',
          minzoom: 0,
          maxzoom: 19,
        },
        {
          id: 'esri-dark-labels-layer',
          type: 'raster',
          source: 'esri-dark-labels',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
  satellite: {
    name: 'Satellite',
    style: {
      version: 8,
      sources: {
        'esri-imagery': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Source: Esri, Maxar, Earthstar Geographics',
        },
        'esri-boundaries': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
        },
      },
      layers: [
        {
          id: 'esri-imagery-layer',
          type: 'raster',
          source: 'esri-imagery',
          minzoom: 0,
          maxzoom: 19,
        },
        {
          id: 'esri-boundaries-layer',
          type: 'raster',
          source: 'esri-boundaries',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
  streets: {
    name: 'OpenStreetMap',
    style: {
      version: 8,
      sources: {
        'osm-standard': {
          type: 'raster',
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm-standard-layer',
          type: 'raster',
          source: 'osm-standard',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
};

// Generate Geographic Circle for Distance Range Rings (in Kilometers)
function createGeoJSONCircle(center, radiusInKm, points = 64) {
  const [lon, lat] = center;
  const coords = [];
  const latRad = (lat * Math.PI) / 180;
  const degLat = radiusInKm / 110.574;
  const degLon = radiusInKm / (111.32 * Math.cos(latRad));

  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = degLon * Math.cos(theta);
    const y = degLat * Math.sin(theta);
    coords.push([lon + x, lat + y]);
  }
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
    properties: {
      radiusKm: radiusInKm,
    },
  };
}

export default function MapView({ 
  vehicles, 
  camps, 
  selectedVehicleId, 
  onSelectVehicle, 
  onSelectCamp, 
  fitTrigger, 
  isSidebarOpen,
  theme = 'light'
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const campMarkersRef = useRef({});
  const baseMarkerRef = useRef(null);
  const distanceMarkersRef = useRef({});
  const ringLabelMarkersRef = useRef([]);
  const [activeStyleKey, setActiveStyleKey] = useState(theme === 'dark' ? 'dark' : 'light');
  const [showDistanceLines, setShowDistanceLines] = useState(true);

  // Synchronize map style with app theme (unless user explicitly selected satellite/streets)
  useEffect(() => {
    if (activeStyleKey === 'light' || activeStyleKey === 'dark') {
      const targetStyle = theme === 'dark' ? 'dark' : 'light';
      if (activeStyleKey !== targetStyle) {
        changeStyle(targetStyle);
      }
    }
  }, [theme]);

  // Responsive padding calculation
  const getResponsivePadding = () => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    
    return {
      top: isMobile ? 80 : 75,
      bottom: isMobile ? 120 : 75,
      left: isMobile ? 25 : 60,
      right: isDesktop && isSidebarOpen ? 400 : 30,
    };
  };

  // Helper to fit all camps & vehicles in camera view
  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;

    try {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat]);

      camps.forEach((c) => {
        if (c.lon && c.lat) bounds.extend([c.lon, c.lat]);
      });
      vehicles.forEach((v) => {
        if (v.lon && v.lat) bounds.extend([v.lon, v.lat]);
      });

      map.fitBounds(bounds, {
        padding: getResponsivePadding(),
        maxZoom: 13,
        duration: 1200,
      });
    } catch (err) {
      console.warn('fitBounds error:', err);
    }
  };

  // Switch Map Style safely
  const changeStyle = (key) => {
    if (!mapRef.current || !MAP_STYLES[key]) return;
    setActiveStyleKey(key);
    const map = mapRef.current;
    map.setStyle(MAP_STYLES[key].style);

    map.once('style.load', () => {
      addCustomLayers(map);
      updateBaseMarker();
      updateCampMarkers();
      updateDistanceVectors(map);
    });
  };

  // Add Route lines, Distance Range Rings, and Geofences
  const addCustomLayers = (map) => {
    try {
      const isDark = theme === 'dark';

      // 1. Range Rings around Base Hospital (15km, 30km, 50km)
      if (map.getSource('base-range-rings')) {
        map.removeLayer('base-range-rings-fill');
        map.removeLayer('base-range-rings-line');
        map.removeSource('base-range-rings');
      }

      const ringRadii = [15, 30, 50]; // Kilometers
      const ringFeatures = ringRadii.map(r => createGeoJSONCircle([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat], r));

      map.addSource('base-range-rings', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: ringFeatures,
        },
      });

      map.addLayer({
        id: 'base-range-rings-fill',
        type: 'fill',
        source: 'base-range-rings',
        layout: {
          visibility: showDistanceLines ? 'visible' : 'none',
        },
        paint: {
          'fill-color': isDark ? '#0284c7' : '#0284c7',
          'fill-opacity': isDark ? 0.02 : 0.015,
        },
      });

      map.addLayer({
        id: 'base-range-rings-line',
        type: 'line',
        source: 'base-range-rings',
        layout: {
          visibility: showDistanceLines ? 'visible' : 'none',
        },
        paint: {
          'line-color': isDark ? '#38bdf8' : '#0284c7',
          'line-width': 1.2,
          'line-opacity': isDark ? 0.35 : 0.28,
          'line-dasharray': [4, 4],
        },
      });

      // 2. Direct Distance Vector Lines from Base Hospital to each Vehicle
      if (map.getSource('base-distance-vectors')) {
        map.removeLayer('base-distance-vectors-line');
        map.removeSource('base-distance-vectors');
      }

      const distanceLineFeatures = vehicles
        .filter(v => v.status !== 'at_base')
        .map(v => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat],
              [v.lon, v.lat],
            ],
          },
          properties: {
            vehicleId: v.id,
            distanceKm: calculateDistanceKm(v.lat, v.lon, BASE_HOSPITAL.lat, BASE_HOSPITAL.lon),
            isSelected: v.id === selectedVehicleId,
          },
        }));

      map.addSource('base-distance-vectors', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: distanceLineFeatures,
        },
      });

      map.addLayer({
        id: 'base-distance-vectors-line',
        type: 'line',
        source: 'base-distance-vectors',
        layout: {
          visibility: showDistanceLines ? 'visible' : 'none',
        },
        paint: {
          'line-color': [
            'case',
            ['get', 'isSelected'],
            isDark ? '#22d3ee' : '#0284c7',
            isDark ? '#38bdf8' : '#0ea5e9',
          ],
          'line-width': [
            'case',
            ['get', 'isSelected'],
            3,
            1.5,
          ],
          'line-opacity': [
            'case',
            ['get', 'isSelected'],
            0.9,
            isDark ? 0.45 : 0.4,
          ],
          'line-dasharray': [2, 2],
        },
      });

      // 3. Highway Route Corridors from Base Hospital to each Eye Camp
      if (map.getSource('camp-routes')) {
        map.removeLayer('camp-routes-casing');
        map.removeLayer('camp-routes-line');
        map.removeSource('camp-routes');
      }

      const routeFeatures = camps
        .filter((c) => c.routeWaypoints && c.routeWaypoints.length > 0)
        .map((c) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: c.routeWaypoints,
          },
          properties: {
            campId: c.id,
            name: c.name,
          },
        }));

      map.addSource('camp-routes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: routeFeatures,
        },
      });

      map.addLayer({
        id: 'camp-routes-casing',
        type: 'line',
        source: 'camp-routes',
        paint: {
          'line-color': isDark ? '#06b6d4' : '#0284c7',
          'line-width': 4,
          'line-opacity': isDark ? 0.18 : 0.12,
          'line-blur': 2,
        },
      });

      map.addLayer({
        id: 'camp-routes-line',
        type: 'line',
        source: 'camp-routes',
        paint: {
          'line-color': isDark ? '#38bdf8' : '#0284c7',
          'line-width': 2,
          'line-opacity': isDark ? 0.75 : 0.65,
          'line-dasharray': [3, 2.5],
        },
      });

      // 4. Geofence rings around each Camp Site
      if (map.getSource('camp-geofences')) {
        map.removeLayer('camp-geofence-fill');
        map.removeSource('camp-geofences');
      }

      const campFeatures = camps.map((camp) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [camp.lon, camp.lat],
        },
        properties: {
          id: camp.id,
          name: camp.name,
          radius: camp.radiusMeters || 500,
        },
      }));

      map.addSource('camp-geofences', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: campFeatures,
        },
      });

      map.addLayer({
        id: 'camp-geofence-fill',
        type: 'circle',
        source: 'camp-geofences',
        paint: {
          'circle-radius': [
            'interpolate', ['exponential', 2], ['zoom'],
            9, 10,
            12, 40,
            15, 140
          ],
          'circle-color': isDark ? '#06b6d4' : '#0284c7',
          'circle-opacity': isDark ? 0.16 : 0.12,
          'circle-stroke-width': 2,
          'circle-stroke-color': isDark ? '#22d3ee' : '#0284c7',
          'circle-stroke-opacity': isDark ? 0.7 : 0.5,
        },
      });
    } catch (e) {
      console.warn('Custom layer registration error:', e);
    }
  };

  // Toggle Distance Lines & Range Rings
  const toggleDistanceLines = () => {
    const nextState = !showDistanceLines;
    setShowDistanceLines(nextState);

    const map = mapRef.current;
    if (!map) return;

    const visibility = nextState ? 'visible' : 'none';
    if (map.getLayer('base-range-rings-line')) map.setLayoutProperty('base-range-rings-line', 'visibility', visibility);
    if (map.getLayer('base-range-rings-fill')) map.setLayoutProperty('base-range-rings-fill', 'visibility', visibility);
    if (map.getLayer('base-distance-vectors-line')) map.setLayoutProperty('base-distance-vectors-line', 'visibility', visibility);

    // Toggle distance badge markers visibility
    Object.values(distanceMarkersRef.current).forEach(({ element }) => {
      element.style.display = nextState ? 'flex' : 'none';
    });
    ringLabelMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = nextState ? 'flex' : 'none';
    });
  };

  // Update Distance Vector Line geometry and Midpoint Distance Badges
  const updateDistanceVectors = (map) => {
    if (!map || !map.getSource('base-distance-vectors')) return;

    const isDark = theme === 'dark';

    const distanceLineFeatures = vehicles
      .filter(v => v.status !== 'at_base')
      .map(v => {
        const dist = calculateDistanceKm(v.lat, v.lon, BASE_HOSPITAL.lat, BASE_HOSPITAL.lon);
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat],
              [v.lon, v.lat],
            ],
          },
          properties: {
            vehicleId: v.id,
            distanceKm: dist,
            isSelected: v.id === selectedVehicleId,
          },
        };
      });

    map.getSource('base-distance-vectors').setData({
      type: 'FeatureCollection',
      features: distanceLineFeatures,
    });

    // Update midpoint distance badges on the map
    const activeVehIds = new Set(vehicles.filter(v => v.status !== 'at_base').map(v => v.id));

    // Remove deleted vehicle distance badges
    Object.keys(distanceMarkersRef.current).forEach((id) => {
      if (!activeVehIds.has(id)) {
        distanceMarkersRef.current[id].marker.remove();
        delete distanceMarkersRef.current[id];
      }
    });

    vehicles.filter(v => v.status !== 'at_base').forEach((v) => {
      const dist = calculateDistanceKm(v.lat, v.lon, BASE_HOSPITAL.lat, BASE_HOSPITAL.lon);
      const midLon = (BASE_HOSPITAL.lon + v.lon) / 2;
      const midLat = (BASE_HOSPITAL.lat + v.lat) / 2;
      const isSelected = v.id === selectedVehicleId;

      let badgeObj = distanceMarkersRef.current[v.id];

      if (!badgeObj) {
        const el = document.createElement('div');
        el.className = 'select-none transition-all duration-200 pointer-events-none';
        el.style.display = showDistanceLines ? 'flex' : 'none';

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([midLon, midLat])
          .addTo(map);

        distanceMarkersRef.current[v.id] = { marker, element: el };
        badgeObj = distanceMarkersRef.current[v.id];
      } else {
        badgeObj.marker.setLngLat([midLon, midLat]);
        badgeObj.element.style.display = showDistanceLines ? 'flex' : 'none';
      }

      badgeObj.element.innerHTML = `
        <div class="px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold tracking-tight shadow-md flex items-center gap-1 ${
          isSelected 
            ? (isDark ? 'bg-cyan-950 text-cyan-200 border-cyan-400 scale-110 shadow-cyan-500/30' : 'bg-sky-600 text-white border-sky-700 scale-110 shadow-sky-500/30')
            : (isDark ? 'bg-slate-950/90 text-cyan-300 border-cyan-500/40' : 'bg-white/95 text-sky-800 border-sky-200 shadow-sm')
        }">
          <span class="w-1.5 h-1.5 rounded-full ${isDark ? 'bg-cyan-400' : 'bg-sky-500'}"></span>
          <span>${dist} km from Base</span>
        </div>
      `;
    });
  };

  // Add Range Ring Labels on the northern arc of each ring
  const updateRingLabels = (map) => {
    if (!map) return;
    const isDark = theme === 'dark';

    // Remove existing
    ringLabelMarkersRef.current.forEach(m => m.remove());
    ringLabelMarkersRef.current = [];

    const ringRadii = [15, 30, 50];
    ringRadii.forEach((r) => {
      // Point on the northern boundary of the circle
      const degLat = r / 110.574;
      const ringNorthCoord = [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat + degLat];

      const el = document.createElement('div');
      el.className = 'select-none pointer-events-none flex items-center justify-center';
      el.style.display = showDistanceLines ? 'flex' : 'none';
      el.innerHTML = `
        <div class="px-2 py-0.5 rounded-md border text-[9px] font-mono font-bold uppercase tracking-wider ${
          isDark 
            ? 'bg-slate-900/90 text-cyan-300/80 border-cyan-500/30 shadow-xs' 
            : 'bg-white/90 text-sky-700/80 border-slate-200 shadow-xs'
        }">
          ⭕ ${r} km Base Radius
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(ringNorthCoord)
        .addTo(map);

      ringLabelMarkersRef.current.push(marker);
    });
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const initialStyleKey = theme === 'dark' ? 'dark' : 'light';
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLES[initialStyleKey].style,
      center: [82.7628, 26.8048], // Basti, UP
      zoom: 10,
      pitch: 25,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');

    map.on('load', () => {
      map.resize();
      addCustomLayers(map);
      updateBaseMarker();
      updateCampMarkers();
      updateRingLabels(map);
      updateDistanceVectors(map);

      setTimeout(() => {
        map.resize();
        fitAll();
      }, 150);
    });

    // Clicking anywhere on open map deselects active vehicle
    map.on('click', (e) => {
      if (e.originalEvent && e.originalEvent.target && e.originalEvent.target.closest('.maplibre-marker')) {
        return;
      }
      onSelectVehicle(null);
    });

    map.on('error', (e) => {
      console.warn('MapLibre error:', e);
    });

    mapRef.current = map;

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
      Object.values(campMarkersRef.current).forEach((marker) => marker.remove());
      Object.values(distanceMarkersRef.current).forEach(({ marker }) => marker.remove());
      ringLabelMarkersRef.current.forEach((marker) => marker.remove());
      if (baseMarkerRef.current) baseMarkerRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update vectors whenever vehicles, selectedVehicleId, or theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (map && map.loaded()) {
      updateDistanceVectors(map);
    }
  }, [vehicles, selectedVehicleId, theme, showDistanceLines]);

  // Trigger fit when fitTrigger or sidebar toggle changes
  useEffect(() => {
    fitAll();
  }, [fitTrigger, isSidebarOpen]);

  // Base Hospital Marker
  const updateBaseMarker = () => {
    const map = mapRef.current;
    if (!map) return;

    if (baseMarkerRef.current) {
      baseMarkerRef.current.remove();
      baseMarkerRef.current = null;
    }

    const isDark = theme === 'dark';
    const el = document.createElement('div');
    el.className = 'group relative flex items-center justify-center cursor-pointer';
    el.innerHTML = `
      <div class="relative flex items-center justify-center select-none">
        <div class="absolute w-12 h-12 rounded-full ${isDark ? 'bg-blue-500/25' : 'bg-blue-600/15'} animate-ping"></div>
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-cyan-500 border-2 ${isDark ? 'border-white/90 shadow-2xl' : 'border-white shadow-lg shadow-blue-500/25'} flex items-center justify-center text-white font-bold text-xs">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2v20M2 12h20" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="absolute -bottom-7 whitespace-nowrap px-2.5 py-0.5 rounded-full ${
          isDark 
            ? 'bg-slate-900/95 border border-blue-400/50 text-cyan-300 shadow-md' 
            : 'bg-white/95 border border-slate-200 text-blue-900 shadow-md font-semibold'
        } text-[11px]">
          🏥 Sant Kabir Hospital (Base)
        </div>
      </div>
    `;

    baseMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat])
      .addTo(map);
  };

  useEffect(() => {
    updateBaseMarker();
    if (mapRef.current && mapRef.current.loaded()) {
      updateRingLabels(mapRef.current);
    }
  }, [theme]);

  // Update Camp Markers
  const updateCampMarkers = () => {
    const map = mapRef.current;
    if (!map) return;

    const isDark = theme === 'dark';
    const currentCampIds = new Set(camps.map(c => c.id));
    
    Object.keys(campMarkersRef.current).forEach((id) => {
      if (!currentCampIds.has(id)) {
        campMarkersRef.current[id].remove();
        delete campMarkersRef.current[id];
      }
    });

    camps.forEach((camp) => {
      if (campMarkersRef.current[camp.id]) {
        campMarkersRef.current[camp.id].remove();
      }

      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center cursor-pointer group select-none';
      el.onclick = (e) => {
        e.stopPropagation();
        if (onSelectCamp) onSelectCamp(camp);
      };

      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-16 h-16 rounded-full ${isDark ? 'bg-cyan-400/30' : 'bg-sky-500/20'} radar-ring pointer-events-none"></div>
          
          <div class="w-8 h-8 rounded-full ${
            isDark 
              ? 'bg-slate-900 border-2 border-cyan-400 shadow-lg shadow-cyan-500/50 text-cyan-400' 
              : 'bg-white border-2 border-sky-500 shadow-md text-sky-600'
          } flex items-center justify-center hover:scale-110 transition-transform">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>

          <div class="absolute -top-7 whitespace-nowrap px-2 py-0.5 rounded-md ${
            isDark 
              ? 'bg-slate-950/95 border border-cyan-500/50 text-cyan-200 shadow-lg' 
              : 'bg-white/95 border border-slate-200 text-slate-800 shadow-md'
          } text-[10px] font-bold flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>${camp.name}</span>
            <span class="${isDark ? 'text-slate-400' : 'text-slate-500'} font-normal">(${camp.currentScreened || 0} checked)</span>
          </div>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([camp.lon, camp.lat])
        .addTo(map);

      campMarkersRef.current[camp.id] = marker;
    });
  };

  useEffect(() => {
    updateCampMarkers();
  }, [camps, theme]);

  // Update Vehicle Markers with Live Position & Bearing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const isDark = theme === 'dark';
    const currentVehIds = new Set(vehicles.map(v => v.id));

    Object.keys(markersRef.current).forEach((id) => {
      if (!currentVehIds.has(id)) {
        markersRef.current[id].marker.remove();
        delete markersRef.current[id];
      }
    });

    vehicles.forEach((v) => {
      const isSelected = selectedVehicleId === v.id;
      let markerObj = markersRef.current[v.id];

      if (!markerObj) {
        const el = document.createElement('div');
        el.className = 'maplibre-marker select-none';
        el.onclick = (e) => {
          e.stopPropagation();
          onSelectVehicle(v.id);
        };

        const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
          .setLngLat([v.lon, v.lat])
          .addTo(map);

        markersRef.current[v.id] = { marker, element: el };
        markerObj = markersRef.current[v.id];
      } else {
        markerObj.marker.setLngLat([v.lon, v.lat]);
      }

      const shortName = v.name
        .replace('Mobile Screening ', '')
        .replace('Cataract Surgical ', '');

      let glowColor = '';
      if (isDark) {
        glowColor = v.status === 'moving' 
          ? 'border-emerald-400 shadow-emerald-500/50 bg-emerald-950/95 text-emerald-300' 
          : v.status === 'at_camp'
          ? 'border-cyan-400 shadow-cyan-500/50 bg-cyan-950/95 text-cyan-300'
          : v.status === 'returning'
          ? 'border-indigo-400 shadow-indigo-500/50 bg-indigo-950/95 text-indigo-300'
          : 'border-slate-500 shadow-slate-700/50 bg-slate-900/95 text-slate-300';
      } else {
        glowColor = v.status === 'moving'
          ? 'border-emerald-500 shadow-emerald-500/25 bg-white text-emerald-800'
          : v.status === 'at_camp'
          ? 'border-sky-500 shadow-sky-500/25 bg-white text-sky-800'
          : v.status === 'returning'
          ? 'border-indigo-500 shadow-indigo-500/25 bg-white text-indigo-800'
          : 'border-slate-300 shadow-slate-400/25 bg-white text-slate-700';
      }

      markerObj.element.innerHTML = `
        <div class="relative flex flex-col items-center">
          ${v.speed > 5 ? `
            <div style="transform: rotate(${v.bearing || 0}deg);" class="mb-1 transition-transform duration-300">
              <svg class="w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'} drop-shadow" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12,2 22,22 12,17 2,22"/>
              </svg>
            </div>
          ` : ''}

          <div class="px-2.5 py-1 rounded-xl border-2 shadow-lg backdrop-blur-md flex items-center gap-1.5 ${glowColor} ${
            isSelected ? (isDark ? 'scale-115 ring-2 ring-white' : 'scale-115 ring-2 ring-sky-500 shadow-xl') : ''
          }">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <rect x="1" y="3" width="15" height="13" rx="2"/>
              <polygon points="16 8 20 8 23 11 23 16 16 16 8"/>
              <circle cx="5.5" cy="18.5" r="2.5"/>
              <circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
            
            <div class="flex flex-col">
              <span class="text-[11px] font-bold leading-none whitespace-nowrap">${shortName}</span>
              ${v.speed > 0 ? `<span class="text-[9px] font-mono font-semibold">${v.speed} km/h</span>` : `<span class="text-[9px] font-medium opacity-75">Idle</span>`}
            </div>
          </div>
        </div>
      `;
    });

    if (selectedVehicleId) {
      const selected = vehicles.find((v) => v.id === selectedVehicleId);
      if (selected) {
        map.flyTo({
          center: [selected.lon, selected.lat],
          zoom: 13.5,
          speed: 1.2,
          curve: 1.4,
          essential: true,
        });
      }
    }
  }, [vehicles, selectedVehicleId, theme]);

  return (
    <div className="relative flex-1 w-full h-full min-h-[400px] overflow-hidden">
      {/* Absolute positioned map canvas */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Floating Map Legend & Control Bar (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-10 glass-panel px-3 py-2 rounded-xl text-xs flex flex-wrap items-center gap-3 pointer-events-auto shadow-xl">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-blue-600 border border-white flex items-center justify-center text-[8px] text-white font-bold">+</span>
          <span className="text-slate-700 dark:text-slate-300 font-medium">Sant Kabir Hospital</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
          <span className="text-slate-700 dark:text-slate-300 font-medium">Eye Camp</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-slate-700 dark:text-slate-300 font-medium">Van</span>
        </div>

        {/* Distance Range & Lines Toggle */}
        <div className="flex items-center gap-1 pl-2 border-l border-slate-300 dark:border-slate-700">
          <button
            onClick={toggleDistanceLines}
            title={showDistanceLines ? "Hide Distance Lines & Radii from Base" : "Show Distance Lines & Radii from Base"}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
              showDistanceLines
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Ruler className="w-3 h-3" />
            <span>Distance from Base: {showDistanceLines ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Map Layer Switcher */}
        <div className="flex items-center gap-1 pl-2 border-l border-slate-300 dark:border-slate-700">
          <Layers className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400 mr-1" />
          {Object.entries(MAP_STYLES).map(([key, styleObj]) => (
            <button
              key={key}
              onClick={() => changeStyle(key)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                activeStyleKey === key
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {styleObj.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
