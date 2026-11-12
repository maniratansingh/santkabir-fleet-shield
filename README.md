# 🛡️ Sant Kabir Fleet Shield

> **Real-Time Outreach Fleet Command & Telemetry Wallboard**  
> Engineered by **[Mani Ratan Singh](https://mrps.in)** • [github.com/maniratansingh](https://github.com/maniratansingh)  
> Operational Command Center for **Sant Kabir Eye Hospital**, Basti, Uttar Pradesh.  
> **100% Serverless on Cloudflare Workers + Durable Objects** (Zero external databases, zero servers, zero monthly hosting costs).

---

## 🧭 Overview

**Sant Kabir Fleet Shield** is an ultra-low-latency, edge-native fleet command wallboard engineered for rural medical outreach. It monitors hospital ambulances and vision screening vans dispatched from the base hospital in Basti across Eastern Uttar Pradesh.

Field phones run the standard **Traccar Client**, provisioned by a one-scan QR generated in the dashboard. The driver name is the device ID: there is no separate vehicle ID. The legacy Sant Kabir Android APK contract is still accepted by the telemetry API.

The dashboard features Apple Maps-style precision aesthetics, 3D isometric vehicle projections, road-only trails, persistent last-seen records, and an automated TV Kiosk mode for continuous wallboard monitoring.

---

<p align="center">
  <img src="docs/assets/screenshots/fleet-overview-dark.jpg" alt="Sant Kabir Fleet Shield dark wallboard" width="100%" />
</p>

<p align="center"><em>Fleet overview — base-anchored routes, compact tags at overview zoom, and the fleet sheet in its peek state.</em></p>

## 🆕 Latest Changes (12 November 2026)

The board no longer forgets a driver when the phone goes quiet.

- **Persistent records.** A vehicle is never deleted at 35 minutes. Its age now
  maps to **Live** (<60 s), **No signal** (60 s – 15 min), **Parked**
  (15 – 35 min) or **Offline** (>35 min).
- **Offline is visible, not live.** An offline vehicle keeps its name and last
  position, shows a grey marker and “Last seen X ago”, loses its route trail,
  and is excluded from live counts and the TV auto-tour. It returns to Live the
  moment the same phone reports again.
- **Offline filter.** The fleet sheet now has five tabs: All, En route, On
  scene, No signal and Offline.
- **One identity.** `canonicalVehicleId` trims, collapses internal spaces and
  uppercases the driver name. The Worker, Durable Object, dashboard and QR all
  use it, so `ramesh  yadav` and `RAMESH YADAV` are one record, not a ghost.
- **Manual remove.** Test devices, uninstalled phones, renamed drivers and
  ghosts can be removed from the fleet sheet. The action asks for the admin key
  once per browser session and calls `POST /api/remove`.
- **Ghost reconciliation.** The dashboard requests a fresh snapshot every 60
  seconds, so an ID removed on the server disappears from an already-open board.
- **No fake connectors.** Trails follow precomputed roads and stop at the last
  road point. If no precomputed route matches, the board shows a clean gap
  instead of a straight or jagged line.
- **Mobile navigation.** On mobile only, a bottom bar provides Map, Fleet,
  Alerts and More. The desktop dock and layout are unchanged.
- **Driver provisioning.** One driver-name field, a Traccar Client URI QR, and
  the password is set manually after scanning.

`experimental` is currently the branch deployed at `https://fleet.mrps.in`.
`testing` and `main` remain untouched until an explicit promotion.

Verified on 12 November 2026: build pass, master contract 28/28, route anchors
240/240, Kalman 8/8, map matching 6/6, Durable Object / WebSocket 13/13.

### Fleet History (experimental, not deployed)

A separate history service is now on `experimental` only. It does **not** change
the live board and is **not deployed** to `fleet.mrps.in` yet.

- A second SQLite-backed Durable Object, `FleetHistory`, stores **30-minute
  snapshots** for **7 days** in a fixed ring buffer. Old slots are overwritten;
  there is no purge job.
- The live telemetry path writes to it asynchronously with `ctx.waitUntil`.
  A history failure cannot delay or block the live dashboard.
- All vehicles are currently allowed. An allowlist can be added later.
- The separate page is at `/history` and is password-protected. Login sets an
  HMAC-signed, HttpOnly, SameSite=Strict session cookie (8 hours).
- Ingest events, logins and history deletes are recorded in `history_audit`.
- History deletion is separate from the live record. You can delete one
  vehicle's history, a range, or all history without touching the live fleet.
- Required secrets for deployment:

```bash
npx wrangler secret put HISTORY_PASSWORD
npx wrangler secret put HISTORY_SESSION_SECRET
```

The local `.dev.vars` uses a test password. The real password is never stored in
the repository. `HISTORY_DB` is bound in `wrangler.toml` with migration `v2`.

---

## 🌟 Current Architecture & Capabilities

```text
+--------------------------------------------------------------+
|        Sant Kabir Eye Hospital, Basti (26.797313, 82.718401) |
|                 The one and only dispatch base               |
+--------------------------------------------------------------+
                               ▲
                               │
          +--------------------+--------------------+
          │                                         │
   wss://host/api/ws?role=tracker              wss://host/api/ws
          │                                         │
+---------▼----------------+             +----------▼----------+
| Cloudflare Worker        |             | Dashboard wallboard |
| /api/track, /api/ws      |◄── snapshot ─┤ MapLibre + React   |
| /api/vehicles            |    + delta  | TV kiosk mode       |
| /api/remove (admin)      |             | offline + last seen |
| static assets            |             +---------------------+
+---------┬----------------+
          │
+---------▼-------------------------------------------+
| PurvanchalFleetHub (one SQLite-backed Durable Object)|
| persistent fleet state · WebSocket broadcast         |
| 5 s storage · live/no-signal/parked/offline          |
+------------------------------------------------------+
```

### 1. One base, one source of truth
- **Sant Kabir Eye Hospital, Basti** is the only base: `26.797313, 82.718401`.
- Khalilabad is a town and a road destination, **not** a base, hub, or route origin.
- `src/utils/baseLocation.js` is the single shared base coordinate.
- `npm run test:routes` verifies that every village and fleet route starts within 0.75 km of Basti.

### 2. Cloudflare Worker + Durable Object
- The app deploys as a **Worker with static assets** (`wrangler deploy`), not the legacy Pages dashboard.
- `PurvanchalFleetHub` is a single SQLite-backed Durable Object and the live source of truth.
- Dashboard clients connect to `wss://<host>/api/ws`; trackers use `wss://<host>/api/ws?role=tracker`.
- WebSocket Hibernation keeps idle sockets cheap.
- The hub persists changes to its own SQLite within **5 seconds** and keeps fleet records long-term. Going quiet marks a record **Offline**; it does not delete it.
- On load, the hub canonicalises stored IDs, so legacy spellings collapse into one record instead of becoming ghosts.
- `POST /api/remove` (admin key) removes one or more records and broadcasts a `remove` event to every dashboard.

### 2a. Vehicle lifecycle and identity
| Age since last packet | State | Map behaviour |
|---|---|---|
| under 60 s | **Live** | normal marker and road trail |
| 60 s – 15 min | **No signal** | amber marker, gap badge |
| 15 – 35 min | **Parked** | slate marker, last position |
| over 35 min | **Offline** | grey marker, “Last seen X ago”, no trail |

- The driver name **is** the device ID. There is no second vehicle ID.
- `canonicalVehicleId` trims, collapses repeated whitespace and uppercases, so one phone always updates one record.
- A new packet from the same ID moves the record back to Live at the new position.
- Offline records are excluded from live counts, trails and the TV auto-tour, but stay visible under the **Offline** filter.

### 3. Telemetry and free-tier limits
- WebSocket is the primary tracker path. After the upgrade, messages do not count as new Worker requests.
- HTTP telemetry still works, but every request counts against the Workers Free request quota.
- 25 vehicles at 5-second HTTP = **432,000 requests/day**, which exceeds the free 100k/day allowance.
- WebSocket messages are billed to the Durable Object at roughly 20:1; 432,000 messages/day ≈ **21,600 billed DO requests/day**.
- HTTP telemetry is mirrored into the hub at most once every 30 seconds per vehicle. That throttle does not reduce the incoming Worker request count.
- The dashboard uses a **10-second HTTP polling fallback** only when the WebSocket is not connected. In demo mode it refreshes every 2 seconds.
- While the socket is connected, the dashboard requests a fresh snapshot every **60 seconds** to reconcile browser state and drop removed IDs.

### 4. Precomputed, base-anchored routes
- `src/data/allVillagesRoadRoutes.json` contains **195 routes**, all starting at Basti.
- `initial17Fleet.js`, `purvanchal15FleetData.*`, and `initial11Fleet.js` contain matching base-anchored route arrays.
- Routes are generated **offline** with OSRM and committed. The deployed app does not call OSRM at runtime.
- Regenerate with:
  ```bash
  npm run data:routes
  ```
- The generator is resumable and failure-safe; it will not overwrite the main file with partial data.
- The map renders route geometry only; no artificial hub or straight-line base connector is synthesized.

### 5. Rural gazetteer
- The local gazetteer has **195 named places** across the operating districts.
- The UI resolves the **current place name** from GPS; it does not schedule or predict camps.
- The demo data does not assign a camp based on proximity.

### 6. Wallboard
- **Map:** MapLibre GL. Basemaps: Light Gray, Dark Gray, Satellite, Highways & Streets.
- **Markers:** persistent DOM markers with SVG ambulances. The node is updated in place, so telemetry ticks do not rebuild the SVG or cause a blink.
- **Zoom tiers:** the icon is scaled to 56% below zoom 10.6, 78% from 10.6 to 12.4, and 100% above 12.4. The icon stays centred on the GPS point; the tag floats above it and never changes the marker's anchor.
- **Tags:** full detail at close zoom, ID only below zoom 11.2. Shelves are 0 at far zoom, 2 at mid zoom and 4 at close zoom. Vertical clamping is capped at 48 px at overview, and overlapping ID pills are suppressed at far zoom. The selected or hovered vehicle always keeps its tag.
- **Motion:** marker positions glide with `requestAnimationFrame`; the duration is matched to the telemetry interval (400–2600 ms). Jumps over 3 km snap instead of flying across the map. Tag clamp transitions run at 220 ms and shelf transitions at 420 ms.
- **Fleet sheet:** draggable spring sheet with detents at 88, 560 and 680 px, momentum projection, rubber-banding and interruptible drag.
- **Fleet states:** Moving, On scene, Returning, At base, No signal and Offline. Filters: All, En route, On scene, No signal, Offline.
- **Offline rows:** grey marker, “Last seen X ago”, no road trail, excluded from live counts and the TV auto-tour. A Remove action is available with the admin key.
- **TV auto-tour:** close-up at zoom 13.2 on desktop and 12.2 on mobile (pitch 28); overview fit capped at 12.8 / 10.8 (pitch 22). 8.5 seconds per moving vehicle, 5 seconds for a signal-gap vehicle, 6 seconds for the overview. Offline vehicles are skipped.
- **Mobile:** bottom navigation with Map, Fleet, Alerts and More. The desktop dock and layout are unchanged; the fleet sheet sits above the bottom bar.
- **Accessibility:** rem type ramp, optical sizing, `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`, 44 px coarse-pointer hit areas and press states.
- **Themes:** dark and light, with compact map attribution.

### 7. Branch model
- **`main`** — production promotion target. Only receives verified merges from `testing`.
- **`testing`** — QA gate. Only receives verified merges from `experimental`.
- **`experimental`** — active work and the branch currently deployed at `https://fleet.mrps.in`. Features, fixes, documentation and screenshots start here.
- Do not edit `testing` or `main` directly, and do not merge `experimental` into `main`.
- Old merged branches are archived as tags.
- Full rules and promotion commands: [docs/BRANCHING.md](docs/BRANCHING.md).

### 8. Documentation
- [docs/HANDOVER.md](docs/HANDOVER.md) — current state and next-session start guide.
- [docs/FEATURES.md](docs/FEATURES.md) — feature reference and control map.
- [docs/BRANCHING.md](docs/BRANCHING.md) — branch rules and promotion flow.
- [docs/DATA_AND_ROUTING.md](docs/DATA_AND_ROUTING.md) — route pipeline, counts, OSRM policy and cache strategy.
- [docs/TESTING.md](docs/TESTING.md) — test suites and release checks.
- [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md) — current visual gallery.
- [ARCHITECTURE.md](ARCHITECTURE.md) — system architecture and technical detail.

---

## 📸 Screenshots

<table>
  <tr>
    <td width="50%">
      <img src="docs/assets/screenshots/fleet-list-dark.jpg" alt="Operational fleet list" />
      <br /><strong>Operational fleet list</strong><br />
      Priority sorting and live vehicle states. The current build adds the Offline filter.
    </td>
    <td width="50%">
      <img src="docs/assets/screenshots/vehicle-detail-light.jpg" alt="Vehicle detail sheet" />
      <br /><strong>Vehicle detail</strong><br />
      Driver contact, coordinates, Maps links, distance and speed.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/assets/screenshots/provisioning-light.jpg" alt="Provisioning dialog" />
      <br /><strong>Provisioning</strong><br />
      Driver name, server selection and a one-scan Traccar QR.
    </td>
    <td width="50%">
      <img src="docs/assets/screenshots/telemetry-light.jpg" alt="Telemetry and tracker setup" />
      <br /><strong>Telemetry setup</strong><br />
      Android QR, OsmAnd and REST API tabs with the exact schema.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/assets/screenshots/marker-closeup-dark.jpg" alt="Ambulance marker close-up" />
      <br /><strong>Marker close-up</strong><br />
      The tag sits above the icon; the icon stays on the GPS point.
    </td>
    <td width="50%">
      <img src="docs/assets/screenshots/route-anchoring.jpg" alt="Base-anchored routes" />
      <br /><strong>Route anchoring</strong><br />
      Every visible corridor converges on Sant Kabir Eye Hospital, Basti.
    </td>
  </tr>
</table>

[Open the full gallery](docs/SCREENSHOTS.md) — includes the light overview, fleet summary and mobile views.

## 🛰️ Edge Telemetry API Specification

### 1. Telemetry Ingestion Endpoint
- **URL**: `/api/track` (Traccar OsmAnd) or `/api/location`
- **Methods**: `POST` (JSON/FormData) or `GET` (Query parameters)
- **CORS**: `Access-Control-Allow-Origin: *`
- **Speed**: OsmAnd packets send knots; JSON packets may send km/h. The processor normalizes both.
- **Identity**: the `id` is the driver name used as the device ID. It is trimmed,
  whitespace-collapsed and uppercased (`ramesh  yadav` → `RAMESH YADAV`). There
  is no separate vehicle ID.

#### Query / JSON Parameters:
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` / `uniqueId` | `string` | **Required**. Driver name used as the device ID (e.g., `RAMESH YADAV`) |
| `lat` / `latitude` | `number` | **Required**. GPS latitude (-90.0 to 90.0) |
| `lon` / `longitude` | `number` | **Required**. GPS longitude (-180.0 to 180.0) |
| `driver` | `string` | Optional legacy display name. The `id` remains the identity. |
| `speed` | `number` | Speed in knots or km/h (auto-detected and normalized) |
| `bearing` | `number` | Heading angle in degrees (0° - 360°) |
| `altitude` | `number` | Elevation in meters |
| `batt` / `battery`| `number` | Device battery percentage (0 - 100) |
| `timestamp` | `number` | Epoch timestamp in milliseconds |

#### Sample Ingestion Request:
```bash
curl -X POST https://fleet.mrps.in/api/track \
  -H "Content-Type: application/json" \
  -d '{
    "id": "RAMESH YADAV",
    "lat": 26.8500,
    "lon": 82.8500,
    "speed": 45,
    "bearing": 120,
    "batt": 92
  }'
