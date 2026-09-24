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
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { MiningArea, InspectionItem, Inspection } from '../../core/types';
import { hdosAuth } from '../../core/auth';

interface TemplateDef {
  id: 'APAR' | 'HEAVY_EQUIPMENT' | 'WORKSHOP' | 'PIT_SLOPE';
  title: string;
  category: string;
  smkpElement: string;
  items: { question: string; standardRef: string }[];
}

const TEMPLATES: TemplateDef[] = [
  {
    id: 'APAR',
    title: 'Inspeksi Kelayakan APAR & Proteksi Kebakaran',
    category: 'Emergency Response',
    smkpElement: 'Elemen IV: Pengelolaan Operasional K3',
    items: [
      { question: 'Pin pengaman & segel APAR masih utuh dan terkunci sempurna', standardRef: 'Kepdirjen Minerba 185 K Lampiran I' },
      { question: 'Jarum penunjuk pressure gauge berada di area hijau (tekanan normal)', standardRef: 'SNI 03-3987-1995' },
      { question: 'Selang (hose) dan corong (nozzle) bersih tanpa keretakan/sumbatan', standardRef: 'SOP-CGG-HSE-019' },
      { question: 'Tinggi pemasangan APAR 120 cm dari permukaan tanah & rambu jelas', standardRef: 'Permenaker 04/MEN/1980' },
      { question: 'Kartu riwayat pemeriksaan bulanan ditandatangani petugas', standardRef: 'SMKP Elemen IV.4' },
    ],
  },
  {
    id: 'HEAVY_EQUIPMENT',
    title: 'Pemeriksaan Pra-Operasi (P2H) Haul Truck Komatsu HD785',
    category: 'Mining Equipment',
    smkpElement: 'Elemen IV: Pemeliharaan Sarana, Prasarana & Peralatan',
    items: [
      { question: 'Sistem rem utama (Service brake) dan rem darurat (Emergency brake) berfungsi pakem', standardRef: 'Kepdirjen Minerba 185 K Sub-elemen 4.3' },
      { question: 'Steering system, drag link, tie rod, dan sambungan hidrolik tanpa rembesan oli', standardRef: 'SOP-CGG-MTC-004' },
      { question: 'Kondisi ban (tekanan udara, tanpa sobekan kawat ply, bebas batu terselip)', standardRef: 'IK-CGG-SAF-011' },
      { question: 'Rotary lamp, lampu sorot kerja, lampu mundur (alarm), dan radio 2-way berfungsi', standardRef: 'SOP-CGG-OPS-002' },
      { question: 'Safety belt 3-titik, wiper, dan kaca spion blind spot terpasang lengkap', standardRef: 'Kepmen ESDM 1827 K' },
    ],
  },
  {
    id: 'WORKSHOP',
    title: 'Inspeksi K3 Central Maintenance Workshop & Fabrikasi',
    category: 'Facility & Safety',
    smkpElement: 'Elemen IV: Pengendalian Bahaya Lingkungan Kerja',
    items: [
      { question: 'Housekeeping lantai bebas ceceran oli, grease, dan material terantuk', standardRef: 'SMKP Elemen IV.1' },
      { question: 'Tabung gas oksigen & acetylene diikat tegak terpisah dengan safety flashback arrestor', standardRef: 'Permenaker 01/1980' },
      { question: 'Kondisi kabel gerinda, trafo las, dan panel listrik bertutup aman (LOTO ready)', standardRef: 'PUIL 2011' },
      { question: 'Peralatan lifting (crane hoist, webbing sling, shackle) berstempel sertifikasi sah', standardRef: 'Permenaker 08/2020' },
      { question: 'Eyewash station & shower darurat berfungsi baik dengan air bersih mengalir', standardRef: 'ANSI Z358.1' },
    ],
  },
  {
    id: 'PIT_SLOPE',
    title: 'Inspeksi Kestabilan Geoteknik Lereng Pit Jaja KM10',
    category: 'Geotechnical & Pit',
    smkpElement: 'Elemen II: Pengelolaan Risiko Keselamatan Pertambangan',
    items: [
      { question: 'Lebar safety berm minimal 5 meter dan bebas akumulasi boulder batuan labil', standardRef: 'Kepmen ESDM 1827 K Lampiran II' },
      { question: 'Tidak ditemukan rekahan tarik (tension cracks) di crest atau retakan lereng aktif', standardRef: 'Kajian Geoteknik Pit Jaja' },
      { question: 'Sistem penirisan air permukaan (sump pit, ditch saluran) mengalir tanpa genangan liar', standardRef: 'SOP-CGG-ENV-008' },
      { question: 'Prisma monitoring lereng (Robotic Total Station) terpasang dan terbaca normal', standardRef: 'Prosedur Geoteknik PIT-03' },
    ],
  },
];

export const InspectionModule: React.FC = () => {
  const store = useHDOSStore();
  const currentUser = hdosAuth.getCurrentUser();

  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateDef['id']>('APAR');
  const [location, setLocation] = useState<MiningArea>('Workshop');
  const [answers, setAnswers] = useState<Record<number, { result: 'PASS' | 'FAIL' | 'NA'; notes: string }>>({
    0: { result: 'PASS', notes: '' },
    1: { result: 'PASS', notes: '' },
    2: { result: 'PASS', notes: '' },
    3: { result: 'PASS', notes: '' },
    4: { result: 'PASS', notes: '' },
  });
  const [inspectorName, setInspectorName] = useState(currentUser.name);
  const [generalNotes, setGeneralNotes] = useState('');
  const [photoAttached, setPhotoAttached] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const currentTemplate = TEMPLATES.find((t) => t.id === selectedTemplateId)!;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        <form onSubmit={handleSubmit} className="space-y-6">
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
                {currentTemplate.smkpElement}
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
                  GPS: -2.9395, 121.9618 (UTM 51S 385100 mE) · Timestamp Terverifikasi
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-mono">
                1 Foto Terlampir
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
        </form>
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
