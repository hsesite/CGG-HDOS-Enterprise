import React, { useRef, useState } from 'react';
import {
  FolderGit2,
  Plus,
  Search,
  Download,
  Shield,
  Upload,
  FileText,
  ClipboardList,
  X,
  AlertCircle,
  CheckCircle,
  ClipboardCheck,
  ShieldCheck,
  Send,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { DocumentItem, FormDefinition, FormApprovalWorkflow } from '../../core/types';
import { hdosAuth } from '../../core/auth';
import { getCurrentUser as getSessionUser } from '../../core/auth-utils';
import { hdosDB } from '../../core/db';
import { extractDocumentText, extractChecklistItems, } from '../../core/document-parser';

type StoredDocumentFile = {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const DOCUMENT_FILE_PREFIX = 'document-file-';

const getFileType = (fileName: string): DocumentItem['fileType'] | null => {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'pdf') return 'PDF';
  if (extension === 'docx') return 'DOCX';
  if (extension === 'xlsx') return 'XLSX';

  return null;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.';
};

export const RepositoryModule: React.FC = () => {
  const store = useHDOSStore();
  const currentUser = hdosAuth.getCurrentUser();
  const sessionUser = getSessionUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(
    store.documents[0] || null
  );
  const [modalNewDocOpen, setModalNewDocOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentItem['category']>('SOP');
  const [smkpElement, setSmkpElement] = useState('Elemen IV: Pengendalian Operasional');
  const [summary, setSummary] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatingForm, setGeneratingForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [reviewContentConfirmed, setReviewContentConfirmed] = useState(false);
  const [reviewReferencesConfirmed, setReviewReferencesConfirmed] = useState(false);
  const [reviewCriticalityConfirmed, setReviewCriticalityConfirmed] = useState(false);

  const categories = ['ALL', 'SOP', 'WI', 'Form', 'Inspection', 'Incident', 'PICA', 'Contractor'];

  const selectedForm = selectedDoc
    ? store.getFormDefinitionByDocumentId(selectedDoc.id)
    : undefined;
  const hasSessionRole = (role: string) => Boolean(sessionUser?.roles?.includes(role));
  const approverName = sessionUser?.displayName || sessionUser?.email || currentUser.name;

  const filteredDocs = store.documents.filter((doc) => {
    const matchCategory = activeCategory === 'ALL' || doc.category === activeCategory;
    const query = searchQuery.toLowerCase();
    const matchSearch =
      doc.title.toLowerCase().includes(query) ||
      doc.docNumber.toLowerCase().includes(query) ||
      doc.smkpElement.toLowerCase().includes(query);
    return matchCategory && matchSearch;
  });

  const resetMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleFileChange = (file: File | null) => {
    resetMessages();

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const fileType = getFileType(file.name);
    if (!fileType) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setErrorMessage('Format tidak didukung. Pilih berkas PDF, DOCX, atau XLSX.');
      return;
    }

    if (file.size <= 0) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setErrorMessage('Berkas kosong tidak dapat diunggah.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setErrorMessage('Ukuran berkas melebihi batas 15 MB.');
      return;
    }

    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const handleCreateDoc = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();

    if (!title.trim()) {
      setErrorMessage('Judul dokumen wajib diisi.');
      return;
    }

    if (!selectedFile) {
      setErrorMessage('Pilih berkas PDF, DOCX, atau XLSX terlebih dahulu.');
      return;
    }

    const fileType = getFileType(selectedFile.name);
    if (!fileType) {
      setErrorMessage('Format berkas tidak didukung.');
      return;
    }

    setSubmitting(true);

    try {
      // Do not silently fall back to localStorage for binary files:
      // JSON serialization would not preserve the original file.
      const db = await hdosDB.init();
      if (!db) {
        throw new Error('Penyimpanan IndexedDB tidak tersedia. Aktifkan dukungan penyimpanan browser lalu coba lagi.');
      }

      const newDoc = await store.addDocument({
        title: title.trim(),
        category,
        owner: currentUser?.name || 'Pengguna HDOS',
        status: 'DRAFT',
        effectiveDate: '',
        fileType,
        size: formatFileSize(selectedFile.size),
        downloadCount: 0,
        smkpElement: smkpElement.trim() || 'Belum ditentukan',
        summary: summary.trim() || 'Dokumen menunggu pemeriksaan dan persetujuan.',
      });

      const storedFile: StoredDocumentFile = {
        id: `${DOCUMENT_FILE_PREFIX}${newDoc.id}`,
        blob: selectedFile,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        size: selectedFile.size,
        uploadedAt: new Date().toISOString(),
      };

      await hdosDB.put('photos', storedFile);

      setSelectedDoc(newDoc);
      setModalNewDocOpen(false);
      setTitle('');
      setSummary('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSuccessMessage(
        `Dokumen ${newDoc.docNumber} berhasil didaftarkan sebagai DRAFT. Periksa dokumen sebelum menyetujui atau memberlakukannya.`
      );
    } catch (error) {
      console.error('[RepositoryModule] Gagal mengunggah dokumen:', error);
      setErrorMessage(`Dokumen gagal disimpan: ${getErrorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadDoc = async (doc: DocumentItem) => {
    resetMessages();
    setDownloading(true);

    try {
      const db = await hdosDB.init();
      if (!db) {
        throw new Error('IndexedDB tidak tersedia pada browser ini.');
      }

      const storedFile = await hdosDB.getById<StoredDocumentFile>(
        'photos',
        `${DOCUMENT_FILE_PREFIX}${doc.id}`
      );

      if (!storedFile?.blob) {
        throw new Error('Berkas asli tidak ditemukan di penyimpanan lokal untuk dokumen ini.');
      }

      const blob = storedFile.blob instanceof Blob
        ? storedFile.blob
        : new Blob([storedFile.blob as BlobPart], { type: storedFile.mimeType });

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = storedFile.fileName || `${doc.docNumber}.${doc.fileType.toLowerCase()}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setSuccessMessage(`Unduhan ${doc.docNumber} dimulai.`);
    } catch (error) {
      console.error('[RepositoryModule] Gagal mengunduh dokumen:', error);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  const handleGenerateForm = async (doc: DocumentItem) => {
    resetMessages();
    setGeneratingForm(true);

    try {
      const existingForm = store.getFormDefinitionByDocumentId(doc.id);
      if (existingForm) {
        setSuccessMessage(
          `Draft formulir untuk ${doc.docNumber} sudah tersedia: ${existingForm.title}.`
        );
        return;
      }

     
      const db = await hdosDB.init();
      if (!db) {
        throw new Error('IndexedDB tidak tersedia pada browser ini.');
      }

      const storedFile = await hdosDB.getById<StoredDocumentFile>(
        'photos',
        `${DOCUMENT_FILE_PREFIX}${doc.id}`
      );

      if (!storedFile?.blob) {
        throw new Error(
          'Berkas asli tidak ditemukan. Unggah ulang dokumen ini sebelum membuat checklist.'
        );
      }

      const originalBlob = storedFile.blob instanceof Blob
        ? storedFile.blob
        : new Blob([storedFile.blob as BlobPart], {
            type: storedFile.mimeType || 'application/octet-stream',
          });

      const extracted = await extractDocumentText(
        originalBlob,
        storedFile.fileName ||
          `${doc.docNumber}.${doc.fileType.toLowerCase()}`
      );

      const checklistItems = extractChecklistItems(extracted.text);

      if (checklistItems.length === 0) {
        throw new Error(
          `Teks berhasil dibaca (${extracted.sourceType}), tetapi tidak ditemukan kandidat checklist yang jelas. Silakan periksa dokumen atau buat checklist secara manual.`
        );
      }

      const parsed = {
        title: `Draft Checklist: ${doc.title}`,
        category: doc.category,
        smkpElement: doc.smkpElement,
        checklistItems,
      };

      const fields = parsed.checklistItems.map((item, index) => ({
        id: `field_${index + 1}`,
        order: index + 1,
        label: item.question,
        description: `Tingkat kritikalitas: ${item.criticality}. Referensi: ${item.standardRef}`,
        type: 'RADIO' as const,
        options: [
          { value: 'PASS', label: 'Sesuai' },
          { value: 'FAIL', label: 'Tidak Sesuai' },
          { value: 'NA', label: 'Tidak Berlaku' },
        ],
        validation: { required: true },
        createsFindingOnNegative: true,
        negativeValue: 'FAIL',
        metadata: {
          criticality: item.criticality,
          standardRef: item.standardRef,
          source: 'document-text-extraction',
          sourceType: extracted.sourceType,
          sourceDocumentName: storedFile.fileName,
          extractionMethod: 'client-side-text-parser',
        },
      }));

      const formInput: Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'> = {
        sourceDocumentId: doc.id,
        formNumber: `${doc.docNumber}-FORM`,
        title: parsed.title || `Draft Checklist: ${doc.title}`,
        category: parsed.category || doc.category,
        department: 'HSE',
        revision: String(doc.revision),
        effectiveDate: '',
        status: 'DRAFT',
        version: 1,
        fields,
        generatedByAI: false,
        aiConfidence: 0.35,
      };

      const newForm = await store.addFormDefinition(formInput);
      setSuccessMessage(
        `Draft formulir "${newForm.title}" dibuat dengan ${fields.length} pertanyaan. Draft belum dipublikasikan dan wajib ditinjau oleh petugas berwenang.`
      );
    } catch (error) {
      console.error('[RepositoryModule] Gagal membuat draft formulir:', error);
      setErrorMessage(`Draft formulir gagal dibuat: ${getErrorMessage(error)}`);
    } finally {
      setGeneratingForm(false);
    }
  };

  const handleStartFormReview = async () => {
    resetMessages();
    if (!selectedForm) {
      setErrorMessage('Draft formulir belum tersedia.');
      return;
    }
    if (selectedForm.status !== 'DRAFT') {
      setErrorMessage('Hanya formulir berstatus DRAFT yang dapat diajukan untuk review.');
      return;
    }
    if (selectedForm.fields.length === 0 || selectedForm.fields.some((field) =>
      !field.label.trim() ||
      !field.type ||
      (['RADIO', 'SELECT', 'MULTI_SELECT', 'CHECKBOX'].includes(field.type) &&
        (!field.options || field.options.length === 0))
    )) {
      setErrorMessage('Validasi struktur gagal: pastikan setiap pertanyaan memiliki label dan pilihan jawaban yang diperlukan.');
      return;
    }
    if (!reviewContentConfirmed || !reviewReferencesConfirmed || !reviewCriticalityConfirmed) {
      setErrorMessage('Centang ketiga pemeriksaan manusia: isi pertanyaan, referensi standar, dan tingkat kritikalitas.');
      return;
    }

    try {
      const approvalWorkflow: FormApprovalWorkflow = {
        contentReviewed: true,
        referencesReviewed: true,
        criticalityReviewed: true,
        approvals: {},
      };
      await store.updateFormDefinition(selectedForm.id, {
        status: 'REVIEW',
        approvalWorkflow,
      });
      setSuccessMessage('Validasi awal selesai. Formulir masuk REVIEW dan menunggu persetujuan Foreman Safety.');
    } catch (error) {
      setErrorMessage(`Gagal mengajukan review: ${getErrorMessage(error)}`);
    }
  };

  const handleApproveForm = async (role: 'Foreman Safety' | 'SPV HSE' | 'KTT') => {
    resetMessages();
    if (!selectedForm || selectedForm.status !== 'REVIEW') {
      setErrorMessage('Formulir harus berada pada status REVIEW sebelum persetujuan.');
      return;
    }
    if (!hasSessionRole(role)) {
      setErrorMessage(`Persetujuan tahap ini hanya dapat dilakukan oleh pengguna dengan role ${role}.`);
      return;
    }

    const workflow = selectedForm.approvalWorkflow;
    if (!workflow?.contentReviewed || !workflow.referencesReviewed || !workflow.criticalityReviewed) {
      setErrorMessage('Formulir belum menyelesaikan seluruh validasi awal.');
      return;
    }
    if (role === 'SPV HSE' && !workflow.approvals.foreman) {
      setErrorMessage('Persetujuan Foreman Safety wajib diselesaikan lebih dahulu.');
      return;
    }
    if (role === 'KTT' && !workflow.approvals.spvHse) {
      setErrorMessage('Persetujuan SPV HSE wajib diselesaikan lebih dahulu.');
      return;
    }

    const record = { role, approvedBy: approverName, approvedAt: new Date().toISOString() };
    const approvals = {
      ...workflow.approvals,
      ...(role === 'Foreman Safety' ? { foreman: record } : {}),
      ...(role === 'SPV HSE' ? { spvHse: record } : {}),
      ...(role === 'KTT' ? { ktt: record } : {}),
    };
    try {
      await store.updateFormDefinition(selectedForm.id, {
        status: role === 'KTT' ? 'APPROVED' : 'REVIEW',
        approvalWorkflow: { ...workflow, approvals },
      });
      setSuccessMessage(
        role === 'KTT'
          ? 'Persetujuan KTT tercatat. Formulir berstatus APPROVED dan siap diterbitkan oleh KTT.'
          : `Persetujuan ${role} tercatat. Tahap berikutnya menunggu ${role === 'Foreman Safety' ? 'SPV HSE' : 'KTT'}.`
      );
    } catch (error) {
      setErrorMessage(`Gagal menyimpan persetujuan: ${getErrorMessage(error)}`);
    }
  };

  const handlePublishForm = async () => {
    resetMessages();
    if (!selectedForm || selectedForm.status !== 'APPROVED') {
      setErrorMessage('Formulir hanya dapat diterbitkan setelah seluruh persetujuan selesai.');
      return;
    }
    if (!hasSessionRole('KTT')) {
      setErrorMessage('Penerbitan final hanya dapat dilakukan oleh pengguna dengan role KTT.');
      return;
    }
    const workflow = selectedForm.approvalWorkflow;
    if (!workflow?.approvals.foreman || !workflow.approvals.spvHse || !workflow.approvals.ktt) {
      setErrorMessage('Rantai persetujuan Foreman Safety → SPV HSE → KTT belum lengkap.');
      return;
    }
    try {
      await store.updateFormDefinition(selectedForm.id, {
        status: 'PUBLISHED',
        effectiveDate: new Date().toISOString().slice(0, 10),
        approvalWorkflow: {
          ...workflow,
          publishedBy: approverName,
          publishedAt: new Date().toISOString(),
        },
      });
      setSuccessMessage('Formulir berhasil diterbitkan dan berstatus PUBLISHED.');
    } catch (error) {
      setErrorMessage(`Gagal menerbitkan formulir: ${getErrorMessage(error)}`);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-[#A855F7]" />
            Repository &amp; SMKP Master Document Control
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Repository dokumen terkendali, penyimpanan berkas, dan pembuatan draft checklist digital.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetMessages();
            setModalNewDocOpen(true);
          }}
          className="px-3.5 py-1.5 rounded-xl bg-[#A855F7] hover:bg-purple-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg transition-transform active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Dokumen Baru</span>
        </button>
      </div>

      {(errorMessage || successMessage) && (
        <div
          role="status"
          className={`rounded-xl border p-3 text-xs flex items-start gap-2 ${
            errorMessage
              ? 'bg-red-500/10 border-red-500/30 text-red-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          }`}
        >
          {errorMessage ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{errorMessage || successMessage}</span>
          <button
            type="button"
            onClick={resetMessages}
            className="ml-auto text-current opacity-70 hover:opacity-100"
            aria-label="Tutup pesan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              type="button"
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

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari kode atau judul dokumen..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-[#A855F7]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 apple-glass-card p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
              Master Dokumen Terdaftar ({filteredDocs.length})
            </span>
            <span className="text-[10px] text-neutral-400 font-mono">Status: Terkendali</span>
          </div>

          <div className="space-y-2">
            {filteredDocs.length === 0 && (
              <div className="p-8 text-center text-xs text-neutral-400">
                Tidak ada dokumen yang sesuai dengan pencarian.
              </div>
            )}

            {filteredDocs.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;

              return (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedDoc(doc);
                    setReviewContentConfirmed(false);
                    setReviewReferencesConfirmed(false);
                    setReviewCriticalityConfirmed(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedDoc(doc);
                    }
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-purple-500/15 border-purple-500/40'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
                        <span className="font-bold text-[#A855F7]">{doc.docNumber}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-neutral-300">
                          Rev {doc.revision}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-sans">
                          {doc.fileType} · {doc.size}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white leading-snug">{doc.title}</h4>
                      <p className="text-[11px] text-neutral-400 line-clamp-1">{doc.summary}</p>
                    </div>

                    <span className={`px-2 py-0.5 rounded font-semibold text-[10px] shrink-0 ${
                      doc.status === 'EFFECTIVE'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-200'
                    }`}>
                      {doc.status}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px] text-neutral-400 font-mono border-t border-white/5 pt-2">
                    <span className="truncate">{doc.smkpElement}</span>
                    <span className="shrink-0">
                      {doc.effectiveDate ? `Efektif: ${doc.effectiveDate}` : 'Belum diberlakukan'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
                  <div className="flex justify-between gap-3">
                    <span>Pemilik Dokumen:</span>
                    <strong className="text-white text-right">{selectedDoc.owner}</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Status Dokumen:</span>
                    <strong className="text-white text-right">{selectedDoc.status}</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Ukuran Berkas:</span>
                    <strong className="text-white text-right">{selectedDoc.size}</strong>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Total Unduhan:</span>
                    <strong className="text-white tabular-nums">{selectedDoc.downloadCount} kali</strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 font-mono flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#A855F7] shrink-0" />
                  <span>Dokumen berstatus DRAFT/REVIEW harus ditinjau dan disetujui sebelum diberlakukan.</span>
                </div>

                <button
                  type="button"
                  disabled={downloading}
                  onClick={() => void handleDownloadDoc(selectedDoc)}
                  className="w-full py-2 rounded-xl bg-[#A855F7] hover:bg-purple-600 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{downloading ? 'Menyiapkan unduhan...' : `Unduh Dokumen (${selectedDoc.fileType})`}</span>
                </button>

                <button
                  type="button"
                  disabled={generatingForm || selectedDoc.status === 'DRAFT' && !selectedDoc.summary}
                  onClick={() => void handleGenerateForm(selectedDoc)}
                  className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>{generatingForm ? 'Membuat draft checklist...' : 'Buat Draft Checklist Digital'}</span>
                </button>

                {selectedForm && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-white font-bold">
                        <ClipboardCheck className="w-4 h-4 text-[#A855F7]" />
                        <span>Validasi & Penerbitan Form</span>
                      </div>
                      <span className={`rounded px-2 py-1 text-[10px] font-bold ${selectedForm.status === 'PUBLISHED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-200'}`}>
                        {selectedForm.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-400">
                      {selectedForm.formNumber} · {selectedForm.fields.length} pertanyaan · Revisi {selectedForm.revision || '1'}
                    </p>
                    <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                      {selectedForm.fields.map((field) => (
                        <div key={field.id} className="rounded-lg border border-white/10 p-2">
                          <p className="text-[11px] text-white">{field.order}. {field.label}</p>
                          <p className="text-[10px] text-neutral-400 mt-1">{field.description || 'Tidak ada keterangan'}</p>
                        </div>
                      ))}
                    </div>
                    {selectedForm.status === 'DRAFT' && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-amber-200">Checklist validasi wajib</p>
                        <label className="flex items-start gap-2 text-[11px] text-neutral-200">
                          <input type="checkbox" checked={reviewContentConfirmed} onChange={(event) => setReviewContentConfirmed(event.target.checked)} className="mt-0.5 accent-purple-500" />
                          Saya telah membandingkan seluruh pertanyaan dengan dokumen sumber.
                        </label>
                        <label className="flex items-start gap-2 text-[11px] text-neutral-200">
                          <input type="checkbox" checked={reviewReferencesConfirmed} onChange={(event) => setReviewReferencesConfirmed(event.target.checked)} className="mt-0.5 accent-purple-500" />
                          Referensi peraturan/standar telah diverifikasi; tidak hanya mengandalkan hasil ekstraksi.
                        </label>
                        <label className="flex items-start gap-2 text-[11px] text-neutral-200">
                          <input type="checkbox" checked={reviewCriticalityConfirmed} onChange={(event) => setReviewCriticalityConfirmed(event.target.checked)} className="mt-0.5 accent-purple-500" />
                          Tingkat kritikalitas dan pilihan jawaban telah ditinjau petugas HSE.
                        </label>
                        <button type="button" onClick={() => void handleStartFormReview()} className="w-full rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-2 text-[11px] font-bold text-amber-100 hover:bg-amber-500/30">
                          Ajukan ke REVIEW
                        </button>
                      </div>
                    )}
                    {selectedForm.status === 'REVIEW' && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-amber-200">Persetujuan berjenjang</p>
                        <div className="space-y-1 text-[10px] text-neutral-300">
                          <p>{selectedForm.approvalWorkflow?.approvals.foreman ? '✓' : '○'} Foreman Safety {selectedForm.approvalWorkflow?.approvals.foreman ? `— ${selectedForm.approvalWorkflow.approvals.foreman.approvedBy}` : '— menunggu'}</p>
                          <p>{selectedForm.approvalWorkflow?.approvals.spvHse ? '✓' : '○'} SPV HSE {selectedForm.approvalWorkflow?.approvals.spvHse ? `— ${selectedForm.approvalWorkflow.approvals.spvHse.approvedBy}` : '— menunggu'}</p>
                          <p>{selectedForm.approvalWorkflow?.approvals.ktt ? '✓' : '○'} KTT {selectedForm.approvalWorkflow?.approvals.ktt ? `— ${selectedForm.approvalWorkflow.approvals.ktt.approvedBy}` : '— menunggu'}</p>
                        </div>
                        {!selectedForm.approvalWorkflow?.approvals.foreman && hasSessionRole('Foreman Safety') && <button type="button" onClick={() => void handleApproveForm('Foreman Safety')} className="w-full rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold hover:bg-white/15">Setujui sebagai Foreman Safety</button>}
                        {selectedForm.approvalWorkflow?.approvals.foreman && !selectedForm.approvalWorkflow?.approvals.spvHse && hasSessionRole('SPV HSE') && <button type="button" onClick={() => void handleApproveForm('SPV HSE')} className="w-full rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold hover:bg-white/15">Setujui sebagai SPV HSE</button>}
                        {selectedForm.approvalWorkflow?.approvals.spvHse && !selectedForm.approvalWorkflow?.approvals.ktt && hasSessionRole('KTT') && <button type="button" onClick={() => void handleApproveForm('KTT')} className="w-full rounded-lg bg-white/10 px-3 py-2 text-[11px] font-bold hover:bg-white/15">Setujui sebagai KTT</button>}
                        {!hasSessionRole('Foreman Safety') && !hasSessionRole('SPV HSE') && !hasSessionRole('KTT') && <p className="text-[10px] text-neutral-400">Akun ini tidak memiliki role approver. Gunakan akun sesuai tahap persetujuan.</p>}
                      </div>
                    )}
                    {selectedForm.status === 'APPROVED' && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-emerald-200">Persetujuan lengkap. Formulir belum diterbitkan.</p>
                        {hasSessionRole('KTT') ? (
                          <button type="button" onClick={() => void handlePublishForm()} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-500">
                            <Send className="inline w-3.5 h-3.5 mr-1" /> Terbitkan Formulir
                          </button>
                        ) : <p className="text-[10px] text-neutral-400">Penerbitan final menunggu akun KTT.</p>}
                      </div>
                    )}
                    {selectedForm.status === 'PUBLISHED' && (
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[10px] text-emerald-200 space-y-1">
                        <p className="font-bold flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Formulir telah diterbitkan.</p>
                        <p>Diterbitkan oleh: {selectedForm.approvalWorkflow?.publishedBy || 'KTT'}</p>
                        <p>Tanggal efektif: {selectedForm.effectiveDate || 'Belum ditetapkan'}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="apple-glass-card p-8 rounded-2xl text-center text-neutral-400 text-xs">
              Pilih dokumen di sebelah kiri untuk melihat detail dan status revisi.
            </div>
          )}
        </div>
      </div>

      {modalNewDocOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="apple-glass p-6 rounded-2xl border border-white/20 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-[#A855F7]" />
                Pendaftaran Dokumen Baru ke Central Repository
              </h3>
              <button
                type="button"
                onClick={() => setModalNewDocOpen(false)}
                className="text-neutral-400 hover:text-white"
                aria-label="Tutup formulir"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDoc} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Judul Dokumen *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: SOP Manajemen Fatigue & Jam Kerja Tambang"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#A855F7]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Kategori</label>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as DocumentItem['category'])}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#A855F7]"
                  >
                    <option value="SOP" className="bg-neutral-900">SOP (Standar Operasional)</option>
                    <option value="WI" className="bg-neutral-900">WI (Instruksi Kerja)</option>
                    <option value="Form" className="bg-neutral-900">Form (Formulir Digital)</option>
                    <option value="Inspection" className="bg-neutral-900">Inspection</option>
                    <option value="Incident" className="bg-neutral-900">Incident</option>
                    <option value="PICA" className="bg-neutral-900">PICA</option>
                    <option value="Contractor" className="bg-neutral-900">Contractor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1 font-medium">Nomor Dokumen Otomatis</label>
                  <input
                    type="text"
                    disabled
                    value={`CGG-HSE-${category.toUpperCase()}-xxx`}
                    className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-neutral-400 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Elemen SMKP ESDM</label>
                <input
                  type="text"
                  value={smkpElement}
                  onChange={(event) => setSmkpElement(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#A855F7]"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Ringkasan / Ruang Lingkup Dokumen</label>
                <textarea
                  rows={3}
                  placeholder="Tuliskan tujuan, ruang lingkup, atau poin penting dokumen. Ringkasan ini menjadi masukan awal generator draft."
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white focus:outline-none focus:border-[#A855F7]"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-medium">Berkas Dokumen * (PDF, DOCX, XLSX; maks. 15 MB)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  required
                  accept=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => handleFileChange(event.target.files?.[0] || null)}
                  className="block w-full text-xs text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-500/20 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-purple-200 hover:file:bg-purple-500/30"
                />
                {selectedFile && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 p-2 text-neutral-300">
                    <FileText className="w-4 h-4 text-purple-300 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{selectedFile.name}</span>
                    <span className="shrink-0 text-neutral-400">{formatFileSize(selectedFile.size)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-neutral-400 hover:text-white"
                      aria-label="Hapus berkas pilihan"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <p className="mt-1 text-[10px] text-neutral-500">
                  Berkas disimpan di penyimpanan browser pada perangkat ini. Belum otomatis tersinkron ke perangkat lain.
                </p>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-100 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Dokumen baru akan berstatus DRAFT. Jangan menganggapnya sebagai dokumen berlaku sebelum ditinjau dan disetujui.</span>
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
                  disabled={submitting || !selectedFile}
                  className="px-5 py-2 rounded-xl bg-[#A855F7] hover:bg-purple-600 disabled:opacity-50 text-white font-bold cursor-pointer shadow-md flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {submitting ? 'Menyimpan dokumen...' : 'Unggah & Daftarkan sebagai Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