```

### 2. Vehicle Retrieval Endpoint
- **URL**: `/api/vehicles`
- **Method**: `GET`
- **State fields**: `isLive`, `isSignalGap`, `isParked`, `isOffline`,
  `networkState`, `ageSec`, `gapMinutes`. These are derived from the last
  packet age, not stored flags.
- **Response**:
```json
{
  "success": true,
  "vehicles": [
    {
      "id": "RAMESH YADAV",
      "name": "RAMESH YADAV",
      "driverName": "",
      "status": "moving",
      "lat": 26.850000,
      "lon": 82.850000,
      "speed": 45,
      "bearing": 120,
      "distFromBaseKm": 14.3,
      "roadDistFromBaseKm": 16.4,
      "batt": 92,
      "battery": 92,
      "lineColor": "#007AFF",
      "glowColor": "#38BDF8",
      "lastSeen": 1792171500000,
      "updatedAt": 1792171500000,
      "ageSec": 4,
      "gapMinutes": 0,
      "isLive": true,
      "isSignalGap": false,
      "isParked": false,
      "isOffline": false,
      "networkState": "live"
    }
  ],
  "count": 1,
  "app": "Sant Kabir Fleet Shield",
  "developer": "Mani Ratan Singh (mrps.in)"
}
```

### 3. Vehicle Removal Endpoint (Admin)
- **URL**: `/api/remove?id=<DRIVER NAME>`
- **Methods**: `POST` or `DELETE`
- **Auth**: `X-Admin-Key: <ADMIN_SECRET_KEY>`
- **Body alternative**: `{ "id": "..." }` or `{ "ids": ["...", "..."] }`
- Removes the record from the edge cache and the Durable Object, then
  broadcasts a `remove` event so open dashboards drop it.
- The dashboard exposes this as the **Remove** action in the fleet sheet. It
  asks for the admin key once per browser session.

```bash
curl -X POST "https://fleet.mrps.in/api/remove?id=TEST%20DEVICE" \
  -H "X-Admin-Key: $ADMIN_SECRET_KEY"
