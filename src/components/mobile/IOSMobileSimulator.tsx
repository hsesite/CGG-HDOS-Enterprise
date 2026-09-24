import React, { useState } from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  MapPin,
  FolderGit2,
  MoreHorizontal,
  Wifi,
  WifiOff,
  Battery,
  Signal,
  AlertTriangle,
  Plus,
  ShieldCheck,
  CheckSquare,
  Flame,
  Sun,
  X,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { hdosSync } from '../../core/sync';
import { DashboardModule } from '../modules/DashboardModule';
import { InspectionModule } from '../modules/InspectionModule';
import { HazardModule } from '../modules/HazardModule';
import { PICAModule } from '../modules/PICAModule';
import { MapModule } from '../modules/MapModule';
import { RepositoryModule } from '../modules/RepositoryModule';
import { AIModule } from '../modules/AIModule';

export const IOSMobileSimulator: React.FC = () => {
  const store = useHDOSStore();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inspection' | 'map' | 'repository' | 'pica' | 'hazard' | 'ai'>('dashboard');
  const [islandExpanded, setIslandExpanded] = useState(false);
  const online = hdosSync.getIsOnline();
  const queueCount = hdosSync.getQueue().length;

  return (
    <div className="fixed inset-0 z-40 bg-[#060608] flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
      {/* Device Frame */}
      <div className="relative w-full max-w-[420px] h-[860px] max-h-[96vh] rounded-[52px] bg-[#090909] border-[10px] border-[#222226] shadow-[0_0_80px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden">
        {/* iOS Status Bar */}
        <div className="h-11 pt-2 px-7 flex items-center justify-between text-white text-xs font-semibold select-none z-30">
          <span className="font-mono text-[13px] tracking-tight">09:20</span>

          {/* Dynamic Island (Blueprint §8) */}
          <div
            onClick={() => setIslandExpanded(!islandExpanded)}
            className={`transition-all duration-300 rounded-full bg-black border border-white/10 flex items-center justify-between px-3 cursor-pointer shadow-lg ${
              islandExpanded ? 'w-64 h-18 -mt-1 py-2' : 'w-28 h-7 -mt-1'
            }`}
          >
            {islandExpanded ? (
              <div className="w-full flex items-center justify-between text-[11px] text-white">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#00E676] animate-pulse" />
                  <div>
                    <div className="font-bold">GPS Pit Jaja KM10</div>
                    <div className="text-[9px] text-neutral-400 font-mono">UTM 51S · Elevasi +45m</div>
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] text-neutral-300">
                  <div>{online ? 'Cloud Sync' : 'Offline Mode'}</div>
                  <div className="text-amber-400">{queueCount} in queue</div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#00E676]" />
                  <span className="text-[10px] font-mono text-neutral-300">GPS</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-mono">
                  {online ? (
                    <span className="text-emerald-400">Sync</span>
                  ) : (
                    <span className="text-amber-400 font-bold">{queueCount}Q</span>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-neutral-300">
            <Signal className="w-3.5 h-3.5" />
            <Wifi className="w-3.5 h-3.5" />
            <Battery className="w-4 h-4" />
          </div>
        </div>

        {/* Scrollable Mobile Viewport */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-20 space-y-4">
          {/* Quick Switch Header */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-[#00E676] text-black font-black flex items-center justify-center text-[10px]">
                C
              </span>
              <span className="font-bold text-white">HDOS Mobile</span>
            </div>
            <button
              onClick={() => store.setMobileMode(false)}
              className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 cursor-pointer"
            >
              <span>Desktop</span>
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Dynamic Module Content inside Mobile */}
          {activeTab === 'dashboard' && <DashboardModule />}
          {activeTab === 'inspection' && <InspectionModule />}
          {activeTab === 'map' && <MapModule />}
          {activeTab === 'repository' && <RepositoryModule />}
          {activeTab === 'pica' && <PICAModule />}
          {activeTab === 'hazard' && <HazardModule />}
          {activeTab === 'ai' && <AIModule />}
        </div>

        {/* iOS Bottom Navigation Bar (Blueprint §8) */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#121216]/90 backdrop-blur-xl border-t border-white/10 flex items-center justify-around px-2 text-neutral-400 z-30 select-none">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'dashboard' ? 'text-[#00E676] font-semibold' : 'hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-[10px]">Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('inspection')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'inspection' ? 'text-[#00E676] font-semibold' : 'hover:text-white'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span className="text-[10px]">Inspeksi</span>
          </button>

          <button
            onClick={() => setActiveTab('hazard')}
            className="flex flex-col items-center -mt-5 cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#FF5252] text-white flex items-center justify-center shadow-lg border-2 border-[#121216] group-hover:scale-105 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-[10px] text-white mt-0.5 font-bold">Lapor</span>
          </button>

          <button
            onClick={() => setActiveTab('map')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'map' ? 'text-[#00E676] font-semibold' : 'hover:text-white'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span className="text-[10px]">Peta GIS</span>
          </button>

          <button
            onClick={() => setActiveTab('pica')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'pica' ? 'text-[#00E676] font-semibold' : 'hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span className="text-[10px]">PICA</span>
          </button>
        </div>

        {/* Home Indicator Bar */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/40 rounded-full z-40 pointer-events-none" />
      </div>
    </div>
  );
};
