import React, { useMemo } from 'react';
import { Compass, MapPin, Settings2, Crosshair, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useHDOSStore } from '../../core/store';

export const MapModule: React.FC = () => {
  const store = useHDOSStore();
  const mappedLocations = useMemo(() => store.locations.filter((location) =>
    Number.isFinite(Number(location.lat)) &&
    Number.isFinite(Number(location.lng)) &&
    Number(location.lat) >= -90 && Number(location.lat) <= 90 &&
    Number(location.lng) >= -180 && Number(location.lng) <= 180 &&
    !(Number(location.lat) === 0 && Number(location.lng) === 0)
  ), [store.locations]);

  const bounds = useMemo(() => {
    if (mappedLocations.length === 0) return null;
    const latitudes = mappedLocations.map(location => Number(location.lat));
    const longitudes = mappedLocations.map(location => Number(location.lng));
    return {
      minLat: Math.min(...latitudes),
      maxLat: Math.max(...latitudes),
      minLng: Math.min(...longitudes),
      maxLng: Math.max(...longitudes),
    };
  }, [mappedLocations]);

  const getPoint = (lat: number, lng: number) => {
    if (!bounds) return { x: 500, y: 300 };
    const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
    const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
    return {
      x: 70 + ((lng - bounds.minLng) / lngSpan) * 860,
      y: 530 - ((lat - bounds.minLat) / latSpan) * 460,
    };
  };

  const alertCount = store.locations.filter(location => location.safetyStatus === 'ALERT').length;
  const warningCount = store.locations.filter(location => location.safetyStatus === 'WARNING').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3"><Compass className="h-6 w-6 text-cyan-300"/></div>
          <div>
            <h2 className="text-xl font-bold text-white">Master Area &amp; GIS</h2>
            <p className="mt-1 text-sm text-neutral-400">Plot spasial menggunakan koordinat aktual dari master area pusat.</p>
          </div>
        </div>
        <button onClick={() => store.openWindow('settings')} className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-white/10">
          <Settings2 size={15}/> Kelola Master Area
        </button>
      </header>

      {store.locations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-neutral-500"/>
          <h3 className="font-semibold text-white">Belum ada area kerja</h3>
          <p className="mt-2 text-sm text-neutral-400">Tambahkan area dan koordinat yang telah diverifikasi melalui Pengaturan.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xs text-neutral-400">Area Terdaftar</div><div className="mt-1 text-2xl font-bold text-white">{store.locations.length}</div></div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xs text-neutral-400">Koordinat Valid</div><div className="mt-1 text-2xl font-bold text-cyan-300">{mappedLocations.length}</div></div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3"><div className="text-xs text-neutral-400">Perlu Perhatian</div><div className="mt-1 text-2xl font-bold text-amber-300">{warningCount}</div></div>
            <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-3"><div className="text-xs text-neutral-400">Status Alert</div><div className="mt-1 text-2xl font-bold text-red-300">{alertCount}</div></div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#08111a]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white"><Crosshair className="h-4 w-4 text-cyan-300"/>Plot Koordinat Area Tambang</div>
              <div className="flex flex-wrap gap-3 text-[10px] text-neutral-300">
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-400"/>Aman</span>
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-400"/>Perhatian</span>
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-red-400"/>Alert</span>
              </div>
            </div>
            {mappedLocations.length === 0 ? (
              <div className="p-10 text-center text-sm text-neutral-400">Koordinat belum tersedia atau belum valid. Data area tetap tercatat di daftar master.</div>
            ) : (
              <div className="p-2 sm:p-4">
                <svg viewBox="0 0 1000 600" role="img" aria-label="Plot koordinat master area tambang" className="h-auto w-full">
                  <defs>
                    <pattern id="hdos-gis-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect x="0" y="0" width="1000" height="600" rx="18" fill="#0b1722"/>
                  <rect x="35" y="25" width="930" height="550" rx="12" fill="url(#hdos-gis-grid)" stroke="rgba(148,163,184,0.18)"/>
                  <path d="M70 530 H930 M70 70 V530" stroke="rgba(148,163,184,0.3)" strokeWidth="1.5" strokeDasharray="5 7"/>
                  <text x="500" y="585" textAnchor="middle" fill="#94a3b8" fontSize="13">Longitude (°)</text>
                  <text x="20" y="300" textAnchor="middle" fill="#94a3b8" fontSize="13" transform="rotate(-90 20 300)">Latitude (°)</text>
                  {mappedLocations.map(location => {
                    const point = getPoint(Number(location.lat), Number(location.lng));
                    const fill = location.safetyStatus === 'ALERT' ? '#f87171' : location.safetyStatus === 'WARNING' ? '#fbbf24' : '#34d399';
                    return (
                      <g key={location.id}>
                        <circle cx={point.x} cy={point.y} r="17" fill={fill} opacity="0.15"/>
                        <circle cx={point.x} cy={point.y} r="7" fill={fill} stroke="#07111b" strokeWidth="2"/>
                        <text x={point.x + 12} y={point.y - 12} fill="#e2e8f0" fontSize="13" fontWeight="600">{location.name.length > 22 ? location.name.slice(0, 20) + '…' : location.name}</text>
                        <title>{location.name} — {location.lat}, {location.lng} — {location.safetyStatus}</title>
                      </g>
                    );
                  })}
                </svg>
                <p className="px-2 pb-1 text-[10px] text-neutral-500">Visualisasi posisi relatif berdasarkan latitude/longitude. Ini bukan peta jalan atau citra satelit; validasi lokasi tetap mengacu pada koordinat dan UTM master.</p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-white">Daftar Master Area</h3><span className="text-xs text-neutral-500">{store.locations.length} area</span></div>
            <div className="grid gap-3 md:grid-cols-2">
              {store.locations.map(location => (
                <article key={location.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><h4 className="font-semibold text-white">{location.name}</h4><p className="mt-1 text-xs text-neutral-400">{location.description || 'Tidak ada deskripsi'}</p></div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${location.safetyStatus === 'ALERT' ? 'border-red-400/30 bg-red-400/10 text-red-300' : location.safetyStatus === 'WARNING' ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'}`}>{location.safetyStatus}</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-neutral-400 sm:grid-cols-3">
                    <div>Zona: <strong className="text-neutral-200">{location.zoneType}</strong></div>
                    <div>UTM: <strong className="text-neutral-200">{location.utm || 'Belum diisi'}</strong></div>
                    <div>Koordinat: <strong className="text-neutral-200">{location.lat}, {location.lng}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
