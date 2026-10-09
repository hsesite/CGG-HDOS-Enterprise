import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { DocumentItem, FormDefinition, DocumentLevel, DocumentControlMetadata } from '../../core/types';
import { hdosAuth } from '../../core/auth';
import { getCurrentUser as getSessionUser } from '../../core/auth-utils';
import { hdosDB } from '../../core/db';
import { extractDocumentText, extractChecklistItemsFromDocument } from '../../core/document-parser';

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

const checklistSectionLabel = (section?: string): string => {
  switch (section) {
    case 'HD_CMT': return 'HD/CMT';
    case 'FUEL_LUBE': return 'Fuel Truck / Lube Truck';
    case 'WATER_TRUCK': return 'Water Truck';
    default: return 'Pemeriksaan Umum';
  }
};

const formatChecklistQuestion = (item: { question: string; section?: string }): string =>
  `[${checklistSectionLabel(item.section)}] ${item.question}`;

const inferDocumentLevel = (category: DocumentItem['category'], title: string): DocumentLevel => {
  const value = title.toLocaleLowerCase('id-ID');
  if (/manual mutu|kebijakan|policy|ruang lingkup perusahaan|kepemilikan aset|bispro|regulasi|tanggung jawab perusahaan/.test(value)) {
    return 'Level 1 - Manual Mutu';
  }
  if (/instruksi kerja|\bwi\b|sertifikasi alat|sertifikasi sdm|job desc|job description|matriks kompetensi|matrix kompetensi|legal kontrak|standar kerja/.test(value) || category === 'WI') {
    return 'Level 3 - Instruksi Kerja';
  }
  if (/checklist|check list|rekaman|record|attachment|formulir|\bform\b|inspeksi|inspection|incident|insiden|pica|mom|minutes of meeting/.test(value) || ['Form', 'Inspection', 'Incident', 'PICA'].includes(category)) {
    return 'Level 4 - Record, Form, Attachment';
  }
  return 'Level 2 - Prosedur';
};

const inferDocumentType = (category: DocumentItem['category'], title: string): string => {
  const level = inferDocumentLevel(category, title);
  if (level === 'Level 1 - Manual Mutu') return 'Manual Mutu / Kebijakan';
  if (level === 'Level 2 - Prosedur') return 'Prosedur / SOP';
  if (level === 'Level 3 - Instruksi Kerja') return 'Instruksi Kerja / WI';
  return 'Record / Form / Attachment';
};

