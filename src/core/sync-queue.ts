import { hseApi } from './api';
import type { SyncQueueItem } from './types';

const QUEUE_KEY = 'hdos_sync_queue';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

class ApiSyncQueue {
  private queue: Map<string, SyncQueueItem> = new Map();
  private isOnline =
    typeof navigator !== 'undefined' ? navigator.onLine : false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadQueue();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  private loadQueue(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(QUEUE_KEY);

      if (!stored) {
        return;
      }

      const items = JSON.parse(stored) as SyncQueueItem[];

      items.forEach((item) => {
        this.queue.set(item.id, item);
      });
    } catch (error) {
      console.error('[HDOS sync] failed to load queue', error);
    }
  }

  private saveQueue(): void {
    if (typeof window === 'undefined') {
      return;
    }

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
    void this.processQueue();
  }

  private handleOffline(): void {
    console.log('[HDOS sync] offline detected');

    this.isOnline = false;

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }

  async enqueue(
    entity: SyncQueueItem['entity'],
    action: SyncQueueItem['action'],
    payload: unknown
  ): Promise<string> {
    const id = `${entity}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    const item: SyncQueueItem = {
      id,
      entity,
      action,
      payload,
      retryCount: 0,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
    };

    this.queue.set(id, item);
    this.saveQueue();

    console.log(
      `[HDOS sync] enqueued ${entity} ${action}`,
      item
    );

    if (this.isOnline) {
      void this.processQueue();
    }

    return id;
  }

  private async processQueue(): Promise<void> {
    if (!this.isOnline) {
      return;
    }

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    const items = Array.from(this.queue.values()).filter(
      (item) => item.retryCount < MAX_RETRIES
    );

    if (items.length === 0) {
      return;
    }

    for (const item of items) {
      try {
        console.log(`[HDOS sync] processing ${item.id}`);

        const entityEndpoint =
          `${item.entity}s` as
            | 'inspections'
            | 'hazards'
            | 'picas'
            | 'incidents';

        if (item.action === 'CREATE') {
          await hseApi.create(
            entityEndpoint,
            item.payload
          );
        } else if (item.action === 'UPDATE') {
          /*
           * NOTE:
           * UPDATE record ID will be corrected in Phase 1C.
           * The current queue contract does not yet store
           * the source record ID separately.
           */
          const [, id] = item.id.split('-');

          if (!id) {
            throw new Error(
              `Unable to resolve record ID for queue item ${item.id}`
            );
          }

          await hseApi.update(
            entityEndpoint,
            id,
            item.payload
          );
        } else if (item.action === 'DELETE') {
          /*
           * DELETE handling is intentionally deferred to
           * the unified API/sync contract in Phase 1C/1D.
           */
          throw new Error(
            'DELETE sync is not yet implemented'
          );
        }

        this.queue.delete(item.id);

        console.log(
          `[HDOS sync] ${item.id} synced successfully`
        );
      } catch (error) {
        item.retryCount += 1;
        item.status = 'CONFLICT';
        item.error =
          error instanceof Error
            ? error.message
            : String(error);

        console.warn(
          `[HDOS sync] ${item.id} failed, retry ${item.retryCount}/${MAX_RETRIES}`,
          error
        );
      }
    }

    this.saveQueue();

    if (this.queue.size > 0 && this.isOnline) {
      this.syncTimer = setTimeout(
        () => {
          void this.processQueue();
        },
        RETRY_DELAY_MS
      );
    }
  }

  getQueue(): SyncQueueItem[] {
    return Array.from(this.queue.values());
  }

  clearQueue(): void {
    this.queue.clear();

    if (typeof window !== 'undefined') {
      localStorage.removeItem(QUEUE_KEY);
    }
  }
}

export const apiSyncQueue = new ApiSyncQueue();
