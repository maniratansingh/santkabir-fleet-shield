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
      const isTelemetryPath = parsedUrl.pathname === '/api/location' || parsedUrl.pathname === '/api/location/' ||
                             parsedUrl.pathname === '/api/v1/telemetry' || parsedUrl.pathname === '/api/v1/telemetry/' ||
                             parsedUrl.pathname === '/location' || parsedUrl.pathname === '/track' || parsedUrl.pathname === '/telemetry';

      if (isTelemetryPath || hasTraccarParams) {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.end();
          return;
        }

        let id = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('uniqueId') || 'SK-AMB-01';
        let driver = parsedUrl.searchParams.get('driver') || 'Emergency Driver';
        let lat = parseFloat(parsedUrl.searchParams.get('lat') || '');
        let lon = parseFloat(parsedUrl.searchParams.get('lon') || '');
        let rawSpeed = parseFloat(parsedUrl.searchParams.get('speed') || '0');
        let batt = parseFloat(parsedUrl.searchParams.get('batt') || '100');

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
              if (!isNaN(json.batt)) batt = parseFloat(json.batt);
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
          const speedKmH = rawSpeed > 0 ? (rawSpeed <= 120 ? Math.round(rawSpeed) : Math.min(130, Math.round(rawSpeed * 1.852))) : 0;
          const existing = liveVehicles.get(vehId) || {};
          const prevTrail = Array.isArray(existing.trail) ? existing.trail : [];
          const updatedTrail = [...prevTrail.slice(-29), [lon, lat]];

          let bearing = parseFloat(parsedUrl.searchParams.get('bearing') || parsedUrl.searchParams.get('heading') || '0');
          const record = {
            id: vehId,
            name: vehId,
            type: 'ambulance',
            driverName: driver,
            status: speedKmH > 3 ? 'moving' : (distKm < 0.25 ? 'at_base' : 'in_field'),
            lat,
            lon,
            speed: speedKmH,
            bearing: Math.round(((bearing % 360) + 360) % 360),
            batt,
            battery: batt,
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

      if (parsedUrl.pathname === '/api/vehicles' || parsedUrl.pathname === '/api/vehicles/') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ success: true, vehicles: Array.from(liveVehicles.values()), count: liveVehicles.size }));
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
    port: 3000,
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
