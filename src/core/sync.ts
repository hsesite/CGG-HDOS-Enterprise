import type { SyncQueueItem } from './types';
import { hdosDB, type StoreName } from './db';
import { hdosEvents } from './events';
import { hseApi, ApiError } from './api';
import { AuthState } from './auth-state';

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000;

type SyncEntityEndpoint =
  | 'inspections'
  | 'hazards'
  | 'picas'
  | 'incidents'
  | 'repository';

function getEntityEndpoint(
  entity: SyncQueueItem['entity']
): SyncEntityEndpoint | null {
  switch (entity) {
    case 'inspection':
      return 'inspections';
    case 'hazard':
      return 'hazards';
    case 'pica':
      return 'picas';
    case 'incident':
      return 'incidents';
    case 'repository':
      return 'repository';
    default:
      return null;
  }
}

function compareQueueItemsByTime(a: SyncQueueItem, b: SyncQueueItem): number {
  const sameRecord = getRecordId(a) && getRecordId(a) === getRecordId(b) && a.entity === b.entity;
  if (sameRecord && Boolean(a.resolutionOfQueueItemId) !== Boolean(b.resolutionOfQueueItemId)) {
    return a.resolutionOfQueueItemId ? -1 : 1;
  }
  const timeOrder = String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
  if (timeOrder) return timeOrder;

  // Two operations can be queued in the same millisecond. Keep their
  // dependency order deterministic instead of letting random queue IDs decide.
  if (sameRecord) {
    const actionOrder: Record<SyncQueueItem['action'], number> = {
      CREATE: 0,
      UPDATE: 1,
      DELETE: 2,
    };
    const actionDifference = actionOrder[a.action] - actionOrder[b.action];
    if (actionDifference) return actionDifference;
  }

  return String(a.id).localeCompare(String(b.id));
}

function getRecordId(
  item: SyncQueueItem
): string | null {
  if (
    item.payload &&
    typeof item.payload === 'object' &&
    !Array.isArray(item.payload)
  ) {
    const id = (
      item.payload as Record<string, unknown>
    ).id;

    if (typeof id === 'string' && id.trim()) {
      return id;
    }
  }

  return null;
}

function getLocalStoreName(entity: SyncQueueItem['entity']): StoreName | null {
  switch (entity) {
    case 'inspection': return 'inspection';
    case 'hazard': return 'hazard';
    case 'pica': return 'pica';
    case 'incident': return 'incident';
    default: return null;
  }
}

function getRetryDelay(
  retryCount: number
): number {
  return BASE_RETRY_DELAY_MS *
    Math.pow(
      2,
      Math.max(0, retryCount - 1)
    );
}

function isRetryableSyncError(error: unknown): boolean {
  // Network failures, rate limits, timeouts and server errors are transient.
  // Validation, permission and missing-record errors need human correction.
  if (!(error instanceof ApiError)) return false;
  const status = error.status;
  return status === 0 || status === 408 || status === 425 ||
    status === 429 || status >= 500;
}

function formatTime(): string {
  return new Date().toLocaleTimeString(
    'id-ID',
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  );
}

export class HDOSSyncEngine {
  private isOnline =
    typeof navigator !== 'undefined'
      ? navigator.onLine
      : false;

  private isSyncing = false;

  private queue: SyncQueueItem[] = [];

  private queueOwnerKey = '';

  // Prevent overlapping IndexedDB initializations from publishing stale snapshots.
  private initGeneration = 0;

  private lastSyncTime = '';

  private getCurrentOwner() {
    const user = AuthState.getUser();
    if (!user?.id) return null;
    return { userId: String(user.id), companyCode: String(user.companyCode || ((user.roles || []).includes('Admin CGG') ? 'CGG' : '')).trim().toUpperCase() };
  }

  getOwnerSnapshot(): { userId: string; companyCode: string } | null {
    const owner = this.getCurrentOwner();
    return owner ? { ...owner } : null;
  }

  private retryTimer:
    | ReturnType<typeof setTimeout>
    | null = null;

  private syncLogs: {
    time: string;
    message: string;
    type: 'info' | 'success' | 'warning';
  }[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;

      window.addEventListener(
        'online',
        () => this.setOnlineState(true)
      );

      window.addEventListener(
        'offline',
        () => this.setOnlineState(false)
      );
    }

