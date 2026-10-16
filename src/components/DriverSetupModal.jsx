import React, { useState } from 'react';
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
  Zap
} from 'lucide-react';

export default function DriverSetupModal({ isOpen, onClose }) {
  const [selectedTab, setSelectedTab] = useState('traccar'); // 'traccar' or 'api'
  const [deviceId, setDeviceId] = useState('AMB-ALPHA');
  const [driverName, setDriverName] = useState('Ramesh Yadav');
  const [testSpeed, setTestSpeed] = useState(48);
  const [copied, setCopied] = useState(false);
  const [pingStatus, setPingStatus] = useState(null);

  const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'https://fleet.mrps.in';
  const effectiveId = deviceId.trim() || 'AMB-ALPHA';
  const effectiveDriver = driverName.trim() || 'Assigned Driver';

  if (!isOpen) return null;

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendTestPing = async () => {
    setPingStatus('sending');
    try {
      // Pick coordinate around Ayodhya / Sant Kabir Nagar corridor
      const testLat = (26.785 + (Math.random() - 0.5) * 0.03).toFixed(6);
      const testLon = (82.680 + (Math.random() - 0.5) * 0.03).toFixed(6);
      const res = await fetch(`/?id=${encodeURIComponent(effectiveId)}&driver=${encodeURIComponent(effectiveDriver)}&lat=${testLat}&lon=${testLon}&speed=${testSpeed}&bearing=90`);
      
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

  const curlTraccar = `curl "${currentDomain}/?id=${encodeURIComponent(effectiveId)}&driver=${encodeURIComponent(effectiveDriver)}&lat=26.7912&lon=82.6841&speed=${testSpeed}&bearing=90"`;

  const curlApiJson = `curl -X POST "${currentDomain}/api/location" \\
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl glass-panel-glow rounded-3xl border border-slate-200/90 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-cyan-400 flex items-center justify-center shadow-xs">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-['Outfit']">
                  Live Telemetry & Tracker Stream
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Ingestion
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <span>Universal GPS Integration • by</span>
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
            onClick={() => setSelectedTab('traccar')}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              selectedTab === 'traccar'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Universal Tracker (Traccar / OsmAnd)</span>
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
            <span>Direct HTTP Telemetry API</span>
          </button>
        </div>

        {/* Tab 1: Universal Tracker */}
        {selectedTab === 'traccar' && (
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm">
            <div className="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 flex items-start gap-2.5">
              <Zap className="w-5 h-5 text-sky-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong>Universal Tracker Ingestion:</strong> Connect any standard tracking app (such as <strong>Traccar Client</strong>, <strong>OsmAnd</strong>, <strong>GPSLogger</strong>, or hardware OBD trackers). Point directly to our root domain. You can use <strong>ANY custom identifier & driver name</strong>!
              </div>
            </div>

            <div className="space-y-3">
              {/* Server URL Card */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                    1. Server URL (Traccar Client / OsmAnd)
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/60">
                    HTTPS Port 443
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2 rounded-xl bg-slate-100 dark:bg-slate-950 font-mono text-xs font-bold text-sky-700 dark:text-cyan-300 truncate">
                    {currentDomain}
                  </div>
                  <button
                    onClick={() => copyText(currentDomain)}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Cloudflare terminates on standard HTTPS. Do <strong>not</strong> append <code>:5055</code>.
                </p>
              </div>

              {/* Identifier & Driver Form */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-800 dark:text-white block">
                  2. Device Identifier & Driver Attribution
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Device Identifier</label>
                    <input
                      type="text"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                      placeholder="e.g. Ramesh, Amb-01, Car-5"
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
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Identifier dynamically creates or updates the 3D ambulance on the map in real time.
                </p>
              </div>

              {/* Live Test Telemetry Ping */}
              <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h6 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                    Send Live Test Ping
                  </h6>
                  <p className="text-[11px] text-slate-500">
                    Immediately fire a live telemetry packet for <strong>{effectiveId}</strong>
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
                      <span>Received!</span>
                    </>
                  ) : (
                    <>
                      <Radio className="w-3.5 h-3.5" />
                      <span>Send Test Ping</span>
                    </>
                  )}
                </button>
              </div>

              {/* Copyable Curl */}
              <div className="p-3 rounded-2xl bg-slate-900 text-slate-200 font-mono text-[11px] space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-sans font-bold flex items-center justify-between">
                  <span>Traccar HTTP Ping URL / Curl</span>
                  <button
                    onClick={() => copyText(curlTraccar)}
                    className="text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
                  >
                    Copy Curl
                  </button>
                </div>
                <div className="overflow-x-auto whitespace-pre p-2 bg-slate-950 rounded-lg text-emerald-400 text-[10px]">
                  {curlTraccar}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Direct HTTP Telemetry API */}
        {selectedTab === 'api' && (
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm">
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 flex items-start gap-2.5">
              <Terminal className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong>High-Speed Telemetry Endpoint:</strong> Telemetry packets can be sent via standard HTTP <code>POST</code> with JSON payload or via <code>GET</code> query strings to <code>/api/location</code>.
              </div>
            </div>

            <div className="space-y-3">
              {/* Endpoint Card */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <span className="text-xs font-bold text-slate-800 dark:text-white block">
                  REST Endpoint
                </span>
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-950 font-mono text-xs font-bold text-sky-700 dark:text-cyan-300 truncate">
                  POST {currentDomain}/api/location
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
                  <li><code>id</code> (string): Unique identifier (e.g. "SK-AMB-01" or "Ramesh")</li>
                  <li><code>driver</code> (string, optional): Assigned driver name</li>
                  <li><code>lat</code> (float): Latitude (-90 to 90)</li>
                  <li><code>lon</code> (float): Longitude (-180 to 180)</li>
                  <li><code>speed</code> (float, optional): Speed in km/h</li>
                  <li><code>bearing</code> (float, optional): Heading in degrees (0-360)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Clinical Footer Plaque */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Sant Kabir Eye Hospital</span>
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
