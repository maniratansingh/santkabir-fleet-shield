import React, { useState } from 'react';
import { 
  X, 
  Smartphone, 
  Copy, 
  Check, 
  ExternalLink, 
  CheckCircle2,
  Radio
} from 'lucide-react';

export default function DriverSetupModal({ isOpen, onClose }) {
  const [copied, setCopied] = useState(false);
  const currentDomain = typeof window !== 'undefined' ? window.location.origin : 'https://fleet.santkabireyehospital.piecs.org';
  const serverEndpoint = `${currentDomain}/api/location`;

  if (!isOpen) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(serverEndpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl glass-panel-glow rounded-2xl border border-slate-200 dark:border-cyan-500/30 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-600 dark:bg-cyan-500/20 dark:border-cyan-500/30 dark:text-cyan-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-['Outfit']">
                Connect Eye Camp Vehicles via Traccar Client
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Zero hardware cost • 1-minute setup on any driver's smartphone
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Steps */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-sm">
          {/* Step 1 */}
          <div className="flex gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-sky-100 text-sky-700 border border-sky-300 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/40 font-bold text-xs shrink-0">
              1
            </span>
            <div className="space-y-1">
              <h4 className="font-semibold text-slate-900 dark:text-white">Install Traccar Client</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Install the official free <strong>Traccar Client</strong> app on each driver's phone or mounted vehicle Android tablet.
              </p>
              <div className="flex gap-2 pt-1">
                <a 
                  href="https://play.google.com/store/apps/details?id=org.traccar.client" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-sky-800 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-cyan-300 dark:border-slate-700 font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Google Play Store (Android)
                </a>
                <a 
                  href="https://apps.apple.com/app/traccar-client/id843156976" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700 font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  App Store (iOS)
                </a>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-sky-100 text-sky-700 border border-sky-300 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/40 font-bold text-xs shrink-0">
              2
            </span>
            <div className="space-y-1 flex-1">
              <h4 className="font-semibold text-slate-900 dark:text-white">Set Server URL</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                In the app settings, set <strong>Server URL</strong> to your Cloudflare endpoint:
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <code className="flex-1 p-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono text-sky-800 dark:bg-slate-950 dark:border-slate-800 dark:text-cyan-300 select-all overflow-x-auto">
                  {serverEndpoint}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-sm"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-sky-100 text-sky-700 border border-sky-300 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/40 font-bold text-xs shrink-0">
              3
            </span>
            <div className="space-y-1">
              <h4 className="font-semibold text-slate-900 dark:text-white">Enter Vehicle Identifier</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                In <strong>Device Identifier</strong>, enter the vehicle code or plate number:
              </p>
              <div className="flex flex-wrap gap-2 pt-1 text-xs font-mono">
                <span className="px-2 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 font-medium">
                  SK-VAN-01
                </span>
                <span className="px-2 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 font-medium">
                  SK-SHUTTLE-02
                </span>
                <span className="px-2 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 font-medium">
                  SK-VISION-03
                </span>
                <span className="px-2 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-cyan-300 font-medium">
                  SK-AMBULANCE-04
                </span>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-sky-100 text-sky-700 border border-sky-300 dark:bg-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/40 font-bold text-xs shrink-0">
              4
            </span>
            <div className="space-y-1">
              <h4 className="font-semibold text-slate-900 dark:text-white">Recommended App Settings</h4>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-0.5">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <strong>Frequency:</strong> Set to <code>10</code> or <code>15 seconds</code> for smooth tracking.
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <strong>Location Provider:</strong> High Accuracy (GPS).
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <strong>Service Status:</strong> Flip switch to <strong>ON</strong>.
                </li>
              </ul>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-800 dark:bg-cyan-950/40 dark:border-cyan-500/30 dark:text-cyan-300 flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-sky-600 dark:text-cyan-400 shrink-0 animate-pulse" />
            <span>
              Once switched ON, the vehicle marker will automatically emerge and update live on this screen with speed and battery level!
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white font-medium text-xs transition-colors cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
