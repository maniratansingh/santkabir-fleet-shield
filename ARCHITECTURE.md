# 🏛️ Sant Kabir Fleet Shield — System Architecture & Technical Specification

> **Ultra-Low-Latency Rural Outreach Fleet Command & Telemetry Wallboard**  
> **Author & Architect**: [Mani Ratan Singh](https://mrps.in) • [github.com/maniratansingh](https://github.com/maniratansingh)  
> **Operational Base**: Sant Kabir Eye Hospital, Basti District, Eastern Uttar Pradesh, India.  
> **Production Live Endpoint**: [https://fleet.mrps.in](https://fleet.mrps.in)

---

## Current Implementation Snapshot (Authoritative)

- **Base**: Sant Kabir Eye Hospital, Basti — `26.797313, 82.718401`. One base only. Khalilabad is not a base, hub, or route origin.
- **Hosting**: Cloudflare Worker with static assets (`wrangler deploy`), not Cloudflare Pages.
- **Live state**: one SQLite-backed Durable Object, `PurvanchalFleetHub`, with WebSocket Hibernation.
- **History state**: a second SQLite-backed Durable Object, `FleetHistory`, stores one point per 30-second slot for 7 days and serves the password-protected `/history` page.
- **Dashboard stream**: `wss://<host>/api/ws` sends a snapshot, then vehicle deltas.
- **Tracker stream**: `wss://<host>/api/ws?role=tracker` accepts JSON or compact arrays; speed is in knots.
- **Fallback polling**: the dashboard polls `/api/vehicles` every 10 seconds only when the WebSocket is disconnected.
- **Routes**: 195 base-anchored village routes, plus 17/15/11 fleet route arrays. Generated offline with OSRM; no runtime OSRM dependency.
- **Route guard**: `npm run test:routes` fails if any route starts more than 0.75 km from Basti.
- **Gazetteer**: 195 local named places. Camp labels are not inferred from proximity.
- **TV mode**: close-up zoom 13.2 on desktop (12.2 on mobile, pitch 28); overview uses a fitted bounds view capped at 12.8 / 10.8 with pitch 22.
- **Markers**: icon anchored on the GPS point, three zoom tiers (56% / 78% / 100%), tag shelves disabled at overview zoom.
- **Fleet sheet**: draggable spring sheet with detents at 88, 560 and 680 px.
- **Accessibility**: rem type ramp, reduced-motion, reduced-transparency and high-contrast support, 44 px coarse-pointer targets.
- **Branches**: `experimental` is the active work branch; `testing` is the QA gate; `main` is production. Never edit `testing` or `main` directly. See `docs/BRANCHING.md`.

---

## 1. System Overview & Real-World Domain

**Sant Kabir Fleet Shield** is an edge-native, zero-server-cost fleet command and live telemetry tracking wallboard engineered for rural medical outreach in Eastern Uttar Pradesh (Purvanchal), India. 

The hospital operates a network of outreach ambulances, mobile surgical units, and vision screening vans dispatched to rural Gram Panchayats and eye camp locations across **Basti, Sant Kabir Nagar, Siddharthnagar, Gorakhpur, Ambedkar Nagar, Gonda, and Ayodhya**.

### Critical Realities of the Operating Environment:
1. **No Physical Street Addresses**: Outreach eye camps take place in remote rural hamlets and Gram Panchayats with no formal street addresses.
2. **Cellular Dead Zones (5–15 min dropouts)**: Passing through rural forest cover, railway crossings, or village outskirts frequently cuts mobile 4G/2G coverage. Vehicles must **never vanish or flicker** during temporary signal losses.
3. **24/7 TV Wallboard Deployment**: The command interface runs on 65" LED TV wallboards in hospital administration lobbies and dispatch desks with **no human intervention, no keyboard, and zero manual refreshes**.
4. **Zero Billable API Overhead**: Completely eliminates billable map APIs (e.g., Google Maps JavaScript API) and proprietary tracking subscriptions ($20–$50/vehicle/month) using an open, high-performance edge architecture.

---

## 2. High-Level System Architecture

```text
+--------------------------------------------------------------+
|     Sant Kabir Eye Hospital, Basti (26.797313, 82.718401)     |
|                 The one and only dispatch base               |
+--------------------------------------------------------------+
                              ▲
                              │
        wss://host/api/ws?role=tracker          wss://host/api/ws
                              │                         │
+-----------------------------+----+       +------------+--------------+
| Cloudflare Worker (worker.js)    |       | Dashboard wallboard       |
| /api/track, /api/ws, assets      |◄──────┤ MapLibre + React          |
+------------------┬---------------+ delta | TV kiosk mode             |
                   │                       +---------------------------+
                   │
+------------------▼--------------------------------------------+
| PurvanchalFleetHub — one SQLite-backed Durable Object         |
| live fleet state · WebSocket broadcast · 60s snapshot          |
| hibernating sockets · tracker ack/delta                        |
+---------------------------------------------------------------+
                 │ async waitUntil (HTTP ingest + tracker WS)
                 ▼
+---------------------------------------------------------------+
| FleetHistory — separate SQLite-backed Durable Object          |
| 30-second ring buffer · 7 days · 20,160 slots/vehicle          |
| history + history_audit · password-protected /history page     |
+---------------------------------------------------------------+
```

The dashboard keeps a 10-second HTTP polling fallback only while the
WebSocket is disconnected. HTTP telemetry is mirrored into the hub at most
once per vehicle per 30 seconds. The hub is the live source of truth; the
Worker itself no longer keeps an in-memory fleet map.

---

## 3. Core Architectural Subsystems

### 3.1. Rural Signal Gap Lifecycle
To keep vehicles visible through rural network blackouts, the edge worker applies a four-stage age model:

```
[ LIVE ]              [ SIGNAL GAP ]           [ PARKED ]             [ DECOMMISSIONED ]
Age < 60 s            Age 60 s – 15 min        Age 15 – 35 min        Age > 35 min
Live speed            Pinned at last fix       Pinned at last fix     Removed from state
Camp / highway        Amber gap badge          Standby / parked       Clean two-way sync
Unique vehicle HSL    "Signal gap (Xm)"        At-base handling       Hospital standby
```

- **In [`src/worker.js`](src/worker.js)**:
  - Age < 60 s: `isLive: true`, `networkState: 'live'`.
  - 60 s ≤ age ≤ 15 min: `isSignalGap: true`, `gapMinutes: Math.floor(age / 60)`, `networkState: 'gap'`.
  - 15 min < age ≤ 35 min: `isParked: true`, `networkState: 'parked'`.
  - Age > 35 min: the vehicle is purged from the hub state.
  - `/api/clear`: flushes live state immediately.

### 3.2. Live Sync (Zero Manual Refresh)
The dashboard keeps a persistent fleet store and updates it from the hub:

- Dashboard clients connect to `wss://<host>/api/ws`, receive a full snapshot on connect, then vehicle deltas.
- A 10-second HTTP fallback polls `/api/vehicles` only while the WebSocket is disconnected. Demo mode refreshes every 2 seconds.
- New vehicles appear without a reload.
- Vehicles purged after 35 minutes of inactivity, or by `/api/clear`, are removed from local state.
- If no vehicles are reporting, the camera returns to the base hospital.

### 3.3. Anti-Blink SVG & Persistent DOM Markers
Re-rendering markers on every telemetry tick causes flicker and wasted SVG work:

- **In [`src/components/MapView.jsx`](src/components/MapView.jsx)**:
  - Marker DOM elements are created once and kept in `markersRef.current`.
  - Telemetry updates mutate text and attributes in place; the node is not rebuilt with `innerHTML` except when the theme changes.
  - Selection styling is toggled with CSS classes and opacity.
  - SVG gradient IDs use deterministic names (`ambWindshield_${vId}`), so the browser does not re-rasterize the icon.
  - Position is interpolated with `requestAnimationFrame`. The duration is matched to the telemetry interval (400–2600 ms), so a vehicle reconnecting after a gap glides to its new fix.
  - A jump over 3 km is treated as a new fix and snapped, not flown across the map.

### 3.4. 195-Place Purvanchal Rural Gazetteer
- **In [`src/data/ruralVillages.json`](src/data/ruralVillages.json)**:
  - Cached database of 195 named places and eye camp bazars across Eastern UP (*Semariyawan, Belhar Kala, Baghnagar, Maghar, Harraiya, Rudhauli, Bansi, Itwa, Tanda, Dhanghata*, etc.).
- **MapLibre WebGL Integration**:
  - Registered as an in-memory GeoJSON source (`'purvanchal-villages'`).
  - Layer `'purvanchal-village-dots'`: Location circle indicator.
  - Layer `'purvanchal-village-labels'`: Native vector font symbol layer with contrast halo.
  - **100% Client-Side Cached**: Renders directly on the GPU in a single WebGL draw call with **zero network latency** and zero external tile requests.

### 3.5. Golden Ratio Color Engine (Non-Colliding Multi-Fleet Palette)
- **In [`src/utils/colors.js`](src/utils/colors.js)**:
  - For ambulances `AMB-01` through `AMB-12`, uses a hand-tuned Apple-inspired primary palette.
  - For vehicles beyond 12 (up to 100+ concurrent units), employs the **Golden Ratio Conjugate** ($\phi \approx 0.618033988749895$) in HSL color space.
  - Generates mathematically guaranteed non-colliding route line colors (`88%` saturation, `50%` lightness) and ambient glow halos (`92%` saturation, `68%` lightness).

### 3.6. TV Wallboard Kiosk Mode
- **Auto-tour loop in [`src/App.jsx`](src/App.jsx)**:
  - **Close-up (8.5 s)**: flies to a vehicle at zoom 13.2 on desktop or 12.2 on mobile, pitch 28, bearing 0. Signal-gap vehicles get 5 s.
  - **Fleet overview (6 s)**: fits all reporting vehicles and the base. `fitBounds` is capped at zoom 12.8 on desktop and 10.8 on mobile, pitch 22, bearing 0.
  - **Sheet-aware padding**: when the sheet is in its peek state, camera padding keeps vehicle markers centred on wide displays.
- **North-up camera**: `focusVehicle` keeps `bearing: 0` and `pitch: 28`, so switching between vehicles heading in opposite directions does not spin the map.

### 3.7. Zero-Cache Header Enforcement
To guarantee that 24/7 TV wallboards never load stale JavaScript bundles or cached HTML:
- **In [`src/worker.js`](src/worker.js)**:
  - Intercepts root `/` and `index.html` requests to inject:
    ```http
    Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
    Pragma: no-cache
    Expires: 0
    Surrogate-Control: no-store
    CDN-Cache-Control: no-store
    Cloudflare-CDN-Cache-Control: no-store
    ```
- **In [`index.html`](index.html)**:
  - Browser-level `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />` enforcement.

### 3.8. Marker Anchoring, Zoom Tiers & Tag Shelves
Clustered vehicles around the base, Walterganj, Captain Ganj or Saunghat would otherwise cover each other's tags:

- **GPS anchoring**: MapLibre centres the marker element on the vehicle coordinate. The ambulance icon fills that box, and the tag is absolutely positioned above it. A tag that grows, shrinks, shelves or clamps therefore cannot move the icon off the GPS point.
- **Zoom tiers**: the SVG is scaled, not resized, so the layout box and anchor stay constant:
  - below zoom 10.6: 56%
  - zoom 10.6–12.4: 78%
  - above zoom 12.4: 100%
- **Tag detail**: full ID, driver, speed, place and distance at close zoom. Below zoom 11.2 the tag collapses to the ID and dot.
- **Shelf allocation**: screen positions come from `map.project([lon, lat])`. Shelves are assigned in stable ID order, not screen X order, so nearby vehicles do not swap places as they jitter.
  - card width: 260 px detailed, 140 px overview, 110 px mobile
  - shelf step: 30 px close, 26 px mid, 22 px far
  - max shelves: 4 close, 2 mid, 0 far
- **Leader stem**: a CSS stem connects the tag to the icon. Its height follows the shelf offset, and the tag container only carries the edge-clamp transform.
- **Edge clamping**: horizontal clamping keeps tags inside the viewport. Vertical clamping is capped at 48 px at overview and 140 px at close zoom.
- **Dense clusters**: at far zoom, overlapping ID pills are hidden while every ambulance icon remains visible. The selected or hovered vehicle always shows its tag.

### 3.9. Dynamic Backward-Only Road Lifelines
- **Strict Backward-Only Topology**: In [`src/utils/roadDistance.js`](src/utils/roadDistance.js), forward route projections into unknown future destinations are eliminated. The road ribbon exclusively tracks backward from the current live vehicle GPS position to the Base Hospital in Basti (`26.797313°N, 82.718401°E`).
- **1-to-1 Vehicle-to-Track Color Binding**: Both the solid road ribbon and ambient glow layer are bound to `v.lineColor` and `v.glowColor`, ensuring instant visual association between each ambulance and its respective route across Uttar Pradesh.

### 3.10. Fleet History Service (`FleetHistory` Durable Object)

**Storage model**

- Separate SQLite-backed Durable Object, binding `HISTORY_DB`, class `FleetHistory`.
- `history` table: one row per vehicle per 30-second slot, primary key `(vehicle_id, slot)`.
- `slot = floor(device_time / 30_000) % 20_160`; the ring covers exactly 7 days. A newer packet in the same slot replaces the older one.
- `history_audit` table records logins, failed logins and history deletes.
- No purge job and no D1. Points older than the 7-day window are overwritten by the ring.

**Write path**

- HTTP `/api/track` writes to history asynchronously with `ctx.waitUntil`; a history failure never delays the live response.
- WebSocket tracker packets call `pushHistory(record)` from the hub after processing, so both ingestion paths populate the same store.
- Invalid coordinates and points older than 7 days are rejected; slow speed, zero speed and poor accuracy are stored as-is.
- Stored fields: `device_time`, `received_at`, `lat`, `lon`, `speed`, `bearing`, `accuracy`, `battery`.

**Read path**

- `GET /api/history` returns up to 25,000 points; a full 7-day trail is 20,160 points, so nothing is downsampled.
- The page draws in progressive chunks with a progress bar and never drops a point.
- Trips split at an IST day boundary or a gap over 15 minutes. Each trip gets a colour from an 8-colour palette.
- A trip is tagged `Return` when it starts within 2 km of the previous trip’s end and ends within 2 km of its start. The tag is an inference, not GPS truth; return paths are drawn 55 m offset.
- Accuracy rendering: high (≤20 m) as a small point, medium (20–50 m) with an
  amber ring, low (>50 m) with a red halo. Buffered uploads and suspect-speed
  segments keep their own styles.
- Trip presentation: one **Colour by trip** switch; the unified spine stays
  visible under coloured trips. A trip ribbon gives every trip a proportional
  block with a minimum width, short trips get numbered map beads, and a
  horizontal trip chip row selects a trip. Trip boundaries are joined only by
  faint dotted no-data connectors.
- Desktop controls are collapsible: vehicle picker and period at the top, map key and management actions collapsed by default.

**Authentication**

- Password is stored only as a PBKDF2-SHA256 hash with a random salt. Iterations are 100,000 because the Workers runtime rejects counts above that limit.
- Login sets an HMAC-signed, HttpOnly, SameSite=Strict cookie valid for 8 hours.
- Required deployment secret: `HISTORY_SESSION_SECRET`. `HISTORY_PASSWORD` is not used.

**Latency**

- Live board: about 1 second after a packet arrives, over WebSocket.
- History write: asynchronous, normally well under a second after ingestion.
- History page: reads on load/range apply; the user presses **Refresh** to pull newly stored points. There is no automatic polling on the history page.

---

## 4. API Endpoints Reference

### 4.1. Telemetry Ingestion (`/api/location` or `/api/track`)
- **Protocol**: Traccar OsmAnd / HTTP Form / JSON
- **Methods**: `POST`, `GET`
- **Parameters**:
  - `id` (string, required): Unique vehicle ID (e.g. `AMB-01`)
  - `lat` (float, required): Latitude (-90.0 to 90.0)
  - `lon` (float, required): Longitude (-180.0 to 180.0)
  - `speed` (float): Speed in knots or km/h (auto-normalized)
  - `bearing` (float): Heading in degrees (0–360°)
  - `batt` / `battery` (float): Battery percentage (0–100)
  - `driver` (string): Driver name

### 4.2. Fleet Telemetry Retrieval (`/api/vehicles`)
- **Method**: `GET`
- **Cache**: Strict `no-store`
- **Response Schema**:
```json
{
  "success": true,
  "vehicles": [
    {
      "id": "AMB-02",
      "name": "Ambulance AMB-02",
      "driverName": "Ramesh Yadav",
      "lat": 26.8856,
      "lon": 82.9847,
      "speed": 42.5,
      "bearing": 135,
      "villageName": "Semariyawan Gram",
      "villageBlock": "Semariyawan",
      "villageDistrict": "Sant Kabir Nagar",
      "villageBadge": "Camp: Semariyawan Gram",
      "lineColor": "#10B981",
      "glowColor": "#34D399",
      "isLive": true,
      "isSignalGap": false,
      "isParked": false,
      "gapMinutes": 0,
      "networkState": "live",
      "lastSeen": 1792352211581
    }
  ],
  "count": 1,
  "timestamp": 1792352211581,
  "app": "Sant Kabir Fleet Shield",
  "developer": "Mani Ratan Singh (mrps.in)"
}
```

### 4.3. Cache Flush (`/api/clear`)
- **Method**: `POST`, `DELETE` (admin only)
- **Auth**: Requires `X-Admin-Key` matching the `ADMIN_SECRET_KEY` deployment secret.
- **Action**: Clears the in-memory vehicle cache immediately.
- **Responses**: `200` on success, `401` on missing/invalid key, `405` for any other method, `503` if the secret is not provisioned.

### 4.4. History API

- `POST /api/history/login` — `{ "password": "..." }`; sets the 8-hour HMAC session cookie.
- `POST /api/history/logout` — clears the cookie.
- `GET /api/history/vehicles` — authenticated; returns `id`, `last_seen`, `points` per vehicle.
- `GET /api/history?id=...&from=...&to=...&limit=...` — authenticated; returns points in time order, up to 25,000.
- `POST /api/history/delete` — authenticated; `{ "id": "..." }`, `{ "id": "...", "from": ..., "to": ... }`, or `{ "all": true }`.

All history routes except login/logout require a valid session cookie. Unauthenticated calls return `401`.

---

## 5. Performance Benchmarks

In a 5-minute stress test on 18 October 2026 against `https://fleet.mrps.in`, with 60 vehicles and 25 wallboard clients:
- **Total Requests**: 52,744
- **Success Rate**: 100.00% (0 errors, 0 dropped frames)
- **Throughput**: 174.6 Requests / Second
- **P50 Latency**: 97 ms
- **P95 Latency**: 134 ms
- **P99 Latency**: 282 ms
- **Max Latency**: 1,453 ms
- **Average Latency**: 106 ms

---

## 6. Authorship & Hospital Details

- **Architect & Lead Engineer**: [Mani Ratan Singh](https://mrps.in)  
- **Personal Portfolio**: [https://mrps.in](https://mrps.in)  
- **GitHub Repository**: [github.com/maniratansingh/santkabir-fleet-shield](https://github.com/maniratansingh/santkabir-fleet-shield)  
- **Operational Facility**: Sant Kabir Eye Hospital, Bansi Road, near Pindari Hospital, Katra, Basti, Uttar Pradesh 272001
