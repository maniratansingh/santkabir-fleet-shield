# Data and Routing

## The one base

```text
Sant Kabir Eye Hospital
Basti, Uttar Pradesh
26.797313, 82.718401
```

`src/utils/baseLocation.js` is the single source of truth.

Khalilabad is **not** a base, hub, or route origin. It may appear on a road or
as a destination, but generated routes must not start there.

## What is precomputed

| Data | File | Count |
|---|---|---:|
| Base → village road routes | `src/data/allVillagesRoadRoutes.json` | 195 |
| Initial 17 fleet routes | `src/data/initial17Fleet.js` | 17 |
| 15-fleet routes | `src/data/purvanchal15FleetData.js` / `.json` | 15 |
| 11-fleet routes | `src/data/initial11Fleet.js` | 11 |
| Base highway/camp corridors | `src/data/roadRoutes.json` | 14 corridors |
| Rural place gazetteer | `src/data/ruralVillages.json` | 195 places |
| Tier labels and geometry | `src/data/tiered/*` | 2 tiers |

All route arrays start within 0.01 km of Basti after the last regeneration.

## Route generation

```bash
npm run data:routes
```

This runs:

1. `scripts/build_all_75_road_routes.mjs` — OSRM base → village routes.
2. `scripts/rebuild_fleet_routes.mjs` — updates every fleet route array from
   that route database.

Useful environment variables:

```bash
LIMIT=5 npm run data:routes          # smoke test only
RESUME=1 node scripts/build_all_75_road_routes.mjs
FORCE=1 node scripts/build_all_13_districts_routes.mjs
REQUEST_DELAY_MS=250                 # polite OSRM pacing
```

The 75-route generator writes a partial file and exits non-zero if any route
fails. It never overwrites the main file with incomplete data.

## Route anchor guard

```bash
npm run test:routes
```

Checks:

- every village route starts within 0.75 km of Basti;
- every fleet routeWaypoints array starts within 0.75 km of Basti;
- no route starts at the old Khalilabad origin;
- both generator scripts use the shared Basti base.

`npm test` runs the master contract and this guard.

## Data sources

| Data | Source |
|---|---|
| Road geometry | OSRM public demo server, **offline generation only** |
| Base → village routes | Committed static GeoJSON-like arrays |
| Map tiles | Esri ArcGIS light/dark/satellite/streets |
| Place names | Local 195-place gazetteer |
| Telemetry | Android tracker via HTTP or WebSocket |
| Fleet live state | `PurvanchalFleetHub` Durable Object SQLite |

## Is OSRM used at runtime?

**No, not by the current client.**

- `requestRuralRoute()` exists but is not called.
- `/api/route` exists as a Worker endpoint but the UI does not call it.
- The deployed wallboard reads committed route data.

OSRM is a build-time dependency. That means the public OSRM demo rate limit does
not affect normal production traffic.

It becomes a production dependency only if you add live on-demand routing.
If you do:

1. Cache routes by place ID or destination grid cell.
2. Store them in D1 or Durable Object SQLite.
3. Call OSRM once per new place, never per telemetry tick.
4. Use a self-hosted OSRM/GraphHopper instance for unlimited live routing.
5. Never synthesize a straight line when a route is unavailable.

## Cloudflare free-tier notes

- Workers Free: 100,000 requests/day.
- 25 vehicles at 5-second HTTP = 432,000 requests/day, which is over quota.
- WebSocket tracker messages do not count as new Worker requests after upgrade.
- Durable Object WebSocket messages are billed at roughly 20:1.
- 432,000 messages/day ÷ 20 ≈ 21,600 billed DO requests/day.
- The dashboard polls only every 10 seconds and only while the WebSocket is
  disconnected.

Use `wss://<host>/api/ws?role=tracker` on the Android tracker to stay within the
free Worker quota. HTTP telemetry is a fallback, not the primary path.

## Updating route data

1. Update the destination list if needed.
2. Run `npm run data:routes`.
3. Run `npm run test:routes`.
4. Run `npm test` and the remaining suites.
5. Commit the regenerated data with the generator changes.

Do not hand-edit route arrays. Do not change the base coordinate in one data
file only.
