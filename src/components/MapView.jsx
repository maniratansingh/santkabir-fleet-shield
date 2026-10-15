import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BASE_HOSPITAL } from '../data/mockData';
import { Layers } from 'lucide-react';

// Free, No-API-Key Map Styles (100% Watermark-Free)
const MAP_STYLES = {
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

export default function MapView({ 
  vehicles, 
  camps, 
  selectedVehicleId, 
  onSelectVehicle,
  onSelectCamp,
  fitTrigger,
  isSidebarOpen
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const campMarkersRef = useRef({});
  const baseMarkerRef = useRef(null);
  const [activeStyleKey, setActiveStyleKey] = useState('dark');

  // Responsive padding calculation (prevents map from being squeezed offscreen on mobile/tablet)
  const getResponsivePadding = () => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    
    return {
      top: isMobile ? 80 : 70,
      bottom: isMobile ? 120 : 70,
      left: isMobile ? 20 : 60,
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
    if (!mapRef.current || key === activeStyleKey) return;
    setActiveStyleKey(key);
    const map = mapRef.current;
    map.setStyle(MAP_STYLES[key].style);

    map.once('style.load', () => {
      addCustomLayers(map);
    });
  };

  // Add Route lines and Geofences
  const addCustomLayers = (map) => {
    try {
      // 1. Add Highway Route Corridors from Base Hospital to each Eye Camp
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

      // Outer glow for routes
      map.addLayer({
        id: 'camp-routes-casing',
        type: 'line',
        source: 'camp-routes',
        paint: {
          'line-color': '#06b6d4',
          'line-width': 4,
          'line-opacity': 0.18,
          'line-blur': 2,
        },
      });

      // Inner dashed active corridor
      map.addLayer({
        id: 'camp-routes-line',
        type: 'line',
        source: 'camp-routes',
        paint: {
          'line-color': '#38bdf8',
          'line-width': 1.8,
          'line-opacity': 0.65,
          'line-dasharray': [3, 2.5],
        },
      });

      // 2. Add Geofence rings around each Camp Site
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
          'circle-color': '#06b6d4',
          'circle-opacity': 0.16,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#22d3ee',
          'circle-stroke-opacity': 0.7,
        },
      });
    } catch (e) {
      console.warn('Custom layer registration error:', e);
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLES.dark.style,
      center: [82.7628, 26.8048], // Basti, UP
      zoom: 10,
      pitch: 25,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');

    map.on('load', () => {
      map.resize();
      addCustomLayers(map);

      setTimeout(() => {
        map.resize();
        fitAll();
      }, 150);
    });

    // Clicking anywhere on open map deselects the active vehicle
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
      if (baseMarkerRef.current) baseMarkerRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Trigger fit when fitTrigger or sidebar toggle changes
  useEffect(() => {
    fitAll();
  }, [fitTrigger, isSidebarOpen]);

  // Handle Base Hospital Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!baseMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'group relative flex items-center justify-center cursor-pointer';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-12 h-12 rounded-full bg-blue-500/25 animate-ping"></div>
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-cyan-500 border-2 border-white/90 shadow-2xl flex items-center justify-center text-white font-bold text-xs">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 2v20M2 12h20" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="absolute -bottom-7 whitespace-nowrap px-2.5 py-0.5 rounded-full bg-slate-900/95 border border-blue-400/50 text-[11px] font-bold text-cyan-300 shadow-md">
            🏥 Sant Kabir Hospital (Base)
          </div>
        </div>
      `;

      baseMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat])
        .addTo(map);
    }
  }, []);

  // Update Camp Markers & remove deleted camps
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentCampIds = new Set(camps.map(c => c.id));
    Object.keys(campMarkersRef.current).forEach((id) => {
      if (!currentCampIds.has(id)) {
        campMarkersRef.current[id].remove();
        delete campMarkersRef.current[id];
      }
    });

    camps.forEach((camp) => {
      if (!campMarkersRef.current[camp.id]) {
        const el = document.createElement('div');
        el.className = 'relative flex items-center justify-center cursor-pointer group select-none';
        el.onclick = (e) => {
          e.stopPropagation();
          if (onSelectCamp) onSelectCamp(camp);
        };

        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-16 h-16 rounded-full bg-cyan-400/30 radar-ring pointer-events-none"></div>
            
            <div class="w-8 h-8 rounded-full bg-slate-900 border-2 border-cyan-400 shadow-lg shadow-cyan-500/50 flex items-center justify-center text-cyan-400 hover:scale-110 transition-transform">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>

            <div class="absolute -top-7 whitespace-nowrap px-2 py-0.5 rounded-md bg-slate-950/95 border border-cyan-500/50 text-[10px] font-bold text-cyan-200 shadow-lg flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>${camp.name}</span>
              <span class="text-slate-400 font-normal">(${camp.currentScreened || 0} checked)</span>
            </div>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([camp.lon, camp.lat])
          .addTo(map);

        campMarkersRef.current[camp.id] = marker;
      }
    });
  }, [camps, onSelectCamp]);

  // Update Vehicle Markers with Live Position & Bearing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

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

      const glowColor = v.status === 'moving' 
        ? 'border-emerald-400 shadow-emerald-500/50 bg-emerald-950/95 text-emerald-300' 
        : v.status === 'at_camp'
        ? 'border-cyan-400 shadow-cyan-500/50 bg-cyan-950/95 text-cyan-300'
        : v.status === 'returning'
        ? 'border-indigo-400 shadow-indigo-500/50 bg-indigo-950/95 text-indigo-300'
        : 'border-slate-500 shadow-slate-700/50 bg-slate-900/95 text-slate-300';

      markerObj.element.innerHTML = `
        <div class="relative flex flex-col items-center">
          ${v.speed > 5 ? `
            <div style="transform: rotate(${v.bearing || 0}deg);" class="mb-1 transition-transform duration-300">
              <svg class="w-3.5 h-3.5 text-emerald-400 drop-shadow" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12,2 22,22 12,17 2,22"/>
              </svg>
            </div>
          ` : ''}

          <div class="px-2.5 py-1 rounded-xl border-2 shadow-xl backdrop-blur-md flex items-center gap-1.5 ${glowColor} ${isSelected ? 'scale-115 ring-2 ring-white' : ''}">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <rect x="1" y="3" width="15" height="13" rx="2"/>
              <polygon points="16 8 20 8 23 11 23 16 16 16 8"/>
              <circle cx="5.5" cy="18.5" r="2.5"/>
              <circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
            
            <div class="flex flex-col">
              <span class="text-[11px] font-bold leading-none whitespace-nowrap">${shortName}</span>
              ${v.speed > 0 ? `<span class="text-[9px] font-mono font-semibold">${v.speed} km/h</span>` : `<span class="text-[9px] font-medium opacity-80">Idle</span>`}
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
  }, [vehicles, selectedVehicleId, onSelectVehicle]);

  return (
    <div className="relative flex-1 w-full h-full min-h-[400px] overflow-hidden">
      {/* Absolute positioned map canvas */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Floating Map Legend & Style Switcher (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-10 glass-panel px-3 py-2 rounded-xl border border-cyan-500/20 text-xs flex flex-wrap items-center gap-3 pointer-events-auto shadow-2xl">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-blue-600 border border-white flex items-center justify-center text-[8px] text-white font-bold">+</span>
          <span className="text-slate-300 font-medium">Sant Kabir Hospital</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
          <span className="text-slate-300 font-medium">Eye Camp Site</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <span className="text-slate-300 font-medium">Moving Outreach Van</span>
        </div>

        {/* Route Corridor Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-700">
          <span className="w-4 h-0.5 border-t-2 border-dashed border-sky-400"></span>
          <span className="text-slate-400 text-[10px]">Camp Corridor</span>
        </div>

        {/* Map Layer Switcher */}
        <div className="flex items-center gap-1 pl-2 border-l border-slate-700">
          <Layers className="w-3.5 h-3.5 text-cyan-400 mr-1" />
          {Object.entries(MAP_STYLES).map(([key, styleObj]) => (
            <button
              key={key}
              onClick={() => changeStyle(key)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                activeStyleKey === key
                  ? 'bg-cyan-500 text-white shadow'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
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
