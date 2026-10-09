import React, { useEffect, useState } from 'react';
import { MapPin, Building2, Users, ShieldCheck, Trash2, Plus, Settings2 } from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import type { MiningLocationGIS, ContractorPassport } from '../../core/types';
import { getCurrentUser } from '../../core/auth-utils';
import { hseApi, type ApiUser } from '../../core/api';

const inputClass = 'w-full rounded-xl border border-white/10 bg-neutral-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#00E676]';
const emptyArea = { name: '', utm: '', lat: '', lng: '', description: '', zoneType: 'NURSERY' as MiningLocationGIS['zoneType'] };
const AREA_CATEGORIES: { value: MiningLocationGIS['zoneType']; label: string }[] = [
  { value: 'PIT', label: 'Pit' },
  { value: 'HAUL_ROAD', label: 'Hauling Road' },
  { value: 'STOCKPILE', label: 'Stockpile' },
  { value: 'PREPARASI', label: 'Preparasi' },
  { value: 'NURSERY', label: 'Nursery' },
  { value: 'JETTY', label: 'Jetty' },
  { value: 'ETO', label: 'ETO' },
  { value: 'SAMPLE_HOUSE', label: 'Sample House' },
];
const REQUIRES_MANUAL_AREA_NAME: MiningLocationGIS['zoneType'][] = ['PIT', 'HAUL_ROAD', 'STOCKPILE'];
const getAreaCategoryLabel = (zoneType: MiningLocationGIS['zoneType']) => AREA_CATEGORIES.find((item) => item.value === zoneType)?.label || zoneType;