    this.syncLogs.unshift({
      time: formatTime(),
      message:
        'HDOS Sync Engine aktif — IndexedDB menjadi antrean lokal.',
      type: 'info',
    });
  }

  async init(): Promise<void> {
    const initGeneration = ++this.initGeneration;
    const owner = this.getCurrentOwner();
    const requestedOwnerKey = owner ? `${owner.userId}::${owner.companyCode}` : '';
    this.queueOwnerKey = requestedOwnerKey;
    const storedQueue = await hdosDB.getAll<SyncQueueItem>('queue');
    if (initGeneration !== this.initGeneration) return;

    // Account identity can change while IndexedDB is being read (for example,
    // after a cross-tab login). Never publish a queue snapshot for that stale
    // identity into the active UI/session.
    const activeOwner = this.getCurrentOwner();
    const activeOwnerKey = activeOwner ? `${activeOwner.userId}::${activeOwner.companyCode}` : '';
    if (activeOwnerKey !== requestedOwnerKey) {
      this.queue = [];
      this.queueOwnerKey = '';
      hdosEvents.emit('sync:queue_updated', []);
      return;
    }

    let quarantinedCount = 0;
    for (const item of storedQueue) {
      if ((!item.ownerUserId || !item.ownerCompanyCode) && item.retryCount < MAX_RETRIES) {
        item.status = 'CONFLICT';
        item.retryCount = MAX_RETRIES;
        item.error = 'Item offline lama tidak memiliki identitas pemilik. Item ditahan; verifikasi dan input ulang diperlukan.';
        await hdosDB.put('queue', item);
        quarantinedCount += 1;
      }
    }
    this.queue = owner ? storedQueue.filter(item => item.ownerUserId === owner.userId && item.ownerCompanyCode === owner.companyCode).sort(compareQueueItemsByTime) : [];

    // Recover interrupted writes only when no other tab currently owns the
    // tenant sync lock. This prevents a newly opened tab from resetting a
    // legitimate in-flight request in another tab.
    let recoveredCount = 0;
    const recoverInterruptedQueue = async (): Promise<void> => {
      for (const item of this.queue) {
        if (item.status !== 'SYNCING' ||
            item.ownerUserId !== owner?.userId ||
            item.ownerCompanyCode !== owner?.companyCode) continue;
        item.status = 'PENDING';
        item.syncStartedAt = undefined;
        item.error = 'Sinkronisasi sebelumnya terputus. Item dipulihkan dan akan dicoba kembali.';
        await hdosDB.put('queue', item);
        recoveredCount += 1;
      }
    };
    if (owner && typeof navigator !== 'undefined' &&
        navigator.locks && typeof navigator.locks.request === 'function') {
      const recoveryLockName = `hdos-sync:${owner.userId}:${owner.companyCode}`;
      await navigator.locks.request(
        recoveryLockName,
        { mode: 'exclusive', ifAvailable: true },
        async lock => {
          if (lock) await recoverInterruptedQueue();
        }
      );
    } else {
      // Without cross-tab locks, recover only leases that have clearly expired.
      // Never reset a fresh SYNCING item just because another tab initialized.
      const staleBefore = Date.now() - 2 * 60 * 1000;
      for (const item of this.queue) {
        if (item.status !== 'SYNCING' ||
            item.ownerUserId !== owner?.userId ||
            item.ownerCompanyCode !== owner?.companyCode) continue;
        const startedAt = Date.parse(String(item.syncStartedAt || ''));
        if (!Number.isFinite(startedAt) || startedAt > staleBefore) continue;
        item.status = 'PENDING';
        item.syncStartedAt = undefined;
        item.error = 'Lease sinkronisasi kedaluwarsa. Item dipulihkan dan akan dicoba kembali.';
        await hdosDB.put('queue', item);
        recoveredCount += 1;
      }
    }
    if (recoveredCount > 0) {
      this.syncLogs.unshift({
        time: formatTime(),
        message: `${recoveredCount} item sinkronisasi yang terputus dipulihkan ke antrean.`,
        type: 'warning',
      });
    }
    if (quarantinedCount > 0) {
      this.syncLogs.unshift({ time: formatTime(), message: `${quarantinedCount} item lama ditahan karena tidak memiliki identitas akun pemilik.`, type: 'warning' });
    }
    const hiddenCount = storedQueue.length - this.queue.length;
    if (hiddenCount > quarantinedCount) {
      this.syncLogs.unshift({ time: formatTime(), message: `${hiddenCount - quarantinedCount} item antrean milik akun lain disimpan terpisah dan tidak diproses.`, type: 'info' });
    }
    if (this.queue.length > 0) {
      this.syncLogs.unshift({
        time: formatTime(),
        message:
          `${this.queue.length} item ditemukan di offline queue.`,
        type: 'warning',
      });
    }

    // Recovery writes above are asynchronous too. Re-check the active
    // identity immediately before publishing this snapshot so a cross-tab
    // account switch cannot expose the previous tenant's queue in the new UI.
    if (initGeneration !== this.initGeneration) return;
    const finalOwner = this.getCurrentOwner();
    const finalOwnerKey = finalOwner ? `${finalOwner.userId}::${finalOwner.companyCode}` : '';
    if (finalOwnerKey !== requestedOwnerKey || this.queueOwnerKey !== requestedOwnerKey) {
      this.queue = [];
      this.queueOwnerKey = '';
      hdosEvents.emit('sync:queue_updated', []);
      return;
    }

    hdosEvents.emit(
      'sync:queue_updated',
      [...this.queue]
    );

    if (
      this.isOnline &&
      this.queue.length > 0 &&
      hseApi.isAuthenticated
    ) {
      setTimeout(() => {
        void this.triggerSync();
      }, 300);
    }
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  getQueue(): SyncQueueItem[] {
    return [...this.queue];
  }

  getLastSyncTime(): string {
    return this.lastSyncTime || 'Belum pernah';
  }

  getSyncLogs() {
    return [...this.syncLogs];
  }

  toggleOnlineSimulation(): boolean {
    this.setOnlineState(!this.isOnline);
    return this.isOnline;
  }

  private setOnlineState(
    online: boolean
  ): void {
    this.isOnline = online;

    if (!online && this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    hdosEvents.emit(
      'sync:offline_status_changed',
      { online }
    );

    this.syncLogs.unshift({
      time: formatTime(),
      message: online
        ? 'Koneksi online aktif — queue siap diproses.'
        : 'Mode offline aktif — data tetap disimpan di IndexedDB.',
      type: online
        ? 'success'
        : 'warning',
    });

    if (
      online &&
      this.queue.length > 0 &&
      hseApi.isAuthenticated
    ) {
      setTimeout(() => {
        void this.triggerSync();
      }, 300);
    }
  }

  async enqueueBatch(
    records: Array<{ storeName: StoreName; item: { id: string } }>,
    items: Array<Omit<SyncQueueItem, 'id' | 'timestamp' | 'status' | 'retryCount'>>
  ): Promise<SyncQueueItem[]> {
    const currentOwner = this.getCurrentOwner();
    if (!currentOwner) throw new Error('Login ulang diperlukan sebelum menyimpan data ke antrean offline.');
    const ownerKey = `${currentOwner.userId}::${currentOwner.companyCode}`;
    if (this.queueOwnerKey !== ownerKey) await this.init();
    const owner = this.getCurrentOwner();
    if (!owner || owner.userId !== currentOwner.userId || owner.companyCode !== currentOwner.companyCode) {
      throw new Error('Akun berubah saat penyimpanan berlangsung. Silakan ulangi setelah login.');
    }

    const queueItems: SyncQueueItem[] = items.map(item => ({
      id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `queue_${crypto.randomUUID()}`
        : `queue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      retryCount: 0,
      ...item,
      ownerUserId: owner.userId,
      ownerCompanyCode: owner.companyCode,
    }));

    // Operational records and their queue entries commit together in IndexedDB.
    await hdosDB.putBundle([
      ...records,
      ...queueItems.map(item => ({ storeName: 'queue' as const, item })),
    ]);

    const activeOwner = this.getCurrentOwner();
    if (activeOwner && activeOwner.userId === owner.userId &&
        activeOwner.companyCode === owner.companyCode && this.queueOwnerKey === ownerKey) {
      this.queue.push(...queueItems);
      this.queue.sort(compareQueueItemsByTime);
      hdosEvents.emit('sync:queue_updated', [...this.queue]);
      this.syncLogs.unshift({
        time: formatTime(),
        message: `${queueItems.length} item operasional dan antrean tersimpan bersama.`,
        type: 'warning',
      });
      if (this.isOnline && hseApi.isAuthenticated) {
        setTimeout(() => { void this.triggerSync(); }, 100);
      }
    } else {
      this.syncLogs.unshift({
        time: formatTime(),
        message: 'Bundle offline disimpan untuk akun pemilik sebelumnya dan tidak diproses oleh sesi akun saat ini.',
        type: 'warning',
      });
    }
    return queueItems;
  }

  async enqueue(
    item: Omit<
      SyncQueueItem,
      'id' | 'timestamp' | 'status' | 'retryCount'
    >,
    ownerOverride?: { userId: string; companyCode: string } | null
  ): Promise<SyncQueueItem> {
    const currentOwner = this.getCurrentOwner();
    const owner = ownerOverride === undefined ? currentOwner : ownerOverride;
    if (!owner) throw new Error('Login ulang diperlukan sebelum menyimpan data ke antrean offline.');
    if (currentOwner && this.queueOwnerKey !== `${currentOwner.userId}::${currentOwner.companyCode}`) await this.init();
    const belongsToCurrentOwner = Boolean(currentOwner && currentOwner.userId === owner.userId && currentOwner.companyCode === owner.companyCode);
    const queueItem: SyncQueueItem = {
      id:
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
          ? `queue_${crypto.randomUUID()}`
          : `queue_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      retryCount: 0,
      ...item,
      ownerUserId: owner.userId,
      ownerCompanyCode: owner.companyCode,
    };

    await hdosDB.put(
      'queue',
      queueItem
    );

    const activeOwnerAfterWrite = this.getCurrentOwner();
    const ownerStillCurrent = belongsToCurrentOwner &&
      Boolean(activeOwnerAfterWrite &&
        activeOwnerAfterWrite.userId === owner.userId &&
        activeOwnerAfterWrite.companyCode === owner.companyCode &&
        this.queueOwnerKey === `${owner.userId}::${owner.companyCode}`);

    if (ownerStillCurrent) {
      this.queue.push(queueItem);
      this.queue.sort(compareQueueItemsByTime);
      hdosEvents.emit(
        'sync:queue_updated',
        [...this.queue]
      );
      this.syncLogs.unshift({
        time: formatTime(),
        message:
          `Queue ditambahkan: [${queueItem.action}] ${queueItem.entity}`,
        type: 'warning',
      });
      if (this.isOnline && hseApi.isAuthenticated) {
        setTimeout(() => {
          void this.triggerSync();
        }, 100);
      }
    } else {
      this.syncLogs.unshift({
        time: formatTime(),
        message: 'Data offline disimpan terpisah untuk akun sebelumnya; data tidak akan dikirim menggunakan sesi akun saat ini.',
        type: 'warning',
      });
    }

    return queueItem;
  }

  private scheduleRetry(): void {
    if (
      this.retryTimer ||
      !this.isOnline ||
      !hseApi.isAuthenticated ||
      this.queue.length === 0
    ) {
      return;
    }

    const pending = this.queue.filter(
      (item) =>
        item.status === 'PENDING' &&
        item.retryCount < MAX_RETRIES
    );

    if (pending.length === 0) {
      return;
    }

    const retryCount = Math.max(
      ...pending.map(
        (item) => item.retryCount
      )
    );

    const delay =
      getRetryDelay(
        retryCount || 1
      );

    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null;
        void this.triggerSync();
      },
      delay
    );

    this.syncLogs.unshift({
      time: formatTime(),
      message:
        `Retry sinkronisasi dijadwalkan ${delay} ms lagi.`,
      type: 'warning',
    });
  }
  async resolveConflict(queueItemId: string, revisedPayload: Record<string, unknown>): Promise<SyncQueueItem> {
    const owner = this.getCurrentOwner();
    const resolutionToken = hseApi.authToken;
    if (!owner || !resolutionToken) throw new Error('Login ulang diperlukan untuk menyelesaikan konflik.');
    if (this.isSyncing) throw new Error('Tunggu sinkronisasi aktif selesai sebelum menyelesaikan konflik.');
    const ownerKey = `${owner.userId}::${owner.companyCode}`;
    if (this.queueOwnerKey !== ownerKey) throw new Error('Cakupan antrean berubah. Muat ulang antrean sebelum menyelesaikan konflik.');

    const original = this.queue.find(item => item.id === queueItemId);
    if (!original || original.status !== 'CONFLICT' ||
        original.action !== 'UPDATE' ||
        original.ownerUserId !== owner.userId ||
        original.ownerCompanyCode !== owner.companyCode ||
        !original.conflictServerRecord) {
      throw new Error('Item konflik tidak ditemukan atau tidak lagi memenuhi syarat penyelesaian.');
    }
    const endpoint = getEntityEndpoint(original.entity);
    const recordId = getRecordId(original);
    const serverRecord = original.conflictServerRecord;
    const serverRecordId = String(serverRecord.id || '');
    const serverUpdatedAt = String(serverRecord.updatedAt || '');
    if (!endpoint || endpoint === 'repository' || !recordId ||
        serverRecordId !== recordId || !serverUpdatedAt) {
      throw new Error('Snapshot server tidak lengkap atau tidak cocok. Ambil data pusat dan periksa kembali konflik.');
    }
    if (!revisedPayload || typeof revisedPayload !== 'object' || Array.isArray(revisedPayload)) {
      throw new Error('Data revisi harus berupa objek JSON yang valid.');
    }
    if (String(revisedPayload.id || '') !== recordId) {
      throw new Error('ID record pada data revisi tidak boleh diubah.');
    }

    // The server snapshot is the concurrency base. Client edits cannot alter
    // record identity, version token, or tenant ownership metadata.
    const protectedPayload: Record<string, unknown> = {
      ...revisedPayload,
      id: recordId,
      updatedAt: serverUpdatedAt,
    };
    for (const key of ['companyCode', 'contractorCode', 'parentCompanyCode', 'subcontractorCode', 'subkonCode', 'ownerCompanyCode']) {
      if (Object.prototype.hasOwnProperty.call(serverRecord, key)) {
        protectedPayload[key] = serverRecord[key];
      }
    }

    const activeOwner = this.getCurrentOwner();
    if (!activeOwner || activeOwner.userId !== owner.userId ||
        activeOwner.companyCode !== owner.companyCode ||
        hseApi.authToken !== resolutionToken || this.queueOwnerKey !== ownerKey) {
      throw new Error('Sesi atau tenant berubah. Penyelesaian konflik dibatalkan.');
    }

    const now = new Date().toISOString();
    const nextId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `queue_${crypto.randomUUID()}`
      : `queue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const resolvedOriginal: SyncQueueItem = {
      ...original,
      status: 'RESOLVED',
      resolvedAt: now,
      resolvedBy: owner.userId,
      resolvedQueueItemId: nextId,
      resolutionBaseUpdatedAt: serverUpdatedAt,
      error: `Konflik diselesaikan secara manual; revisi baru ${nextId} dibuat berdasarkan versi server ${serverUpdatedAt}.`,
    };
    const revisedItem: SyncQueueItem = {
      ...original,
      id: nextId,
      timestamp: now,
      payload: protectedPayload,
      status: 'PENDING',
      retryCount: 0,
      syncStartedAt: undefined,
      conflictServerRecord: undefined,
      conflictDetectedAt: undefined,
      resolvedAt: undefined,
      resolvedBy: undefined,
      resolvedQueueItemId: undefined,
      resolutionBaseUpdatedAt: undefined,
      resolutionOfQueueItemId: original.id,
      error: undefined,
      note: [original.note, `Revisi manual dari konflik ${original.id}; basis versi server ${serverUpdatedAt}.`].filter(Boolean).join(' '),
    };

    // Queue items that were only blocked behind this conflict are safe to
    // resume after the new revision succeeds. Keep their payloads unchanged;
    // the normal atomic version propagation will advance their base timestamp.
    const persistedQueue = await hdosDB.getAll<SyncQueueItem>('queue');
    const dependentItems = persistedQueue.filter(queued =>
      queued.id !== original.id &&
      queued.ownerUserId === owner.userId &&
      queued.ownerCompanyCode === owner.companyCode &&
      queued.entity === original.entity &&
      (queued.action === 'UPDATE' || queued.action === 'DELETE') &&
      getRecordId(queued) === recordId &&
      queued.status === 'CONFLICT' &&
      String(queued.error || '').startsWith('Perubahan ditahan karena sinkronisasi perubahan sebelumnya')
    ).map(queued => ({
      ...queued,
      status: 'PENDING' as const,
      retryCount: 0,
      error: undefined,
      note: [queued.note, `Antrean dilanjutkan setelah penyelesaian konflik ${original.id}; menunggu versi server terbaru.`].filter(Boolean).join(' '),
    }));

    // Keep the original conflict as an audit record, create a separate
    // pending update, and resume dependent local edits atomically.
    await hdosDB.putBundle([
      { storeName: 'queue', item: resolvedOriginal },
      { storeName: 'queue', item: revisedItem },
      ...dependentItems.map(item => ({ storeName: 'queue' as const, item })),
    ]);

    const ownerAfterWrite = this.getCurrentOwner();
    if (ownerAfterWrite && ownerAfterWrite.userId === owner.userId &&
        ownerAfterWrite.companyCode === owner.companyCode &&
        hseApi.authToken === resolutionToken && this.queueOwnerKey === ownerKey) {
      const dependentById = new Map(dependentItems.map(item => [item.id, item]));
      this.queue = this.queue.map(item =>
        item.id === original.id ? resolvedOriginal : (dependentById.get(item.id) || item)
      );
      this.queue.push(revisedItem);
      this.queue.sort(compareQueueItemsByTime);
      hdosEvents.emit('sync:queue_updated', [...this.queue]);
      this.syncLogs.unshift({
        time: formatTime(),
        message: `Konflik ${original.entity} diselesaikan manual; revisi baru dibuat berdasarkan versi server terbaru.`,
        type: 'info',
      });
    }
    return revisedItem;
  }

  async retryFailedItems(): Promise<number> {
    const owner = this.getCurrentOwner();
    if (!owner) return 0;
    const ownerKey = `${owner.userId}::${owner.companyCode}`;
    if (this.queueOwnerKey !== ownerKey) return 0;

    let resetCount = 0;

    for (const item of [...this.queue]) {
      const activeOwner = this.getCurrentOwner();
      if (!activeOwner || activeOwner.userId !== owner.userId ||
          activeOwner.companyCode !== owner.companyCode ||
          this.queueOwnerKey !== ownerKey) {
        // An account switch during a manual retry must never rewrite another
        // tenant's queue state.
        break;
      }

      if (item.ownerUserId !== owner.userId ||
          item.ownerCompanyCode !== owner.companyCode ||
          item.retryCount < MAX_RETRIES) continue;

      // An unsupported entity is a configuration gap, not a transient
      // failure. Keep it quarantined until its cloud endpoint is implemented.
      if (!getEntityEndpoint(item.entity)) continue;

      item.retryCount = 0;
      item.status = 'PENDING';
      item.error = undefined;

      await hdosDB.put('queue', item);
      const ownerAfterWrite = this.getCurrentOwner();
      if (!ownerAfterWrite ||
          ownerAfterWrite.userId !== owner.userId ||
          ownerAfterWrite.companyCode !== owner.companyCode ||
          this.queueOwnerKey !== ownerKey) {
        // The old owner's item is safely persisted under its own IndexedDB
        // key, but must not be published into the newly active tenant snapshot.
        break;
      }
      this.queue = this.queue.map(current => current.id === item.id ? item : current);
      resetCount += 1;
    }

    if (resetCount > 0) {
      this.syncLogs.unshift({
        time: formatTime(),
        message: `${resetCount} item gagal yang didukung endpoint diaktifkan kembali untuk retry manual.`,
        type: 'info',
      });
      hdosEvents.emit('sync:queue_updated', [...this.queue]);
      if (this.isOnline && hseApi.isAuthenticated) {
        setTimeout(() => { void this.triggerSync(); }, 100);
      }
    }

    return resetCount;
  }

  async triggerSync(): Promise<boolean> {
    const owner = this.getCurrentOwner();
    if (!owner) return false;

    // Serialize queue replay across tabs/windows for the same tenant. The
    // backend still enforces idempotency; this browser lock prevents two
    // tabs from needlessly sending the same IndexedDB queue item together.
    const lockManager = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (lockManager && typeof lockManager.request === 'function') {
      const lockName = `hdos-sync:${owner.userId}:${owner.companyCode}`;
      return lockManager.request(lockName, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) return false;
        return this.triggerSyncUnlocked();
      });
    }

    // Browsers without Web Locks retain the per-instance guard and the
    // server-side idempotency/concurrency controls.
    return this.triggerSyncUnlocked();
  }

  private async triggerSyncUnlocked(): Promise<boolean> {
    const owner = this.getCurrentOwner();
    if (!owner) return false;
    const syncToken = hseApi.authToken;
    if (!syncToken) return false;
    const requestedOwnerKey = `${owner.userId}::${owner.companyCode}`;
    if (this.isSyncing) return false;
    if (this.queueOwnerKey !== requestedOwnerKey) await this.init();

    // init() performs asynchronous IndexedDB reads. Re-check both the login
    // identity and queue scope after it resolves before touching in-memory data.
    const activeOwner = this.getCurrentOwner();
    if (!activeOwner ||
        activeOwner.userId !== owner.userId ||
        activeOwner.companyCode !== owner.companyCode ||
        hseApi.authToken !== syncToken ||
        this.queueOwnerKey !== requestedOwnerKey) {
      return false;
    }
    this.queue = this.queue.filter(item =>
      item.ownerUserId === owner.userId &&
      item.ownerCompanyCode === owner.companyCode
    ).sort(compareQueueItemsByTime);
    if (this.isSyncing) {
      return false;
    }

    if (!this.isOnline) {
      this.syncLogs.unshift({
        time: formatTime(),
        message:
          'Sinkronisasi ditunda karena sistem sedang offline.',
        type: 'warning',
      });

      return false;
    }

    if (!hseApi.isAuthenticated) {
      this.syncLogs.unshift({
        time: formatTime(),
        message:
          'Sinkronisasi ditunda — pengguna belum login ke cloud HDOS.',
        type: 'warning',
      });

      return false;
    }

    if (this.queue.length === 0) {
      return true;
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.isSyncing = true;

    hdosEvents.emit(
      'sync:started',
      {
        queueCount: this.queue.length,
      }
    );

    let successCount = 0;

    try {
      // Revalidate identity immediately before sending queued writes. This also
      // protects the reconnect path when company membership changed while offline.
      const previousProfile = AuthState.getUser();
      const verifiedProfile = await hseApi.me(syncToken);
      if (hseApi.authToken !== syncToken) return false;
      const profileChanged = !previousProfile ||
        previousProfile.id !== verifiedProfile.id ||
        String(previousProfile.companyCode || '').trim().toUpperCase() !== String(verifiedProfile.companyCode || '').trim().toUpperCase() ||
        String(previousProfile.parentCompanyCode || '').trim().toUpperCase() !== String(verifiedProfile.parentCompanyCode || '').trim().toUpperCase() ||
        previousProfile.roleVerified !== verifiedProfile.roleVerified ||
        JSON.stringify(previousProfile.roles || []) !== JSON.stringify(verifiedProfile.roles || []);
      AuthState.saveUser(verifiedProfile);
      const verifiedOwner = this.getCurrentOwner();

      if (profileChanged) {
        hdosEvents.emit('auth:profile_refreshed', {});
      }

      if (!verifiedOwner ||
          verifiedOwner.userId !== owner.userId ||
          verifiedOwner.companyCode !== owner.companyCode) {
        // Keep old-tenant queue items stored under their original owner key.
        // Reinitialize for the server-confirmed identity; never replay them as
        // writes belonging to the newly assigned company.
        await this.init();
        return false;
      }

      // IndexedDB getAll() is keyed by ID, not insertion time. Explicitly
      // replay in timestamp order and prevent later writes to a record from
      // overtaking an earlier write that is still pending or has failed.
      const blockedRecordIds = new Set<string>();
      for (const item of [...this.queue].sort(compareQueueItemsByTime)) {
        if (item.status === 'RESOLVED') continue;
        const itemRecordId = getRecordId(item);
        if (itemRecordId && blockedRecordIds.has(itemRecordId)) {
          item.status = 'CONFLICT';
          item.retryCount = MAX_RETRIES;
          item.error = 'Perubahan ditahan karena sinkronisasi perubahan sebelumnya untuk record ini belum berhasil. Periksa dan retry setelah item sebelumnya selesai.';
          await hdosDB.put('queue', item);
          continue;
        }
        const activeOwner = this.getCurrentOwner();
        if (hseApi.authToken !== syncToken || !activeOwner || activeOwner.userId !== item.ownerUserId || activeOwner.userId !== owner.userId || activeOwner.companyCode !== item.ownerCompanyCode || activeOwner.companyCode !== owner.companyCode) break;
        if (!this.isOnline) {
          break;
        }

        if (item.retryCount >= MAX_RETRIES) {
          if (itemRecordId) blockedRecordIds.add(itemRecordId);
          continue;
        }

        const endpoint =
          getEntityEndpoint(
            item.entity
          );

        if (!endpoint) {
          // Unsupported entities must not be retried automatically forever.
          // Keep the item visible for diagnosis; enabling it requires an API route.
          item.status = 'CONFLICT';
          item.retryCount = MAX_RETRIES;
          item.error =
            `Entity ${item.entity} belum memiliki endpoint cloud. Item ditahan sampai endpoint tersedia.`;

          await hdosDB.put(
            'queue',
            item
          );
          if (itemRecordId) blockedRecordIds.add(itemRecordId);

          this.syncLogs.unshift({
            time: formatTime(),
            message:
              `Sync ditahan: entity ${item.entity} belum didukung API cloud.`,
            type: 'warning',
          });

          continue;
        }


        item.status = 'SYNCING';
        item.syncStartedAt = new Date().toISOString();
        item.error = undefined;

        await hdosDB.put(
          'queue',
          item
        );

        hdosEvents.emit(
          'sync:progress',
          { item: { ...item } }
        );

        try {
          if (
            item.action === 'CREATE'
          ) {
            if (endpoint === 'repository') throw new Error('Upload Repository harus melalui alur unggah berkas khusus.');
            const serverRecord = await hseApi.create<Record<string, unknown>>(endpoint, item.payload, syncToken);
            const localStoreName = getLocalStoreName(item.entity);
            const serverUpdatedAt = String(serverRecord?.updatedAt || '');
            if (localStoreName && serverUpdatedAt) {
              const recordId = getRecordId(item);
              const localRecords = await hdosDB.getAll<Record<string, unknown> & { id: string }>(localStoreName);
              const localRecord = localRecords.find(record => record.id === recordId);
              const persistedQueue = await hdosDB.getAll<SyncQueueItem>('queue');
              const versionedQueueItems = persistedQueue.filter(queued =>
                queued.id !== item.id && queued.ownerUserId === owner.userId &&
                queued.ownerCompanyCode === owner.companyCode && queued.entity === item.entity &&
                queued.action === 'UPDATE' && queued.status === 'PENDING' &&
                getRecordId(queued) === recordId &&
                Boolean(queued.payload) && typeof queued.payload === 'object' && !Array.isArray(queued.payload)
              ).map(queued => ({
                ...queued,
                payload: { ...(queued.payload as Record<string, unknown>), updatedAt: serverUpdatedAt }
              }));

              // Commit the server version to the local record and every queued
              // follow-up UPDATE in one IndexedDB transaction. A browser crash
              // can no longer leave only part of this version propagation saved.
              const versionBundle: Array<{ storeName: StoreName; item: Record<string, unknown> & { id: string } }> = [];
              if (localRecord) versionBundle.push({
                storeName: localStoreName,
                item: { ...localRecord, updatedAt: serverUpdatedAt }
              });
              versionBundle.push(...versionedQueueItems.map(queued => ({ storeName: 'queue' as const, item: queued })));
              await hdosDB.putBundle(versionBundle);

              const queueOwnerAfterWrite = this.getCurrentOwner();
              if (queueOwnerAfterWrite && queueOwnerAfterWrite.userId === owner.userId &&
                  queueOwnerAfterWrite.companyCode === owner.companyCode && this.queueOwnerKey === requestedOwnerKey) {
                const updatedById = new Map(versionedQueueItems.map(queued => [queued.id, queued]));
                this.queue = this.queue.map(current => updatedById.get(current.id) || current);
              }
            }
          } else if (
            item.action === 'UPDATE'
          ) {
            if (endpoint === 'repository') throw new Error('Perubahan metadata Repository harus melalui alur kontrol dokumen khusus.');
            const recordId = getRecordId(item);
            if (!recordId) {
              throw new Error(`ID record tidak ditemukan untuk queue item ${item.id}.`);
            }
            const serverRecord = await hseApi.update<Record<string, unknown>>(endpoint, recordId, item.payload, syncToken);
            const localStoreName = getLocalStoreName(item.entity);
            const serverUpdatedAt = String(serverRecord?.updatedAt || '');
            if (localStoreName && serverUpdatedAt) {
              // The server owns the version timestamp. Carry it forward to the
              // local record and later queued updates for this same record so
              // offline edit sequences do not conflict with their own writes.
              const localRecords = await hdosDB.getAll<Record<string, unknown> & { id: string }>(localStoreName);
              const localRecord = localRecords.find(record => record.id === recordId);
              const persistedQueue = await hdosDB.getAll<SyncQueueItem>('queue');
              const versionedQueueItems = persistedQueue.filter(queued =>
                queued.id !== item.id && queued.ownerUserId === owner.userId &&
                queued.ownerCompanyCode === owner.companyCode && queued.entity === item.entity &&
                queued.action === 'UPDATE' && queued.status === 'PENDING' &&
                getRecordId(queued) === recordId &&
                Boolean(queued.payload) && typeof queued.payload === 'object' && !Array.isArray(queued.payload)
              ).map(queued => ({
                ...queued,
                payload: { ...(queued.payload as Record<string, unknown>), updatedAt: serverUpdatedAt }
              }));

              // Keep the local record version and all later UPDATE payloads
              // consistent in one IndexedDB transaction.
              const versionBundle: Array<{ storeName: StoreName; item: Record<string, unknown> & { id: string } }> = [];
              if (localRecord) versionBundle.push({
                storeName: localStoreName,
                item: { ...localRecord, updatedAt: serverUpdatedAt }
              });
              versionBundle.push(...versionedQueueItems.map(queued => ({ storeName: 'queue' as const, item: queued })));
              await hdosDB.putBundle(versionBundle);

              const queueOwnerAfterWrite = this.getCurrentOwner();
              if (queueOwnerAfterWrite && queueOwnerAfterWrite.userId === owner.userId &&
                  queueOwnerAfterWrite.companyCode === owner.companyCode && this.queueOwnerKey === requestedOwnerKey) {
                const updatedById = new Map(versionedQueueItems.map(queued => [queued.id, queued]));
                this.queue = this.queue.map(current => updatedById.get(current.id) || current);
              }
            }
          } else if (item.action === 'DELETE') {
            const recordId = getRecordId(item);
            if (!recordId) {
              throw new Error(`ID record tidak ditemukan untuk penghapusan queue item ${item.id}.`);
            }
            if (endpoint === 'repository') {
              await hseApi.deleteRepositoryDocument(recordId, syncToken);
            } else {
              await hseApi.deleteOperationalRecord(endpoint, recordId, syncToken);
            }
          }

          await hdosDB.delete(
            'queue',
            item.id
          );

          this.queue =
            this.queue.filter(
              (queued) =>
                queued.id !== item.id
            );

          successCount += 1;

          hdosEvents.emit(
            'sync:progress',
            {
              item: {
                ...item,
                status: 'SYNCED',
              },
            }
          );
        } catch (error) {
          item.retryCount += 1;
          const status = error instanceof ApiError ? error.status : 0;
          const retryable = isRetryableSyncError(error);
          item.status = retryable && item.retryCount < MAX_RETRIES
            ? 'PENDING'
            : 'CONFLICT';
          item.syncStartedAt = undefined;
          item.error = error instanceof Error ? error.message : String(error);

          // Preserve both sides of an optimistic-concurrency conflict. The
          // queued payload remains the local version; the server snapshot is
          // stored separately for explicit human comparison and resolution.
          if (status === 409 && item.action === 'UPDATE' && itemRecordId &&
              endpoint !== 'repository') {
            try {
              const remoteRecord = await hseApi.getOperationalRecord(
                endpoint as 'inspections' | 'hazards' | 'picas' | 'incidents',
                itemRecordId,
                syncToken
              );
              const ownerAfterConflictRead = this.getCurrentOwner();
              if (remoteRecord && String(remoteRecord.id || '') === itemRecordId && ownerAfterConflictRead &&
                  ownerAfterConflictRead.userId === owner.userId &&
                  ownerAfterConflictRead.companyCode === owner.companyCode &&
                  hseApi.authToken === syncToken) {
                item.conflictServerRecord = remoteRecord;
                item.conflictDetectedAt = new Date().toISOString();
                item.error = `${item.error} Versi server terbaru disimpan untuk dibandingkan; perubahan lokal tidak ditimpa.`;
              }
            } catch (conflictReadError) {
              // Keep the original 409 and local payload even if the comparison
              // snapshot cannot be fetched (for example, a temporary read failure).
              this.syncLogs.unshift({
                time: formatTime(),
                message: `Konflik ${item.entity} terdeteksi, tetapi versi server belum dapat diambil untuk dibandingkan.`,
                type: 'warning',
              });
            }
          }

          await hdosDB.put(
            'queue',
            item
          );

          if (itemRecordId) blockedRecordIds.add(itemRecordId);

          if (status === 401) {
            this.syncLogs.unshift({
              time: formatTime(),
              message:
                `Sync ${item.entity} tertahan karena sesi cloud tidak valid. Login ulang diperlukan.`,
              type: 'warning',
            });

            // A stale queue request must never log out or clear a newer account.
            if (hseApi.authToken === syncToken) {
              try { await hseApi.logout(syncToken); } catch { /* token is cleared locally if still current */ }
              if (hseApi.authToken === null) {
                AuthState.clear();
                this.queue = [];
                this.queueOwnerKey = '';
                hdosEvents.emit('auth:session_invalid', {});
              }
            }
            break;
          }

          this.syncLogs.unshift({
            time: formatTime(),
            message:
              retryable && item.retryCount < MAX_RETRIES
                ? `Gangguan sementara saat sync ${item.entity} — retry ${item.retryCount}/${MAX_RETRIES} akan dijadwalkan.`
                : `Sync ${item.entity} menjadi konflik (${status || 'network'}). Perlu pemeriksaan atau retry manual.`,
            type: 'warning',
          });
        }
      }

      this.lastSyncTime =
        successCount > 0
          ? formatTime()
          : this.lastSyncTime;

      if (successCount > 0) {
        this.syncLogs.unshift({
          time: formatTime(),
          message:
            `${successCount} record berhasil disinkronkan ke Google Spreadsheet.`,
          type: 'success',
        });

        hdosEvents.emit(
          'sync:completed',
          {
            time: this.lastSyncTime,
            successCount,
          }
        );
      }

      hdosEvents.emit(
        'sync:queue_updated',
        [...this.queue]
      );

      if (
        this.queue.length > 0 &&
        this.isOnline
      ) {
        this.scheduleRetry();
      }

      return this.queue.length === 0;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Revoke only the token this sync run captured. Never affect a newer login.
        if (hseApi.authToken === syncToken) {
          try { await hseApi.logout(syncToken); } catch { /* token is cleared locally if still current */ }
          if (hseApi.authToken === null) {
            AuthState.clear();
            this.queue = [];
            this.queueOwnerKey = '';
            hdosEvents.emit('auth:session_invalid', {});
          }
        }
        return false;
      }

      console.error(
        '[HDOS Sync] Sync engine error:',
        error
      );

      // If an unexpected engine/storage error interrupts the replay loop,
      // release this owner's in-flight markers. Otherwise they would remain
      // SYNCING indefinitely and scheduleRetry() would never select them.
      const activeOwnerAfterError = this.getCurrentOwner();
      if (activeOwnerAfterError &&
          activeOwnerAfterError.userId === owner.userId &&
          activeOwnerAfterError.companyCode === owner.companyCode &&
          hseApi.authToken === syncToken &&
          this.queueOwnerKey === requestedOwnerKey) {
        for (const queued of this.queue) {
          if (queued.status !== 'SYNCING' ||
              queued.ownerUserId !== owner.userId ||
              queued.ownerCompanyCode !== owner.companyCode) continue;
          const recovered = {
            ...queued,
            status: 'PENDING' as const,
            error: 'Sinkronisasi terhenti karena gangguan internal. Item dikembalikan ke antrean untuk dicoba kembali.'
          };
          try {
            await hdosDB.put('queue', recovered);
            this.queue = this.queue.map(current => current.id === recovered.id ? recovered : current);
          } catch (recoveryError) {
            console.error('[HDOS Sync] Gagal memulihkan status antrean setelah gangguan engine.', recoveryError);
          }
        }
      }

      this.syncLogs.unshift({
        time: formatTime(),
        message:
          'Sinkronisasi berhenti karena terjadi kesalahan engine.',
        type: 'warning',
      });

      this.scheduleRetry();

      return false;
    } finally {
      this.isSyncing = false;

      hdosEvents.emit(
        'sync:queue_updated',
        [...this.queue]
      );
    }
  }

  exportToGoogleSheetsCSV(
    records: any[],
    entityName: string
  ): void {
    if (
      !records ||
      records.length === 0
    ) {
      return;
    }

    const escapeCsvCell = (value: unknown): string => {
      let text = String(value ?? '');
      // Prefix formula-like text so Excel/Sheets cannot execute imported cell content.
      if (typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };

    const headers =
      Object.keys(records[0]).map(escapeCsvCell).join(',');

    const rows =
      records.map((record) =>
        Object.values(record)
          .map(escapeCsvCell)
          .join(',')
      );

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        headers,
        ...rows,
      ].join('\n');

    const encodedUri =
      encodeURI(csvContent);

    const link =
      document.createElement('a');

    link.setAttribute(
      'href',
      encodedUri
    );

    link.setAttribute(
      'download',
      `CGG_HDOS_${entityName.toUpperCase()}_${Date.now()}.csv`
    );

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const hdosSync =
  new HDOSSyncEngine();
