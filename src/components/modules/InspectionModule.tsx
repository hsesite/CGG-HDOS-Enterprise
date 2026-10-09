import React, { useState } from 'react';
import {
  ClipboardCheck,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  MapPin,
  Camera,
  Calendar,
  Save,
  ArrowRight,
  Sparkles,
  Search,
  Filter,
  Download,
  FileText,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { MiningArea, InspectionItem, Inspection, FormDefinition } from '../../core/types';
import { hdosAuth } from '../../core/auth';

interface TemplateDef {
  id: 'APAR' | 'HEAVY_EQUIPMENT' | 'WORKSHOP' | 'PIT_SLOPE';
  title: string;
  category: string;
  smkpElement: string;
  items: { question: string; standardRef: string }[];
}

const TEMPLATES: TemplateDef[] = [];

export const InspectionModule: React.FC = () => {
  const store = useHDOSStore();
  const currentUser = hdosAuth.getCurrentUser();

  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateDef['id']>('APAR');
  const [location, setLocation] = useState<MiningArea>('');
  const [answers, setAnswers] = useState<Record<number, { result: 'PASS' | 'FAIL' | 'NA'; notes: string }>>({
    0: { result: 'PASS', notes: '' },
    1: { result: 'PASS', notes: '' },
    2: { result: 'PASS', notes: '' },
    3: { result: 'PASS', notes: '' },
    4: { result: 'PASS', notes: '' },
  });
  const [inspectorName, setInspectorName] = useState(currentUser.name);
  const [generalNotes, setGeneralNotes] = useState('');
  const [photoAttached, setPhotoAttached] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedRepositoryFormId, setSelectedRepositoryFormId] = useState<string>('');
  const [repositoryAnswers, setRepositoryAnswers] = useState<Record<string, { result: 'PASS' | 'FAIL' | 'NA'; notes: string }>>({});

  const currentTemplate = TEMPLATES.find((t) => t.id === selectedTemplateId);
  const publishedRepositoryForms = store.formDefinitions.filter((form) => form.status === 'PUBLISHED' && form.fields.length > 0);
  const selectedRepositoryForm: FormDefinition | undefined = publishedRepositoryForms.find((form) => form.id === selectedRepositoryFormId);

  const handleResultChange = (index: number, result: 'PASS' | 'FAIL' | 'NA') => {
    setAnswers((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        result,
      },
    }));
  };

  const handleNotesChange = (index: number, notes: string) => {
    setAnswers((prev) => ({
      ...prev,
      [index]: {
        ...prev[index],
        notes,
      },
    }));
  };

  const hasFail = Object.values(answers).some((a) => a.result === 'FAIL');

  const handleRepositoryFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepositoryForm) return;

    const items: InspectionItem[] = selectedRepositoryForm.fields
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((field) => ({
        id: `field_${field.id}_${Date.now()}`,
        question: field.label,
        standardRef: String(field.metadata?.standardRef || field.description || selectedRepositoryForm.formNumber || 'Dokumen sumber'),
        result: repositoryAnswers[field.id]?.result || 'PASS',
        notes: repositoryAnswers[field.id]?.notes || '',
      }));

    const missingFindingNotes = items.some((item) => item.result === 'FAIL' && !item.notes?.trim());
    if (missingFindingNotes) {
      setSuccessMessage('');
      window.alert('Lengkapi catatan untuk setiap item Tidak Sesuai sebelum menyimpan pemeriksaan.');
      return;
    }

    setSubmitting(true);
    setSuccessMessage('');
    try {
      const failedCount = items.filter((item) => item.result === 'FAIL').length;
      const passCount = items.filter((item) => item.result === 'PASS').length;
      const applicableCount = items.filter((item) => item.result !== 'NA').length;
      const scorePercent = applicableCount > 0 ? Math.round((passCount / applicableCount) * 100) : 100;
      const sourceDoc = store.documents.find((doc) => doc.id === selectedRepositoryForm.sourceDocumentId);
      const newInspection = await store.addInspection({
        title: selectedRepositoryForm.title,
        templateType: 'WORKSHOP',
        sourceFormId: selectedRepositoryForm.id,
        sourceFormNumber: selectedRepositoryForm.formNumber,
        sourceDocumentId: selectedRepositoryForm.sourceDocumentId,
        location,
        inspectorName,
        inspectorRole: currentUser.role,
        date: new Date().toISOString().split('T')[0],
        status: failedCount > 0 ? 'PICA_TRIGGERED' : 'COMPLETED',
        smkpElement: sourceDoc?.smkpElement || selectedRepositoryForm.category || 'SMKP Document Control',
        scorePercent,
        items,
        notes: generalNotes,
        gpsCoordinates: {
          lat: -2.9395,
          lng: 121.9618,
          utm: '51S 385100 mE 9674800 mN',
        },
      });

      setSuccessMessage(
        failedCount > 0
          ? `Pemeriksaan ${newInspection.code} tersimpan. ${failedCount} temuan dicatat dan PICA dibuat otomatis.`
          : `Pemeriksaan ${newInspection.code} selesai tanpa temuan dan tersimpan di Riwayat Pemeriksaan.`
      );
      setActiveTab('history');
      setSelectedRepositoryFormId('');
      setRepositoryAnswers({});
      setGeneralNotes('');
    } catch (error) {
      console.error('[InspectionModule] Gagal menyimpan pemeriksaan formulir Repository:', error);
      setSuccessMessage('Pemeriksaan gagal disimpan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadInspectionReport = (inspection: Inspection) => {
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Kode Pemeriksaan', inspection.code],
      ['Judul Formulir', inspection.title],
      ['Nomor Formulir Sumber', inspection.sourceFormNumber || '-'],
      ['Tanggal', inspection.date],
      ['Lokasi', inspection.location],
      ['Inspektur', inspection.inspectorName],
      ['Elemen SMKP', inspection.smkpElement],
      ['Skor Kepatuhan', `${inspection.scorePercent}%`],
      ['Status', inspection.status],
      [],
      ['No', 'Pertanyaan', 'Referensi', 'Hasil', 'Catatan Temuan', 'Kode PICA'],
      ...inspection.items.map((item, index) => [
        index + 1,
        item.question,
        item.standardRef,
        item.result,
        item.notes || '',
        item.picaId ? (store.picas.find((pica) => pica.id === item.picaId)?.code || item.picaId) : '',
      ]),
      [],
      ['Catatan Umum', inspection.notes || ''],
    ];
    const csv = '\uFEFF' + rows.map((row) => row.map(quote).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Laporan-${inspection.code}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTemplate) return;
    setSubmitting(true);

    const items: InspectionItem[] = currentTemplate.items.map((item, idx) => ({
      id: `item_${idx}_${Date.now()}`,
      question: item.question,
      standardRef: item.standardRef,
      result: answers[idx]?.result || 'PASS',
      notes: answers[idx]?.notes || '',
    }));

    const passCount = items.filter((i) => i.result === 'PASS').length;
    const scorePercent = Math.round((passCount / items.length) * 100);

    const newInspection = await store.addInspection({
      title: currentTemplate.title,
      templateType: currentTemplate.id,
      location,
      inspectorName,
      inspectorRole: currentUser.role,
      date: new Date().toISOString().split('T')[0],
      status: hasFail ? 'PICA_TRIGGERED' : 'COMPLETED',
      smkpElement: currentTemplate.smkpElement,
      scorePercent,
      items,
      notes: generalNotes,
      gpsCoordinates: {
        lat: -2.9395,
        lng: 121.9618,
        utm: '51S 385100 mE 9674800 mN',
      },
    });

    setSubmitting(false);
    setSuccessMessage(
      `Inspeksi ${newInspection.code} berhasil disimpan! ${
        hasFail ? 'Tindakan koreksi (PICA) otomatis diterbitkan untuk temuan "Tidak".' : 'Seluruh item memenuhi standar.'
      }`
    );

    setTimeout(() => {
      setSuccessMessage('');
      setActiveTab('history');
    }, 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[#42A5F5]" />
            Inspection Runtime & Zero-Duplicate Form
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Satu template form digital otomatis tersinkronisasi ke Mobile, Desktop, dan Repository SMKP.
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
          <button
            onClick={() => setActiveTab('form')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'form' ? 'bg-[#42A5F5] text-black font-semibold shadow-sm' : 'text-neutral-300 hover:text-white'
            }`}
          >
            Form Input Aktif
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'history' ? 'bg-[#42A5F5] text-black font-semibold shadow-sm' : 'text-neutral-300 hover:text-white'
            }`}
          >
            Riwayat Inspeksi ({store.inspections.length})
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {activeTab === 'form' ? (
        selectedRepositoryForm ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-5 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Form inspeksi ${selectedRepositoryForm.title}`}>
            <div className="w-full max-w-5xl max-h-[94vh] overflow-hidden rounded-2xl border border-[#42A5F5]/30 bg-[#111418] shadow-2xl flex flex-col">
              <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/10 bg-[#171b21]">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-[#42A5F5] font-bold">Inspection · Formulir Digital</p>
                  <h2 className="text-sm sm:text-base font-bold text-white truncate">{selectedRepositoryForm.title}</h2>
                  <p className="text-[10px] text-neutral-400">{selectedRepositoryForm.formNumber || selectedRepositoryForm.id} · {selectedRepositoryForm.fields.length} pertanyaan</p>
                </div>
                <button type="button" onClick={() => setSelectedRepositoryFormId('')} className="shrink-0 px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white">Tutup ✕</button>
              </div>
              <form onSubmit={handleRepositoryFormSubmit} className="min-h-0 overflow-y-auto p-3 sm:p-5 space-y-4">
            <div className="apple-glass-card p-5 rounded-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#42A5F5] font-bold">Dari SMKP Document Control</p>
                  <h3 className="text-base font-bold text-white mt-1">{selectedRepositoryForm.title}</h3>
                  <p className="text-xs text-neutral-400 mt-1">{selectedRepositoryForm.formNumber || selectedRepositoryForm.id} · {selectedRepositoryForm.fields.length} pertanyaan</p>
                </div>
                <span className="text-[10px] text-emerald-300 font-semibold">PUBLISHED · Siap diperiksa</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <label className="text-neutral-400">Lokasi pemeriksaan
                  <select value={location} onChange={(event) => setLocation(event.target.value as MiningArea)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white">
                    {store.locations.map((loc) => <option key={loc.id} value={loc.name} className="bg-neutral-900">{loc.name}</option>)}
                  </select>
                </label>
                <label className="text-neutral-400">Inspektur
                  <input value={inspectorName} onChange={(event) => setInspectorName(event.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                </label>
                <div className="text-neutral-400">Status formulir
                  <p className="mt-1 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">PUBLISHED · Siap diperiksa</p>
                </div>
              </div>
            </div>
            <div className="apple-glass-card p-5 rounded-2xl space-y-4">
              <h3 className="text-sm font-semibold text-white border-b border-white/10 pb-3">Checklist Pemeriksaan</h3>
              {selectedRepositoryForm.fields.slice().sort((a, b) => a.order - b.order).map((field, index) => {
                const answer = repositoryAnswers[field.id]?.result || 'PASS';
                const note = repositoryAnswers[field.id]?.notes || '';
                return (
                  <div key={field.id} className={`p-4 rounded-xl border ${answer === 'FAIL' ? 'bg-red-500/10 border-red-500/40' : 'bg-white/5 border-white/10'}`}>
                    <p className="text-xs font-semibold text-white">{index + 1}. {field.label}</p>
                    {field.description && <p className="text-[11px] text-neutral-400 mt-1">{field.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {([{value:'PASS',label:'Sesuai'},{value:'FAIL',label:'Tidak Sesuai'},{value:'NA',label:'Tidak Berlaku'}] as const).map((option) => (
                        <button key={option.value} type="button" onClick={() => setRepositoryAnswers((prev) => ({...prev,[field.id]:{...prev[field.id],result:option.value,notes:prev[field.id]?.notes || ''}}))} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${answer === option.value ? (option.value === 'FAIL' ? 'bg-red-500 text-white' : option.value === 'PASS' ? 'bg-emerald-400 text-black' : 'bg-neutral-600 text-white') : 'bg-black/30 text-neutral-400 border border-white/10'}`}>{option.label}</button>
                      ))}
                    </div>
                    {answer === 'FAIL' && (
                      <label className="block mt-3 text-[11px] text-red-300">Catatan temuan wajib
                        <input required value={note} onChange={(event) => setRepositoryAnswers((prev) => ({...prev,[field.id]:{...prev[field.id],result:'FAIL',notes:event.target.value}}))} placeholder="Jelaskan ketidaksesuaian yang ditemukan" className="mt-1 w-full px-3 py-2 rounded-lg bg-black/50 border border-red-500/40 text-xs text-white" />
                      </label>
                    )}
                  </div>
                );
              })}
              <label className="block text-xs text-neutral-400">Catatan umum pemeriksaan
                <textarea value={generalNotes} onChange={(event) => setGeneralNotes(event.target.value)} rows={3} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
              </label>
              <button type="submit" disabled={submitting} className="w-full px-5 py-3 rounded-xl bg-[#42A5F5] text-black font-bold text-xs disabled:opacity-50">
                <Save className="inline w-4 h-4 mr-2" />{submitting ? 'Menyimpan pemeriksaan...' : 'Simpan Pemeriksaan & Proses Temuan'}
              </button>
            </div>
              </form>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="apple-glass-card p-4 rounded-2xl space-y-3">
            <div>
              <h3 className="text-sm font-bold text-white">Formulir dari SMKP Document Control</h3>
              <p className="text-[11px] text-neutral-400 mt-1">Pilih formulir yang sudah diterbitkan di Repository untuk mulai pemeriksaan.</p>
            </div>
            {publishedRepositoryForms.length === 0 ? (
              <p className="text-xs text-neutral-400 rounded-lg bg-white/5 p-3">Belum ada formulir berstatus PUBLISHED dengan pertanyaan. Unggah dokumen di Document Control terlebih dahulu.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {publishedRepositoryForms.map((form) => (
                  <button key={form.id} type="button" onClick={() => { setSelectedRepositoryFormId(form.id); setRepositoryAnswers({}); setSuccessMessage(''); }} className="text-left p-3 rounded-xl border border-[#42A5F5]/25 bg-[#42A5F5]/5 hover:bg-[#42A5F5]/10">
                    <span className="flex items-center gap-2 text-xs font-bold text-white"><FileText className="w-4 h-4 text-[#42A5F5]" />{form.title}</span>
                    <span className="block text-[10px] text-neutral-400 mt-1">{form.formNumber || form.id} · {form.fields.length} pertanyaan</span>
                    <span className="block text-[10px] text-emerald-300 mt-1">PUBLISHED · Siap diperiksa</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {TEMPLATES.length > 0 && (
            <>
            {/* Template Selection Matrix */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-300">Pilih Template Formulir Digital:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateId(tmpl.id);
                      // Reset answers
                      const newAns: any = {};
                      tmpl.items.forEach((_, idx) => {
                        newAns[idx] = { result: 'PASS', notes: '' };
                      });
                      setAnswers(newAns);
                    }}
                    className={`p-3 rounded-xl text-left border transition-all cursor-pointer ${
                      selectedTemplateId === tmpl.id
                        ? 'bg-[#42A5F5]/20 border-[#42A5F5] text-white shadow-lg'
                        : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-mono text-[#42A5F5] font-semibold">{tmpl.category}</div>
                    <div className="text-xs font-bold text-white mt-1 leading-snug">{tmpl.title}</div>
                    <div className="text-[10px] text-neutral-400 mt-2">{tmpl.items.length} Parameter Uji</div>
                  </button>
                ))}
              </div>
            </div>
  
            {/* Context & Metadata Card */}
            <div className="apple-glass-card p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Lokasi Inspeksi</label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value as MiningArea)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#42A5F5]"
                >
                  {store.locations.map((loc) => (
                    <option key={loc.id} value={loc.name} className="bg-neutral-900 text-white">
                      {loc.name} ({loc.zoneType})
                    </option>
                  ))}
                </select>
              </div>
  
              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Pengawas / Inspektur</label>
                <input
                  type="text"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#42A5F5]"
                />
              </div>
  
              <div>
                <label className="block text-neutral-400 mb-1 font-medium">Regulasi & Standar SMKP</label>
                <div className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 text-neutral-300 font-mono text-[11px] truncate">
                  {currentTemplate?.smkpElement || 'Pilih formulir yang telah diterbitkan di Repository'}
                </div>
              </div>
            </div>
  
            {/* Auto PICA Alert Callout if Fail selected */}
            {hasFail && (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Auto-PICA Terpicu:</strong> Anda memilih &quot;Tidak&quot; pada salah satu item. Sistem akan otomatis menerbitkan Tiket PICA ke departemen terkait saat form ini disimpan.
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-amber-400 text-black font-bold text-[10px]">
                  Blueprint §12
                </span>
              </div>
            )}
  
            {/* Inspection Items Checklist */}
            <div className="apple-glass-card p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h3 className="text-sm font-semibold text-white">
                  Daftar Periksa Kepatuhan Keselamatan
                </h3>
                <span className="text-xs text-neutral-400">
                  Pilih status kelayakan untuk masing-masing parameter
                </span>
              </div>
  
              <div className="space-y-4">
                {currentTemplate.items.map((item, index) => {
                  const currentAns = answers[index]?.result || 'PASS';
                  const currentNote = answers[index]?.notes || '';
  
                  return (
                    <div
                      key={index}
                      className={`p-4 rounded-xl border transition-all ${
                        currentAns === 'FAIL'
                          ? 'bg-red-500/10 border-red-500/40'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 max-w-2xl">
                          <div className="text-xs font-semibold text-white flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-white/10 text-neutral-300 flex items-center justify-center text-[10px] shrink-0 font-mono mt-0.5">
                              {index + 1}
                            </span>
                            <span>{item.question}</span>
                          </div>
                          <div className="text-[11px] text-neutral-400 pl-7 font-mono">
                            Ref: {item.standardRef}
                          </div>
                        </div>
  
                        {/* Segmented Control Ya / Tidak / NA */}
                        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/15 shrink-0 self-start sm:self-center">
                          <button
                            type="button"
                            onClick={() => handleResultChange(index, 'PASS')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              currentAns === 'PASS'
                                ? 'bg-[#00E676] text-black shadow-md'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            Ya (Pass)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResultChange(index, 'FAIL')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              currentAns === 'FAIL'
                                ? 'bg-red-500 text-white shadow-md'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            Tidak (Fail)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResultChange(index, 'NA')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              currentAns === 'NA'
                                ? 'bg-neutral-600 text-white shadow-md'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            N/A
                          </button>
                        </div>
                      </div>
  
                      {/* Notes field especially when Fail */}
                      {currentAns === 'FAIL' && (
                        <div className="mt-3 pl-7 animate-in fade-in space-y-1.5">
                          <label className="text-[11px] text-red-300 font-medium">
                            Catatan Temuan &amp; Bukti Ketidaksesuaian (Wajib untuk PICA):
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Jelaskan kondisi fisik temuan, nomor seri alat, atau deviasi..."
                            value={currentNote}
                            onChange={(e) => handleNotesChange(index, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-black/50 border border-red-500/40 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-400"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
  
            {/* Telemetry Stamp & Photo Attachment */}
            <div className="apple-glass-card p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-neutral-300">
                  <Camera className="w-5 h-5 text-[#42A5F5]" />
                </div>
                <div>
                  <div className="font-semibold text-white">Lampiran Foto &amp; Geotag Otomatis</div>
                  <div className="text-[11px] text-neutral-400 font-mono">
                    GPS akan diminta saat inspeksi dimulai; tidak ada koordinat demo.
                  </div>
                </div>
              </div>
  
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-mono">
                  Belum ada lampiran
                </span>
              </div>
            </div>
  
            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-[#42A5F5] hover:bg-[#388fd8] text-black font-bold text-xs flex items-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? 'Menyimpan ke HDOS...' : 'Simpan Inspeksi &amp; Terbitkan Form'}</span>
              </button>
            </div>
            </>
          )}
        </form>
        )
      ) : (
        /* History Table */
        <div className="apple-glass-card p-5 rounded-2xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Log Inspeksi Tersimpan di Central Repository</h3>
            <span className="text-xs text-neutral-400 font-mono">
              Total: {store.inspections.length} Laporan
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-neutral-400 font-medium">
                  <th className="pb-3 font-semibold">Kode</th>
                  <th className="pb-3 font-semibold">Judul Inspeksi</th>
                  <th className="pb-3 font-semibold">Area</th>
                  <th className="pb-3 font-semibold">Inspektur</th>
                  <th className="pb-3 font-semibold">Tanggal</th>
                  <th className="pb-3 font-semibold text-right">Skor Kepatuhan</th>
                  <th className="pb-3 font-semibold text-right">Status</th>
                  <th className="pb-3 font-semibold text-right">Laporan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {store.inspections.map((ins) => (
                  <tr key={ins.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 font-mono text-[#42A5F5] font-semibold">{ins.code}</td>
                    <td className="py-3 text-white font-medium max-w-xs truncate">{ins.title}</td>
                    <td className="py-3 text-neutral-300">{ins.location}</td>
                    <td className="py-3 text-neutral-400">{ins.inspectorName}</td>
                    <td className="py-3 font-mono text-neutral-400 tabular-nums">{ins.date}</td>
                    <td className="py-3 text-right font-mono font-bold">
                      <span className={ins.scorePercent === 100 ? 'text-[#00E676]' : 'text-amber-400'}>
                        {ins.scorePercent}%
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          ins.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {ins.status === 'PICA_TRIGGERED' ? 'PICA Auto-Issued' : 'Lulus'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button type="button" onClick={() => downloadInspectionReport(ins)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#42A5F5]/15 text-[#42A5F5] hover:bg-[#42A5F5]/25" title="Unduh laporan pemeriksaan">
                        <Download className="w-3.5 h-3.5" /> CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
