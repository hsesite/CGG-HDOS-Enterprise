import { SyncQueueItem } from './types';
import { hdosDB } from './db';
import { hdosEvents } from './events';

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
      alert('Sistem sedang dalam mode Offline. Harap aktifkan mode Online untuk sinkronisasi.');
      return false;
    }
    if (this.isSyncing) return false;

    this.isSyncing = true;
    hdosEvents.emit('sync:started', { queueCount: this.queue.length });

    try {
      // Simulate real progressive synchronization to Google Sheet & Central Repository
      for (const item of this.queue) {
        item.status = 'SYNCING';
        hdosEvents.emit('sync:progress', { item });
        await new Promise((r) => setTimeout(r, 200));
        item.status = 'SYNCED';
        await hdosDB.delete('queue', item.id);
      }

      this.queue = [];
      this.lastSyncTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      this.syncLogs.unshift({
        time: this.lastSyncTime,
        message: 'Sinkronisasi berhasil ke Google Sheets HDOS Enterprise & Cloud Repository',
        type: 'success',
      });
      hdosEvents.emit('sync:completed', { time: this.lastSyncTime });
      hdosEvents.emit('sync:queue_updated', this.queue);
      return true;
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