```

---

## 💻 Local Development

```bash
# 1. Clone repository
git clone https://github.com/maniratansingh/santkabir-fleet-shield.git
cd santkabir-fleet-shield

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev

# 4. Build production bundle
npm run build

# 5. Preview production build locally
npm run preview

# 6. Run verification
npm test                  # master contract + route anchor guard
npm run test:kalman
npm run test:map-matching
npm run test:do-ws        # requires wrangler dev on :8787
npm run test:history      # requires wrangler dev on :8787
npm run test:routes       # route origin guard only
```

---

## ☁️ Deployment Guide

### Deploy with Wrangler (Workers + static assets)

```bash
npm run build
npx wrangler deploy
```

### Current live deployment

| Item | Value |
|---|---|
| Domain | `https://fleet.mrps.in` |
| Worker | `purvanchal-fleet-hub` |
| Durable Object | `PurvanchalFleetHub` / binding `FLEET_HUB` / name `purvanchal-fleet` |
| Deployed branch | `experimental` |
| Storage | Durable Object SQLite only (no D1) |

Set the admin key used by `POST/DELETE /api/clear` and `POST/DELETE /api/remove`:

```bash
npx wrangler secret put ADMIN_SECRET_KEY
```

Do **not** deploy this version through the legacy Pages dashboard. `wrangler.toml` defines the Worker entry, the static asset binding (`ASSETS`), and the `FLEET_HUB` Durable Object binding.

