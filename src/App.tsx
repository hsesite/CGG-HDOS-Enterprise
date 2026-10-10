import React, { useEffect, useState } from 'react';
import cggLogo from '../logo-cgg.png.jpeg';
import { bootHDOS } from './core/boot';
import { useHDOSStore } from './core/store';
import { MenuBar } from './components/layout/MenuBar';
import { Dock } from './components/layout/Dock';
import { WindowWrapper } from './components/layout/WindowWrapper';
import { MissionControl } from './components/layout/MissionControl';
import { IOSMobileSimulator } from './components/mobile/IOSMobileSimulator';
import { LoginScreen } from './components/auth/LoginScreen';
import { getCurrentUser, logoutUser } from './core/auth-utils';
import { AuthState } from './core/auth-state';
import { hseApi } from './core/api';

// Module Components
import { DashboardModule } from './components/modules/DashboardModule';
import { InspectionModule } from './components/modules/InspectionModule';
import { HazardModule } from './components/modules/HazardModule';
import { PICAModule } from './components/modules/PICAModule';
import { IncidentModule } from './components/modules/IncidentModule';
import { RepositoryModule } from './components/modules/RepositoryModule';
import { ContractorModule } from './components/modules/ContractorModule';
import { MapModule } from './components/modules/MapModule';
import { AIModule } from './components/modules/AIModule';
import { SyncModule } from './components/modules/SyncModule';
import { SettingsModule } from './components/modules/SettingsModule';
import { RoleVerificationPanel } from './components/modules/RoleVerificationPanel';

// Module Icons
import {
  LayoutDashboard,
  ClipboardCheck,
  AlertTriangle,
  CheckSquare,
  ShieldAlert,
  FolderGit2,
  HardHat,
  Compass,
  Cpu,
  RefreshCw,
  LogOut,
  Settings,
} from 'lucide-react';

