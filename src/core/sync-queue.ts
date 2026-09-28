import { hseApi } from './api';
import type { Inspection, Hazard, PICA, Incident } from './types';

export type SyncQueueItem = {
  id: string;
  entity: 'inspection' | 'hazard' | 'pica' | 'incident';
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: unknown;
  retryCount: number;
  error?: string;
  timestamp: number;
};

const QUEUE_KEY = 'hdos_sync_queue';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

class ApiSyncQueue {
  private queue: Map<string, SyncQueueItem> = new Map();
  private isOnline = navigator.onLine;
  private syncTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loadQueue();
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  private loadQueue(): void {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (stored) {
        const items = JSON.parse(stored) as SyncQueueItem[];
        items.forEach((item) => this.queue.set(item.id, item));
      }
    } catch (error) {
      console.error('[HDOS sync] failed to load queue', error);
    }
  }

  private saveQueue(): void {
    try {
      const items = Array.from(this.queue.values());
      localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('[HDOS sync] failed to save queue', error);
    }
  }

  private handleOnline(): void {
    console.log('[HDOS sync] online detected, processing queue');
    this.isOnline = true;
    this.processQueue();
  }

  private handleOffline(): void {
    console.log('[HDOS sync] offline detected');
    this.isOnline = false;
    if (this.syncTimer) clearTimeout(this.syncTimer);
  }

  async enqueue(entity: SyncQueueItem['entity'], operation: SyncQueueItem['operation'], payload: unknown): Promise<string> {
    const id = `${entity}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const item: SyncQueueItem = { id, entity, operation, payload, retryCount: 0, timestamp: Date.now() };
    this.queue.set(id, item);
    this.saveQueue();
    console.log(`[HDOS sync] enqueued ${entity} ${operation}`, item);
    if (this.isOnline) this.processQueue();
    return id;
  }

  private async processQueue(): Promise<void> {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    if (!this.isOnline) return;

    const items = Array.from(this.queue.values()).filter((item) => item.retryCount < MAX_RETRIES);
    if (items.length === 0) {
      console.log('[HDOS sync] queue empty or all retries exhausted');
      return;
    }

    for (const item of items) {
      try {
        console.log(`[HDOS sync] processing ${item.id}`);
        if (item.operation === 'CREATE') {
          await hseApi.create(item.entity + 's' as 'inspections' | 'hazards' | 'picas' | 'incidents', item.payload);
        } else if (item.operation === 'UPDATE') {
          const [, id] = item.id.split('-');
          await hseApi.update(item.entity + 's' as 'inspections' | 'hazards' | 'picas' | 'incidents', id, item.payload);
        }
        this.queue.delete(item.id);
        console.log(`[HDOS sync] ${item.id} synced successfully`);
      } catch (error) {
        item.retryCount += 1;
        item.error = String(error);
        console.warn(`[HDOS sync] ${item.id} failed, retry ${item.retryCount}/${MAX_RETRIES}`, error);
      }
    }
    this.saveQueue();
    if (this.queue.size > 0) {
      this.syncTimer = setTimeout(() => this.processQueue(), RETRY_DELAY_MS);
    }
  }

  getQueue(): SyncQueueItem[] {
    return Array.from(this.queue.values());
  }

  clearQueue(): void {
    this.queue.clear();
    localStorage.removeItem(QUEUE_KEY);
  }
}

export const apiSyncQueue = new ApiSyncQueue();