For local development:

```bash
ADMIN_SECRET_KEY=dev-admin-key npm run dev
```

### Durable Object WebSocket Hub

The project now deploys as a Worker with static assets (`wrangler deploy`), not
through the legacy Pages dashboard. `wrangler.toml` binds one SQLite-backed
`PurvanchalFleetHub` Durable Object:

- Dashboard clients connect to `wss://<host>/api/ws`.
- Field trackers connect to `wss://<host>/api/ws?role=tracker` and send either a
  JSON telemetry object or a compact array
  `[id, lat, lon, speed, bearing, timestamp]`. Speed is in knots, matching the
  Traccar/OsmAnd contract. The hub processes the packet with the shared
  telemetry processor, acknowledges the tracker, and broadcasts a `delta` to
  every dashboard.
- The hub sends a snapshot on connect and a `delta` message when a vehicle moves.
- Shared processing lives in `src/utils/telemetryProcessor.js`, with shared
  geospatial helpers in `src/utils/geo.js`, `src/utils/village.js`, and
  `src/utils/baseLocation.js`. Canonical identity lives in
  `src/utils/vehicleId.js`; the age/offline model lives in
  `src/utils/vehicleState.js`.
- Idle sockets use the WebSocket Hibernation API, so they do not accrue
  duration charges while nothing is being sent.