const DEFAULT_DOCUMENT_CONTROL: DocumentControlMetadata = {
  department: 'HSE',
  documentLevel: 'Level 2 - Prosedur',
  documentType: 'Prosedur / SOP',
  revisionStatus: '0',
  approvalDate: new Date().toISOString().slice(0, 10),
  remarks: '',
  weight: '',
  activeWeight: '',
  softCopyFiling: 'Ya',
  hardCopyFiling: '',
  planDistribution: '',
  actualDistribution: '',
  distributedTo: '',
  user: '',
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
  const [department, setDepartment] = useState('HSE');
  const [revisionStatus, setRevisionStatus] = useState<DocumentControlMetadata['revisionStatus']>('0');
  const [approvalDate, setApprovalDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [weight, setWeight] = useState('');
  const [activeWeight, setActiveWeight] = useState('');
  const [softCopyFiling, setSoftCopyFiling] = useState('Ya');
  const [hardCopyFiling, setHardCopyFiling] = useState('');
  const [planDistribution, setPlanDistribution] = useState('');
  const [actualDistribution, setActualDistribution] = useState('');
  const [distributedTo, setDistributedTo] = useState('');
  const [documentUser, setDocumentUser] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatingForm, setGeneratingForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [, setFormRefreshKey] = useState(0);

  const categories = ['ALL', 'SOP', 'WI', 'Form', 'Inspection', 'Incident', 'PICA', 'Contractor'];
  const inferredLevel = inferDocumentLevel(category, title);
  const inferredType = inferDocumentType(category, title);

  const selectedForm = selectedDoc
    ? store.getFormDefinitionByDocumentId(selectedDoc.id)
    : undefined;

  // Repair documents uploaded by the earlier flow: a PUBLISHED form means
  // the source document should also be EFFECTIVE in Repository.
  useEffect(() => {
    let cancelled = false;
    const reconcilePublishedDocuments = async () => {
      for (const doc of store.documents) {
        const form = store.getFormDefinitionByDocumentId(doc.id);
        if (form?.status === 'PUBLISHED' && doc.status !== 'EFFECTIVE') {
          try {
            const updated = await store.updateDocument(doc.id, {
              status: 'EFFECTIVE',
              effectiveDate: form.effectiveDate || new Date().toISOString().slice(0, 10),
              summary: doc.summary === 'Dokumen menunggu pemeriksaan dan persetujuan.'
                ? 'Telah divalidasi KTT sebelum diunggah; formulir digital telah diterbitkan.'
                : doc.summary,
            });
            if (!cancelled && selectedDoc?.id === updated.id) setSelectedDoc(updated);
          } catch (error) {
            console.error('[RepositoryModule] Gagal menyelaraskan status dokumen terbit:', error);
          }
        }
      }
    };
    void reconcilePublishedDocuments();
    return () => { cancelled = true; };
  }, [store, store.documents, store.formDefinitions, selectedDoc?.id]);

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
        status: 'EFFECTIVE',
        effectiveDate: new Date().toISOString().slice(0, 10),
        fileType,
        size: formatFileSize(selectedFile.size),
        downloadCount: 0,
        smkpElement: smkpElement.trim() || 'Belum ditentukan',
        summary: summary.trim() || 'Telah divalidasi KTT sebelum diunggah.',
        documentControl: {
          department: department.trim() || 'HSE',
          documentLevel: inferredLevel,
          documentType: inferredType,
          revisionStatus,
          approvalDate,
          remarks: remarks.trim(),
          weight: weight.trim(),
          activeWeight: activeWeight.trim(),
          softCopyFiling,
          hardCopyFiling: hardCopyFiling.trim(),
          planDistribution: planDistribution.trim(),
          actualDistribution: actualDistribution.trim(),
          distributedTo: distributedTo.trim(),
          user: documentUser.trim() || currentUser?.name || 'Pengguna HDOS',
        },
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
      setDepartment('HSE');
      setRevisionStatus('0');
      setApprovalDate(new Date().toISOString().slice(0, 10));
      setRemarks('');
      setWeight('');
      setActiveWeight('');
      setSoftCopyFiling('Ya');
      setHardCopyFiling('');
      setPlanDistribution('');
      setActualDistribution('');
      setDistributedTo('');
      setDocumentUser('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      const formCreated = await handleGenerateForm(newDoc);
      if (formCreated) {
        const effectiveDoc = await store.updateDocument(newDoc.id, {
          status: 'EFFECTIVE',
          effectiveDate: new Date().toISOString().slice(0, 10),
          summary: summary.trim() || 'Telah divalidasi KTT sebelum diunggah; formulir digital telah diterbitkan.',
        });
        setSelectedDoc(effectiveDoc);
        setSuccessMessage(`Dokumen ${newDoc.docNumber} berhasil diunggah, formulir digital dibuat dan diterbitkan, serta status dokumen menjadi EFFECTIVE.`);
      } else {
        setSuccessMessage(`Dokumen ${newDoc.docNumber} berhasil diunggah, tetapi formulir otomatis belum dapat dibuat. Periksa pesan kesalahan dan format/isi dokumen.`);
      }
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

  const handleGenerateForm = async (doc: DocumentItem): Promise<boolean> => {
    resetMessages();
    setGeneratingForm(true);

    try {
      const existingForm = store.getFormDefinitionByDocumentId(doc.id);

      
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

      const checklistItems = await extractChecklistItemsFromDocument(
        originalBlob,
        storedFile.fileName || `${doc.docNumber}.${doc.fileType.toLowerCase()}`,
        extracted.text
      );

      if (checklistItems.length === 0) {
        throw new Error(
          `Teks berhasil dibaca (${extracted.sourceType}), tetapi tidak ditemukan kandidat checklist yang jelas. Silakan periksa dokumen atau buat checklist secara manual.`
        );
      }

      const parsed = {
        title: doc.title,
        category: doc.category,
        smkpElement: doc.smkpElement,
        checklistItems,
      };

      const fields = parsed.checklistItems.map((item, index) => ({
        id: `field_${index + 1}`,
        order: index + 1,
        label: formatChecklistQuestion(item),
        description: `Bagian: ${checklistSectionLabel(item.section)}. Kode bahaya: ${item.hazardCode || '—'}. Tingkat kritikalitas: ${item.criticality}. Referensi: ${item.standardRef}`,
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
          section: item.section || 'GENERAL',
          hazardCode: item.hazardCode || '',
          source: 'document-text-extraction',
          sourceType: extracted.sourceType,
          sourceDocumentName: storedFile.fileName,
          extractionMethod: 'client-side-text-parser',
        },
      }));

      const formInput: Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'> = {
        sourceDocumentId: doc.id,
        formNumber: `${doc.docNumber}-FORM`,
        title: parsed.title || doc.title,
        category: parsed.category || doc.category,
        department: 'HSE',
        revision: String(doc.revision),
        effectiveDate: '',
        status: 'PUBLISHED',
        version: 1,
        fields,
        generatedByAI: false,
        aiConfidence: 0.35,
      };

      if (existingForm) {
        const repairedForm = await store.updateFormDefinition(existingForm.id, {
          ...formInput,
          updatedAt: new Date().toISOString(),
          version: existingForm.version + 1,
        });
        setFormRefreshKey((value) => value + 1);
        setSuccessMessage(
          `Formulir ${repairedForm.title} diperbarui dari tabel checklist dokumen sumber: ${fields.length} pertanyaan.`
        );
        return true;
      }

      const newForm = await store.addFormDefinition(formInput);
      setFormRefreshKey((value) => value + 1);
      setSuccessMessage(
        `Formulir "${newForm.title}" langsung dibuat dan berstatus PUBLISHED dengan ${fields.length} pertanyaan dari tabel checklist dokumen sumber.`
      );
      return true;
    } catch (error) {
      console.error('[RepositoryModule] Gagal membuat draft formulir:', error);
      setErrorMessage(`Formulir otomatis gagal dibuat: ${getErrorMessage(error)}`);
      return false;
    } finally {
      setGeneratingForm(false);
    }
  };

  // Repair already-published DOCX forms created by the old line-based parser.
  // It only updates forms when the checklist labels actually differ.
  useEffect(() => {
    let cancelled = false;
    const repairExistingPublishedForms = async () => {
      const db = await hdosDB.init();
      if (!db) return;
      for (const form of store.formDefinitions) {
        if (cancelled || form.status !== 'PUBLISHED' || !form.sourceDocumentId) continue;
        const doc = store.documents.find((item) => item.id === form.sourceDocumentId);
        if (!doc || doc.fileType !== 'DOCX') continue;
        try {
          const storedFile = await hdosDB.getById<StoredDocumentFile>(
            'photos',
            `${DOCUMENT_FILE_PREFIX}${doc.id}`
          );
          if (!storedFile?.blob) continue;
          const blob = storedFile.blob instanceof Blob
            ? storedFile.blob
            : new Blob([storedFile.blob as BlobPart], { type: storedFile.mimeType || 'application/octet-stream' });
          const extracted = await extractDocumentText(blob, storedFile.fileName || `${doc.docNumber}.docx`);
          const items = await extractChecklistItemsFromDocument(
            blob,
            storedFile.fileName || `${doc.docNumber}.docx`,
            extracted.text
          );
          if (!items.length) continue;
          const existingLabels = form.fields.map((field) => field.label.trim());
          const parsedLabels = items.map((item) => formatChecklistQuestion(item).trim());
          if (existingLabels.length === parsedLabels.length && existingLabels.every((label, index) => label === parsedLabels[index])) continue;

          const fields = items.map((item, index) => ({
            id: `field_${index + 1}`,
            order: index + 1,
            label: formatChecklistQuestion(item),
            description: `Bagian: ${checklistSectionLabel(item.section)}. Kode bahaya: ${item.hazardCode || '—'}. Tingkat kritikalitas: ${item.criticality}. Referensi: ${item.standardRef}`,
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
              section: item.section || 'GENERAL',
              hazardCode: item.hazardCode || '',
              source: 'document-table-extraction',
              sourceType: extracted.sourceType,
              sourceDocumentName: storedFile.fileName,
              extractionMethod: 'docx-table-row-parser',
            },
          }));
          if (!cancelled) {
            await store.updateFormDefinition(form.id, {
              fields,
              title: doc.title,
              version: form.version + 1,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('[RepositoryModule] Gagal memperbaiki checklist formulir:', error);
        }
      }
    };
    void repairExistingPublishedForms();
    return () => { cancelled = true; };
  }, [store, store.formDefinitions, store.documents]);

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

                <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 space-y-2">
                  <h3 className="text-xs font-bold text-sky-200">Register SMKP Document Control</h3>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                    {([
                      ['Departemen', selectedDoc.documentControl?.department || '—'],
                      ['No', selectedDoc.docNumber],
                      ['Level Dokumen', selectedDoc.documentControl?.documentLevel || inferDocumentLevel(selectedDoc.category, selectedDoc.title)],
                      ['Jenis Dokumen', selectedDoc.documentControl?.documentType || inferDocumentType(selectedDoc.category, selectedDoc.title)],
                      ['Dokumen', selectedDoc.title],
                      ['Nomor', selectedDoc.docNumber],
                      ['Status Revisi', selectedDoc.documentControl?.revisionStatus ?? String(selectedDoc.revision)],
                      ['Tanggal Pengesahan', selectedDoc.documentControl?.approvalDate || selectedDoc.effectiveDate || '—'],
                      ['Keterangan', selectedDoc.documentControl?.remarks || '—'],
                      ['WEIGHT', selectedDoc.documentControl?.weight || '—'],
                      ['ACT WEIGHT', selectedDoc.documentControl?.activeWeight || '—'],
                      ['Filling Soft Copy', selectedDoc.documentControl?.softCopyFiling || '—'],
                      ['Filling Hard Copy', selectedDoc.documentControl?.hardCopyFiling || '—'],
                      ['Plan MP', selectedDoc.documentControl?.planDistribution || '—'],
                      ['Actual Distribusi', selectedDoc.documentControl?.actualDistribution || '—'],
                      ['Nama MP Terdistribusi', selectedDoc.documentControl?.distributedTo || '—'],
                      ['User', selectedDoc.documentControl?.user || selectedDoc.owner],
                    ] as Array<[string, string]>).map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <p className="text-neutral-500">{label}</p>
                        <p className="text-neutral-100 break-words font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
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

                {selectedForm && (
                  <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-white">Isi Formulir Digital</h3>
                        <p className="text-[10px] text-neutral-400 mt-1">{selectedForm.formNumber || selectedForm.id} · Revisi {selectedForm.revision || '1'}</p>
                      </div>
                      <span className={`rounded px-2 py-1 text-[10px] font-bold ${selectedForm.status === 'PUBLISHED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-200'}`}>{selectedForm.status}</span>
                    </div>
                    <p className="text-xs font-semibold text-neutral-100">{selectedForm.title}</p>
                    {selectedForm.fields.length > 0 ? (
                      <div className="space-y-2">
                        {selectedForm.fields.map((field, index) => (
                          <div key={field.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                            <p className="text-xs font-medium text-white">{index + 1}. {field.label}</p>
                            {field.description && <p className="text-[10px] text-neutral-400 mt-1">{field.description}</p>}
                            {field.options && field.options.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {field.options.map((option) => (
                                  <span key={option.value} className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-neutral-300">{option.label}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-200">Formulir belum memiliki pertanyaan. Form ini perlu dibuat ulang dari dokumen yang teksnya dapat dibaca.</p>
                    )}
                    {selectedForm.status === 'PUBLISHED' && (
                      <p className="text-[10px] text-emerald-300">Berlaku sejak {selectedForm.effectiveDate || selectedDoc.effectiveDate || 'tanggal belum tercatat'}.</p>
                    )}
                  </div>
                )}

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

              <div className="rounded-xl border border-[#42A5F5]/25 bg-[#42A5F5]/5 p-3 space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-white">SMKP Document Control Register</h4>
                  <p className="text-[10px] text-neutral-400 mt-1">Level dokumen dan jenis dokumen ditentukan otomatis dari kategori serta judul. Kolom register mengikuti lembar kontrol dokumen yang diberikan.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-neutral-300">Departemen
                    <input value={department} onChange={(e) => setDepartment(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                  </label>
                  <label className="text-neutral-300">Level Dokumen (otomatis)
                    <input readOnly value={inferredLevel} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-sky-200" />
                  </label>
                  <label className="text-neutral-300">Jenis Dokumen (otomatis)
                    <input readOnly value={inferredType} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-sky-200" />
                  </label>
                  <label className="text-neutral-300">Status Revisi (0–4)
                    <select value={revisionStatus} onChange={(e) => setRevisionStatus(e.target.value as DocumentControlMetadata['revisionStatus'])} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white">
                      {['0','1','2','3','4'].map((v) => <option key={v} value={v} className="bg-neutral-900">{v}</option>)}
                    </select>
                  </label>
                  <label className="text-neutral-300">Tanggal Pengesahan
                    <input type="date" value={approvalDate} onChange={(e) => setApprovalDate(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                  </label>
                  <label className="text-neutral-300">Keterangan
                    <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                  </label>
                  <label className="text-neutral-300">WEIGHT
                    <input value={weight} onChange={(e) => setWeight(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                  </label>
                  <label className="text-neutral-300">ACT WEIGHT
                    <input value={activeWeight} onChange={(e) => setActiveWeight(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                  </label>
                  <label className="text-neutral-300">Dokumen Filling — Soft Copy
                    <select value={softCopyFiling} onChange={(e) => setSoftCopyFiling(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white">
                      <option value="Ya" className="bg-neutral-900">Ya</option><option value="Tidak" className="bg-neutral-900">Tidak</option>
                    </select>
                  </label>
                  <label className="text-neutral-300">Dokumen Filling — Hard Copy
                    <select value={hardCopyFiling} onChange={(e) => setHardCopyFiling(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white">
                      <option value="" className="bg-neutral-900">Belum diisi</option><option value="Ya" className="bg-neutral-900">Ya</option><option value="Tidak" className="bg-neutral-900">Tidak</option>
                    </select>
                  </label>
                  <label className="text-neutral-300">Plan MP
                    <input value={planDistribution} onChange={(e) => setPlanDistribution(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                  </label>
                  <label className="text-neutral-300">Actual Distribusi
                    <input value={actualDistribution} onChange={(e) => setActualDistribution(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                  </label>
                  <label className="text-neutral-300">Nama MP Terdistribusi
                    <input value={distributedTo} onChange={(e) => setDistributedTo(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                  </label>
                  <label className="text-neutral-300">User
                    <input value={documentUser} onChange={(e) => setDocumentUser(e.target.value)} placeholder={currentUser?.name || 'Pengguna HDOS'} className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/15 text-white" />
                  </label>
                </div>
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
