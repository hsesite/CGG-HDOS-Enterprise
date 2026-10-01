import React, { useMemo, useState } from 'react';
import { Camera, ImagePlus, ShieldCheck, TriangleAlert, Upload } from 'lucide-react';
import { useHDOSStore } from '../../core/store';
import type { DraftPhotoEvidence, EvidenceOwnerEntity, PhotoEvidence } from '../../core/types';

const MAX_FILES_PER_BATCH = 4;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Gagal membaca file ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function toDraftEvidence(files: File[]): Promise<DraftPhotoEvidence[]> {
  const items = await Promise.all(
    files.map(async (file, index) => ({
      id: `draft_photo_${Date.now()}_${index}`,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      dataUrl: await readFileAsDataUrl(file),
    })),
  );
  return items;
}

type PhotoEvidencePanelProps = {
  ownerEntity: EvidenceOwnerEntity;
  ownerId?: string;
  createdBy?: string;
  title: string;
  helperText?: string;
  emptyText?: string;
  draftItems?: DraftPhotoEvidence[];
  onDraftItemsChange?: (items: DraftPhotoEvidence[]) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

export const PhotoEvidencePanel: React.FC<PhotoEvidencePanelProps> = ({
  ownerEntity,
  ownerId,
  createdBy,
  title,
  helperText = 'Foto evidence tersimpan lokal di IndexedDB agar tetap tersedia saat offline.',
  emptyText = 'Belum ada photo evidence terlampir.',
  draftItems,
  onDraftItemsChange,
  onSuccess,
  onError,
}) => {
  const store = useHDOSStore();
  const [isProcessing, setIsProcessing] = useState(false);

  const persistedItems = useMemo<PhotoEvidence[]>(
    () => (ownerId ? store.getPhotoEvidence(ownerEntity, ownerId) : []),
    [ownerEntity, ownerId, store, store.photoEvidence],
  );

  const items = ownerId ? persistedItems : draftItems ?? [];

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (files.length === 0) return;
    if (files.length > MAX_FILES_PER_BATCH) {
      onError?.(`Maksimal ${MAX_FILES_PER_BATCH} foto per unggahan.`);
      return;
    }

    const invalidType = files.find((file) => !file.type.startsWith('image/'));
    if (invalidType) {
      onError?.(`File ${invalidType.name} bukan gambar yang didukung.`);
      return;
    }

    const invalidSize = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (invalidSize) {
      onError?.(`File ${invalidSize.name} melebihi batas ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
      return;
    }

    setIsProcessing(true);
    try {
      const prepared = await toDraftEvidence(files);

      if (ownerId && createdBy) {
        await store.attachPhotoEvidence(ownerEntity, ownerId, prepared, createdBy);
        onSuccess?.(`${prepared.length} photo evidence berhasil disimpan lokal dan siap dipakai saat offline.`);
      } else if (onDraftItemsChange) {
        onDraftItemsChange([...(draftItems ?? []), ...prepared]);
        onSuccess?.(`${prepared.length} photo evidence siap ikut tersimpan saat record dibuat.`);
      } else {
        onError?.('Panel evidence belum memiliki target penyimpanan.');
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Gagal memproses photo evidence.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveDraft = (id: string) => {
    if (!onDraftItemsChange) return;
    onDraftItemsChange((draftItems ?? []).filter((item) => item.id !== id));
  };

  return (
    <div className="apple-glass-card p-4 rounded-2xl space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-neutral-300">
            <Camera className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <div className="font-semibold text-white text-sm">{title}</div>
            <div className="text-[11px] text-neutral-400">{helperText}</div>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white cursor-pointer transition-colors">
          <ImagePlus className="w-4 h-4 text-cyan-300" />
          <span>{isProcessing ? 'Memproses...' : 'Tambah Foto'}</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelection} disabled={isProcessing} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Offline-first
        </span>
        <span className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-200 flex items-center gap-1">
          <TriangleAlert className="w-3.5 h-3.5" />
          Tidak dikirim ke backend sampai ada endpoint upload resmi
        </span>
        <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-neutral-300 font-mono">
          {items.length} file
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-xs text-neutral-400">
          <Upload className="w-5 h-5 mx-auto mb-2 text-neutral-500" />
          {emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
              <img src={item.dataUrl} alt={item.fileName} className="w-full h-36 object-cover bg-black/30" />
              <div className="p-3 space-y-1.5">
                <div className="text-xs font-semibold text-white truncate">{item.fileName}</div>
                <div className="text-[11px] text-neutral-400 font-mono">{formatBytes(item.sizeBytes)}</div>
                {ownerId && (
                  <div className="text-[10px] text-cyan-300 font-medium">
                    Status: {(item as PhotoEvidence).syncStatus}
                  </div>
                )}
                {!ownerId && onDraftItemsChange && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDraft(item.id)}
                    className="text-[11px] text-red-300 hover:text-red-200 cursor-pointer"
                  >
                    Hapus dari draft
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
