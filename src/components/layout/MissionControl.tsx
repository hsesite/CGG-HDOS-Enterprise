import React, { useEffect } from 'react';
import { useHDOSStore } from '../../core/store';
import { X, Layers, AppWindow as WindowIcon } from 'lucide-react';
import { WindowId } from '../../core/types';

export const MissionControl: React.FC = () => {
  const store = useHDOSStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Space shortcut
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        store.toggleMissionControl();
      } else if (e.key === 'Escape' && store.missionControlOpen) {
        store.toggleMissionControl();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store]);

  if (!store.missionControlOpen) return null;

  const openWindows = store.windows.filter((w) => w.isOpen);

  const handleSelectWindow = (id: WindowId) => {
    store.bringToFront(id);
    store.toggleMissionControl();
  };

  return (
    <div
      onClick={() => store.toggleMissionControl()}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-2xl flex flex-col items-center justify-center p-8 animate-in fade-in duration-200"
    >
      {/* Top Header */}
      <div className="absolute top-8 flex items-center justify-between w-full max-w-5xl px-4">
        <div className="flex items-center gap-2 text-white">
          <Layers className="w-5 h-5 text-[#00E676]" />
          <h2 className="text-base font-semibold tracking-wide">Mission Control — HDOS Active Workspaces</h2>
        </div>
        <button
          onClick={() => store.toggleMissionControl()}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Windows Grid */}
      <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-12">
        {openWindows.length === 0 ? (
          <div className="col-span-full text-center py-20 text-neutral-400">
            <WindowIcon className="w-12 h-12 mx-auto mb-3 text-neutral-600" />
            <p className="text-sm">Tidak ada window yang terbuka saat ini.</p>
            <p className="text-xs text-neutral-500 mt-1">Pilih aplikasi dari Dock di bawah untuk membuka.</p>
          </div>
        ) : (
          openWindows.map((win) => (
            <div
              key={win.id}
              onClick={(e) => {
                e.stopPropagation();
                handleSelectWindow(win.id);
              }}
              className="group relative rounded-2xl apple-glass border border-white/20 p-4 hover:border-[#00E676]/60 hover:scale-[1.03] transition-all duration-200 cursor-pointer shadow-2xl bg-neutral-900/60"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#00E676]" />
                  <span className="text-xs font-semibold text-white truncate max-w-[180px]">
                    {win.title}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase">
                  {win.id}
                </span>
              </div>

              {/* Window mini visual mock preview */}
              <div className="h-32 mt-3 rounded-xl bg-black/40 border border-white/5 p-3 flex flex-col justify-between text-neutral-400 text-xs">
                <div className="space-y-1.5">
                  <div className="w-3/4 h-2 rounded bg-white/10" />
                  <div className="w-1/2 h-2 rounded bg-white/10" />
                  <div className="w-5/6 h-2 rounded bg-white/5" />
                </div>
                <div className="flex justify-between items-center text-[10px] text-neutral-500">
                  <span>HDOS Runtime</span>
                  <span className="text-[#00E676] font-medium group-hover:underline">Klik untuk Buka →</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="absolute bottom-6 text-[11px] text-neutral-400">
        Tekan <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono">Ctrl + Space</kbd> atau <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono">Esc</kbd> untuk keluar
      </div>
    </div>
  );
};
