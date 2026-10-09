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
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import { DocumentItem, FormDefinition, DocumentLevel, DocumentControlMetadata } from '../../core/types';
import { hdosAuth } from '../../core/auth';
import { getCurrentUser as getSessionUser } from '../../core/auth-utils';
import { hdosDB } from '../../core/db';
import { extractDocumentText, extractChecklistItemsFromDocument, renderDocumentPreviewHtml } from '../../core/document-parser';

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

type DocumentRegisterPreview = {
  sourceDocumentNumber: string;
  revisionStatus: string;
  documentControl: DocumentControlMetadata;
};

const REGISTER_MISSING = '-';

const extractDocumentTitle = (text: string, fileName: string): string => {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const titleLine = lines.slice(0, 30).find((line) =>
    line.length >= 6
    && line.length <= 180
    && /\b(form|sop|prosedur|instruksi kerja|checklist|pemeriksaan|inspeksi|manual mutu|kebijakan|work instruction|standard operating procedure)\b/i.test(line)
    && !/^(pt\.?\s|no\.?\s|nomor\s|page\s|halaman\s|departemen\s|jenis kendaraan)/i.test(line)
    && !/^(hal-hal yang diperiksa|kondisi aktual|tingkat risiko|kode bahaya|keterangan)$/i.test(line)
  );
  return titleLine || fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
};

const readRegisterValue = (text: string, patterns: RegExp[]): string => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const captured = match ? match.slice(1).reverse().find((part) => Boolean(part?.trim())) : undefined;
    const value = captured?.replace(/\s+/g, ' ').trim();
    if (value) return value.replace(/[|;]+$/, '').trim() || REGISTER_MISSING;
  }
  return REGISTER_MISSING;
};

