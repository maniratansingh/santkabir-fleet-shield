import React, { useState, useEffect, useRef } from 'react';
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
import { useSpringPresence } from '../hooks/useSpringPresence';

const TRACCAR_SETTINGS = {
  accuracy: 'highest',
  distance: 0,
  interval: 30,
  angle: 0,
  heartbeat: 60,
  buffer: false,
  wakelock: true,
  stop_detection: true,
  prefer_platform_providers: false,
};

const MAX_NAME_WORDS = 4;
const MAX_NAME_LENGTH = 40;

function sanitizeDriverName(raw) {
  const collapsed = String(raw || '').replace(/\s+/g, ' ').replace(/^\s+/, '');
  const words = collapsed.split(' ').slice(0, MAX_NAME_WORDS);
  return words.join(' ').slice(0, MAX_NAME_LENGTH);
}

function buildTraccarUrl(server, id) {
  try {
    const url = new URL(server);
    url.searchParams.set('id', id);
    for (const [key, value] of Object.entries(TRACCAR_SETTINGS)) {
      url.searchParams.set(key, String(value));
    }
    // Use %20 for spaces so every QR parser decodes the name identically.
    return url.toString().replace(/\+/g, '%20');
  } catch {
    return '';
  }
}

export default function ProvisioningQrModal({
  isOpen,
  onClose,
  initialVehicleId = '',
}) {
  const [activeTab, setActiveTab] = useState('qr'); // 'qr', 'test', 'specs'
  const [driverName, setDriverName] = useState('');
  const [serverMode, setServerMode] = useState('production'); // 'production', 'local', 'custom'
  const [customServerUrl, setCustomServerUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [pingStatus, setPingStatus] = useState(null);
  const [pingDetails, setPingDetails] = useState(null);
  const [clearStatus, setClearStatus] = useState(false);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);
  const presence = useSpringPresence(isOpen, { fromScale: 0.96, fromY: 0, transformOrigin: 'center' });

  // Keep the latest close handler without re-running the focus trap.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Prefill only when the dialog opens. Never reset the field while typing.
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const incoming = String(initialVehicleId || '').trim();
      const looksLikeVehicleCode = /^(AMB|VEHICLE|SK)-/i.test(incoming);
      setDriverName(sanitizeDriverName(looksLikeVehicleCode ? '' : incoming));
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialVehicleId]);

  // Focus the name field once on open.
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    if (!isOpen) return undefined;
    const node = dialogRef.current;
    if (!node) return undefined;
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(node.querySelectorAll(selector)).filter((el) => el.offsetParent !== null);

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Determine effective server URL
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

  const cleanDriverName = driverName.trim();
  const canProvision = cleanDriverName.length > 0;
  const traccarUrl = canProvision ? buildTraccarUrl(effectiveServer, cleanDriverName) : '';

  useEffect(() => {
    if (!isOpen || !traccarUrl) {
      setQrDataUrl('');
      return;
    }

    QRCode.toDataURL(traccarUrl, {
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
  }, [traccarUrl, isOpen]);

  if (!isOpen && !presence.mounted) return null;

  const handleCopyUri = () => {
    if (!traccarUrl) return;
    navigator.clipboard.writeText(traccarUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl || !cleanDriverName) return;
    const safeName = cleanDriverName.replace(/[^a-z0-9]+/gi, '_');
    const link = document.createElement('a');
    link.download = `Traccar_${safeName}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  // Test firing a live OsmAnd URL-query POST ping
  const handleTestPing = async (overrideSpeed = 13.5) => {
    if (!canProvision) return;
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
        id: cleanDriverName,
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
    const adminKey = window.prompt('Enter ADMIN_SECRET_KEY to wipe live telemetry:');
    if (!adminKey) return;
    try {
      const res = await fetch('/api/clear', {
        method: 'DELETE',
        headers: { 'X-Admin-Key': adminKey },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setClearStatus(true);
      setTimeout(() => setClearStatus(false), 2500);
    } catch (e) {
      console.error('Failed to clear vehicles:', e);
      window.alert(`Clear failed: ${e.message}`);
    }
  };

  const curlExample = `curl -X POST "${effectiveServer}?id=${encodeURIComponent(cleanDriverName || 'DRIVER_NAME')}&timestamp=$(date +%s)&lat=26.7973&lon=82.7184&speed=13.5&bearing=90&altitude=120.0&accuracy=10.0&batt=90.0&charge=true" \\
  -H "Content-Type: application/x-www-form-urlencoded"`;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-md select-none"
      style={{ backgroundColor: `rgba(2, 6, 23, ${0.8 * presence.progress})` }}
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        style={presence.style}
        role="dialog"
        aria-modal="true"
        aria-labelledby="provisioning-dialog-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-sky-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="provisioning-dialog-title" className="type-headline text-slate-900 dark:text-white">
                  Driver provisioning
                </h3>
                <span className="ui-chip ui-chip-accent">
                  Traccar QR
                </span>
              </div>
              <p className="type-caption text-slate-500 dark:text-slate-400 mt-0.5">
                Traccar Client · one driver name, all tracking settings
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            aria-label="Close provisioning dialog"
            className="touch-target ui-press p-2 rounded-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-500/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-5 pt-3 pb-1 border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-900 flex items-center gap-1.5 shrink-0" role="tablist" aria-label="Provisioning sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'qr'}
            onClick={() => setActiveTab('qr')}
            className={`ui-press flex-1 min-h-11 py-2 px-2.5 type-footnote font-semibold rounded-[10px] flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'qr'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/15'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 max-sm:hidden" />
            <span>QR provisioning</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'test'}
            onClick={() => setActiveTab('test')}
            className={`ui-press flex-1 min-h-11 py-2 px-2.5 type-footnote font-semibold rounded-[10px] flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'test'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/15'
            }`}
          >
            <Zap className="w-3.5 h-3.5 max-sm:hidden" />
            <span>Test ingestion</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'specs'}
            onClick={() => setActiveTab('specs')}
            className={`ui-press flex-1 min-h-11 py-2 px-2.5 type-footnote font-semibold rounded-[10px] flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'specs'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/15'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 max-sm:hidden" />
            <span>Protocol</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-sm flex-1 select-text">

          {/* TAB 1: QR CODE PROVISIONING */}
          {activeTab === 'qr' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px] md:items-start">
              {/* Driver name & server configuration */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-3">
                
                {/* Driver Name Input — the only identity field */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="ui-section-label">
                      Driver Name (<code className="lowercase text-sky-600 dark:text-cyan-400">id</code>)
                    </label>
                    <span className="type-caption text-slate-500 dark:text-slate-400 font-mono">
                      Traccar device ID
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <input
                      ref={inputRef}
                      type="text"
                      value={driverName}
                      onChange={(e) => setDriverName(sanitizeDriverName(e.target.value))}
                      placeholder="e.g. Ramesh Yadav"
                      maxLength={MAX_NAME_LENGTH}
                      autoCapitalize="words"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full px-3.5 py-2 pr-9 text-sm font-semibold rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    {driverName && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setDriverName('');
                          inputRef.current?.focus();
                        }}
                        className="absolute right-2.5 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        title="Clear"
                        aria-label="Clear driver name"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className={`type-caption ${canProvision ? 'text-slate-500 dark:text-slate-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {canProvision ? 'This name becomes the Traccar device identifier.' : 'Enter a driver name to generate the QR.'}
                    </span>
                    <span className="type-caption text-slate-400 font-mono tabular-nums shrink-0">
                      {driverName.length}/{MAX_NAME_LENGTH}
                    </span>
                  </div>
                </div>

                {/* Target Ingestion Server Mode Switcher */}
                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[0.6875rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                      <span>Target Ingestion Server Endpoint</span>
                    </label>
                    <span className="type-caption text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                      No Trailing Slash
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setServerMode('production')}
                      className={`py-1.5 px-2 text-[0.6875rem] font-bold rounded-xl border transition-all cursor-pointer ${
                        serverMode === 'production'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      Cloudflare Live
                    </button>

                    <button
                      onClick={() => setServerMode('local')}
                      className={`py-1.5 px-2 text-[0.6875rem] font-bold rounded-xl border transition-all cursor-pointer ${
                        serverMode === 'local'
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      Local Dev Server
                    </button>

                    <button
                      onClick={() => setServerMode('custom')}
                      className={`py-1.5 px-2 text-[0.6875rem] font-bold rounded-xl border transition-all cursor-pointer ${
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

                  <div className="mt-1.5 type-caption font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                    <span className="truncate">{effectiveServer}</span>
                  </div>
                </div>

              </div>

              {/* High-Contrast Optical Scanner Platter */}
              <div className="p-4 sm:p-5 rounded-[18px] bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                
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
                      alt={cleanDriverName ? `Traccar provisioning QR for ${cleanDriverName}` : "Traccar provisioning QR"}
                      className="w-56 h-56 sm:w-64 sm:h-64 block object-contain select-none"
                    />
                  ) : (
                    <div className="w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center text-center px-6 text-slate-400 font-mono text-xs">
                      {canProvision ? 'Rendering QR...' : 'Enter a driver name'}
                    </div>
                  )}
                </div>

                {/* Subtitle Caption */}
                <div className="mt-3 flex items-center justify-center gap-2 text-xs font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-extrabold text-slate-900 dark:text-white truncate max-w-[52%]">
                    {cleanDriverName || 'Driver name'}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 truncate max-w-[200px] sm:max-w-[300px]">
                    {effectiveServer}
                  </span>
                </div>

                {/* Primary Action Buttons (Save & Copy) */}
                <div className="grid grid-cols-2 gap-2 mt-3.5 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    disabled={!canProvision || !qrDataUrl}
                    className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download PNG</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyUri}
                    disabled={!canProvision || !traccarUrl}
                    className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied URI!' : 'Copy URI'}</span>
                  </button>
                </div>
              </div>
              </div>

              {/* 4-Step Visual Administrator Walkthrough */}
              <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 space-y-2">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
                  <span>Fleet Administrator Workflow:</span>
                </h5>
                <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-decimal pl-4 leading-relaxed font-medium">
                  <li>Install <strong>Traccar Client</strong> on the driver's Android phone.</li>
                  <li>Open <strong>Settings</strong> and tap the <strong>QR scan</strong> icon.</li>
                  <li>Scan the code above. The driver name and all tracking settings apply automatically.</li>
                  <li>Open <strong>Advanced settings</strong> and set the settings password manually. If a password already exists, unlock Settings before scanning.</li>
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
                    <p className="text-[0.6875rem] text-slate-500">
                      Sending telemetry for: <strong className="text-sky-600 dark:text-cyan-400 font-mono">{cleanDriverName || '—'}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => handleTestPing(13.5)}
                    disabled={pingStatus === 'sending' || !canProvision}
                    className={`py-2 px-4 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
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
                  <div className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[0.6875rem] space-y-1 border border-slate-800">
                    <div className="ui-section-label flex items-center justify-between">
                      <span>Server Ingestion Feedback</span>
                      <span className="text-emerald-400">{pingDetails.elapsed} ms</span>
                    </div>
                    {pingDetails.status === 200 ? (
                      <div className="space-y-0.5 text-sky-300">
                        <div>✅ Server Status: <strong>HTTP 200 OK</strong></div>
                        <div>📍 Coords Ingested: {pingDetails.lat}° N, {pingDetails.lon}° E</div>
                        <div>⚡ Speed: {pingDetails.speedKmH} km/h (converted from knots)</div>
                        <div className="type-caption text-emerald-400 mt-1">
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
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[0.6875rem] space-y-1">
                <div className="ui-section-label flex items-center justify-between">
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
                <div className="overflow-x-auto whitespace-pre p-2.5 bg-slate-950 rounded-xl text-emerald-400 text-[0.625rem] border border-slate-800">
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
                  <p className="text-[0.6875rem] text-slate-500">
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
              
              {/* Traccar QR URI */}
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[0.6875rem] space-y-1">
                <div className="ui-section-label flex items-center justify-between">
                  <span>1. Traccar Client QR URI</span>
                  <span className="text-emerald-400">HTTPS URI</span>
                </div>
                <pre className="p-3 bg-slate-950 rounded-xl text-sky-300 text-xs font-mono overflow-x-auto border border-slate-800 leading-relaxed whitespace-pre-wrap break-all">
                  {traccarUrl || 'Enter a driver name to generate the Traccar URI.'}
                </pre>
              </div>

              {/* Applied settings */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
                  <span>2. Settings applied by the QR:</span>
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[0.6875rem] text-slate-600 dark:text-slate-400">
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                    <strong className="text-sky-600 dark:text-cyan-400">id</strong>: {cleanDriverName || 'driver name'}
                  </div>
                  {Object.entries(TRACCAR_SETTINGS).map(([key, value]) => (
                    <div key={key} className="p-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800">
                      <strong className="text-sky-600 dark:text-cyan-400">{key}</strong>: {String(value)}
                    </div>
                  ))}
                </div>
                <p className="type-caption text-slate-500 dark:text-slate-400">
                  Traccar uploads over HTTPS POST form data. It does not use WebSocket. Speed is sent in knots.
                </p>
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
        <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 flex items-center justify-between type-caption text-slate-500 dark:text-slate-400 shrink-0">
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
