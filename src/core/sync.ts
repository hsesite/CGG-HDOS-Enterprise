import type { SyncQueueItem } from './types';
import { hdosDB } from './db';
import { hdosEvents } from './events';
import { hseApi, ApiError } from './api';

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

  private lastSyncTime = '';

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
    this.queue =
      await hdosDB.getAll<SyncQueueItem>(
        'queue'
      );

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
    >
  ): Promise<SyncQueueItem> {
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
    };

    this.queue.push(queueItem);

    await hdosDB.put(
      'queue',
      queueItem
    );

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

    if (
      this.isOnline &&
      hseApi.isAuthenticated
    ) {
      setTimeout(() => {
        void this.triggerSync();
      }, 100);
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

  async triggerSync(): Promise<boolean> {
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
      for (
        const item of [...this.queue]
      ) {
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
          item.status = 'CONFLICT';
          item.error =
            `Entity ${item.entity} belum memiliki endpoint cloud.`;

          await hdosDB.put(
            'queue',
            item
          );

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
              item.payload
            );
          } else if (
            item.action === 'UPDATE'
          ) {
            const recordId =
              getRecordId(item);

            if (!recordId) {
              throw new Error(
                `ID record tidak ditemukan untuk queue item ${item.id}.`
              );
            }

            await hseApi.update(
              endpoint,
              recordId,
              item.payload
            );
          } else if (
            item.action === 'DELETE'
          ) {
            throw new Error(
              'DELETE sync belum diaktifkan pada Build v1.0.'
            );
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

            continue;
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

    const headers =
      Object.keys(
        records[0]
      ).join(',');

    const rows =
      records.map((record) =>
        Object.values(record)
          .map(
            (value) =>
              `"${String(
                value ?? ''
              ).replace(/"/g, '""')}"`
          )
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
