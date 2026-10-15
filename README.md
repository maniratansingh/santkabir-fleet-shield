# 👁️ Sant Kabir Eye Hospital (PIECS) — Eye Camp Fleet Monitor

> Real-Time Command Center & Wallboard Dashboard for Mobile Eye Camps, Outreach Cataract Screening Units, and Patient Transport Shuttles. Built with **Option A (100% Serverless)** on **Cloudflare Pages & Functions**.

---

## 🌟 Overview & Key Features

* **Tailored for Eye Camps Only**: Built specifically for **Sant Kabir Eye Hospital (Pragati India Eye Care Society - PIECS)** in Basti, Uttar Pradesh.
* **Large Display / TV Wallboard Ready**:
  * Designed to look stunning from 15+ feet away on a 55"+ control room TV.
  * Dark liquid-glass theme (`#060d17`) matching the official hospital website.
  * Real-time metrics: Active Outreach Vehicles, Camps in Progress, Patients Screened Today, PM-JAY Cataract Surgeries Scheduled.
* **Zero VPS / 100% Serverless**:
  * Runs entirely on **Cloudflare Pages** + **Pages Functions**.
  * No Linux servers to patch, no Docker containers, zero hosting bill ($0/mo).
* **Zero Hardware Cost (Use Drivers' Existing Phones)**:
  * Uses the free, battery-friendly **Traccar Client** app (Android & iOS).
  * No specialized GPS boxes or OBD tracker hardware required.
* **Live Features**:
  * **Interactive Map**: High-contrast vector map (hardware-accelerated WebGL via MapLibre GL) centered on Basti, Siddharthnagar, and Sant Kabir Nagar districts.
  * **Camp Geofences**: Glowing radar rings around active camp villages (Harraiya, Bansi, Khalilabad, Domariyaganj).
  * **Audio Chimes**: Subtle Web Audio arrival tone when a vehicle enters an Eye Camp geofence.
  * **Real-Time Telemetry**: Live speed, heading bearing arrow, driver phone battery level, and last ping timestamp.
  * **Built-In Simulator**: Click **"Run Demo"** to see vehicles driving live across Uttar Pradesh roads towards their assigned eye camps without needing physical phones connected.

---

## 🚀 Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## ☁️ Deployment to Cloudflare Pages (1-Click)

### Method 1: Via Wrangler CLI
```bash
# 1. Build production bundle
npm run build

# 2. Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=santkabir-eye-camp-fleet
```

### Method 2: Via GitHub / Cloudflare Dashboard
1. Push this repository to GitHub.
2. In your Cloudflare Dashboard, go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your repository:
   * **Framework preset**: `Vite`
   * **Build command**: `npm run build`
   * **Build output directory**: `dist`
4. Click **Save and Deploy**. Your dashboard will be live at `https://santkabir-eye-camp-fleet.pages.dev` (or your custom domain like `https://fleet.santkabireyehospital.piecs.org`).

---

## 📱 Driver Phone Setup (Traccar Client App)

To track an eye camp vehicle:

1. **Install App**: Download **Traccar Client** (Free on Google Play Store or Apple App Store) on the driver's phone.
2. **Configure Settings**:
   * **Server URL**: `https://<your-cloudflare-pages-domain>/api/location`
   * **Device Identifier**: Vehicle code (e.g., `SK-VAN-01`, `SK-SHUTTLE-02`, or registration plate `UP51AT4211`).
   * **Frequency**: Set to `10` or `15 seconds`.
   * **Location Accuracy**: High Accuracy (GPS).
3. **Turn ON**: Flip the **Service Status** switch to **ON**.
4. The vehicle marker will automatically appear and move in real time on the hospital TV dashboard!

---

## 📺 Hospital TV / Wall Display Setup

To run this dashboard permanently on a large TV in the hospital lobby or control room:
1. Connect a mini PC, Raspberry Pi, or TV browser to the screen via HDMI.
2. Open Chrome/Chromium and run in Kiosk mode:
   ```bash
   google-chrome --kiosk --app="https://<your-pages-domain>"
   ```
3. Click the **Fullscreen** button in the top right header to lock into fullscreen mode.
