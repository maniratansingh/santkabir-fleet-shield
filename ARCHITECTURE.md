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
- **Dashboard stream**: `wss://<host>/api/ws` sends a snapshot, then vehicle deltas.
- **Tracker stream**: `wss://<host>/api/ws?role=tracker` accepts JSON or compact arrays; speed is in knots.
- **Fallback polling**: the dashboard polls `/api/vehicles` every 10 seconds only when the WebSocket is disconnected.
- **Routes**: 195 base-anchored village routes, plus 17/15/11 fleet route arrays. Generated offline with OSRM; no runtime OSRM dependency.
- **Route guard**: `npm run test:routes` fails if any route starts more than 0.75 km from Basti.
- **Gazetteer**: 195 local named places. Camp labels are not inferred from proximity.
- **TV mode**: close-up zoom 13.2, continuous overview step.
- **Branches**: `main` production, `testing` QA, `experimental` sandbox. See `docs/BRANCHING.md`.

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
```

The dashboard keeps a 10-second HTTP polling fallback only while the
WebSocket is disconnected. HTTP telemetry is mirrored into the hub at most
once per vehicle per 30 seconds. The hub is the live source of truth; the
Worker itself no longer keeps an in-memory fleet map.

---

## 3. Core Architectural Subsystems

### 3.1. 15-Minute Rural Signal Gap Grace Period & 3-Stage Lifecycle
To prevent vehicles from "vanishing and reappearing preposterously" when passing through rural network blackouts, the edge worker implements a three-stage telemetry lifecycle:

```
[ Stage 1: LIVE ] ────────► [ Stage 2: SIGNAL BLIND SPOT ] ────────► [ Stage 3: DECOMMISSIONED ]
   Age: < 60 seconds              Age: 60 sec – 15 minutes               Age: > 35 minutes
   Speed: Live (e.g. 48 km/h)     Stays pinned at Last Known Location    Gently removed from memory
   Badge: Camp / Highway          Badge: "⏳ Signal Gap (Xm ago)"         Clean 2-way sync
   Color: Unique Vehicle HSL      Color: Calm Amber (#F59E0B)            Hospital Standby fallback
```

- **In [`src/worker.js`](src/worker.js)**:
  - Age $\le 60\text{s}$: `isLive: true`, `networkState: 'live'`.
  - $60\text{s} < \text{Age} \le 15\text{min}$: `isSignalGap: true`, `gapMinutes: Math.floor(age/60)`, `networkState: 'gap'`.
  - $\text{Age} > 35\text{min}$: Automatically purged from `liveVehicles` map.
  - `/api/clear`: Flushes in-memory store immediately on command.

### 3.2. Two-Way Live Sync (Zero Manual Refresh)
In [`src/App.jsx`](src/App.jsx), the frontend maintains a persistent `fleetStoreRef` that syncs bidirectionally with the server every 2 seconds:
- **Instant Addition**: New ambulances appear on screen within 2 seconds.
- **Instant Pruning**: When vehicles reach 35 minutes of inactivity or `/api/clear` is triggered, deleted IDs are removed from local memory without requiring a page reload.
- **Hospital Standby Fallback**: If 0 ambulances are reporting, the camera automatically glides back to center on the base hospital.

### 3.3. Anti-Blink SVG & Persistent DOM Marker Engine
In traditional React map applications, re-rendering markers on each state tick causes the browser to discard and re-parse SVGs, resulting in visible white flashes:
- **In [`src/components/MapView.jsx`](src/components/MapView.jsx)**:
  - Marker DOM elements are created **once** and preserved in `markersRef.current`.
  - When TV mode cycles focus or when telemetry updates arrive, the DOM node is **never wiped via `innerHTML`**.
  - Selection states (`selection-halo`, scaling) are toggled using CSS classes and opacity transitions.
  - SVG gradient and filter IDs use deterministic identifiers (`ambWindshield_${vId}`) rather than `Math.random()`, eliminating SVG re-rasterization flashes entirely.
  - Marker element position updates use CSS transitions (`transition-all duration-700 ease-out`), ensuring that when a car reconnects to 4G after an 8-minute gap, it **smoothly glides** to its new location rather than jumping abruptly.

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

### 3.6. Smart TV Wallboard Kiosk Mode & Cinematic Tour Cadence
- **Parabolic Auto-Tour Alternating Loop in [`src/App.jsx`](src/App.jsx)**:
  - **Ambulance Close-Up Tracking Shot (8.5s)**: Glides dynamically to active ambulances at high zoom ($z = 13.2$, $28^\circ$ pitch) with full road lifeline and speed display. Vehicles in temporary signal gaps are allocated 5.0 seconds.
  - **Regional Fleet Overview (6.0s)**: Smoothly transitions outward ($z \approx 10.2$, $0^\circ$ pitch) to frame all active ambulances across Purvanchal districts before progressing to the next unit.
  - **TV-Optimized Centered Framing**: When the bottom Apple Sheet is in default `peek` capsule mode, camera padding dynamically centers vehicle markers on 16:9 large-screen TV displays.
- **North-Up Upright Camera**:
  - `focusVehicle` maintains upright North-up orientation (`bearing: 0`, `pitch: 28`), preventing disorienting camera spins when switching between cars heading in opposite directions.

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

### 3.8. Non-Overlapping Vertical Clearance Shelves & SVG Leader Lines
When multiple ambulances cluster around nearby villages or highway junctions (e.g. Walterganj, Captain Ganj, Saunghat), naive map markers overlap and obscure telemetry tags:
- **2D Screen Coordinate Collision Detection**: In [`src/components/MapView.jsx`](src/components/MapView.jsx), vehicle pixel coordinates (`map.project([lon, lat])`) are evaluated in real time.
- **Vertical Shelf Allocation**: For any vehicles within $360\text{px}$ horizontal distance, the system pushes subsequent cards onto collision-free vertical shelves with $32\text{px}$ spacing ($Y$-offsets of $-42\text{px}, -76\text{px}, -110\text{px}$, etc.).
- **Dynamic Leader Stem Lines**: An SVG leader overlay renders crisp, anti-aliased stem lines with dual-stroke contrast halos matching each ambulance's assigned color, connecting the elevated tag back to the vehicle's exact GPS center.
- **100% Information Retention**: All 10 ambulance tags retain full visibility (ID, driver name, speed, rural vicinity, and distance to base) with zero clutter.

### 3.9. Dynamic Backward-Only Road Lifelines
- **Strict Backward-Only Topology**: In [`src/utils/roadDistance.js`](src/utils/roadDistance.js), forward route projections into unknown future destinations are eliminated. The road ribbon exclusively tracks backward from the current live vehicle GPS position to the Base Hospital in Basti (`26.797313°N, 82.718401°E`).
- **1-to-1 Vehicle-to-Track Color Binding**: Both the solid road ribbon and ambient glow layer are bound to `v.lineColor` and `v.glowColor`, ensuring instant visual association between each ambulance and its respective route across Uttar Pradesh.

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

---

## 5. Performance Benchmarks

In automated 5-minute heavy stress testing against the Cloudflare Workers edge:
- **Total Requests**: 52,744
- **Success Rate**: 100.00% (0 errors, 0 dropped frames)
- **Throughput**: 174.6 Requests / Second
- **P50 Latency**: 97 ms
- **P95 Latency**: 134 ms
- **P99 Latency**: 180 ms
- **Client Bundle Size**: sub-70 kB gzipped (built with Vite in 306 ms)

---

## 6. Authorship & Hospital Details

- **Architect & Lead Engineer**: [Mani Ratan Singh](https://mrps.in)  
- **Personal Portfolio**: [https://mrps.in](https://mrps.in)  
- **GitHub Repository**: [github.com/maniratansingh/santkabir-fleet-shield](https://github.com/maniratansingh/santkabir-fleet-shield)  
- **Operational Facility**: Sant Kabir Eye Hospital, Bansi Road, near Pindari Hospital, Katra, Basti, Uttar Pradesh 272001
