import React, { useState } from 'react';
import {
  FolderGit2,
  FileText,
  Plus,
  Search,
  Download,
  CheckCircle,
  Clock,
  Tag,
  Eye,
  Shield,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { DocumentItem } from '../../core/types';
import { hdosAuth } from '../../core/auth';

export const RepositoryModule: React.FC = () => {
  const store = useHDOSStore();
  const currentUser = hdosAuth.getCurrentUser();

  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(store.documents[0] || null);
  const [modalNewDocOpen, setModalNewDocOpen] = useState(false);

  // New Doc Form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentItem['category']>('SOP');
  const [smkpElement, setSmkpElement] = useState('Elemen IV: Pengendalian Operasional');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const categories = ['ALL', 'SOP', 'WI', 'Form', 'Inspection', 'Incident', 'PICA', 'Contractor'];

  const filteredDocs = store.documents.filter((doc) => {
    const matchCategory = activeCategory === 'ALL' || doc.category === activeCategory;
    const matchSearch =
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.docNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.smkpElement.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);

    const newDoc = await store.addDocument({
      title,
      category,
      owner: currentUser.name,
      status: 'EFFECTIVE',
      effectiveDate: new Date().toISOString().split('T')[0],
      fileType: 'PDF',
      size: '1.2 MB',
      downloadCount: 0,
      smkpElement,
      summary: summary || 'Dokumen resmi Sistem Manajemen Keselamatan Pertambangan (SMKP) CGG.',
    });

    setSubmitting(false);
    setSelectedDoc(newDoc);
    setModalNewDocOpen(false);
    setTitle('');
    setSummary('');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-[#A855F7]" />
            Repository &amp; SMKP Master Document Control
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Single Source of Truth: Penomoran otomatis (CGG-HSE-SOP-xxx), kontrol revisi, dan audit trail SMKP ESDM.
          </p>
        </div>

        <button
          onClick={() => setModalNewDocOpen(true)}
          className="px-3.5 py-1.5 rounded-xl bg-[#A855F7] hover:bg-purple-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg transition-transform active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Dokumen Baru</span>
        </button>
      </div>

      {/* Filter Bar & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeCategory === cat
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {cat === 'ALL' ? 'Semua Dokumen' : cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari kode atau judul dokumen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#A855F7]"
          />
        </div>
      </div>

      {/* Grid: Document List + Viewer Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document Register List */}
        <div className="lg:col-span-2 apple-glass-card p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Master Dokumen Terdaftar ({filteredDocs.length})
            </span>
            <span className="text-[10px] text-neutral-400 font-mono">Status: Terkendali</span>
          </div>

          <div className="space-y-2">
            {filteredDocs.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;

              return (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-500/15 border-purple-500/40'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span className="font-bold text-[#A855F7]">{doc.docNumber}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-neutral-300">
                          Rev {doc.revision}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-sans">{doc.fileType} · {doc.size}</span>
                      </div>
                      <h4 className="text-xs font-bold text-white leading-snug">{doc.title}</h4>
                      <p className="text-[11px] text-neutral-400 line-clamp-1">{doc.summary}</p>
                    </div>

                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold text-[10px] shrink-0">
                      {doc.status}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[10px] text-neutral-400 font-mono border-t border-white/5 pt-2">
                    <span>{doc.smkpElement}</span>
                    <span>Efektif: {doc.effectiveDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Document Details & Audit Trail */}
        <div>
          {selectedDoc ? (
            <div className="apple-glass-card p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="text-xs font-mono font-bold text-[#A855F7]">{selectedDoc.docNumber}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-neutral-300">
                  Revisi {selectedDoc.revision}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <h4 className="text-sm font-bold text-white leading-snug">{selectedDoc.title}</h4>
                  <div className="text-[11px] text-neutral-400 mt-1 font-mono">{selectedDoc.smkpElement}</div>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-neutral-300 leading-relaxed text-[11px]">
                  {selectedDoc.summary}
                </div>

                <div className="space-y-1.5 text-[11px] text-neutral-400 font-mono border-t border-white/10 pt-3">
                  <div className="flex justify-between">
                    <span>Pemilik Dokumen:</span>
                    <strong className="text-white">{selectedDoc.owner}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Tanggal Berlaku:</span>
                    <strong className="text-white">{selectedDoc.effectiveDate}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Ukuran Berkas:</span>
                    <strong className="text-white">{selectedDoc.size}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Unduhan:</span>
                    <strong className="text-white tabular-nums">{selectedDoc.downloadCount} kali</strong>
                  </div>
                </div>

                {/* Audit Trail Stamp */}
                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 font-mono flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#A855F7] shrink-0" />
                  <span>Audit Trail Permanen: Telah diaudit sesuai ketentuan SMKP ESDM 1827 K.</span>
                </div>

                <button
                  onClick={() => alert(`Mengunduh berkas ${selectedDoc.docNumber} (${selectedDoc.fileType})...`)}
                  className="w-full py-2 rounded-xl bg-[#A855F7] hover:bg-purple-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer mt-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Dokumen SMKP ({selectedDoc.fileType})</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="apple-glass-card p-8 rounded-2xl text-center text-neutral-400 text-xs">
              Pilih dokumen di sebelah kiri untuk melihat detail dan status revisi.
            </div>
          )}
        </div>
      </div>

      {/* New Document Modal */}
      {modalNewDocOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="apple-glass p-6 rounded-2xl border border-white/20 w-full max-w-lg space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-[#A855F7]" />
              Pendaftaran Dokumen Baru ke Central Repository
            </h3>

            <form onSubmit={handleCreateDoc} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Judul Dokumen *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: SOP Manajemen Fatigue & Jam Kerja Tambang"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#A855F7]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Kategori</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#A855F7]"
                  >
                    <option value="SOP" className="bg-neutral-900">SOP (Standar Operasional)</option>
                    <option value="WI" className="bg-neutral-900">WI (Instruksi Kerja)</option>
                    <option value="Form" className="bg-neutral-900">Form (Formulir Digital)</option>
                    <option value="Inspection" className="bg-neutral-900">Inspection</option>
                    <option value="Contractor" className="bg-neutral-900">Contractor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Nomor Dokumen Otomatis</label>
                  <input
                    type="text"
                    disabled
                    value={`CGG-HSE-${category.toUpperCase()}-AUTO`}
                    className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-neutral-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Elemen SMKP ESDM</label>
                <input
                  type="text"
                  value={smkpElement}
                  onChange={(e) => setSmkpElement(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#A855F7]"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Ringkasan Dokumen</label>
                <textarea
                  rows={3}
                  placeholder="Deskripsikan tujuan dan ruang lingkup prosedur..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#A855F7]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalNewDocOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 text-neutral-300 hover:text-white cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[#A855F7] hover:bg-purple-600 text-white font-bold cursor-pointer shadow-md"
                >
                  {submitting ? 'Mendaftarkan...' : 'Daftarkan Dokumen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
