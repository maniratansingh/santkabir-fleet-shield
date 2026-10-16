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

// Closest segment projection for highway waypoint snapping
function findClosestSegmentIndex(p, waypoints) {
  let minDistance = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const abX = b[0] - a[0];
    const abY = b[1] - a[1];
    const l2 = abX * abX + abY * abY;
    if (l2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abX + (p[1] - a[1]) * abY) / l2));
    const projX = a[0] + t * abX;
    const projY = a[1] + t * abY;
    const dist = Math.hypot(p[0] - projX, p[1] - projY);
    if (dist < minDistance) {
      minDistance = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Compute solid highway navigation trail from Sant Kabir Eye Hospital Base to the live vehicle location
function getHighwayTrail(v) {
  const baseCoord = [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat];
  const vehCoord = [v.lon, v.lat];

  if (v.status === 'at_base') {
    return [];
  }

  const wps = v.routeWaypoints;
  if (!wps || wps.length < 2) {
    return [baseCoord, vehCoord];
  }

  const k = findClosestSegmentIndex(vehCoord, wps);
  const trail = [baseCoord];
  for (let i = 0; i <= k; i++) {
    trail.push(wps[i]);
  }
  trail.push(vehCoord);
  return trail;
}

// Authentic 3D Isometric Ambulance with specular lighting, dual headlights, and drop shadow
function get3DAmbulanceSvg(isDark, status, isSelected) {
  const isMoving = status === 'moving' || status === 'returning';
  const sirenColor = isMoving ? '#EF4444' : '#F59E0B';
  const uniqueId = Math.random().toString(36).substr(2, 6);

  return `
    <svg width="48" height="56" class="w-12 h-14 select-none drop-shadow-2xl" viewBox="0 0 52 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ambWindshield_${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8"/>
          <stop offset="100%" stop-color="#0284C7"/>
        </linearGradient>
        <linearGradient id="ambHood_${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="#E2E8F0"/>
        </linearGradient>
        <linearGradient id="ambRoof_${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${isDark ? '#F8FAFC' : '#FFFFFF'}"/>
          <stop offset="100%" stop-color="${isDark ? '#E2E8F0' : '#F1F5F9'}"/>
        </linearGradient>
        <linearGradient id="headlightBeam_${uniqueId}" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#FEF08A" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#FEF08A" stop-opacity="0"/>
        </linearGradient>
        <filter id="shadowBlur_${uniqueId}" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
        </filter>
      </defs>

      <!-- 3D Ground Drop Shadow Beneath Chassis -->
      <ellipse cx="26" cy="40" rx="17" ry="19" fill="#000000" opacity="${isDark ? '0.55' : '0.35'}" filter="url(#shadowBlur_${uniqueId})" />

      ${isMoving ? `
        <!-- Forward 3D Headlight Beams illuminating road pavement ahead -->
        <polygon points="17,16 6,0 20,0 19,16" fill="url(#headlightBeam_${uniqueId})" />
        <polygon points="33,16 32,0 46,0 35,16" fill="url(#headlightBeam_${uniqueId})" />
      ` : ''}

      <!-- 3D Lower Chassis Underbody & Bumpers -->
      <rect x="13" y="15" width="26" height="36" rx="6" fill="#0F172A" />
      <rect x="15" y="49" width="22" height="3.5" rx="1.5" fill="#475569" />
      <rect x="15" y="14" width="22" height="3" rx="1.5" fill="#CBD5E1" />

      <!-- Dual Chrome Headlights -->
      <circle cx="17.5" cy="15.5" r="2" fill="#FEF08A" stroke="#EAB308" stroke-width="0.8" />
      <circle cx="34.5" cy="15.5" r="2" fill="#FEF08A" stroke="#EAB308" stroke-width="0.8" />

      <!-- 3D Main Body Shell with Depth Extrusion -->
      <rect x="14" y="16" width="24" height="33" rx="5" fill="url(#ambRoof_${uniqueId})" stroke="#64748B" stroke-width="1.2" />

      <!-- 3D Extruded Left & Right Flank Shadow Facets -->
      <path d="M14 20 L16 22 L16 47 L14 46 Z" fill="#CBD5E1" />
      <path d="M38 20 L36 22 L36 47 L38 46 Z" fill="#94A3B8" />

      <!-- Aerodynamic Slanted Cab Hood -->
      <path d="M16 16 L36 16 L34 22 L18 22 Z" fill="url(#ambHood_${uniqueId})" stroke="#94A3B8" stroke-width="0.8" />

      <!-- 3D Curved Reflective Windshield Glass -->
      <path d="M17.5 22 L34.5 22 L33 28 L19 28 Z" fill="url(#ambWindshield_${uniqueId})" stroke="#0284C7" stroke-width="0.8" />
      <line x1="20" y1="23" x2="28" y2="27" stroke="#FFFFFF" stroke-width="1.2" stroke-linecap="round" opacity="0.9" />

      <!-- 3D Emergency Roof Light Bar (Siren) -->
      <rect x="19" y="27" width="14" height="4" rx="2" fill="#1E293B" stroke="#0F172A" stroke-width="0.5" />
      <rect x="19.5" y="27.5" width="6" height="3" rx="1.5" fill="${sirenColor}" />
      <rect x="26.5" y="27.5" width="6" height="3" rx="1.5" fill="#3B82F6" />
      ${isMoving ? `<circle cx="26" cy="29" r="6" fill="${sirenColor}" opacity="0.6" class="animate-ping" />` : ''}

      <!-- 3D Raised Patient Compartment Roof -->
      <rect x="17" y="31" width="18" height="16" rx="3" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.8" />

      <!-- Bold Medical Red Cross (✚) on 3D Roof -->
      <rect x="24.5" y="34" width="3" height="10" rx="0.6" fill="#EF4444" />
      <rect x="21" y="37.5" width="10" height="3" rx="0.6" fill="#EF4444" />

      <!-- Rear Amber Tail Emergency Lights -->
      <circle cx="17.5" cy="48" r="1.5" fill="#F59E0B" />
      <circle cx="34.5" cy="48" r="1.5" fill="#F59E0B" />
    </svg>
  `;
}

export default function MapView({ 
  vehicles = [], 
  selectedVehicleId = null, 
  onSelectVehicle = () => {}, 
  fitTrigger, 
  theme = 'light',
  activeStyleKey = 'light',
  onStyleChange,
  showDistanceLines = true,
  onToggleDistanceLines,
  onResetView,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const baseMarkerRef = useRef(null);
  const distanceMarkersRef = useRef({});
  const currentStyleKeyRef = useRef(activeStyleKey);
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false);

  // Helper to fit all active vehicles & hospital base in camera view
  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat]);

    vehicles.forEach((v) => {
      bounds.extend([v.lon, v.lat]);
    });

    map.fitBounds(bounds, {
      padding: { top: 120, bottom: 180, left: 100, right: 100 },
      maxZoom: 13,
      duration: 1000,
    });
  };

  // Center camera on a specific vehicle
  const focusVehicle = (vehId) => {
    const map = mapRef.current;
    if (!map) return;
    const veh = vehicles.find((v) => v.id === vehId);
    if (!veh) return;

    map.flyTo({
      center: [veh.lon, veh.lat],
      zoom: 13.5,
      pitch: 35,
      bearing: veh.bearing || 0,
      speed: 1.2,
      curve: 1.4,
      essential: true,
    });
  };

  // Switch map layer style seamlessly
  const switchMapStyle = (styleKey) => {
    const map = mapRef.current;
    if (!map || styleKey === currentStyleKeyRef.current) return;

    currentStyleKeyRef.current = styleKey;
    if (onStyleChange) onStyleChange(styleKey);

    // Clear existing marker DOM references so they get fresh attachment to new style
    Object.values(markersRef.current).forEach(m => { try { m.marker.remove(); } catch (e) {} });
    markersRef.current = {};
    Object.values(distanceMarkersRef.current).forEach(m => { try { m.marker.remove(); } catch (e) {} });
    distanceMarkersRef.current = {};
    if (baseMarkerRef.current) {
      try { baseMarkerRef.current.remove(); } catch (e) {}
      baseMarkerRef.current = null;
    }

    const onStyleReady = () => {
      addCustomLayers(map);
      updateBaseMarker(map);
      updateDistanceVectors(map);
      updateVehicleMarkers(map);
    };

    map.setStyle(MAP_STYLES[styleKey].style);
    map.once('style.load', onStyleReady);
    map.once('styledata', onStyleReady);
  };

  // Synchronize style when theme changes from light to dark or vice-versa
  useEffect(() => {
    const targetStyleKey = theme === 'dark' ? 'dark' : 'light';
    if (currentStyleKeyRef.current !== targetStyleKey && (currentStyleKeyRef.current === 'dark' || currentStyleKeyRef.current === 'light')) {
      switchMapStyle(targetStyleKey);
    }
  }, [theme]);

  // Trigger camera fit when requested by parent
  useEffect(() => {
    if (fitTrigger > 0) {
      if (selectedVehicleId) {
        focusVehicle(selectedVehicleId);
      } else {
        fitAll();
      }
    }
  }, [fitTrigger, selectedVehicleId]);

  // Add Custom Highway Road Trail Layers
  const addCustomLayers = (map) => {
    try {
      const isDark = theme === 'dark' || currentStyleKeyRef.current === 'dark';

      // 1. Solid Highway Road Trail Behind Vehicle from Hospital Base
      if (map.getSource('delivery-trail-routes')) {
        if (map.getLayer('delivery-trail-casing')) map.removeLayer('delivery-trail-casing');
        if (map.getLayer('delivery-trail-line')) map.removeLayer('delivery-trail-line');
        map.removeSource('delivery-trail-routes');
      }

      const activeVehicles = vehicles.filter(v => v.status !== 'at_base');
      const trailFeatures = activeVehicles.map((v) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: getHighwayTrail(v),
        },
        properties: {
          vehicleId: v.id,
          lineColor: v.lineColor || '#007AFF',
          glowColor: v.glowColor || '#38BDF8',
          isSelected: v.id === selectedVehicleId,
        },
      }));

      map.addSource('delivery-trail-routes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: trailFeatures,
        },
      });

      // Ambient Glowing Halo Beneath Highway Navigation Trail (Dynamic per Vehicle Color)
      map.addLayer({
        id: 'delivery-trail-casing',
        type: 'line',
        source: 'delivery-trail-routes',
        layout: {
          visibility: showDistanceLines ? 'visible' : 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'glowColor'],
          'line-width': [
            'case',
            ['get', 'isSelected'],
            12,
            7.5,
          ],
          'line-opacity': isDark ? 0.45 : 0.3,
          'line-blur': 3,
        },
      });

      // Solid Apple Maps Highway Navigation Ribbon (Dynamic per Vehicle Color)
      map.addLayer({
        id: 'delivery-trail-line',
        type: 'line',
        source: 'delivery-trail-routes',
        layout: {
          visibility: showDistanceLines ? 'visible' : 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'lineColor'],
          'line-width': [
            'case',
            ['get', 'isSelected'],
            5.5,
            4,
          ],
          'line-opacity': 0.98,
        },
      });

    } catch (e) {
      console.warn('Custom layer registration error:', e);
    }
  };

  // Update Distance Lines visibility whenever prop changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    ['delivery-trail-casing', 'delivery-trail-line'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', showDistanceLines ? 'visible' : 'none');
      }
    });

    Object.values(distanceMarkersRef.current).forEach(({ element }) => {
      if (element) {
        element.style.display = showDistanceLines ? 'flex' : 'none';
      }
    });
  }, [showDistanceLines]);

  // Update Highway Navigation Trail geometry and On-Road Distance Badges
  const updateDistanceVectors = (map) => {
    if (!map) return;

    const isDark = theme === 'dark' || currentStyleKeyRef.current === 'dark';
    const activeVehicles = vehicles.filter(v => v.status !== 'at_base');

    const trailFeatures = activeVehicles.map((v) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: getHighwayTrail(v),
      },
      properties: {
        vehicleId: v.id,
        lineColor: v.lineColor || '#007AFF',
        glowColor: v.glowColor || '#38BDF8',
        isSelected: v.id === selectedVehicleId,
      },
    }));

    if (map.getSource('delivery-trail-routes')) {
      map.getSource('delivery-trail-routes').setData({
        type: 'FeatureCollection',
        features: trailFeatures,
      });
    } else {
      addCustomLayers(map);
    }

    // Clean up any old on-road badges so no duplicate clutter remains near the hospital
    Object.values(distanceMarkersRef.current).forEach(({ marker }) => {
      try { marker.remove(); } catch (e) {}
    });
    distanceMarkersRef.current = {};
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

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');

    map.on('load', () => {
      map.resize();
      addCustomLayers(map);
      updateBaseMarker(map);
      updateDistanceVectors(map);
      updateVehicleMarkers(map);

      setTimeout(() => {
        map.resize();
        fitAll(map);
      }, 150);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Base Hospital Marker (Apple Maps Style Red Medical Landmark)
  const updateBaseMarker = (mapParam) => {
    const map = mapParam || mapRef.current;
    if (!map) return;

    if (baseMarkerRef.current) {
      baseMarkerRef.current.remove();
    }

    const isDark = theme === 'dark';
    const el = document.createElement('div');
    el.className = 'relative flex flex-col items-center justify-center cursor-pointer group select-none';
    el.onclick = () => {
      map.flyTo({
        center: [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat],
        zoom: 14,
        speed: 1.2,
      });
    };

    el.innerHTML = `
      <!-- Soft Pulse Aura -->
      <div class="absolute w-12 h-12 rounded-full ${isDark ? 'bg-rose-500/20' : 'bg-rose-500/15'} radar-ring pointer-events-none"></div>

      <!-- Apple Maps Red Medical Disc -->
      <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-600 to-red-500 border-2 border-white shadow-[0_4px_12px_rgba(225,29,72,0.4)] flex items-center justify-center text-white hover:scale-110 transition-transform">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M12 6v12M6 12h12"/>
        </svg>
      </div>

      <!-- Apple Frosted Label Pill -->
      <div class="mt-1 whitespace-nowrap px-2.5 py-0.5 rounded-full backdrop-blur-md ${
        isDark ? 'bg-slate-950/90 border border-white/10 text-white' : 'bg-white/95 border border-slate-200 text-slate-900 shadow-xs'
      } text-[10px] font-bold flex items-center gap-1.5 transition-all group-hover:scale-105">
        <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
        <span>Sant Kabir Hospital (Base)</span>
      </div>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat])
      .addTo(map);

    baseMarkerRef.current = marker;
  };

  useEffect(() => {
    updateBaseMarker();
  }, [theme]);

  // Update Vehicle Markers with Apple AirTag Platter Style
  const updateVehicleMarkers = (mapParam) => {
    const map = mapParam || mapRef.current;
    if (!map) return;

    const isDark = theme === 'dark';
    const currentVehIds = new Set(vehicles.map(v => v.id));

    Object.keys(markersRef.current).forEach((id) => {
      if (!currentVehIds.has(id)) {
        try { markersRef.current[id].marker.remove(); } catch (e) {}
        delete markersRef.current[id];
      }
    });

    vehicles.forEach((v) => {
      const isSelected = selectedVehicleId === v.id;
      const vColor = v.lineColor || '#007AFF';
      const vGlow = v.glowColor || '#38BDF8';
      let markerObj = markersRef.current[v.id];

      const shortName = v.name
        .replace('Mobile Screening ', '')
        .replace('Cataract Surgical ', '')
        .replace('Vision Outreach ', 'Outreach ')
        .replace('Emergency Outreach ', '');

      const innerContent = `
        <div class="relative flex flex-col items-center group cursor-pointer transition-transform duration-200 ${isSelected ? 'scale-110 z-30' : 'hover:scale-105 z-20'}">
          <!-- Upright Speed & Distance Bubble Floating Above Vehicle (Dynamic Vehicle Color) -->
          ${v.status !== 'at_base' ? `
            <div class="mb-1.5 whitespace-nowrap px-2.5 py-0.5 rounded-full shadow-lg border backdrop-blur-md flex items-center gap-1.5 text-white text-[9.5px] font-mono font-bold tracking-tight pointer-events-none"
              style="background: linear-gradient(135deg, ${vColor}, ${vGlow}); border-color: rgba(255,255,255,0.7); box-shadow: 0 4px 14px ${vColor}55;">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
              <span>⚡ ${v.speed > 0 ? `${v.speed} km/h • ` : ''}${v.roadDistFromBaseKm || 0} km from Hospital</span>
            </div>
          ` : ''}

          <!-- 3D Isometric Ambulance Rotated on the Road along Vehicle Bearing -->
          <div class="relative flex items-center justify-center transition-transform duration-500 ease-out" style="transform: rotate(${v.bearing || 0}deg);">
            ${isSelected ? `
              <div class="absolute w-14 h-16 rounded-full animate-ping pointer-events-none" style="background-color: ${vColor}35; border: 2px solid ${vColor};"></div>
            ` : ''}
            ${get3DAmbulanceSvg(isDark, v.status, isSelected)}
          </div>

          <!-- Apple Frosted Label Pill Below (Driver Only) -->
          <div class="mt-1 px-2.5 py-0.5 rounded-full backdrop-blur-md border shadow-md flex items-center gap-1.5 transition-all duration-200 ${
            isSelected
              ? (isDark ? 'bg-slate-950/95 text-white scale-105' : 'bg-white/95 text-slate-900 scale-105 shadow-md')
              : (isDark ? 'bg-slate-950/90 text-slate-200 border-white/10 group-hover:border-slate-600' : 'bg-white/95 text-slate-800 border-slate-200/80 shadow-xs group-hover:border-slate-300')
          }" style="${isSelected ? `border-color: ${vColor}; box-shadow: 0 0 12px ${vColor}55;` : ''}">
            <span class="w-2 h-2 rounded-full" style="background-color: ${vColor};"></span>
            <span class="text-[10px] font-bold leading-none tracking-tight">${shortName}</span>
            <span class="text-slate-400 dark:text-slate-600">•</span>
            <span class="text-[9.5px] font-medium opacity-90">Driver: ${v.driverName ? v.driverName.split(' ')[0] : 'Driver'}</span>
          </div>
        </div>
      `;

      if (!markerObj || !document.body.contains(markerObj.element)) {
        if (markerObj) {
          try { markerObj.marker.remove(); } catch (e) {}
        }
        const el = document.createElement('div');
        el.className = 'select-none pointer-events-auto';
        el.innerHTML = innerContent;
        el.onclick = (e) => {
          e.stopPropagation();
          onSelectVehicle(v.id);
        };

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([v.lon, v.lat])
          .addTo(map);

        markersRef.current[v.id] = { marker, element: el };
      } else {
        markerObj.element.innerHTML = innerContent;
        markerObj.marker.setLngLat([v.lon, v.lat]);
      }
    });
  };

  useEffect(() => {
    updateVehicleMarkers();

    if (selectedVehicleId && mapRef.current) {
      const selected = vehicles.find((v) => v.id === selectedVehicleId);
      if (selected) {
        mapRef.current.flyTo({
          center: [selected.lon, selected.lat],
          zoom: 13.5,
          speed: 1.2,
          curve: 1.4,
          essential: true,
        });
      }
    }
  }, [vehicles, selectedVehicleId, theme]);

  // Update distance vectors when vehicles change
  useEffect(() => {
    if (mapRef.current) {
      updateDistanceVectors(mapRef.current);
    }
  }, [vehicles, selectedVehicleId, showDistanceLines, theme]);

  return (
    <div className="relative flex-1 w-full h-full min-h-[400px] overflow-hidden">
      {/* MapLibre WebGL Canvas Container */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Floating Apple Map Controls (Top Right) */}
      <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
        {/* Style Selector Popover */}
        <div className="relative">
          <button
            onClick={() => setStyleDropdownOpen(prev => !prev)}
            title="Map Style"
            className="w-10 h-10 rounded-2xl glass-panel shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-cyan-400 transition-colors border border-slate-200/90 dark:border-white/10 cursor-pointer"
          >
            <Layers className="w-4 h-4" />
          </button>

          {styleDropdownOpen && (
            <div className="absolute right-0 top-12 w-44 glass-panel rounded-2xl shadow-2xl p-1.5 border border-slate-200/90 dark:border-white/10 z-30 animate-in fade-in zoom-in-95">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 py-1">
                Map Style
              </div>
              {Object.entries(MAP_STYLES).map(([key, item]) => (
                <button
                  key={key}
                  onClick={() => {
                    switchMapStyle(key);
                    setStyleDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                    currentStyleKeyRef.current === key
                      ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-cyan-400 font-bold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{item.name}</span>
                  {currentStyleKeyRef.current === key && <span className="text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Toggle Distance Lines */}
        <button
          onClick={onToggleDistanceLines}
          title={showDistanceLines ? 'Hide Highway Trail' : 'Show Highway Trail'}
          className={`w-10 h-10 rounded-2xl glass-panel shadow-lg flex items-center justify-center transition-colors border border-slate-200/90 dark:border-white/10 cursor-pointer ${
            showDistanceLines 
              ? 'text-sky-600 dark:text-cyan-400 bg-sky-50/50 dark:bg-sky-950/40' 
              : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          <Ruler className="w-4 h-4" />
        </button>

        {/* Reset Camera to Fit Fleet */}
        <button
          onClick={onResetView || fitAll}
          title="Fit All Fleet Units"
          className="w-10 h-10 rounded-2xl glass-panel shadow-lg flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-cyan-400 transition-colors border border-slate-200/90 dark:border-white/10 cursor-pointer"
        >
          <Navigation className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
