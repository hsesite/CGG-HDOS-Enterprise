import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Clock, CheckCircle2, AlertCircle, UserCheck, Calendar, Filter, ShieldCheck } from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { PICA } from '../../core/types';
import { getCurrentUser } from '../../core/auth-utils';
import { hdosAuth } from '../../core/auth';
import { saveOfflineOperationalPhoto } from '../../core/offline-photos';

export const PICAModule: React.FC = () => {
  const store = useHDOSStore();
  const currentUser = hdosAuth.getCurrentUser();
  const sessionUser = getCurrentUser();
  const [selectedPica, setSelectedPica] = useState<PICA | null>(null);
  const [filterStatus, setFilterStatus] = useState<'ACTIVE' | 'ALL' | 'CLOSED'>('ACTIVE');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [evidencePhotoUrl, setEvidencePhotoUrl] = useState('');
  const [evidencePhotoFileId, setEvidencePhotoFileId] = useState('');
  const [evidencePhotoFile, setEvidencePhotoFile] = useState<File | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isPIC = (pica: PICA) => Boolean(sessionUser?.email && pica.assignedToEmail?.toLowerCase() === sessionUser.email.toLowerCase());
  const sessionRoles = sessionUser?.roles || [];
  const isVerifiedReviewer = sessionUser?.roleVerified === true && sessionRoles.some((role) => ['Foreman Safety', 'SPV HSE', 'KTT', 'Project Manager'].includes(role));
  const isHSEValidator = sessionUser?.roleVerified === true && sessionRoles.some((role) => ['Foreman Safety', 'SPV HSE'].includes(role));
  const approvalStagesFor = (pica: PICA) => pica.approvalStages || { foreman: false, spvHse: false };

  useEffect(() => {
    if (!selectedPica) return;
    setCorrectiveAction(selectedPica.correctiveAction || '');
    setEvidencePhotoUrl(selectedPica.evidencePhotoUrl || '');
    setEvidencePhotoFileId(selectedPica.evidencePhotoFileId || '');
    setEvidencePhotoFile(null);
    setRejectionReason('');
  }, [selectedPica?.id, selectedPica?.updatedAt]);

  const getMetrics = (pica: PICA) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const created = new Date(String(pica.createdAt || '').slice(0, 10) + 'T00:00:00');
    const target = new Date(String(pica.targetDate || '').slice(0, 10) + 'T00:00:00');
    const aging = Number.isNaN(created.getTime()) ? Math.max(0, Number(pica.daysAging) || 0) : Math.max(0, Math.floor((today.getTime() - created.getTime()) / 86400000));
    const status = pica.status !== 'CLOSED' && pica.status !== 'WAITING_HSE' && !Number.isNaN(target.getTime()) && target < today ? 'OVERDUE' : pica.status;
    return { aging, status };
  };
  const canViewAllPicas = sessionRoles.some((role) => ['Admin CGG', 'Company Admin'].includes(role)) || isVerifiedReviewer;
  const accessiblePicas = store.picas.filter((pica) => canViewAllPicas || Boolean(sessionUser?.email && pica.assignedToEmail?.toLowerCase() === sessionUser.email.toLowerCase()));
  const picas = useMemo(() => accessiblePicas.map((pica) => ({ pica, ...getMetrics(pica) })), [store.picas, sessionUser?.email, canViewAllPicas]);
  const visible = picas.filter(({ pica, status }) => {
    if (filterStatus === 'ACTIVE') return status !== 'CLOSED';
    if (filterStatus === 'CLOSED') return status === 'CLOSED';
    return true;
  });
  const openCount = picas.filter(({ status }) => status === 'OPEN' || status === 'OVERDUE').length;
  const progressCount = picas.filter(({ status }) => status === 'PROGRESS').length;
  const waitingCount = picas.filter(({ status }) => status === 'WAITING_HSE').length;
  const closedCount = picas.filter(({ status }) => status === 'CLOSED').length;

  const uploadEvidenceIfSelected = async () => {
    if (!evidencePhotoFile) return { evidencePhotoUrl, evidencePhotoFileId };
    const localPhotoId = await saveOfflineOperationalPhoto(evidencePhotoFile);
    const offlineReference = `offline:${localPhotoId}`;
    setEvidencePhotoUrl(offlineReference);
    setEvidencePhotoFileId(offlineReference);
    setEvidencePhotoFile(null);
    return { evidencePhotoUrl: offlineReference, evidencePhotoFileId: offlineReference, localPhotoId };
  };

  const savePICProgress = async () => {
    if (!selectedPica) return;
    setBusy(true);
    try {
      const evidence = await uploadEvidenceIfSelected();
      const updated = await store.updatePICAStatus(selectedPica.id, { status: 'PROGRESS', correctiveAction, ...evidence });
      if (updated) setSelectedPica(updated);
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Gagal menyimpan tindakan PIC.'); }
    finally { setBusy(false); }
  };
  const submitForHSE = async () => {
    if (!selectedPica) return;
    if (!correctiveAction.trim() || (!evidencePhotoUrl.trim() && !evidencePhotoFile)) { window.alert('Tindakan perbaikan dan foto bukti wajib diisi.'); return; }
    setBusy(true);
    try {
      const evidence = await uploadEvidenceIfSelected();
      const updated = await store.updatePICAStatus(selectedPica.id, { status: 'WAITING_HSE', correctiveAction, ...evidence });
      if (updated) setSelectedPica(updated);
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Gagal mengajukan PICA.'); }
    finally { setBusy(false); }
  };
  const validateClose = async () => {
    if (!selectedPica) return;
    setBusy(true);
    try {
      const updated = await store.updatePICAStatus(selectedPica.id, { status: 'CLOSED' });
      if (updated) setSelectedPica(updated);
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Validasi HSE gagal.'); }
    finally { setBusy(false); }
  };
  const returnToPIC = async () => {
    if (!selectedPica || !rejectionReason.trim()) { window.alert('Isi alasan pengembalian kepada PIC.'); return; }
    setBusy(true);
    try {
      const updated = await store.updatePICAStatus(selectedPica.id, { status: 'PROGRESS', rejectionReason });
      if (updated) setSelectedPica(updated);
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Gagal mengembalikan PICA.'); }
    finally { setBusy(false); }
  };

  const approvePicaStage = async (stage: 'foreman' | 'spvHse') => {
    if (!selectedPica || selectedPica.status !== 'WAITING_HSE') return;
    const requiredRole = stage === 'foreman' ? 'Foreman Safety' : 'SPV HSE';
    if (sessionUser?.roleVerified !== true || !sessionRoles.includes(requiredRole)) {
      window.alert('Persetujuan hanya dapat dilakukan oleh pejabat dengan role terverifikasi.');
      return;
    }
    const currentStages = approvalStagesFor(selectedPica);
    if (stage === 'spvHse' && !currentStages.foreman) { window.alert('Persetujuan Foreman Safety harus diselesaikan terlebih dahulu.'); return; }
      setBusy(true);
    try {
      const updated = await store.updatePICAStatus(selectedPica.id, {
        approvalStages: { ...currentStages, [stage]: true }
      });
      if (updated) setSelectedPica(updated);
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Persetujuan PICA gagal disimpan.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6 max-w-6xl mx-auto">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-white/10">
      <div><h2 className="text-lg font-bold text-white flex items-center gap-2"><CheckSquare className="w-5 h-5 text-[#FFC107]" /> PICA · Tindak Lanjut Temuan</h2>
        <p className="text-xs text-neutral-400 mt-1">PIC departemen menindaklanjuti temuan. Penutupan memerlukan persetujuan berurutan Foreman Safety dan SPV HSE, kemudian validasi akhir HSE.</p></div>
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white">
        <option value="ACTIVE">PICA Aktif</option><option value="CLOSED">Riwayat Closed</option><option value="ALL">Semua PICA</option>
      </select>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[['Open / Overdue',openCount,'text-amber-300'],['Dalam Progress',progressCount,'text-blue-300'],['Menunggu Validasi HSE',waitingCount,'text-purple-300'],['Closed',closedCount,'text-emerald-300']].map(([label,value,color]) => <div key={String(label)} className="apple-glass-card p-4 rounded-xl"><p className="text-[11px] text-neutral-400">{label}</p><p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p></div>)}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 apple-glass-card p-4 rounded-2xl space-y-2">
        <div className="flex items-center justify-between border-b border-white/10 pb-3"><h3 className="text-xs font-bold uppercase text-neutral-300">Register PICA</h3><span className="text-xs text-neutral-400">{visible.length} tiket</span></div>
        {visible.map(({pica,aging,status}) => <button key={pica.id} onClick={() => setSelectedPica(pica)} className={`w-full text-left p-3 rounded-xl border mb-2 ${selectedPica?.id === pica.id ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/5 hover:bg-white/5'}`}>
          <div className="flex justify-between gap-2"><span className="text-xs font-bold text-amber-300">{pica.code}</span><span className="text-[10px] text-neutral-300">{status}</span></div>
          <p className="text-xs text-white mt-1">{pica.findingDescription}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-neutral-400"><span>Departemen: {pica.picDepartment || '-'}</span><span>PIC: {pica.picName || '-'}</span><span>Target: {pica.targetDate || '-'}</span><span>Aging: {aging} hari</span></div>
        </button>)}
        {visible.length === 0 && <p className="text-xs text-neutral-500 py-8 text-center">Tidak ada PICA pada kategori ini.</p>}
      </div>
      <div className="apple-glass-card p-5 rounded-2xl space-y-4">
        {selectedPica ? <>
          <div className="border-b border-white/10 pb-3"><p className="text-xs font-bold text-amber-300">{selectedPica.code}</p><p className="text-sm font-semibold text-white mt-1">{selectedPica.picDepartment} · {selectedPica.picName}</p><p className="text-[10px] text-neutral-400">Akun PIC: {selectedPica.assignedToEmail || 'Belum ditautkan'}</p></div>
          <div><p className="text-[10px] text-neutral-400">Temuan</p><p className="text-xs text-white mt-1">{selectedPica.findingDescription}</p></div>
          <div><p className="text-[10px] text-neutral-400">Tindakan perbaikan</p><textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} disabled={!isPIC(selectedPica) || selectedPica.status === 'CLOSED' || selectedPica.status === 'WAITING_HSE'} rows={4} className="w-full mt-1 p-2 rounded-lg bg-black/30 border border-white/10 text-xs text-white disabled:opacity-60" /></div>
          <div>
            <p className="text-[10px] text-neutral-400">Foto bukti penyelesaian *</p>
            {evidencePhotoUrl && <a href={evidencePhotoUrl} target="_blank" rel="noreferrer" className="inline-flex mt-2 text-xs text-blue-300 underline">Lihat foto bukti tersimpan</a>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setEvidencePhotoFile(e.target.files?.[0] || null)} disabled={!isPIC(selectedPica) || selectedPica.status === 'CLOSED' || selectedPica.status === 'WAITING_HSE'} className="w-full mt-2 text-xs text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400/20 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-amber-200 disabled:opacity-60" />
            <p className="mt-1 text-[10px] text-neutral-500">{evidencePhotoFile ? `Foto dipilih: ${evidencePhotoFile.name}` : 'Pilih foto JPG, PNG, atau WEBP (maks. 5 MB). Foto disimpan di perangkat terlebih dahulu dan diunggah otomatis saat sinkronisasi.'}</p>
          </div>
          {selectedPica.rejectionReason && <p className="text-xs text-red-300 bg-red-500/10 p-2 rounded-lg">Dikembalikan HSE: {selectedPica.rejectionReason}</p>}
          {selectedPica.status === 'WAITING_HSE' && <div className="text-xs text-purple-200 bg-purple-500/10 p-3 rounded-lg space-y-2">
            <p className="font-semibold">Tahapan persetujuan PICA</p>
            {(['foreman','spvHse'] as const).map((stage) => {
              const stages = approvalStagesFor(selectedPica);
              const label = stage === 'foreman' ? 'Foreman Safety' : 'SPV HSE';
              const previousApproved = stage === 'foreman' || (stage === 'spvHse' && stages.foreman);
              const roleCanApprove = sessionUser?.roleVerified === true && sessionRoles.includes(label);
              return <div key={stage} className="flex items-center justify-between gap-2">
                <span>{label}</span>
                {stages[stage] ? <span className="text-emerald-300">Disetujui</span> :
                  roleCanApprove && previousApproved ? <button disabled={busy} onClick={() => approvePicaStage(stage)} className="px-2 py-1 rounded bg-emerald-400 text-black text-[10px] font-bold disabled:opacity-50">Setujui</button> :
                  <span className="text-neutral-500">Menunggu</span>}
              </div>;
            })}
            <p className="text-[10px] text-neutral-400">Setiap tahap hanya dapat disetujui oleh pemegang role yang sesuai dan telah diverifikasi.</p>
          </div>}
          {selectedPica.status === 'CLOSED' && <p className="text-xs text-emerald-300 bg-emerald-500/10 p-2 rounded-lg">Closed oleh {selectedPica.hseValidatedBy || 'HSE'} ({selectedPica.hseValidatedRole || '-'}) pada {selectedPica.completionDate || '-'}</p>}
          {isPIC(selectedPica) && ['OPEN','PROGRESS'].includes(selectedPica.status) && <div className="space-y-2"><button disabled={busy} onClick={savePICProgress} className="w-full p-2 rounded-lg bg-blue-500/20 text-blue-200 text-xs font-semibold disabled:opacity-50">Simpan Progress</button><button disabled={busy} onClick={submitForHSE} className="w-full p-2 rounded-lg bg-emerald-400 text-black text-xs font-bold disabled:opacity-50">Ajukan Close ke HSE</button></div>}
          {isHSEValidator && selectedPica.status === 'WAITING_HSE' && <div className="space-y-2 border-t border-white/10 pt-3"><p className="text-xs font-bold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Validasi akhir HSE</p>
            {approvalStagesFor(selectedPica).foreman && approvalStagesFor(selectedPica).spvHse
              ? <button disabled={busy} onClick={validateClose} className="w-full p-2 rounded-lg bg-emerald-400 text-black text-xs font-bold disabled:opacity-50">Validasi & Close PICA</button>
              : <p className="text-[10px] text-amber-300">Penutupan tersedia setelah persetujuan Foreman Safety dan SPV HSE selesai.</p>}
            {!Object.values(approvalStagesFor(selectedPica)).some(Boolean) && <><textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={2} placeholder="Alasan jika bukti belum sesuai" className="w-full p-2 rounded-lg bg-black/30 border border-white/10 text-xs text-white" /><button disabled={busy} onClick={returnToPIC} className="w-full p-2 rounded-lg bg-red-500/20 text-red-200 text-xs font-semibold disabled:opacity-50">Kembalikan ke PIC</button></>}
          </div>}
        </> : <div className="text-center text-xs text-neutral-500 py-12"><UserCheck className="w-8 h-8 mx-auto mb-2" />Pilih PICA untuk melihat penugasan dan tindak lanjut.</div>}
      </div>
    </div>
  </div>;
};
