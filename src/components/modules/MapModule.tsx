import React, { useMemo, useState } from 'react';
import {
  MapPin,
  Compass,
  Flame,
  AlertTriangle,
  ClipboardCheck,
  CheckCircle,
  Navigation,
  ShieldAlert,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { MiningArea, MiningLocationGIS, WindowId } from '../../core/types';
import { RemoteRefreshControl } from '../ui/RemoteRefreshControl';

type MarkerType = 'HAZARD' | 'INSPECTION' | 'PICA' | 'INCIDENT' | 'CLOSED';

interface MapMarker {
  id: string;
  name: string;
  location: MiningArea;
  type: MarkerType;
  x: number;
  y: number;
  label: string;
  detail: string;
  windowId: WindowId;
}

const LOCATION_LAYOUT: Record<MiningArea, { x: number; y: number; zoneType: MiningLocationGIS['zoneType']; utm: string; lat: number; lng: number; description: string }> = {
  'Pit Jaja KM10': {
    x: 28,
    y: 62,
    zoneType: 'PIT',
    utm: '51S 382900 mE 9672100 mN',
    lat: -2.9642,
    lng: 121.9421,
    description: 'Area penambangan utama pit timur',
  },
  Workshop: {
    x: 52,
    y: 42,
    zoneType: 'FACILITY',
    utm: '51S 385100 mE 9674800 mN',
    lat: -2.9395,
    lng: 121.9618,
    description: 'Central Maintenance Workshop',
  },
  Siumbatu: {
    x: 85,
    y: 22,
    zoneType: 'PORT',
    utm: '51S 391200 mE 9680400 mN',
    lat: -2.8891,
    lng: 122.0165,
    description: 'Pelabuhan jetty pemuatan ore nikel',
  },
  Stockpile: {
    x: 70,
    y: 38,
    zoneType: 'FACILITY',
    utm: '51S 388450 mE 9677900 mN',
    lat: -2.9201,
    lng: 121.9894,
    description: 'Area penumpukan sementara ore dan blending',
  },
  'Fuel Bay': {
    x: 48,
    y: 48,
    zoneType: 'FACILITY',
    utm: '51S 384700 mE 9674300 mN',
    lat: -2.9443,
    lng: 121.9572,
    description: 'Area pengisian BBM dan pelumas alat berat',
  },
  'Haul Road': {
    x: 60,
    y: 50,
    zoneType: 'HAUL_ROAD',
    utm: '51S 387900 mE 9675600 mN',
    lat: -2.9334,
    lng: 121.9787,
    description: 'Koridor angkut utama ore dan waste',
  },
};

const FILTERS: Array<{ id: 'ALL' | MarkerType; label: string; color: string }> = [
  { id: 'ALL', label: 'Tampilkan Semua', color: 'bg-white text-black font-semibold' },
  { id: 'HAZARD', label: 'Hazard', color: 'bg-red-500/30 border-red-500 text-red-300' },
  { id: 'INSPECTION', label: 'Inspeksi', color: 'bg-blue-500/30 border-blue-500 text-blue-300' },
  { id: 'PICA', label: 'PICA', color: 'bg-amber-500/30 border-amber-500 text-amber-300' },
  { id: 'INCIDENT', label: 'Insiden', color: 'bg-fuchsia-500/30 border-fuchsia-500 text-fuchsia-300' },
];

export const MapModule: React.FC = () => {
  const store = useHDOSStore();
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | MarkerType>('ALL');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(store.locations[0]?.id ?? 'loc_pit_jaja');

  const derivedLocations = useMemo(() => {
    const allAreas = Object.entries(LOCATION_LAYOUT).map(([name, config]) => {
      const liveLocation = store.locations.find((item) => item.name === name);
      const hazards = store.hazards.filter((hazard) => hazard.location === name);
      const inspections = store.inspections.filter((inspection) => inspection.location === name);
      const incidents = store.incidents.filter((incident) => incident.location === name);
      const openHazards = hazards.filter((hazard) => hazard.status !== 'CLOSED');
      const activePicas = store.picas.filter((pica) => {
        if (pica.status === 'CLOSED') return false;
        const linkedHazard = store.hazards.find((hazard) => hazard.code === pica.sourceRefCode);
        const linkedInspection = store.inspections.find((inspection) => inspection.code === pica.sourceRefCode);
        const linkedIncident = store.incidents.find((incident) => incident.code === pica.sourceRefCode);
        return linkedHazard?.location === name || linkedInspection?.location === name || linkedIncident?.location === name;
      });

      let safetyStatus: MiningLocationGIS['safetyStatus'] = 'SAFE';
      if (openHazards.some((hazard) => hazard.riskMatrix.level === 'CRITICAL') || incidents.some((incident) => incident.status !== 'CLOSED')) {
        safetyStatus = 'ALERT';
      } else if (openHazards.length > 0 || activePicas.length > 0) {
        safetyStatus = 'WARNING';
      }

      return {
        id: liveLocation?.id ?? `loc_${name.toLowerCase().replace(/\s+/g, '_')}`,
        name: name as MiningArea,
        utm: liveLocation?.utm ?? config.utm,
        lat: liveLocation?.lat ?? config.lat,
        lng: liveLocation?.lng ?? config.lng,
        description: liveLocation?.description ?? config.description,
        zoneType: liveLocation?.zoneType ?? config.zoneType,
        activeHazards: openHazards.length,
        activeInspections: inspections.length,
        safetyStatus,
        activePicas: activePicas.length,
        activeIncidents: incidents.filter((incident) => incident.status !== 'CLOSED').length,
        x: config.x,
        y: config.y,
      };
    });

    return allAreas;
  }, [store.hazards, store.inspections, store.incidents, store.picas, store.locations]);

  const markers = useMemo(() => {
    const nextMarkers: MapMarker[] = [];
    const counters = new Map<string, number>();
    const placeMarker = (location: MiningArea, type: MarkerType, label: string, detail: string, windowId: WindowId, id: string) => {
      const base = LOCATION_LAYOUT[location];
      if (!base) return;
      const counterKey = `${location}:${type}`;
      const count = counters.get(counterKey) ?? 0;
      counters.set(counterKey, count + 1);
      const x = base.x + (count % 3) * 2 - 2;
      const y = base.y + Math.floor(count / 3) * 3 - 2;
      nextMarkers.push({ id, name: location, location, type, x, y, label, detail, windowId });
    };

    store.hazards.forEach((hazard) => {
      placeMarker(
        hazard.location,
        hazard.status === 'CLOSED' ? 'CLOSED' : 'HAZARD',
        hazard.code,
        `${hazard.specificLocation} • ${hazard.title}`,
        'hazard',
        `hazard:${hazard.id}`,
      );
    });

    store.inspections.forEach((inspection) => {
      placeMarker(
        inspection.location,
        inspection.status === 'COMPLETED' ? 'INSPECTION' : 'PICA',
        inspection.code,
        `${inspection.title} • Score ${inspection.scorePercent}%`,
        'inspection',
        `inspection:${inspection.id}`,
      );
    });

    store.incidents.forEach((incident) => {
      placeMarker(
        incident.location,
        incident.status === 'CLOSED' ? 'CLOSED' : 'INCIDENT',
        incident.code,
        `${incident.type} • ${incident.title}`,
        'incident',
        `incident:${incident.id}`,
      );
    });

    store.picas.forEach((pica) => {
      if (pica.status === 'CLOSED') return;
      const linkedHazard = store.hazards.find((hazard) => hazard.code === pica.sourceRefCode);
      const linkedInspection = store.inspections.find((inspection) => inspection.code === pica.sourceRefCode);
      const linkedIncident = store.incidents.find((incident) => incident.code === pica.sourceRefCode);
      const location = linkedHazard?.location ?? linkedInspection?.location ?? linkedIncident?.location;
      if (!location) return;
      placeMarker(location, 'PICA', pica.code, pica.findingDescription, 'pica', `pica:${pica.id}`);
    });

    return nextMarkers.sort((left, right) => right.label.localeCompare(left.label));
  }, [store.hazards, store.inspections, store.incidents, store.picas]);

  const filteredMarkers = useMemo(
    () => markers.filter((marker) => (filterType === 'ALL' ? true : marker.type === filterType)),
    [markers, filterType],
  );

  const selectedMarker = filteredMarkers.find((marker) => marker.id === selectedMarkerId) ?? filteredMarkers[0] ?? null;
  const selectedLocation = derivedLocations.find((location) => location.id === selectedLocationId) ?? derivedLocations[0] ?? null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#06B6D4]" />
            Mining GIS &amp; Offline Area Map (Blueprint §19)
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Peta sekarang membaca entitas operasional live dari register hazard, inspeksi, PICA, dan insiden.
          </p>
        </div>

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
            {filteredMarkers.length} Marker Live
          </span>
        </div>
      </div>

      <RemoteRefreshControl label="Peta GIS" />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-neutral-400 font-medium">Legenda Marker:</span>
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setFilterType(filter.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                filterType === filter.id ? filter.color : 'bg-white/5 border-white/10 text-neutral-300'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  filter.id === 'HAZARD'
                    ? 'bg-[#FF5252]'
                    : filter.id === 'INSPECTION'
                      ? 'bg-[#42A5F5]'
                      : filter.id === 'PICA'
                        ? 'bg-[#FFC107]'
                        : filter.id === 'INCIDENT'
                          ? 'bg-[#D946EF]'
                          : 'bg-white'
                }`}
              />
              <span>{filter.label}</span>
            </button>
          ))}
        </div>

        <div className="text-neutral-400 font-mono text-[11px]">
          Datum: WGS84 · Proyeksi: UTM Zone 51S
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 apple-glass-card rounded-2xl overflow-hidden border border-white/15 relative min-h-[460px] bg-[#0c1015] flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="none">
            <defs>
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
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <rect width="100%" height="100%" fill="url(#heatPit)" />
            <rect width="100%" height="100%" fill="url(#heatWorkshop)" />
            <path d="M 750,0 Q 820,120 900,180 T 1000,220 L 1000,0 Z" fill="#062030" stroke="#06B6D4" strokeWidth="2" strokeDasharray="4,4" />
            <text x="840" y="80" fill="#42A5F5" fontSize="13" fontWeight="bold" opacity="0.6">TELUK SIUMBATU (PORT)</text>
            <g stroke="#384556" strokeWidth="1.5" fill="none" opacity="0.6">
              <ellipse cx="270" cy="380" rx="190" ry="120" stroke="#4b5563" />
              <ellipse cx="270" cy="385" rx="150" ry="95" stroke="#6b7280" />
              <ellipse cx="270" cy="390" rx="110" ry="70" stroke="#9ca3af" />
              <ellipse cx="270" cy="395" rx="60" ry="40" fill="#1e293b" stroke="#00E676" strokeWidth="1.5" />
            </g>
            <text x="220" y="400" fill="#00E676" fontSize="12" fontWeight="bold" fontFamily="monospace">PIT JAJA RL -20m</text>
            <path d="M 270,360 Q 420,380 500,280 T 700,260 T 870,190" fill="none" stroke="#ca8a04" strokeWidth="8" strokeLinecap="round" strokeOpacity="0.4" />
            <path d="M 270,360 Q 420,380 500,280 T 700,260 T 870,190" fill="none" stroke="#facc15" strokeWidth="2" strokeDasharray="8,6" />
            <rect x="490" y="220" width="80" height="60" rx="8" fill="#182230" stroke="#42A5F5" strokeWidth="1.5" />
            <text x="500" y="255" fill="#42A5F5" fontSize="10" fontWeight="bold">WORKSHOP</text>
            <rect x="460" y="290" width="60" height="45" rx="8" fill="#281a18" stroke="#f97316" strokeWidth="1.5" />
            <text x="470" y="315" fill="#f97316" fontSize="9" fontWeight="bold">FUEL BAY</text>
            <polygon points="680,210 740,210 760,260 660,260" fill="#222718" stroke="#84cc16" strokeWidth="1.5" />
            <text x="685" y="240" fill="#84cc16" fontSize="10" fontWeight="bold">STOCKPILE</text>
          </svg>

          {filteredMarkers.map((marker) => {
            const isSelected = selectedMarker?.id === marker.id;
            const isHazard = marker.type === 'HAZARD';
            return (
              <div
                key={marker.id}
                onClick={() => {
                  setSelectedMarkerId(marker.id);
                  const location = derivedLocations.find((item) => item.name === marker.location);
                  if (location) setSelectedLocationId(location.id);
                }}
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-20"
              >
                {isHazard && <span className="absolute -inset-1 rounded-full bg-red-500 animate-ping opacity-75" />}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xl transition-transform hover:scale-125 border-2 ${
                    isSelected ? 'scale-125 ring-4 ring-white/40' : ''
                  } ${
                    marker.type === 'HAZARD'
                      ? 'bg-[#FF5252] border-white'
                      : marker.type === 'INSPECTION'
                        ? 'bg-[#42A5F5] border-white'
                        : marker.type === 'PICA'
                          ? 'bg-[#FFC107] text-black border-white'
                          : marker.type === 'INCIDENT'
                            ? 'bg-[#D946EF] border-white'
                            : 'bg-[#00E676] text-black border-white'
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="absolute top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono whitespace-nowrap text-white border border-white/20 shadow-md pointer-events-none opacity-80 group-hover:opacity-100">
                  {marker.label}
                </div>
              </div>
            );
          })}

          <div className="absolute top-4 right-4 p-2 rounded-xl bg-black/60 border border-white/10 text-neutral-400 flex flex-col items-center">
            <span className="text-[9px] font-bold text-red-400 font-mono">N ▲</span>
            <Navigation className="w-5 h-5 text-white/70 rotate-45 my-0.5" />
            <span className="text-[8px] font-mono">UTM 51S</span>
          </div>

          {selectedMarker && (
            <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 apple-glass p-3.5 rounded-xl border border-white/20 shadow-2xl z-30 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                <span className="font-mono text-xs font-bold text-[#06B6D4]">{selectedMarker.label}</span>
                <button onClick={() => setSelectedMarkerId(null)} className="text-neutral-400 hover:text-white text-xs">✕</button>
              </div>
              <div className="text-xs font-semibold text-white mt-2">{selectedMarker.name}</div>
              <p className="text-[11px] text-neutral-300 mt-1">{selectedMarker.detail}</p>
              <div className="mt-2.5 flex justify-end gap-2">
                <button
                  onClick={() => store.openWindow(selectedMarker.windowId)}
                  className="px-2.5 py-1 rounded-lg bg-[#06B6D4] hover:bg-cyan-600 text-black font-bold text-[10px] cursor-pointer"
                >
                  Buka Entitas →
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="apple-glass-card p-4 rounded-2xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 pb-2 border-b border-white/10 mb-3">
              Katalog Zona Pertambangan Aktif
            </h3>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {derivedLocations.map((location) => {
                const isSelected = selectedLocation?.id === location.id;
                return (
                  <div
                    key={location.id}
                    onClick={() => setSelectedLocationId(location.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected ? 'bg-cyan-500/15 border-cyan-500/40' : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#06B6D4]" />
                        {location.name}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                          location.safetyStatus === 'SAFE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : location.safetyStatus === 'WARNING'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {location.safetyStatus}
                      </span>
                    </div>

                    <div className="text-[10px] text-neutral-400 font-mono mt-1">{location.utm}</div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-neutral-300">
                      <span>Hazard: <strong className="text-red-400">{location.activeHazards}</strong></span>
                      <span>Inspeksi: <strong className="text-blue-400">{location.activeInspections}</strong></span>
                      <span>PICA: <strong className="text-amber-300">{location.activePicas}</strong></span>
                      <span>Insiden: <strong className="text-fuchsia-300">{location.activeIncidents}</strong></span>
                    </div>
                    <div className="mt-2 text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 inline-flex">
                      {location.zoneType}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedLocation && (
            <div className="apple-glass-card p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  Telemetri Zona Terpilih
                </h3>
                <span className="text-[10px] font-mono text-neutral-400">{selectedLocation.name}</span>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <div className="text-white font-semibold">{selectedLocation.description}</div>
                <div className="text-neutral-400 font-mono">{selectedLocation.utm}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-black/30 p-2">
                    <div className="text-neutral-400">Status Zona</div>
                    <div className="text-white font-bold">{selectedLocation.safetyStatus}</div>
                  </div>
                  <div className="rounded-lg bg-black/30 p-2">
                    <div className="text-neutral-400">Marker Aktif</div>
                    <div className="text-white font-bold">{filteredMarkers.filter((marker) => marker.location === selectedLocation.name).length}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => store.openWindow('hazard')}
                  className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Hazard
                </button>
                <button
                  onClick={() => store.openWindow('inspection')}
                  className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ClipboardCheck className="w-4 h-4" />
                  Inspeksi
                </button>
                <button
                  onClick={() => store.openWindow('pica')}
                  className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  PICA
                </button>
                <button
                  onClick={() => store.openWindow('incident')}
                  className="p-3 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Insiden
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
