import React, { useState } from 'react';
import {
  LayoutDashboard,
  ClipboardCheck,
  AlertTriangle,
  CheckSquare,
  ShieldAlert,
  FolderGit2,
  MapPin,
  HardHat,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { WindowId } from '../../core/types';

interface DockItem {
  id: WindowId;
  label: string;
  icon: React.ElementType;
  accentColor: string;
  badge?: number;
}

export const Dock: React.FC = () => {
  const store = useHDOSStore();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const openHazardCount = store.hazards.filter((h) => h.status === 'OPEN' || h.status === 'PICA_ISSUED').length;
  const openPicaCount = store.picas.filter((p) => p.status === 'OPEN' || p.status === 'PROGRESS').length;

  const dockItems: DockItem[] = [
    { id: 'dashboard', label: 'Dashboard Operasi', icon: LayoutDashboard, accentColor: '#00E676' },
    { id: 'inspection', label: 'Runtime Inspeksi', icon: ClipboardCheck, accentColor: '#42A5F5' },
    { id: 'hazard', label: 'Manajemen Bahaya (Hazard)', icon: AlertTriangle, accentColor: '#FF5252', badge: openHazardCount },
    { id: 'pica', label: 'PICA & Tindakan Koreksi', icon: CheckSquare, accentColor: '#FFC107', badge: openPicaCount },
    { id: 'incident', label: 'Investigasi Insiden (5-Why)', icon: ShieldAlert, accentColor: '#EF4444' },
    { id: 'repository', label: 'SMKP Dokumen Kontrol', icon: FolderGit2, accentColor: '#A855F7' },
    { id: 'map', label: 'Mining GIS & Pit Map', icon: MapPin, accentColor: '#06B6D4' },
    { id: 'contractor', label: 'Contractor Passport', icon: HardHat, accentColor: '#F59E0B' },
    { id: 'ai', label: 'AI Vision & SMKP Copilot', icon: Cpu, accentColor: '#EC4899' },
    { id: 'sync', label: 'Offline Sync & Sheets', icon: RefreshCw, accentColor: '#10B981' },
  ];

  const handleItemClick = (id: WindowId) => {
    const window = store.windows.find((w) => w.id === id);
    if (window?.isOpen && !window.isMinimized && store.focusedWindowId === id) {
      store.minimizeWindow(id);
    } else {
      store.openWindow(id);
    }
  };

  return (
    <nav
      aria-label="Application Dock"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 select-none"
    >
      <div
        className="apple-glass-dock px-3 py-2 rounded-[26px] flex items-end gap-2 border border-white/20 shadow-2xl transition-all duration-200"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {dockItems.map((item, index) => {
          const IconComponent = item.icon;
          const win = store.windows.find((w) => w.id === item.id);
          const isOpen = win?.isOpen && !win?.isMinimized;
          const isFocused = isOpen && store.focusedWindowId === item.id;

          // macOS Magnification physics calculation
          let scale = 1;
          let yOffset = 0;
          if (hoveredIndex !== null) {
            const distance = Math.abs(hoveredIndex - index);
            if (distance === 0) {
              scale = 1.35;
              yOffset = -10;
            } else if (distance === 1) {
              scale = 1.18;
              yOffset = -5;
            } else if (distance === 2) {
              scale = 1.06;
              yOffset = -2;
            }
          }

          return (
            <div
              key={item.id}
              className="relative flex flex-col items-center group cursor-pointer"
              onMouseEnter={() => setHoveredIndex(index)}
              onClick={() => handleItemClick(item.id)}
            >
              {/* Tooltip */}
              <div className="absolute -top-10 scale-0 group-hover:scale-100 transition-all duration-150 origin-bottom px-2.5 py-1 rounded-lg bg-neutral-900/90 text-white text-[11px] font-medium border border-white/10 whitespace-nowrap shadow-xl pointer-events-none z-50">
                {item.label}
              </div>

              {/* Icon Container with Zoom */}
              <button
                type="button"
                aria-label={item.label}
                style={{
                  transform: `scale(${scale}) translateY(${yOffset}px)`,
                  transition: 'transform 150ms cubic-bezier(0.2, 0.9, 0.3, 1.2)',
                }}
                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center border transition-shadow shadow-md ${
                  isFocused
                    ? 'bg-white/20 border-white/40 ring-2 ring-[#00E676]/40'
                    : 'bg-white/10 border-white/15 hover:bg-white/15 hover:border-white/30'
                }`}
              >
                <IconComponent
                  className="w-6 h-6 transition-transform"
                  style={{ color: item.accentColor }}
                />

                {/* Notification badge */}
                {Boolean(item.badge && item.badge > 0) && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-4.5 rounded-full bg-red-500 text-white text-[9px] font-black leading-none flex items-center justify-center shadow-lg border border-neutral-900">
                    {item.badge}
                  </span>
                )}
              </button>

              {/* Active App Indicator Dot */}
              <div className="h-1.5 flex items-center justify-center mt-1">
                {isOpen ? (
                  <div
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      isFocused ? 'bg-[#00E676] scale-125 shadow-[0_0_6px_#00E676]' : 'bg-white/60'
                    }`}
                  />
                ) : (
                  <div className="w-1 h-1 rounded-full bg-transparent" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
};
