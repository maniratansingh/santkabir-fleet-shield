import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const DEVELOPER_BANNER = `/* Built & Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
 * Sant Kabir Eye Hospital Real-time Fleet Command System */`;

function telemetryDevPlugin() {
  const liveVehicles = new Map();
  const BASE_LAT = 26.797313;
  const BASE_LON = 82.718401;

  function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  const attachMiddleware = (server) => {
    server.middlewares.use((req, res, next) => {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const hasTraccarParams = (parsedUrl.searchParams.has('id') || parsedUrl.searchParams.has('uniqueId') || parsedUrl.searchParams.has('deviceId')) && 
                               (parsedUrl.searchParams.has('lat') || parsedUrl.searchParams.has('latitude'));
      const isTelemetryPath = parsedUrl.pathname === '/api/track' || parsedUrl.pathname === '/api/track/' ||
                             parsedUrl.pathname === '/api/location' || parsedUrl.pathname === '/api/location/' ||
                             parsedUrl.pathname === '/api/v1/telemetry' || parsedUrl.pathname === '/api/v1/telemetry/' ||
                             parsedUrl.pathname === '/location' || parsedUrl.pathname === '/track' || parsedUrl.pathname === '/telemetry';

      if (isTelemetryPath || hasTraccarParams) {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
          res.end();
          return;
        }

        let id = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('uniqueId') || 'SK-AMB-01';
        let driver = parsedUrl.searchParams.get('driver') || parsedUrl.searchParams.get('driverName') || 'Emergency Driver';
        let lat = parseFloat(parsedUrl.searchParams.get('lat') || parsedUrl.searchParams.get('latitude') || '');
        let lon = parseFloat(parsedUrl.searchParams.get('lon') || parsedUrl.searchParams.get('lng') || parsedUrl.searchParams.get('longitude') || '');
        let rawSpeed = parseFloat(parsedUrl.searchParams.get('speed') || '0');
        let bearing = parseFloat(parsedUrl.searchParams.get('bearing') || parsedUrl.searchParams.get('heading') || '0');
        let altitude = parseFloat(parsedUrl.searchParams.get('altitude') || '0');
        let accuracy = parseFloat(parsedUrl.searchParams.get('accuracy') || '0');
        let batt = parseFloat(parsedUrl.searchParams.get('batt') || parsedUrl.searchParams.get('battery') || '100');
        let chargeParam = parsedUrl.searchParams.get('charge');
        let charge = chargeParam === 'true' || chargeParam === '1';

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          if (body && (isNaN(lat) || isNaN(lon))) {
            try {
              const json = JSON.parse(body);
              if (json.id) id = json.id;
              if (json.driver) driver = json.driver;
              if (!isNaN(json.lat)) lat = parseFloat(json.lat);
              if (!isNaN(json.lon)) lon = parseFloat(json.lon);
              if (!isNaN(json.speed)) rawSpeed = parseFloat(json.speed);
              if (!isNaN(json.bearing)) bearing = parseFloat(json.bearing);
              if (!isNaN(json.altitude)) altitude = parseFloat(json.altitude);
              if (!isNaN(json.accuracy)) accuracy = parseFloat(json.accuracy);
              if (!isNaN(json.batt)) batt = parseFloat(json.batt);
              if (json.charge !== undefined) charge = Boolean(json.charge);
            } catch (e) {}
          }

          if (!id || isNaN(lat) || isNaN(lon)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'Missing or invalid id, lat, or lon' }));
            return;
          }

          const vehId = String(id).trim().toUpperCase();
          const distKm = calculateDistanceKm(BASE_LAT, BASE_LON, lat, lon);
          // Traccar OsmAnd sends speed in knots (1 knot = 1.852 km/h)
          const speedKmH = rawSpeed > 0 ? Math.min(130, Math.round(rawSpeed * 1.852)) : 0;
          const existing = liveVehicles.get(vehId) || {};
          const prevTrail = Array.isArray(existing.trail) ? existing.trail : [];
          const updatedTrail = [...prevTrail.slice(-29), [lon, lat]];

          const record = {
            id: vehId,
            name: vehId,
            type: 'ambulance',
            driverName: driver,
            status: speedKmH > 3 ? 'moving' : (distKm < 0.25 ? 'at_base' : 'in_field'),
            lat,
            lon,
            speed: speedKmH,
            speedKnots: Number(rawSpeed.toFixed(2)),
            bearing: Math.round(((bearing % 360) + 360) % 360),
            altitude: Math.round(altitude),
            accuracy: isNaN(accuracy) ? 0 : Number(accuracy.toFixed(1)),
            batt: Math.min(100, Math.max(0, Math.round(batt))),
            battery: Math.min(100, Math.max(0, Math.round(batt))),
            charge: Boolean(charge),
            distFromBaseKm: distKm,
            roadDistFromBaseKm: Math.round(distKm * 1.15 * 10) / 10,
            trail: updatedTrail,
            updatedAt: Date.now(),
            isLive: true,
          };
          liveVehicles.set(vehId, record);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('X-Powered-By', 'Sant Kabir Fleet Shield (mrps.in)');
          res.end(JSON.stringify({ success: true, app: 'Sant Kabir Fleet Shield', vehicle: record }));
        });
        return;
      }

      if (parsedUrl.pathname === '/api/clear' || parsedUrl.pathname === '/api/clear/') {
        liveVehicles.clear();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ success: true, message: 'Live telemetry cache cleared', count: 0 }));
        return;
      }

      if (parsedUrl.pathname === '/api/vehicles' || parsedUrl.pathname === '/api/vehicles/') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ success: true, vehicles: Array.from(liveVehicles.values()), count: liveVehicles.size }));
        return;
      }

      if (parsedUrl.pathname === '/api/route' || parsedUrl.pathname === '/api/route/') {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.end();
          return;
        }

        let fromLon = parseFloat(parsedUrl.searchParams.get('fromLon') || '');
        let fromLat = parseFloat(parsedUrl.searchParams.get('fromLat') || '');
        const fromParam = parsedUrl.searchParams.get('from');
        if (fromParam && (isNaN(fromLon) || isNaN(fromLat))) {
          const parts = fromParam.split(',');
          if (parts.length === 2) {
            fromLon = parseFloat(parts[0]);
            fromLat = parseFloat(parts[1]);
          }
        }

        let toLon = parseFloat(parsedUrl.searchParams.get('toLon') || '');
        let toLat = parseFloat(parsedUrl.searchParams.get('toLat') || '');
        const toParam = parsedUrl.searchParams.get('to');
        if (toParam && (isNaN(toLon) || isNaN(toLat))) {
          const parts = toParam.split(',');
          if (parts.length === 2) {
            toLon = parseFloat(parts[0]);
            toLat = parseFloat(parts[1]);
          }
        }

        if (isNaN(toLon) || isNaN(toLat)) {
          toLon = BASE_LON;
          toLat = BASE_LAT;
        }

        if (isNaN(fromLon) || isNaN(fromLat)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: 'Missing coordinates' }));
          return;
        }

        (async () => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
            const osrmRes = await fetch(osrmUrl, {
              signal: controller.signal,
              headers: { 'User-Agent': 'SantKabirFleetShield/1.0 (https://fleet.mrps.in)' },
            });
            clearTimeout(timeoutId);

            if (!osrmRes.ok) throw new Error(`OSRM status ${osrmRes.status}`);
            const data = await osrmRes.json();
            if (data.code === 'Ok' && Array.isArray(data.routes) && data.routes.length > 0) {
              const primaryRoute = data.routes[0];
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.end(JSON.stringify({
                success: true,
                source: 'osrm-driving',
                roadDistanceKm: Math.round((primaryRoute.distance / 1000) * 10) / 10,
                roadDistanceMeters: Math.round(primaryRoute.distance),
                durationMin: Math.round(primaryRoute.duration / 60),
                coordinates: primaryRoute.geometry.coordinates,
                pointsCount: primaryRoute.geometry.coordinates.length,
              }));
              return;
            }
            throw new Error('No route returned by OSRM');
          } catch (err) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({
              success: false,
              error: err.name === 'AbortError' ? 'Route query timed out' : err.message,
              fallbackRequired: true,
            }));
          }
        })();
        return;
      }

      next();
    });
  };

  return {
    name: 'telemetry-dev-api',
    configureServer(server) {
      attachMiddleware(server);
    },
    configurePreviewServer(server) {
      attachMiddleware(server);
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    telemetryDevPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        banner: DEVELOPER_BANNER,
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) {
            return 'maplibre';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/lucide-react')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
