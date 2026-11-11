import React, { Suspense, useEffect, useState } from 'react';
import cggLogo from '../../../logo-cgg.png.jpeg';
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
  ShieldAlert,
  HardHat,
  RefreshCw,
  Settings,
  LogOut,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { getCurrentUser } from '../../core/auth-utils';
import { canAccessModule, type HDOSModule } from '../../core/access-policy';
import { hdosSync } from '../../core/sync';
import { hseApi } from '../../core/api';
import {
  DashboardModule,
  InspectionModule,
  HazardModule,
  PICAModule,
  MapModule,
  RepositoryModule,
  AIModule,
  IncidentModule,
  ContractorModule,
  SyncModule,
  SettingsModule,
  RoleVerificationPanel,
} from '../modules/lazyModules';

interface IOSMobileSimulatorProps {
  onLogout: () => void;
}

export const IOSMobileSimulator: React.FC<IOSMobileSimulatorProps> = ({ onLogout }) => {
  const store = useHDOSStore();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inspection' | 'map' | 'repository' | 'pica' | 'hazard' | 'ai' | 'incident' | 'contractor' | 'sync' | 'settings'>('dashboard');
  const [islandExpanded, setIslandExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const online = hdosSync.getIsOnline();
  const queueCount = hdosSync.getQueue().length;
  const currentUser = getCurrentUser();
  const roleKey = (currentUser?.roles || []).join('|');

  // Match desktop authorization and reset stale mobile tabs after role changes.
  useEffect(() => {
    if (!canAccessModule(currentUser, activeTab)) {
      setActiveTab('dashboard');
      setMoreOpen(false);
    }
  }, [currentUser?.id, currentUser?.roleVerified, roleKey, activeTab]);

  return (
    <div className="fixed inset-0 z-[60] bg-[#060608] flex items-stretch justify-stretch overflow-hidden">
      {/* Device Frame */}
      <div className="relative w-full h-[100dvh] min-h-0 max-w-none rounded-none bg-[#090909] border-0 shadow-none flex flex-col overflow-hidden">
        {/* iOS Status Bar */}
        <div className="min-h-11 pt-[max(env(safe-area-inset-top),0.5rem)] px-4 sm:px-6 flex items-center justify-between text-white text-xs font-semibold select-none z-30">
          <span className="font-semibold text-[11px] tracking-wide">CGG HDOS</span>

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
                    <div className="font-bold">GPS belum terhubung</div>
                    <div className="text-[9px] text-neutral-400 font-mono">Lokasi demo tidak digunakan sebagai telemetry</div>
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] text-neutral-300">
                  <div>{!online ? 'Offline Mode' : hseApi.baseUrl && hseApi.isAuthenticated ? 'Cloud Sync' : 'Online lokal'}</div>
                  <div className="text-amber-400">{queueCount} in queue</div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#00E676]" />
                  <span className="text-[10px] font-mono text-neutral-300">HDOS</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-mono">
                  {online ? (
                    <span className={hseApi.baseUrl && hseApi.isAuthenticated ? 'text-emerald-400' : 'text-amber-400'}>{hseApi.baseUrl && hseApi.isAuthenticated ? 'Sync' : 'Local'}</span>
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
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 pb-24 space-y-4 overscroll-contain">
          {/* Quick Switch Header */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
            <div className="flex items-center gap-2">
              <img src={cggLogo} alt="Logo CGG" className="h-5 w-5 rounded bg-transparent object-cover" />
              <span className="font-bold text-white">HDOS Mobile</span>
            </div>
            <div className="flex items-center gap-2"><span className="text-[10px] text-neutral-500">Mode Lapangan</span><button type="button" onClick={onLogout} aria-label="Keluar dari akun" title="Keluar dari akun" className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-neutral-300 hover:bg-red-500/15 hover:text-red-300 active:bg-red-500/20"><LogOut className="h-4 w-4" /></button></div>
          </div>

          {/* Dynamic Module Content inside Mobile */}
          <Suspense fallback={<div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-neutral-400" role="status" aria-live="polite"><img src={cggLogo} alt="Logo CGG" className="h-12 w-12 rounded-xl bg-transparent object-cover animate-pulse" /><span>Memuat modul operasional...</span></div>}>
          {activeTab === 'dashboard' && canAccessModule(currentUser, 'dashboard') && <DashboardModule />}
          {activeTab === 'inspection' && canAccessModule(currentUser, 'inspection') && <InspectionModule />}
          {activeTab === 'map' && canAccessModule(currentUser, 'map') && <MapModule />}
          {activeTab === 'repository' && canAccessModule(currentUser, 'repository') && <RepositoryModule />}
          {activeTab === 'pica' && canAccessModule(currentUser, 'pica') && <PICAModule />}
          {activeTab === 'hazard' && canAccessModule(currentUser, 'hazard') && <HazardModule />}
          {activeTab === 'ai' && canAccessModule(currentUser, 'ai') && <AIModule />}
          {activeTab === 'incident' && canAccessModule(currentUser, 'incident') && <IncidentModule />}
          {activeTab === 'contractor' && canAccessModule(currentUser, 'contractor') && <ContractorModule />}
          {activeTab === 'sync' && canAccessModule(currentUser, 'sync') && <SyncModule />}
          {activeTab === 'settings' && canAccessModule(currentUser, 'settings') && <><SettingsModule /><RoleVerificationPanel /></>}
          </Suspense>
        </div>

        {/* Mobile quick access for secondary operational modules */}
        {moreOpen && (
          <div className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-40 w-56 rounded-2xl border border-white/10 bg-[#17171b]/95 p-2 shadow-2xl backdrop-blur-xl">
            {([
              ['incident', 'Investigasi Insiden', ShieldAlert],
              ['repository', 'Repository Dokumen', FolderGit2],
              ['contractor', 'Manajemen Kontraktor', HardHat],
              ['ai', 'Asisten HSE', Flame],
              ['sync', 'Sinkronisasi Data', RefreshCw],
              ['settings', 'Pengaturan', Settings],
            ] as const).filter(([tab]) => canAccessModule(currentUser, tab)).map(([tab, label, Icon]) => (
              <button key={tab} type="button" onClick={() => { setActiveTab(tab); setMoreOpen(false); }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-neutral-200 hover:bg-white/10 active:bg-white/15">
                <Icon className="h-4 w-4 text-[#00E676]" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Mobile bottom navigation */}
        <div className="absolute bottom-0 left-0 right-0 min-h-16 pb-[env(safe-area-inset-bottom)] bg-[#121216]/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-around px-1 text-neutral-400 z-30 select-none">
          {canAccessModule(currentUser, 'dashboard') && <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'dashboard' ? 'text-[#00E676] font-semibold' : 'hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-[10px]">Dashboard</span>
          </button>}

          {canAccessModule(currentUser, 'inspection') && <button
            onClick={() => setActiveTab('inspection')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'inspection' ? 'text-[#00E676] font-semibold' : 'hover:text-white'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span className="text-[10px]">Inspeksi</span>
          </button>}

          {canAccessModule(currentUser, 'hazard') && <button
            onClick={() => setActiveTab('hazard')}
            className="flex flex-col items-center -mt-5 cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-full bg-[#FF5252] text-white flex items-center justify-center shadow-lg border-2 border-[#121216] group-hover:scale-105 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-[10px] text-white mt-0.5 font-bold">Lapor</span>
          </button>}

          {canAccessModule(currentUser, 'map') && <button
            onClick={() => setActiveTab('map')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'map' ? 'text-[#00E676] font-semibold' : 'hover:text-white'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span className="text-[10px]">Peta GIS</span>
          </button>}

          {canAccessModule(currentUser, 'pica') && <button
            onClick={() => setActiveTab('pica')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${
              activeTab === 'pica' ? 'text-[#00E676] font-semibold' : 'hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span className="text-[10px]">PICA</span>
          </button>}
          {(['incident', 'repository', 'contractor', 'ai', 'sync', 'settings'] as HDOSModule[]).some(tab => canAccessModule(currentUser, tab)) && <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-label="Modul lainnya"
            className={`flex flex-col items-center gap-0.5 cursor-pointer ${moreOpen ? 'text-[#00E676]' : 'hover:text-white'}`}
          >
            <MoreHorizontal className="w-4 h-4" />
            <span className="text-[10px]">Lainnya</span>
          </button>}
        </div>

        {/* Home Indicator Bar */}
        
      </div>
    </div>
  );
};