const parseDocumentRegister = (
  text: string,
  fileName: string,
  category: DocumentItem['category'],
  title: string
): DocumentRegisterPreview => {
  const normalized = text.replace(/\u00a0/g, ' ').replace(/\r/g, '\n');
  // Match the full register label (for example, "No Dok" or "Nomor Dokumen")
  // before capturing its value. The older expression could mistake the word
  // "Dok" in the label itself for the document number.
  const sourceDocumentNumber = readRegisterValue(normalized, [
    // Common cover-page numbering: "No. 012/Form-CGG/2025".
    /\b(?:no\.?|nomor)\s+([0-9]{1,4}\s*\/\s*[A-Z][A-Z0-9-]*(?:\s*\/\s*[A-Z0-9-]+)+)/i,
    // Register labels such as "No Dok: CGG-HSE-SOP-001".
    /\b(?:nomor\s+dokumen|no\.?\s*dok(?:umen)?|document\s*(?:no\.?|number|id))\s*[:：=|]\s*([A-Z0-9][A-Z0-9./_-]{2,})/i,
    /\b(?:nomor\s+dokumen|no\.?\s*dok(?:umen)?|document\s*(?:no\.?|number|id))\s+([A-Z0-9][A-Z0-9./_-]{2,})/i,
    /\bnomor\s*[:：=|]\s*([A-Z0-9][A-Z0-9./_-]{2,})/i,
    /\bno\.?\s*[:：=|]\s*([A-Z0-9][A-Z0-9./_-]{2,})/i,
  ]).replace(/^(?:dok|dokumen|nomor|no|document|number)$/i, REGISTER_MISSING).replace(/\s*\/\s*/g, '/');
  const revisionMatch = normalized.match(/\b(?:rev(?:isi)?\.?|revisi)\s*[:：.]?\s*(?:ke[- ]?)?([0-9]{1,2})\b/i);
  const parsedRevision = revisionMatch && Number(revisionMatch[1]) >= 0 && Number(revisionMatch[1]) <= 4
    ? revisionMatch[1]
    : REGISTER_MISSING;
  const levelMatch = normalized.match(/\b(Level\s*[1-4])\s*[-:–]?\s*([^\n|]*)/i);
  const inferredLevel = inferDocumentLevel(category, title || fileName.replace(/\.[^.]+$/, ''));
  const documentLevel = levelMatch
    ? (levelMatch[1].toLowerCase().replace(/\s+/g, ' ') === 'level 1' ? 'Level 1 - Manual Mutu'
      : levelMatch[1].toLowerCase().replace(/\s+/g, ' ') === 'level 2' ? 'Level 2 - Prosedur'
        : levelMatch[1].toLowerCase().replace(/\s+/g, ' ') === 'level 3' ? 'Level 3 - Instruksi Kerja'
          : 'Level 4 - Record, Form, Attachment')
    : inferredLevel;
  const explicitDocumentType = readRegisterValue(normalized, [
    /(?:jenis\s+dokumen|document\s+type)\s*[:：]\s*([^\n]+)/i,
  ]);
  const documentControl: DocumentControlMetadata = {
    department: readRegisterValue(normalized, [/(?:departemen|department|dept\.?)\s*[:：]\s*([^\n]+)/i]),
    registerNo: REGISTER_MISSING,
    documentLevel,
    documentType: explicitDocumentType !== REGISTER_MISSING ? explicitDocumentType : inferDocumentType(category, title || fileName),
    sourceDocumentNumber,
    revisionStatus: parsedRevision,
    approvalDate: readRegisterValue(normalized, [/(?:tanggal\s+pengesahan|tanggal\s+persetujuan|approval\s+date|effective\s+date)\s*[:：]\s*([^\n]+)/i]),
    remarks: readRegisterValue(normalized, [/(?:keterangan|remarks)\s*[:：]\s*([^\n]+)/i]),
    weight: readRegisterValue(normalized, [/\bWEIGHT\s*[:：]?\s*([^\n]+)/i]),
    activeWeight: readRegisterValue(normalized, [/\bACT\s*WEIGHT\s*[:：]?\s*([^\n]+)/i]),
    softCopyFiling: readRegisterValue(normalized, [/(?:SOFT\s*COPY|FILING\s*SOFT\s*COPY)\s*[:：]?\s*([^\n]+)/i]),
    hardCopyFiling: readRegisterValue(normalized, [/(?:HARD\s*COPY|FILING\s*HARD\s*COPY)\s*[:：]?\s*([^\n]+)/i]),
    planDistribution: readRegisterValue(normalized, [/\bPLAN\s*MP\s*[:：]?\s*([^\n]+)/i]),
    actualDistribution: readRegisterValue(normalized, [/\bACTUAL\s*DISTRIBUSI\s*[:：]?\s*([^\n]+)/i]),
    distributedTo: readRegisterValue(normalized, [/(?:NAMA\s*MP\s*TERDISTRIBUSI|DISTRIBUTED\s*TO)\s*[:：]?\s*([^\n]+)/i]),
    user: readRegisterValue(normalized, [/\bUSER\s*[:：]\s*([^\n]+)/i]),
  };
  return { sourceDocumentNumber, revisionStatus: parsedRevision, documentControl };
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
  const [registerPreview, setRegisterPreview] = useState<DocumentRegisterPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [registerReadWarning, setRegisterReadWarning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewingOriginal, setPreviewingOriginal] = useState(false);
  const [originalFileUrl, setOriginalFileUrl] = useState('');
  const [originalFileName, setOriginalFileName] = useState('');
  const [originalFileType, setOriginalFileType] = useState<DocumentItem['fileType'] | null>(null);
  const [originalFileHtml, setOriginalFileHtml] = useState('');
  const [originalFileError, setOriginalFileError] = useState('');
  const [generatingForm, setGeneratingForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [, setFormRefreshKey] = useState(0);

  const categories = ['ALL', 'SOP', 'WI', 'Form', 'Inspection', 'Incident', 'PICA', 'Contractor'];
  const selectedForm = selectedDoc
    ? store.getFormDefinitionByDocumentId(selectedDoc.id)
    : undefined;
  const duplicateRegisterDocument = registerPreview ? store.documents.find((doc) => {
    const incomingNumber = registerPreview.sourceDocumentNumber.trim().toLocaleLowerCase('id-ID');
    const existingNumber = (doc.documentControl?.sourceDocumentNumber || REGISTER_MISSING).trim().toLocaleLowerCase('id-ID');
    const incomingRevision = registerPreview.revisionStatus.trim();
    const existingRevision = (doc.documentControl?.revisionStatus || REGISTER_MISSING).trim();
    const sameDocument = incomingNumber !== REGISTER_MISSING && existingNumber !== REGISTER_MISSING
      ? incomingNumber === existingNumber
      : doc.title.trim().replace(/\\s+/g, ' ').toLocaleLowerCase('id-ID') === title.trim().replace(/\\s+/g, ' ').toLocaleLowerCase('id-ID');
    const sameRevision = incomingRevision !== REGISTER_MISSING && existingRevision !== REGISTER_MISSING
      ? incomingRevision === existingRevision
      : true;
    return sameDocument && sameRevision;
  }) : undefined;
  const canDeleteSelectedDoc = Boolean(currentUser?.name && selectedDoc && selectedDoc.owner === currentUser.name);

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

  const handleFileChange = async (file: File | null) => {
    resetMessages();
    setRegisterPreview(null);
    setRegisterReadWarning('');

    if (!file) {
      setSelectedFile(null);
      setPreviewLoading(false);
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
    const autoTitle = title.trim() || file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    if (!title.trim()) setTitle(autoTitle);

    setPreviewLoading(true);
    try {
      const extracted = await extractDocumentText(file, file.name);
      const documentTitle = extractDocumentTitle(extracted.text, file.name);
      setTitle(documentTitle);
      const preview = parseDocumentRegister(extracted.text, file.name, category, documentTitle);
      setRegisterPreview(preview);
    } catch (error) {
      // Keep the source file uploadable even when text extraction is unavailable
      // (for example, a scanned PDF without OCR); unavailable register cells use '-'.
      setRegisterPreview(parseDocumentRegister('', file.name, category, autoTitle));
      setRegisterReadWarning(`Teks dokumen tidak dapat dibaca otomatis (${getErrorMessage(error)}). Kolom yang tidak terbaca ditampilkan sebagai '-'.`);
    } finally {
      setPreviewLoading(false);
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
    if (previewLoading || !registerPreview) {
      setErrorMessage('Tunggu sampai pembacaan otomatis semua kolom register selesai sebelum mengunggah.');
      return;
    }

    if (duplicateRegisterDocument) {
      setErrorMessage(
        `Dokumen terdeteksi sudah terdaftar dengan nomor ${duplicateRegisterDocument.documentControl?.sourceDocumentNumber && duplicateRegisterDocument.documentControl.sourceDocumentNumber !== REGISTER_MISSING ? duplicateRegisterDocument.documentControl.sourceDocumentNumber : duplicateRegisterDocument.docNumber} dan revisi ${duplicateRegisterDocument.documentControl?.revisionStatus || REGISTER_MISSING}. Unggah dibatalkan. Jika ini revisi baru, pastikan nomor dokumen dan nomor revisi pada file sumber sudah terbaca benar.`
      );
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
        documentControl: registerPreview.documentControl,
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
      setRegisterPreview(null);
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

  const closeOriginalPreview = () => {
    if (originalFileUrl) URL.revokeObjectURL(originalFileUrl);
    setOriginalFileUrl('');
    setOriginalFileName('');
    setOriginalFileType(null);
    setOriginalFileHtml('');
    setOriginalFileError('');
    setPreviewingOriginal(false);
  };

  const handlePreviewOriginal = async (doc: DocumentItem) => {
    setOriginalFileError('');
    setPreviewingOriginal(true);
    setOriginalFileUrl('');
    setOriginalFileName('');
    setOriginalFileHtml('');
    setOriginalFileType(doc.fileType);
    try {
      const db = await hdosDB.init();
      if (!db) throw new Error('IndexedDB tidak tersedia pada browser ini.');
      const storedFile = await hdosDB.getById<StoredDocumentFile>('photos', `${DOCUMENT_FILE_PREFIX}${doc.id}`);
      if (!storedFile?.blob) throw new Error('Berkas asli tidak ditemukan di penyimpanan lokal. Coba unggah ulang dokumen ini.');
      const blob = storedFile.blob instanceof Blob
        ? storedFile.blob
        : new Blob([storedFile.blob as BlobPart], { type: storedFile.mimeType });
      const fileName = storedFile.fileName || `${doc.docNumber}.${doc.fileType.toLowerCase()}`;
      setOriginalFileName(fileName);
      setOriginalFileUrl(URL.createObjectURL(blob));
      if (doc.fileType === 'DOCX' || doc.fileType === 'XLSX') {
        const html = await renderDocumentPreviewHtml(blob, fileName);
        setOriginalFileHtml(html);
      }
    } catch (error) {
      setOriginalFileError(getErrorMessage(error));
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

  const handleDeleteDocument = async (doc: DocumentItem) => {
    if (!currentUser?.name || doc.owner !== currentUser.name) {
      setErrorMessage('Penghapusan hanya dapat dilakukan oleh pengguna yang mengunggah dokumen ini.');
      return;
    }
    const confirmed = window.confirm(
      `Hapus dokumen ${doc.docNumber} — ${doc.title}? Formulir digital terkait juga dihapus. Riwayat pemeriksaan yang sudah selesai tetap dipertahankan.`
    );
    if (!confirmed) return;

    resetMessages();
    setDeleting(true);
    try {
      await hdosDB.delete('photos', `${DOCUMENT_FILE_PREFIX}${doc.id}`);
      await store.deleteDocument(doc.id);
      setSelectedDoc(store.documents.find((item) => item.id !== doc.id) || null);
      setSuccessMessage(`Dokumen ${doc.docNumber} berhasil dihapus oleh pengunggahnya.`);
    } catch (error) {
      setErrorMessage(`Dokumen gagal dihapus: ${getErrorMessage(error)}`);
    } finally {
      setDeleting(false);
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
                      ['Departemen', selectedDoc.documentControl?.department || '-'],
                      ['No', selectedDoc.documentControl?.registerNo || '-'],
                      ['Level Dokumen', selectedDoc.documentControl?.documentLevel || inferDocumentLevel(selectedDoc.category, selectedDoc.title)],
                      ['Jenis Dokumen', selectedDoc.documentControl?.documentType || inferDocumentType(selectedDoc.category, selectedDoc.title)],
                      ['Dokumen', selectedDoc.title || '-'],
                      ['Nomor', selectedDoc.documentControl?.sourceDocumentNumber || '-'],
                      ['Status Revisi', selectedDoc.documentControl?.revisionStatus || '-'],
                      ['Tanggal Pengesahan', selectedDoc.documentControl?.approvalDate || '-'],
                      ['Keterangan', selectedDoc.documentControl?.remarks || '-'],
                      ['WEIGHT', selectedDoc.documentControl?.weight || '-'],
                      ['ACT WEIGHT', selectedDoc.documentControl?.activeWeight || '-'],
                      ['Filling Soft Copy', selectedDoc.documentControl?.softCopyFiling || '-'],
                      ['Filling Hard Copy', selectedDoc.documentControl?.hardCopyFiling || '-'],
                      ['Plan MP', selectedDoc.documentControl?.planDistribution || '-'],
                      ['Actual Distribusi', selectedDoc.documentControl?.actualDistribution || '-'],
                      ['Nama MP Terdistribusi', selectedDoc.documentControl?.distributedTo || '-'],
                      ['User', selectedDoc.documentControl?.user || '-'],
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

                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-300 font-mono flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#A855F7] shrink-0" />
                  <span>Dokumen berstatus DRAFT/REVIEW harus ditinjau dan disetujui sebelum diberlakukan.</span>
                </div>

                <button
                  type="button"
                  onClick={() => void handlePreviewOriginal(selectedDoc)}
                  className="w-full py-2 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Lihat File Asli (Popup)</span>
                </button>

                <button
                  type="button"
                  disabled={downloading}
                  onClick={() => void handleDownloadDoc(selectedDoc)}
                  className="w-full py-2 rounded-xl bg-[#A855F7] hover:bg-purple-600 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{downloading ? 'Menyiapkan unduhan...' : `Unduh Dokumen (${selectedDoc.fileType})`}</span>
                </button>

                {canDeleteSelectedDoc && (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void handleDeleteDocument(selectedDoc)}
                    className="w-full py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{deleting ? 'Menghapus dokumen...' : 'Hapus Dokumen (khusus pengunggah)'}</span>
                  </button>
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

      {previewingOriginal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-5 bg-black/85 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Pratinjau file asli">
          <div className="w-full max-w-6xl h-[94vh] overflow-hidden rounded-2xl border border-white/15 bg-[#111418] shadow-2xl flex flex-col">
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#171b21]">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-[#A855F7] font-bold">SMKP Document Control · File asli</p>
                <h3 className="text-sm font-bold text-white truncate">{originalFileName || selectedDoc?.title || 'Memuat file...'}</h3>
                <p className="text-[10px] text-neutral-400">Berkas sumber yang diunggah, bukan formulir hasil ekstraksi</p>
              </div>
              <button type="button" onClick={closeOriginalPreview} className="shrink-0 px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white">Tutup ✕</button>
            </div>
            <div className="min-h-0 flex-1 p-2 sm:p-4 overflow-auto">
              {originalFileError ? (
                <div className="h-full min-h-48 flex flex-col items-center justify-center gap-3 text-center">
                  <AlertCircle className="w-8 h-8 text-amber-300" />
                  <p className="text-sm text-amber-100">{originalFileError}</p>
                </div>
              ) : !originalFileUrl ? (
                <div className="h-full min-h-48 flex items-center justify-center text-sm text-neutral-300">Memuat file asli dari penyimpanan lokal...</div>
              ) : originalFileType === 'PDF' ? (
                <iframe title={originalFileName} src={originalFileUrl} className="w-full h-full min-h-[65vh] rounded-lg bg-white" />
              ) : originalFileHtml ? (
                <div className="h-full overflow-auto rounded-lg bg-white text-neutral-900 p-5 sm:p-8">
                  <style>{`
                    .original-office-preview { font-family: Arial, sans-serif; font-size: 14px; line-height: 1.55; }
                    .original-office-preview h1,.original-office-preview h2,.original-office-preview h3 { font-weight: 700; margin: 1em 0 .5em; }
                    .original-office-preview p { margin: .5em 0; }
                    .original-office-preview table { border-collapse: collapse; width: 100%; margin: 1em 0; }
                    .original-office-preview th,.original-office-preview td { border: 1px solid #777; padding: 5px 7px; vertical-align: top; }
                    .original-office-preview img { max-width: 100%; height: auto; }
                  `}</style>
                  <div className="original-office-preview" dangerouslySetInnerHTML={{ __html: originalFileHtml }} />
                  <div className="mt-6 border-t pt-4 text-center">
                    <a href={originalFileUrl} download={originalFileName} className="inline-flex px-4 py-2 rounded-lg bg-[#A855F7] hover:bg-purple-600 text-white text-xs font-bold">Unduh File Asli</a>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-48 flex flex-col items-center justify-center gap-3 text-center">
                  <FileText className="w-10 h-10 text-[#A855F7]" />
                  <p className="text-sm text-neutral-300">Menyiapkan pratinjau file...</p>
                  <a href={originalFileUrl} download={originalFileName} className="px-4 py-2 rounded-lg bg-[#A855F7] text-white text-xs font-bold">Unduh File Asli</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                  onChange={(event) => void handleFileChange(event.target.files?.[0] || null)}
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

              <div className="rounded-xl border border-[#42A5F5]/25 bg-[#42A5F5]/5 p-3 space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-white">Pratinjau Register SMKP — hasil pembacaan otomatis</h4>
                  <p className="text-[10px] text-neutral-400 mt-1">Kolom tidak ditemukan pada file akan ditandai "-". Tidak perlu mengisi kolom register secara manual.</p>
                </div>
                {previewLoading ? (
                  <div className="flex items-center gap-2 text-sky-200 text-xs"><span className="animate-spin">◌</span> Membaca isi file dan kolom register...</div>
                ) : registerPreview ? (
                  <>
                    {registerReadWarning && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] text-amber-100">{registerReadWarning}</p>}
                    {duplicateRegisterDocument && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-200">
                        <strong>Dokumen dan revisi kemungkinan sudah terdaftar.</strong>
                        <p className="mt-1">Terdaftar sebagai {duplicateRegisterDocument.docNumber}, revisi {duplicateRegisterDocument.documentControl?.revisionStatus || '-'}: {duplicateRegisterDocument.title}. Unggahan dengan nomor/revisi yang sama akan ditolak.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([
                        ['DEPARTEMEN', registerPreview.documentControl.department],
                        ['NO', registerPreview.documentControl.registerNo],
                        ['LEVEL DOKUMEN', registerPreview.documentControl.documentLevel],
                        ['JENIS DOKUMEN', registerPreview.documentControl.documentType],
                        ['DOKUMEN', title.trim() || '-'],
                        ['NOMOR', registerPreview.documentControl.sourceDocumentNumber],
                        ['STATUS REVISI', registerPreview.documentControl.revisionStatus],
                        ['TANGGAL PENGESAHAN', registerPreview.documentControl.approvalDate],
                        ['KETERANGAN', registerPreview.documentControl.remarks],
                        ['WEIGHT', registerPreview.documentControl.weight],
                        ['ACT WEIGHT', registerPreview.documentControl.activeWeight],
                        ['DOKUMEN FILLING — SOFT COPY', registerPreview.documentControl.softCopyFiling],
                        ['DOKUMEN FILLING — HARD COPY', registerPreview.documentControl.hardCopyFiling],
                        ['PLAN MP', registerPreview.documentControl.planDistribution],
                        ['ACTUAL DISTRIBUSI', registerPreview.documentControl.actualDistribution],
                        ['NAMA MP TERDISTRIBUSI', registerPreview.documentControl.distributedTo],
                        ['USER', registerPreview.documentControl.user],
                      ] as Array<[string, string]>).map(([label, value]) => (
                        <div key={label} className="min-w-0 rounded-md border border-white/10 bg-black/20 p-2">
                          <p className="text-[9px] text-neutral-500">{label}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-neutral-100 break-words">{value || '-'}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-neutral-400">Pilih file untuk membaca otomatis kolom register sebelum dokumen disimpan.</p>
                )}
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-100 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Sistem membaca register otomatis, memeriksa nomor dan revisi duplikat, lalu menyimpan dokumen dan membuat formulir digital. Pastikan pratinjau register sesuai isi file sebelum mengunggah.</span>
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
                  disabled={submitting || !selectedFile || previewLoading || !registerPreview || Boolean(duplicateRegisterDocument)}
                  className="px-5 py-2 rounded-xl bg-[#A855F7] hover:bg-purple-600 disabled:opacity-50 text-white font-bold cursor-pointer shadow-md flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {submitting ? 'Menyimpan dokumen...' : 'Unggah & Buat Formulir Digital'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
