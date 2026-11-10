import React, { useState, useEffect, useRef } from 'react';
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
import { useSpringPresence } from '../hooks/useSpringPresence';
import { TRACCAR_SETTINGS, MAX_DRIVER_NAME_LENGTH, sanitizeDriverName, buildTraccarUrl } from '../utils/traccarProvisioning';

export default function DriverSetupModal({ isOpen, onClose }) {
  const [selectedTab, setSelectedTab] = useState('provision'); // 'provision', 'traccar', or 'api'
  const [driverName, setDriverName] = useState('');
  const [testSpeed, setTestSpeed] = useState(13.5); // knots (~25 km/h)
  const [copied, setCopied] = useState(false);
  const [pingStatus, setPingStatus] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const dialogRef = useRef(null);
  const driverInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);
  const presence = useSpringPresence(isOpen, { fromScale: 0.96, fromY: 0, transformOrigin: 'center' });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Reset only on open. Never reset the field while typing.
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setDriverName('');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => driverInputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Escape closes; Tab stays inside. Runs only on open/close.
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

  const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'https://fleet.mrps.in';
  const serverEndpoint = 'https://fleet.mrps.in/api/track';
  const cleanDriverName = sanitizeDriverName(driverName).trim();
  const canProvision = cleanDriverName.length > 0;
  const traccarUrl = canProvision ? buildTraccarUrl(serverEndpoint, cleanDriverName) : '';

  useEffect(() => {
    if (!isOpen || !traccarUrl) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(traccarUrl, {
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
  }, [traccarUrl, isOpen]);

  if (!isOpen && !presence.mounted) return null;

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
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

  // Test OsmAnd HTTP POST ping with URL query parameters
  const sendTestPing = async () => {
    if (!canProvision) return;
    setPingStatus('sending');
    try {
      const nowEpoch = Math.floor(Date.now() / 1000);
      const testLat = (26.785 + (Math.random() - 0.5) * 0.03).toFixed(6);
      const testLon = (82.680 + (Math.random() - 0.5) * 0.03).toFixed(6);

      // OsmAnd protocol: POST /api/track?id=...&timestamp=...&lat=...&lon=...&speed=...&bearing=...
      const queryParams = new URLSearchParams({
        id: cleanDriverName,
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

  const curlOsmAnd = `curl -X POST "${currentDomain}/api/track?id=${encodeURIComponent(cleanDriverName || 'DRIVER_NAME')}&timestamp=${Math.floor(Date.now() / 1000)}&lat=26.7912&lon=82.6841&speed=13.5&bearing=90&altitude=120.0&accuracy=10.0&batt=85.0&charge=true" \\
  -H "Content-Type: application/x-www-form-urlencoded"`;

  const curlApiJson = `curl -X POST "${currentDomain}/api/track" \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "${cleanDriverName || 'DRIVER_NAME'}",
    "lat": 26.79125,
    "lon": 82.68410,
    "speed": ${testSpeed},
    "bearing": 90
  }'`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md select-none"
      style={{ backgroundColor: `rgba(2, 6, 23, ${0.75 * presence.progress})` }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl glass-panel-glow rounded-[24px] border border-slate-200/90 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        style={presence.style}
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-setup-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-sky-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="driver-setup-title" className="type-headline text-slate-900 dark:text-white">
                  Telemetry & tracker setup
                </h3>
                <span className="ui-chip">
                  <span className="ui-status-dot bg-emerald-500 animate-pulse" aria-hidden="true" />
                  Ingestion active
                </span>
              </div>
              <p className="type-caption text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <span>Sant Kabir Fleet Shield ·</span>
                <a 
                  href="https://mrps.in" 
                  target="_blank" 
                  rel="noreferrer"
                  className="font-semibold text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-cyan-400 hover:underline"
                >
                  Mani Ratan Singh
                </a>
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            aria-label="Close telemetry setup dialog"
            className="touch-target ui-press p-2 rounded-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-500/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 shrink-0" role="tablist" aria-label="Telemetry setup sections">
          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === 'provision'}
            onClick={() => setSelectedTab('provision')}
            className={`ui-press flex-1 min-h-11 py-2 type-footnote font-semibold rounded-[10px] flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              selectedTab === 'provision'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/15'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 max-sm:hidden" />
            <span>Traccar QR</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === 'traccar'}
            onClick={() => setSelectedTab('traccar')}
            className={`ui-press flex-1 min-h-11 py-2 type-footnote font-semibold rounded-[10px] flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              selectedTab === 'traccar'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/15'
            }`}
          >
            <Radio className="w-3.5 h-3.5 max-sm:hidden" />
            <span>OsmAnd</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === 'api'}
            onClick={() => setSelectedTab('api')}
            className={`ui-press flex-1 min-h-11 py-2 type-footnote font-semibold rounded-[10px] flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              selectedTab === 'api'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/15'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 max-sm:hidden" />
            <span>REST API</span>
          </button>
        </div>

        {/* TAB 1: Android QR Code Provisioning (Section 1 Contract) */}
        {selectedTab === 'provision' && (
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm select-text">
            <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 flex items-start gap-2.5">
              <Sparkles className="w-5 h-5 text-sky-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong>Traccar Client QR provisioning:</strong> Open Settings in Traccar Client and tap the QR scan icon. The driver name and all tracking settings apply automatically.
              </div>
            </div>

            {/* Driver name input — one identity only */}
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="ui-section-label">
                  Driver Name (<code className="lowercase text-sky-600 dark:text-cyan-400">id</code>)
                </label>
                <span className="type-caption text-slate-500 dark:text-slate-400 font-mono">
                  Traccar device ID
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  ref={driverInputRef}
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(sanitizeDriverName(e.target.value))}
                  placeholder="Enter driver name"
                  maxLength={MAX_DRIVER_NAME_LENGTH}
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full px-3 py-1.5 pr-9 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {driverName && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setDriverName('');
                      driverInputRef.current?.focus();
                    }}
                    className="absolute right-2 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Clear"
                    aria-label="Clear driver name"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={`type-caption ${canProvision ? 'text-slate-500 dark:text-slate-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {canProvision ? 'This name becomes the Traccar device identifier.' : 'Enter a driver name to generate the QR.'}
                </span>
                <span className="type-caption text-slate-400 font-mono tabular-nums shrink-0">
                  {driverName.length}/{MAX_DRIVER_NAME_LENGTH}
                </span>
              </div>
            </div>

            {/* QR Code Presentation Box */}
            <div className="p-4 rounded-[18px] bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
              <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={cleanDriverName ? `Traccar provisioning QR for ${cleanDriverName}` : 'Traccar provisioning QR'}
                    className="w-48 h-48 block object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-center px-4 text-slate-400 font-mono text-xs">
                    {canProvision ? 'Generating QR...' : 'Enter a driver name'}
                  </div>
                )}
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-800 dark:text-white truncate max-w-[46%]">
                  {cleanDriverName || 'Driver name'}
                </span>
                <span className="text-slate-400 text-xs">•</span>
                <span className="text-xs text-slate-500 font-mono truncate max-w-[46%]">
                  {serverEndpoint}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  disabled={!canProvision || !qrDataUrl}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => copyText(traccarUrl)}
                  disabled={!canProvision || !traccarUrl}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied URI!' : 'Copy URI'}</span>
                </button>
              </div>
            </div>

            {/* Traccar URI Preview */}
            <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[0.6875rem] space-y-1">
              <div className="ui-section-label flex items-center justify-between">
                <span>Traccar QR URI</span>
                <span className="text-emerald-400">HTTPS URI</span>
              </div>
              <pre className="p-2 bg-slate-950 rounded-lg text-emerald-400 text-xs overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                {traccarUrl || 'Enter a driver name to generate the Traccar URI.'}
              </pre>
            </div>

            <p className="type-caption text-slate-500 dark:text-slate-400">
              After scanning, open <strong>Advanced settings</strong> and set the settings password manually.
            </p>
          </div>
        )}

        {/* TAB 2: Traccar OsmAnd Protocol (Section 2 Contract) */}
        {selectedTab === 'traccar' && (
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm select-text">
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
                  <span className="ui-chip text-emerald-700 dark:text-emerald-400">
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
                <p className="text-[0.6875rem] text-slate-500 dark:text-slate-400">
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
                  <p className="text-[0.6875rem] text-slate-500">
                    Fire telemetry for <strong>{cleanDriverName || '—'}</strong> with speed in knots
                  </p>
                </div>
                <button
                  onClick={sendTestPing}
                  disabled={pingStatus === 'sending' || !canProvision}
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
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[0.6875rem] space-y-1">
                <div className="ui-section-label flex items-center justify-between">
                  <span>Exact OsmAnd HTTP POST (Query Params)</span>
                  <button
                    onClick={() => copyText(curlOsmAnd)}
                    className="text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
                  >
                    Copy Curl
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre p-2 bg-slate-950 rounded-lg text-emerald-400 text-[0.625rem]">
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
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm select-text">
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
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[0.6875rem] space-y-1">
                <div className="ui-section-label flex items-center justify-between">
                  <span>POST JSON Body (Curl)</span>
                  <button
                    onClick={() => copyText(curlApiJson)}
                    className="text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
                  >
                    Copy Curl
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre p-2 bg-slate-950 rounded-lg text-emerald-400 text-[0.625rem]">
                  {curlApiJson}
                </div>
              </div>

              {/* Query Parameter Alternatives */}
              <div className="p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <h5 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                  Telemetry Fields Reference
                </h5>
                <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc pl-4 font-mono text-[0.6875rem]">
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
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 flex items-center justify-between type-caption text-slate-500 dark:text-slate-400 shrink-0">
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
