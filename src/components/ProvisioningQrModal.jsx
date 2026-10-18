import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  QrCode, 
  Check, 
  Copy, 
  Download, 
  Radio, 
  ShieldCheck, 
  Sparkles, 
  Info, 
  Send,
  Smartphone,
  Server,
  Terminal,
  RotateCcw,
  Trash2,
  ExternalLink,
  ChevronRight,
  Zap,
  Globe
} from 'lucide-react';

export default function ProvisioningQrModal({ 
  isOpen, 
  onClose, 
  initialVehicleId = 'AMB-01',
  availableVehicles = []
}) {
  const [activeTab, setActiveTab] = useState('qr'); // 'qr', 'test', 'specs'
  const [vehicleId, setVehicleId] = useState(initialVehicleId || 'AMB-01');
  const [serverMode, setServerMode] = useState('production'); // 'production', 'local', 'custom'
  const [customServerUrl, setCustomServerUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [pingStatus, setPingStatus] = useState(null);
  const [pingDetails, setPingDetails] = useState(null);
  const [clearStatus, setClearStatus] = useState(false);

  // Sync initialVehicleId when opened
  useEffect(() => {
    if (initialVehicleId) {
      setVehicleId(initialVehicleId.toUpperCase().trim());
    }
  }, [initialVehicleId, isOpen]);

  // Determine effective server URL strictly per Master Integration Specification:
  // "server": "https://fleet.mrps.in/api/track" (NO trailing slash)
  const productionServer = 'https://fleet.mrps.in/api/track';
  const localServer = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/track` 
    : 'http://localhost:3000/api/track';

  let effectiveServer = productionServer;
  if (serverMode === 'local') {
    effectiveServer = localServer;
  } else if (serverMode === 'custom') {
    effectiveServer = customServerUrl.trim().replace(/\/+$/, '') || productionServer;
  }

  const cleanVehicleId = (vehicleId || 'AMB-01').trim().toUpperCase();

  // Strict JSON payload per Master Integration Specification Section 1:
  // { "id": "UNIQUE_VEHICLE_ID", "server": "https://fleet.mrps.in/api/track" }
  const provisioningPayload = {
    id: cleanVehicleId,
    server: effectiveServer
  };
  const stringifiedJson = JSON.stringify(provisioningPayload, null, 2);
  const rawCompactJson = JSON.stringify(provisioningPayload);

  // Generate crisp optical-grade QR Code data URL
  useEffect(() => {
    if (!isOpen) return;

    QRCode.toDataURL(rawCompactJson, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#090D16',
        light: '#FFFFFF'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Failed to generate QR Code:', err));
  }, [rawCompactJson, isOpen]);

  if (!isOpen) return null;

  const handleCopyJson = () => {
    navigator.clipboard.writeText(rawCompactJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `FleetShield_Provision_${cleanVehicleId}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  // Test firing a live OsmAnd URL-query POST ping
  const handleTestPing = async (overrideSpeed = 13.5) => {
    setPingStatus('sending');
    setPingDetails(null);
    try {
      const nowEpochSeconds = Math.floor(Date.now() / 1000);
      const testLat = (26.797313 + (Math.random() - 0.5) * 0.03).toFixed(6);
      const testLon = (82.718401 + (Math.random() - 0.5) * 0.03).toFixed(6);
      const speedKnots = overrideSpeed; // 13.5 knots = ~25 km/h
      const bearing = 90.0;
      const altitude = 120.0;
      const accuracy = 8.5;
      const batt = 92.0;
      const charge = true;

      const params = new URLSearchParams({
        id: cleanVehicleId,
        timestamp: String(nowEpochSeconds),
        lat: testLat,
        lon: testLon,
        speed: String(speedKnots),
        bearing: String(bearing),
        altitude: String(altitude),
        accuracy: String(accuracy),
        batt: String(batt),
        charge: String(charge)
      });

      // Target local or remote server
      const targetUrl = effectiveServer.startsWith('http') 
        ? `${effectiveServer}?${params.toString()}`
        : `/api/track?${params.toString()}`;

      const startTime = performance.now();
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      const elapsed = Math.round(performance.now() - startTime);

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setPingStatus('success');
        setPingDetails({
          status: res.status,
          elapsed,
          speedKmH: Math.round(speedKnots * 1.852),
          lat: testLat,
          lon: testLon,
          vehicle: json.vehicle || null
        });
      } else {
        setPingStatus('error');
        setPingDetails({ status: res.status, elapsed });
      }
    } catch (e) {
      console.error('Test ping failed:', e);
      setPingStatus('error');
      setPingDetails({ error: e.message });
    }
  };

  const handleClearVehicles = async () => {
    try {
      await fetch('/api/clear');
      setClearStatus(true);
      setTimeout(() => setClearStatus(false), 2500);
    } catch (e) {
      console.error('Failed to clear vehicles:', e);
    }
  };

  // Standard presets for emergency medical fleet
  const standardPresets = ['AMB-01', 'AMB-02', 'AMB-LUCKNOW', 'AMB-GORAKHPUR', 'AMB-VARANASI'];
  const allSuggested = Array.from(new Set([
    ...availableVehicles.map(v => v.id),
    ...standardPresets
  ])).filter(Boolean);

  const curlExample = `curl -X POST "${effectiveServer}?id=${encodeURIComponent(cleanVehicleId)}&timestamp=$(date +%s)&lat=26.7973&lon=82.7184&speed=13.5&bearing=90&altitude=120.0&accuracy=10.0&batt=90.0&charge=true" \\
  -H "Content-Type: application/x-www-form-urlencoded"`;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[92vh] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/25 shrink-0">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-['Outfit']">
                  Fleet Provisioning Center
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-cyan-400 border border-sky-200 dark:border-sky-800">
                  ML Kit Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sant Kabir Fleet Shield • Android App & Backend Integration
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="px-4 sm:px-5 pt-3 pb-1 border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'qr'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/20'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>1-Scan Provisioning QR</span>
          </button>

          <button
            onClick={() => setActiveTab('test')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'test'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/20'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Test Ingestion Ping</span>
          </button>

          <button
            onClick={() => setActiveTab('specs')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'specs'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/20'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Protocol Specs</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-sm flex-1">

          {/* TAB 1: QR CODE PROVISIONING */}
          {activeTab === 'qr' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Vehicle ID & Server Config Bar */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3">
                
                {/* Vehicle ID Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Vehicle Identifier (<code className="lowercase text-sky-600 dark:text-cyan-400">id</code>)
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Database Device Key
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value.toUpperCase())}
                      placeholder="e.g. AMB-01 or VEHICLE-102"
                      className="w-full px-3.5 py-2 text-sm font-mono font-bold rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-sky-500 pr-9"
                    />
                    {vehicleId && (
                      <button
                        onClick={() => setVehicleId('')}
                        className="absolute right-2.5 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="Clear"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick-Select Suggestion Chips */}
                {allSuggested.length > 0 && (
                  <div className="pt-0.5">
                    <span className="text-[10px] font-semibold text-slate-400 block mb-1.5">
                      Quick Select Vehicle Designation:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {allSuggested.map((id) => (
                        <button
                          key={id}
                          onClick={() => setVehicleId(id)}
                          className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                            cleanVehicleId === id
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:border-sky-400'
                          }`}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target Ingestion Server Mode Switcher */}
                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                      <span>Target Ingestion Server Endpoint</span>
                    </label>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                      No Trailing Slash
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setServerMode('production')}
                      className={`py-1.5 px-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                        serverMode === 'production'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      Cloudflare Live
                    </button>

                    <button
                      onClick={() => setServerMode('local')}
                      className={`py-1.5 px-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                        serverMode === 'local'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      Local Dev Server
                    </button>

                    <button
                      onClick={() => setServerMode('custom')}
                      className={`py-1.5 px-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                        serverMode === 'custom'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      Custom LAN / IP
                    </button>
                  </div>

                  {serverMode === 'custom' && (
                    <input
                      type="url"
                      value={customServerUrl}
                      onChange={(e) => setCustomServerUrl(e.target.value)}
                      placeholder="e.g. http://192.168.1.50:3000/api/track"
                      className="mt-2 w-full px-3 py-1.5 text-xs font-mono rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  )}

                  <div className="mt-1.5 text-[10.5px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                    <span className="truncate">{effectiveServer}</span>
                  </div>
                </div>

              </div>

              {/* High-Contrast Optical Scanner Platter */}
              <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-b from-slate-50 to-white dark:from-slate-900/90 dark:to-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center shadow-inner">
                
                {/* QR Code Presentation Box with High-Tech Corner Guides */}
                <div className="relative p-3.5 bg-white rounded-2xl shadow-lg border border-slate-200 dark:border-slate-300">
                  {/* Visual Corner Brackets */}
                  <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-sky-500 rounded-tl pointer-events-none"></div>
                  <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-sky-500 rounded-tr pointer-events-none"></div>
                  <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-sky-500 rounded-bl pointer-events-none"></div>
                  <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-sky-500 rounded-br pointer-events-none"></div>

                  {qrDataUrl ? (
                    <img 
                      src={qrDataUrl} 
                      alt={`Provisioning QR Code for ${cleanVehicleId}`}
                      className="w-56 h-56 sm:w-64 sm:h-64 block object-contain select-none"
                    />
                  ) : (
                    <div className="w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center text-slate-400 font-mono text-xs">
                      Rendering QR...
                    </div>
                  )}
                </div>

                {/* Subtitle Caption */}
                <div className="mt-3 flex items-center justify-center gap-2 text-xs font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {cleanVehicleId}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 truncate max-w-[200px] sm:max-w-[300px]">
                    {effectiveServer}
                  </span>
                </div>

                {/* Primary Action Buttons (Save & Copy) */}
                <div className="grid grid-cols-2 gap-2 mt-3.5 w-full max-w-xs">
                  <button
                    onClick={handleDownloadQr}
                    className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download PNG</span>
                  </button>

                  <button
                    onClick={handleCopyJson}
                    className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied JSON!' : 'Copy JSON'}</span>
                  </button>
                </div>
              </div>

              {/* 4-Step Visual Administrator Walkthrough */}
              <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 space-y-2">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
                  <span>Fleet Administrator Workflow:</span>
                </h5>
                <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-decimal pl-4 leading-relaxed font-medium">
                  <li>Open the <strong>Sant Kabir Fleet Shield</strong> app on driver's Android device.</li>
                  <li>Enter your confidential <strong>Master PIN</strong> to enter <strong>Admin Settings</strong>.</li>
                  <li>Tap <strong>"Scan Provisioning QR"</strong> and align camera with the code above.</li>
                  <li>Google ML Kit instantly extracts <code>id</code> & <code>server</code>, locks settings, and awakens the background tracking service.</li>
                </ol>
              </div>

            </div>
          )}

          {/* TAB 2: LIVE TEST PING & SIMULATOR */}
          {activeTab === 'test' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 flex items-start gap-2.5">
                <Radio className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <strong>OsmAnd Protocol Verifier:</strong> Test if your server accepts HTTP <code>POST</code> query parameter telemetry and returns an immediate <code>HTTP 200 OK</code> response.
                </div>
              </div>

              {/* Quick Ping Trigger Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Live Telemetry Packet Ping
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Sending telemetry for: <strong className="text-sky-600 dark:text-cyan-400 font-mono">{cleanVehicleId}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => handleTestPing(13.5)}
                    disabled={pingStatus === 'sending'}
                    className={`py-2 px-4 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5 ${
                      pingStatus === 'success'
                        ? 'bg-emerald-600 shadow-emerald-500/20'
                        : pingStatus === 'error'
                        ? 'bg-rose-600 shadow-rose-500/20'
                        : 'bg-sky-600 hover:bg-sky-500 shadow-sky-500/20'
                    }`}
                  >
                    {pingStatus === 'sending' ? (
                      'Transmitting...'
                    ) : pingStatus === 'success' ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>HTTP 200 OK</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Test Ping</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Ping Result Readout Box */}
                {pingDetails && (
                  <div className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] space-y-1 border border-slate-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase">
                      <span>Server Ingestion Feedback</span>
                      <span className="text-emerald-400">{pingDetails.elapsed} ms</span>
                    </div>
                    {pingDetails.status === 200 ? (
                      <div className="space-y-0.5 text-sky-300">
                        <div>✅ Server Status: <strong>HTTP 200 OK</strong></div>
                        <div>📍 Coords Ingested: {pingDetails.lat}° N, {pingDetails.lon}° E</div>
                        <div>⚡ Speed: {pingDetails.speedKmH} km/h (converted from knots)</div>
                        <div className="text-[10px] text-emerald-400 mt-1">
                          Vehicle successfully registered in active fleet cache!
                        </div>
                      </div>
                    ) : (
                      <div className="text-rose-400">
                        ❌ Request returned status {pingDetails.status}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Copyable Curl Terminal Command */}
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[11px] space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-sans font-bold flex items-center justify-between">
                  <span>Exact Traccar OsmAnd Curl Command</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(curlExample);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
                  >
                    {copied ? 'Copied!' : 'Copy Curl'}
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre p-2.5 bg-slate-950 rounded-xl text-emerald-400 text-[10px] border border-slate-800">
                  {curlExample}
                </div>
              </div>

              {/* Reset Standby Button */}
              <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 flex items-center justify-between">
                <div>
                  <h6 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Clear Fleet Telemetry Cache</span>
                  </h6>
                  <p className="text-[11px] text-slate-500">
                    Wipes in-memory vehicle packets and returns map to 0 standby ambulances
                  </p>
                </div>
                <button
                  onClick={handleClearVehicles}
                  className={`px-3 py-1.5 rounded-xl text-white text-xs font-bold transition-all cursor-pointer ${
                    clearStatus ? 'bg-emerald-600' : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {clearStatus ? 'Cleared!' : 'Wipe Cache'}
                </button>
              </div>

            </div>
          )}

          {/* TAB 3: PROTOCOL SPECIFICATIONS */}
          {activeTab === 'specs' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Pure JSON Schema */}
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[11px] space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-sans font-bold flex items-center justify-between">
                  <span>1. QR Code JSON Contract</span>
                  <span className="text-emerald-400">Pure JSON Body</span>
                </div>
                <pre className="p-3 bg-slate-950 rounded-xl text-sky-300 text-xs font-mono overflow-x-auto border border-slate-800 leading-relaxed">
                  {stringifiedJson}
                </pre>
              </div>

              {/* Parameter Dictionary Reference */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
                  <span>2. OsmAnd URL Query Parameter Dictionary:</span>
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                    <strong className="text-sky-600 dark:text-cyan-400">id</strong>: Unique identifier
                  </div>
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                    <strong className="text-sky-600 dark:text-cyan-400">timestamp</strong>: Epoch seconds (UTC)
                  </div>
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                    <strong className="text-sky-600 dark:text-cyan-400">lat / lon</strong>: Coordinates
                  </div>
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                    <strong className="text-sky-600 dark:text-cyan-400">speed</strong>: Knots (x 1.852 = km/h)
                  </div>
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                    <strong className="text-sky-600 dark:text-cyan-400">bearing</strong>: Heading (0-360°)
                  </div>
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                    <strong className="text-sky-600 dark:text-cyan-400">batt / charge</strong>: Battery & Power
                  </div>
                </div>
              </div>

              {/* Cloudflare Architecture Note */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 space-y-1.5">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                  3. Cloudflare WAF & Port Configuration:
                </span>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  In Cloudflare Dashboard &rarr; <strong>WAF &rarr; Custom Rules</strong>: create a rule to <strong>Bypass Bot Fight Mode & Browser Integrity Checks</strong> for path <code>/api/track</code>.
                  Traffic terminates on standard HTTPS port 443 (no port <code>:5055</code> required).
                </p>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Sant Kabir Eye Hospital Fleet Shield</span>
          </div>
          <div className="flex items-center gap-1">
            <span>by</span>
            <a 
              href="https://mrps.in" 
              target="_blank" 
              rel="noreferrer"
              className="font-bold text-slate-800 dark:text-white hover:text-sky-600 dark:hover:text-cyan-400 transition-colors"
            >
              Mani Ratan Singh
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
