import React, { useEffect, useState } from 'react';
import {
  HardHat,
  ShieldCheck,
  Building2,
  Users,
  Truck,
  CheckCircle,
  AlertTriangle,
  Award,
  Phone,
  FileCheck,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { ContractorPassport } from '../../core/types';
import { hseApi, type ContractorComplianceReport, type ContractorComplianceReportInput } from '../../core/api';
import { getCurrentUser } from '../../core/auth-utils';

export const ContractorModule: React.FC = () => {
  const store = useHDOSStore();
  const sessionUser = getCurrentUser();
  const [selectedContractor, setSelectedContractor] = useState<ContractorPassport | undefined>(store.contractors[0]);
  const [complianceReports, setComplianceReports] = useState<ContractorComplianceReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [editingReportId, setEditingReportId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const [reportDraft, setReportDraft] = useState({
    period: currentPeriod, manpowerCount: '', equipmentCount: '',
    mcuEligibleCount: '', mcuFitCount: '', inductionRequiredCount: '',
    inductionCompletedCount: '', safeHours: '', ltiCount: '0', remarks: ''
  });
  const sessionRoles = sessionUser?.roles || [];
  const ownCompanyCode = String(sessionUser?.companyCode || '').trim().toUpperCase();
  const canSubmitReport = Boolean(sessionUser && ownCompanyCode && ownCompanyCode !== 'CGG' &&
    sessionRoles.some(role => ['Company Admin', 'Contractor', 'Subkon', 'Contractor PIC'].includes(role)));
  const canReviewReport = Boolean(sessionUser?.roleVerified === true &&
    (sessionRoles.includes('Admin CGG') || sessionRoles.some(role => ['Foreman Safety', 'SPV HSE'].includes(role))));

  const selectedCompanyCode = String(selectedContractor?.code || '').trim().toUpperCase();
  const selectedCompanyPicas = store.picas.filter((pica) => {
    const record = pica as unknown as Record<string, unknown>;
    const operatingCompany = String(record.subcontractorCode || record.subkonCode || record.companyCode || record.contractorCode || '').trim().toUpperCase();
    const parentCompany = String(record.parentCompanyCode || '').trim().toUpperCase();
    return operatingCompany === selectedCompanyCode || parentCompany === selectedCompanyCode;
  });
  const actualActivePicaCount = selectedCompanyPicas.filter(pica => pica.status !== 'CLOSED').length;

  // The company master arrives asynchronously after the local workspace is loaded.
  // Keep the selected passport aligned with the authoritative store.
  useEffect(() => {
    if (store.contractors.length === 0) {
      setSelectedContractor(undefined);
      return;
    }
    setSelectedContractor(current => {
      if (!current) return store.contractors[0];
      return store.contractors.find(company => company.code.toUpperCase() === current.code.toUpperCase())
        || store.contractors[0];
    });
  }, [store.contractors]);

  useEffect(() => {
    let active = true;
    setReportsLoading(true);
    hseApi.listContractorComplianceReports()
      .then(reports => { if (active) setComplianceReports(reports); })
      .catch(error => { if (active) setReportMessage(error instanceof Error ? error.message : 'Laporan kepatuhan tidak dapat dimuat.'); })
      .finally(() => { if (active) setReportsLoading(false); });
    return () => { active = false; };
  }, []);

  const refreshComplianceReports = async () => {
    setReportsLoading(true);
    try {
      setComplianceReports(await hseApi.listContractorComplianceReports());
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : 'Laporan kepatuhan tidak dapat dimuat.');
    } finally {
      setReportsLoading(false);
    }
  };

  const submitComplianceReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReportBusy(true);
    setReportMessage('');
    const payload: ContractorComplianceReportInput = {
      period: reportDraft.period,
      manpowerCount: Number(reportDraft.manpowerCount),
      equipmentCount: Number(reportDraft.equipmentCount),
      mcuEligibleCount: Number(reportDraft.mcuEligibleCount),
      mcuFitCount: Number(reportDraft.mcuFitCount),
      inductionRequiredCount: Number(reportDraft.inductionRequiredCount),
      inductionCompletedCount: Number(reportDraft.inductionCompletedCount),
      safeHours: Number(reportDraft.safeHours),
      ltiCount: Number(reportDraft.ltiCount),
      remarks: reportDraft.remarks.trim()
    };
    try {
      if (editingReportId) await hseApi.updateContractorComplianceReport(editingReportId, payload);
      else await hseApi.submitContractorComplianceReport(payload);
      setEditingReportId('');
      setReportDraft({ period: currentPeriod, manpowerCount: '', equipmentCount: '', mcuEligibleCount: '', mcuFitCount: '', inductionRequiredCount: '', inductionCompletedCount: '', safeHours: '', ltiCount: '0', remarks: '' });
      setReportMessage('Laporan berhasil dikirim dan menunggu verifikasi HSE.');
      await refreshComplianceReports();
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : 'Laporan gagal disimpan.');
    } finally {
      setReportBusy(false);
    }
  };

  const reviewComplianceReport = async (report: ContractorComplianceReport, action: 'VERIFY' | 'RETURN') => {
    if (action === 'RETURN' && !reviewNotes.trim()) {
      setReportMessage('Alasan pengembalian wajib diisi.');
      return;
    }
    setReportBusy(true);
    setReportMessage('');
    try {
      await hseApi.updateContractorComplianceReport(report.id, { action, reviewNotes: reviewNotes.trim() });
      setReviewNotes('');
      setReportMessage(action === 'VERIFY' ? 'Laporan diverifikasi.' : 'Laporan dikembalikan kepada perusahaan untuk diperbaiki.');
      await refreshComplianceReports();
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : 'Review laporan gagal disimpan.');
    } finally {
      setReportBusy(false);
    }
  };

  const startReportCorrection = (report: ContractorComplianceReport) => {
    setEditingReportId(report.id);
    setReportDraft({
      period: report.period,
      manpowerCount: String(report.manpowerCount),
      equipmentCount: String(report.equipmentCount),
      mcuEligibleCount: String(report.mcuEligibleCount),
      mcuFitCount: String(report.mcuFitCount),
      inductionRequiredCount: String(report.inductionRequiredCount),
      inductionCompletedCount: String(report.inductionCompletedCount),
      safeHours: String(report.safeHours),
      ltiCount: String(report.ltiCount),
      remarks: report.remarks || ''
    });
    setReportMessage('Perbaiki data sesuai catatan HSE, lalu kirim ulang laporan.');
  };

  const selectedVerifiedReport = complianceReports
    .filter(report => report.companyCode.toUpperCase() === selectedCompanyCode && report.status === 'VERIFIED')
    .sort((a, b) => b.period.localeCompare(a.period))[0];
  const selectedCompanyReports = complianceReports
    .filter(report => report.companyCode.toUpperCase() === selectedCompanyCode ||
      (report.parentCompanyCode || '').toUpperCase() === selectedCompanyCode)
    .sort((a, b) => b.period.localeCompare(a.period));

  const activeCompanyCount = store.contractors.filter(company => company.status === 'ACTIVE').length;
  const passportExpiry = selectedContractor?.safetyPassportExpiry
    ? new Date(selectedContractor.safetyPassportExpiry.slice(0, 10) + 'T00:00:00')
    : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const passportDaysRemaining = passportExpiry && !Number.isNaN(passportExpiry.getTime())
    ? Math.ceil((passportExpiry.getTime() - today.getTime()) / 86400000)
    : null;

  if (store.contractors.length === 0 || !selectedContractor) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white"><HardHat className="h-5 w-5 text-amber-400"/>Contractor Passport</h2>
        <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-neutral-500"/>
          <p className="font-semibold text-white">Belum ada data kontraktor</p>
          <p className="mt-2 text-sm text-neutral-400">Tambahkan kontraktor melalui modul Pengaturan. Manpower, jam kerja, MCU, dan KPI akan tetap kosong sampai data aktual dimasukkan.</p>
          <button onClick={() => store.openWindow('settings')} className="mt-4 rounded-xl bg-[#00E676] px-4 py-2 text-sm font-semibold text-black">Buka Pengaturan</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <HardHat className="w-5 h-5 text-[#F59E0B]" />
            Contractor Passport &amp; Subcontractor Compliance
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Passport digital kontraktor pertambangan: verifikasi MCU, kepatuhan safety induction, rasio PICA, dan Safe Hours.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
            {activeCompanyCount} dari {store.contractors.length} Mitra Kerja Aktif
          </span>
        </div>
      </div>

      {/* Contractor Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {store.contractors.map((c) => {
          const isSelected = selectedContractor.id === c.id;

          return (
            <div
              key={c.id}
              onClick={() => setSelectedContractor(c)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500/15 border-amber-500/50 shadow-xl'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 font-black flex items-center justify-center font-mono text-base border border-amber-500/30">
                    {c.code}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">{c.companyName}</h4>
                    <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">Kode Mitra: {c.code}</div>
                    <div className="mt-1 text-[10px] text-neutral-500">
                      {c.companyRole || 'Perusahaan'}
                      {c.parentCompanyCode ? ` · Induk: ${c.parentCompanyCode}` : ''}
                    </div>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : c.status === 'WARNING' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                  {c.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] border-t border-white/5 pt-2 font-mono">
                <div>
                  <span className="text-neutral-400">KPI Safety:</span>{' '}
                  <strong className="text-[#00E676]">{c.kpiSafetyScore > 0 ? `${c.kpiSafetyScore}%` : '—'}</strong>
                </div>
                <div>
                  <span className="text-neutral-400">Manpower:</span>{' '}
                  <strong className="text-white">{c.manpowerCount > 0 ? `${c.manpowerCount} org` : 'Belum tersedia'}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Contractor Passport View */}
      <div className="apple-glass-card p-6 rounded-2xl space-y-6">
        {/* Top Info Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 font-black flex items-center justify-center font-mono text-2xl border border-amber-500/30">
              {selectedContractor.code}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{selectedContractor.companyName}</h3>
                <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-neutral-300">{selectedContractor.companyRole || 'Perusahaan'}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${selectedContractor.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : selectedContractor.status === 'WARNING' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                  Status: {selectedContractor.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1">
                {selectedContractor.parentCompanyCode && <span>Perusahaan Induk: <strong className="text-white">{selectedContractor.parentCompanyCode}</strong></span>}
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
              {selectedContractor.safetyPassportExpiry || 'Belum dicatat'}
            </div>
            {passportDaysRemaining !== null && (
              <div className="mt-1 text-[10px] text-neutral-400">
                {passportDaysRemaining < 0 ? 'Kedaluwarsa ' + Math.abs(passportDaysRemaining) + ' hari lalu' : passportDaysRemaining === 0 ? 'Berakhir hari ini' : 'Sisa ' + passportDaysRemaining + ' hari'}
              </div>
            )}
          </div>
        </div>

        {/* 4 Compliance Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>MCU Tahunan</span>
              <FileCheck className="w-4 h-4 text-[#00E676]" />
            </div>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {selectedVerifiedReport && selectedVerifiedReport.mcuEligibleCount > 0 ? `${Math.round(selectedVerifiedReport.mcuFitCount / selectedVerifiedReport.mcuEligibleCount * 100)}%` : '—'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Fit to work certified</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>Induksi Safety</span>
              <Award className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {selectedVerifiedReport && selectedVerifiedReport.inductionRequiredCount > 0 ? `${Math.round(selectedVerifiedReport.inductionCompletedCount / selectedVerifiedReport.inductionRequiredCount * 100)}%` : '—'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Berdasarkan data induksi yang tercatat</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>Jam Kerja Selamat</span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono mt-1 truncate">
              {selectedVerifiedReport ? selectedVerifiedReport.safeHours.toLocaleString('id-ID') : '—'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">LTI-Free Hours</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>PICA Aktif</span>
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
              {actualActivePicaCount > 0 ? actualActivePicaCount : '0'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Sedang ditindaklanjuti</div>
          </div>
        </div>

        {/* Equipment & Fleet Status — show only verified master data. */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#F59E0B]" />
              Peralatan &amp; Fleet
            </h4>
            <span className="text-xs font-mono text-neutral-400">
              {selectedVerifiedReport ? `${selectedVerifiedReport.equipmentCount} unit tercatat (laporan terverifikasi)` : 'Data belum tersedia'}
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            Jumlah unit berasal dari laporan bulanan terakhir yang telah diverifikasi. Rincian nomor lambung, status P2H, dan masa berlaku SIA akan ditampilkan setelah register fleet dikembangkan.
          </p>
        </div>

      </div>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h4 className="text-sm font-bold text-white">Laporan Kepatuhan Bulanan Kontraktor</h4>
            <p className="mt-1 text-xs text-neutral-400">Data agregat manpower, fleet, MCU, induksi, jam kerja selamat, dan LTI. Nilai KPI hanya ditampilkan setelah diverifikasi HSE.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-neutral-300">{selectedCompanyReports.length} laporan</span>
            <button type="button" onClick={() => void refreshComplianceReports()} disabled={reportsLoading} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 disabled:opacity-50">{reportsLoading ? 'Memuat...' : 'Muat Ulang'}</button>
          </div>
        </div>

        {canSubmitReport && ownCompanyCode === selectedCompanyCode && (
          <form onSubmit={submitComplianceReport} className="grid grid-cols-1 gap-3 border-b border-white/10 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <h5 className="text-xs font-semibold text-white">{editingReportId ? 'Perbaikan Laporan yang Dikembalikan' : 'Kirim Laporan Bulanan'} · {ownCompanyCode}</h5>
            </div>
            <label className="space-y-1 text-xs text-neutral-400">Periode laporan
              <input type="month" required disabled={Boolean(editingReportId)} value={reportDraft.period} onChange={e => setReportDraft(current => ({...current, period:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white disabled:opacity-60" />
            </label>
            {([
              ['manpowerCount','Jumlah manpower'],
              ['equipmentCount','Jumlah unit peralatan'],
              ['mcuEligibleCount','Pekerja wajib MCU'],
              ['mcuFitCount','Pekerja MCU fit'],
              ['inductionRequiredCount','Pekerja wajib induksi'],
              ['inductionCompletedCount','Pekerja selesai induksi'],
              ['safeHours','Jam kerja selamat kumulatif'],
              ['ltiCount','Jumlah LTI periode ini']
            ] as const).map(([field,label]) => (
              <label key={field} className="space-y-1 text-xs text-neutral-400">{label}
                <input type="number" min="0" step="1" required value={reportDraft[field]} onChange={e => setReportDraft(current => ({...current,[field]:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" />
              </label>
            ))}
            <label className="space-y-1 text-xs text-neutral-400 sm:col-span-2 lg:col-span-3">Catatan / keterangan
              <textarea rows={2} maxLength={1000} value={reportDraft.remarks} onChange={e => setReportDraft(current => ({...current,remarks:e.target.value}))} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" placeholder="Sumber data, periode cut-off, atau keterangan pendukung." />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
              <button type="submit" disabled={reportBusy} className="rounded-lg bg-[#00E676] px-4 py-2 text-xs font-bold text-black disabled:opacity-50">{reportBusy ? 'Menyimpan...' : editingReportId ? 'Kirim Ulang Laporan' : 'Kirim untuk Verifikasi HSE'}</button>
              {editingReportId && <button type="button" onClick={() => { setEditingReportId(''); setReportDraft({period:currentPeriod,manpowerCount:'',equipmentCount:'',mcuEligibleCount:'',mcuFitCount:'',inductionRequiredCount:'',inductionCompletedCount:'',safeHours:'',ltiCount:'0',remarks:''}); }} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-neutral-300">Batal Perbaikan</button>}
              <span className="text-[10px] text-neutral-500">MCU hanya berupa jumlah agregat; jangan masukkan diagnosis atau data medis individu.</span>
            </div>
          </form>
        )}
        {canSubmitReport && ownCompanyCode !== selectedCompanyCode && (
          <div className="border-b border-white/10 px-5 py-3 text-xs text-neutral-400">Pengiriman laporan dilakukan oleh akun perusahaan masing-masing. Pilih perusahaan akun Anda ({ownCompanyCode}) untuk mengirim laporan.</div>
        )}
        {reportMessage && <div className="border-b border-white/10 px-5 py-3 text-xs text-amber-200">{reportMessage}</div>}

        {selectedCompanyReports.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-neutral-400">Belum ada laporan kepatuhan untuk perusahaan ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-white/5 text-neutral-400">
                <tr><th className="px-4 py-3">Periode / Perusahaan</th><th className="px-4 py-3">Manpower</th><th className="px-4 py-3">Fleet</th><th className="px-4 py-3">MCU</th><th className="px-4 py-3">Induksi</th><th className="px-4 py-3">Safe Hours</th><th className="px-4 py-3">LTI</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tindakan</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {selectedCompanyReports.map(report => (
                  <tr key={report.id} className="text-neutral-300">
                    <td className="px-4 py-3"><div className="font-mono text-white">{report.period}</div><div className="text-[10px] text-neutral-500">{report.companyCode}</div></td>
                    <td className="px-4 py-3">{report.manpowerCount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">{report.equipmentCount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">{report.mcuEligibleCount ? Math.round(report.mcuFitCount / report.mcuEligibleCount * 100) + '%' : '—'}</td>
                    <td className="px-4 py-3">{report.inductionRequiredCount ? Math.round(report.inductionCompletedCount / report.inductionRequiredCount * 100) + '%' : '—'}</td>
                    <td className="px-4 py-3">{report.safeHours.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3">{report.ltiCount}</td>
                    <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-[10px] font-semibold ${report.status === 'VERIFIED' ? 'bg-emerald-500/15 text-emerald-300' : report.status === 'RETURNED' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>{report.status}</span>{report.reviewNotes && <div className="mt-1 max-w-[180px] whitespace-normal text-[10px] text-red-300">{report.reviewNotes}</div>}</td>
                    <td className="px-4 py-3">
                      {canReviewReport && report.status === 'SUBMITTED' && <div className="flex flex-col gap-1"><button type="button" disabled={reportBusy} onClick={() => void reviewComplianceReport(report,'VERIFY')} className="rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">Verifikasi</button><button type="button" disabled={reportBusy} onClick={() => void reviewComplianceReport(report,'RETURN')} className="rounded bg-red-500/15 px-2 py-1 text-[10px] text-red-300">Kembalikan</button></div>}
                      {report.status === 'RETURNED' && canSubmitReport && report.companyCode.toUpperCase() === ownCompanyCode && <button type="button" onClick={() => startReportCorrection(report)} className="rounded bg-amber-500/15 px-2 py-1 text-[10px] text-amber-300">Perbaiki</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canReviewReport && selectedCompanyReports.some(report => report.status === 'SUBMITTED') && (
          <div className="border-t border-white/10 p-5">
            <label className="block space-y-1 text-xs text-neutral-400">Catatan pengembalian (wajib jika laporan dikembalikan)
              <textarea rows={2} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} maxLength={1000} className="w-full rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-white" placeholder="Tuliskan data yang perlu diperbaiki." />
            </label>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold text-white"><AlertTriangle className="h-4 w-4 text-amber-400" />Register PICA Perusahaan</h4>
            <p className="mt-1 text-xs text-neutral-400">Daftar tindak lanjut yang terkait dengan perusahaan terpilih, termasuk subkontraktor di bawahnya.</p>
          </div>
          <span className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-mono text-neutral-300">{selectedCompanyPicas.length} total · {actualActivePicaCount} aktif</span>
        </div>
        {selectedCompanyPicas.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-neutral-400">Belum ada PICA yang tercatat untuk perusahaan ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-white/5 text-neutral-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Nomor PICA</th>
                  <th className="px-5 py-3 font-medium">Sumber Temuan</th>
                  <th className="px-5 py-3 font-medium">PIC</th>
                  <th className="px-5 py-3 font-medium">Target</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {selectedCompanyPicas.map(pica => {
                  const targetDate = pica.targetDate ? new Date(pica.targetDate.slice(0, 10) + 'T00:00:00') : null;
                  const isOverdue = pica.status !== 'CLOSED' && targetDate !== null && !Number.isNaN(targetDate.getTime()) && targetDate < today;
                  const statusLabel = isOverdue ? 'OVERDUE' : pica.status;
                  return (
                    <tr key={pica.id} className="text-neutral-300">
                      <td className="px-5 py-3 font-mono text-white">{pica.code}</td>
                      <td className="px-5 py-3">{pica.source} · {pica.sourceRefCode}</td>
                      <td className="px-5 py-3">{pica.picName || 'Belum ditetapkan'}</td>
                      <td className="px-5 py-3 font-mono">{pica.targetDate || '—'}</td>
                      <td className="px-5 py-3"><span className={`rounded px-2 py-1 text-[10px] font-semibold ${statusLabel === 'CLOSED' ? 'bg-emerald-500/15 text-emerald-300' : statusLabel === 'OVERDUE' ? 'bg-red-500/15 text-red-300' : 'bg-amber-500/15 text-amber-300'}`}>{statusLabel}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
