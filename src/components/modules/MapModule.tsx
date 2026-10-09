import React from 'react';
import { Compass, MapPin, Settings2 } from 'lucide-react';
import { useHDOSStore } from '../../core/store';

export const MapModule: React.FC = () => {
  const store = useHDOSStore();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-start gap-3 border-b border-white/10 pb-5">
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3"><Compass className="h-6 w-6 text-cyan-300"/></div>
        <div><h2 className="text-xl font-bold text-white">Master Area &amp; GIS</h2><p className="mt-1 text-sm text-neutral-400">Daftar area berasal dari Pengaturan. Tidak ada marker, koordinat, heatmap, atau status keselamatan buatan.</p></div>
      </header>
      {store.locations.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center"><MapPin className="mx-auto mb-3 h-8 w-8 text-neutral-500"/><h3 className="font-semibold text-white">Belum ada area kerja</h3><p className="mt-2 text-sm text-neutral-400">Tambahkan area dan koordinat yang telah diverifikasi melalui Pengaturan.</p><button onClick={()=>store.openWindow('settings')} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#00E676] px-4 py-2.5 text-sm font-semibold text-black"><Settings2 size={16}/>Buka Pengaturan</button></div> :
      <div className="space-y-3"><div className="text-sm text-neutral-400">{store.locations.length} area terdaftar. Peta visual belum diaktifkan karena belum ada layer peta aktual yang dikonfigurasi.</div>{store.locations.map(location=><div key={location.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center justify-between gap-3"><div className="font-semibold text-white">{location.name}</div><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-neutral-300">{location.zoneType}</span></div><p className="mt-1 text-sm text-neutral-400">{location.description || 'Tidak ada deskripsi'}</p><div className="mt-3 grid gap-2 text-xs text-neutral-400 sm:grid-cols-3"><div>UTM: {location.utm || 'Belum diisi'}</div><div>Latitude: {location.lat ? location.lat : 'Belum diisi'}</div><div>Longitude: {location.lng ? location.lng : 'Belum diisi'}</div></div></div>)}</div>}
    </div>
  );
};
