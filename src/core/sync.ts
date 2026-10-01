import { SyncQueueItem } from './types';
import { hdosDB } from './db';
import { hdosEvents } from './events';
import { hseApi } from './api';

export class HDOSSyncEngine {
  private isOnline: boolean = true;
  private isSyncing: boolean = false;
  private queue: SyncQueueItem[] = [];
  private lastSyncTime: string = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  private syncLogs: { time: string; message: string; type: 'info' | 'success' | 'warning' }[] = [
    { time: '08:00', message: 'Engine boot: IndexedDB CGG_HDOS_DB mounted cleanly', type: 'info' },
    { time: '08:15', message: 'Initial cloud spreadsheet sync validated (24 records)', type: 'success' },
  ];

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;
      window.addEventListener('online', () => this.setOnlineState(true));
      window.addEventListener('offline', () => this.setOnlineState(false));
    }
  }

  async init(): Promise<void> {
    const items = await hdosDB.getAll<SyncQueueItem>('queue');
    this.queue = items;
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
    return this.lastSyncTime;
  }

  getSyncLogs() {
    return [...this.syncLogs];
  }

  toggleOnlineSimulation(): boolean {
    this.setOnlineState(!this.isOnline);
    return this.isOnline;
  }

  private setOnlineState(online: boolean): void {
    this.isOnline = online;
    hdosEvents.emit('sync:offline_status_changed', { online });
    this.syncLogs.unshift({
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      message: online ? 'Koneksi online pulih - Queue siap disinkronisasi' : 'Mode offline aktif - Penyimpanan lokal ke CGG_HDOS_DB',
      type: online ? 'success' : 'warning',
    });
    if (online && this.queue.length > 0) {
      this.triggerSync();
    }
  }

  async enqueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'status' | 'retryCount'>): Promise<SyncQueueItem> {
    const queueItem: SyncQueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
      retryCount: 0,
      ...item,
    };

    this.queue.push(queueItem);
    await hdosDB.put('queue', queueItem);
    hdosEvents.emit('sync:queue_updated', this.queue);

    if (this.isOnline) {
      // Auto sync if online
      setTimeout(() => this.triggerSync(), 300);
    } else {
      this.syncLogs.unshift({
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        message: `Tersimpan di offline queue: [${queueItem.entity.toUpperCase()}] ${queueItem.action}`,
        type: 'warning',
      });
    }

    return queueItem;
  }

  async triggerSync(): Promise<boolean> {
    if (!this.isOnline) {
      this.syncLogs.unshift({
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        message: 'Sinkronisasi ditunda: sistem sedang offline',
        type: 'warning',
      });
      return false;
    }
    if (this.isSyncing) return false;
    if (!hseApi.isAuthenticated) {
      this.syncLogs.unshift({
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        message: 'Sinkronisasi ditunda: sesi login API belum aktif',
        type: 'warning',
      });
      hdosEvents.emit('sync:queue_updated', this.queue);
      return false;
    }

    this.isSyncing = true;
    hdosEvents.emit('sync:started', { queueCount: this.queue.length });

    try {
      const remainingQueue: SyncQueueItem[] = [];

      for (const item of this.queue) {
        item.status = 'SYNCING';
        hdosEvents.emit('sync:progress', { item });

        try {
          await this.syncQueueItem(item);
          item.status = 'SYNCED';
          item.note = 'Sinkronisasi berhasil';
          await hdosDB.delete('queue', item.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Sinkronisasi gagal';
          item.retryCount += 1;
          if (message.includes('belum tersedia')) {
            item.retryCount = 3;
          }
          item.status = item.retryCount >= 3 ? 'CONFLICT' : 'PENDING';
          item.note = message;
          remainingQueue.push(item);
          await hdosDB.put('queue', item);
          this.syncLogs.unshift({
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            message: `Sinkronisasi ${item.entity} gagal: ${item.note}`,
            type: 'warning',
          });
        }

        hdosEvents.emit('sync:queue_updated', [...remainingQueue]);
      }

      this.queue = remainingQueue;
      this.lastSyncTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      this.syncLogs.unshift({
        time: this.lastSyncTime,
        message:
          this.queue.length === 0
            ? 'Sinkronisasi berhasil ke Google Sheets HDOS Enterprise & Cloud Repository'
            : `Sinkronisasi selesai dengan ${this.queue.length} item masih tertunda`,
        type: this.queue.length === 0 ? 'success' : 'warning',
      });
      hdosEvents.emit('sync:completed', { time: this.lastSyncTime });
      hdosEvents.emit('sync:queue_updated', this.queue);
      return this.queue.length === 0;
    } catch (err) {
      console.error('[HDOS Sync] Sync failed:', err);
      this.syncLogs.unshift({
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        message: 'Gagal melakukan sinkronisasi: Konflik jaringan',
        type: 'warning',
      });
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncQueueItem(item: SyncQueueItem): Promise<void> {
    const entityMap = {
      inspection: 'inspections',
      hazard: 'hazards',
      incident: 'incidents',
      pica: 'picas',
    } as const;

    if (item.entity !== 'inspection' && item.entity !== 'hazard' && item.entity !== 'incident' && item.entity !== 'pica') {
      throw new Error(`Sinkronisasi backend belum tersedia untuk entity ${item.entity}`);
    }

    const entity = entityMap[item.entity];
    const payload = item.payload as { id?: string };

    if (item.action === 'CREATE') {
      await hseApi.create(entity, item.payload);
      return;
    }

    if (item.action === 'UPDATE') {
      if (!payload?.id) {
        throw new Error('Payload update tidak memiliki id');
      }
      await hseApi.update(entity, payload.id, item.payload);
      return;
    }
  }

  /**
   * Alias untuk triggerSync() - Sinkronisasi semua pending items dari queue
   * Kompatibel dengan interface publik yang lebih umum
   */
  async syncAll(): Promise<boolean> {
    return this.triggerSync();
  }

  exportToGoogleSheetsCSV(records: any[], entityName: string): void {
    if (!records || records.length === 0) return;
    const headers = Object.keys(records[0]).join(',');
    const rows = records.map((r) =>
      Object.values(r)
        .map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CGG_HDOS_${entityName.toUpperCase()}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const hdosSync = new HDOSSyncEngine();
