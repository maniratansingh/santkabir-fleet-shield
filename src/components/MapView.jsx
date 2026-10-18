import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { BASE_HOSPITAL, calculateDistanceKm } from '../data/mockData';
import { getDeliveryRouteSplit, getAllRoadCorridors } from '../utils/roadDistance';
import { getNearestRuralLocation } from '../utils/ruralLocator';
import { getUniqueVehicleColor } from '../utils/colors';
import ruralVillages from '../data/ruralVillages.json';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

// Free, No-API-Key Map Styles (100% Watermark-Free)
const MAP_STYLES = {
  light: {
    name: 'Light Gray',
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
    name: 'Highways & Streets',
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'esri-streets': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Esri, HERE, Garmin, USGS, © OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'esri-streets-layer',
          type: 'raster',
          source: 'esri-streets',
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

// Compute distance from hospital base with fallback
function getLiveDistanceKm(v) {
  if (typeof v.roadDistFromBaseKm === 'number' && v.roadDistFromBaseKm > 0) {
    return v.roadDistFromBaseKm;
  }
  const dist = calculateDistanceKm(BASE_HOSPITAL.lat, BASE_HOSPITAL.lon, Number(v.lat || 0), Number(v.lon || 0));
  return Math.round(dist * 1.15 * 10) / 10;
}

// Compute solid highway navigation trail along real road coordinates
function getHighwayTrail(v) {
  return getDeliveryRouteSplit(v).upcomingRoute;
}

// Authentic 3D Isometric Ambulance with specular lighting, dual headlights, and drop shadow
// Authentic 3D Isometric Ambulance with specular lighting, dual headlights, forward road beams, Sant Kabir emblem, and beacon
function get3DAmbulanceSvg(isDark, status, isSelected, vColor = '#007AFF', vId = '') {
  const isMoving = status === 'moving' || status === 'returning';
  const uniqueId = (vId || 'amb').replace(/[^a-zA-Z0-9]/g, '_');

  return `
    <svg width="54" height="68" class="w-[52px] h-[66px] select-none filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.45)]" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Windshield gradient with reflective sky tint -->
        <linearGradient id="ambWindshield_${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#38BDF8"/>
          <stop offset="100%" stop-color="#0284C7"/>
        </linearGradient>
        <!-- Slanted aerodynamic hood gradient -->
        <linearGradient id="ambHood_${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="60%" stop-color="#F8FAFC"/>
          <stop offset="100%" stop-color="#CBD5E1"/>
        </linearGradient>
        <!-- Clinical white roof deck gradient -->
        <linearGradient id="ambRoof_${uniqueId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${isDark ? '#FFFFFF' : '#FFFFFF'}"/>
          <stop offset="100%" stop-color="${isDark ? '#E2E8F0' : '#F1F5F9'}"/>
        </linearGradient>
        <!-- High-intensity forward road illumination beam -->
        <linearGradient id="headlightBeam_${uniqueId}" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#FEF08A" stop-opacity="0.65"/>
          <stop offset="60%" stop-color="#FEF08A" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#FEF08A" stop-opacity="0"/>
        </linearGradient>
        <!-- Soft ambient chassis contact shadow -->
        <filter id="chassisShadow_${uniqueId}" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" />
        </filter>
      </defs>

      <!-- 1. Deep 3D Ground Drop Shadow on Asphalt -->
      <ellipse cx="27" cy="42" rx="19" ry="22" fill="#000000" opacity="${isDark ? '0.65' : '0.4'}" filter="url(#chassisShadow_${uniqueId})" />

      <!-- 2. Dual Forward 3D Headlight Beams illuminating road pavement -->
      ${isMoving ? `
        <polygon points="17,17 4,0 21,0 20,17" fill="url(#headlightBeam_${uniqueId})" />
        <polygon points="37,17 33,0 50,0 40,17" fill="url(#headlightBeam_${uniqueId})" />
      ` : ''}

      <!-- 3. Heavy Dark Underbody Chassis & Wheels -->
      <rect x="13" y="16" width="28" height="42" rx="6" fill="#0F172A" />
      <!-- Tires & Wheel Arches -->
      <rect x="10.5" y="21" width="3.5" height="8" rx="1.5" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />
      <rect x="40" y="21" width="3.5" height="8" rx="1.5" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />
      <rect x="10.5" y="44" width="3.5" height="9" rx="1.5" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />
      <rect x="40" y="44" width="3.5" height="9" rx="1.5" fill="#1E293B" stroke="#0F172A" stroke-width="0.8" />

      <!-- 4. Front Chrome & Amber Aerodynamic Bumper -->
      <rect x="15" y="15" width="24" height="3.5" rx="1.5" fill="#E2E8F0" stroke="#94A3B8" stroke-width="0.8" />
      <line x1="18" y1="16.5" x2="36" y2="16.5" stroke="#475569" stroke-width="1" stroke-linecap="round" />

      <!-- 5. Dual Chrome Headlamp Clusters -->
      <circle cx="18" cy="17" r="2.4" fill="#FEF08A" stroke="#EAB308" stroke-width="0.9" />
      <circle cx="18" cy="17" r="1.1" fill="#FFFFFF" />
      <circle cx="36" cy="17" r="2.4" fill="#FEF08A" stroke="#EAB308" stroke-width="0.9" />
      <circle cx="36" cy="17" r="1.1" fill="#FFFFFF" />

      <!-- 6. 3D Main Body Shell with Clinical Depth Extrusion -->
      <rect x="14" y="17" width="26" height="38" rx="5.5" fill="url(#ambRoof_${uniqueId})" stroke="#64748B" stroke-width="1.2" />

      <!-- 7. Left & Right 3D Shading Flank Facets -->
      <path d="M14 22 L16.5 24 L16.5 53 L14 52 Z" fill="#CBD5E1" />
      <path d="M40 22 L37.5 24 L37.5 53 L40 52 Z" fill="#94A3B8" />

      <!-- 8. Dynamic Livery Side Accent Stripe (Matching Fleet Color) -->
      <line x1="14.5" y1="36" x2="14.5" y2="50" stroke="${vColor}" stroke-width="1.8" stroke-linecap="round" />
      <line x1="39.5" y1="36" x2="39.5" y2="50" stroke="${vColor}" stroke-width="1.8" stroke-linecap="round" />

      <!-- 9. Aerodynamic Slanted Hood with Center Crease -->
      <path d="M16 17 L38 17 L36 24 L18 24 Z" fill="url(#ambHood_${uniqueId})" stroke="#94A3B8" stroke-width="0.8" />
      <line x1="27" y1="17.5" x2="27" y2="23.5" stroke="#FFFFFF" stroke-width="0.8" opacity="0.8" />

      <!-- 10. 3D Panoramic Windshield Glass with Specular Glare -->
      <path d="M17.5 24 L36.5 24 L35 30 L19 30 Z" fill="url(#ambWindshield_${uniqueId})" stroke="#0284C7" stroke-width="0.8" />
      <line x1="20" y1="25" x2="29" y2="29" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round" opacity="0.85" />

      <!-- 11. Dual Side Mirrors -->
      <rect x="11.5" y="24" width="2.5" height="3.5" rx="1" fill="#0F172A" />
      <rect x="40" y="24" width="2.5" height="3.5" rx="1" fill="#0F172A" />

      <!-- 12. 3D Emergency Roof Light Bar (Flashing Siren Beacon) -->
      <rect x="19" y="29" width="16" height="4.5" rx="2" fill="#0F172A" stroke="#334155" stroke-width="0.5" />
      <!-- Left Red Emergency Beacon -->
      <rect x="19.5" y="29.5" width="7" height="3.5" rx="1.5" fill="#EF4444" />
      <!-- Right Blue Emergency Beacon -->
      <rect x="27.5" y="29.5" width="7" height="3.5" rx="1.5" fill="#3B82F6" />
      <!-- Flashing Beacon Flare with clean drop-shadow (Zero Blink Glitch) -->
      ${isMoving ? `
        <circle cx="23" cy="31" r="3.5" fill="#EF4444" opacity="0.9" style="filter: drop-shadow(0 0 3px #EF4444);" />
        <circle cx="31" cy="31" r="3.5" fill="#3B82F6" opacity="0.9" style="filter: drop-shadow(0 0 3px #3B82F6);" />
      ` : ''}

      <!-- 13. Raised Clinical Patient Compartment Deck -->
      <rect x="17" y="34" width="20" height="18" rx="3.5" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.9" />

      <!-- 14. Sant Kabir Eye Hospital Red Medical Cross (✚) Emblem -->
      <circle cx="27" cy="43" r="7.5" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="0.8" />
      <rect x="25.2" y="38" width="3.6" height="10" rx="0.8" fill="#EF4444" />
      <rect x="22" y="41.2" width="10" height="3.6" rx="0.8" fill="#EF4444" />

      <!-- 15. Rear Diamond Plate Step Bumper & Amber/Red Taillights -->
      <rect x="16" y="54" width="22" height="3.5" rx="1.2" fill="#475569" stroke="#334155" stroke-width="0.7" />
      <circle cx="18" cy="53" r="1.6" fill="#EF4444" />
      <circle cx="36" cy="53" r="1.6" fill="#EF4444" />
      <circle cx="20.5" cy="53" r="1.2" fill="#F59E0B" />
      <circle cx="33.5" cy="53" r="1.2" fill="#F59E0B" />
    </svg>
  `;
}

export default function MapView({ 
  vehicles = [], 
  selectedVehicleId = null, 
  onSelectVehicle = () => {}, 
  fitTrigger, 
  actionTrigger = null,
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
  const vehiclesRef = useRef(vehicles);
  const prevSelectedIdRef = useRef(null);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  // Helper to fit all active vehicles & hospital base in camera view
  const fitAll = (options = {}) => {
    const map = mapRef.current;
    if (!map) return;

    const currentVehicles = vehiclesRef.current || vehicles;
    if (!currentVehicles || currentVehicles.length === 0) {
      map.flyTo({
        center: [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat],
        zoom: 13.5,
        pitch: 20,
        bearing: 0,
        duration: options.duration !== undefined ? options.duration : 800,
        essential: true,
      });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat]);

    currentVehicles.forEach((v) => {
      bounds.extend([v.lon, v.lat]);
    });

    const isDesktop = typeof window !== 'undefined' && window.innerWidth > 768;
    const padding = isDesktop
      ? { top: 110, bottom: 85, left: 420, right: 90 }
      : { top: 100, bottom: 380, left: 40, right: 40 };

    map.fitBounds(bounds, {
      padding,
      maxZoom: 12.8,
      pitch: 22,
      bearing: 0,
      duration: options.duration !== undefined ? options.duration : 900,
      essential: true,
    });
  };

  // Frame entire road route between Base Hospital and Vehicle across Uttar Pradesh
  const fitVehicleRoute = (vehId, options = {}) => {
    const map = mapRef.current;
    if (!map) return;
    const veh = vehicles.find((v) => v.id === vehId);
    if (!veh) return;

    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat]);
    bounds.extend([Number(veh.lon || 0), Number(veh.lat || 0)]);

    const split = getDeliveryRouteSplit(veh);
    if (split.upcomingRoute && split.upcomingRoute.length > 0) {
      split.upcomingRoute.forEach((pt) => bounds.extend(pt));
    }

    const isDesktop = typeof window !== 'undefined' && window.innerWidth > 768;
    const padding = isDesktop
      ? { top: 120, bottom: 90, left: 440, right: 100 }
      : { top: 100, bottom: 380, left: 50, right: 50 };

    map.fitBounds(bounds, {
      padding,
      maxZoom: 12.5,
      pitch: 22,
      bearing: 0,
      duration: options.duration !== undefined ? options.duration : 1000,
      essential: true,
    });
  };

  // Center camera on a specific vehicle (Upright North-up orientation, smooth glide without dizzy spinning)
  const focusVehicle = (vehId) => {
    const map = mapRef.current;
    if (!map) return;
    const veh = vehicles.find((v) => v.id === vehId);
    if (!veh) return;

    map.flyTo({
      center: [Number(veh.lon || 0), Number(veh.lat || 0)],
      zoom: 13.5,
      pitch: 28,
      bearing: 0,
      speed: 1.1,
      curve: 1.3,
      essential: true,
    });
  };

  // Switch map layer style seamlessly
  const switchMapStyle = (styleKey) => {
    const map = mapRef.current;
    if (!map || !MAP_STYLES[styleKey]) return;
    if (styleKey === currentStyleKeyRef.current && map.isStyleLoaded()) return;

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

    // Clean up previous custom layers before switching
    try {
      if (map.getLayer('purvanchal-village-labels')) map.removeLayer('purvanchal-village-labels');
      if (map.getLayer('purvanchal-village-dots')) map.removeLayer('purvanchal-village-dots');
      if (map.getSource('purvanchal-villages')) map.removeSource('purvanchal-villages');

      if (map.getLayer('delivery-incoming-flow')) map.removeLayer('delivery-incoming-flow');
      if (map.getLayer('delivery-incoming-road')) map.removeLayer('delivery-incoming-road');
      if (map.getLayer('delivery-incoming-casing')) map.removeLayer('delivery-incoming-casing');
      if (map.getSource('delivery-incoming-routes')) map.removeSource('delivery-incoming-routes');

      if (map.getLayer('delivery-trail-line')) map.removeLayer('delivery-trail-line');
      if (map.getSource('delivery-trail-routes')) map.removeSource('delivery-trail-routes');

      if (map.getLayer('camp-routes-line')) map.removeLayer('camp-routes-line');
      if (map.getLayer('camp-routes-casing')) map.removeLayer('camp-routes-casing');
      if (map.getSource('camp-routes')) map.removeSource('camp-routes');
    } catch (e) {}

    // Wait strictly for style.load (never styledata, which causes 'Style is not done loading')
    map.once('style.load', () => {
      addCustomLayers(map);
      updateBaseMarker(map);
      updateDistanceVectors(map);
      updateVehicleMarkers(map);
    });

    map.setStyle(MAP_STYLES[styleKey].style);
  };

  // Synchronize when activeStyleKey changes from parent FloatingControls
  useEffect(() => {
    if (activeStyleKey && activeStyleKey !== currentStyleKeyRef.current) {
      switchMapStyle(activeStyleKey);
    }
  }, [activeStyleKey]);

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

  // Handle action triggers (e.g. Reset North, Locate, Fit Route Corridor)
  useEffect(() => {
    if (!mapRef.current) return;
    if (actionTrigger?.type === 'resetNorth') {
      mapRef.current.easeTo({ bearing: 0, pitch: 20, duration: 800 });
    } else if (actionTrigger?.type === 'locateVehicle') {
      focusVehicle(actionTrigger.vehicleId);
    } else if (actionTrigger?.type === 'fitRoute') {
      fitVehicleRoute(actionTrigger.vehicleId);
    }
  }, [actionTrigger]);

  // Add Custom Highway Road Navigation Layers
  const addCustomLayers = (map) => {
    try {
      const isDark = theme === 'dark' || currentStyleKeyRef.current === 'dark';

      // 1. Purvanchal Rural Villages & Eye Camps (75+ Gram Panchayats & Bazars cached locally)
      if (map.getSource('purvanchal-villages')) {
        if (map.getLayer('purvanchal-village-labels')) map.removeLayer('purvanchal-village-labels');
        if (map.getLayer('purvanchal-village-dots')) map.removeLayer('purvanchal-village-dots');
        map.removeSource('purvanchal-villages');
      }

      const villageFeatures = ruralVillages.map((v) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [v.lon, v.lat],
        },
        properties: {
          name: v.name.replace(/ (Gram|Bazar|Sadar|Nagar)$/, ''),
          fullName: v.name,
          district: v.district,
          block: v.block,
          isCamp: v.type === 'rural_camp' || v.type === 'historic_camp',
        },
      }));

      map.addSource('purvanchal-villages', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: villageFeatures,
        },
      });

      // Layer 1A: Soft Village Point Indicator Dot
      map.addLayer({
        id: 'purvanchal-village-dots',
        type: 'circle',
        source: 'purvanchal-villages',
        minzoom: 8,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            8, 2.5,
            11, 3.5,
            14, 5
          ],
          'circle-color': isDark ? '#38BDF8' : '#0284C7',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': isDark ? '#0F172A' : '#FFFFFF',
          'circle-opacity': 0.85,
        },
      });

      // Layer 1B: Crisp Village Name Symbol Label (Cached locally, zero network delay)
      map.addLayer({
        id: 'purvanchal-village-labels',
        type: 'symbol',
        source: 'purvanchal-villages',
        minzoom: 8.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            8.5, 10,
            11, 11.5,
            14, 13
          ],
          'text-offset': [0, 0.85],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': isDark ? '#E2E8F0' : '#1E293B',
          'text-halo-color': isDark ? '#090D16' : '#FFFFFF',
          'text-halo-width': 2,
          'text-halo-blur': 0.5,
        },
      });

      // 2. Traveled Highway Road Trail Behind Active Vehicles
      if (map.getSource('delivery-trail-routes')) {
        if (map.getLayer('delivery-trail-line')) map.removeLayer('delivery-trail-line');
        map.removeSource('delivery-trail-routes');
      }

      const activeVehicles = vehicles.filter(v => v.status !== 'at_base');
      const trailFeatures = activeVehicles.map((v) => {
        const split = getDeliveryRouteSplit(v);
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: split.completedTrail,
          },
          properties: {
            vehicleId: v.id,
            lineColor: v.lineColor || '#007AFF',
            isSelected: v.id === selectedVehicleId,
          },
        };
      });

      map.addSource('delivery-trail-routes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: trailFeatures,
        },
      });

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
            4.5,
            3,
          ],
          'line-opacity': 0.85,
        },
      });

      // 3. Active Turn-by-Turn Road Navigation Corridor (Solid Clean Road Ribbon, No Dashes)
      if (map.getSource('delivery-incoming-routes')) {
        if (map.getLayer('delivery-incoming-road')) map.removeLayer('delivery-incoming-road');
        if (map.getLayer('delivery-incoming-casing')) map.removeLayer('delivery-incoming-casing');
        map.removeSource('delivery-incoming-routes');
      }

      const incomingFeatures = activeVehicles.map((v) => {
        const split = getDeliveryRouteSplit(v);
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: split.upcomingRoute,
          },
          properties: {
            vehicleId: v.id,
            lineColor: v.lineColor || '#007AFF',
            glowColor: v.glowColor || '#38BDF8',
            isSelected: v.id === selectedVehicleId,
            status: v.status,
          },
        };
      });

      map.addSource('delivery-incoming-routes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: incomingFeatures,
        },
      });

      // Layer A: Ambient Glowing Halo Beneath Navigation Corridor
      map.addLayer({
        id: 'delivery-incoming-casing',
        type: 'line',
        source: 'delivery-incoming-routes',
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
            10,
            6.5,
          ],
          'line-opacity': [
            'case',
            ['get', 'isSelected'],
            0.5,
            0.3,
          ],
          'line-blur': 3,
        },
      });

      // Layer B: Solid Google Maps / Apple Maps Navigation Road Ribbon (Dynamic per Vehicle Color, No Dashes)
      map.addLayer({
        id: 'delivery-incoming-road',
        type: 'line',
        source: 'delivery-incoming-routes',
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
            3.8,
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

    const visibility = showDistanceLines ? 'visible' : 'none';
    [
      'delivery-trail-line',
      'delivery-incoming-casing',
      'delivery-incoming-road'
    ].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    });

    Object.values(distanceMarkersRef.current).forEach(({ element }) => {
      if (element) {
        element.style.display = showDistanceLines ? 'flex' : 'none';
      }
    });
  }, [showDistanceLines]);

  // Live Navigation Line Animation (Breathing halo glow)
  useEffect(() => {
    let animId;

    const animate = (timestamp) => {
      const map = mapRef.current;
      if (map && map.isStyleLoaded()) {
        try {
          // Smooth Breathing Glow on Navigation Corridor Halo
          if (map.getLayer('delivery-incoming-casing')) {
            const pulse = (Math.sin(timestamp * 0.005) + 1) / 2;
            const opacity = 0.25 + 0.3 * pulse;
            const width = 7 + 3.5 * pulse;
            map.setPaintProperty('delivery-incoming-casing', 'line-opacity', opacity);
            map.setPaintProperty('delivery-incoming-casing', 'line-width', width);
          }
        } catch (e) {}
      }
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  // Update Road Navigation Trails, Incoming Corridors, and On-Road Midpoint Distance Badges
  const updateDistanceVectors = (map) => {
    if (!map) return;

    const isDark = theme === 'dark' || currentStyleKeyRef.current === 'dark';
    const activeVehicles = vehicles.filter(v => v.status !== 'at_base');

    const incomingFeatures = activeVehicles.map((v) => {
      const split = getDeliveryRouteSplit(v);
      const uniqueColors = getUniqueVehicleColor(v.id);
      const vColor = v.lineColor || uniqueColors.line;
      const vGlow = v.glowColor || uniqueColors.glow;
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: split.upcomingRoute,
        },
        properties: {
          vehicleId: v.id,
          lineColor: vColor,
          glowColor: vGlow,
          isSelected: v.id === selectedVehicleId,
          status: v.status,
        },
      };
    });

    const trailFeatures = activeVehicles.map((v) => {
      const split = getDeliveryRouteSplit(v);
      const uniqueColors = getUniqueVehicleColor(v.id);
      const vColor = v.lineColor || uniqueColors.line;
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: split.completedTrail,
        },
        properties: {
          vehicleId: v.id,
          lineColor: vColor,
          isSelected: v.id === selectedVehicleId,
        },
      };
    });

    if (map.getSource('delivery-incoming-routes')) {
      map.getSource('delivery-incoming-routes').setData({
        type: 'FeatureCollection',
        features: incomingFeatures,
      });
    }

    if (map.getSource('delivery-trail-routes')) {
      map.getSource('delivery-trail-routes').setData({
        type: 'FeatureCollection',
        features: trailFeatures,
      });
    } else {
      addCustomLayers(map);
    }

    // Clean up any remaining distance markers if any exist
    Object.keys(distanceMarkersRef.current).forEach((id) => {
      try { distanceMarkersRef.current[id].marker.remove(); } catch (e) {}
      delete distanceMarkersRef.current[id];
    });
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const initialStyleKey = theme === 'dark' ? 'dark' : 'light';
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLES[initialStyleKey].style,
      center: [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat], // Sant Kabir Eye Hospital Base (Basti, UP)
      zoom: 10,
      pitch: 25,
      attributionControl: false,
    });

    mapRef.current = map;
    if (typeof window !== 'undefined') window.__map = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');

    map.on('load', () => {
      map.resize();
      addCustomLayers(map);
      updateBaseMarker(map);
      updateDistanceVectors(map);
      updateVehicleMarkers(map);
      map.on('zoomend', () => {
        updateVehicleMarkers(map);
      });

      setTimeout(() => {
        map.resize();
        fitAll({ duration: 0 });
      }, 100);
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
      <!-- Solid Steady Aura (Zero Blinking) -->
      <div class="absolute w-10 h-10 rounded-full ${isDark ? 'bg-rose-500/25' : 'bg-rose-500/20'} pointer-events-none"></div>

      <!-- Apple Maps Red Medical Disc -->
      <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-600 to-red-500 border-2 border-white shadow-[0_0_16px_rgba(225,29,72,0.6)] flex items-center justify-center text-white hover:scale-110 transition-transform">
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
        <a href="${BASE_HOSPITAL.googleMapsUrl || 'https://maps.app.goo.gl/NDr27v6mEnooeBE99'}" target="_blank" rel="noopener noreferrer" class="text-rose-500 hover:text-rose-600 font-bold ml-0.5" title="Open in Google Maps" onclick="event.stopPropagation()">↗</a>
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

    // Anti-collision decluttering: zoom-adaptive radial fan-out so ambulances never collide
    const zoom = map.getZoom ? map.getZoom() : 11;
    const thresholdDeg = zoom < 11.5 ? 0.0055 : (zoom < 13 ? 0.0035 : 0.0016);
    const baseRadius = zoom < 11.5 ? 0.0042 : (zoom < 13 ? 0.0026 : 0.0011);

    const declutterGroups = [];
    vehicles.forEach((v) => {
      const lat = Number(v.lat || 0);
      const lon = Number(v.lon || 0);
      let matched = null;
      for (const grp of declutterGroups) {
        const rep = grp[0];
        if (Math.hypot(lat - rep.lat, lon - rep.lon) < thresholdDeg) {
          matched = grp;
          break;
        }
      }
      if (matched) matched.push({ id: v.id, lat, lon });
      else declutterGroups.push([{ id: v.id, lat, lon }]);
    });

    const declutteredCoords = new Map();
    declutterGroups.forEach((grp) => {
      if (grp.length === 1) {
        declutteredCoords.set(grp[0].id, [grp[0].lon, grp[0].lat]);
      } else {
        const centerLon = grp.reduce((acc, c) => acc + c.lon, 0) / grp.length;
        const centerLat = grp.reduce((acc, c) => acc + c.lat, 0) / grp.length;
        const radius = Math.max(baseRadius, 0.0032 + (grp.length * 0.0006));
        grp.forEach((item, idx) => {
          const angle = (idx * (2 * Math.PI / grp.length)) - (Math.PI / 2);
          const oLon = centerLon + (radius * Math.cos(angle) * 1.45);
          const oLat = centerLat + (radius * Math.sin(angle));
          declutteredCoords.set(item.id, [Number(oLon.toFixed(6)), Number(oLat.toFixed(6))]);
        });
      }
    });

    vehicles.forEach((v) => {
      const isSelected = selectedVehicleId === v.id;
      const uniqueColors = getUniqueVehicleColor(v.id);
      const vColor = v.lineColor || uniqueColors.line;
      const liveDist = getLiveDistanceKm(v);
      const pos = declutteredCoords.get(v.id) || [Number(v.lon || 0), Number(v.lat || 0)];
      const loc = getNearestRuralLocation(Number(v.lat || 0), Number(v.lon || 0));
      let markerObj = markersRef.current[v.id];

      const isGap = Boolean(v.isSignalGap);
      const isParked = Boolean(v.isParked);
      const gapMins = v.gapMinutes || 1;
      const badgeColor = isGap ? '#F59E0B' : (isParked ? '#94A3B8' : vColor);

      let statusBadge;
      if (isGap) {
        statusBadge = `<span class="px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30">⏳ Gap ${gapMins}m</span>`;
      } else if (isParked) {
        statusBadge = `<span class="px-1.5 py-0.2 rounded-md text-[9px] font-bold bg-slate-500/15 text-slate-500 dark:text-slate-400 border border-slate-500/30">Standby</span>`;
      } else {
        statusBadge = `<span class="px-1.5 py-0.2 rounded-md text-[9px] font-bold ${
          loc.isCamp 
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' 
            : 'bg-sky-500/15 text-sky-600 dark:text-cyan-400 border border-sky-500/30'
        }">${loc.badge}</span>`;
      }

      const speedStr = isGap 
        ? 'Last Seen' 
        : (isParked ? 'Parked' : (v.speed > 0 ? `${v.speed} km/h` : 'Stopped'));
      const distStr = `${liveDist} km Base`;

      const capsuleContent = `
        <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${badgeColor}; box-shadow: 0 0 6px ${badgeColor};"></span>
        <span class="font-extrabold text-[10.5px]" style="color: ${badgeColor};">${v.id}</span>
        <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
        <span>${speedStr}</span>
        <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
        ${statusBadge}
        <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
        <span class="text-slate-500 dark:text-slate-400 font-semibold">${distStr}</span>
      `;

      const innerContent = `
        <div class="marker-outer-wrapper relative flex flex-col items-center group cursor-pointer transition-transform duration-150 ${isSelected ? 'scale-110 z-40' : 'hover:scale-105 z-20'}">
          <!-- Single Capsule with Rural Village / Camp Indicator -->
          <div class="marker-capsule-text mb-1 px-2.5 py-1 rounded-full border shadow-lg flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold font-mono transition-all backdrop-blur-md pointer-events-auto"
            style="background: ${isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)'}; border-color: ${badgeColor}; color: ${isDark ? '#F8FAFC' : '#0F172A'}; box-shadow: 0 4px 14px ${badgeColor}35;">
            ${capsuleContent}
          </div>

          <!-- 3D Isometric Ambulance with Soft Apple Halo (Zero Strobe/Blink) -->
          <div class="ambulance-rotator mt-0.5 relative flex items-center justify-center transition-transform duration-300 pointer-events-auto" style="transform: rotate(${v.bearing || 0}deg);">
            <div class="selection-halo absolute w-14 h-14 rounded-full ring-2 ring-sky-400/80 shadow-[0_0_20px_rgba(56,189,248,0.55)] pointer-events-none transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0'}"></div>
            ${get3DAmbulanceSvg(isDark, isGap ? 'stopped' : v.status, isSelected, badgeColor, v.id)}
          </div>
        </div>
      `;

      if (!markerObj || !document.body.contains(markerObj.element)) {
        if (markerObj) {
          try { markerObj.marker.remove(); } catch (e) {}
        }
        const el = document.createElement('div');
        el.className = 'select-none pointer-events-auto transition-all duration-700 ease-out';
        el.innerHTML = innerContent;
        el.onclick = (e) => {
          e.stopPropagation();
          onSelectVehicle(v.id);
        };

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(pos)
          .addTo(map);

        markersRef.current[v.id] = { 
          marker, 
          element: el, 
          prevSelected: isSelected, 
          prevDark: isDark, 
          prevBearing: v.bearing 
        };
      } else {
        // Targeted in-place DOM updates: NEVER wipe innerHTML on vehicle selection / TV cycle
        if (markerObj.prevDark !== isDark) {
          markerObj.element.innerHTML = innerContent;
          markerObj.prevDark = isDark;
          markerObj.prevSelected = isSelected;
          markerObj.prevBearing = v.bearing;
        } else {
          // Toggle selection state cleanly on existing DOM elements without wiping innerHTML
          if (markerObj.prevSelected !== isSelected) {
            markerObj.prevSelected = isSelected;
            const outerWrapper = markerObj.element.querySelector('.marker-outer-wrapper');
            if (outerWrapper) {
              if (isSelected) {
                outerWrapper.classList.add('scale-110', 'z-40');
                outerWrapper.classList.remove('hover:scale-105', 'z-20');
              } else {
                outerWrapper.classList.remove('scale-110', 'z-40');
                outerWrapper.classList.add('hover:scale-105', 'z-20');
              }
            }
            const haloEl = markerObj.element.querySelector('.selection-halo');
            if (haloEl) {
              if (isSelected) {
                haloEl.classList.remove('opacity-0');
                haloEl.classList.add('opacity-100');
              } else {
                haloEl.classList.remove('opacity-100');
                haloEl.classList.add('opacity-0');
              }
            }
          }

          const capsuleEl = markerObj.element.querySelector('.marker-capsule-text');
          if (capsuleEl) {
            capsuleEl.innerHTML = capsuleContent;
          }
          const rotatorEl = markerObj.element.querySelector('.ambulance-rotator');
          if (rotatorEl && markerObj.prevBearing !== v.bearing) {
            rotatorEl.style.transform = `rotate(${v.bearing || 0}deg)`;
            markerObj.prevBearing = v.bearing;
          }
        }
        markerObj.marker.setLngLat(pos);
      }
    });
  };

  useEffect(() => {
    updateVehicleMarkers();

    if (selectedVehicleId && mapRef.current) {
      if (prevSelectedIdRef.current !== selectedVehicleId) {
        prevSelectedIdRef.current = selectedVehicleId;
        const selected = vehicles.find((v) => v.id === selectedVehicleId);
        if (selected) {
          const d = calculateDistanceKm(
            BASE_HOSPITAL.lat,
            BASE_HOSPITAL.lon,
            Number(selected.lat || 0),
            Number(selected.lon || 0)
          );
          if (d > 25) {
            fitVehicleRoute(selectedVehicleId);
          } else {
            focusVehicle(selectedVehicleId);
          }
        }
      }
    } else {
      prevSelectedIdRef.current = null;
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
    </div>
  );
}
