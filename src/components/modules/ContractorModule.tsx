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

export const ContractorModule: React.FC = () => {
  const store = useHDOSStore();
  const [selectedContractor, setSelectedContractor] = useState<ContractorPassport | undefined>(store.contractors[0]);
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
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${selectedContractor.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' : selectedContractor.status === 'WARNING' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                  Status: {selectedContractor.status}
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
              {selectedContractor.mcuCompliancePercent > 0 ? `${selectedContractor.mcuCompliancePercent}%` : '—'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Fit to work certified</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>Induksi Safety</span>
              <Award className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {selectedContractor.inductionRatePercent > 0 ? `${selectedContractor.inductionRatePercent}%` : '—'}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Berdasarkan data induksi yang tercatat</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>Jam Kerja Selamat</span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono mt-1 truncate">
              {selectedContractor.safeHours > 0 ? selectedContractor.safeHours.toLocaleString('id-ID') : '—'}
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
              {selectedContractor.equipmentCount > 0 ? `${selectedContractor.equipmentCount} unit tercatat` : 'Data belum tersedia'}
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            Rincian jenis unit, nomor lambung, status P2H, dan masa berlaku SIA belum tersedia pada data Contractor Passport. Informasi operasional tidak ditampilkan sebelum dicatat dan diverifikasi.
          </p>
        </div>

      </div>

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