export default function App() {
  const store = useHDOSStore();
  const [booted, setBooted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

  useEffect(() => {
    let cancelled = false;

    async function initializeApp(): Promise<void> {
      setCheckingSession(true);
      setBootError(null);

      try {
        await bootHDOS();
        if (cancelled) return;

        // Refresh server-owned role verification and company scope on every app boot.
        if (hseApi.isAuthenticated) {
          try {
            AuthState.saveUser(await hseApi.me());
          } catch (sessionRefreshError) {
            console.warn('[HDOS] Could not refresh server session profile; using cached profile.', sessionRefreshError);
          }
        }
        if (cancelled) return;

        setBooted(true);
        const user = getCurrentUser();
        setIsAuthenticated(Boolean(user));
        setCurrentUser(user);
      } catch (error) {
        if (cancelled) return;
        console.error('[HDOS] Application initialization failed:', error);
        setBootError(
          error instanceof Error
            ? error.message
            : 'Terjadi kesalahan saat menyiapkan aplikasi.'
        );
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    void initializeApp();
    return () => { cancelled = true; };
  }, [bootAttempt]);

  function handleLoggedIn(): void {
    const user = getCurrentUser();
    if (user) {
      setIsAuthenticated(true);
      setCurrentUser(user);
      setCheckingSession(false);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      await logoutUser();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsAuthenticated(false);
      setCurrentUser(null);
      AuthState.clear();
    }
  }

  if (!booted || checkingSession) {
    if (bootError && !checkingSession) {
      return (
        <div className="fixed inset-0 bg-[#090909] text-white flex flex-col items-center justify-center px-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/15 text-red-400 border border-red-400/30 font-black flex items-center justify-center text-xl">!</div>
          <div className="space-y-2 max-w-md">
            <div className="font-bold text-sm tracking-wider">HDOS BELUM SIAP DIGUNAKAN</div>
            <p className="text-sm text-neutral-300">Inisialisasi penyimpanan atau sesi aplikasi gagal.</p>
            <p className="text-xs text-neutral-500 break-words">{bootError}</p>
          </div>
          <button
            type="button"
            onClick={() => setBootAttempt((attempt) => attempt + 1)}
            className="rounded-xl bg-[#00E676] px-4 py-2.5 text-sm font-semibold text-black hover:bg-[#5cffab] focus:outline-none focus:ring-2 focus:ring-[#00E676] focus:ring-offset-2 focus:ring-offset-[#090909]"
          >
            Coba lagi
          </button>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-[#090909] text-white flex flex-col items-center justify-center space-y-4" role="status" aria-live="polite">
        <div className="w-12 h-12 rounded-2xl bg-[#00E676] text-black font-black flex items-center justify-center text-xl shadow-[0_0_30px_#00E676]">C</div>
        <div className="text-center space-y-1">
          <div className="font-bold text-sm tracking-wider">CGG HDOS ENTERPRISE v3.0</div>
          <div className="text-xs text-neutral-400 font-mono">Menyiapkan penyimpanan lokal &amp; sesi aplikasi...</div>
        </div>
        <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-[#00E676] rounded-full animate-pulse w-3/4" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }

  return (
    <div className="relative h-screen w-screen bg-[#090909] text-neutral-100 overflow-hidden select-none font-sans">
      {/* Background Operative Ambient Gradient */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 15%, rgba(0, 230, 118, 0.04) 0%, transparent 60%), radial-gradient(circle at 80% 85%, rgba(66, 165, 245, 0.03) 0%, transparent 50%)',
        }}
      />

      {/* Top macOS Menu Bar with User & Logout */}
      <div className="relative z-40 h-10 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img src={cggLogo} alt="Logo CGG" className="w-7 h-7 rounded-md object-contain bg-white/95 p-0.5" />
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400">CGG HDOS v3.0</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs text-neutral-400">
            {currentUser?.displayName} <span className="text-neutral-600">({currentUser?.email})</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg hover:bg-white/5 transition text-neutral-400 hover:text-red-400"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Floating Workspaces & Windows (Blueprint §7) */}
      <main className="relative h-[calc(100vh-2.5rem)] w-full overflow-hidden">
        {/* Dashboard Window */}
        <WindowWrapper id="dashboard" title="HDOS Executive Dashboard & Operations Center" icon={LayoutDashboard}>
          <DashboardModule />
        </WindowWrapper>

        {/* Inspection Runtime Window */}
        <WindowWrapper id="inspection" title="Inspection Runtime & Digital Forms (Blueprint §12)" icon={ClipboardCheck}>
          <InspectionModule />
        </WindowWrapper>

        {/* Hazard Module Window */}
        <WindowWrapper id="hazard" title="Hazard Management & 5x5 Mining Risk Matrix" icon={AlertTriangle}>
          <HazardModule />
        </WindowWrapper>

        {/* PICA Module Window */}
        <WindowWrapper id="pica" title="PICA & Aging Corrective Action Tracking" icon={CheckSquare}>
          <PICAModule />
        </WindowWrapper>

        {/* Incident Module Window */}
        <WindowWrapper id="incident" title="Mining Incident Investigation & 5-Why Engine" icon={ShieldAlert}>
          <IncidentModule />
        </WindowWrapper>

        {/* Repository Window */}
        <WindowWrapper id="repository" title="SMKP Master Document Control (Single Source of Truth)" icon={FolderGit2}>
          <RepositoryModule />
        </WindowWrapper>

        {/* Contractor Passport Window */}
        <WindowWrapper id="contractor" title="Contractor Passport & Compliance Registry" icon={HardHat}>
          <ContractorModule />
        </WindowWrapper>

        {/* Mining GIS Map Window */}
        <WindowWrapper id="map" title="Mining GIS & Offline Area Map" icon={Compass}>
          <MapModule />
        </WindowWrapper>

        {/* AI Vision & Assistant Window */}
        <WindowWrapper id="ai" title="HDOS AI Vision & SMKP Assistant" icon={Cpu}>
          <AIModule />
        </WindowWrapper>

        {/* Offline Queue & Sync Window */}
        <WindowWrapper id="sync" title="Offline Queue & Google Sheets Sync Engine" icon={RefreshCw}>
          <SyncModule />
        </WindowWrapper>

        <WindowWrapper id="settings" title="Pengaturan Sistem & Master Data" icon={Settings}>
          <SettingsModule />
          <RoleVerificationPanel />
        </WindowWrapper>
      </main>

      {/* macOS Dock (Blueprint §7) */}
      <Dock />

      {/* Mission Control (Ctrl+Space) */}
      <MissionControl />

      {/* iOS 18 Mobile Simulator (Blueprint §8) */}
      {store.isMobileMode && <IOSMobileSimulator />}
    </div>
  );
}
