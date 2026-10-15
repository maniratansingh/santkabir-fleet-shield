import React, { useState } from 'react';
import { 
  Bus, 
  Truck, 
  Navigation, 
  Battery, 
  BatteryWarning, 
  Clock, 
  Phone, 
  User, 
  MapPin, 
  Gauge, 
  Users,
  X,
  Radio,
  Signal,
  Eye,
  Crosshair
} from 'lucide-react';
import { calculateDistanceKm, BASE_HOSPITAL } from '../data/mockData';

export default function VehicleSidebar({ 
  vehicles, 
  camps, 
  selectedVehicleId, 
  onSelectVehicle, 
  isOpen, 
  onClose 
}) {
  const [filter, setFilter] = useState('all');

  const filteredVehicles = vehicles.filter((v) => {
    if (filter === 'moving') return v.status === 'moving' || v.status === 'returning';
    if (filter === 'camp') return v.status === 'at_camp';
    if (filter === 'base') return v.status === 'at_base';
    return true;
  });

  const getStatusBadge = (status, speed) => {
    switch (status) {
      case 'moving':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            En Route • {speed} km/h
          </span>
        );
      case 'at_camp':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            At Camp Site
          </span>
        );
      case 'returning':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span>
            Returning • {speed} km/h
          </span>
        );
      case 'at_base':
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
            Base Hospital
          </span>
        );
    }
  };

  const getVehicleIcon = (type) => {
    switch (type) {
      case 'bus':
        return <Bus className="w-5 h-5 text-indigo-400" />;
      case 'ambulance':
        return <Truck className="w-5 h-5 text-rose-400" />;
      case 'shuttle':
        return <Truck className="w-5 h-5 text-amber-400" />;
      case 'van':
      default:
        return <Truck className="w-5 h-5 text-cyan-400" />;
    }
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 10) return 'Live now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  if (!isOpen) return null;

  return (
    <aside 
      className="fixed lg:static top-[57px] md:top-[61px] bottom-0 right-0 z-20 w-80 md:w-96 glass-panel border-l border-cyan-500/20 flex flex-col transition-all duration-300 select-none shadow-2xl"
    >
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-['Outfit']">
              Outreach Fleet
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono font-semibold border border-cyan-800/40">
              {vehicles.length} Units Online
            </span>
            <button 
              onClick={onClose}
              className="lg:hidden p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-950/80 rounded-lg border border-slate-800 text-[10px] font-semibold text-center">
          <button
            onClick={() => setFilter('all')}
            className={`py-1 rounded transition-colors cursor-pointer ${filter === 'all' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            All ({vehicles.length})
          </button>
          <button
            onClick={() => setFilter('moving')}
            className={`py-1 rounded transition-colors cursor-pointer ${filter === 'moving' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            En Route ({vehicles.filter(v => v.status === 'moving' || v.status === 'returning').length})
          </button>
          <button
            onClick={() => setFilter('camp')}
            className={`py-1 rounded transition-colors cursor-pointer ${filter === 'camp' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            At Camp ({vehicles.filter(v => v.status === 'at_camp').length})
          </button>
          <button
            onClick={() => setFilter('base')}
            className={`py-1 rounded transition-colors cursor-pointer ${filter === 'base' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            Base ({vehicles.filter(v => v.status === 'at_base').length})
          </button>
        </div>
      </div>

      {/* Vehicle Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredVehicles.map((v) => {
          const isSelected = selectedVehicleId === v.id;
          const assignedCamp = camps.find(c => c.id === v.assignedCampId);
          const distToBase = calculateDistanceKm(v.lat, v.lon, BASE_HOSPITAL.lat, BASE_HOSPITAL.lon);

          return (
            <div
              key={v.id}
              onClick={() => onSelectVehicle(v.id)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                isSelected 
                  ? 'glass-panel-glow border-cyan-400 bg-slate-900/90' 
                  : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/90'
              }`}
            >
              {/* Top Row: Icon, Name & Status */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-800/90 border border-slate-700/80 group-hover:border-cyan-500/40 transition-colors">
                    {getVehicleIcon(v.type)}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">
                      {v.name}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span className="font-mono bg-slate-800 px-1.5 py-0.2 rounded text-slate-300 border border-slate-700/60 font-semibold">
                        {v.plate}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  {getStatusBadge(v.status, v.speed)}
                </div>
              </div>

              {/* Assignment & Destination */}
              <div className="my-2 px-2.5 py-2 rounded-lg bg-slate-950/60 border border-slate-800/60 text-xs">
                <div className="flex items-center gap-1.5 text-cyan-300 font-medium truncate">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">{v.destinationName || assignedCamp?.name || 'Base Hospital'}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 pl-5">
                  <span>Dist to Base: <strong className="text-slate-200">{distToBase} km</strong></span>
                  {v.patientsOnboard > 0 && (
                    <span className="text-amber-400 font-semibold flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {v.patientsOnboard} Boarded
                    </span>
                  )}
                </div>
              </div>

              {/* Team and Driver Contact */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800/70">
                <div className="flex items-center gap-1.5 truncate">
                  <User className="w-3 h-3 text-cyan-400/80 shrink-0" />
                  <span className="truncate text-slate-300">{v.assignedDoctor || 'Medical Team'}</span>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                  <a 
                    href={`tel:${v.driverPhone}`} 
                    onClick={(e) => e.stopPropagation()} 
                    className="text-emerald-400 hover:underline truncate"
                  >
                    {v.driverName}
                  </a>
                </div>
              </div>

              {/* Telemetry Bar: Speed, Battery, Cellular Signal, Ping */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/50 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-slate-500" />
                  <span>{v.speed} km/h</span>
                </div>

                <div className="flex items-center gap-1.5 font-mono">
                  {v.batt < 20 ? (
                    <BatteryWarning className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
                  ) : (
                    <Battery className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span className={v.batt < 20 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                    {v.batt}%
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] text-cyan-400/90 font-mono">
                  <Signal className="w-3 h-3 text-cyan-400" />
                  <span>{v.network || '4G'} • {v.pingMs || 35}ms</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer: Quick Legend */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70 text-[11px] text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Outreach Active</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span>Camp Stationed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
          <span>Return Trip</span>
        </div>
      </div>
    </aside>
  );
}
