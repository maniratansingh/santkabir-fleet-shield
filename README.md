# 🛡️ Sant Kabir Fleet Shield — Real-Time Outreach Fleet Command

> **Engineered by [Mani Ratan Singh](https://mrps.in)** • [github.com/maniratansingh](https://github.com/maniratansingh)  
> Real-Time Fleet Command Wallboard for **Sant Kabir Eye Hospital (PIECS)**, Basti, Uttar Pradesh.  
> **100% Serverless on Cloudflare Pages** (Zero VPS, Zero external databases, Zero hosting cost).

---

## 🌟 Key Architecture & Capabilities

* **100% Serverless on Cloudflare Pages**:
  * Edge-native deployment running on Cloudflare Pages + Pages Functions (`/api/location`, `/api/vehicles`).
  * Pure static asset delivery with dynamic client-side telemetry.
  * No Linux VMs, no Docker daemons, no Cloudflare KV or SQL database requirements.
* **Apple Maps & AirTag Precision Aesthetic**:
  * Panoramic default camera view on launch showing all active ambulances and road distance vectors.
  * 3D Isometric ambulance models with dynamic headlights, specular lighting, and road trails.
  * Apple Sheet with direct 1-tap **Call Driver** and **Google Maps** navigation buttons.
  * Zero-click Kiosk & TV Wallboard ready.
* **Private "Fleet Shield" Android Driver APK**:
  * Re-engineered and hardened private client (`in.mrps.fleetshield`).
  * **Zero Driver Tampering**: Settings gated behind Master Admin PIN; service toggle removed.
  * **Admin QR Code Provisioning**: One-tap camera scan from the dashboard provisions permanent Asset IDs (`SK-AMB-01`, `SK-AMB-02`) and Driver Name.
  * **Unkillable Background Daemon**: Foreground Service with `START_STICKY`, `BootCompletedReceiver`, and battery optimization bypass.
  * Private internal distribution (not hosted on public app stores).

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

## ☁️ 1-Click Deployment to Cloudflare Pages

### Method 1: Via Wrangler CLI
```bash
# 1. Build production bundle (auto-injects developer watermark)
npm run build

# 2. Deploy directly to Cloudflare Pages
npx wrangler pages deploy dist --project-name=santkabir-fleet-shield
```

### Method 2: Via GitHub & Cloudflare Dashboard
1. Push this repository to your GitHub account (`https://github.com/maniratansingh/...`).
2. In the Cloudflare Dashboard, go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Settings:
   * **Framework preset**: `Vite`
   * **Build command**: `npm run build`
   * **Build output directory**: `dist`
4. Click **Save and Deploy**. Your dashboard is live globally.

---

## 📱 Driver Phone Provisioning Protocol

1. **Download APK**: Install `santkabir-fleet-shield-v1.0.apk` on the driver's phone.
2. **Open Dashboard Provisioning**: Click the QR icon on the top Dynamic Island or open the Provisioning Modal.
3. **Select Asset ID & Driver**: Enter Ambulance Asset ID (`SK-AMB-01`) and Driver Name (`Ramesh Yadav`).
4. **Scan QR Code**: Open the Fleet Shield app on the driver's phone, scan the Admin QR code, and grant location permissions.
5. **Locked & Ready**: The app permanently locks the identifier and streams GPS pings to `/api/location`.

---

## 👨‍💻 Developer & Authorship

* **Author**: Mani Ratan Singh  
* **Website**: [https://mrps.in](https://mrps.in)  
* **GitHub**: [@maniratansingh](https://github.com/maniratansingh)  
* **Organization**: Sant Kabir Eye Hospital (Pragati India Eye Care Society - PIECS)
