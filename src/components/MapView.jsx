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

// Closest segment projection for road corridor waypoint snapping
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

// Compute Zomato/Swiggy-style split navigation lines:
// 1. upcomingRoute: animated delivery corridor leading into the user/camp destination ("coming to my location")
// 2. completedTrail: solid navigation trail behind ambulance to the base hospital
function getDeliveryRouteSplit(v, camps) {
  const baseCoord = [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat];
  const vehCoord = [v.lon, v.lat];

  const camp = camps.find(c => c.id === v.assignedCampId);
  if (!camp || !camp.routeWaypoints || camp.routeWaypoints.length < 2) {
    return {
      upcomingRoute: [vehCoord, [camp?.lon || BASE_HOSPITAL.lon, camp?.lat || BASE_HOSPITAL.lat]],
      completedTrail: [baseCoord, vehCoord],
    };
  }

  const wps = camp.routeWaypoints;
  const k = findClosestSegmentIndex(vehCoord, wps);

  if (v.status === 'returning') {
    // Returning to Base Hospital
    // upcomingRoute: from vehicle to Base Hospital along remaining waypoints
    const upcoming = [vehCoord];
    for (let i = k; i >= 0; i--) {
      upcoming.push(wps[i]);
    }
    // completedTrail: from Camp to vehicle
    const completed = [];
    for (let i = wps.length - 1; i > k; i--) {
      completed.push(wps[i]);
    }
    completed.push(vehCoord);
    return {
      upcomingRoute: upcoming.length > 1 ? upcoming : [vehCoord, baseCoord],
      completedTrail: completed.length > 1 ? completed : [[camp.lon, camp.lat], vehCoord],
    };
  }

  // Moving to Camp Destination ("coming to my location" like Zomato / Swiggy)
  // completedTrail: from Base Hospital through passed waypoints to current vehicle position
  const completed = [];
  for (let i = 0; i <= k; i++) {
    completed.push(wps[i]);
  }
  completed.push(vehCoord);

  // upcomingRoute: from current vehicle position through upcoming waypoints to Camp Destination
  const upcoming = [vehCoord];
  for (let i = k + 1; i < wps.length; i++) {
    upcoming.push(wps[i]);
  }

  return {
    upcomingRoute: upcoming.length > 1 ? upcoming : [vehCoord, [camp.lon, camp.lat]],
    completedTrail: completed.length > 1 ? completed : [baseCoord, vehCoord],
  };
}