- HTTP telemetry is mirrored into the hub at most once every 30 seconds per
  vehicle to stay inside the Workers Free / Durable Objects 100,000 request/day
  allowance. WebSocket tracker ingestion bypasses that throttle.
- The hub persists changes to its own SQLite storage within **5 seconds** of an
  update and keeps records long-term. There is no 35-minute deletion and no D1
  database.
- Every outgoing snapshot and delta recomputes `isLive`, `isSignalGap`,
  `isParked`, `isOffline` and `networkState` from the packet age, so a stored
  `isLive` flag can never make a quiet vehicle look live.
- `POST /api/remove` with the admin key removes one or more IDs and broadcasts a
  `remove` event. The dashboard also reconciles a fresh snapshot every 60
  seconds, which clears browser-side ghosts.
- The dashboard keeps a 10-second HTTP polling fallback for browsers that cannot
  establish a WebSocket. It does not poll while the socket is connected.
- Verify the hub locally with `npx wrangler dev --port 8787 --local` and
  `node scripts/verify_do_ws.mjs` (13 checks, including a tracker socket and a
  compact-array packet).

---

## 📱 Master Integration Specification (Android Tracker ↔ Web Backend)

The current field setup uses the standard **Traccar Client** app with the
**Traccar OsmAnd protocol**. The legacy Sant Kabir Fleet Shield Android APK is
still accepted by the same telemetry API.

