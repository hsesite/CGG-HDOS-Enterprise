import React, { useState } from 'react';
import {
  Cpu,
  ScanEye,
  FileUp,
  HelpCircle,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Send,
  Camera,
  Layers,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { hdosAI, BoundingBox } from '../../core/ai';

export const AIModule: React.FC = () => {
  const store = useHDOSStore();

  const [activeTab, setActiveTab] = useState<'vision' | 'parser' | 'advisor'>('vision');

  // Vision scanner state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    hazardDetected: boolean;
    findings: string[];
    suggestedRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    suggestedAction: string;
    boundingBoxes: BoundingBox[];
  } | null>(null);

  // Document parser state
  const [parsingDoc, setParsingDoc] = useState(false);
  const [parsedForm, setParsedForm] = useState<any>(null);

  // SMKP Advisor state
  const [query, setQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([
    {
      sender: 'ai',
      text: 'Halo! Saya HDOS SMKP Copilot. Tanyakan pasal regulasi Kepmen ESDM 1827 K/30/MEM/2018, Kepdirjen 185 K, atau elemen audit keselamatan pertambangan.',
    },
  ]);

  const handleRunScan = async () => {
    setScanning(true);
    const result = await hdosAI.analyzeMiningHazardPhoto('/assets/sample_mining_pit.jpg');
    setScanResult(result);
    setScanning(false);
  };

  const handleConvertToHazard = async () => {
    if (!scanResult) return;
    await store.addHazard({
      title: 'AI Temuan: Unit HD Parkir Tanpa Ganjal Ban & Pekerja Blind Spot',
      category: 'Unsafe Condition',
      location: 'Pit Jaja KM10',
      specificLocation: 'Ramp Akses Bench 4 Elevasi +45',
      riskMatrix: {
        severity: 4,
        likelihood: 4,
        score: 16,
        level: scanResult.suggestedRiskLevel,
      },
      reporter: 'HDOS AI Vision Guard',
      reporterRole: 'Safety Officer',
      status: 'PICA_ISSUED',
      actionTaken: scanResult.suggestedAction,
      aiDetected: true,
      aiSuggestions: scanResult.findings,
    });
    alert('Temuan AI berhasil dikonversi dan disimpan ke Master Hazard Register serta menerbitkan tiket PICA!');
    store.openWindow('hazard');
  };

  const handleParseDocument = async (filename: string) => {
    setParsingDoc(true);
    const form = await hdosAI.parseDocumentToDigitalForm(filename, 'Inspeksi checklist standar');
    setParsedForm(form);
    setParsingDoc(false);
  };

  const handleSendQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userQ = query;
    setQuery('');
    setChatMessages((prev) => [...prev, { sender: 'user', text: userQ }]);

    setTimeout(() => {
      const reply = hdosAI.askSMKPAdvisor(userQ);
      setChatMessages((prev) => [...prev, { sender: 'ai', text: reply }]);
    }, 400);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header & Sub-tab navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#EC4899]" />
            HDOS AI Architecture (Blueprint §18: AI Assist — Human Approval)
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Sistem AI beroperasi 100% offline &amp; online untuk deteksi bahaya foto, parsing dokumen form, dan audit advisor SMKP.
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
          <button
            onClick={() => setActiveTab('vision')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'vision' ? 'bg-[#EC4899] text-white font-semibold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            AI Photo Scanner
          </button>
          <button
            onClick={() => setActiveTab('parser')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'parser' ? 'bg-[#EC4899] text-white font-semibold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            AI Document Parser
          </button>
          <button
            onClick={() => setActiveTab('advisor')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'advisor' ? 'bg-[#EC4899] text-white font-semibold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            SMKP Copilot
          </button>
        </div>
      </div>

      {activeTab === 'vision' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Photo Canvas with Bounding Boxes */}
          <div className="lg:col-span-2 apple-glass-card p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <ScanEye className="w-4 h-4 text-[#EC4899]" />
                Simulasi Deteksi Visual Lapangan (YOLOv8 Nano / Vision)
              </span>
              <button
                onClick={handleRunScan}
                disabled={scanning}
                className="px-3.5 py-1.5 rounded-xl bg-[#EC4899] hover:bg-pink-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{scanning ? 'Menganalisis Citra...' : 'Pindai Foto Bahaya'}</span>
              </button>
            </div>

            {/* Simulated Photo Viewport with SVG overlay */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-neutral-900 border border-white/10 flex items-center justify-center">
              {/* Stylized mining scene representation */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#18202b] via-[#241c19] to-[#121110] flex flex-col justify-between p-6">
                <div className="flex justify-between items-center text-[10px] text-white/50 font-mono">
                  <span>CAM-PIT-JAJA-04 · LIVE SENSOR FEED</span>
                  <span>ELEVASI RL +45m</span>
                </div>

                {/* Haul Truck graphic silhouette */}
                <div className="relative w-full h-48 flex items-center justify-center">
                  <div className="w-72 h-36 bg-amber-600/30 border border-amber-500/40 rounded-xl relative flex items-center justify-center">
                    <span className="font-mono text-xs font-bold text-amber-300">KOMATSU HD785-7</span>
                    {/* Wheels */}
                    <div className="absolute -bottom-4 left-6 w-12 h-12 rounded-full border-4 border-neutral-700 bg-neutral-900 flex items-center justify-center text-[8px] font-mono text-neutral-500">
                      TIRE 1
                    </div>
                    <div className="absolute -bottom-4 right-6 w-12 h-12 rounded-full border-4 border-neutral-700 bg-neutral-900 flex items-center justify-center text-[8px] font-mono text-neutral-500">
                      TIRE 2
                    </div>
                  </div>

                  {/* Worker Silhouette */}
                  <div className="ml-12 flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-neutral-600 border border-neutral-400" />
                    <div className="w-6 h-10 bg-neutral-800 border border-neutral-600 rounded mt-0.5" />
                  </div>
                </div>

                <div className="text-[10px] font-mono text-neutral-500">
                  LAT: -2.9642 · LNG: 121.9421 · GPS FIXED
                </div>
              </div>

              {/* Bounding Boxes rendered over the scene when scanned */}
              {scanResult &&
                scanResult.boundingBoxes.map((box) => (
                  <div
                    key={box.id}
                    style={{
                      top: `${box.box[0]}%`,
                      left: `${box.box[1]}%`,
                      height: `${box.box[2] - box.box[0]}%`,
                      width: `${box.box[3] - box.box[1]}%`,
                      borderColor: box.color,
                      backgroundColor: `${box.color}15`,
                    }}
                    className="absolute border-2 rounded transition-all animate-in zoom-in-90 duration-300 flex flex-col justify-start"
                  >
                    <div
                      style={{ backgroundColor: box.color }}
                      className="px-1.5 py-0.5 text-black font-bold text-[9px] font-mono leading-tight whitespace-nowrap self-start rounded-b flex items-center gap-1 shadow-md"
                    >
                      <span>{box.label}</span>
                      <span>({Math.round(box.confidence * 100)}%)</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* AI Detection Findings & Approval */}
          <div className="space-y-4">
            <div className="apple-glass-card p-5 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 pb-2 border-b border-white/10">
                Hasil Analisis AI &amp; Rekomendasi
              </h3>

              {scanResult ? (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Tingkat Risiko Rekomendasi:</span>
                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold font-mono">
                      {scanResult.suggestedRiskLevel}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="font-semibold text-neutral-300">Temuan Ketidaksesuaian:</div>
                    {scanResult.findings.map((finding, i) => (
                      <div key={i} className="p-2 rounded-lg bg-white/5 text-[11px] text-neutral-300 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{finding}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300 space-y-1">
                    <div className="font-semibold">Saran Tindakan Langsung:</div>
                    <p>{scanResult.suggestedAction}</p>
                  </div>

                  <button
                    onClick={handleConvertToHazard}
                    className="w-full py-2.5 rounded-xl bg-[#00E676] hover:bg-emerald-400 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer mt-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Setujui &amp; Terbitkan Tiket Hazard</span>
                  </button>
                </div>
              ) : (
                <div className="text-center py-10 text-neutral-400 text-xs space-y-2">
                  <ScanEye className="w-8 h-8 mx-auto text-neutral-600" />
                  <p>Klik tombol &quot;Pindai Foto Bahaya&quot; untuk menjalankan analisis deteksi otomatis objek pertambangan.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'parser' && (
        <div className="apple-glass-card p-6 rounded-2xl space-y-5">
          <div className="pb-3 border-b border-white/10">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileUp className="w-4 h-4 text-[#EC4899]" />
              AI Upload: Dokumen Manual (.docx / .pdf) → Digital Form Runtime
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Workflow: Upload → Detect → Parse → Classify SMKP → Preview → Approve menjadi formulir digital tanpa duplicate form.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => handleParseDocument('Inspeksi_APAR_Tambang.docx')}
              disabled={parsingDoc}
              className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all cursor-pointer"
            >
              <div className="text-xs font-bold text-white">Inspeksi_APAR_Tambang.docx</div>
              <div className="text-[10px] text-neutral-400 mt-1">Uji Proteksi Kebakaran Workshop</div>
            </button>

            <button
              onClick={() => handleParseDocument('Formulir_P2H_HaulTruck_HD785.docx')}
              disabled={parsingDoc}
              className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all cursor-pointer"
            >
              <div className="text-xs font-bold text-white">Formulir_P2H_HaulTruck.docx</div>
              <div className="text-[10px] text-neutral-400 mt-1">Pemeriksaan Kendaraan Berat</div>
            </button>

            <button
              onClick={() => handleParseDocument('Inspeksi_K3_Listrik_Genset.pdf')}
              disabled={parsingDoc}
              className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all cursor-pointer"
            >
              <div className="text-xs font-bold text-white">Inspeksi_K3_Listrik_Genset.pdf</div>
              <div className="text-[10px] text-neutral-400 mt-1">Audit Panel Listrik Tambang</div>
            </button>
          </div>

          {parsingDoc && (
            <div className="py-8 text-center text-xs text-neutral-400 space-y-2">
              <div className="w-6 h-6 border-2 border-[#EC4899] border-t-transparent rounded-full animate-spin mx-auto" />
              <p>AI sedang membedah struktur tabel, checkbox, dan standar referensi dokumen...</p>
            </div>
          )}

          {parsedForm && !parsingDoc && (
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div>
                  <h4 className="text-sm font-bold text-white">{parsedForm.title}</h4>
                  <span className="text-[11px] text-[#00E676] font-mono">{parsedForm.smkpElement}</span>
                </div>
                <button
                  onClick={() => {
                    store.openWindow('inspection');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#00E676] text-black font-bold text-xs cursor-pointer"
                >
                  Gunakan di Inspection Runtime →
                </button>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-300">Daftar Parameter Checkbox yang Berhasil Diekstrak:</div>
                {parsedForm.checklistItems.map((item: any, idx: number) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="text-white font-medium">{item.question}</div>
                      <div className="text-[10px] text-neutral-400 font-mono">Standar: {item.standardRef}</div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-neutral-300">
                      {item.criticality}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'advisor' && (
        <div className="apple-glass-card p-6 rounded-2xl space-y-4">
          <div className="pb-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#EC4899]" />
              SMKP Pertambangan Regulatory Copilot
            </h3>
            <span className="text-[10px] font-mono text-neutral-400">Kepmen ESDM 1827 K / Minerba 185 K</span>
          </div>

          <div className="h-64 overflow-y-auto space-y-3 p-3 rounded-xl bg-black/40 border border-white/10 text-xs">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl max-w-xl text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'ml-auto bg-[#EC4899]/20 border border-[#EC4899]/40 text-white'
                    : 'bg-white/10 border border-white/10 text-neutral-200'
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <form onSubmit={handleSendQuery} className="flex gap-2">
            <input
              type="text"
              placeholder="Tanyakan regulasi SMKP (contoh: masa kedaluwarsa APAR, prosedur PICA, atau kestabilan lereng pit)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#EC4899]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#EC4899] hover:bg-pink-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Tanya</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