// Authentic 3D Isometric Ambulance with specular lighting, dual headlights, and drop shadow
function get3DAmbulanceSvg(isDark, status, isSelected) {
  const isMoving = status === 'moving' || status === 'returning';
  const sirenColor = isMoving ? '#EF4444' : '#F59E0B';
  const uniqueId = Math.random().toString(36).substr(2, 6);

  return `
    <svg class="w-12 h-14 select-none drop-shadow-2xl" viewBox="0 0 52 64" fill="none" xmlns="http://www.w3.org/2000/svg">
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
  vehicles, 
  camps, 
  selectedVehicleId, 
  onSelectVehicle, 
  onSelectCamp, 
  fitTrigger, 
  theme = 'light',
  activeStyleKey = 'light',
  onStyleChange,
  showDistanceLines = true,
  detent = 'half',
  actionTrigger = null,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const campMarkersRef = useRef({});
  const baseMarkerRef = useRef(null);
  const distanceMarkersRef = useRef({});
  const ringLabelMarkersRef = useRef([]);

  // Responsive padding calculation (adapts dynamically to Apple Sheet position)
  const getResponsivePadding = () => {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    
    return {
      top: isMobile ? 80 : 70,
      bottom: isMobile ? (detent === 'peek' ? 90 : 360) : (detent === 'peek' ? 80 : 80),
      left: isDesktop ? (detent === 'peek' ? 70 : 410) : 25,
      right: isDesktop ? 70 : 25,
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

  const currentStyleKeyRef = useRef(activeStyleKey || (theme === 'dark' ? 'dark' : 'light'));

  // Switch Map Style safely
  const changeStyle = (key) => {
    if (!mapRef.current || !MAP_STYLES[key]) return;
    currentStyleKeyRef.current = key;
    if (onStyleChange) onStyleChange(key);
    const map = mapRef.current;
    map.setStyle(MAP_STYLES[key].style);

    const onStyleData = () => {
      if (map.isStyleLoaded()) {
        map.off('styledata', onStyleData);
        addCustomLayers(map, key === 'dark');
        updateBaseMarker();
        updateCampMarkers();
        updateRingLabels(map);
        updateDistanceVectors(map);
        updateVehicleMarkers();
      }
    };
    map.on('styledata', onStyleData);
  };

  useEffect(() => {
    if (activeStyleKey && activeStyleKey !== currentStyleKeyRef.current) {
      changeStyle(activeStyleKey);
    }
  }, [activeStyleKey]);

  // Respond to action triggers (resetNorth, centerBase, focusRoute, focusDistance)
  useEffect(() => {
    if (!actionTrigger || !mapRef.current) return;
    const { type } = actionTrigger;
    if (type === 'resetNorth') {
      mapRef.current.easeTo({ bearing: 0, pitch: 20, duration: 800 });
    } else if (type === 'centerBase') {
      mapRef.current.flyTo({ center: [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat], zoom: 12.5, speed: 1.2 });
    } else if (type === 'focusRoute') {
      const veh = vehicles.find(v => v.id === selectedVehicleId);
      const camp = veh ? camps.find(c => c.id === veh.assignedCampId) : null;
      if (camp && camp.routeWaypoints) {
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat]);
        camp.routeWaypoints.forEach(pt => bounds.extend(pt));
        mapRef.current.fitBounds(bounds, { padding: getResponsivePadding(), duration: 1000 });
      }
    } else if (type === 'focusDistance') {
      const veh = vehicles.find(v => v.id === selectedVehicleId);
      if (veh) {
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([BASE_HOSPITAL.lon, BASE_HOSPITAL.lat]);
        bounds.extend([veh.lon, veh.lat]);
        mapRef.current.fitBounds(bounds, { padding: getResponsivePadding(), duration: 1000 });
      }
    }
  }, [actionTrigger]);

  // Add Route lines, Distance Range Rings, and Geofences
  const addCustomLayers = (map, forceDark = null) => {
    try {
      const isDark = forceDark !== null ? forceDark : (theme === 'dark' || currentStyleKeyRef.current === 'dark');

      // 1. Clean up air range rings if any exist
      if (map.getSource('base-range-rings')) {
        if (map.getLayer('base-range-rings-fill')) map.removeLayer('base-range-rings-fill');
        if (map.getLayer('base-range-rings-line')) map.removeLayer('base-range-rings-line');
        map.removeSource('base-range-rings');
      }

      // 2. Zomato/Swiggy-style Delivery Navigation Corridors
      // Clean up previous sources if present
      if (map.getSource('delivery-incoming-routes')) {
        if (map.getLayer('delivery-incoming-casing')) map.removeLayer('delivery-incoming-casing');
        if (map.getLayer('delivery-incoming-road')) map.removeLayer('delivery-incoming-road');
        if (map.getLayer('delivery-incoming-flow')) map.removeLayer('delivery-incoming-flow');
        map.removeSource('delivery-incoming-routes');
      }
      if (map.getSource('delivery-trail-routes')) {
        if (map.getLayer('delivery-trail-line')) map.removeLayer('delivery-trail-line');
        map.removeSource('delivery-trail-routes');
      }
      if (map.getSource('base-distance-vectors')) {
        if (map.getLayer('base-navigation-trail-casing')) map.removeLayer('base-navigation-trail-casing');
        if (map.getLayer('base-distance-vectors-line')) map.removeLayer('base-distance-vectors-line');
        map.removeSource('base-distance-vectors');
      }

      const activeVehicles = vehicles.filter((v) => v.status !== 'at_base');

      const incomingFeatures = activeVehicles.map((v) => {
        const split = getDeliveryRouteSplit(v, camps);
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: split.upcomingRoute,
          },
          properties: {
            vehicleId: v.id,
            isSelected: v.id === selectedVehicleId,
            status: v.status,
          },
        };
      });

      const trailFeatures = activeVehicles.map((v) => {
        const split = getDeliveryRouteSplit(v, camps);
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: split.completedTrail,
          },
          properties: {
            vehicleId: v.id,
            isSelected: v.id === selectedVehicleId,
          },
        };
      });

      // A. Completed Road Trail Behind Vehicle (Solid subtle highway trail)
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
          'line-color': isDark ? '#0284c7' : '#007AFF',
          'line-width': [
            'case',
            ['get', 'isSelected'],
            4.5,
            3.2,
          ],
          'line-opacity': isDark ? 0.8 : 0.75,
        },
      });

      // B. Upcoming Delivery Route Leading to Destination ("Lines coming to my location")
      map.addSource('delivery-incoming-routes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: incomingFeatures,
        },
      });

      // 1) Soft Glowing Ambient Delivery Corridor
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
          'line-color': isDark ? '#00e5ff' : '#007AFF',
          'line-width': [
            'case',
            ['get', 'isSelected'],
            12,
            7.5,
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

      // 2) Solid Apple Maps Blue Navigation Ribbon
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
          'line-color': [
            'case',
            ['get', 'isSelected'],
            '#007AFF',
            isDark ? '#0284c7' : '#0066FF',
          ],
          'line-width': [
            'case',
            ['get', 'isSelected'],
            5.5,
            4,
          ],
          'line-opacity': 0.95,
        },
      });

      // 3) Zomato/Swiggy Animated Dash Flow (Streaming pulses towards destination)
      map.addLayer({
        id: 'delivery-incoming-flow',
        type: 'line',
        source: 'delivery-incoming-routes',
        layout: {
          visibility: showDistanceLines ? 'visible' : 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 2.2,
          'line-opacity': 0.95,
          'line-dasharray': [1.5, 2.5],
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
          'line-color': isDark ? '#38bdf8' : '#0284c7',
          'line-width': 4.5,
          'line-opacity': isDark ? 0.12 : 0.08,
          'line-blur': 2,
        },
      });

      map.addLayer({
        id: 'camp-routes-line',
        type: 'line',
        source: 'camp-routes',
        paint: {
          'line-color': isDark ? '#334155' : '#cbd5e1',
          'line-width': 2.5,
          'line-opacity': isDark ? 0.4 : 0.5,
        },
      });

      // 4. Designated Camp Areas (500m Real Geodesic Ground Perimeters)
      if (map.getSource('camp-geofences')) {
        if (map.getLayer('camp-area-fill')) map.removeLayer('camp-area-fill');
        if (map.getLayer('camp-area-glow')) map.removeLayer('camp-area-glow');
        if (map.getLayer('camp-area-boundary')) map.removeLayer('camp-area-boundary');
        map.removeSource('camp-geofences');
      }

      const campFeatures = camps.map((camp) => {
        const radiusKm = (camp.radiusMeters || 500) / 1000;
        const circleFeat = createGeoJSONCircle([camp.lon, camp.lat], radiusKm, 64);
        circleFeat.properties = {
          id: camp.id,
          name: camp.name,
          radiusMeters: camp.radiusMeters || 500,
        };
        return circleFeat;
      });

      map.addSource('camp-geofences', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: campFeatures,
        },
      });

      // Translucent Emerald Medical Zone Ground Fill
      map.addLayer({
        id: 'camp-area-fill',
        type: 'fill',
        source: 'camp-geofences',
        paint: {
          'fill-color': isDark ? '#059669' : '#10B981',
          'fill-opacity': isDark ? 0.22 : 0.16,
        },
      });

      // Soft Ambient Boundary Glow
      map.addLayer({
        id: 'camp-area-glow',
        type: 'line',
        source: 'camp-geofences',
        paint: {
          'line-color': isDark ? '#34d399' : '#10B981',
          'line-width': 7,
          'line-opacity': 0.35,
          'line-blur': 3,
        },
      });

      // Crisp Dashed Designated Zone Perimeter Line
      map.addLayer({
        id: 'camp-area-boundary',
        type: 'line',
        source: 'camp-geofences',
        paint: {
          'line-color': isDark ? '#6ee7b7' : '#059669',
          'line-width': 2.5,
          'line-opacity': 0.88,
          'line-dasharray': [4, 3],
        },
      });
    } catch (e) {
      console.warn('Custom layer registration error:', e);
    }
  };

  // Update Distance Lines & Range Rings visibility whenever prop changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    const visibility = showDistanceLines ? 'visible' : 'none';
    if (map.getLayer('base-range-rings-line')) map.setLayoutProperty('base-range-rings-line', 'visibility', visibility);
    if (map.getLayer('base-range-rings-fill')) map.setLayoutProperty('base-range-rings-fill', 'visibility', visibility);
    if (map.getLayer('delivery-incoming-casing')) map.setLayoutProperty('delivery-incoming-casing', 'visibility', visibility);
    if (map.getLayer('delivery-incoming-road')) map.setLayoutProperty('delivery-incoming-road', 'visibility', visibility);
    if (map.getLayer('delivery-incoming-flow')) map.setLayoutProperty('delivery-incoming-flow', 'visibility', visibility);
    if (map.getLayer('delivery-trail-line')) map.setLayoutProperty('delivery-trail-line', 'visibility', visibility);

    Object.values(distanceMarkersRef.current).forEach(({ element }) => {
      element.style.display = showDistanceLines ? 'flex' : 'none';
    });
    ringLabelMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = showDistanceLines ? 'flex' : 'none';
    });
  }, [showDistanceLines]);

  // Live Navigation Line Animation (Streaming forward pulses + flashing glow into destination)
  useEffect(() => {
    let animId;
    let lastDashUpdate = 0;
    let step = 0;
    const dashPatterns = [
      [0.1, 2.5, 2.4],
      [0.5, 2.5, 2.0],
      [1.0, 2.5, 1.5],
      [1.5, 2.5, 1.0],
      [2.0, 2.5, 0.5],
      [2.5, 2.5, 0.1],
    ];

    const animate = (timestamp) => {
      const map = mapRef.current;
      if (map && map.isStyleLoaded()) {
        try {
          // 1. Flashing & Breathing Glow Effect on Blue Navigation Corridor
          if (map.getLayer('delivery-incoming-casing')) {
            const pulse = (Math.sin(timestamp * 0.005) + 1) / 2; // oscillates smoothly between 0 and 1
            const opacity = 0.25 + 0.45 * pulse; // breathes between 0.25 and 0.70
            const width = 8 + 4 * pulse; // pulses between 8px and 12px
            map.setPaintProperty('delivery-incoming-casing', 'line-opacity', opacity);
            map.setPaintProperty('delivery-incoming-casing', 'line-width', width);
          }

          // 2. Dash flow movement every ~80ms
          if (timestamp - lastDashUpdate > 80) {
            lastDashUpdate = timestamp;
            if (map.getLayer('delivery-incoming-flow')) {
              step = (step + 1) % dashPatterns.length;
              map.setPaintProperty('delivery-incoming-flow', 'line-dasharray', dashPatterns[step]);
            }
          }

          // Force canvas re-render so animations stream actively even when map is static
          map.triggerRepaint();
        } catch (e) {}
      }
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  // Update Road Navigation Trail geometry and Midpoint Distance Badges
  const updateDistanceVectors = (map) => {
    if (!map) return;

    const isDark = theme === 'dark' || currentStyleKeyRef.current === 'dark';
    const activeVehicles = vehicles.filter(v => v.status !== 'at_base');

    const incomingFeatures = activeVehicles.map((v) => {
      const split = getDeliveryRouteSplit(v, camps);
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: split.upcomingRoute,
        },
        properties: {
          vehicleId: v.id,
          isSelected: v.id === selectedVehicleId,
          status: v.status,
        },
      };
    });

    const trailFeatures = activeVehicles.map((v) => {
      const split = getDeliveryRouteSplit(v, camps);
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: split.completedTrail,
        },
        properties: {
          vehicleId: v.id,
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
    }

    // Update midpoint distance badges on the map
    const activeVehIds = new Set(activeVehicles.map(v => v.id));

    // Remove deleted vehicle distance badges
    Object.keys(distanceMarkersRef.current).forEach((id) => {
      if (!activeVehIds.has(id)) {
        distanceMarkersRef.current[id].marker.remove();
        delete distanceMarkersRef.current[id];
      }
    });

    activeVehicles.forEach((v) => {
      const split = getDeliveryRouteSplit(v, camps);
      const upcomingCoords = split.upcomingRoute;
      const midIdx = Math.max(0, Math.floor(upcomingCoords.length / 2));
      const midPoint = upcomingCoords[midIdx] || [v.lon, v.lat];
      const midLon = midPoint[0];
      const midLat = midPoint[1];

      const targetCamp = camps.find(c => c.id === v.assignedCampId);
      const targetName = v.status === 'returning' 
        ? 'Base Hospital' 
        : (targetCamp?.name?.replace(' Community Eye Camp', '')?.replace(' Rural Vision & Cataract Camp', '')?.replace(' Outreach Centre', '')?.replace(' Eye Screening Camp', '') || 'Camp');
      const roadDistFromBase = v.roadDistFromBaseKm || 16.8;
      const roadDistToCamp = v.roadDistToCampKm || v.distRemainingKm || 18.0;
      const eta = v.etaMins || 14;
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
        <div class="px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold tracking-tight shadow-lg flex items-center gap-1.5 ${
          isSelected 
            ? (isDark ? 'bg-cyan-950 text-cyan-200 border-cyan-400 scale-110 shadow-cyan-500/40' : 'bg-blue-600 text-white border-blue-700 scale-110 shadow-blue-500/30')
            : (isDark ? 'bg-slate-950/95 text-cyan-300 border-cyan-500/40' : 'bg-white/95 text-blue-900 border-blue-200 shadow-sm')
        }">
          <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : (isDark ? 'bg-cyan-400' : 'bg-emerald-500')} animate-pulse"></span>
          <span>🛣️ ${roadDistFromBase} km from Base • ~${roadDistToCamp} km to ${targetName}</span>
        </div>
      `;
    });
  };

  // Air Range Rings removed as per user instruction (strictly true road distances only)
  const updateRingLabels = () => {};

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
      updateVehicleMarkers();

      setTimeout(() => {
        map.resize();
        fitAll();
      }, 150);
    });

    // Clicking anywhere on open map deselects active vehicle
    map.on('click', (e) => {
      if (e.originalEvent && e.originalEvent.target && (e.originalEvent.target.closest('.maplibre-marker') || e.originalEvent.target.closest('.maplibregl-marker'))) {
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
      markersRef.current = {};
      Object.values(campMarkersRef.current).forEach((marker) => marker.remove());
      campMarkersRef.current = {};
      Object.values(distanceMarkersRef.current).forEach(({ marker }) => marker.remove());
      distanceMarkersRef.current = {};
      ringLabelMarkersRef.current.forEach((marker) => marker.remove());
      ringLabelMarkersRef.current = [];
      if (baseMarkerRef.current) {
        baseMarkerRef.current.remove();
        baseMarkerRef.current = null;
      }
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

  // Trigger fit when fitTrigger or detent changes
  useEffect(() => {
    fitAll();
  }, [fitTrigger, detent]);

  // Base Hospital Landmark Marker (Apple Maps style POI)
  const updateBaseMarker = () => {
    const map = mapRef.current;
    if (!map) return;

    if (baseMarkerRef.current) {
      baseMarkerRef.current.remove();
      baseMarkerRef.current = null;
    }

    const isDark = theme === 'dark';
    const el = document.createElement('div');
    el.className = 'group relative flex flex-col items-center justify-center cursor-pointer select-none';
    el.onclick = (e) => {
      e.stopPropagation();
      map.flyTo({ center: [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat], zoom: 13.5, speed: 1.2 });
    };

    el.innerHTML = `
      <div class="relative flex items-center justify-center">
        <!-- Soft Apple Beacon Halo -->
        <div class="absolute w-14 h-14 rounded-full ${isDark ? 'bg-rose-500/20' : 'bg-rose-500/15'} animate-ping pointer-events-none"></div>
        <div class="absolute w-10 h-10 rounded-full ${isDark ? 'bg-rose-500/25' : 'bg-rose-500/20'} pointer-events-none"></div>

        <!-- Apple Maps Red Landmark Squircle -->
        <div class="w-9 h-9 rounded-2xl bg-gradient-to-tr from-rose-600 via-red-500 to-rose-400 border-2 ${
          isDark ? 'border-white/90 shadow-[0_4px_16px_rgba(244,63,94,0.5)]' : 'border-white shadow-[0_4px_14px_rgba(225,29,72,0.35)]'
        } flex items-center justify-center text-white transition-transform duration-200 hover:scale-110">
          <svg class="w-5 h-5 drop-shadow-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M12 4v16M4 12h16"/>
          </svg>
        </div>
      </div>

      <!-- Attached Apple Callout Label -->
      <div class="mt-1 whitespace-nowrap px-2.5 py-0.5 rounded-full backdrop-blur-md ${
        isDark 
          ? 'bg-slate-950/95 border border-rose-500/40 text-rose-200 shadow-md' 
          : 'bg-white/95 border border-rose-200 text-rose-950 shadow-sm font-semibold'
      } text-[10px] tracking-tight flex items-center gap-1">
        <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
        <span>Sant Kabir Hospital (Base)</span>
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

  // Update Camp Markers (Apple Maps POI Disc Style)
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

      const incomingVehicle = vehicles.find((v) => v.assignedCampId === camp.id && v.status === 'moving');

      const el = document.createElement('div');
      el.className = 'relative flex flex-col items-center justify-center cursor-pointer group select-none';
      el.onclick = (e) => {
        e.stopPropagation();
        if (onSelectCamp) onSelectCamp(camp);
      };

      const shortCampName = camp.name
        .replace(' Community Eye Camp', '')
        .replace(' Rural Vision & Cataract Camp', '')
        .replace(' Outreach Centre', '')
        .replace(' Eye Screening Camp', '');

      el.innerHTML = `
        <!-- Designated Camp Perimeter Badge -->
        <div class="mb-1 whitespace-nowrap px-2 py-0.5 rounded-full ${
          isDark ? 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-300' : 'bg-emerald-50/95 border border-emerald-300 text-emerald-800'
        } text-[8.5px] font-semibold tracking-tight shadow-xs flex items-center gap-1 pointer-events-none">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Designated Camp Zone (500m)</span>
        </div>

        ${incomingVehicle ? `
          <!-- Zomato/Swiggy Delivery Destination Header -->
          <div class="mb-1 whitespace-nowrap px-2.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[9px] font-bold shadow-md border border-white/60 flex items-center gap-1 animate-bounce-subtle pointer-events-none">
            <span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
            <span>🎯 DESTINATION • Incoming Ambulance</span>
          </div>
        ` : ''}

        <div class="relative flex items-center justify-center">
          <!-- Gentle Sonar Ripple Ring -->
          <div class="absolute w-14 h-14 rounded-full ${isDark ? 'bg-emerald-400/20' : 'bg-emerald-500/15'} radar-ring pointer-events-none"></div>

          ${incomingVehicle ? `
            <!-- Zomato/Swiggy Destination Beacon Pulse Rings -->
            <div class="absolute -inset-3 rounded-full bg-emerald-500/35 animate-ping pointer-events-none"></div>
            <div class="absolute -inset-6 rounded-full bg-teal-500/20 animate-pulse pointer-events-none"></div>
          ` : ''}
          
          <!-- Apple Maps Camp Medical POI Disc -->
          <div class="w-8 h-8 rounded-full ${
            incomingVehicle
              ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 border-2 border-white shadow-[0_4px_14px_rgba(16,185,129,0.5)] text-white'
              : (isDark 
                  ? 'bg-gradient-to-tr from-emerald-700 to-teal-500 border-2 border-white/90 shadow-[0_4px_14px_rgba(16,185,129,0.5)] text-white' 
                  : 'bg-gradient-to-tr from-emerald-600 to-teal-600 border-2 border-white shadow-[0_4px_12px_rgba(5,150,105,0.35)] text-white')
          } flex items-center justify-center hover:scale-110 transition-transform">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
        </div>

        <!-- Apple Callout Label Pill with Camp Person In-Charge & GPS -->
        <div class="mt-1 whitespace-nowrap px-2.5 py-0.5 rounded-full backdrop-blur-md ${
          isDark 
            ? 'bg-slate-950/95 border border-emerald-500/40 text-emerald-200 shadow-md' 
            : 'bg-white/95 border border-emerald-200 text-slate-800 shadow-xs'
        } text-[10px] font-bold flex items-center gap-1.5 transition-all group-hover:scale-105">
          <span class="w-1.5 h-1.5 rounded-full ${incomingVehicle ? 'bg-emerald-400 animate-ping' : 'bg-emerald-500'}"></span>
          <span>${shortCampName}</span>
          <span class="text-slate-400 dark:text-slate-600">•</span>
          <span class="${isDark ? 'text-emerald-300' : 'text-emerald-700'} font-medium">${camp.coordinatorName || 'Lead'}</span>
          <span class="text-[9px] font-mono opacity-60">(${camp.lat.toFixed(3)}°, ${camp.lon.toFixed(3)}°)</span>
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
  }, [camps, theme, vehicles]);

  // Update Vehicle Markers with Apple AirTag Platter Style
  const updateVehicleMarkers = () => {
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

      if (!markerObj || !markerObj.marker.getElement() || !markerObj.marker.getElement().parentElement) {
        if (markerObj) {
          try { markerObj.marker.remove(); } catch (e) {}
        }
        const el = document.createElement('div');
        el.className = 'select-none pointer-events-auto';
        el.onclick = (e) => {
          e.stopPropagation();
          onSelectVehicle(v.id);
        };

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([v.lon, v.lat])
          .addTo(map);

        markersRef.current[v.id] = { marker, element: el };
        markerObj = markersRef.current[v.id];
      } else {
        markerObj.marker.setLngLat([v.lon, v.lat]);
      }

      const shortName = v.name
        .replace('Mobile Screening ', '')
        .replace('Cataract Surgical ', '')
        .replace('Vision Outreach ', 'Outreach ')
        .replace('Emergency Outreach ', '');

      let statusDotColor = 'bg-slate-400';
      if (v.status === 'moving') statusDotColor = 'bg-emerald-500 shadow-sm shadow-emerald-500/50';
      else if (v.status === 'at_camp') statusDotColor = 'bg-sky-500 shadow-sm shadow-sky-500/50';
      else if (v.status === 'returning') statusDotColor = 'bg-indigo-500 shadow-sm shadow-indigo-500/50';

      markerObj.element.innerHTML = `
        <div class="relative flex flex-col items-center group cursor-pointer transition-transform duration-200 ${isSelected ? 'scale-110 z-30' : 'hover:scale-105 z-20'}">
          <!-- Zomato/Swiggy Live ETA Bubble Floating Above Vehicle (Upright) -->
          ${v.status === 'moving' && v.speed > 0 ? `
            <div class="mb-1.5 whitespace-nowrap px-2.5 py-0.5 rounded-full shadow-lg border backdrop-blur-md flex items-center gap-1.5 bg-gradient-to-r from-blue-600 via-sky-600 to-indigo-600 text-white border-white/60 text-[9.5px] font-mono font-bold tracking-tight pointer-events-none">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span>⚡ ~${v.etaMins || 14}m to Camp (${v.roadDistToCampKm || v.distRemainingKm || 18}km Road)</span>
            </div>
          ` : ''}

          <!-- 3D Isometric Ambulance Rotated on the Road along Vehicle Bearing -->
          <div class="relative flex items-center justify-center transition-transform duration-500 ease-out" style="transform: rotate(${v.bearing || 0}deg);">
            ${isSelected ? `
              <div class="absolute w-14 h-16 rounded-full ${isDark ? 'bg-sky-400/30 ring-2 ring-sky-400/50' : 'bg-sky-500/25 ring-2 ring-sky-500/40'} animate-ping pointer-events-none"></div>
            ` : ''}
            ${get3DAmbulanceSvg(isDark, v.status, isSelected)}
          </div>

          <!-- Apple Frosted Label Pill Below (Upright) -->
          <div class="mt-1 px-2.5 py-0.5 rounded-full backdrop-blur-md border shadow-md flex items-center gap-1.5 transition-all duration-200 ${
            isSelected
              ? (isDark ? 'bg-sky-950/95 text-sky-200 border-sky-400/80 scale-105 shadow-sky-500/30' : 'bg-sky-600 text-white border-sky-700 scale-105 shadow-sky-500/25')
              : (isDark ? 'bg-slate-950/90 text-slate-200 border-white/10 group-hover:border-slate-600' : 'bg-white/95 text-slate-800 border-slate-200/80 shadow-xs group-hover:border-slate-300')
          }">
            <span class="w-2 h-2 rounded-full ${statusDotColor}"></span>
            <span class="text-[10px] font-bold leading-none tracking-tight">${shortName}</span>
            <span class="text-slate-400 dark:text-slate-600">•</span>
            <span class="text-[9.5px] font-medium opacity-90">${v.driverName ? v.driverName.split(' ')[0] : 'Driver'}</span>
            <span class="text-[9px] font-mono opacity-80">${v.speed > 0 ? `${v.speed} km/h` : 'Standby'}</span>
          </div>
        </div>
      `;
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

  return (
    <div className="relative flex-1 w-full h-full min-h-[400px] overflow-hidden">
      {/* Absolute positioned full-bleed map canvas */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
