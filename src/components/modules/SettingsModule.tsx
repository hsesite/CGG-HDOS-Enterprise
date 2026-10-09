import React, { useState } from 'react';
import { MapPin, Building2, Users, ShieldCheck, Trash2, Plus, Settings2 } from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import type { MiningLocationGIS, ContractorPassport } from '../../core/types';
import { getCurrentUser } from '../../core/auth-utils';

const inputClass = 'w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]';
const emptyArea = { name: '', utm: '', lat: '', lng: '', description: '', zoneType: 'FACILITY' as MiningLocationGIS['zoneType'] };

export const SettingsModule: React.FC = () => {
  const store = useHDOSStore();
  const [tab, setTab] = useState<'areas' | 'contractors' | 'accounts'>('areas');
  const [area, setArea] = useState(emptyArea);
  const [contractor, setContractor] = useState({ code: '', companyName: '', picName: '', picContact: '', status: 'ACTIVE' as ContractorPassport['status'], safetyPassportExpiry: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const user = getCurrentUser();

  async function addArea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await store.addLocation({
        name: area.name.trim(),
        utm: area.utm.trim(),
        lat: area.lat.trim() ? Number(area.lat) : 0,
        lng: area.lng.trim() ? Number(area.lng) : 0,
        description: area.description.trim(),
        zoneType: area.zoneType,
      });
      setArea(emptyArea);
      setMessage('Area ditambahkan. Modul GIS dan pilihan lokasi membaca master data yang sama.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Area gagal disimpan.');
    } finally { setBusy(false); }
  }

  async function addContractor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await store.addContractor({
        code: contractor.code.trim().toUpperCase(),
        companyName: contractor.companyName.trim(),
        picName: contractor.picName.trim(),
        picContact: contractor.picContact.trim(),
        status: contractor.status,
        safetyPassportExpiry: contractor.safetyPassportExpiry,
      });
      setContractor({ code: '', companyName: '', picName: '', picContact: '', status: 'ACTIVE', safetyPassportExpiry: '' });
      setMessage('Kontraktor ditambahkan. Modul Contractor membaca master data yang sama.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kontraktor gagal disimpan.');
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-start gap-3 border-b border-white/10 pb-5">
        <div className="rounded-xl border border-[#00E676]/20 bg-[#00E676]/10 p-3"><Settings2 className="h-6 w-6 text-[#00E676]" /></div>
        <div><h2 className="text-xl font-bold text-white">Pengaturan Sistem</h2><p className="mt-1 text-sm text-neutral-400">Master data untuk area kerja dan kontraktor. Data awal kosong dan perubahan disimpan ke IndexedDB pada browser ini.</p></div>
      </header>
      <div className="flex flex-wrap gap-2">
        {([{id:'areas',label:'Area Kerja',icon:MapPin},{id:'contractors',label:'Kontraktor',icon:Building2},{id:'accounts',label:'Akun & Akses',icon:ShieldCheck}] as const).map(item => {
          const Icon = item.icon;
          return <button key={item.id} onClick={() => {setTab(item.id);setMessage('');}} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${tab===item.id?'border-[#00E676]/50 bg-[#00E676]/10 text-[#00E676]':'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'}`}><Icon size={16}/>{item.label}</button>;
        })}
      </div>
      {message && <div role="status" className="rounded-xl border border-[#00E676]/20 bg-[#00E676]/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
      {tab === 'areas' && <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
        <form onSubmit={addArea} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-semibold text-white">Tambah Area Kerja</h3>
          <input required className={inputClass} placeholder="Nama area (mis. Pit Utara)" value={area.name} onChange={e=>setArea({...area,name:e.target.value})}/>
          <select className={inputClass} value={area.zoneType} onChange={e=>setArea({...area,zoneType:e.target.value as MiningLocationGIS['zoneType']})}><option value="PIT">Pit</option><option value="HAUL_ROAD">Haul Road</option><option value="PORT">Port / Jetty</option><option value="FACILITY">Fasilitas</option></select>
          <input className={inputClass} placeholder="Koordinat UTM (opsional)" value={area.utm} onChange={e=>setArea({...area,utm:e.target.value})}/>
          <div className="grid grid-cols-2 gap-3"><input className={inputClass} type="number" step="any" placeholder="Latitude (opsional)" value={area.lat} onChange={e=>setArea({...area,lat:e.target.value})}/><input className={inputClass} type="number" step="any" placeholder="Longitude (opsional)" value={area.lng} onChange={e=>setArea({...area,lng:e.target.value})}/></div>
          <textarea className={inputClass} placeholder="Deskripsi (opsional)" rows={3} value={area.description} onChange={e=>setArea({...area,description:e.target.value})}/>
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00E676] px-4 py-3 font-semibold text-black disabled:opacity-60"><Plus size={16}/>Simpan Area</button>
        </form>
        <section className="space-y-3"><h3 className="font-semibold text-white">Area Terdaftar ({store.locations.length})</h3>
          {store.locations.length===0 ? <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-neutral-400">Belum ada area. Tambahkan area kerja dari formulir ini.</div> : store.locations.map(loc=><div key={loc.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"><div><div className="font-medium text-white">{loc.name}</div><div className="mt-1 text-xs text-neutral-400">{loc.zoneType} · {loc.utm || 'Koordinat belum diisi'}</div></div><button aria-label={`Hapus area ${loc.name}`} onClick={async()=>{if(confirm(`Hapus area ${loc.name}?`)){await store.deleteLocation(loc.id);setMessage('Area dihapus dari master data lokal.');}}} className="rounded-lg p-2 text-neutral-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={16}/></button></div>)}
        </section>
      </div>}
      {tab === 'contractors' && <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
        <form onSubmit={addContractor} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="font-semibold text-white">Tambah Kontraktor</h3>
          <input required className={inputClass} placeholder="Kode kontraktor" value={contractor.code} onChange={e=>setContractor({...contractor,code:e.target.value})}/>
          <input required className={inputClass} placeholder="Nama perusahaan" value={contractor.companyName} onChange={e=>setContractor({...contractor,companyName:e.target.value})}/>
          <input className={inputClass} placeholder="Nama PIC (opsional)" value={contractor.picName} onChange={e=>setContractor({...contractor,picName:e.target.value})}/>
          <input className={inputClass} placeholder="Kontak PIC (opsional)" value={contractor.picContact} onChange={e=>setContractor({...contractor,picContact:e.target.value})}/>
          <label className="block text-xs text-neutral-400">Masa berlaku paspor safety (opsional)<input className={`${inputClass} mt-1`} type="date" value={contractor.safetyPassportExpiry} onChange={e=>setContractor({...contractor,safetyPassportExpiry:e.target.value})}/></label>
          <select className={inputClass} value={contractor.status} onChange={e=>setContractor({...contractor,status:e.target.value as ContractorPassport['status']})}><option value="ACTIVE">Aktif</option><option value="WARNING">Peringatan</option><option value="SUSPENDED">Ditangguhkan</option></select>
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00E676] px-4 py-3 font-semibold text-black disabled:opacity-60"><Plus size={16}/>Simpan Kontraktor</button>
        </form>
        <section className="space-y-3"><h3 className="font-semibold text-white">Kontraktor Terdaftar ({store.contractors.length})</h3>
          {store.contractors.length===0 ? <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-neutral-400">Belum ada kontraktor. Tambahkan data perusahaan terlebih dahulu.</div> : store.contractors.map(item=><div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"><div><div className="font-medium text-white">{item.companyName}</div><div className="mt-1 text-xs text-neutral-400">{item.code} · PIC: {item.picName || 'Belum diisi'}</div><div className="mt-1 text-xs text-neutral-500">Manpower, jam kerja, dan KPI tetap 0 sampai data riil dimasukkan.</div></div><button aria-label={`Hapus kontraktor ${item.companyName}`} onClick={async()=>{if(confirm(`Hapus kontraktor ${item.companyName}?`)){await store.deleteContractor(item.id);setMessage('Kontraktor dihapus dari master data lokal.');}}} className="rounded-lg p-2 text-neutral-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={16}/></button></div>)}
        </section>
      </div>}
      {tab === 'accounts' && <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3"><Users className="text-[#00E676]"/><div><h3 className="font-semibold text-white">Akun dan hak akses</h3><p className="text-sm text-neutral-400">Sesi saat ini: {user?.displayName || 'Tidak diketahui'}{user?.email ? ` · ${user.email}` : ''}</p></div></div>
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">Pendaftaran akun baru, login Google, pengaturan role, dan aktivasi/nonaktif akun harus divalidasi oleh Google Apps Script di sisi server. Panel ini tidak mengubah hak akses server; fitur tersebut baru aktif setelah endpoint autentikasi dan konfigurasi Google OAuth dipasang.</div>
        <p className="text-sm text-neutral-400">Akun yang terdaftar nantinya akan dikelola di sheet users. Jangan memberi role administrator dari formulir pendaftaran publik.</p>
      </section>}
    </div>
  );
};
