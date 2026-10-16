import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  ShieldCheck, 
  QrCode, 
  Download, 
  Lock, 
  Smartphone, 
  Check, 
  Copy, 
  ExternalLink,
  User,
  Radio,
  Sparkles
} from 'lucide-react';

export default function DriverSetupModal({ isOpen, onClose }) {
  const [selectedId, setSelectedId] = useState('SK-AMB-01');
  const [customId, setCustomId] = useState('');
  const [driverName, setDriverName] = useState('Ramesh Yadav');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('qr'); // 'qr' or 'apk'

  const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'https://fleet.mrps.in';
  const serverEndpoint = `${currentDomain}/api/location`;

  const effectiveId = customId.trim() ? customId.trim().toUpperCase() : selectedId;

  const payload = {
    app: 'Sant Kabir Fleet Shield',
    developer: 'Mani Ratan Singh (mrps.in)',
    id: effectiveId,
    driver: driverName.trim() || 'Assigned Driver',
    server: serverEndpoint,
    timestamp: Date.now(),
  };

  const setupProvisionUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/setup?id=${encodeURIComponent(effectiveId)}&url=${encodeURIComponent(serverEndpoint)}`
    : `https://fleet.mrps.in/setup?id=${encodeURIComponent(effectiveId)}&url=${encodeURIComponent(serverEndpoint)}`;

  useEffect(() => {
    if (!isOpen) return;
    QRCode.toDataURL(setupProvisionUrl, {
      width: 240,
      margin: 1.5,
      color: {
        dark: '#0284C7', // Medical Sky / Apple Cyan
        light: '#FFFFFF'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('QR generation error:', err));
  }, [isOpen, setupProvisionUrl]);

  if (!isOpen) return null;

  const copyPayload = () => {
    navigator.clipboard.writeText(setupProvisionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl glass-panel-glow rounded-3xl border border-slate-200/90 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-cyan-400 flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-['Outfit']">
                  Sant Kabir Fleet Shield
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-cyan-400 border border-sky-200 dark:border-sky-800">
                  v1.0
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <span>Driver Provisioning Center • by</span>
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
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'qr'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Admin QR Provisioning</span>
          </button>
          <button
            onClick={() => setActiveTab('apk')}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'apk'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Private APK Download</span>
          </button>
        </div>

        {/* Tab 1: QR Provisioning */}
        {activeTab === 'qr' && (
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm">
            <div className="p-3 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-sky-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong>QR Auto-Provisioning:</strong> 1. Install the APK on the phone (Tab 2). 2. Select the Ambulance Asset ID below. 3. Point the phone's camera at this QR code — it prompts to open Fleet Shield and automatically configures the vehicle identifier and server endpoint!
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Form Controls */}
              <div className="space-y-3">
                {/* Permanent Asset ID */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Permanent Ambulance Asset ID
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                    {['SK-AMB-01', 'SK-AMB-02', 'SK-AMB-03'].map(id => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { setSelectedId(id); setCustomId(''); }}
                        className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                          effectiveId === id && !customId
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value)}
                    placeholder="Or custom ID (e.g. SK-AMB-04)"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                {/* Driver Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Assigned Driver Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="e.g. Ramesh Yadav"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Serverless Endpoint */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Serverless Cloudflare Endpoint
                  </label>
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-cyan-300 truncate">
                    {serverEndpoint}
                  </div>
                </div>
              </div>

              {/* QR Code Display Card */}
              <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                {qrDataUrl ? (
                  <img 
                    src={qrDataUrl} 
                    alt="Fleet Shield Provisioning QR" 
                    className="w-44 h-44 rounded-xl shadow-xs"
                  />
                ) : (
                  <div className="w-44 h-44 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse flex items-center justify-center text-xs text-slate-400">
                    Generating QR...
                  </div>
                )}
                <span className="mt-2 text-[11px] font-mono font-bold text-sky-600 dark:text-cyan-400">
                  {effectiveId} • {driverName}
                </span>
                <span className="text-[10px] text-slate-400">Scan with Phone Camera to Auto-Configure</span>
              </div>
            </div>

            {/* Payload preview button */}
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Deep link setup encoded in QR
              </span>
              <button
                onClick={copyPayload}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Link' : 'Copy Setup Link'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Private APK Download */}
        {activeTab === 'apk' && (
          <div className="p-4 space-y-3.5 overflow-y-auto text-sm">
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong>Master Admin Protected:</strong> The <strong>Sant Kabir Fleet Shield APK</strong> locks settings on launch so drivers cannot tamper with telemetry. Only authorized administrators with the master PIN can unlock and tune device settings.
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/80 text-sky-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs">
                    APK
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      santkabir-fleet-shield-v1.0.apk
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Private Driver Binary • Android 8.0+
                    </p>
                  </div>
                </div>
                <a
                  href="/downloads/santkabir-fleet-shield-v1.0.apk"
                  download="santkabir-fleet-shield-v1.0.apk"
                  type="application/vnd.android.package-archive"
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download APK</span>
                </a>
              </div>

              {/* Installation Protocol */}
              <div className="p-3.5 rounded-2xl bg-slate-100/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <h5 className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                  Field Installation Protocol
                </h5>
                <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-decimal pl-4">
                  <li>Download and install APK on driver's Android phone (Android 8.0+).</li>
                  <li><em>Chrome Tip:</em> If Android Chrome labels it as <code>.zip</code>, simply rename the file to <code>.apk</code> in your phone's <strong>Files</strong> app and tap to install.</li>
                  <li>Enable <em>"Install unknown apps"</em> and complete installation.</li>
                  <li>Launch app and scan the <strong>Admin Provisioning QR Code</strong> from Tab 1.</li>
                  <li>Grant <em>"Allow location all the time"</em> and ignore battery optimizations.</li>
                  <li>App automatically starts background daemon and locks configuration.</li>
                </ol>
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
