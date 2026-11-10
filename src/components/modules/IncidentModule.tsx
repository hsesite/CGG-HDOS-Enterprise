import React, { useState } from 'react';
import {
  ShieldAlert,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { Incident, MiningArea } from '../../core/types';
import { hdosAuth } from '../../core/auth';
import { createIncidentAction } from '../../core/module-actions';
import { getCurrentUser } from '../../core/auth-utils';

export const IncidentModule: React.FC = () => {
  const store = useHDOSStore();
  const currentUser = hdosAuth.getCurrentUser();
  const sessionUser = getCurrentUser();
  const assignedRoles = sessionUser?.roles || [];
  const isAdminCGG = assignedRoles.includes('Admin CGG');
  const isVerified = sessionUser?.roleVerified === true;
  const canEditInvestigation = isAdminCGG || (isVerified && assignedRoles.some(role => ['Foreman Safety', 'SPV HSE'].includes(role)));
  const canReviewIncident = isAdminCGG || (isVerified && assignedRoles.some(role => ['KTT', 'SPT', 'SPV'].includes(role)));
  const canCloseIncident = isAdminCGG || (isVerified && assignedRoles.includes('KTT'));
  const [activeTab, setActiveTab] = useState<'list' | 'report'>('report');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(store.incidents[0] || null);
  const selectedIncidentReadyForReview = Boolean(selectedIncident && (selectedIncident.fiveWhyAnalysis || []).filter(item => String(item || '').trim()).length >= 5 && String(selectedIncident.rootCause || '').trim() && (selectedIncident.correctiveActions || []).some(item => String(item || '').trim()));

  // New incident form state
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Incident['type']>('Near Miss');
  const [location, setLocation] = useState<MiningArea>('');
  const [date, setDate] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
  const [time, setTime] = useState('');
  const [victimsCount, setVictimsCount] = useState(0);
  const [damageCostEst, setDamageCostEst] = useState('');
  const [fiveWhy1, setFiveWhy1] = useState('');
  const [fiveWhy2, setFiveWhy2] = useState('');
  const [fiveWhy3, setFiveWhy3] = useState('');
  const [fiveWhy4, setFiveWhy4] = useState('');
  const [fiveWhy5, setFiveWhy5] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fiveWhyDraft, setFiveWhyDraft] = useState(store.incidents[0]?.fiveWhyAnalysis.join('\n') || '');
  const [rootCauseDraft, setRootCauseDraft] = useState(store.incidents[0]?.rootCause || '');
  const [correctiveActionsDraft, setCorrectiveActionsDraft] = useState(store.incidents[0]?.correctiveActions.join('\n') || '');
  const [reviewNotesDraft, setReviewNotesDraft] = useState('');

  const selectIncident = (incident: Incident) => {
    setSelectedIncident(incident);
    setFiveWhyDraft((incident.fiveWhyAnalysis || []).join('\n'));
    setRootCauseDraft(incident.rootCause || '');
    setCorrectiveActionsDraft((incident.correctiveActions || []).join('\n'));
    setReviewNotesDraft(incident.reviewNotes || '');
  };

  const handleSaveInvestigation = async () => {
    if (!selectedIncident) return;
    const fiveWhyAnalysis = fiveWhyDraft.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    const correctiveActions = correctiveActionsDraft.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (fiveWhyAnalysis.length < 5 || !rootCauseDraft.trim() || correctiveActions.length === 0) {
      window.alert('Lengkapi lima tahapan Why, akar penyebab, dan minimal satu tindakan koreksi.');
      return;
    }
    try {
      const updated = await store.updateIncident(selectedIncident.id, {
        fiveWhyAnalysis,
        rootCause: rootCauseDraft.trim(),
        correctiveActions,
      });
      if (updated) setSelectedIncident(updated);
      window.alert('Data investigasi berhasil disimpan dan masuk antrean sinkronisasi.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Data investigasi gagal disimpan.');
    }
  };

  const handleReviewIncident = async () => {
    if (!selectedIncident) return;
    try {
      const updated = await store.updateIncident(selectedIncident.id, {
        status: 'REVIEWED_KTT',
        reviewNotes: reviewNotesDraft.trim(),
      });
      if (updated) setSelectedIncident(updated);
      window.alert('Review insiden berhasil dicatat.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Review insiden gagal disimpan.');
    }
  };

  const handleCloseIncident = async () => {
    if (!selectedIncident || !window.confirm('Tutup insiden ini? Pastikan hasil investigasi dan tindakan koreksi telah diverifikasi.')) return;
    try {
      const updated = await store.updateIncident(selectedIncident.id, { status: 'CLOSED' });
      if (updated) setSelectedIncident(updated);
      window.alert('Insiden berhasil ditandai CLOSED dan masuk antrean sinkronisasi.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Insiden gagal ditutup.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !location || !date || !time) {
      window.alert('Lengkapi judul, lokasi, tanggal, dan waktu kejadian.');
      return;
    }
    setSubmitting(true);
    try {
      const fiveWhyAnalysis = [
      fiveWhy1 ? `1. Mengapa terjadi? ${fiveWhy1}` : '',
      fiveWhy2 ? `2. Mengapa hal tersebut terjadi? ${fiveWhy2}` : '',
      fiveWhy3 ? `3. Mengapa proteksi atau pengawasan tidak mencegahnya? ${fiveWhy3}` : '',
      fiveWhy4 ? `4. Mengapa sistem kerja memungkinkan penyebab tersebut? ${fiveWhy4}` : '',
      fiveWhy5 ? `5. Pengendalian sistemik apa yang harus diperbaiki? ${fiveWhy5}` : '',
    ].filter(Boolean);

    const newInc = await createIncidentAction({
      title,
      type,
      location,
      date,
      time,
      victimsCount,
      damageCostEst,
      status: 'INVESTIGATING',
      reporter: currentUser.name,
      timeline: [
        { time: `${time}`, event: `Laporan awal kejadian ${type} dicatat di ${location}.` },
      ],
      fiveWhyAnalysis,
      rootCause: rootCause.trim(),
      correctiveActions: correctiveAction.trim() ? [correctiveAction.trim()] : [],
      smkpReportSubmitted: false,
    });

    setSubmitting(false);
    setSelectedIncident(newInc);
    setFiveWhyDraft(fiveWhyAnalysis.join('\n'));
    setRootCauseDraft(rootCause.trim());
    setCorrectiveActionsDraft(correctiveAction.trim());
    setReviewNotesDraft('');
    setActiveTab('list');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Laporan insiden gagal disimpan. Periksa koneksi dan coba kembali.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            Investigasi Insiden Tambang &amp; Analisis 5-Why
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Klasifikasi insiden (Near Miss, Property Damage, Medical, LTI, Fatality) dengan root cause analysis terstandar SMKP.
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'list' ? 'bg-red-500 text-white font-semibold shadow-sm' : 'text-neutral-300 hover:text-white'
            }`}
          >
            Register Insiden ({store.incidents.length})
          </button>
          {<button
            onClick={() => setActiveTab('report')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'report' ? 'bg-red-500 text-white font-semibold shadow-sm' : 'text-neutral-300 hover:text-white'
            }`}
          >
            + Lapor Insiden Baru
          </button>}
        </div>
      </div>

      {activeTab === 'list' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Incident List */}
          <div className="apple-glass-card p-5 rounded-2xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 pb-2 border-b border-white/10">
              Daftar Insiden Terlaporkan
            </h3>

            <div className="space-y-2">
              {store.incidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => selectIncident(inc)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    selectedIncident?.id === inc.id
                      ? 'bg-red-500/15 border-red-500/40'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-red-400">{inc.code}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-semibold">
                      {inc.type}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-white mt-1.5 leading-snug line-clamp-2">
                    {inc.title}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                    <span>{inc.location}</span>
                    <span>{inc.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Incident Details & 5-Why View */}
          <div className="lg:col-span-2 space-y-4">
            {selectedIncident ? (
              <div className="apple-glass-card p-6 rounded-2xl space-y-5">
                {/* Header Information */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-red-400">{selectedIncident.code}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold uppercase">
                        {selectedIncident.type}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-1">{selectedIncident.title}</h3>
                  </div>

                  <div className="text-right text-xs">
                    <div className="text-neutral-400 font-mono">{selectedIncident.date} · {selectedIncident.time}</div>
                    <div className="text-emerald-400 text-[11px] font-semibold mt-1">
                      Status: {selectedIncident.status}
                    </div>
                    {selectedIncident.reviewedBy && <div className="text-[10px] text-neutral-500 mt-1">Direview: {selectedIncident.reviewedBy} · {selectedIncident.reviewedAt ? new Date(selectedIncident.reviewedAt).toLocaleString('id-ID') : ''}</div>}
                    {selectedIncident.closedBy && <div className="text-[10px] text-neutral-500 mt-1">Ditutup: {selectedIncident.closedBy} · {selectedIncident.closedAt ? new Date(selectedIncident.closedAt).toLocaleString('id-ID') : ''}</div>}
                  </div>
                </div>

                {/* Event Timeline */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 mb-3 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    Kronologi / Kronologis Waktu Kejadian
                  </h4>
                  <div className="space-y-2 pl-2 border-l-2 border-red-500/30">
                    {selectedIncident.timeline.map((item, idx) => (
                      <div key={idx} className="relative pl-4 text-xs">
                        <div className="absolute -left-[13px] top-1 w-2 h-2 rounded-full bg-red-500" />
                        <span className="font-mono text-[11px] text-neutral-400">{item.time}:</span>{' '}
                        <span className="text-neutral-200">{item.event}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5-Why Root Cause Analysis */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#FFC107] flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Analisis Akar Masalah (5-Why Analysis)
                  </h4>
                  <div className="space-y-1.5 text-xs text-neutral-300">
                    {selectedIncident.fiveWhyAnalysis.map((step, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-white/5 font-mono text-[11px] leading-relaxed">
                        {step}
                      </div>
                    ))}
                  </div>
                </div>

                {canEditInvestigation && selectedIncident.status === 'INVESTIGATING' && (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 space-y-3">
                    <h4 className="text-xs font-bold text-amber-200">Pembaruan Hasil Investigasi</h4>
                    <label className="block text-[11px] text-neutral-300">Lima tahapan Why (satu jawaban per baris)
                      <textarea rows={5} value={fiveWhyDraft} onChange={event => setFiveWhyDraft(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white" placeholder="1. Mengapa kejadian terjadi?&#10;2. Mengapa penyebab tersebut muncul?&#10;3. Mengapa pengendalian gagal?&#10;4. Mengapa sistem memungkinkan?&#10;5. Pengendalian sistemik apa yang harus diperbaiki?"/>
                    </label>
                    <label className="block text-[11px] text-neutral-300">Akar penyebab
                      <textarea rows={2} value={rootCauseDraft} onChange={event => setRootCauseDraft(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white"/>
                    </label>
                    <label className="block text-[11px] text-neutral-300">Tindakan koreksi dan pencegahan (satu tindakan per baris)
                      <textarea rows={3} value={correctiveActionsDraft} onChange={event => setCorrectiveActionsDraft(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white"/>
                    </label>
                    <button type="button" onClick={() => void handleSaveInvestigation()} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black">Simpan Hasil Investigasi</button>
                  </div>
                )}

                {canReviewIncident && selectedIncident.status === 'INVESTIGATING' && (
                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 space-y-3">
                    <label className="block text-[11px] text-neutral-300">Catatan review KTT / SPT / SPV
                      <textarea rows={2} value={reviewNotesDraft} onChange={event => setReviewNotesDraft(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white" placeholder="Catatan hasil review (opsional)"/>
                    </label>
                    <button type="button" disabled={!selectedIncidentReadyForReview} onClick={() => void handleReviewIncident()} className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">Setujui Hasil Investigasi</button>
                  </div>
                )}

                {canCloseIncident && selectedIncident.status === 'REVIEWED_KTT' && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => void handleCloseIncident()} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-black">Tutup Insiden</button>
                  </div>
                )}

                {selectedIncident.reviewNotes && <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-cyan-100"><strong>Catatan Review:</strong> {selectedIncident.reviewNotes}</div>}

                {/* Root Cause & Corrective Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-[11px] text-neutral-400 font-medium">Akar Masalah (Root Cause):</div>
                    <p className="text-white font-semibold mt-1 leading-relaxed">
                      {selectedIncident.rootCause}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-[11px] text-emerald-400 font-medium">Tindakan Perbaikan &amp; Pencegahan:</div>
                    <ul className="text-neutral-200 mt-1 space-y-1 list-disc list-inside text-[11px]">
                      {selectedIncident.correctiveActions.map((act, i) => (
                        <li key={i}>{act}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="apple-glass-card p-8 rounded-2xl text-center text-neutral-400 text-xs">
                Pilih insiden untuk melihat detail investigasi &amp; 5-Why analysis.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* New Incident Report Form */
        <form onSubmit={handleSubmit} className="apple-glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
            Formulir Investigasi Insiden Pertambangan
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-300 mb-1">Judul Insiden *</label>
              <input
                type="text"
                required
                placeholder="Contoh: Unit LV terperosok di soft ground tanggul Haul Road KM4"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Klasifikasi Insiden</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-none focus:border-red-500"
              >
                <option value="Near Miss" className="bg-neutral-900">Near Miss (Hampir Celaka)</option>
                <option value="Property Damage" className="bg-neutral-900">Property Damage (Kerusakan Aset)</option>
                <option value="Medical Treatment" className="bg-neutral-900">Medical Treatment (Perawatan Medis)</option>
                <option value="Lost Time" className="bg-neutral-900">Lost Time Injury (LTI)</option>
                <option value="Fatality" className="bg-neutral-900">Fatality (Kecelakaan Tambang Fatal)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Area Kejadian</label>
              <select
                required
                value={location}
                onChange={(e) => setLocation(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-none focus:border-red-500"
              >
                <option value="" disabled>Pilih area kerja...</option>
                      {store.locations.map((loc) => (
                  <option key={loc.id} value={loc.name} className="bg-neutral-900">
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Waktu Kejadian</label>
              <input
                type="text"
                required
                placeholder="Contoh: 10:35 WITA"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Estimasi Kerusakan</label>
              <input
                type="text"
                value={damageCostEst}
                onChange={(e) => setDamageCostEst(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* 5-Why Builder */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
            <div className="text-xs font-bold text-neutral-200">5-Why Analysis Form</div>
            <input
              type="text"
              placeholder="Why 1: Mengapa insiden terjadi?"
              value={fiveWhy1}
              onChange={(e) => setFiveWhy1(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white"
            />
            <input
              type="text"
              placeholder="Why 2: Mengapa kondisi tersebut bisa muncul?"
              value={fiveWhy2}
              onChange={(e) => setFiveWhy2(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white"
            />
            <input
              type="text"
              placeholder="Why 3: Mengapa proteksi / pengawasan tidak mencegahnya?"
              value={fiveWhy3}
              onChange={(e) => setFiveWhy3(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white"
            />
            <input
              type="text"
              placeholder="Why 4: Mengapa sistem kerja memungkinkan penyebab tersebut?"
              value={fiveWhy4}
              onChange={(e) => setFiveWhy4(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white"
            />
            <input
              type="text"
              placeholder="Why 5: Pengendalian sistemik apa yang harus diperbaiki?"
              value={fiveWhy5}
              onChange={(e) => setFiveWhy5(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Kesimpulan Akar Masalah</label>
              <textarea
                rows={2}
                placeholder="Akar masalah utama sistemik..."
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Rekomendasi Tindakan Koreksi</label>
              <textarea
                rows={2}
                placeholder="Tindakan koreksi preventif permanen..."
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className="px-4 py-2 rounded-xl bg-white/5 text-neutral-300 hover:text-white text-xs cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <span>{submitting ? 'Menyimpan...' : 'Simpan Laporan Insiden'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
