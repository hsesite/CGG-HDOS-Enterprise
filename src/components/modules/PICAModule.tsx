import React, { useState } from 'react';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Calendar,
  Filter,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { PICA } from '../../core/types';
import { hdosAuth } from '../../core/auth';

export const PICAModule: React.FC = () => {
  const store = useHDOSStore();
  const currentUser = hdosAuth.getCurrentUser();
  const [selectedPica, setSelectedPica] = useState<PICA | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const openCount = store.picas.filter((p) => p.status === 'OPEN').length;
  const progressCount = store.picas.filter((p) => p.status === 'PROGRESS').length;
  const closedCount = store.picas.filter((p) => p.status === 'CLOSED').length;
  const overdueCount = store.picas.filter((p) => p.status === 'OVERDUE').length;

  const handleSignoff = async (stage: 'foreman' | 'spvHse' | 'ktt') => {
    if (!selectedPica) return;

    const currentStages = { ...selectedPica.approvalStages };
    currentStages[stage] = true;

    let newStatus: PICA['status'] = selectedPica.status;
    if (currentStages.foreman || currentStages.spvHse) newStatus = 'PROGRESS';
    if (currentStages.foreman && currentStages.spvHse && currentStages.ktt) newStatus = 'CLOSED';

    const updated = await store.updatePICAStatus(selectedPica.id, {
      approvalStages: currentStages,
      status: newStatus,
    });

    if (updated) setSelectedPica(updated);
  };

  const filteredPicas = store.picas.filter((p) => {
    if (filterStatus === 'ALL') return true;
    return p.status === filterStatus;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-[#FFC107]" />
            PICA (Plan of Corrective Action) & Aging Control
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Manajemen tindak lanjut temuan inspeksi, bahaya & investigasi dengan 3-tier signoff (Foreman → SPV HSE → KTT).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-neutral-200"
          >
            <option value="ALL">Semua Status</option>
            <option value="OPEN">Open (Belum Tindak Lanjut)</option>
            <option value="PROGRESS">Progress (Dalam Penanganan)</option>
            <option value="CLOSED">Closed (Selesai Disetujui)</option>
            <option value="OVERDUE">Overdue (Jatuh Tempo)</option>
          </select>
        </div>
      </div>

      {/* KPI Aging Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="apple-glass-card p-4 rounded-2xl">
          <div className="text-[11px] text-neutral-400">Open (Baru)</div>
          <div className="text-2xl font-bold text-amber-400 font-mono mt-1">{openCount}</div>
          <div className="text-[10px] text-neutral-500 mt-1">&lt; 3 hari penugasan</div>
        </div>

        <div className="apple-glass-card p-4 rounded-2xl">
          <div className="text-[11px] text-neutral-400">Dalam Progress</div>
          <div className="text-2xl font-bold text-blue-400 font-mono mt-1">{progressCount}</div>
          <div className="text-[10px] text-neutral-500 mt-1">Sedang dikerjakan</div>
        </div>

        <div className="apple-glass-card p-4 rounded-2xl">
          <div className="text-[11px] text-neutral-400">Closed (Selesai)</div>
          <div className="text-2xl font-bold text-[#00E676] font-mono mt-1">{closedCount}</div>
          <div className="text-[10px] text-neutral-500 mt-1">3 approval terpenuhi</div>
        </div>

        <div className="apple-glass-card p-4 rounded-2xl">
          <div className="text-[11px] text-neutral-400">Overdue (Terlambat)</div>
          <div className="text-2xl font-bold text-red-400 font-mono mt-1">{overdueCount}</div>
          <div className="text-[10px] text-neutral-500 mt-1">&gt; batas target hari</div>
        </div>
      </div>

      {/* Main Content Grid: Table + Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PICA Register Table */}
        <div className="lg:col-span-2 apple-glass-card p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Daftar Tiket Tindakan Koreksi
            </h3>
            <span className="text-xs text-neutral-400 font-mono">{filteredPicas.length} Tiket</span>
          </div>

          <div className="divide-y divide-white/5">
            {filteredPicas.map((pica) => {
              const isSelected = selectedPica?.id === pica.id;

              return (
                <div
                  key={pica.id}
                  onClick={() => setSelectedPica(pica)}
                  className={`p-3.5 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/40'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#FFC107]">{pica.code}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-neutral-300">
                          Sumber: {pica.source} ({pica.sourceRefCode})
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white mt-1 leading-snug">
                        {pica.findingDescription}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        pica.status === 'CLOSED'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : pica.status === 'PROGRESS'
                          ? 'bg-blue-500/20 text-blue-300'
                          : pica.status === 'OVERDUE'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {pica.status}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between text-[11px] text-neutral-400 gap-2">
                    <div className="flex items-center gap-2">
                      <span>PIC: <strong className="text-neutral-200">{pica.picName}</strong></span>
                      <span>·</span>
                      <span>Dept: {pica.picDepartment}</span>
                    </div>

                    <div className="flex items-center gap-2 font-mono">
                      <span>Target: {pica.targetDate}</span>
                      <span className="px-1.5 py-0.2 rounded bg-white/5 text-neutral-300">
                        Aging: {pica.daysAging} hari
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail & Multi-Tier Verification Sign-off Box */}
        <div className="space-y-4">
          {selectedPica ? (
            <div className="apple-glass-card p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="font-mono text-xs font-bold text-[#FFC107]">
                  Detail {selectedPica.code}
                </span>
                <span className="text-xs text-neutral-400">{selectedPica.status}</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-neutral-400 text-[11px]">Temuan Ketidaksesuaian:</div>
                  <p className="text-white font-medium mt-0.5 leading-relaxed">
                    {selectedPica.findingDescription}
                  </p>
                </div>

                <div>
                  <div className="text-neutral-400 text-[11px]">Tindakan Koreksi Langsung:</div>
                  <p className="text-neutral-200 mt-0.5 leading-relaxed bg-black/40 p-2.5 rounded-lg border border-white/10">
                    {selectedPica.correctiveAction}
                  </p>
                </div>

                <div>
                  <div className="text-neutral-400 text-[11px]">Tindakan Preventif Jangka Panjang:</div>
                  <p className="text-neutral-200 mt-0.5 leading-relaxed bg-black/40 p-2.5 rounded-lg border border-white/10">
                    {selectedPica.preventiveAction}
                  </p>
                </div>
              </div>

              {/* 3-Tier Multi-Role Signoff Workflow */}
              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="text-xs font-bold text-white uppercase tracking-wider mb-2">
                  Alur Verifikasi Bertingkat (Sign-off)
                </div>

                {/* Stage 1: Foreman Safety */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                  <div>
                    <div className="font-medium text-white">1. Foreman Safety Lapangan</div>
                    <div className="text-[10px] text-neutral-400">Verifikasi fisik di lapangan</div>
                  </div>
                  {selectedPica.approvalStages.foreman ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSignoff('foreman')}
                      className="px-2.5 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium text-[11px] cursor-pointer"
                    >
                      Sign-off
                    </button>
                  )}
                </div>

                {/* Stage 2: SPV HSE */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                  <div>
                    <div className="font-medium text-white">2. SPV HSE</div>
                    <div className="text-[10px] text-neutral-400">Review bukti &amp; kepatuhan SMKP</div>
                  </div>
                  {selectedPica.approvalStages.spvHse ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSignoff('spvHse')}
                      className="px-2.5 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium text-[11px] cursor-pointer"
                    >
                      Sign-off
                    </button>
                  )}
                </div>

                {/* Stage 3: KTT (Kepala Teknik Tambang) */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                  <div>
                    <div className="font-medium text-white">3. KTT (Approval Final)</div>
                    <div className="text-[10px] text-neutral-400">Otoritas penutupan tiket SMKP</div>
                  </div>
                  {selectedPica.approvalStages.ktt ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Closed
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSignoff('ktt')}
                      className="px-2.5 py-1 rounded-lg bg-[#00E676] hover:bg-emerald-400 text-black font-bold text-[11px] cursor-pointer"
                    >
                      KTT Close
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="apple-glass-card p-8 rounded-2xl text-center text-neutral-400 text-xs">
              <CheckSquare className="w-10 h-10 mx-auto mb-2 text-neutral-600" />
              <p>Pilih tiket PICA di sebelah kiri untuk melihat detail tindakan koreksi dan melakukan verifikasi persetujuan (sign-off).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
