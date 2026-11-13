import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import MapView from './components/MapView';
import DynamicIsland from './components/DynamicIsland';
import FloatingControls from './components/FloatingControls';
import AppleSheet from './components/AppleSheet';
import DriverSetupModal from './components/DriverSetupModal';
import ProvisioningQrModal from './components/ProvisioningQrModal';
import MobileNav from './components/MobileNav';
import { BASE_HOSPITAL } from './data/mockData';
import { ACTIVE_FLEET } from './data/activeFleet';
import { simulateFleetAtTime } from './utils/fleetSimulation';
import { getDeliveryRouteSplit, subscribeToRouteUpdates } from './utils/roadDistance';
import { getNearestRuralLocation } from './utils/ruralLocator';
import { getUniqueVehicleColor } from './utils/colors';
import { withVehicleAgeState } from './utils/vehicleState';
import { canonicalVehicleId } from './utils/vehicleId';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

// Demo fleet identity: one name only. The driver name is the device id.
function toDriverFleet(fleet) {
  return fleet.map((v) => {
    const name = String(v.driverName || v.id || '').trim();
    if (!name) return v;
    return { ...v, id: name, name, driverName: '', driverPhone: '', plate: name };
  });
}

export default function App() {

  // Demo simulation mode (OFF by default on refresh; click wand button or use ?demo to activate)
  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.has('dev') || params.has('demo');
    }
    return false;
  });

  const [vehicles, setVehicles] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('dev') || params.has('demo')) {
        return toDriverFleet(simulateFleetAtTime(ACTIVE_FLEET, Date.now()));
      }
    }
    return [];
  });

  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [provisionModalVehicleId, setProvisionModalVehicleId] = useState(null);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [detent, setDetent] = useState('peek'); // Default minimized to peek capsule
  const [fleetFilter, setFleetFilter] = useState('all');
  const [sharedVehicleId, setSharedVehicleId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('vehicle') || '';
  });
  const sharedId = canonicalVehicleId(sharedVehicleId);
  const displayVehicles = useMemo(
    () => (sharedId ? vehicles.filter((v) => canonicalVehicleId(v.id) === sharedId) : vehicles),
    [vehicles, sharedId]
  );
  const [isAutoTour, setIsAutoTour] = useState(true); // Default TV Wallboard Auto-Tour ON
  const [pinnedVehicleIds, setPinnedVehicleIds] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = JSON.parse(localStorage.getItem('sk_pinned_vehicles') || '[]');
      return Array.isArray(saved) ? saved.map((id) => canonicalVehicleId(id)).filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  });
  const pinnedVehiclesRef = useRef(new Set(pinnedVehicleIds));
  const [fitTrigger, setFitTrigger] = useState(0);
  const [actionTrigger, setActionTrigger] = useState(null);
  const [showDistanceLines, setShowDistanceLines] = useState(true);
  const [toast, setToast] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting'); // connecting | live | polling | offline | demo
  const fleetStoreRef = useRef(new Map(
    typeof window !== 'undefined' && (new URLSearchParams(window.location.search).has('dev') || new URLSearchParams(window.location.search).has('demo'))
      ? toDriverFleet(simulateFleetAtTime(ACTIVE_FLEET, Date.now())).map(v => [v.id, v])
      : []
  ));

  // Theme Management (Dark Canvas default for high-contrast fleet command wallboard)
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sk_theme');
      if (saved) return saved;
      return 'dark';
    }
    return 'dark';
  });

  const [activeStyleKey, setActiveStyleKey] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sk_theme');
      if (saved) return saved;
      return 'dark';
    }
    return 'dark';
  });

  // Synchronize <html> class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('sk_theme', theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#060d17' : '#f1f5f9');
    if (activeStyleKey === 'light' || activeStyleKey === 'dark') {
      setActiveStyleKey(theme === 'dark' ? 'dark' : 'light');
    }
  }, [theme]);

  // TV wallboard mode: auto-tour is a kiosk view. The map animates markers and
  // tiles continuously, so blurred glass re-blurs every frame on TV GPUs.
  // Use opaque panels instead while the kiosk tour is running.
  useEffect(() => {
    document.documentElement.classList.toggle('tv-wallboard', isAutoTour);
  }, [isAutoTour]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const tourIndexRef = useRef(0);
  const vehiclesRef = useRef(vehicles);
  const wsConnectedRef = useRef(false);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  useEffect(() => {
    pinnedVehiclesRef.current = new Set(pinnedVehicleIds);
    try {
      localStorage.setItem('sk_pinned_vehicles', JSON.stringify(pinnedVehicleIds));
    } catch (error) {
      // ignore storage errors
    }
  }, [pinnedVehicleIds]);

  const handleTogglePin = useCallback((id) => {
    const target = canonicalVehicleId(id);
    if (!target) return;
    setPinnedVehicleIds((previous) =>
      previous.includes(target)
        ? previous.filter((item) => item !== target)
        : [...previous, target]
    );
  }, []);

  // Keep age-derived state fresh while the wallboard sits idle. This moves a
  // quiet vehicle from live -> no signal -> parked -> offline without needing
  // a new GPS packet.
  useEffect(() => {
    if (isDemoMode) return undefined;
    const interval = setInterval(() => {
      setVehicles((prev) => prev.map((v) => withVehicleAgeState(v, Date.now())));
    }, 30000);
    return () => clearInterval(interval);
  }, [isDemoMode]);

  // Show temporary toast notification
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Keyboard shortcut listener (ESC to deselect)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedVehicleId(null);
        setFitTrigger(prev => prev + 1);
        setIsDriverModalOpen(false);
        setIsAutoTour(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // TV Kiosk Auto-Tour Mode (Continuous monitoring: adaptive pacing for active vs blind spot cars)
  useEffect(() => {
    if (!isAutoTour) return;

    let timeoutId;

    const runTourStep = () => {
      const allVehicles = vehiclesRef.current || [];
      const pinned = pinnedVehiclesRef.current;
      const pinnedActive = pinned.size > 0;
      // Offline records keep their name and last position, but the TV tour
      // should only visit vehicles that are actually reporting.
      const reporting = allVehicles.filter((v) => !v.isOffline);
      const currentVehicles = pinnedActive
        ? reporting.filter((v) => pinned.has(canonicalVehicleId(v.id)))
        : reporting;

      if (!currentVehicles || currentVehicles.length === 0) {
        setSelectedVehicleId(null);
        setFitTrigger(prev => prev + 1);
        setDetent('peek');
        showToast(
          pinnedActive
            ? 'TV auto-tour: pinned vehicle is offline'
            : 'TV auto-tour: hospital base standby',
          'info'
        );
        timeoutId = setTimeout(runTourStep, 8000);
        return;
      }

      // Normal mode alternates vehicle close-up and fleet overview.
      // Pinned mode follows only the pinned vehicles, with no overview cut-away.
      const tourItems = [];
      currentVehicles.forEach((v) => {
        tourItems.push({
          type: 'vehicle',
          id: v.id,
          name: v.name,
          driver: v.driverName,
          isSignalGap: Boolean(v.isSignalGap),
          gapMinutes: v.gapMinutes || 1,
        });
        if (!pinnedActive) {
          tourItems.push({ type: 'all', name: 'Fleet Overview' });
        }
      });

      tourIndexRef.current = (tourIndexRef.current + 1) % tourItems.length;
      const current = tourItems[tourIndexRef.current];

      let nextDelay = 8500;

      if (current.type === 'vehicle') {
        setSelectedVehicleId(current.id);
        setDetent('peek'); // keep UI minimal during TV auto-tour
        nextDelay = current.isSignalGap ? 5000 : 8500;
      } else {
        setSelectedVehicleId(null);
        setFitTrigger(prev => prev + 1);
        setDetent('peek');
        nextDelay = 6000;
      }

      timeoutId = setTimeout(runTourStep, nextDelay);
    };

    timeoutId = setTimeout(runTourStep, 2000);
    return () => clearTimeout(timeoutId);
  }, [isAutoTour, pinnedVehicleIds]);

  // Unified Telemetry Sync & Continuous High-Fidelity Road Cruising Engine
  useEffect(() => {
    let isSubscribed = true;
    setConnectionState(isDemoMode ? 'demo' : 'connecting');

    const syncFleet = async () => {
      const now = Date.now();
      const store = fleetStoreRef.current;
      const isLocal = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      let serverVehicles = null;
      try {
        const vehRes = await fetch('/api/vehicles').catch(() => null);
        if (vehRes && vehRes.ok) {
          const vehData = await vehRes.json();
          const list = Array.isArray(vehData) ? vehData : (vehData.vehicles || []);
          if (Array.isArray(list) && list.length > 0) {
            serverVehicles = list;
          }
          if (!isDemoMode) {
            setConnectionState(wsConnectedRef.current ? 'live' : 'polling');
          }
        } else if (!isDemoMode && !wsConnectedRef.current) {
          setConnectionState('offline');
        }
      } catch (err) {
        // Backend API offline
        if (!isDemoMode && !wsConnectedRef.current) setConnectionState('offline');
      }

      if (!isSubscribed) return;

      // PRIORITY 1: Real-time Telemetry reported to /api/vehicles
      if (serverVehicles && serverVehicles.length > 0) {
        const liveIds = new Set(serverVehicles.map(v => canonicalVehicleId(v.id)));

        // Synchronize store with reported server vehicles
        for (const storedId of Array.from(store.keys())) {
          if (!liveIds.has(storedId)) {
            store.delete(storedId);
          }
        }

        serverVehicles.forEach(liveV => {
          const id = canonicalVehicleId(liveV.id);
          if (!id) return;
          const existing = store.get(id) || {};
          const colors = getUniqueVehicleColor(id);

          const merged = {
            ...existing,
            ...liveV,
            id,
            name: id,
            lineColor: liveV.lineColor || existing.lineColor || colors.line,
            glowColor: liveV.glowColor || existing.glowColor || colors.glow,
            driverName: liveV.driverName || existing.driverName || '',
            villageName: liveV.villageName || existing.villageName || 'Sant Kabir Eye Hospital Base (Basti)',
            villageBlock: liveV.villageBlock || existing.villageBlock || 'Basti Sadar',
            villageDistrict: liveV.villageDistrict || existing.villageDistrict || 'Basti',
            villageBadge: liveV.villageBadge || existing.villageBadge || 'Base Station',
            villageLabel: liveV.villageLabel || existing.villageLabel || 'Sant Kabir Eye Hospital',
            highwayName: liveV.highwayName || existing.highwayName || liveV.villageBadge || 'Highway Link',
            roadDistFromBaseKm: liveV.roadDistFromBaseKm || existing.roadDistFromBaseKm || 0,
            lastSeen: liveV.lastSeen || existing.lastSeen || now,
          };

          store.set(id, withVehicleAgeState(merged, now));
        });

        setVehicles(
          Array.from(store.values()).sort((a, b) => 
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
          )
        );
        return;
      }

      // PRIORITY 2: Explicit Demo Mode simulation (User activated via wand or ?demo)
      if (isDemoMode) {
        const simulated = toDriverFleet(simulateFleetAtTime(ACTIVE_FLEET, now));
        const simIds = new Set(simulated.map(v => v.id));

        // Clean any stale vehicles not in ACTIVE_FLEET
        for (const storedId of Array.from(store.keys())) {
          if (!simIds.has(storedId)) {
            store.delete(storedId);
          }
        }

        simulated.forEach(simV => {
          const existing = store.get(simV.id) || {};
          store.set(simV.id, {
            ...existing,
            ...simV,
            lastSeen: now,
          });
        });

        setVehicles(
          Array.from(store.values()).sort((a, b) => 
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
          )
        );
        return;
      }

      // PRIORITY 3: Production Clean Blank Sheet (0 cars reporting)
      store.clear();
      setVehicles([]);
    };

    syncFleet();
    const interval = setInterval(() => {
      // When the Durable Object WebSocket is live, polling is only a fallback.
      if (!wsConnectedRef.current || isDemoMode) syncFleet();
    }, isDemoMode ? 2000 : 10000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [isDemoMode]);

  // Event-driven fleet updates over the Durable Object WebSocket hub.
  // HTTPS deployments connect by default; local HTTP needs ?ws=1.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    const enableWs = window.location.protocol === 'https:' || params.has('ws');
    if (!enableWs) return undefined;

    let closed = false;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let reconcileTimer = null;
    let attempt = 0;
    let socket = null;

    const upsertVehicle = (liveV, now) => {
      if (!liveV || !liveV.id) return;
      const id = canonicalVehicleId(liveV.id);
      if (!id) return;
      const store = fleetStoreRef.current;
      const existing = store.get(id) || {};
      const colors = getUniqueVehicleColor(id);

      const merged = {
        ...existing,
        ...liveV,
        id,
        name: id,
        lineColor: liveV.lineColor || existing.lineColor || colors.line,
        glowColor: liveV.glowColor || existing.glowColor || colors.glow,
        driverName: liveV.driverName || existing.driverName || '',
        villageName: liveV.villageName || existing.villageName || 'Sant Kabir Eye Hospital Base (Basti)',
        villageBlock: liveV.villageBlock || existing.villageBlock || 'Basti Sadar',
        villageDistrict: liveV.villageDistrict || existing.villageDistrict || 'Basti',
        villageBadge: liveV.villageBadge || existing.villageBadge || 'Base Station',
        villageLabel: liveV.villageLabel || existing.villageLabel || 'Sant Kabir Eye Hospital',
        highwayName: liveV.highwayName || existing.highwayName || liveV.villageBadge || 'Highway Link',
        roadDistFromBaseKm: liveV.roadDistFromBaseKm || existing.roadDistFromBaseKm || 0,
        lastSeen: liveV.lastSeen || existing.lastSeen || now,
      };

      // Always recompute live/no-signal/parked/offline from the packet age.
      // Never trust the stored isLive flag, which is stale after quiet time.
      store.set(id, withVehicleAgeState(merged, now));
    };

    const publish = () => {
      setVehicles(
        Array.from(fleetStoreRef.current.values()).sort((a, b) =>
          String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
        )
      );
    };

    const handleMessage = (event) => {
      if (isDemoMode) return;
      let payload;
      try { payload = JSON.parse(event.data); } catch (e) { return; }
      const now = Date.now();

      if (payload?.type === 'snapshot' && Array.isArray(payload.vehicles)) {
        const store = fleetStoreRef.current;
        const liveIds = new Set(payload.vehicles.map(v => canonicalVehicleId(v.id)).filter(Boolean));
        for (const id of Array.from(store.keys())) {
          if (!liveIds.has(id)) store.delete(id);
        }
        payload.vehicles.forEach(v => upsertVehicle(v, now));
        setSelectedVehicleId((current) => (current && !liveIds.has(current) ? null : current));
        publish();
      } else if (payload?.type === 'delta' && payload.vehicle) {
        upsertVehicle(payload.vehicle, now);
        publish();
      } else if (payload?.type === 'remove' && Array.isArray(payload.ids)) {
        const ids = payload.ids.map(String);
        for (const id of ids) {
          fleetStoreRef.current.delete(id);
        }
        setSelectedVehicleId((current) => (current && ids.includes(current) ? null : current));
        publish();
      } else if (payload?.type === 'clear') {
        fleetStoreRef.current.clear();
        setVehicles([]);
      }
    };

    const connect = () => {
      if (closed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`);

      socket.onopen = () => {
        attempt = 0;
        wsConnectedRef.current = true;
        if (!isDemoMode) setConnectionState('live');
        try { socket.send(JSON.stringify({ type: 'subscribe' })); } catch (e) {}
        heartbeatTimer = setInterval(() => {
          try { socket.send('ping'); } catch (e) {}
        }, 25000);
        // Periodic snapshot reconciliation removes browser-side ghosts: if an
        // id no longer exists in the Durable Object, drop it from the board.
        reconcileTimer = setInterval(() => {
          try {
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'subscribe' }));
            }
          } catch (e) {}
        }, 60000);
      };
      socket.onmessage = handleMessage;
      socket.onerror = () => {};
      socket.onclose = () => {
        wsConnectedRef.current = false;
        if (!isDemoMode) setConnectionState('polling');
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (reconcileTimer) {
          clearInterval(reconcileTimer);
          reconcileTimer = null;
        }
        if (!closed) {
          attempt += 1;
          const delay = Math.min(15000, 1000 * (2 ** Math.min(attempt, 4)));
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      wsConnectedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconcileTimer) clearInterval(reconcileTimer);
      if (socket) {
        try { socket.close(); } catch (e) {}
      }
    };
  }, [isDemoMode]);

  // Subscribe to background-resolved rural turn-by-turn routes (OSM)
  useEffect(() => {
    const unsubscribe = subscribeToRouteUpdates((key, coords) => {
      setVehicles(prevVehicles =>
        prevVehicles.map(v => {
          const vKey = `${Number(v.lon || 0).toFixed(3)},${Number(v.lat || 0).toFixed(3)}`;
          if (vKey === key) {
            const split = getDeliveryRouteSplit({ ...v, routeWaypoints: coords });
            return {
              ...v,
              routeWaypoints: coords,
              highwayName: 'Turn-by-Turn Rural Road Network (OSM)',
              roadDistFromBaseKm: split.roadDistFromBaseKm,
            };
          }
          return v;
        })
      );
    });
    return unsubscribe;
  }, []);

  // Action Triggers with stable references
  const handleZoomIn = useCallback(() => {
    setActionTrigger({ type: 'zoomIn', timestamp: Date.now() });
  }, []);

  const handleZoomOut = useCallback(() => {
    setActionTrigger({ type: 'zoomOut', timestamp: Date.now() });
  }, []);

  const handleFitAll = useCallback(() => {
    setSelectedVehicleId(null);
    setActionTrigger({ type: 'fitAll', timestamp: Date.now() });
    const count = vehiclesRef.current?.length || 0;
    showToast(count > 0 ? `Overview: ${count} ambulances & base hospital` : 'Overview: hospital base standby', 'info');
  }, []);

  const handleResetNorth = useCallback(() => {
    setActionTrigger({ type: 'resetNorth', timestamp: Date.now() });
    showToast('Compass reset to true north', 'info');
  }, []);

  const handleCenterBase = useCallback(() => {
    setSelectedVehicleId(null);
    setActionTrigger({ type: 'centerBase', timestamp: Date.now() });
    showToast('Centered on Sant Kabir Hospital base', 'info');
  }, []);

  const handleToggleAutoTour = useCallback(() => {
    setIsAutoTour(prev => {
      const next = !prev;
      showToast(next ? 'TV wallboard auto-tour started' : 'TV auto-tour stopped', 'info');
      return next;
    });
  }, []);

  const handleToggleDemoMode = useCallback(() => {
    setIsDemoMode(prev => {
      const next = !prev;
      if (next) {
        const demoFleet = toDriverFleet(simulateFleetAtTime(ACTIVE_FLEET, Date.now()));
        fleetStoreRef.current = new Map(demoFleet.map(v => [v.id, v]));
        setVehicles(demoFleet);
        showToast('Demo mode: 10 ambulances loaded', 'info');
      } else {
        fleetStoreRef.current.clear();
        setVehicles([]);
        showToast('Live mode: waiting for real telemetry', 'info');
      }
      return next;
    });
  }, []);

  const handleSelectVehicle = useCallback((id) => {
    setSelectedVehicleId(id);
    if (!id) {
      setFitTrigger(prev => prev + 1);
    }
  }, []);

  const sharedAutoSelectedRef = useRef(false);


  useEffect(() => {
    if (!sharedId) {
      sharedAutoSelectedRef.current = false;
      return;
    }
    setIsAutoTour(false);
    setDetent('peek');
  }, [sharedId]);

  useEffect(() => {
    if (!sharedId) return;
    const match = vehicles.find((v) => canonicalVehicleId(v.id) === sharedId);
    if (match && !sharedAutoSelectedRef.current) {
      sharedAutoSelectedRef.current = true;
      setSelectedVehicleId(match.id);
      setFitTrigger((prev) => prev + 1);
    }
  }, [sharedId, vehicles]);

  const handleShareVehicle = useCallback(async (id) => {
    const target = canonicalVehicleId(id);
    if (!target) return;
    const url = `${window.location.origin}/?vehicle=${encodeURIComponent(target)}`;
    const shareData = {
      title: `${target} — live tracking`,
      text: `Track ${target} live — Sant Kabir Fleet Shield`,
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Tracking link copied — paste it in WhatsApp', 'info');
    } catch (error) {
      window.prompt('Copy this tracking link', url);
    }
  }, []);

  const handleToggleDistanceLines = useCallback(() => {
    setShowDistanceLines(prev => !prev);
  }, []);

  const handleResetView = useCallback(() => {
    setFitTrigger(prev => prev + 1);
  }, []);

  const handleOpenProvisionModal = useCallback((id) => {
    setProvisionModalVehicleId(id || 'AMB-01');
  }, []);

  // Manual removal for test devices, uninstalled phones, renamed drivers and
  // ghosts. Requires the admin key; remembered for this browser session only.
  const handleRemoveVehicle = useCallback(async (id) => {
    const target = canonicalVehicleId(id);
    if (!target) return;

    let adminKey = '';
    try {
      adminKey = sessionStorage.getItem('sk_admin_key') || '';
    } catch (e) {}
    if (!adminKey) {
      adminKey = window.prompt(`Admin key required to remove ${target}`) || '';
    }
    if (!adminKey) return;

    try {
      const res = await fetch(`/api/remove?id=${encodeURIComponent(target)}`, {
        method: 'POST',
        headers: { 'X-Admin-Key': adminKey },
      });
      if (res.status === 401) {
        try { sessionStorage.removeItem('sk_admin_key'); } catch (e) {}
        showToast('Admin key rejected', 'alert');
        return;
      }
      if (!res.ok) {
        showToast('Could not remove driver record', 'alert');
        return;
      }
      try { sessionStorage.setItem('sk_admin_key', adminKey); } catch (e) {}
      fleetStoreRef.current.delete(target);
      setVehicles((prev) => prev.filter((v) => canonicalVehicleId(v.id) !== target));
      setSelectedVehicleId((prev) => (prev === target ? null : prev));
      showToast(`${target} removed`, 'info');
    } catch (e) {
      showToast('Remove failed — network error', 'alert');
    }
  }, []);

  const handleOpenMap = useCallback(() => {
    setDetent('peek');
  }, []);

  const handleOpenFleet = useCallback(() => {
    setSelectedVehicleId(null);
    setFleetFilter('all');
    setDetent('half');
  }, []);

  const handleOpenAlerts = useCallback(() => {
    setSelectedVehicleId(null);
    setFleetFilter('nosignal');
    setDetent('half');
  }, []);

  // Apple Sheet Action Handlers
  const handleLocateVehicle = useCallback(() => {
    if (selectedVehicleId) {
      setActionTrigger({ type: 'locateVehicle', vehicleId: selectedVehicleId, timestamp: Date.now() });
      showToast('Camera focused on vehicle', 'info');
    }
  }, [selectedVehicleId]);

  const handleFitRoute = useCallback(() => {
    if (selectedVehicleId) {
      setActionTrigger({ type: 'fitRoute', vehicleId: selectedVehicleId, timestamp: Date.now() });
      showToast('Framing corridor to base', 'info');
    }
  }, [selectedVehicleId]);

  const handleFocusRoute = useCallback(() => {
    handleFitRoute();
  }, [handleFitRoute]);

  const handleFocusDistance = useCallback(() => {
    setShowDistanceLines(true);
    showToast('Distance vectors shown', 'info');
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-100 dark:bg-slate-900 select-none">
      {/* 1. Full-Bleed Edge-to-Edge Map Canvas */}
      <MapView
        vehicles={displayVehicles}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={handleSelectVehicle}
        fitTrigger={fitTrigger}
        actionTrigger={actionTrigger}
        theme={theme}
        activeStyleKey={activeStyleKey}
        onStyleChange={setActiveStyleKey}
        showDistanceLines={showDistanceLines}
        onToggleDistanceLines={handleToggleDistanceLines}
        onResetView={handleResetView}
        isSheetMinimized={detent === 'peek'}
      />

      {/* 2. Top-Center Dynamic Island Status Capsule */}
      <DynamicIsland
        vehicles={displayVehicles}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenDriverModal={() => setIsDriverModalOpen(true)}
        onOpenFleet={handleOpenFleet}
        connectionState={connectionState}
      />

      {/* 3. Top-Right Floating Controls Stack */}
      <FloatingControls
        activeStyleKey={activeStyleKey}
        onSelectStyle={setActiveStyleKey}
        onResetNorth={handleResetNorth}
        onCenterBase={handleCenterBase}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitAll={handleFitAll}
        showDistanceLines={showDistanceLines}
        onToggleDistanceLines={handleToggleDistanceLines}
        isAutoTour={isAutoTour}
        onToggleAutoTour={handleToggleAutoTour}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
      />

      {/* Mobile-only bottom navigation and More sheet */}
      <MobileNav
        vehicleCount={displayVehicles.length}
        onOpenMap={handleOpenMap}
        onOpenFleet={handleOpenFleet}
        onOpenAlerts={handleOpenAlerts}
        onFitAll={handleFitAll}
        onCenterBase={handleCenterBase}
        onResetNorth={handleResetNorth}
        showDistanceLines={showDistanceLines}
        onToggleDistanceLines={handleToggleDistanceLines}
        activeStyleKey={activeStyleKey}
        onSelectStyle={setActiveStyleKey}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
        isAutoTour={isAutoTour}
        onToggleAutoTour={handleToggleAutoTour}
      />

      {/* 4. Bottom-Left Floating Apple Sheet */}
      <AppleSheet
        vehicles={displayVehicles}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={handleSelectVehicle}
        onFocusRoute={handleFocusRoute}
        onLocateVehicle={handleLocateVehicle}
        onFitRoute={handleFitRoute}
        onFocusDistance={handleFocusDistance}
        onOpenProvisionModal={handleOpenProvisionModal}
        onRemoveVehicle={handleRemoveVehicle}
        onShareVehicle={handleShareVehicle}
        sharedView={Boolean(sharedId)}
        pinnedVehicleIds={pinnedVehicleIds}
        onTogglePin={handleTogglePin}
        detent={detent}
        onChangeDetent={setDetent}
        filter={fleetFilter}
        onChangeFilter={setFleetFilter}
        connectionState={connectionState}
      />

      {/* 5. Dynamic Island Toast Notifications */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-[4.5rem] left-1/2 -translate-x-1/2 z-50 glass-panel px-4 py-2 rounded-full border border-slate-200/90 dark:border-white/10 flex items-center gap-2.5 shadow-xl animate-in slide-in-from-top duration-300 max-w-[90vw]"
        >
          {toast.type === 'alert' ? (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-900 dark:text-white">{toast.message}</span>
          <button 
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="p-2 -mr-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 6. Android Provisioning Center Modal (Master Integration Spec) */}
      <ProvisioningQrModal
        isOpen={Boolean(provisionModalVehicleId)}
        onClose={() => setProvisionModalVehicleId(null)}
        initialVehicleId={provisionModalVehicleId}
      />

      {/* 7. Live Telemetry & Tracker Stream Modal */}
      <DriverSetupModal 
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
      />
    </div>
  );
}
