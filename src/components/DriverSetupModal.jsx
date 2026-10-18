import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  Radio, 
  Terminal, 
  Check, 
  Copy, 
  Send,
  Sparkles,
  Info,
  Server,
  Zap,
  QrCode,
  Download,
  Smartphone,
  ShieldCheck
} from 'lucide-react';

export default function DriverSetupModal({ isOpen, onClose }) {
  const [selectedTab, setSelectedTab] = useState('provision'); // 'provision', 'traccar', or 'api'
  const [deviceId, setDeviceId] = useState('AMB-ALPHA');
  const [driverName, setDriverName] = useState('Ramesh Yadav');
  const [testSpeed, setTestSpeed] = useState(13.5); // knots (~25 km/h)
  const [copied, setCopied] = useState(false);
  const [pingStatus, setPingStatus] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'https://fleet.mrps.in';
  const effectiveId = deviceId.trim() || 'AMB-ALPHA';
  const effectiveDriver = driverName.trim() || 'Assigned Driver';

  // Strict provisioning schema per Master Integration Specification Section 1:
  // "server": "https://fleet.mrps.in/api/track" (NO trailing slash)
  const serverEndpoint = 'https://fleet.mrps.in/api/track';
  const provisioningPayload = {
    id: effectiveId,
    server: serverEndpoint
  };
  const rawCompactJson = JSON.stringify(provisioningPayload);
  const stringifiedJson = JSON.stringify(provisioningPayload, null, 2);

  // Generate QR Code data URL
  useEffect(() => {
    if (!isOpen) return;

    QRCode.toDataURL(rawCompactJson, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Failed to generate QR Code in modal:', err));
  }, [rawCompactJson, isOpen]);

  if (!isOpen) return null;

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `FleetShield_Provision_${effectiveId}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  // Test OsmAnd HTTP POST ping with URL query parameters
  const sendTestPing = async () => {
    setPingStatus('sending');
    try {
      const nowEpoch = Math.floor(Date.now() / 1000);
      const testLat = (26.785 + (Math.random() - 0.5) * 0.03).toFixed(6);
      const testLon = (82.680 + (Math.random() - 0.5) * 0.03).toFixed(6);

      // OsmAnd protocol: POST /api/track?id=...&timestamp=...&lat=...&lon=...&speed=...&bearing=...
      const queryParams = new URLSearchParams({
        id: effectiveId,
        driver: effectiveDriver,
        timestamp: String(nowEpoch),
        lat: testLat,
        lon: testLon,
        speed: String(testSpeed),
        bearing: '90',
        altitude: '120.0',
        accuracy: '8.0',
        batt: '90.0',
        charge: 'true'
      });

      const res = await fetch(`/api/track?${queryParams.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (res.ok) {
        setPingStatus('success');
        setTimeout(() => setPingStatus(null), 3000);
      } else {
        setPingStatus('error');
      }
    } catch (err) {
      console.error('Test ping failed:', err);
      setPingStatus('error');
    }
  };

  const curlOsmAnd = `curl -X POST "${currentDomain}/api/track?id=${encodeURIComponent(effectiveId)}&timestamp=${Math.floor(Date.now() / 1000)}&lat=26.7912&lon=82.6841&speed=13.5&bearing=90&altitude=120.0&accuracy=10.0&batt=85.0&charge=true" \\
  -H "Content-Type: application/x-www-form-urlencoded"`;

  const curlApiJson = `curl -X POST "${currentDomain}/api/track" \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "${effectiveId}",
    "driver": "${effectiveDriver}",
    "lat": 26.79125,
    "lon": 82.68410,
    "speed": ${testSpeed},
    "bearing": 90
  }'`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl glass-panel-glow rounded-3xl border border-slate-200/90 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-['Outfit']">
                  Vehicle Provisioning & Telemetry
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Ingestion
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <span>Sant Kabir Fleet Shield • by</span>
                <a 
                  href="https://mrps.in" 
                  target="_blank" 
                  rel="noreferrer"
                  className="font-semibold text-sky-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-0.5"
                >
                  Mani Ratan Singh (mrps.in)
                </a>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 shrink-0">
          <button
            onClick={() => setSelectedTab('provision')}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              selectedTab === 'provision'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>📱 Android QR Provisioning</span>
          </button>

          <button
            onClick={() => setSelectedTab('traccar')}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              selectedTab === 'traccar'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>OsmAnd Protocol</span>
          </button>

          <button
            onClick={() => setSelectedTab('api')}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              selectedTab === 'api'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>REST API</span>
          </button>
        </div>

        {/* TAB 1: Android QR Code Provisioning (Section 1 Contract) */}
        {selectedTab === 'provision' && (
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm">
            <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 flex items-start gap-2.5">
              <Sparkles className="w-5 h-5 text-sky-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong>1-Scan Google ML Kit Provisioning:</strong> The customized Android app has no manual configuration screens for drivers. Point the phone's camera at this QR code from the Admin Settings to lock device credentials and start tracking.
              </div>
            </div>

            {/* Device ID Input Form */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-white block">
                Target Vehicle Identifier
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Vehicle ID</label>
                  <input
                    type="text"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="e.g. VEHICLE-102"
                    className="w-full mt-0.5 px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Driver Name</label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="e.g. Ramesh Yadav"
                    className="w-full mt-0.5 px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* QR Code Presentation Box */}
            <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
              <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200">
                {qrDataUrl ? (
                  <img 
                    src={qrDataUrl} 
                    alt={`Provisioning QR Code for ${effectiveId}`}
                    className="w-48 h-48 block object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-slate-400">
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-800 dark:text-white">
                  {effectiveId}
                </span>
                <span className="text-slate-400 text-xs">•</span>
                <span className="text-xs text-slate-500 font-mono">
                  {serverEndpoint}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={handleDownloadQr}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download QR</span>
                </button>
                <button
                  onClick={() => copyText(rawCompactJson)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
            </div>

            {/* Strict Schema JSON Preview */}
            <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[11px] space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-sans font-bold flex items-center justify-between">
                <span>Exact Provisioning Schema (Section 1)</span>
                <span className="text-emerald-400">Pure JSON</span>
              </div>
              <pre className="p-2 bg-slate-950 rounded-lg text-emerald-400 text-xs overflow-x-auto leading-relaxed">
                {stringifiedJson}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 2: Traccar OsmAnd Protocol (Section 2 Contract) */}
        {selectedTab === 'traccar' && (
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm">
            <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 flex items-start gap-2.5">
              <Zap className="w-5 h-5 text-sky-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong>OsmAnd Protocol (URL Query Parameters):</strong> The Android app fires HTTP <code>POST</code> requests with all telemetry passed in the URL query string. The server returns <code>HTTP 200 OK</code> immediately.
              </div>
            </div>

            <div className="space-y-3">
              {/* Server URL Card */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                    Ingestion Endpoint
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/60">
                    HTTPS Port 443
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2 rounded-xl bg-slate-100 dark:bg-slate-950 font-mono text-xs font-bold text-sky-700 dark:text-cyan-300 truncate">
                    {serverEndpoint}
                  </div>
                  <button
                    onClick={() => copyText(serverEndpoint)}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Standard Cloudflare HTTPS. No port <code>:5055</code> required.
                </p>
              </div>

              {/* Live Test Telemetry Ping */}
              <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h6 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                    Test OsmAnd POST Request
                  </h6>
                  <p className="text-[11px] text-slate-500">
                    Fire telemetry for <strong>{effectiveId}</strong> with speed in knots
                  </p>
                </div>
                <button
                  onClick={sendTestPing}
                  disabled={pingStatus === 'sending'}
                  className={`px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all ${
                    pingStatus === 'success' 
                      ? 'bg-emerald-600' 
                      : pingStatus === 'error'
                      ? 'bg-rose-600'
                      : 'bg-sky-600 hover:bg-sky-500'
                  }`}
                >
                  {pingStatus === 'sending' ? (
                    'Sending...'
                  ) : pingStatus === 'success' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>HTTP 200 OK!</span>
                    </>
                  ) : (
                    <>
                      <Radio className="w-3.5 h-3.5" />
                      <span>Send Ping</span>
                    </>
                  )}
                </button>
              </div>

              {/* Copyable Curl */}
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[11px] space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-sans font-bold flex items-center justify-between">
                  <span>Exact OsmAnd HTTP POST (Query Params)</span>
                  <button
                    onClick={() => copyText(curlOsmAnd)}
                    className="text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
                  >
                    Copy Curl
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre p-2 bg-slate-950 rounded-lg text-emerald-400 text-[10px]">
                  {curlOsmAnd}
                </div>
              </div>

              {/* Cloudflare Note */}
              <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <strong>Cloudflare WAF Reminder:</strong> In Cloudflare Dashboard, configure a Custom WAF Rule to <em>Bypass Bot Fight Mode & Browser Integrity Checks</em> for URI path containing <code>/api/track</code>.
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Direct HTTP Telemetry API */}
        {selectedTab === 'api' && (
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm">
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 flex items-start gap-2.5">
              <Terminal className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong>Direct REST Telemetry:</strong> Telemetry packets can also be ingested via standard JSON payloads or form submissions to <code>/api/track</code> or <code>/api/location</code>.
              </div>
            </div>

            <div className="space-y-3">
              {/* Endpoint Card */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <span className="text-xs font-bold text-slate-800 dark:text-white block">
                  REST Ingestion Endpoint
                </span>
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-950 font-mono text-xs font-bold text-sky-700 dark:text-cyan-300 truncate">
                  POST {currentDomain}/api/track
                </div>
              </div>

              {/* JSON Payload Snippet */}
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[11px] space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-sans font-bold flex items-center justify-between">
                  <span>POST JSON Body (Curl)</span>
                  <button
                    onClick={() => copyText(curlApiJson)}
                    className="text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
                  >
                    Copy Curl
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre p-2 bg-slate-950 rounded-lg text-emerald-400 text-[10px]">
                  {curlApiJson}
                </div>
              </div>

              {/* Query Parameter Alternatives */}
              <div className="p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <h5 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                  Telemetry Fields Reference
                </h5>
                <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc pl-4 font-mono text-[11px]">
                  <li><code>id</code> (string): Unique identifier (e.g. "VEHICLE-102")</li>
                  <li><code>timestamp</code> (long): Epoch time in seconds (UTC)</li>
                  <li><code>lat</code> (double): Latitude (-90 to 90)</li>
                  <li><code>lon</code> (double): Longitude (-180 to 180)</li>
                  <li><code>speed</code> (double): Speed in knots (converted automatically to km/h)</li>
                  <li><code>bearing</code> (double): Heading in degrees (0-360)</li>
                  <li><code>altitude</code> (double): Altitude in meters</li>
                  <li><code>accuracy</code> (double): GPS accuracy in meters</li>
                  <li><code>batt</code> (double): Battery percentage (0-100)</li>
                  <li><code>charge</code> (boolean): true if charging, false if discharging</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Sant Kabir Eye Hospital Fleet Command</span>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <span>Engineered by</span>
            <a 
              href="https://mrps.in" 
              target="_blank" 
              rel="noreferrer"
              className="font-bold text-slate-800 dark:text-white hover:text-sky-600 dark:hover:text-cyan-400 transition-colors"
            >
              Mani Ratan Singh
            </a>
            <span>•</span>
            <a 
              href="https://github.com/maniratansingh" 
              target="_blank" 
              rel="noreferrer"
              className="text-sky-600 dark:text-cyan-400 hover:underline"
            >
              mrps.in
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
