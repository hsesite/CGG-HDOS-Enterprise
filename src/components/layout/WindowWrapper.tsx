import React from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { WindowId } from '../../core/types';

interface WindowWrapperProps {
  id: WindowId;
  title: string;
  children: React.ReactNode;
  icon?: React.ElementType;
}

export const WindowWrapper: React.FC<WindowWrapperProps> = ({ id, title, children, icon: Icon }) => {
  const store = useHDOSStore();
  const win = store.windows.find((w) => w.id === id);

  if (!win || !win.isOpen || win.isMinimized) {
    return null;
  }

  const isFocused = store.focusedWindowId === id;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.closeWindow(id);
  };

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.minimizeWindow(id);
  };

  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.toggleMaximizeWindow(id);
  };

  const handleFocus = () => {
    store.bringToFront(id);
  };

  return (
    <div
      onClick={handleFocus}
      style={{
        zIndex: win.zIndex,
      }}
      className={`fixed transition-all duration-200 select-auto flex flex-col ${
        win.isMaximized
          ? 'top-10 left-0 right-0 bottom-20 rounded-none'
          : 'top-12 left-4 right-4 sm:left-12 sm:right-12 lg:left-24 lg:right-24 bottom-22 rounded-[24px]'
      } apple-glass border border-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden`}
    >
      {/* macOS Traffic Lights Header */}
      <div
        onDoubleClick={handleMaximize}
        className={`h-11 px-4 flex items-center justify-between border-b border-white/10 select-none cursor-default transition-colors ${
          isFocused ? 'bg-white/[0.07]' : 'bg-white/[0.03]'
        }`}
      >
        {/* Traffic lights */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleClose}
            title="Tutup (Close)"
            className="w-3.5 h-3.5 rounded-full bg-[#FF5F56] hover:brightness-110 border border-black/20 flex items-center justify-center group cursor-pointer"
          >
            <X className="w-2.5 h-2.5 text-black/70 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button
            onClick={handleMinimize}
            title="Minimalkan (Minimize)"
            className="w-3.5 h-3.5 rounded-full bg-[#FFBD2E] hover:brightness-110 border border-black/20 flex items-center justify-center group cursor-pointer"
          >
            <Minus className="w-2.5 h-2.5 text-black/70 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <button
            onClick={handleMaximize}
            title="Maksimalkan (Zoom)"
            className="w-3.5 h-3.5 rounded-full bg-[#27C93F] hover:brightness-110 border border-black/20 flex items-center justify-center group cursor-pointer"
          >
            <Maximize2 className="w-2 h-2 text-black/70 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          <span className="text-white/20 text-xs ml-2 hidden sm:inline">|</span>
          <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline">
            CGG-HDOS://{id}
          </span>
        </div>

        {/* Window Title */}
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-200">
          {Icon && <Icon className="w-4 h-4 text-[#00E676]" />}
          <span className="truncate max-w-[200px] sm:max-w-md">{title}</span>
        </div>

        {/* Right side controls/indicators */}
        <div className="flex items-center gap-2 text-[11px] text-neutral-400">
          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] uppercase font-mono">
            Mining Locked
          </span>
        </div>
      </div>

      {/* Window Body Canvas */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 bg-black/40 text-neutral-100">
        {children}
      </div>
    </div>
  );
};