### 1. The Provisioning Contract (QR Code)

> The **Provision** dialog generates a **Traccar Client URI QR**: one driver
> name plus the standard tracking settings. The driver name is the device ID.

Devices are provisioned by the Fleet Administrator scanning a QR generated on
the dashboard (from the **View Vehicle** panel or the **Telemetry** modal). The
driver sets the app password manually after scanning.

**Traccar Client URI (current):**
```text
https://fleet.mrps.in/api/track?id=RAMESH%20YADAV&accuracy=highest&distance=0&interval=30&angle=0&heartbeat=60&buffer=false&wakelock=true&stop_detection=true&prefer_platform_providers=false
```

| Setting | Value |
|---|---|
| `accuracy` | `highest` |
| `distance` | `0` |
| `interval` | `30` seconds |
| `angle` | `0` |
| `heartbeat` | `60` seconds |
| `buffer` | `false` |
| `wakelock` | `true` |
| `stop_detection` | `true` |
| `prefer_platform_providers` | `false` |

**Legacy JSON QR schema (old Sant Kabir APK only):**
```json
{
  "id": "DRIVER NAME",
  "server": "https://fleet.mrps.in/api/track"
}
```
* **`id`**: Driver name, used as the device ID. It is canonicalized (trimmed,
  whitespace-collapsed, uppercased) before storage.
* **`server`**: Full ingestion URL, no trailing slash.
* The legacy app uses Google ML Kit to lock credentials and start its
  background tracking daemon.

### 2. The Data Ingestion Contract (OsmAnd Protocol)
* **Method**: HTTP `POST`
* **Content-Type**: `application/x-www-form-urlencoded`
* **URL Structure**: All data is passed as URL-encoded query parameters.
```http
POST /api/track?id=RAMESH%20YADAV&timestamp=1697632824&lat=26.8467&lon=80.9462&speed=12.5&bearing=180.0&altitude=120.0&accuracy=10.0&batt=85.0&charge=true HTTP/1.1
Host: fleet.mrps.in
```

**Parameter Dictionary:**
* `id` = (String) Driver name used as the device ID. Trimmed, whitespace-collapsed and uppercased by the server.
* `timestamp` = (Long) Epoch time in seconds (UTC).
* `lat` = (Double) Latitude (-90 to 90).
* `lon` = (Double) Longitude (-180 to 180).
* `speed` = (Double) Speed in knots (multiplied by 1.852 to get km/h).
* `bearing` = (Double) Heading in degrees (0–360°).
* `altitude` = (Double) Altitude in meters.
* `accuracy` = (Double) GPS accuracy margin in meters.
* `batt` = (Double) Device battery level (0.0 to 100.0).
* `charge` = (Boolean) `true` if charging, `false` if discharging.

**Server Response:**
* Returns an immediate `HTTP 200 OK` response (`{"success": true, ...}`).

### 3. Cloudflare & Infrastructure Setup
1. **Port 443 Standard HTTPS**: Traffic is terminated on port 443 via the Cloudflare Worker.
2. **Cloudflare WAF Custom Rule**:
   * Navigate to **Cloudflare Dashboard** $\rightarrow$ **Security** $\rightarrow$ **WAF** $\rightarrow$ **Custom Rules**.
   * Action: **Bypass / Skip** Bot Fight Mode and Browser Integrity Check.
   * Expression: `(http.request.uri.path contains "/api/track")`

---

## 👨‍💻 Engineering & Authorship

- **Architect & Developer**: [Mani Ratan Singh](https://mrps.in)  
- **Website**: [https://mrps.in](https://mrps.in)  
- **GitHub**: [@maniratansingh](https://github.com/maniratansingh)  
- **Base Hospital**: Sant Kabir Eye Hospital, Bansi Road, near Pindari Hospital, Katra, Basti, Uttar Pradesh 272001
