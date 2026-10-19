import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { BASE_HOSPITAL, calculateDistanceKm } from '../data/mockData';
import { getDeliveryRouteSplit, getAllRoadCorridors } from '../utils/roadDistance';
import { getNearestRuralLocation } from '../utils/ruralLocator';
import { getUniqueVehicleColor } from '../utils/colors';
import ruralVillages from '../data/ruralVillages.json';
import { loadTieredGeoJson } from '../utils/tieredMapCache';

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
        },
        {
          id: 'esri-light-labels-layer',
          type: 'raster',
          source: 'esri-light-labels',
          minzoom: 0,
          maxzoom: 22,
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
        },
        {
          id: 'esri-dark-labels-layer',
          type: 'raster',
          source: 'esri-dark-labels',
          minzoom: 0,
          maxzoom: 22,
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
          maxzoom: 18,
          attribution: 'Source: Esri, Maxar, Earthstar Geographics',
        },
        'esri-boundaries': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 18,
        },
      },
      layers: [
        {
          id: 'esri-imagery-layer',
          type: 'raster',
          source: 'esri-imagery',
          minzoom: 0,
          maxzoom: 22,
        },
        {
          id: 'esri-boundaries-layer',
          type: 'raster',
          source: 'esri-boundaries',
          minzoom: 0,
          maxzoom: 22,
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
          maxzoom: 19,
          attribution: 'Esri, HERE, Garmin, USGS, © OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'esri-streets-layer',
          type: 'raster',
          source: 'esri-streets',
          minzoom: 0,
          maxzoom: 22,
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

// Authentic 3D Isometric Ambulance with specular lighting, dual headlights, forward road beams, Sant Kabir emblem, and beacon
function get3DAmbulanceSvg(isDark, status, isSelected, vColor = '#007AFF', vId = '') {
  const isMoving = status === 'moving' || status === 'returning';
  const uniqueId = (vId || 'amb').replace(/[^a-zA-Z0-9]/g, '_');

  return `
    <svg width="54" height="68" class="w-[52px] h-[66px] select-none" viewBox="0 0 54 68" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="${isDark ? '#E2E8F0' : '#F1F5F9'}"/>
        </linearGradient>
        <!-- High-intensity forward road illumination beam -->
        <linearGradient id="headlightBeam_${uniqueId}" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#FEF08A" stop-opacity="0.65"/>
          <stop offset="60%" stop-color="#FEF08A" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#FEF08A" stop-opacity="0"/>
        </linearGradient>
        <!-- Soft ambient chassis contact shadow (pure GPU radial gradient - 0ms filter cost) -->
        <radialGradient id="chassisShadow_${uniqueId}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#000000" stop-opacity="${isDark ? '0.65' : '0.4'}"/>
          <stop offset="65%" stop-color="#000000" stop-opacity="${isDark ? '0.25' : '0.12'}"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- 1. Deep 3D Ground Drop Shadow on Asphalt (GPU Radial Gradient) -->
      <ellipse cx="27" cy="42" rx="21" ry="24" fill="url(#chassisShadow_${uniqueId})" />

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
      ${isMoving ? `
        <circle cx="23" cy="31" r="3.5" fill="#EF4444" opacity="0.4" />
        <circle cx="23" cy="31" r="1.8" fill="#FFFFFF" opacity="0.9" />
        <circle cx="31" cy="31" r="3.5" fill="#3B82F6" opacity="0.4" />
        <circle cx="31" cy="31" r="1.8" fill="#FFFFFF" opacity="0.9" />
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

function MapView({ 
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
  isSheetMinimized = false,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const baseMarkerRef = useRef(null);
  const distanceMarkersRef = useRef({});
  const currentStyleKeyRef = useRef(activeStyleKey);
  const vehiclesRef = useRef(vehicles);
  const prevSelectedIdRef = useRef(null);
  const animFrameRef = useRef(null);
  const tier2DataRef = useRef(null);
  const tier3DataRef = useRef(null);
  const isFetchingTier2Ref = useRef(false);
  const isFetchingTier3Ref = useRef(false);

  const checkTieredZoom = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const z = map.getZoom();

    if (z >= 11.0 && !tier2DataRef.current && !isFetchingTier2Ref.current) {
      isFetchingTier2Ref.current = true;
      loadTieredGeoJson('tier2', '/data/tiered/purvanchal-tier2.geojson').then((data) => {
        isFetchingTier2Ref.current = false;
        if (data && mapRef.current) {
          tier2DataRef.current = data;
          const src = mapRef.current.getSource('purvanchal-tier2-source');
          if (src) src.setData(data);
        }
      });
    }

    if (z >= 13.5 && !tier3DataRef.current && !isFetchingTier3Ref.current) {
      isFetchingTier3Ref.current = true;
      loadTieredGeoJson('tier3', '/data/tiered/purvanchal-tier3.geojson').then((data) => {
        isFetchingTier3Ref.current = false;
        if (data && mapRef.current) {
          tier3DataRef.current = data;
          const src = mapRef.current.getSource('purvanchal-tier3-source');
          if (src) src.setData(data);
        }
      });
    }
  };

  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  // Clean animation frame on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, []);

  // Step marker animations smoothly via requestAnimationFrame (Zero Stutter / Butter Smooth)
  const stepMarkerAnimations = () => {
    const now = performance.now();
    let hasActive = false;

    const markers = Object.values(markersRef.current);
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (!m || !m.isAnimating) continue;

      const elapsed = now - m.animStartTime;
      const progress = Math.min(1, Math.max(0, elapsed / m.animDuration));
      // Constant linear velocity for authentic, steady road gliding
      const t = progress;

      const curLon = m.startPos[0] + (m.targetPos[0] - m.startPos[0]) * t;
      const curLat = m.startPos[1] + (m.targetPos[1] - m.startPos[1]) * t;
      m.currentPos = [curLon, curLat];
      m.marker.setLngLat(m.currentPos);

      // Continuous unwrapped angle rotation (Zero 360° flip or spin jump)
      if (m.startAngle !== undefined && m.targetAngle !== undefined && m.startAngle !== m.targetAngle) {
        const curAngle = m.startAngle + (m.targetAngle - m.startAngle) * t;
        m.displayAngle = curAngle;
        if (m.rotatorEl) {
          m.rotatorEl.style.transform = `rotate(${curAngle.toFixed(2)}deg)`;
        }
      }

      if (progress < 1) {
        hasActive = true;
      } else {
        m.isAnimating = false;
        m.startPos = m.targetPos;
        m.currentPos = m.targetPos;
        m.startAngle = m.targetAngle;
      }
    }

    if (hasActive) {
      animFrameRef.current = requestAnimationFrame(stepMarkerAnimations);
    } else {
      animFrameRef.current = null;
    }
  };

  const scheduleMarkerAnimation = () => {
    if (!animFrameRef.current) {
      animFrameRef.current = requestAnimationFrame(stepMarkerAnimations);
    }
  };

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

    const isWideScreen = typeof window !== 'undefined' && window.innerWidth >= 640;
    const canvas = map.getCanvas();
    const cWidth = canvas ? (canvas.clientWidth || canvas.width) : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const cHeight = canvas ? (canvas.clientHeight || canvas.height) : (typeof window !== 'undefined' ? window.innerHeight : 800);
    // On wide screens (>= 640px), AppleSheet takes 380px width on left + 16px margin = 396px, unless sheet is minimized
    const maxLeft = isSheetMinimized
      ? Math.max(40, Math.floor(cWidth * 0.05))
      : (isWideScreen ? Math.min(Math.max(405, Math.floor(cWidth * 0.36)), Math.max(30, cWidth - 300)) : 24);
    const maxTop = Math.max(30, Math.min(90, Math.floor(cHeight * 0.12)));
    const maxBottom = isSheetMinimized
      ? Math.max(70, Math.floor(cHeight * 0.10))
      : (isWideScreen ? Math.max(30, Math.min(80, Math.floor(cHeight * 0.12))) : Math.min(220, Math.floor(cHeight * 0.32)));
    const maxRight = Math.max(30, Math.min(80, Math.floor(cWidth * 0.08)));

    const padding = { top: maxTop, bottom: maxBottom, left: maxLeft, right: maxRight };

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

    const isWideScreen = typeof window !== 'undefined' && window.innerWidth >= 640;
    const canvas = map.getCanvas();
    const cWidth = canvas ? (canvas.clientWidth || canvas.width) : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const cHeight = canvas ? (canvas.clientHeight || canvas.height) : (typeof window !== 'undefined' ? window.innerHeight : 800);
    const maxLeft = isSheetMinimized
      ? Math.max(40, Math.floor(cWidth * 0.05))
      : (isWideScreen ? Math.min(Math.max(405, Math.floor(cWidth * 0.36)), Math.max(30, cWidth - 300)) : 24);
    const maxTop = Math.max(35, Math.min(100, Math.floor(cHeight * 0.14)));
    const maxBottom = isSheetMinimized
      ? Math.max(70, Math.floor(cHeight * 0.10))
      : (isWideScreen ? Math.max(30, Math.min(80, Math.floor(cHeight * 0.14))) : Math.min(220, Math.floor(cHeight * 0.32)));
    const maxRight = Math.max(30, Math.min(80, Math.floor(cWidth * 0.08)));

    const padding = { top: maxTop, bottom: maxBottom, left: maxLeft, right: maxRight };

    map.fitBounds(bounds, {
      padding,
      maxZoom: 13.8,
      pitch: 22,
      bearing: 0,
      duration: options.duration !== undefined ? options.duration : 1000,
      essential: true,
    });
  };

  // Center camera on a specific vehicle (Upright North-up orientation, smooth parabolic glide without dizzy spinning)
  const focusVehicle = (vehId) => {
    const map = mapRef.current;
    if (!map) return;
    const veh = vehicles.find((v) => v.id === vehId);
    if (!veh) return;

    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 640;
    map.flyTo({
      center: [Number(veh.lon || 0), Number(veh.lat || 0)],
      padding: {
        top: 60,
        bottom: isSheetMinimized ? 80 : (isDesktop ? 60 : 200),
        left: isSheetMinimized ? 60 : (isDesktop ? 400 : 24),
        right: 40,
      },
      zoom: 13.8,
      pitch: 28,
      bearing: 0,
      speed: 1.1,
      curve: 1.42,
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
      if (map.getLayer('purvanchal-tier3-labels')) map.removeLayer('purvanchal-tier3-labels');
      if (map.getLayer('purvanchal-tier3-dots')) map.removeLayer('purvanchal-tier3-dots');
      if (map.getLayer('purvanchal-tier3-paths')) map.removeLayer('purvanchal-tier3-paths');
      if (map.getSource('purvanchal-tier3-source')) map.removeSource('purvanchal-tier3-source');

      if (map.getLayer('purvanchal-tier2-labels')) map.removeLayer('purvanchal-tier2-labels');
      if (map.getLayer('purvanchal-tier2-dots')) map.removeLayer('purvanchal-tier2-dots');
      if (map.getLayer('purvanchal-tier2-roads')) map.removeLayer('purvanchal-tier2-roads');
      if (map.getSource('purvanchal-tier2-source')) map.removeSource('purvanchal-tier2-source');

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
      checkTieredZoom();
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

  // Handle action triggers (e.g. Zoom In, Zoom Out, Fit All, Center Base, Reset North, Locate, Fit Route Corridor)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (actionTrigger?.type === 'zoomIn') {
      map.zoomIn({ duration: 300 });
    } else if (actionTrigger?.type === 'zoomOut') {
      map.zoomOut({ duration: 300 });
    } else if (actionTrigger?.type === 'fitAll') {
      fitAll({ duration: 800 });
    } else if (actionTrigger?.type === 'centerBase') {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 640;
      map.flyTo({
        center: [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat],
        padding: {
          top: 60,
          bottom: isDesktop ? 60 : 200,
          left: isDesktop ? 400 : 24,
          right: 40,
        },
        zoom: 13.5,
        pitch: 24,
        bearing: 0,
        duration: 900,
        essential: true,
      });
    } else if (actionTrigger?.type === 'resetNorth') {
      map.easeTo({ bearing: 0, pitch: 20, duration: 800 });
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

      // Tier 2: Purvanchal Panchayats, Health Centers (CHCs/PHCs) & Secondary MDR Roads (Lazy loaded z >= 11.0)
      if (map.getSource('purvanchal-tier2-source')) {
        if (map.getLayer('purvanchal-tier2-labels')) map.removeLayer('purvanchal-tier2-labels');
        if (map.getLayer('purvanchal-tier2-dots')) map.removeLayer('purvanchal-tier2-dots');
        if (map.getLayer('purvanchal-tier2-roads')) map.removeLayer('purvanchal-tier2-roads');
        map.removeSource('purvanchal-tier2-source');
      }

      map.addSource('purvanchal-tier2-source', {
        type: 'geojson',
        data: tier2DataRef.current || { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'purvanchal-tier2-roads',
        type: 'line',
        source: 'purvanchal-tier2-source',
        filter: ['==', '$type', 'LineString'],
        minzoom: 10.8,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': isDark ? '#475569' : '#94A3B8',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            11, 1.2,
            13, 2.0,
            16, 3.8,
          ],
          'line-opacity': 0.7,
        },
      });

      map.addLayer({
        id: 'purvanchal-tier2-dots',
        type: 'circle',
        source: 'purvanchal-tier2-source',
        filter: ['==', '$type', 'Point'],
        minzoom: 11.0,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            11, 2.2,
            13, 3.5,
            15, 5.0,
          ],
          'circle-color': [
            'case',
            ['==', ['get', 'type'], 'chc'], '#10B981',
            ['==', ['get', 'type'], 'phc'], '#06B6D4',
            isDark ? '#38BDF8' : '#0284C7',
          ],
          'circle-stroke-width': 1.2,
          'circle-stroke-color': isDark ? '#0F172A' : '#FFFFFF',
          'circle-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'purvanchal-tier2-labels',
        type: 'symbol',
        source: 'purvanchal-tier2-source',
        filter: ['==', '$type', 'Point'],
        minzoom: 11.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            11.5, 9.5,
            14, 11,
          ],
          'text-offset': [0, 0.75],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': isDark ? '#CBD5E1' : '#334155',
          'text-halo-color': isDark ? '#090D16' : '#FFFFFF',
          'text-halo-width': 1.8,
          'text-halo-blur': 0.5,
        },
      });

      // Tier 3: Micro-Hamlets, Purvas, and Village Link Paths (Lazy loaded z >= 13.5)
      if (map.getSource('purvanchal-tier3-source')) {
        if (map.getLayer('purvanchal-tier3-labels')) map.removeLayer('purvanchal-tier3-labels');
        if (map.getLayer('purvanchal-tier3-dots')) map.removeLayer('purvanchal-tier3-dots');
        if (map.getLayer('purvanchal-tier3-paths')) map.removeLayer('purvanchal-tier3-paths');
        map.removeSource('purvanchal-tier3-source');
      }

      map.addSource('purvanchal-tier3-source', {
        type: 'geojson',
        data: tier3DataRef.current || { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'purvanchal-tier3-paths',
        type: 'line',
        source: 'purvanchal-tier3-source',
        filter: ['==', '$type', 'LineString'],
        minzoom: 13.5,
        paint: {
          'line-color': isDark ? '#334155' : '#CBD5E1',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            13.5, 0.8,
            16, 2.0,
          ],
          'line-dasharray': [2, 2],
          'line-opacity': 0.65,
        },
      });

      map.addLayer({
        id: 'purvanchal-tier3-dots',
        type: 'circle',
        source: 'purvanchal-tier3-source',
        filter: ['==', '$type', 'Point'],
        minzoom: 13.5,
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            13.5, 1.8,
            16, 3.2,
          ],
          'circle-color': isDark ? '#94A3B8' : '#64748B',
          'circle-stroke-width': 1.0,
          'circle-stroke-color': isDark ? '#020617' : '#FFFFFF',
          'circle-opacity': 0.8,
        },
      });

      map.addLayer({
        id: 'purvanchal-tier3-labels',
        type: 'symbol',
        source: 'purvanchal-tier3-source',
        filter: ['==', '$type', 'Point'],
        minzoom: 13.8,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            13.8, 8.5,
            16, 10,
          ],
          'text-offset': [0, 0.6],
          'text-anchor': 'top',
          'text-optional': true,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': isDark ? '#94A3B8' : '#64748B',
          'text-halo-color': isDark ? '#090D16' : '#FFFFFF',
          'text-halo-width': 1.5,
          'text-halo-blur': 0.5,
        },
      });

      // 2. Traveled Highway Road Trail Behind Active Vehicles
      if (map.getSource('delivery-trail-routes')) {
        if (map.getLayer('delivery-trail-line')) map.removeLayer('delivery-trail-line');
        map.removeSource('delivery-trail-routes');
      }

      const activeVehicles = vehicles.filter(v => v.status !== 'at_base');
      const trailFeatures = activeVehicles
        .filter(v => v.id === selectedVehicleId)
        .map((v) => {
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
              isSelected: true,
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
            'interpolate', ['linear'], ['zoom'],
            8, 4.0,
            11, 5.5,
            14, 8.0,
            16, 10.0,
          ],
          'line-opacity': [
            'case',
            ['get', 'isSelected'], 1.0,
            0.0,
          ],
        },
      });

      // 3. Active Turn-by-Turn Road Navigation Corridor for each working vehicle
      if (map.getSource('delivery-incoming-routes')) {
        if (map.getLayer('delivery-incoming-road')) map.removeLayer('delivery-incoming-road');
        if (map.getLayer('delivery-incoming-casing')) map.removeLayer('delivery-incoming-casing');
        map.removeSource('delivery-incoming-routes');
      }

      const hasSelection = Boolean(selectedVehicleId);
      const incomingFeatures = activeVehicles.map((v) => {
        const split = getDeliveryRouteSplit(v);
        const uniqueColors = getUniqueVehicleColor(v.id);
        const isSelected = v.id === selectedVehicleId;
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: split.upcomingRoute,
          },
          properties: {
            vehicleId: v.id,
            lineColor: v.lineColor || uniqueColors.line,
            glowColor: v.glowColor || uniqueColors.glow,
            isSelected: isSelected,
            hasSelection: hasSelection,
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
            'interpolate', ['linear'], ['zoom'],
            8, ['case', ['get', 'isSelected'], 7.0, ['get', 'hasSelection'], 2.0, 4.0],
            11, ['case', ['get', 'isSelected'], 9.5, ['get', 'hasSelection'], 2.5, 5.5],
            14, ['case', ['get', 'isSelected'], 13.0, ['get', 'hasSelection'], 3.5, 8.0],
            16, ['case', ['get', 'isSelected'], 16.0, ['get', 'hasSelection'], 4.5, 11.0],
          ],
          'line-opacity': [
            'case',
            ['get', 'isSelected'], 0.85,
            ['get', 'hasSelection'], 0.08,
            0.35,
          ],
          'line-blur': [
            'case',
            ['get', 'isSelected'], 2.5,
            1.0,
          ],
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
            'interpolate', ['linear'], ['zoom'],
            8, ['case', ['get', 'isSelected'], 4.5, ['get', 'hasSelection'], 1.4, 2.8],
            11, ['case', ['get', 'isSelected'], 6.0, ['get', 'hasSelection'], 1.8, 3.8],
            14, ['case', ['get', 'isSelected'], 8.5, ['get', 'hasSelection'], 2.4, 5.5],
            16, ['case', ['get', 'isSelected'], 11.0, ['get', 'hasSelection'], 3.2, 7.5],
          ],
          'line-opacity': [
            'case',
            ['get', 'isSelected'], 1.0,
            ['get', 'hasSelection'], 0.18,
            0.75,
          ],
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

  // Update Road Navigation Trails, Incoming Corridors, and On-Road Midpoint Distance Badges
  const updateDistanceVectors = (map) => {
    if (!map || !map.isStyleLoaded()) return;

    const isDark = theme === 'dark' || currentStyleKeyRef.current === 'dark';
    const activeVehicles = vehicles.filter(v => v.status !== 'at_base');
    const hasSelection = Boolean(selectedVehicleId);

    // Individual authentic road lines for each active working vehicle
    const incomingFeatures = activeVehicles.map((v) => {
      const split = getDeliveryRouteSplit(v);
      const uniqueColors = getUniqueVehicleColor(v.id);
      const vColor = v.lineColor || uniqueColors.line;
      const vGlow = v.glowColor || uniqueColors.glow;
      const isSelected = v.id === selectedVehicleId;
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
          isSelected: isSelected,
          hasSelection: hasSelection,
          status: v.status,
        },
      };
    });

    const trailFeatures = activeVehicles
      .filter(v => v.id === selectedVehicleId)
      .map((v) => {
        const uniqueColors = getUniqueVehicleColor(v.id);
        const vColor = v.lineColor || uniqueColors.line;
        const isSelected = true;
        const trailCoords = Array.isArray(v.trail) && v.trail.length > 1
          ? v.trail
          : getDeliveryRouteSplit(v).completedTrail;
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: trailCoords,
          },
          properties: {
            vehicleId: v.id,
            lineColor: vColor,
            isSelected: isSelected,
            hasSelection: hasSelection,
          },
        };
      });

    // Elevate selected vehicle route to the end so it renders on top in WebGL
    incomingFeatures.sort((a, b) => (a.properties.isSelected ? 1 : 0) - (b.properties.isSelected ? 1 : 0));
    trailFeatures.sort((a, b) => (a.properties.isSelected ? 1 : 0) - (b.properties.isSelected ? 1 : 0));

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
    }

    if (!map.getSource('delivery-incoming-routes') || !map.getSource('delivery-trail-routes')) {
      if (map.isStyleLoaded()) {
        addCustomLayers(map);
      }
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

    const updateZoomLOD = () => {
      if (!mapContainer.current) return;
      const z = map.getZoom();
      if (z < 11.2) {
        mapContainer.current.classList.add('map-zoom-overview');
        mapContainer.current.classList.remove('map-zoom-detailed');
      } else {
        mapContainer.current.classList.add('map-zoom-detailed');
        mapContainer.current.classList.remove('map-zoom-overview');
      }
    };

    map.on('load', () => {
      map.resize();
      updateZoomLOD();
      map.on('zoom', updateZoomLOD);
      map.on('zoom', checkTieredZoom);
      addCustomLayers(map);
      updateBaseMarker(map);
      updateDistanceVectors(map);
      updateVehicleMarkers(map);
      checkTieredZoom();

      setTimeout(() => {
        map.resize();
        fitAll({ duration: 0 });
      }, 100);
    });

    return () => {
      Object.values(markersRef.current).forEach(m => { try { m.marker.remove(); } catch (e) {} });
      markersRef.current = {};
      Object.values(distanceMarkersRef.current).forEach(m => { try { m.marker.remove(); } catch (e) {} });
      distanceMarkersRef.current = {};
      if (baseMarkerRef.current) {
        try { baseMarkerRef.current.remove(); } catch (e) {}
        baseMarkerRef.current = null;
      }
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
        <span>Sant Kabir Eye Hospital (Basti Base)</span>
        <a href="${BASE_HOSPITAL.googleMapsUrl || 'https://maps.app.goo.gl/6eur1NCPRzC93sDG9'}" target="_blank" rel="noopener noreferrer" class="text-rose-500 hover:text-rose-600 font-bold ml-0.5" title="Open in Google Maps" onclick="event.stopPropagation()">↗</a>
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

  // Update Vehicle Markers with Apple AirTag Platter Style (Zero-Blink & Butter Smooth Gliding)
  const updateVehicleMarkers = (mapParam) => {
    const map = mapParam || mapRef.current;
    if (!map) return;

    const isDark = theme === 'dark';
    const currentVehIds = new Set(vehicles.map(v => v.id));

    // Remove pruned markers cleanly
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentVehIds.has(id)) {
        try { markersRef.current[id].marker.remove(); } catch (e) {}
        delete markersRef.current[id];
      }
    });

    let anyMoved = false;

    vehicles.forEach((v) => {
      const isSelected = selectedVehicleId === v.id;
      const uniqueColors = getUniqueVehicleColor(v.id);
      const vColor = v.lineColor || uniqueColors.line;
      const liveDist = getLiveDistanceKm(v);
      const pos = [Number(v.lon || 0), Number(v.lat || 0)];
      
      const isGap = Boolean(v.isSignalGap);
      const isParked = Boolean(v.isParked);
      const gapMins = v.gapMinutes || 1;
      const badgeColor = isGap ? '#F59E0B' : (isParked ? '#94A3B8' : vColor);

      const liveLoc = (v.lat && v.lon)
        ? getNearestRuralLocation(Number(v.lat), Number(v.lon))
        : { badge: v.villageBadge || 'Purvanchal Region' };

      let statusBadgeText = '';
      let statusBadgeClass = '';
      if (isGap) {
        statusBadgeText = `⏳ Gap ${gapMins}m`;
        statusBadgeClass = 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30';
      } else if (isParked && liveDist < 1.2) {
        statusBadgeText = 'Base Hospital';
        statusBadgeClass = 'bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30';
      } else {
        statusBadgeText = liveLoc.badge;
        statusBadgeClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
      }

      const speedStr = isGap 
        ? 'Last Seen' 
        : (isParked ? 'Standby' : (v.speed > 0 ? `${v.speed} km/h` : 'Standby'));
      const driverName = v.driverName || 'Driver';
      const distStr = `${liveDist} km Base`;
      const targetBearing = Number(v.bearing || 0);

      let markerObj = markersRef.current[v.id];
      const isConnected = markerObj?.marker?.getElement()?.isConnected;

      // CREATE MARKER IF NOT EXISTS OR DETACHED FROM ACTIVE MAP CANVAS
      if (!markerObj || !isConnected) {
        if (markerObj) {
          try { markerObj.marker.remove(); } catch (e) {}
          delete markersRef.current[v.id];
        }
        const el = document.createElement('div');
        el.className = 'select-none pointer-events-auto will-change-transform';
        
        el.innerHTML = `
          <div class="marker-outer-wrapper relative flex flex-col items-center group cursor-pointer ${isSelected ? 'scale-110 z-50 is-selected' : 'hover:scale-105 z-20'}" style="transition: transform 150ms ease-out;">
            <!-- Complete Apple Capsule Tag: ID • Driver • Speed • Camp • Distance (Always Visible, Zero Blink) -->
            <div class="marker-capsule-text mb-1 px-2.5 py-0.5 rounded-full border shadow-md flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold font-mono pointer-events-auto"
              style="background: ${isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.97)'}; border-color: ${badgeColor}; color: ${isDark ? '#F8FAFC' : '#0F172A'}; box-shadow: 0 4px 12px ${badgeColor}30;">
              <span class="marker-dot w-2 h-2 rounded-full shrink-0" style="background-color: ${badgeColor}; box-shadow: 0 0 6px ${badgeColor};"></span>
              <span class="marker-id font-extrabold text-[10.5px]" style="color: ${badgeColor};">${v.id}</span>
              <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
              <span class="marker-driver text-slate-700 dark:text-slate-200 font-semibold">${driverName}</span>
              <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
              <span class="marker-speed">${speedStr}</span>
              <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
              <span class="marker-status px-1.5 py-0.2 rounded-md text-[9px] font-bold ${statusBadgeClass}">${statusBadgeText}</span>
              <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
              <span class="marker-dist text-slate-500 dark:text-slate-400 font-semibold">${distStr}</span>
            </div>

            <!-- 3D Isometric Ambulance (Always Visible, Zero Strobe/Blink, Hardware accelerated) -->
            <div class="ambulance-rotator mt-0.5 relative flex items-center justify-center pointer-events-auto" style="transform: rotate(${targetBearing}deg); will-change: transform; transition: none;">
              <div class="selection-halo absolute w-14 h-14 rounded-full ring-2 ring-sky-400 dark:ring-cyan-400 shadow-[0_0_22px_rgba(56,189,248,0.7)] pointer-events-none transition-opacity duration-300 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}"></div>
              ${get3DAmbulanceSvg(isDark, isGap ? 'stopped' : v.status, isSelected, badgeColor, v.id)}
            </div>
          </div>
        `;

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
          outerWrapper: el.querySelector('.marker-outer-wrapper'),
          capsuleText: el.querySelector('.marker-capsule-text'),
          dotEl: el.querySelector('.marker-dot'),
          idEl: el.querySelector('.marker-id'),
          driverEl: el.querySelector('.marker-driver'),
          speedEl: el.querySelector('.marker-speed'),
          statusEl: el.querySelector('.marker-status'),
          distEl: el.querySelector('.marker-dist'),
          haloEl: el.querySelector('.selection-halo'),
          rotatorEl: el.querySelector('.ambulance-rotator'),
          prevDriver: driverName,
          prevSpeed: speedStr,
          prevDist: distStr,
          prevStatusText: statusBadgeText,
          prevStatusClass: statusBadgeClass,
          prevBadgeColor: badgeColor,
          prevSelected: isSelected,
          prevDark: isDark,
          currentPos: pos,
          startPos: pos,
          targetPos: pos,
          displayAngle: targetBearing,
          startAngle: targetBearing,
          targetAngle: targetBearing,
          lastUpdateTime: performance.now(),
          animStartTime: 0,
          animDuration: 2000,
          isAnimating: false,
        };
      } else {
        // IN-PLACE MUTATION ONLY (NEVER REBUILD INNERHTML - ZERO FLICKER/BLINK)
        if (markerObj.prevDark !== isDark) {
          // Re-render only when switching dark/light theme
          markerObj.element.innerHTML = `
            <div class="marker-outer-wrapper relative flex flex-col items-center group cursor-pointer ${isSelected ? 'scale-110 z-50 is-selected' : 'hover:scale-105 z-20'}" style="transition: transform 150ms ease-out;">
              <div class="marker-capsule-text mb-1 px-2.5 py-0.5 rounded-full border shadow-md flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold font-mono pointer-events-auto"
                style="background: ${isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.97)'}; border-color: ${badgeColor}; color: ${isDark ? '#F8FAFC' : '#0F172A'}; box-shadow: 0 4px 12px ${badgeColor}30;">
                <span class="marker-dot w-2 h-2 rounded-full shrink-0" style="background-color: ${badgeColor}; box-shadow: 0 0 6px ${badgeColor};"></span>
                <span class="marker-id font-extrabold text-[10.5px]" style="color: ${badgeColor};">${v.id}</span>
                <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
                <span class="marker-driver text-slate-700 dark:text-slate-200 font-semibold">${driverName}</span>
                <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
                <span class="marker-speed">${speedStr}</span>
                <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
                <span class="marker-status px-1.5 py-0.2 rounded-md text-[9px] font-bold ${statusBadgeClass}">${statusBadgeText}</span>
                <span class="text-slate-400 dark:text-slate-600 font-normal">•</span>
                <span class="marker-dist text-slate-500 dark:text-slate-400 font-semibold">${distStr}</span>
              </div>
              <div class="ambulance-rotator mt-0.5 relative flex items-center justify-center pointer-events-auto" style="transform: rotate(${markerObj.displayAngle || targetBearing}deg); will-change: transform; transition: none;">
                <div class="selection-halo absolute w-14 h-14 rounded-full ring-2 ring-sky-400 dark:ring-cyan-400 shadow-[0_0_22px_rgba(56,189,248,0.7)] pointer-events-none transition-opacity duration-300 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}"></div>
                ${get3DAmbulanceSvg(isDark, isGap ? 'stopped' : v.status, isSelected, badgeColor, v.id)}
              </div>
            </div>
          `;
          markerObj.outerWrapper = markerObj.element.querySelector('.marker-outer-wrapper');
          markerObj.capsuleText = markerObj.element.querySelector('.marker-capsule-text');
          markerObj.dotEl = markerObj.element.querySelector('.marker-dot');
          markerObj.idEl = markerObj.element.querySelector('.marker-id');
          markerObj.driverEl = markerObj.element.querySelector('.marker-driver');
          markerObj.speedEl = markerObj.element.querySelector('.marker-speed');
          markerObj.statusEl = markerObj.element.querySelector('.marker-status');
          markerObj.distEl = markerObj.element.querySelector('.marker-dist');
          markerObj.haloEl = markerObj.element.querySelector('.selection-halo');
          markerObj.rotatorEl = markerObj.element.querySelector('.ambulance-rotator');
          markerObj.prevDark = isDark;
          markerObj.prevSelected = isSelected;
          markerObj.prevDriver = driverName;
          markerObj.prevSpeed = speedStr;
          markerObj.prevDist = distStr;
          markerObj.prevStatusText = statusBadgeText;
          markerObj.prevStatusClass = statusBadgeClass;
        } else {
          // In-Place Text Updates (100% Flicker-Free, 0ms overhead)
          if (markerObj.driverEl && markerObj.prevDriver !== driverName) {
            markerObj.driverEl.textContent = driverName;
            markerObj.prevDriver = driverName;
          }
          if (markerObj.speedEl && markerObj.prevSpeed !== speedStr) {
            markerObj.speedEl.textContent = speedStr;
            markerObj.prevSpeed = speedStr;
          }
          if (markerObj.distEl && markerObj.prevDist !== distStr) {
            markerObj.distEl.textContent = distStr;
            markerObj.prevDist = distStr;
          }
          if (markerObj.statusEl && markerObj.prevStatusText !== statusBadgeText) {
            markerObj.statusEl.textContent = statusBadgeText;
            markerObj.prevStatusText = statusBadgeText;
          }
          if (markerObj.statusEl && markerObj.prevStatusClass !== statusBadgeClass) {
            markerObj.statusEl.className = `marker-status px-1.5 py-0.2 rounded-md text-[9px] font-bold ${statusBadgeClass}`;
            markerObj.prevStatusClass = statusBadgeClass;
          }

          // Toggle Selection styling cleanly without touching text DOM
          if (markerObj.prevSelected !== isSelected) {
            markerObj.prevSelected = isSelected;
            if (markerObj.outerWrapper) {
              if (isSelected) {
                markerObj.outerWrapper.classList.add('scale-110', 'z-50', 'is-selected');
                markerObj.outerWrapper.classList.remove('hover:scale-105', 'z-20');
              } else {
                markerObj.outerWrapper.classList.remove('scale-110', 'z-50', 'is-selected');
                markerObj.outerWrapper.classList.add('hover:scale-105', 'z-20');
              }
            }
            if (markerObj.haloEl) {
              if (isSelected) {
                markerObj.haloEl.classList.remove('opacity-0', 'scale-90');
                markerObj.haloEl.classList.add('opacity-100', 'scale-100');
              } else {
                markerObj.haloEl.classList.remove('opacity-100', 'scale-100');
                markerObj.haloEl.classList.add('opacity-0', 'scale-90');
              }
            }
          }
        }

        // Smooth Gliding Position & Continuous Unwrapped Bearing Interpolation
        const posChanged = Math.abs(markerObj.targetPos[0] - pos[0]) > 0.000001 || Math.abs(markerObj.targetPos[1] - pos[1]) > 0.000001;
        const currentDisp = markerObj.displayAngle !== undefined ? markerObj.displayAngle : targetBearing;
        const curNormAngle = ((currentDisp % 360) + 360) % 360;
        let angleDiff = targetBearing - curNormAngle;
        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;

        if (posChanged || Math.abs(angleDiff) > 0.5) {
          const nowTime = performance.now();
          const timeSinceLast = markerObj.lastUpdateTime ? (nowTime - markerObj.lastUpdateTime) : 2000;
          markerObj.lastUpdateTime = nowTime;
          // Match animation duration dynamically to telemetry arrival interval
          markerObj.animDuration = Math.max(400, Math.min(2600, timeSinceLast * 1.05));

          const curPos = markerObj.currentPos || markerObj.targetPos;

          // Teleport Protection: If jump > 3.0 km, snap directly without flying across map
          const dLat = (pos[1] - curPos[1]) * 111.32;
          const dLon = (pos[0] - curPos[0]) * 111.32 * Math.cos(pos[1] * Math.PI / 180);
          const jumpDistKm = Math.sqrt(dLat * dLat + dLon * dLon);

          if (jumpDistKm > 3.0) {
            markerObj.startPos = pos;
            markerObj.currentPos = pos;
            markerObj.targetPos = pos;
            markerObj.marker.setLngLat(pos);
            markerObj.isAnimating = false;
          } else {
            markerObj.startPos = curPos;
            markerObj.targetPos = pos;
            markerObj.animStartTime = nowTime;
            markerObj.isAnimating = true;
            anyMoved = true;
          }

          // Unwrapped angle assignment (prevents 360° flip spins)
          markerObj.startAngle = currentDisp;
          markerObj.targetAngle = currentDisp + angleDiff;
          if (Math.abs(angleDiff) > 0.5) {
            markerObj.animStartTime = nowTime;
            markerObj.isAnimating = true;
            anyMoved = true;
          }
        }
      }
    });

    if (anyMoved) {
      scheduleMarkerAnimation();
    }
  };

  useEffect(() => {
    updateVehicleMarkers();

    if (selectedVehicleId && mapRef.current) {
      if (prevSelectedIdRef.current !== selectedVehicleId) {
        prevSelectedIdRef.current = selectedVehicleId;
        focusVehicle(selectedVehicleId);
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

export default React.memo(MapView);
