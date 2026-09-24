import React, { useState } from 'react';
import {
  MapPin,
  Compass,
  Layers,
  Flame,
  AlertTriangle,
  ClipboardCheck,
  CheckCircle,
  Eye,
  Sliders,
  Navigation,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { MiningLocationGIS } from '../../core/types';

interface MapMarker {
  id: string;
  name: string;
  type: 'HAZARD' | 'INSPECTION' | 'PICA' | 'CLOSED';
  x: number; // percentage on map
  y: number;
  label: string;
  detail: string;
}

export const MapModule: React.FC = () => {
  const store = useHDOSStore();
  const [selectedLocation, setSelectedLocation] = useState<MiningLocationGIS>(store.locations[0]);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'HAZARD' | 'INSPECTION' | 'PICA'>('ALL');
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);

  // Concrete markers across the mining concession coordinates
  const markers: MapMarker[] = [
    {
      id: 'm1',
      name: 'Pit Jaja KM10 - Bench 4',
      type: 'HAZARD',
      x: 28,
      y: 62,
      label: 'HAZ-2026-042',
      detail: 'Unit HD785 parkir turunan tanpa wheel chock',
    },
    {
      id: 'm2',
      name: 'Pit Jaja KM10 - Highwall',
      type: 'INSPECTION',
      x: 22,
      y: 55,
      label: 'INS-2026-080',
      detail: 'Inspeksi Kestabilan Lereng (Pass 100%)',
    },
    {
      id: 'm3',
      name: 'Central Workshop - Bay 2',
      type: 'PICA',
      x: 52,
      y: 42,
      label: 'PICA-2026-099',
      detail: 'Tarik APAR No. 04 untuk pengisian ulang tekanan',
    },
    {
      id: 'm4',
      name: 'Fuel Bay - Dispenser B',
      type: 'HAZARD',
      x: 48,
      y: 48,
      label: 'HAZ-2026-041',
      detail: 'Ceceran pelumas hidrolik di jalur pompa',
    },
    {
      id: 'm5',
      name: 'Siumbatu Jetty Loading Port',
      type: 'CLOSED',
      x: 85,
      y: 22,
      label: 'SAFE-012',
      detail: 'Conveyor ship loader beroperasi normal tanpa insiden',
    },
    {
      id: 'm6',
      name: 'Haul Road KM12 Simpang 3',
      type: 'INSPECTION',
      x: 60,
      y: 50,
      label: 'INS-2026-079',
      detail: 'Pemeriksaan safety berm & rambu batas kecepatan',
    },
  ];

  const filteredMarkers = markers.filter((m) => {
    if (filterType === 'ALL') return true;
    return m.type === filterType;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#06B6D4]" />
            Mining GIS &amp; Offline Area Map (Blueprint §19)
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Sistem peta pertambangan offline-first: Pelacakan spasial Pit Jaja KM10, Haul Road, Workshop, &amp; Siumbatu Port.
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
              showHeatmap
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Heatmap Bahaya: {showHeatmap ? 'Aktif' : 'Nonaktif'}</span>
          </button>

          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
            ✓ Offline Tile Ready (100%)
          </span>
        </div>
      </div>

      {/* Legend & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-neutral-400 font-medium">Legenda Marker:</span>
          <button
            onClick={() => setFilterType('HAZARD')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
              filterType === 'HAZARD' ? 'bg-red-500/30 border-red-500 text-red-300' : 'bg-white/5 border-white/10 text-neutral-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5252]" />
            <span>Hazard (Merah)</span>
          </button>

          <button
            onClick={() => setFilterType('INSPECTION')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
              filterType === 'INSPECTION' ? 'bg-blue-500/30 border-blue-500 text-blue-300' : 'bg-white/5 border-white/10 text-neutral-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#42A5F5]" />
            <span>Inspeksi (Biru)</span>
          </button>

          <button
            onClick={() => setFilterType('PICA')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
              filterType === 'PICA' ? 'bg-amber-500/30 border-amber-500 text-amber-300' : 'bg-white/5 border-white/10 text-neutral-300'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFC107]" />
            <span>PICA (Oranye)</span>
          </button>

          <button
            onClick={() => setFilterType('ALL')}
            className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
              filterType === 'ALL' ? 'bg-white text-black font-semibold' : 'bg-white/5 border-white/10 text-neutral-300'
            }`}
          >
            Tampilkan Semua
          </button>
        </div>

        <div className="text-neutral-400 font-mono text-[11px]">
          Datum: WGS84 · Proyeksi: UTM Zone 51S
        </div>
      </div>

      {/* Main Interactive Map Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 apple-glass-card rounded-2xl overflow-hidden border border-white/15 relative min-h-[460px] bg-[#0c1015] flex items-center justify-center">
          {/* Vector Mining Concession Topography Map */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="none">
            <defs>
              {/* Radial gradient for Heatmap */}
              <radialGradient id="heatPit" cx="28%" cy="60%" r="22%">
                <stop offset="0%" stopColor="#FF5252" stopOpacity={showHeatmap ? '0.45' : '0'} />
                <stop offset="60%" stopColor="#FFC107" stopOpacity={showHeatmap ? '0.2' : '0'} />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="heatWorkshop" cx="50%" cy="45%" r="15%">
                <stop offset="0%" stopColor="#FFC107" stopOpacity={showHeatmap ? '0.35' : '0'} />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Background grid */}
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Heatmap areas */}
            <rect width="100%" height="100%" fill="url(#heatPit)" />
            <rect width="100%" height="100%" fill="url(#heatWorkshop)" />

            {/* Ocean / Jetty water outline at Top Right */}
            <path
              d="M 750,0 Q 820,120 900,180 T 1000,220 L 1000,0 Z"
              fill="#062030"
              stroke="#06B6D4"
              strokeWidth="2"
              strokeDasharray="4,4"
            />
            <text x="840" y="80" fill="#42A5F5" fontSize="13" fontWeight="bold" opacity="0.6">
              TELUK SIUMBATU (PORT)
            </text>

            {/* Open Pit Contours (Pit Jaja KM10) */}
            <g stroke="#384556" strokeWidth="1.5" fill="none" opacity="0.6">
              {/* Bench 1 */}
              <ellipse cx="270" cy="380" rx="190" ry="120" stroke="#4b5563" />
              {/* Bench 2 */}
              <ellipse cx="270" cy="385" rx="150" ry="95" stroke="#6b7280" />
              {/* Bench 3 */}
              <ellipse cx="270" cy="390" rx="110" ry="70" stroke="#9ca3af" />
              {/* Sump pit floor */}
              <ellipse cx="270" cy="395" rx="60" ry="40" fill="#1e293b" stroke="#00E676" strokeWidth="1.5" />
            </g>
            <text x="220" y="400" fill="#00E676" fontSize="12" fontWeight="bold" fontFamily="monospace">
              PIT JAJA RL -20m
            </text>

            {/* Main Haul Road KM0 - KM18 (Winding Artery) */}
            <path
              d="M 270,360 Q 420,380 500,280 T 700,260 T 870,190"
              fill="none"
              stroke="#ca8a04"
              strokeWidth="8"
              strokeLinecap="round"
              strokeOpacity="0.4"
            />
            <path
              d="M 270,360 Q 420,380 500,280 T 700,260 T 870,190"
              fill="none"
              stroke="#facc15"
              strokeWidth="2"
              strokeDasharray="8,6"
            />

            {/* Facilities Outlines */}
            {/* Workshop */}
            <rect x="490" y="220" width="80" height="60" rx="8" fill="#182230" stroke="#42A5F5" strokeWidth="1.5" />
            <text x="500" y="255" fill="#42A5F5" fontSize="10" fontWeight="bold">WORKSHOP</text>

            {/* Fuel Bay */}
            <rect x="460" y="290" width="60" height="45" rx="8" fill="#281a18" stroke="#f97316" strokeWidth="1.5" />
            <text x="470" y="315" fill="#f97316" fontSize="9" fontWeight="bold">FUEL BAY</text>

            {/* Stockpile */}
            <polygon points="680,210 740,210 760,260 660,260" fill="#222718" stroke="#84cc16" strokeWidth="1.5" />
            <text x="685" y="240" fill="#84cc16" fontSize="10" fontWeight="bold">STOCKPILE</text>
          </svg>

          {/* Interactive Markers Placed on Top */}
          {filteredMarkers.map((marker) => {
            const isMarkerSelected = selectedMarker?.id === marker.id;

            return (
              <div
                key={marker.id}
                onClick={() => setSelectedMarker(marker)}
                style={{
                  left: `${marker.x}%`,
                  top: `${marker.y}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-20"
              >
                {/* Ping animation for Hazards */}
                {marker.type === 'HAZARD' && (
                  <span className="absolute -inset-1 rounded-full bg-red-500 animate-ping opacity-75" />
                )}

                {/* Marker Dot */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xl transition-transform hover:scale-125 border-2 ${
                    isMarkerSelected ? 'scale-125 ring-4 ring-white/50' : ''
                  } ${
                    marker.type === 'HAZARD'
                      ? 'bg-[#FF5252] border-white'
                      : marker.type === 'INSPECTION'
                      ? 'bg-[#42A5F5] border-white'
                      : marker.type === 'PICA'
                      ? 'bg-[#FFC107] text-black border-white'
                      : 'bg-[#00E676] text-black border-white'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                </div>

                {/* Quick floating label */}
                <div className="absolute top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono whitespace-nowrap text-white border border-white/20 shadow-md pointer-events-none opacity-80 group-hover:opacity-100">
                  {marker.label}
                </div>
              </div>
            );
          })}

          {/* Map Compass Rose */}
          <div className="absolute top-4 right-4 p-2 rounded-xl bg-black/60 border border-white/10 text-neutral-400 flex flex-col items-center">
            <span className="text-[9px] font-bold text-red-400 font-mono">N ▲</span>
            <Navigation className="w-5 h-5 text-white/70 rotate-45 my-0.5" />
            <span className="text-[8px] font-mono">UTM 51S</span>
          </div>

          {/* Selected Marker Popup Card */}
          {selectedMarker && (
            <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 apple-glass p-3.5 rounded-xl border border-white/20 shadow-2xl z-30 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                <span className="font-mono text-xs font-bold text-[#06B6D4]">{selectedMarker.label}</span>
                <button
                  onClick={() => setSelectedMarker(null)}
                  className="text-neutral-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="text-xs font-semibold text-white mt-2">{selectedMarker.name}</div>
              <p className="text-[11px] text-neutral-300 mt-1">{selectedMarker.detail}</p>
              <div className="mt-2.5 flex justify-end gap-2">
                <button
                  onClick={() => {
                    if (selectedMarker.type === 'HAZARD') store.openWindow('hazard');
                    else if (selectedMarker.type === 'INSPECTION') store.openWindow('inspection');
                    else store.openWindow('pica');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#06B6D4] hover:bg-cyan-600 text-black font-bold text-[10px] cursor-pointer"
                >
                  Buka Entitas →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mining Area Telemetry List */}
        <div className="space-y-3">
          <div className="apple-glass-card p-4 rounded-2xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 pb-2 border-b border-white/10 mb-3">
              Katalog Zona Pertambangan Aktif
            </h3>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {store.locations.map((loc) => {
                const isSelected = selectedLocation.id === loc.id;

                return (
                  <div
                    key={loc.id}
                    onClick={() => setSelectedLocation(loc)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-500/40'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#06B6D4]" />
                        {loc.name}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                          loc.safetyStatus === 'SAFE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {loc.safetyStatus}
                      </span>
                    </div>

                    <div className="text-[10px] text-neutral-400 font-mono mt-1">{loc.utm}</div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-300">
                      <span>Bahaya: <strong className="text-red-400">{loc.activeHazards}</strong></span>
                      <span>Inspeksi: <strong className="text-blue-400">{loc.activeInspections}</strong></span>
                      <span className="text-[10px] uppercase font-mono px-1 rounded bg-white/10">{loc.zoneType}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
