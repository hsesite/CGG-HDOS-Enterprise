import React, { useEffect, useMemo, useState } from 'react';
import {
  HardHat,
  ShieldCheck,
  Phone,
  FileCheck,
  Truck,
  AlertTriangle,
  Award,
  Plus,
  Save,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { ContractorPassport } from '../../core/types';
import { RemoteRefreshControl } from '../ui/RemoteRefreshControl';

const getEmptyForm = () => ({
  code: '',
  companyName: '',
  picName: '',
  picContact: '',
  manpowerCount: 0,
  equipmentCount: 0,
  kpiSafetyScore: 85,
  safeHours: 0,
  activePicaCount: 0,
  mcuCompliancePercent: 100,
  inductionRatePercent: 100,
  status: 'ACTIVE' as ContractorPassport['status'],
  safetyPassportExpiry: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
});

export const ContractorModule: React.FC = () => {
  const store = useHDOSStore();
  const [selectedContractorId, setSelectedContractorId] = useState<string>(store.contractors[0]?.id ?? '');
  const [creating, setCreating] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [createForm, setCreateForm] = useState(getEmptyForm);
  const [editForm, setEditForm] = useState(getEmptyForm);

  const selectedContractor = useMemo(
    () => store.contractors.find((contractor) => contractor.id === selectedContractorId) ?? store.contractors[0] ?? null,
    [selectedContractorId, store.contractors],
  );

  useEffect(() => {
    if (selectedContractor && selectedContractor.id !== selectedContractorId) {
      setSelectedContractorId(selectedContractor.id);
    }
  }, [selectedContractor, selectedContractorId]);

  useEffect(() => {
    if (selectedContractor) {
      setEditForm({
        code: selectedContractor.code,
        companyName: selectedContractor.companyName,
        picName: selectedContractor.picName,
        picContact: selectedContractor.picContact,
        manpowerCount: selectedContractor.manpowerCount,
        equipmentCount: selectedContractor.equipmentCount,
        kpiSafetyScore: selectedContractor.kpiSafetyScore,
        safeHours: selectedContractor.safeHours,
        activePicaCount: selectedContractor.activePicaCount,
        mcuCompliancePercent: selectedContractor.mcuCompliancePercent,
        inductionRatePercent: selectedContractor.inductionRatePercent,
        status: selectedContractor.status,
        safetyPassportExpiry: selectedContractor.safetyPassportExpiry,
      });
    }
  }, [selectedContractor]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingCreate(true);
    setErrorMessage('');

    try {
      const created = await store.addContractor({
        ...createForm,
        code: createForm.code.trim().toUpperCase(),
        companyName: createForm.companyName.trim(),
        picName: createForm.picName.trim(),
        picContact: createForm.picContact.trim(),
      });
      setSuccessMessage(`Contractor ${created.code} berhasil didaftarkan dan tersimpan di queue sinkronisasi offline.`);
      setCreateForm(getEmptyForm());
      setCreating(false);
      setSelectedContractorId(created.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal mendaftarkan contractor.');
    } finally {
      setSavingCreate(false);
    }
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedContractor) return;
    setSavingUpdate(true);
    setErrorMessage('');

    try {
      const updated = await store.updateContractor(selectedContractor.id, {
        ...editForm,
        code: editForm.code.trim().toUpperCase(),
        companyName: editForm.companyName.trim(),
        picName: editForm.picName.trim(),
        picContact: editForm.picContact.trim(),
      });
      if (!updated) {
        throw new Error('Data contractor tidak ditemukan.');
      }
      setSuccessMessage(`Contractor ${updated.code} berhasil diperbarui dan tetap tersedia setelah refresh.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal memperbarui contractor.');
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleCreateNumberChange = (field: 'manpowerCount' | 'equipmentCount' | 'kpiSafetyScore' | 'safeHours' | 'activePicaCount' | 'mcuCompliancePercent' | 'inductionRatePercent', value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: Number(value) || 0 }));
  };

  const handleEditNumberChange = (field: 'manpowerCount' | 'equipmentCount' | 'kpiSafetyScore' | 'safeHours' | 'activePicaCount' | 'mcuCompliancePercent' | 'inductionRatePercent', value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: Number(value) || 0 }));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <HardHat className="w-5 h-5 text-[#F59E0B]" />
            Contractor Passport &amp; Subcontractor Compliance
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Register contractor kini tersimpan lokal, tetap muncul setelah refresh, dan ikut queue sinkronisasi saat offline.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
            {store.contractors.length} Mitra Kerja Terdaftar
          </span>
          <button
            onClick={() => {
              setCreating((prev) => !prev);
              setErrorMessage('');
            }}
            className="px-3 py-2 rounded-xl bg-[#F59E0B] hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{creating ? 'Tutup Form' : 'Daftarkan Contractor'}</span>
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {store.lastInitError && (
        <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          <span>Data contractor lokal gagal dimuat penuh: {store.lastInitError}</span>
        </div>
      )}

      <RemoteRefreshControl label="Contractor" />

      {creating && (
        <form onSubmit={handleCreate} className="apple-glass-card p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#F59E0B]" />
              Registrasi Contractor Baru
            </h3>
            <span className="text-[11px] text-neutral-400">Disimpan lokal dulu, sinkron belakangan bila perlu</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <input value={createForm.code} onChange={(e) => setCreateForm((prev) => ({ ...prev, code: e.target.value }))} placeholder="Kode Mitra" required className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
            <input value={createForm.companyName} onChange={(e) => setCreateForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="Nama Perusahaan" required className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
            <input value={createForm.picName} onChange={(e) => setCreateForm((prev) => ({ ...prev, picName: e.target.value }))} placeholder="PIC Safety" required className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
            <input value={createForm.picContact} onChange={(e) => setCreateForm((prev) => ({ ...prev, picContact: e.target.value }))} placeholder="Kontak PIC" required className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
            <input type="number" min="0" value={createForm.manpowerCount} onChange={(e) => handleCreateNumberChange('manpowerCount', e.target.value)} placeholder="Manpower" className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
            <input type="number" min="0" value={createForm.equipmentCount} onChange={(e) => handleCreateNumberChange('equipmentCount', e.target.value)} placeholder="Equipment" className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
            <input type="number" min="0" max="100" value={createForm.kpiSafetyScore} onChange={(e) => handleCreateNumberChange('kpiSafetyScore', e.target.value)} placeholder="KPI Safety" className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
            <input type="date" value={createForm.safetyPassportExpiry} onChange={(e) => setCreateForm((prev) => ({ ...prev, safetyPassportExpiry: e.target.value }))} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={savingCreate} className="px-4 py-2 rounded-xl bg-[#00E676] text-black font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50">
              <Save className="w-4 h-4" />
              <span>{savingCreate ? 'Menyimpan...' : 'Simpan Contractor'}</span>
            </button>
          </div>
        </form>
      )}

      {store.isInitializing && !store.isInitialized ? (
        <div className="apple-glass-card p-8 rounded-2xl text-center text-neutral-400 text-xs">
          Memuat contractor passport dari penyimpanan lokal...
        </div>
      ) : store.contractors.length === 0 ? (
        <div className="apple-glass-card p-8 rounded-2xl text-center text-neutral-400 text-xs">
          Belum ada contractor terdaftar. Gunakan tombol <strong className="text-white">Daftarkan Contractor</strong> untuk mulai membuat passport.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {store.contractors.map((contractor) => {
              const isSelected = selectedContractor?.id === contractor.id;

              return (
                <div
                  key={contractor.id}
                  onClick={() => setSelectedContractorId(contractor.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/50 shadow-xl'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 font-black flex items-center justify-center font-mono text-base border border-amber-500/30">
                        {contractor.code}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white leading-tight">{contractor.companyName}</h4>
                        <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">PIC: {contractor.picName}</div>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      contractor.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : contractor.status === 'WARNING'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-red-500/20 text-red-300'
                    }`}>
                      {contractor.status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] border-t border-white/5 pt-2 font-mono">
                    <div>
                      <span className="text-neutral-400">KPI:</span> <strong className="text-[#00E676]">{contractor.kpiSafetyScore}%</strong>
                    </div>
                    <div>
                      <span className="text-neutral-400">Crew:</span> <strong className="text-white">{contractor.manpowerCount}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedContractor && (
            <div className="apple-glass-card p-6 rounded-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 font-black flex items-center justify-center font-mono text-2xl border border-amber-500/30">
                    {selectedContractor.code}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">{selectedContractor.companyName}</h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                        Local-first
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                      <span>PIC Safety: <strong className="text-white">{selectedContractor.picName}</strong></span>
                      <span>·</span>
                      <span className="flex items-center gap-1 font-mono text-neutral-300">
                        <Phone className="w-3 h-3 text-neutral-400" /> {selectedContractor.picContact}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right text-xs">
                  <div className="text-neutral-400 font-mono">Masa Berlaku Safety Passport:</div>
                  <div className="text-[#00E676] font-bold font-mono text-sm mt-0.5">
                    {selectedContractor.safetyPassportExpiry}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between text-neutral-400 text-xs">
                    <span>MCU Tahunan</span>
                    <FileCheck className="w-4 h-4 text-[#00E676]" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">{selectedContractor.mcuCompliancePercent}%</div>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between text-neutral-400 text-xs">
                    <span>Induksi Safety</span>
                    <Award className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">{selectedContractor.inductionRatePercent}%</div>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between text-neutral-400 text-xs">
                    <span>Jam Kerja Selamat</span>
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-white font-mono mt-1 truncate">{selectedContractor.safeHours.toLocaleString('id-ID')}</div>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between text-neutral-400 text-xs">
                    <span>PICA Aktif</span>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="text-2xl font-bold text-amber-400 font-mono mt-1">{selectedContractor.activePicaCount}</div>
                </div>
              </div>

              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-white/10 text-neutral-300 text-xs font-semibold">
                  <Users className="w-4 h-4 text-[#F59E0B]" />
                  Update Passport Contractor
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <input value={editForm.code} onChange={(e) => setEditForm((prev) => ({ ...prev, code: e.target.value }))} required className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input value={editForm.companyName} onChange={(e) => setEditForm((prev) => ({ ...prev, companyName: e.target.value }))} required className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input value={editForm.picName} onChange={(e) => setEditForm((prev) => ({ ...prev, picName: e.target.value }))} required className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input value={editForm.picContact} onChange={(e) => setEditForm((prev) => ({ ...prev, picContact: e.target.value }))} required className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input type="number" min="0" value={editForm.manpowerCount} onChange={(e) => handleEditNumberChange('manpowerCount', e.target.value)} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input type="number" min="0" value={editForm.equipmentCount} onChange={(e) => handleEditNumberChange('equipmentCount', e.target.value)} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input type="number" min="0" max="100" value={editForm.kpiSafetyScore} onChange={(e) => handleEditNumberChange('kpiSafetyScore', e.target.value)} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <select value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as ContractorPassport['status'] }))} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white">
                    <option value="ACTIVE" className="bg-neutral-900">ACTIVE</option>
                    <option value="WARNING" className="bg-neutral-900">WARNING</option>
                    <option value="SUSPENDED" className="bg-neutral-900">SUSPENDED</option>
                  </select>
                  <input type="number" min="0" max="100" value={editForm.mcuCompliancePercent} onChange={(e) => handleEditNumberChange('mcuCompliancePercent', e.target.value)} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input type="number" min="0" max="100" value={editForm.inductionRatePercent} onChange={(e) => handleEditNumberChange('inductionRatePercent', e.target.value)} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input type="number" min="0" value={editForm.safeHours} onChange={(e) => handleEditNumberChange('safeHours', e.target.value)} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input type="number" min="0" value={editForm.activePicaCount} onChange={(e) => handleEditNumberChange('activePicaCount', e.target.value)} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white" />
                  <input type="date" value={editForm.safetyPassportExpiry} onChange={(e) => setEditForm((prev) => ({ ...prev, safetyPassportExpiry: e.target.value }))} className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white sm:col-span-2 lg:col-span-1" />
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-[#F59E0B]" />
                      Fleet &amp; Compliance Snapshot
                    </h4>
                    <span className="text-xs font-mono text-neutral-400">
                      Total: {editForm.equipmentCount} Unit
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-neutral-300">MCU {editForm.mcuCompliancePercent}% crew aktif.</div>
                    <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-neutral-300">Safety induction {editForm.inductionRatePercent}% crew.</div>
                    <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-neutral-300">{editForm.activePicaCount} PICA aktif dipantau.</div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button type="submit" disabled={savingUpdate} className="px-4 py-2 rounded-xl bg-[#42A5F5] text-black font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    <span>{savingUpdate ? 'Menyimpan Perubahan...' : 'Simpan Perubahan'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
};
