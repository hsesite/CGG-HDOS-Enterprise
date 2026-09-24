import React, { useState } from 'react';
import {
  AlertTriangle,
  Plus,
  ShieldAlert,
  Flame,
  CheckCircle,
  MapPin,
  Camera,
  Layers,
  Sparkles,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { MiningArea, Hazard } from '../../core/types';
import { hdosAuth } from '../../core/auth';

export const HazardModule: React.FC = () => {
  const store = useHDOSStore();
  const currentUser = hdosAuth.getCurrentUser();

  const [activeTab, setActiveTab] = useState<'report' | 'register'>('report');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Hazard['category']>('Unsafe Condition');
  const [location, setLocation] = useState<MiningArea>('Pit Jaja KM10');
  const [specificLocation, setSpecificLocation] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [likelihood, setLikelihood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // 5x5 Risk Score Calculation
  const riskScore = severity * likelihood;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (riskScore >= 16) riskLevel = 'CRITICAL';
  else if (riskScore >= 10) riskLevel = 'HIGH';
  else if (riskScore >= 5) riskLevel = 'MEDIUM';
  else riskLevel = 'LOW';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !specificLocation.trim()) return;

    setSubmitting(true);
    const newHaz = await store.addHazard({
      title,
      category,
      location,
      specificLocation,
      riskMatrix: {
        severity,
        likelihood,
        score: riskScore,
        level: riskLevel,
      },
      reporter: currentUser.name,
      reporterRole: currentUser.role,
      status: riskLevel === 'CRITICAL' || riskLevel === 'HIGH' ? 'PICA_ISSUED' : 'OPEN',
      actionTaken,
      aiDetected: false,
    });

    setSubmitting(false);
    setSuccessMsg(
      `Laporan Bahaya ${newHaz.code} berhasil dicatat! ${
        newHaz.picaId ? 'Karena tingkat risiko TINGGI/KRITIS, PICA otomatis diterbitkan untuk penanganan segera.' : ''
      }`
    );

    setTitle('');
    setSpecificLocation('');
    setActionTaken('');

    setTimeout(() => {
      setSuccessMsg('');
      setActiveTab('register');
    }, 2000);
  };

  const filteredHazards = store.hazards.filter((h) => {
    if (filterCategory === 'ALL') return true;
    return h.category === filterCategory;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#FF5252]" />
            Hazard Management & 5x5 Mining Risk Matrix
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Workflow: Temuan → Hazard → 5x5 Risk Assessment → Auto PICA untuk risiko High/Critical.
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
          <button
            onClick={() => setActiveTab('report')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'report' ? 'bg-[#FF5252] text-white font-semibold shadow-sm' : 'text-neutral-300 hover:text-white'
            }`}
          >
            Lapor Temuan Bahaya
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'register' ? 'bg-[#FF5252] text-white font-semibold shadow-sm' : 'text-neutral-300 hover:text-white'
            }`}
          >
            Register Bahaya ({store.hazards.length})
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'report' ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Form Inputs */}
            <div className="lg:col-span-2 space-y-4">
              <div className="apple-glass-card p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  Data Temuan Lapangan
                </h3>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Judul Temuan Bahaya (Hazard Title) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Unit Haul Truck HD785 parkir turunan tanpa ganjal ban (wheel chock)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-[#FF5252]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Kategori Bahaya (SMKP)
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-none focus:border-[#FF5252]"
                    >
                      <option value="Unsafe Condition" className="bg-neutral-900">Unsafe Condition (Kondisi Tidak Aman)</option>
                      <option value="Unsafe Action" className="bg-neutral-900">Unsafe Action (Tindakan Tidak Aman)</option>
                      <option value="Environmental" className="bg-neutral-900">Environmental (Pencemaran Lingkungan/B3)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Area Tambang
                    </label>
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value as MiningArea)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs focus:outline-none focus:border-[#FF5252]"
                    >
                      {store.locations.map((loc) => (
                        <option key={loc.id} value={loc.name} className="bg-neutral-900">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Detail Lokasi Spesifik *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Ramp Akses Bench 4 Elevasi +45, Simpang Tiga KM10"
                    value={specificLocation}
                    onChange={(e) => setSpecificLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-[#FF5252]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Tindakan Pengendalian Langsung yang Telah Dilakukan
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Menginstruksikan operator memasang 2 wheel chock dan mematikan unit..."
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-[#FF5252]"
                  />
                </div>
              </div>
            </div>

            {/* Right 1 Col: 5x5 Risk Matrix Selector */}
            <div className="space-y-4">
              <div className="apple-glass-card p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    5x5 Mining Risk Matrix
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      riskLevel === 'CRITICAL'
                        ? 'bg-red-500 text-white'
                        : riskLevel === 'HIGH'
                        ? 'bg-amber-500 text-black'
                        : riskLevel === 'MEDIUM'
                        ? 'bg-yellow-500 text-black'
                        : 'bg-emerald-500 text-black'
                    }`}
                  >
                    {riskLevel} (Skor: {riskScore})
                  </span>
                </div>

                {/* Severity Selector 1-5 */}
                <div>
                  <div className="flex justify-between text-xs text-neutral-300 mb-1">
                    <span>Keparahan (Severity):</span>
                    <strong className="text-white font-mono">{severity} / 5</strong>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={severity}
                    onChange={(e) => setSeverity(Number(e.target.value) as any)}
                    className="w-full accent-[#FF5252] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500">
                    <span>1: P3K</span>
                    <span>3: Medis</span>
                    <span>5: Fatality</span>
                  </div>
                </div>

                {/* Likelihood Selector 1-5 */}
                <div>
                  <div className="flex justify-between text-xs text-neutral-300 mb-1">
                    <span>Kemungkinan (Likelihood):</span>
                    <strong className="text-white font-mono">{likelihood} / 5</strong>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={likelihood}
                    onChange={(e) => setLikelihood(Number(e.target.value) as any)}
                    className="w-full accent-[#FF5252] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-500">
                    <span>1: Jarang</span>
                    <span>3: Kadang</span>
                    <span>5: Sangat Sering</span>
                  </div>
                </div>

                {/* Risk Advice Box */}
                <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-[11px] space-y-1">
                  <div className="text-neutral-300">
                    Tingkat Bahaya: <strong className="text-white">{riskLevel}</strong>
                  </div>
                  <div className="text-neutral-400">
                    {riskLevel === 'CRITICAL' || riskLevel === 'HIGH'
                      ? '⚠️ Sistem akan otomatis menerbitkan Tiket PICA & notifikasi ke KTT dan SPV HSE.'
                      : 'Informasi temuan akan disimpan dalam register bahaya shift.'}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl bg-[#FF5252] hover:bg-red-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>{submitting ? 'Mencatat Bahaya...' : 'Laporkan Bahaya Tambang'}</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        /* Register Table */
        <div className="apple-glass-card p-5 rounded-2xl space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Master Register Hazard Tambang CGG</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">Filter Kategori:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/15 text-xs text-white"
              >
                <option value="ALL">Semua Kategori</option>
                <option value="Unsafe Condition">Unsafe Condition</option>
                <option value="Unsafe Action">Unsafe Action</option>
                <option value="Environmental">Environmental</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-neutral-400 font-medium">
                  <th className="pb-3 font-semibold">Kode</th>
                  <th className="pb-3 font-semibold">Deskripsi Temuan</th>
                  <th className="pb-3 font-semibold">Kategori</th>
                  <th className="pb-3 font-semibold">Area</th>
                  <th className="pb-3 font-semibold text-center">Risiko 5x5</th>
                  <th className="pb-3 font-semibold">Pelapor</th>
                  <th className="pb-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredHazards.map((haz) => (
                  <tr key={haz.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 font-mono text-[#FF5252] font-semibold">{haz.code}</td>
                    <td className="py-3 text-white font-medium max-w-sm">
                      <div className="truncate">{haz.title}</div>
                      <div className="text-[10px] text-neutral-400 truncate">{haz.specificLocation}</div>
                    </td>
                    <td className="py-3 text-neutral-300">{haz.category}</td>
                    <td className="py-3 text-neutral-400">{haz.location}</td>
                    <td className="py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          haz.riskMatrix.level === 'CRITICAL'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                            : haz.riskMatrix.level === 'HIGH'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {haz.riskMatrix.level} ({haz.riskMatrix.score})
                      </span>
                    </td>
                    <td className="py-3 text-neutral-400">{haz.reporter}</td>
                    <td className="py-3 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          haz.status === 'CLOSED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : haz.status === 'PICA_ISSUED'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {haz.status === 'PICA_ISSUED' ? 'PICA Diterbitkan' : haz.status}
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