export const SettingsModule: React.FC = () => {
  const store = useHDOSStore();
  const [tab, setTab] = useState<'areas' | 'contractors' | 'accounts'>('areas');
  const [area, setArea] = useState(emptyArea);
  const [contractor, setContractor] = useState({ code: '', companyName: '', picName: '', picContact: '', status: 'ACTIVE' as ContractorPassport['status'], safetyPassportExpiry: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<ApiUser[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [newAccount, setNewAccount] = useState({displayName:'',email:'',password:'',role:'Contractor' as 'Admin CGG'|'Contractor'|'Subkon',companyCode:'',parentCompanyCode:''});
  const user = getCurrentUser();

  async function loadAccounts() {
    setAccountLoading(true);
    try { setAccounts(await hseApi.listUsers()); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Daftar akun tidak dapat dimuat. Akses pengelolaan akun dibatasi untuk KTT.'); }
    finally { setAccountLoading(false); }
  }

  useEffect(() => { if (tab === 'accounts') void loadAccounts(); }, [tab]);
  
  if (!user || !user.roles.includes('Admin CGG')) {
    return <div className="mx-auto max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-red-300"/><h2 className="font-semibold text-white">Akses Pengaturan Ditolak</h2><p className="mt-2 text-sm text-neutral-400">Hanya Admin CGG yang dapat menambahkan akun dan mengatur hak akses kontraktor maupun subkontraktor.</p></div>;
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await hseApi.createUser({
        displayName: newAccount.displayName.trim(),
        email: newAccount.email.trim(),
        password: newAccount.password,
        role: newAccount.role,
        ...(newAccount.role !== 'Admin CGG' ? { companyCode: newAccount.companyCode.trim().toUpperCase() } : {}),
        ...(newAccount.role === 'Subkon' ? { parentCompanyCode: newAccount.parentCompanyCode.trim().toUpperCase() } : {}),
      });
      setNewAccount({displayName:'',email:'',password:'',role:'Contractor',companyCode:'',parentCompanyCode:''});
      setMessage('Akun berhasil dibuat oleh Admin CGG. Kredensial diberikan langsung kepada pemilik akun.');
      await loadAccounts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Akun gagal dibuat.');
    } finally { setBusy(false); }
  }

  async function updateAccount(id: string, updates: { role?: 'Admin CGG' | 'Contractor' | 'Subkon'; status?: 'ACTIVE' | 'INACTIVE'; companyCode?: string; parentCompanyCode?: string }) {
    setBusy(true);
    try { await hseApi.updateUserAccess(id, updates); await loadAccounts(); setMessage('Hak akses akun berhasil diperbarui.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Hak akses gagal diperbarui.'); }
    finally { setBusy(false); }
  }

  async function approveGoogleAccount(event: React.FormEvent<HTMLFormElement>, account: ApiUser) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = String(form.get('role') || 'Contractor') as 'Contractor' | 'Subkon';
    const companyCode = String(form.get('companyCode') || '').trim().toUpperCase();
    const parentCompanyCode = String(form.get('parentCompanyCode') || '').trim().toUpperCase();
    if (!companyCode || (role === 'Subkon' && !parentCompanyCode)) {
      setMessage('Kode perusahaan wajib diisi; akun Subkon juga wajib memiliki kode Contractor induk.');
      return;
    }
    await updateAccount(account.id, { role, status: 'ACTIVE', companyCode, parentCompanyCode: role === 'Subkon' ? parentCompanyCode : '' });
  }

  async function addArea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await store.addLocation({
        name: REQUIRES_MANUAL_AREA_NAME.includes(area.zoneType) ? area.name.trim() : getAreaCategoryLabel(area.zoneType),
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
          <label className="block text-xs text-neutral-400">Kategori area
            <select required className={`${inputClass} mt-1`} value={area.zoneType} onChange={e=>{const zoneType=e.target.value as MiningLocationGIS['zoneType'];setArea({...area,zoneType,name:REQUIRES_MANUAL_AREA_NAME.includes(zoneType)?'':getAreaCategoryLabel(zoneType)});}}>
              {AREA_CATEGORIES.map(category=><option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </label>
          {REQUIRES_MANUAL_AREA_NAME.includes(area.zoneType) && <label className="block text-xs text-neutral-400">Nama area wajib diisi
            <input required minLength={2} className={`${inputClass} mt-1`} placeholder={area.zoneType==='PIT'?'Contoh: Pit Utara':area.zoneType==='HAUL_ROAD'?'Contoh: Hauling Road KM 12':'Contoh: Stockpile EFO'} value={area.name} onChange={e=>setArea({...area,name:e.target.value})}/>
          </label>}
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
        <div className="flex items-center justify-between gap-3"><p className="text-sm text-neutral-400">Hanya Admin CGG yang boleh membuat akun, menetapkan jenis akun, dan mengatur status.</p><button disabled={accountLoading} onClick={() => void loadAccounts()} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white disabled:opacity-50">{accountLoading ? 'Memuat...' : 'Muat ulang'}</button></div>
        <form onSubmit={createAccount} className="grid gap-3 rounded-xl border border-[#00E676]/20 bg-[#00E676]/5 p-4">
          <h4 className="font-semibold text-white">Tambah akun baru</h4>
          <div className="grid gap-3 md:grid-cols-2"><input required minLength={2} className={inputClass} placeholder="Nama karyawan / PIC" value={newAccount.displayName} onChange={e=>setNewAccount({...newAccount,displayName:e.target.value})}/><input required type="email" className={inputClass} placeholder="Email akun" value={newAccount.email} onChange={e=>setNewAccount({...newAccount,email:e.target.value})}/><input required minLength={12} type="password" autoComplete="new-password" className={inputClass} placeholder="Password awal (minimal 12 karakter)" value={newAccount.password} onChange={e=>setNewAccount({...newAccount,password:e.target.value})}/><select className={inputClass} value={newAccount.role} onChange={e=>setNewAccount({...newAccount,role:e.target.value as typeof newAccount.role})}><option value="Admin CGG">Admin CGG</option><option value="Contractor">Kontraktor</option><option value="Subkon">Subkontraktor</option></select></div>
          {newAccount.role !== 'Admin CGG' && <input required className={inputClass} placeholder={newAccount.role==='Contractor'?'Kode perusahaan kontraktor (unik)':'Kode perusahaan subkon (unik)'} value={newAccount.companyCode} onChange={e=>setNewAccount({...newAccount,companyCode:e.target.value})}/>}
          {newAccount.role === 'Subkon' && <input required className={inputClass} placeholder="Kode kontraktor induk (parent)" value={newAccount.parentCompanyCode} onChange={e=>setNewAccount({...newAccount,parentCompanyCode:e.target.value})}/>}
          <button disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-[#00E676] px-4 py-3 font-semibold text-black disabled:opacity-50"><Plus size={16}/>Buat akun</button>
        </form>
        {accountLoading ? <p className="text-sm text-neutral-400">Memuat akun...</p> : accounts.length === 0 ? <div className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-neutral-400">Belum ada akun yang dapat ditampilkan. Pastikan endpoint GAS terbaru sudah di-deploy.</div> : <div className="space-y-3">{accounts.map(account => <div key={account.id} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_130px] md:items-center">
            <div><div className="font-medium text-white">{account.displayName}</div><div className="text-xs text-neutral-400">{account.email}</div><div className="mt-1 text-xs text-neutral-500">{account.companyCode || 'Perusahaan belum ditentukan'}{account.parentCompanyCode ? ` · Induk: ${account.parentCompanyCode}` : ''}</div><div className="mt-1 text-xs text-neutral-500">{[account.position, account.department, account.section].filter(Boolean).join(' · ')}</div></div>
            <span className="inline-flex w-fit rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-200">{account.roles[0] || 'Pending Approval'} · {account.status || 'INACTIVE'}</span>
            {account.status === 'PENDING' ? <span className="text-xs text-amber-300">Menunggu verifikasi</span> : <button disabled={busy || account.id===user?.id} onClick={() => void updateAccount(account.id,{status:account.status==='ACTIVE'?'INACTIVE':'ACTIVE'})} className={`rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-40 ${account.status==='ACTIVE'?'border-emerald-400/30 text-emerald-300':'border-red-400/30 text-red-300'}`}>{account.status==='ACTIVE'?'Aktif · Nonaktifkan':'Nonaktif · Aktifkan'}</button>}
          </div>
          {account.status === 'PENDING' && <form onSubmit={event=>void approveGoogleAccount(event,account)} className="grid gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 md:grid-cols-2">
            <p className="text-xs text-amber-200 md:col-span-2">Periksa data pendaftar sebelum memberikan akses. Perusahaan yang diketik pengguna belum diverifikasi otomatis.</p>
            <select name="role" className={inputClass} defaultValue="Contractor"><option value="Contractor">Kontraktor</option><option value="Subkon">Subkontraktor</option></select>
            <input name="companyCode" required className={inputClass} defaultValue={account.companyCode || ''} placeholder="Kode perusahaan, contoh SLS"/>
            <input name="parentCompanyCode" className={inputClass} defaultValue="" placeholder="Kode Contractor induk (wajib untuk Subkon)"/>
            <button disabled={busy} className="rounded-xl bg-[#00E676] px-3 py-2.5 text-sm font-semibold text-black disabled:opacity-50 md:col-span-2">Verifikasi & Aktifkan Akun</button>
          </form>}
        </div>)}</div>}
        <p className="text-xs text-neutral-500">Google Sign-In hanya berlaku bagi email yang sudah didaftarkan Admin CGG. Admin CGG memiliki akses lintas kontraktor; kontraktor dibatasi ke perusahaan sendiri dan subkon terdaftar; subkon hanya ke perusahaannya sendiri.</p>
      </section>}
    </div>
  );
};
