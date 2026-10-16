import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Navigation, 
  Phone, 
  MapPin, 
  Activity, 
  Lock, 
  Unlock, 
  Battery, 
  Radio, 
  RefreshCw, 
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Compass,
  Gauge
} from 'lucide-react';
import { BASE_HOSPITAL, calculateDistanceKm } from '../data/mockData';

export default function DriverApp() {
  const [vehicleId, setVehicleId] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('id') || localStorage.getItem('sk_driver_veh_id') || 'SK-AMB-01';
    }
    return 'SK-AMB-01';
  });

  const [driverName, setDriverName] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('driver') || localStorage.getItem('sk_driver_name') || 'Emergency Driver';
    }
    return 'Emergency Driver';
  });

  const [isOnDuty, setIsOnDuty] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // Live Sensor State
  const [coords, setCoords] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [speedKmH, setSpeedKmH] = useState(0);
  const [heading, setHeading] = useState(0);
  const [altitude, setAltitude] = useState(0);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  // Transmission Telemetry Logs
  const [packetCount, setPacketCount] = useState(0);
  const [lastPingTime, setLastPingTime] = useState(null);
  const [pingStatus, setPingStatus] = useState('idle'); // 'idle', 'sending', 'ok', 'error'
  const [logEntries, setLogEntries] = useState([]);

  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const pingIntervalRef = useRef(null);

  const serverUrl = typeof window !== 'undefined' ? window.location.origin : 'https://fleet.mrps.in';

  // Save preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sk_driver_veh_id', vehicleId);
      localStorage.setItem('sk_driver_name', driverName);
    }
  }, [vehicleId, driverName]);

  // Battery API
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      navigator.getBattery().then((battery) => {
        const update = () => setBatteryLevel(Math.round(battery.level * 100));
        update();
        battery.addEventListener('levelchange', update);
      }).catch(() => {});
    }
  }, []);

  // Screen WakeLock API to keep device GPS active in pocket/cradle
  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setIsWakeLockActive(true);
      }
    } catch (e) {
      console.warn('Wake Lock error:', e);
      setIsWakeLockActive(false);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      setIsWakeLockActive(false);
    } catch (e) {}
  };

  // Start / Stop Live GPS Tracking
  const startTracking = () => {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser or device.');
      return;
    }

    acquireWakeLock();
    setIsOnDuty(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, speed, heading: h, altitude: alt, accuracy: acc } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        setAccuracy(Math.round(acc));
        setHeading(h !== null && !isNaN(h) ? Math.round(h) : 0);
        setAltitude(alt !== null && !isNaN(alt) ? Math.round(alt) : 0);
        
        // speed in m/s -> km/h
        const kmh = speed !== null && !isNaN(speed) && speed > 0 ? Math.round(speed * 3.6) : 0;
        setSpeedKmH(kmh);
      },
      (err) => {
        console.error('GPS error:', err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    releaseWakeLock();
    setIsOnDuty(false);
    setPingStatus('idle');
  };

  // Continuous Telemetry Dispatch to Server
  useEffect(() => {
    if (!isOnDuty) {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      return;
    }

    const transmitTelemetry = async () => {
      if (!coords) return;

      setPingStatus('sending');
      const now = Date.now();
      
      const payload = {
        id: vehicleId.trim().toUpperCase(),
        driver: driverName.trim(),
        lat: Number(coords.lat.toFixed(6)),
        lon: Number(coords.lon.toFixed(6)),
        speed: speedKmH,
        bearing: heading,
        altitude: altitude,
        batt: batteryLevel,
        timestamp: now,
      };

      const query = new URLSearchParams({
        id: payload.id,
        driver: payload.driver,
        lat: payload.lat.toString(),
        lon: payload.lon.toString(),
        speed: payload.speed.toString(),
        bearing: payload.bearing.toString(),
        batt: payload.batt.toString(),
        timestamp: now.toString(),
      });

      try {
        // Ping root Traccar URL directly
        const res = await fetch(`${serverUrl}/?${query.toString()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'SantKabirFleetShield-CustomApp/1.0',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          setPingStatus('ok');
          setPacketCount(prev => prev + 1);
          setLastPingTime(new Date().toLocaleTimeString());
          
          setLogEntries(prev => [
            {
              id: Math.random().toString(36).substr(2, 6),
              time: new Date().toLocaleTimeString(),
              status: 200,
              lat: payload.lat,
              lon: payload.lon,
              speed: payload.speed,
            },
            ...prev.slice(0, 15),
          ]);
        } else {
          setPingStatus('error');
        }
      } catch (e) {
        setPingStatus('error');
      }
    };

    // First pulse immediately
    transmitTelemetry();

    // Pulse every 3 seconds
    pingIntervalRef.current = setInterval(transmitTelemetry, 3000);

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [isOnDuty, coords, speedKmH, heading, altitude, batteryLevel, vehicleId, driverName, serverUrl]);

  // Calculate live road distance to Sant Kabir Hospital Base
  const liveDistToBase = coords 
    ? calculateDistanceKm(BASE_HOSPITAL.lat, BASE_HOSPITAL.lon, coords.lat, coords.lon)
    : 0;

  // Handle Tamper Lock PIN toggle
  const handleToggleLock = () => {
    if (!isLocked) {
      setIsLocked(true);
    } else {
      setShowPinModal(true);
      setPin('');
      setPinError(false);
    }
  };

  const handleUnlockSubmit = () => {
    // Master PIN: 8722 or 1234
    if (pin === '8722' || pin === '1234') {
      setIsLocked(false);
      setShowPinModal(false);
    } else {
      setPinError(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-['Inter',sans-serif] select-none flex flex-col justify-between pb-8">
      {/* Top Navigation & Hospital Branding */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/avatar.png" 
              alt="Sant Kabir Eye Hospital" 
              className="w-10 h-10 rounded-2xl border border-sky-500/30 object-cover shadow-md"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5 font-['Outfit']">
                <span>Sant Kabir Fleet Shield</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  DRIVER
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Sant Kabir Eye Hospital • Katra, Basti
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Battery Indicator */}
            <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-full border border-slate-700 text-[11px] text-slate-300">
              <Battery className="w-3.5 h-3.5 text-emerald-400" />
              <span>{batteryLevel}%</span>
            </div>

            {/* Tamper Lock Button */}
            <button
              onClick={handleToggleLock}
              className={`p-2 rounded-xl border transition-all ${
                isLocked 
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' 
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title={isLocked ? 'Tap to Unlock' : 'Tap to Lock Duty Mode'}
            >
              {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Body Content */}
      <div className="max-w-md mx-auto w-full px-4 pt-4 space-y-4 flex-1">
        {/* Main Duty Hero Toggle */}
        <div className="relative">
          {isOnDuty && (
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-sky-500 rounded-3xl blur-lg opacity-40 animate-pulse" />
          )}
          <button
            disabled={isLocked}
            onClick={() => {
              if (isOnDuty) stopTracking();
              else startTracking();
            }}
            className={`relative w-full py-6 px-6 rounded-3xl border text-center transition-all duration-300 flex flex-col items-center justify-center gap-2 shadow-2xl cursor-pointer ${
              isOnDuty 
                ? 'bg-emerald-950/80 border-emerald-500/60 text-white' 
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            } ${isLocked ? 'opacity-85 cursor-not-allowed' : ''}`}
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isOnDuty 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/50 scale-105' 
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              <Radio className={`w-8 h-8 ${isOnDuty ? 'animate-pulse' : ''}`} />
            </div>

            <div>
              <div className="text-xl font-extrabold tracking-tight font-['Outfit']">
                {isOnDuty ? 'TRANSMITTING LIVE GPS' : 'START DUTY SHIFT'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {isOnDuty 
                  ? `Broadcasting live telemetry (${packetCount} packets sent)` 
                  : 'Tap to connect vehicle GPS to Command Center'}
              </div>
            </div>

            {isOnDuty && (
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                  ACTIVE ON HIGHWAY • {lastPingTime || 'Connecting...'}
                </span>
              </div>
            )}
          </button>
        </div>

        {/* Speedometer & Live Telemetry Gauges */}
        <div className="grid grid-cols-2 gap-3">
          {/* Speedometer */}
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-sky-400" />
              <span>Speed</span>
            </div>
            <div className="text-4xl font-black text-white font-mono mt-1">
              {speedKmH}
            </div>
            <div className="text-[10px] text-slate-500 font-semibold">KM / HOUR</div>
          </div>

          {/* Distance to Base Hospital */}
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span>To Hospital</span>
            </div>
            <div className="text-4xl font-black text-emerald-400 font-mono mt-1">
              {liveDistToBase}
            </div>
            <div className="text-[10px] text-slate-500 font-semibold">KILOMETERS ROAD</div>
          </div>
        </div>

        {/* GPS Coordinates & Accuracy Bar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 text-xs text-slate-300 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
              <span>Current Position:</span>
            </span>
            <span className="font-mono font-bold text-white">
              {coords ? `${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}` : 'Waiting for GPS...'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
            <span>Accuracy: <strong className="text-slate-200">±{accuracy || '0'}m</strong></span>
            <span>Bearing: <strong className="text-slate-200">{heading}°</strong></span>
            <span>Altitude: <strong className="text-slate-200">{altitude}m</strong></span>
          </div>
        </div>

        {/* Assigned Ambulance ID & Driver Info */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Vehicle & Driver Assignment
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Vehicle ID</label>
              <input
                disabled={isOnDuty || isLocked}
                type="text"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value.toUpperCase())}
                placeholder="SK-AMB-01"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white focus:outline-none focus:border-sky-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Driver Name</label>
              <input
                disabled={isOnDuty || isLocked}
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Driver Name"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:border-sky-500 disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Emergency Dispatch & Hospital Navigation */}
        <div className="grid grid-cols-2 gap-2">
          {/* Hotline Call */}
          <a
            href="tel:+919415140719"
            className="bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-200 rounded-2xl p-3 flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-sm"
          >
            <Phone className="w-4 h-4 text-red-400" />
            <span>Call Hospital Hotline</span>
          </a>

          {/* Turn-by-Turn Navigation */}
          <a
            href={BASE_HOSPITAL.googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="bg-sky-950/40 hover:bg-sky-900/50 border border-sky-500/40 text-sky-200 rounded-2xl p-3 flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-sm"
          >
            <Navigation className="w-4 h-4 text-sky-400" />
            <span>Navigate to Base</span>
          </a>
        </div>

        {/* Live Packet Log */}
        {logEntries.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-400 font-semibold text-[11px]">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Live Transmission Feed</span>
              </span>
              <span className="font-mono text-emerald-400">{logEntries.length} logged</span>
            </div>

            <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[10px]">
              {logEntries.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-0.5 border-b border-slate-800/60 text-slate-400">
                  <span className="text-slate-500">{log.time}</span>
                  <span className="text-slate-300">{log.lat.toFixed(4)}, {log.lon.toFixed(4)}</span>
                  <span>{log.speed} km/h</span>
                  <span className="text-emerald-400 font-bold">HTTP {log.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unlock PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Unlock Driver Console</h3>
              <p className="text-xs text-slate-400 mt-1">Enter Master PIN to adjust duty status</p>
            </div>

            <input
              type="password"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setPinError(false);
              }}
              placeholder="••••"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 text-center text-2xl font-mono tracking-widest text-white focus:outline-none focus:border-amber-400"
              autoFocus
            />

            {pinError && (
              <p className="text-xs text-red-400 font-semibold">Incorrect PIN (Hint: 8722)</p>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setShowPinModal(false)}
                className="py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlockSubmit}
                className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Provenance */}
      <div className="text-center text-[10px] text-slate-600 mt-4">
        Sant Kabir Fleet Shield • Engineered by Mani Ratan Singh (mrps.in)
      </div>
    </div>
  );
}
