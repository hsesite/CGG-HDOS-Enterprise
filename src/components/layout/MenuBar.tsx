import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  CloudLightning,
  Clock,
  UserCheck,
  Maximize2,
  Minimize2,
  Smartphone,
  Monitor,
  Shield,
  Layers,
  ChevronDown,
  Sun,
  AlertTriangle,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { hdosAuth, USER_PROFILES } from '../../core/auth';
import { UserRole } from '../../core/types';
import { hdosSync } from '../../core/sync';

export const MenuBar: React.FC = () => {
  const store = useHDOSStore();
  const [timeStr, setTimeStr] = useState('');
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [online, setOnline] = useState(hdosSync.getIsOnline());
  const [queueCount, setQueueCount] = useState(hdosSync.getQueue().length);
  const currentUser = hdosAuth.getCurrentUser();

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTimeStr(
        d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WITA'
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleOnline = () => {
    const newStatus = hdosSync.toggleOnlineSimulation();
    setOnline(newStatus);
    setQueueCount(hdosSync.getQueue().length);
  };

  const handleSelectRole = (role: UserRole) => {
    hdosAuth.setRole(role);
    setRoleMenuOpen(false);
  };

  return (
    <header className="relative z-50 h-10 w-full apple-menubar flex items-center justify-between px-3 text-xs text-neutral-200 select-none border-b border-white/10">
      {/* Zone 1: Apple / CGG Logo & Active Application Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-bold tracking-wide text-white">
          <span className="w-5 h-5 rounded-md bg-[#00E676] text-black font-black flex items-center justify-center text-xs shadow-sm">
            C
          </span>
          <span className="font-semibold text-white">CGG HDOS</span>
          <span className="text-[10px] text-neutral-400 font-mono">v3.0</span>
        </div>

        <div className="h-3.5 w-px bg-white/15 hidden sm:block" />

        <div className="hidden md:flex items-center gap-4 text-neutral-300">
          <button
            onClick={() => store.openWindow('dashboard')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Dashboard
          </button>
          <button
            onClick={() => store.openWindow('inspection')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Inspeksi
          </button>
          <button
            onClick={() => store.openWindow('hazard')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Hazard
          </button>
          <button
            onClick={() => store.openWindow('repository')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            SMKP Dokumen
          </button>
          <button
            onClick={() => store.openWindow('map')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            GIS Pit
          </button>
        </div>
      </div>

      {/* Zone 2: Mining Operational Status Center */}
      <div className="hidden lg:flex items-center gap-3 text-neutral-300">
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 font-mono text-[11px]">
          <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
          <span className="text-neutral-400">Safe Hours:</span>
          <span className="font-semibold text-[#00E676] tabular-nums">
            {store.safeHours.toLocaleString('id-ID')} Jam
          </span>
          <span className="text-neutral-400">LTI-Free</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px]">
          <Sun className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-neutral-300 font-mono tabular-nums">{store.weather.temp}°C</span>
          <span className="text-neutral-500">·</span>
          <span className="text-neutral-400">WBGT</span>
          <span className="text-amber-400 font-mono tabular-nums">{store.weather.wbgt}</span>
          <span className="text-neutral-500">·</span>
          <span className="text-emerald-400 font-medium">Pit Normal</span>
        </div>
      </div>

      {/* Zone 3: Controls & State Telemetry */}
      <div className="flex items-center gap-2.5">
        {/* Offline / Online Simulation Toggle */}
        <button
          onClick={handleToggleOnline}
          title={online ? 'Sistem Online - Klik untuk simulasi Offline di area blankspot Pit' : 'Sistem Offline - Klik untuk simulasi Online'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
            online
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
          }`}
        >
          {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 animate-pulse" />}
          <span className="font-medium text-[11px]">{online ? 'Online' : 'Offline'}</span>
          {queueCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-black font-bold text-[10px]">
              {queueCount}
            </span>
          )}
        </button>

        {/* Mission Control Trigger */}
        <button
          onClick={() => store.toggleMissionControl()}
          title="Mission Control (Ctrl + Space)"
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            store.missionControlOpen
              ? 'bg-[#00E676]/20 border-[#00E676]/40 text-[#00E676]'
              : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        {/* Desktop / iOS Mobile Mode Switcher */}
        <button
          onClick={() => store.setMobileMode(!store.isMobileMode)}
          title={store.isMobileMode ? 'Beralih ke Tampilan macOS Desktop' : 'Beralih ke Tampilan iOS 18 Mobile'}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
          {store.isMobileMode ? <Monitor className="w-3.5 h-3.5 text-[#00E676]" /> : <Smartphone className="w-3.5 h-3.5" />}
          <span className="text-[11px] hidden sm:inline">{store.isMobileMode ? 'Desktop' : 'Mobile'}</span>
        </button>

        {/* Role Switcher RBAC */}
        <div className="relative">
          <button
            onClick={() => setRoleMenuOpen(!roleMenuOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-neutral-200 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer"
          >
            <Shield className="w-3 h-3 text-[#00E676]" />
            <span className="font-medium text-[11px] max-w-[90px] truncate">{currentUser.role}</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </button>

          {roleMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-60 rounded-xl apple-glass p-1.5 border border-white/15 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2 py-1.5 border-b border-white/10 mb-1">
                <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Pilih Peran Pengguna (RBAC)</div>
                <div className="text-xs font-semibold text-white truncate">{currentUser.name}</div>
                <div className="text-[10px] text-neutral-400">{currentUser.badgeNumber}</div>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {(Object.keys(USER_PROFILES) as UserRole[]).map((role) => (
                  <button
                    key={role}
                    onClick={() => handleSelectRole(role)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      currentUser.role === role
                        ? 'bg-[#00E676]/20 text-[#00E676] font-medium'
                        : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span>{role}</span>
                    {currentUser.role === role && <UserCheck className="w-3.5 h-3.5 text-[#00E676]" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Time display */}
        <div className="hidden sm:flex items-center gap-1.5 text-neutral-300 text-[11px] font-mono tabular-nums pl-1">
          <Clock className="w-3.5 h-3.5 text-neutral-400" />
          <span>{timeStr}</span>
        </div>
      </div>
    </header>
  );
};
