import { hdosDB, STORES, type StoreName } from './db';
import { AuthState } from './auth-state';

const BACKUP_FORMAT = 'CGG-HDOS-BACKUP';
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

type BackupOwner = {
  userId: string;
  companyCode: string;
  parentCompanyCode: string;
};

type BackupPayload = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  owner: BackupOwner;
  stores: Partial<Record<Exclude<StoreName, 'config'>, unknown[]>>;
};

type BackupArchive = BackupPayload & { checksum: string };

function getOwner(): BackupOwner {
  const user = AuthState.getUser();
  if (!user?.id) throw new Error('Sesi pengguna tidak ditemukan. Silakan login kembali.');
  const companyCode = String(user.companyCode || (user.roles?.includes('Admin CGG') ? 'CGG' : '')).trim().toUpperCase();
  if (!companyCode) throw new Error('Identitas perusahaan akun tidak tersedia; backup dihentikan.');
  return {
    userId: String(user.id),
    companyCode,
    parentCompanyCode: String(user.parentCompanyCode || '').trim().toUpperCase(),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map(key => JSON.stringify(key) + ':' + stableStringify(object[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

async function checksum(payload: BackupPayload): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Browser tidak mendukung pemeriksaan integritas backup.');
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function recordTenantMatches(record: unknown, owner: BackupOwner): boolean {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return true;
  const item = record as Record<string, unknown>;
  const codes = ['companyCode', 'contractorCode', 'ownerCompanyCode', 'subcontractorCode', 'subkonCode', 'parentCompanyCode']
    .map(key => String(item[key] || '').trim().toUpperCase())
    .filter(Boolean);
  return codes.length === 0 || codes.includes(owner.companyCode) ||
    (owner.parentCompanyCode !== '' && codes.includes(owner.parentCompanyCode));
}


async function encodeBinary(value: unknown): Promise<unknown> {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return { __hdosBackupBinary: 'blob', type: value.type, base64: btoa(binary) };
  }
  if (value instanceof ArrayBuffer) {
    const bytes = new Uint8Array(value);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return { __hdosBackupBinary: 'arraybuffer', base64: btoa(binary) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encodeBinary));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([key, item]) => [key, await encodeBinary(item)] as const));
    return Object.fromEntries(entries);
  }
  return value;
}

function decodeBinary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeBinary);
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    if ((item.__hdosBackupBinary === 'blob' || item.__hdosBackupBinary === 'arraybuffer') && typeof item.base64 === 'string') {
      const binary = atob(item.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return item.__hdosBackupBinary === 'blob'
        ? new Blob([bytes], { type: String(item.type || 'application/octet-stream') })
        : bytes.buffer;
    }
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, decodeBinary(child)]));
  }
  return value;
}

