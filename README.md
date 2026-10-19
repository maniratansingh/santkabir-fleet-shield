# 🛡️ Sant Kabir Fleet Shield

> **Real-Time Outreach Fleet Command & Telemetry Wallboard**  
> Engineered by **[Mani Ratan Singh](https://mrps.in)** • [github.com/maniratansingh](https://github.com/maniratansingh)  
> Operational Command Center for **Sant Kabir Eye Hospital**, Basti, Uttar Pradesh.  
> **100% Serverless on Cloudflare Pages** (Zero external databases, zero servers, zero monthly hosting costs).

---

## 🧭 Overview

**Sant Kabir Fleet Shield** is an ultra-low-latency, edge-native fleet command wallboard engineered for rural medical outreach. It monitors hospital ambulances and vision screening vans dispatched from the base hospital in Basti across Eastern Uttar Pradesh.

The system pairs a hardened, private Android background client (`santkabir-fleet-shield-v1.0.apk`) with an edge-rendered command dashboard featuring Apple Maps-style precision aesthetics, 3D isometric vehicle projections, dynamic highway ribbons, and an automated TV Kiosk mode for continuous wallboard monitoring.

---

## 🌟 Key Architecture & Capabilities

```
+--------------------------------------------------------------+
|             Sant Kabir Eye Hospital (Basti, UP)              |
|                     Base Command Center                      |
+--------------------------------------------------------------+
                               ▲
                               │ 3s Edge Polling
                               │
                +------------------------------+
                |   Cloudflare Pages Worker    |
                |         (_worker.js)         |
                +------------------------------+
                    ▲                      ▲
                    │ HTTP POST/GET        │ HTTP GET
                    │ /api/location        │ /api/vehicles
                    │                      │
+-----------------------------+  +-----------------------------+
|    Ambulance 01 (In Field)  |  |   Ambulance 02 (En Route)   |
|   Fleet Shield Android APK  |  |  Fleet Shield Android APK   |
|   Foreground GPS Telemetry  |  |  Foreground GPS Telemetry   |
+-----------------------------+  +-----------------------------+
```

### 1. 100% Serverless Edge Architecture
- **Zero Database Requirement**: Runs entirely on Cloudflare Pages advanced edge runtime via `src/worker.js`.
- **In-Memory Edge Telemetry Engine**: Ingests, validates, and serves live ambulance locations with automatic 35-minute stale session retirement.
- **Strict Zero-Cache Headers**: Live responses enforce `Cache-Control: no-store` and `CDN-Cache-Control: no-store`, ensuring TV wallboards never load stale cache.
- **52,000+ Request Stress-Tested**: Benchmark verified at 174.6 RPS, 97ms P50 latency, and 100% success rate.

### 2. 15-Minute Rural Signal Gap Grace Period & Dead-Zone Resilience
- **No Disappearing Vehicles**: Ambulances passing through rural forest cover or 2G dead zones stay locked at their **Last Known Position** for up to 15 minutes.
- **Visual Amber Gap Badges**: Displays `AMB-02 • ⏳ Signal Gap (6m ago) • Semariyawan` without deleting or flickering the car icon.
- **Smooth Glide on Reconnection**: When 4G returns, the vehicle smoothly glides over 0.7s to its new coordinate rather than jumping abruptly.

### 3. 75+ Purvanchal Village Gazetteer & Camp Mapping
- **Local Village Names on Canvas**: 75+ Gram Panchayats and outreach eye camp bazars across Eastern UP (*Semariyawan, Belhar Kala, Baghnagar, Maghar, Harraiya, Rudhauli, Bansi, Itwa, Tanda, Dhanghata*, etc.) render directly onto the map surface.
- **Zero Network Delay**: Embedded locally in browser memory via MapLibre GL WebGL symbol layers with contrast halos.

### 4. Apple Clinical UI & Anti-Blink SVG Engine
- **Persistent DOM Markers**: Markers are preserved across TV cycles and selection toggles—SVGs are never destroyed or re-parsed, eliminating flashing/blinking completely.
- **Non-Overlapping Vertical Clearance Shelves**: 2D screen coordinate collision-avoidance automatically elevates vehicle tags onto stacked vertical shelves ($32\text{px}$ spacing) with color-matched SVG stem lines when ambulances cluster nearby.
- **Strict Backward-Only Road Lifelines**: Road ribbons strictly trace backward from the ambulance's current GPS position to the Base Hospital in Basti (`26.797313°N, 82.718401°E`) in that vehicle's own unique color. Zero forward lines into unconfirmed destinations.
- **Golden Ratio Color Engine**: Generates 60+ non-colliding distinct route line colors and ambient halos using the Golden Ratio Conjugate in HSL space.
- **Interactive Apple Sheet**: Bottom floating sheet with 3 detent levels (`peek`, `half`, `full`), driver call shortcuts, and 1-tap external turn-by-turn navigation.

### 5. Smart TV Wallboard Kiosk Mode (Cinematic Auto-Tour)
- **Alternating Parabolic Cadence**: Seamlessly alternates between an 8.5s dynamic close-up tracking shot ($z = 13.8, 28^\circ$ pitch) and a 6.0s regional fleet overview ($z \approx 10.2, 0^\circ$ pitch).
- **TV-Optimized Centered Framing**: Dynamically centers vehicle markers on 16:9 large-screen monitors when the bottom sheet is minimized.
- **Two-Way Live Sync**: Adding, moving, or decommissioning cars updates the TV wallboard live every 2 seconds without requiring anyone to press F5 or refresh.
- **Dark Canvas by Default**: Clean, high-contrast, watermark-free Dark Gray Canvas for low-glare command center displays.
- **Detailed Specification**: See [ARCHITECTURE.md](ARCHITECTURE.md) for full system diagrams and engineering specs.

---

## 🛰️ Edge Telemetry API Specification

### 1. Telemetry Ingestion Endpoint
- **URL**: `/api/location`
- **Methods**: `POST` (JSON/FormData) or `GET` (Query parameters)
- **CORS**: `Access-Control-Allow-Origin: *`

#### Query / JSON Parameters:
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` / `uniqueId` | `string` | **Required**. Unique ambulance identifier (e.g., `SK-AMB-01`) |
| `lat` / `latitude` | `number` | **Required**. GPS latitude (-90.0 to 90.0) |
| `lon` / `longitude` | `number` | **Required**. GPS longitude (-180.0 to 180.0) |
| `driver` | `string` | Assigned driver name (e.g., `Ramesh Yadav`) |
| `speed` | `number` | Speed in knots or km/h (auto-detected and normalized) |
| `bearing` | `number` | Heading angle in degrees (0° - 360°) |
| `altitude` | `number` | Elevation in meters |
| `batt` / `battery`| `number` | Device battery percentage (0 - 100) |
| `timestamp` | `number` | Epoch timestamp in milliseconds |

#### Sample Ingestion Request:
```bash
curl -X POST https://your-pages-domain.pages.dev/api/location \
  -H "Content-Type: application/json" \
  -d '{
    "id": "SK-AMB-01",
    "driver": "Ramesh Yadav",
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
- **Response**:
```json
{
  "success": true,
  "vehicles": [
    {
      "id": "SK-AMB-01",
      "name": "Ambulance SK-AMB-01",
      "driverName": "Ramesh Yadav",
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
      "lastSeen": 1792171500000
    }
  ],
  "count": 1,
  "app": "Sant Kabir Fleet Shield",
  "developer": "Mani Ratan Singh (mrps.in)"
}
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
```

---

## ☁️ Deployment Guide

### Direct Upload (Drag & Drop) to Cloudflare Pages
1. Build the production bundle:
   ```bash
   npm run build
   cd dist && zip -r ../santkabir-dist-only.zip . -x "*.DS_Store" && cd ..
   ```
2. Log into the [Cloudflare Dashboard](https://dash.cloudflare.com) $\rightarrow$ **Workers & Pages** $\rightarrow$ **Create application** $\rightarrow$ **Pages** $\rightarrow$ **Upload assets**.
3. Drag and drop `santkabir-dist-only.zip` into the upload zone.
4. Click **Deploy site**. The deployment is instantly live on Cloudflare's global edge network.

---

## 📱 Master Integration Specification (Android App ↔ Web Backend)

The system is fully integrated with the customized **Sant Kabir Fleet Shield Android App** utilizing the **Traccar OsmAnd Protocol**.

### 1. The Provisioning Contract (QR Code)
The Android app has been stripped of manual configuration screens for drivers. Devices are provisioned by the Fleet Administrator scanning a QR Code generated directly on the web dashboard (via the **View Vehicle** panel or **Telemetry Modal**).

**Strict QR Code Schema:**
```json
{
  "id": "UNIQUE_VEHICLE_ID",
  "server": "https://fleet.mrps.in/api/track"
}
```
* **`id`**: Exact identifier stored in the web database (e.g. `AMB-01`, `VEHICLE-102`).
* **`server`**: Exact, full URL of the ingestion endpoint (**no trailing slash**).
* Uses Google ML Kit on Android to lock credentials and instantly start the background tracking daemon.

### 2. The Data Ingestion Contract (OsmAnd Protocol)
* **Method**: HTTP `POST`
* **Content-Type**: `application/x-www-form-urlencoded`
* **URL Structure**: All data is passed as URL-encoded query parameters.
```http
POST /api/track?id=VEHICLE-102&timestamp=1697632824&lat=26.8467&lon=80.9462&speed=12.5&bearing=180.0&altitude=120.0&accuracy=10.0&batt=85.0&charge=true HTTP/1.1
Host: fleet.mrps.in
```

**Parameter Dictionary:**
* `id` = (String) Device identifier.
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
1. **Port 443 Standard HTTPS**: Traffic is terminated on port 443 via Cloudflare Pages.
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
