import type { SyncQueueItem } from './types';
import { hdosDB } from './db';
import { hdosEvents } from './events';
import { hseApi, ApiError } from './api';
import { AuthState } from './auth-state';

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000;

type SyncEntityEndpoint =
  | 'inspections'
  | 'hazards'
  | 'picas'
  | 'incidents';

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
    default:
      return null;
  }
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

function getRetryDelay(
  retryCount: number
): number {
  return BASE_RETRY_DELAY_MS *
    Math.pow(
      2,
      Math.max(0, retryCount - 1)
    );
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
    const owner = this.getCurrentOwner();
    this.queueOwnerKey = owner ? `${owner.userId}::${owner.companyCode}` : '';
    const storedQueue = await hdosDB.getAll<SyncQueueItem>('queue');
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
    this.queue = owner ? storedQueue.filter(item => item.ownerUserId === owner.userId && item.ownerCompanyCode === owner.companyCode) : [];
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
  async retryFailedItems(): Promise<number> {
    let resetCount = 0;

    for (const item of this.queue) {
      if (item.retryCount >= MAX_RETRIES) {
        item.retryCount = 0;
        item.status = 'PENDING';
        item.error = undefined;

        await hdosDB.put('queue', item);
        resetCount += 1;
      }
    }

    if (resetCount > 0) {
      this.syncLogs.unshift({
        time: formatTime(),
        message: `${resetCount} item gagal diaktifkan kembali untuk retry manual.`,
        type: 'info',
      });

      hdosEvents.emit('sync:queue_updated', [...this.queue]);
    }

    return resetCount;
  }

  async triggerSync(): Promise<boolean> {
    const owner = this.getCurrentOwner();
    if (!owner) return false;
    const syncToken = hseApi.authToken;
    if (!syncToken) return false;
    if (this.queueOwnerKey !== `${owner.userId}::${owner.companyCode}`) await this.init();
    this.queue = this.queue.filter(item => item.ownerUserId === owner.userId && item.ownerCompanyCode === owner.companyCode);
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

      for (
        const item of [...this.queue]
      ) {
        const activeOwner = this.getCurrentOwner();
        if (hseApi.authToken !== syncToken || !activeOwner || activeOwner.userId !== item.ownerUserId || activeOwner.userId !== owner.userId || activeOwner.companyCode !== item.ownerCompanyCode || activeOwner.companyCode !== owner.companyCode) break;
        if (!this.isOnline) {
          break;
        }

        if (
          item.retryCount >= MAX_RETRIES
        ) {
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

          this.syncLogs.unshift({
            time: formatTime(),
            message:
              `Sync ditahan: entity ${item.entity} belum didukung API cloud.`,
            type: 'warning',
          });

          continue;
        }


        item.status = 'SYNCING';

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
            await hseApi.create(
              endpoint,
              item.payload,
              syncToken
            );
          } else if (
            item.action === 'UPDATE'
          ) {
            const recordId = getRecordId(item);
            if (!recordId) {
              throw new Error(`ID record tidak ditemukan untuk queue item ${item.id}.`);
            }
            await hseApi.update(endpoint, recordId, item.payload, syncToken);
          } else if (item.action === 'DELETE') {
            const recordId = getRecordId(item);
            if (!recordId) {
              throw new Error(`ID record tidak ditemukan untuk penghapusan queue item ${item.id}.`);
            }
            await hseApi.deleteOperationalRecord(endpoint, recordId, syncToken);
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
          item.status = 'CONFLICT';
          item.error =
            error instanceof Error
              ? error.message
              : String(error);

          await hdosDB.put(
            'queue',
            item
          );

          const status =
            error instanceof ApiError
              ? error.status
              : 0;

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
              `Sync gagal: ${item.entity} — retry ${item.retryCount}/${MAX_RETRIES}.`,
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