export const hdosBackup = {
  async create(): Promise<{ blob: Blob; filename: string; records: number }> {
    const owner = getOwner();
    const stores: BackupPayload['stores'] = {};
    let records = 0;
    const includedStores = STORES.filter(storeName => storeName !== 'config');
    // Capture every local store in one IndexedDB readonly transaction. This
    // prevents a multi-module export from combining pre-write and post-write data.
    const localSnapshot = await hdosDB.getAllBundle(includedStores);

    for (const storeName of STORES) {
      // The config store may contain device/session configuration and is deliberately
      // excluded. Authentication credentials are never part of a portable backup.
      if (storeName === 'config') continue;
      const all = (localSnapshot[storeName] || []) as unknown[];
      const scoped = storeName === 'queue'
        ? all.filter(value => {
            if (!value || typeof value !== 'object') return false;
            const item = value as Record<string, unknown>;
            return item.ownerUserId === owner.userId && item.ownerCompanyCode === owner.companyCode;
          }).map(value => {
            const item = value as Record<string, unknown>;
            return item.status === 'SYNCING'
              ? { ...item, status: 'PENDING', syncStartedAt: undefined, error: 'Dipulihkan dari backup; menunggu sinkronisasi ulang.' }
              : value;
          })
        : storeName === 'photos'
          ? all.filter(value => {
              if (!value || typeof value !== 'object') return false;
              const photo = value as Record<string, unknown>;
              return photo.ownerUserId === owner.userId &&
                photo.ownerCompanyCode === owner.companyCode &&
                recordTenantMatches(value, owner);
            })
          : all.filter(value => recordTenantMatches(value, owner));
      stores[storeName as Exclude<StoreName, 'config'>] = await encodeBinary(scoped) as unknown[];
      records += scoped.length;
    }

    const payload: BackupPayload = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      owner,
      stores,
    };
    const canonicalPayload = JSON.parse(JSON.stringify(payload)) as BackupPayload;
    const archive: BackupArchive = { ...canonicalPayload, checksum: await checksum(canonicalPayload) };
    const serialized = JSON.stringify(archive);
    const backupBlob = new Blob([serialized], { type: 'application/json' });
    if (backupBlob.size <= 0 || backupBlob.size > MAX_BACKUP_BYTES) {
      throw new Error('Backup melebihi batas 100 MB setelah lampiran dikodekan. Kurangi jumlah/ukuran foto atau ekspor data secara bertahap.');
    }
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      blob: backupBlob,
      filename: `CGG_HDOS_BACKUP_${owner.companyCode}_${date}.json`,
      records,
    };
  },

  async restore(file: File): Promise<{ restored: number; skipped: number; createdAt: string }> {
    const owner = getOwner();
    if (file.size <= 0 || file.size > MAX_BACKUP_BYTES) {
      throw new Error('Ukuran file backup tidak valid atau melebihi batas 100 MB.');
    }
    let archive: BackupArchive;
    try {
      archive = JSON.parse(await file.text()) as BackupArchive;
    } catch {
      throw new Error('File backup bukan JSON yang valid atau file rusak.');
    }
    if (!archive || archive.format !== BACKUP_FORMAT || archive.version !== BACKUP_VERSION ||
        !archive.stores || typeof archive.stores !== 'object' || Array.isArray(archive.stores) ||
        !archive.owner || typeof archive.owner !== 'object' ||
        typeof archive.owner.userId !== 'string' || !archive.owner.userId.trim() ||
        typeof archive.owner.companyCode !== 'string' || !archive.owner.companyCode.trim() ||
        typeof archive.owner.parentCompanyCode !== 'string' ||
        typeof archive.createdAt !== 'string' || !Number.isFinite(Date.parse(archive.createdAt)) ||
        typeof archive.checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(archive.checksum)) {
      throw new Error('Metadata backup tidak lengkap, format tidak dikenali, atau versi tidak didukung.');
    }
    const allowedStores = new Set(STORES.filter(storeName => storeName !== 'config'));
    for (const key of Object.keys(archive.stores)) {
      if (!allowedStores.has(key as StoreName)) {
        throw new Error(`Backup memuat modul penyimpanan yang tidak dikenal: ${key}.`);
      }
    }
    if (archive.owner.companyCode !== owner.companyCode ||
        archive.owner.parentCompanyCode !== owner.parentCompanyCode) {
      throw new Error('Backup berasal dari perusahaan atau cakupan kontraktor yang berbeda. Pemulihan dibatalkan.');
    }

    const payload: BackupPayload = {
      format: archive.format,
      version: archive.version,
      createdAt: archive.createdAt,
      owner: archive.owner,
      stores: archive.stores,
    };
    const expected = await checksum(payload);
    if (expected !== archive.checksum) throw new Error('Pemeriksaan integritas gagal. File backup mungkin berubah atau rusak.');

    const changes: Array<{ storeName: StoreName; deleteIds: string[]; records: Array<{ id: string }> }> = [];
    let restored = 0;
    let skipped = 0;

    for (const storeName of STORES) {
      if (storeName === 'config') continue;
      const raw = archive.stores[storeName as Exclude<StoreName, 'config'>];
      if (raw === undefined) continue;
      if (!Array.isArray(raw)) throw new Error(`Struktur data backup untuk ${storeName} tidak valid.`);

      const valid: Array<Record<string, unknown> & { id: string }> = [];
      const seenIds = new Set<string>();
      for (const encodedCandidate of raw) {
        const candidate = decodeBinary(encodedCandidate);
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
            typeof (candidate as Record<string, unknown>).id !== 'string' ||
            !(candidate as Record<string, unknown>).id) {
          skipped++;
          continue;
        }
        const item = candidate as Record<string, unknown> & { id: string };
        if (seenIds.has(item.id)) {
          throw new Error(`Backup memiliki ID duplikat pada modul ${storeName}: ${item.id}.`);
        }
        seenIds.add(item.id);
        if (!recordTenantMatches(item, owner) ||
            (storeName === 'photos' &&
              (item.ownerUserId !== owner.userId || item.ownerCompanyCode !== owner.companyCode))) {
          skipped++;
          continue;
        }
        if (storeName === 'queue') {
          if (item.ownerUserId !== owner.userId || item.ownerCompanyCode !== owner.companyCode) {
            skipped++;
            continue;
          }
          if (item.status === 'SYNCING') {
            item.status = 'PENDING';
            delete item.syncStartedAt;
          }
        }
        valid.push(item);
      }
      if (valid.length) {
        changes.push({ storeName, deleteIds: [], records: valid });
        restored += valid.length;
      }
    }

    // Merge-only restore: existing local records are never deleted by a backup restore.
    // IndexedDB applies the multi-store update atomically.
    await hdosDB.reconcileSnapshotBundle(changes);
    return { restored, skipped, createdAt: String(archive.createdAt || '') };
  },
};
