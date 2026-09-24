import React, { useState } from 'react';
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
  const [selectedContractor, setSelectedContractor] = useState<ContractorPassport>(store.contractors[0]);

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
            {store.contractors.length} Mitra Kerja Aktif di Pit CGG
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

                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                  {c.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] border-t border-white/5 pt-2 font-mono">
                <div>
                  <span className="text-neutral-400">KPI Safety:</span>{' '}
                  <strong className="text-[#00E676]">{c.kpiSafetyScore}%</strong>
                </div>
                <div>
                  <span className="text-neutral-400">Manpower:</span>{' '}
                  <strong className="text-white">{c.manpowerCount} org</strong>
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
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                  Verified SMKP Partner
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

        {/* 4 Compliance Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>MCU Tahunan</span>
              <FileCheck className="w-4 h-4 text-[#00E676]" />
            </div>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {selectedContractor.mcuCompliancePercent}%
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Fit to work certified</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>Induksi Safety</span>
              <Award className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono mt-1">
              {selectedContractor.inductionRatePercent}%
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">100% crew lulus tes</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>Jam Kerja Selamat</span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono mt-1 truncate">
              {selectedContractor.safeHours.toLocaleString('id-ID')}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">LTI-Free Hours</div>
          </div>

          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between text-neutral-400 text-xs">
              <span>PICA Aktif</span>
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
              {selectedContractor.activePicaCount}
            </div>
            <div className="text-[10px] text-neutral-400 mt-1">Sedang ditindaklanjuti</div>
          </div>
        </div>

        {/* Equipment & Fleet Status */}
        <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#F59E0B]" />
              Peralatan &amp; Fleet Terdaftar di Konsesi Pit CGG
            </h4>
            <span className="text-xs font-mono text-neutral-400">
              Total: {selectedContractor.equipmentCount} Unit Terkomisi
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-white/5 border border-white/5">
              <div className="text-neutral-400 text-[11px]">Dump Truck &amp; Hauler:</div>
              <div className="font-bold text-white mt-0.5">24 Unit (Komatsu HD785 &amp; Hino 500)</div>
              <div className="text-[10px] text-emerald-400 mt-1">✓ P2H terverifikasi hari ini</div>
            </div>

            <div className="p-3 rounded-lg bg-white/5 border border-white/5">
              <div className="text-neutral-400 text-[11px]">Excavator &amp; Loader:</div>
              <div className="font-bold text-white mt-0.5">8 Unit (PC1250, CAT 349D)</div>
              <div className="text-[10px] text-emerald-400 mt-1">✓ Surat Ijin Alat (SIA) Aktif</div>
            </div>

            <div className="p-3 rounded-lg bg-white/5 border border-white/5">
              <div className="text-neutral-400 text-[11px]">Support &amp; Water Truck:</div>
              <div className="font-bold text-white mt-0.5">6 Unit (Water Truck 20kL, Grader)</div>
              <div className="text-[10px] text-emerald-400 mt-1">✓ Dust suppression aktif di KM0-KM10</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
