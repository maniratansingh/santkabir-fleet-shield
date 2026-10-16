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
- **Zero Database Requirement**: Runs entirely on Cloudflare Pages advanced edge runtime via `_worker.js`.
- **In-Memory Edge Telemetry Cache**: Ingests, validates, and serves live ambulance locations with automatic 12-hour stale session retirement.
- **Ultra-Fast Asset Serving**: MapLibre WebGL assets, Tailwind CSS, and React bundles compiled into sub-90kB chunks.

### 2. Apple Maps & AirTag Precision Aesthetic
- **3D Isometric Ambulances**: Custom vector SVGs featuring directional headlights, specular body facets, animated emergency beacons, and ground drop shadows rotated to live heading.
- **Dynamic Highway Ribbons**: Traveled breadcrumb vectors connecting vehicles to the hospital base with glowing halos tailored to each vehicle's unique line color.
- **Interactive Apple Sheet**: Bottom floating sheet with 3 detent levels (`peek`, `half`, `full`), quick driver call triggers, and 1-tap external turn-by-turn navigation in Google Maps & Apple Maps.

### 3. TV Wallboard Auto-Tour Mode
- **Continuous Kiosk Monitoring**: Automatically cycles camera focus across reporting ambulances in 12-second intervals.
- **Standby Fallback**: When zero ambulances are actively reporting, smoothly docks on the Sant Kabir Eye Hospital base in Basti.

### 4. Custom Driver Android APK (`santkabir-fleet-shield-v1.0.apk`)
- **Master Admin PIN Protection**: Settings are locked on start to prevent drivers from stopping tracking or altering endpoints.
- **Admin Tuning**: Enter Master Admin Code `8722` (or your secret PIN) under *"Master Admin Authorization"* to unlock and tune update frequency (e.g. 5s–30s for low-end devices), accuracy, or server URL.
- **Default Telemetry Endpoint**: Preconfigured with your server endpoint (`https://fleet.mrps.in/api/location`).
- **Background Daemon**: Runs as an Android Foreground Service with `START_STICKY` and `BootCompletedReceiver`.
- **Direct Download**: Hosted directly at `/downloads/santkabir-fleet-shield-v1.0.apk` with strict MIME enforcement (`application/vnd.android.package-archive`).

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

## 📱 Driver Provisioning Protocol

1. **Install Client**: Open the dashboard's **Driver Provisioning** modal (`Tab 2`) and download `santkabir-fleet-shield-v1.0.apk`.
2. **Transfer to Device**: Send the APK to the driver's Android device via WhatsApp or USB and install.
3. **Scan Provisioning QR**: Open the app, point the camera at the **Admin Provisioning QR Code** displayed on the command dashboard (`Tab 1`).
4. **Grant Permissions**: Allow background location permissions (*"Allow all the time"*).
5. **Locked & Streaming**: The app starts background tracking. Settings remain locked to prevent tampering. Enter your admin code (`8722`) anytime you need to tune intervals or device parameters.

---

## 👨‍💻 Engineering & Authorship

- **Architect & Developer**: [Mani Ratan Singh](https://mrps.in)  
- **Website**: [https://mrps.in](https://mrps.in)  
- **GitHub**: [@maniratansingh](https://github.com/maniratansingh)  
- **Base Hospital**: Sant Kabir Eye Hospital, Bansi Road, near Pindari Hospital, Katra, Basti, Uttar Pradesh 272001
