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

// Compute road navigation trail originating from Sant Kabir Eye Hospital (Base) to the ambulance
function getNavigationTrailCoords(v, camps) {
  const baseCoord = [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat];
  const vehCoord = [v.lon, v.lat];

  if (!campCoordValid(v)) return [baseCoord, vehCoord];

  const camp = camps.find(c => c.id === v.assignedCampId);
  if (!camp || !camp.routeWaypoints || camp.routeWaypoints.length < 2) {
    return [baseCoord, vehCoord];
  }

  const wps = camp.routeWaypoints;
  const trail = [baseCoord];

  // Radial distance of vehicle from base
  const distVehToBase = Math.hypot(v.lon - BASE_HOSPITAL.lon, v.lat - BASE_HOSPITAL.lat);

  for (let i = 1; i < wps.length; i++) {
    const wp = wps[i];
    const distWpToBase = Math.hypot(wp[0] - BASE_HOSPITAL.lon, wp[1] - BASE_HOSPITAL.lat);
    if (distWpToBase < distVehToBase) {
      trail.push(wp);
    }
  }

  trail.push(vehCoord);
  return trail;
}

function campCoordValid(v) {
  return typeof v.lon === 'number' && typeof v.lat === 'number';
}

// Apple-style beautiful medical ambulance glyph generator for AirTag pins
function getVehicleIconSvg(type, isDark, status) {
  const isMoving = status === 'moving' || status === 'returning';
  
  // High-contrast ambulance theme colors
  const bodyFill = isDark ? '#1E293B' : '#FFFFFF';
  const bodyStroke = isDark ? '#E2E8F0' : '#334155';
  const windowFill = isDark ? '#0284C7' : '#BAE6FD';
  const redCrossFill = '#EF4444';
  const sirenColor = isMoving ? '#EF4444' : '#F59E0B';

  return `
    <svg class="w-6 h-6 select-none shrink-0" viewBox="0 0 28 24" fill="none">
      <!-- Flashing Emergency Roof Beacon Bar -->
      <rect x="10" y="2" width="6" height="2.5" rx="1.25" fill="${sirenColor}" />
      ${isMoving ? `<circle cx="13" cy="3.2" r="3" fill="${sirenColor}" opacity="0.45" class="animate-ping" />` : ''}

      <!-- Ambulance Body Chassis -->
      <path d="M2 17V8C2 6.9 2.9 6 4 6H17V17H2Z" fill="${bodyFill}" stroke="${bodyStroke}" stroke-width="1.8" stroke-linejoin="round" />
      
      <!-- Front Cab Aerodynamic Slope -->
      <path d="M17 9H20.8C21.6 9 22.3 9.6 22.7 10.3L25.3 14.2C25.7 14.8 26 15.5 26 16.2V17H17V9Z" fill="${bodyFill}" stroke="${bodyStroke}" stroke-width="1.8" stroke-linejoin="round" />
      
      <!-- Cab Window -->
      <path d="M17.5 10.5H20.8L23.2 14H17.5V10.5Z" fill="${windowFill}" stroke="${bodyStroke}" stroke-width="1.2" />
      
      <!-- Medical Red Cross (✚) on Ambulance Body -->
      <rect x="8.5" y="8.5" width="2.5" height="6.5" rx="0.5" fill="${redCrossFill}" />
      <rect x="6.5" y="10.5" width="6.5" height="2.5" rx="0.5" fill="${redCrossFill}" />

      <!-- Dual Wheels with Chrome Hubs -->
      <circle cx="6.5" cy="17.5" r="2.5" fill="#0F172A" stroke="${bodyStroke}" stroke-width="1.4" />
      <circle cx="6.5" cy="17.5" r="0.9" fill="#E2E8F0" />
      
      <circle cx="20.5" cy="17.5" r="2.5" fill="#0F172A" stroke="${bodyStroke}" stroke-width="1.4" />
      <circle cx="20.5" cy="17.5" r="0.9" fill="#E2E8F0" />
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

      // 2. Solid Blue Navigation Trail Corridor from Sant Kabir Eye Hospital to each Ambulance
      if (map.getSource('base-distance-vectors')) {
        if (map.getLayer('base-navigation-trail-casing')) map.removeLayer('base-navigation-trail-casing');
        if (map.getLayer('base-distance-vectors-line')) map.removeLayer('base-distance-vectors-line');
        map.removeSource('base-distance-vectors');
      }

      const distanceLineFeatures = vehicles
        .filter((v) => v.status !== 'at_base')
        .map((v) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: getNavigationTrailCoords(v, camps),
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

      // Apple Maps navigation soft blue casing/glow
      map.addLayer({
        id: 'base-navigation-trail-casing',
        type: 'line',
        source: 'base-distance-vectors',
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
            10,
            6,
          ],
          'line-opacity': [
            'case',
            ['get', 'isSelected'],
            0.5,
            0.28,
          ],
          'line-blur': 3,
        },
      });

      // Apple Maps solid vibrant blue navigation ribbon
      map.addLayer({
        id: 'base-distance-vectors-line',
        type: 'line',
        source: 'base-distance-vectors',
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
            isDark ? '#38bdf8' : '#0066FF',
          ],
          'line-width': [
            'case',
            ['get', 'isSelected'],
            5,
            3.5,
          ],
          'line-opacity': [
            'case',
            ['get', 'isSelected'],
            1.0,
            0.88,
          ],
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

  // Update Distance Lines & Range Rings visibility whenever prop changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;

    const visibility = showDistanceLines ? 'visible' : 'none';
    if (map.getLayer('base-range-rings-line')) map.setLayoutProperty('base-range-rings-line', 'visibility', visibility);
    if (map.getLayer('base-range-rings-fill')) map.setLayoutProperty('base-range-rings-fill', 'visibility', visibility);
    if (map.getLayer('base-navigation-trail-casing')) map.setLayoutProperty('base-navigation-trail-casing', 'visibility', visibility);
    if (map.getLayer('base-distance-vectors-line')) map.setLayoutProperty('base-distance-vectors-line', 'visibility', visibility);

    Object.values(distanceMarkersRef.current).forEach(({ element }) => {
      element.style.display = showDistanceLines ? 'flex' : 'none';
    });
    ringLabelMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = showDistanceLines ? 'flex' : 'none';
    });
  }, [showDistanceLines]);

  // Update Road Navigation Trail geometry and Midpoint Distance Badges
  const updateDistanceVectors = (map) => {
    if (!map || !map.getSource('base-distance-vectors')) return;

    const isDark = theme === 'dark' || currentStyleKeyRef.current === 'dark';

    const distanceLineFeatures = vehicles
      .filter(v => v.status !== 'at_base')
      .map(v => {
        const trailCoords = getNavigationTrailCoords(v, camps);
        const dist = calculateDistanceKm(v.lat, v.lon, BASE_HOSPITAL.lat, BASE_HOSPITAL.lon);
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: trailCoords,
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
      const trailCoords = getNavigationTrailCoords(v, camps);
      const midIdx = Math.max(0, Math.floor(trailCoords.length / 2));
      const midPoint = trailCoords[midIdx] || [v.lon, v.lat];
      const midLon = (midPoint[0] + v.lon) / 2;
      const midLat = (midPoint[1] + v.lat) / 2;
      const dist = calculateDistanceKm(v.lat, v.lon, BASE_HOSPITAL.lat, BASE_HOSPITAL.lon);
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
        <div class="px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold tracking-tight shadow-md flex items-center gap-1.5 ${
          isSelected 
            ? (isDark ? 'bg-cyan-950 text-cyan-200 border-cyan-400 scale-110 shadow-cyan-500/30' : 'bg-blue-600 text-white border-blue-700 scale-110 shadow-blue-500/30')
            : (isDark ? 'bg-slate-950/95 text-cyan-300 border-cyan-500/40' : 'bg-white/95 text-blue-900 border-blue-200 shadow-sm')
        }">
          <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : (isDark ? 'bg-cyan-400' : 'bg-blue-600')} animate-pulse"></span>
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
        <div class="relative flex items-center justify-center">
          <!-- Gentle Sonar Ripple Ring -->
          <div class="absolute w-14 h-14 rounded-full ${isDark ? 'bg-cyan-400/20' : 'bg-sky-500/15'} radar-ring pointer-events-none"></div>
          
          <!-- Apple Maps Circular POI Disc -->
          <div class="w-8 h-8 rounded-full ${
            isDark 
              ? 'bg-gradient-to-tr from-cyan-600 to-sky-400 border-2 border-white/90 shadow-[0_4px_14px_rgba(6,182,212,0.5)] text-white' 
              : 'bg-gradient-to-tr from-sky-600 to-cyan-500 border-2 border-white shadow-[0_4px_12px_rgba(2,132,199,0.3)] text-white'
          } flex items-center justify-center hover:scale-110 transition-transform">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
        </div>

        <!-- Apple Callout Label Pill -->
        <div class="mt-1 whitespace-nowrap px-2 py-0.5 rounded-full backdrop-blur-md ${
          isDark 
            ? 'bg-slate-950/95 border border-cyan-500/40 text-cyan-200 shadow-md' 
            : 'bg-white/95 border border-slate-200 text-slate-800 shadow-xs'
        } text-[10px] font-bold flex items-center gap-1.5 transition-all group-hover:scale-105">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>${shortCampName}</span>
          <span class="${isDark ? 'text-cyan-400/90 font-mono' : 'text-sky-600 font-mono'} font-semibold">(${camp.currentScreened || 0})</span>
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
          <!-- Live Heading Chevron (Apple Maps navigation style) -->
          ${v.speed > 1 ? `
            <div style="transform: rotate(${v.bearing || 0}deg);" class="absolute -top-3.5 transition-transform duration-300 pointer-events-none">
              <svg class="w-3.5 h-3.5 ${isDark ? 'text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]' : 'text-sky-600 drop-shadow'}" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12,2 22,22 12,17 2,22"/>
              </svg>
            </div>
          ` : ''}

          <!-- Find My Precision Sonar Ping Rings -->
          ${isSelected ? `
            <div class="absolute -inset-2 rounded-full ${isDark ? 'bg-sky-400/25 ring-2 ring-sky-400/40' : 'bg-sky-500/20 ring-2 ring-sky-500/30'} animate-ping pointer-events-none"></div>
            <div class="absolute -inset-4 rounded-full ${isDark ? 'bg-cyan-400/10' : 'bg-sky-400/10'} animate-pulse pointer-events-none"></div>
          ` : ''}

          <!-- AirTag Circular Metallic Platter Disc -->
          <div class="relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
            isDark
              ? 'bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 border border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.6)] text-white'
              : 'bg-gradient-to-b from-white via-slate-50 to-slate-100 border border-slate-200/90 shadow-[0_4px_14px_rgba(0,0,0,0.18)] text-slate-800'
          } ${
            isSelected 
              ? (isDark ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-950' : 'ring-2 ring-sky-600 ring-offset-2 ring-offset-white') 
              : ''
          }">
            ${getVehicleIconSvg(v.type, isDark, v.status)}

            <!-- Live Status Pip at 4 o'clock -->
            <span class="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 ${isDark ? 'border-slate-900' : 'border-white'} ${statusDotColor}"></span>
          </div>

          <!-- Apple Frosted Label Pill Below -->
          <div class="mt-1 px-2 py-0.5 rounded-full backdrop-blur-md border shadow-md flex items-center gap-1.5 transition-all duration-200 ${
            isSelected
              ? (isDark ? 'bg-sky-950/95 text-sky-200 border-sky-400/80 scale-105 shadow-sky-500/30' : 'bg-sky-600 text-white border-sky-700 scale-105 shadow-sky-500/25')
              : (isDark ? 'bg-slate-950/90 text-slate-200 border-white/10 group-hover:border-slate-600' : 'bg-white/95 text-slate-800 border-slate-200/80 shadow-xs group-hover:border-slate-300')
          }">
            <span class="text-[10px] font-bold leading-none tracking-tight">${shortName}</span>
            <span class="text-[9px] font-mono opacity-80">${v.speed > 0 ? `${v.speed} km/h` : (v.patientsOnboard > 0 ? `${v.patientsOnboard} bded` : 'Idle')}</span>
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
