/**
 * HDOS IndexedDB Engine
 * Database: CGG_HDOS_DB
 *
 * Stores:
 * config
 * queue
 * repository
 * inspection
 * inspection-draft
 * hazard
 * incident
 * pica
 * contractor
 * maps
 * photos
 * ai-cache
 * systemlog
 */

const DB_NAME = 'CGG_HDOS_DB';
const DB_VERSION = 5;

export const STORES = [
  'config',
  'queue',
  'repository',
  'form-definition',
  'inspection',
  'inspection-draft',
  'hazard',
  'incident',
  'pica',
  'contractor',
  'maps',
  'photos',
  'ai-cache',
  'systemlog',
] as const;

export type StoreName = (typeof STORES)[number];

class HDOSDatabase {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase | null> | null = null;

  async init(): Promise<IDBDatabase | null> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[HDOS DB] IndexedDB not supported in this environment');
      return null;
    }

    let request: IDBOpenDBRequest;
    try {
      // Open outside the cached promise so a synchronous browser exception
      // cannot leave a permanently cached Promise<null> and disable future
      // IndexedDB initialization attempts for this page session.
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      console.error('[HDOS DB] Exception opening IndexedDB', err);
      this.db = null;
      this.initPromise = null;
      // Do not silently switch to localStorage after an IndexedDB failure:
      // that can create a second database and hide queued offline writes when
      // IndexedDB becomes available again.
      return Promise.reject(new Error('IndexedDB tidak dapat dibuka. Data lokal tidak dialihkan ke penyimpanan lain.', { cause: err }));
    }

    this.initPromise = new Promise((resolve, reject) => {
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        STORES.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, {
              keyPath: 'id',
            });
          }
        });
      };

      request.onblocked = () => {
        console.warn(
          '[HDOS DB] Database upgrade blocked. Close other HDOS tabs/windows.'
        );
      };

      request.onsuccess = () => {
        const openedDb = request.result;

        openedDb.onversionchange = () => {
          console.info('[HDOS DB] Database version changed. Closing connection.');
          openedDb.close();
          this.db = null;
          this.initPromise = null;
        };

        openedDb.onerror = (event) => {
          console.error('[HDOS DB] Runtime database error', event);
        };

        this.db = openedDb;
        resolve(openedDb);
      };

      request.onerror = () => {
        console.error('[HDOS DB] IndexedDB open error', request.error);
        this.db = null;
        this.initPromise = null;
        reject(new Error('IndexedDB gagal dibuka. Penyimpanan lokal alternatif tidak digunakan agar antrean tidak terpecah.', { cause: request.error }));
      };

    });

    return this.initPromise;
  }

  private getFallbackKey(storeName: StoreName): string {
    return `cgg_hdos_${storeName}`;
  }

  private readFallback<T>(storeName: StoreName): T[] {
    try {
      const raw = localStorage.getItem(this.getFallbackKey(storeName));

      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);

      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(
        `[HDOS DB] Failed to read localStorage fallback for ${storeName}`,
        error
      );

      throw new Error(`Data lokal "${storeName}" tidak dapat dibaca.`, { cause: error });
    }
  }

  private writeFallback<T extends { id: string }>(
    storeName: StoreName,
    items: T[]
  ): void {
    try {
      localStorage.setItem(
        this.getFallbackKey(storeName),
        JSON.stringify(items)
      );
    } catch (error) {
      console.error(
        `[HDOS DB] Failed to write localStorage fallback for ${storeName}`,
        error
      );

      // Do not report a successful save when localStorage rejected the write
      // (for example because the browser quota is full).
      throw new Error(
        `Penyimpanan lokal gagal untuk "${storeName}". Periksa kapasitas browser dan coba lagi.`,
        { cause: error }
      );
    }
  }

  async getAll<T = any>(storeName: StoreName): Promise<T[]> {
    const db = await this.init();

    if (!db) {
      return this.readFallback<T>(storeName);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve((request.result as T[]) || []);
        };

        request.onerror = () => {
          console.error(
            `[HDOS DB] getAll failed for store ${storeName}`,
            request.error
          );

          reject(new Error(`Gagal membaca data "${storeName}" dari IndexedDB.`, { cause: request.error }));
        };
      } catch (error) {
        console.error(
          `[HDOS DB] getAll exception for store ${storeName}`,
          error
        );

        reject(new Error(`Gagal membuka data "${storeName}" dari IndexedDB.`, { cause: error }));
      }
    });
  }

  async reconcileSnapshot<T extends { id: string }>(
    storeName: StoreName,
    deleteIds: string[],
    records: T[],
  ): Promise<void> {
    const db = await this.init();
    if (!db) {
      const key = this.getFallbackKey(storeName);
      let previous: string | null = null;
      let snapshotCaptured = false;
      try {
        previous = localStorage.getItem(key);
        snapshotCaptured = true;
        const current = this.readFallback<T>(storeName);
        const deleted = new Set(deleteIds);
        const merged = current.filter(item => !deleted.has(item.id));
        const byId = new Map(merged.map(item => [item.id, item]));
        for (const record of records) byId.set(record.id, record);
        this.writeFallback(storeName, [...byId.values()]);
      } catch (error) {
        if (snapshotCaptured) {
          try {
            if (previous === null) localStorage.removeItem(key);
            else localStorage.setItem(key, previous);
          } catch (rollbackError) {
            console.error('[HDOS DB] Snapshot rollback failed', rollbackError);
          }
        }
        throw error;
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const id of deleteIds) store.delete(id);
        for (const record of records) store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB snapshot transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB snapshot transaction aborted'));
      } catch (error) {
        reject(error);
      }
    });
  }

  async reconcileSnapshotBundle(
    changes: Array<{ storeName: StoreName; deleteIds: string[]; records: Array<{ id: string }> }>,
  ): Promise<void> {
    const grouped = new Map<StoreName, { deleteIds: Set<string>; records: Map<string, { id: string }> }>();
    for (const change of changes) {
      const current = grouped.get(change.storeName) || { deleteIds: new Set<string>(), records: new Map<string, { id: string }>() };
      for (const id of change.deleteIds) current.deleteIds.add(id);
      for (const record of change.records) current.records.set(record.id, record);
      grouped.set(change.storeName, current);
    }
    if (grouped.size === 0) return;

    const db = await this.init();
    if (!db) {
      const snapshots = new Map<string, string | null>();
      // Capture every affected key before the first mutation. If capture fails,
      // no store has been changed and rollback is intentionally not attempted.
      for (const storeName of grouped.keys()) {
        const key = this.getFallbackKey(storeName);
        snapshots.set(key, localStorage.getItem(key));
      }
      try {
        for (const [storeName, change] of grouped) {
          const current = this.readFallback<{ id: string }>(storeName);
          const remaining = current.filter(item => !change.deleteIds.has(item.id));
          const byId = new Map(remaining.map(item => [item.id, item]));
          for (const record of change.records.values()) byId.set(record.id, record);
          this.writeFallback(storeName, [...byId.values()]);
        }
      } catch (error) {
        for (const [key, value] of snapshots) {
          try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
          } catch (rollbackError) {
            console.error('[HDOS DB] Multi-store snapshot rollback failed', rollbackError);
          }
        }
        throw error;
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const storeNames = [...grouped.keys()];
        const tx = db.transaction(storeNames, 'readwrite');
        for (const [storeName, change] of grouped) {
          const store = tx.objectStore(storeName);
          for (const id of change.deleteIds) store.delete(id);
          for (const record of change.records.values()) store.put(record);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB multi-store snapshot transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB multi-store snapshot transaction aborted'));
      } catch (error) {
        reject(error);
      }
    });
  }

  async putBundle<T extends { storeName: StoreName; item: { id: string } }>(entries: T[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await this.init();

    if (!db) {
      // Best-effort rollback for the localStorage fallback. IndexedDB below
      // provides the full cross-store atomic transaction.
      const storeNames = [...new Set(entries.map(entry => entry.storeName))];
      const snapshots = new Map<string, string | null>();
      try {
        for (const storeName of storeNames) {
          const key = this.getFallbackKey(storeName);
          snapshots.set(key, localStorage.getItem(key));
        }
        const grouped = new Map<StoreName, Array<{ id: string }>>();
        for (const entry of entries) {
          const group = grouped.get(entry.storeName) || this.readFallback<{ id: string }>(entry.storeName);
          grouped.set(entry.storeName, group.filter(existing => existing.id !== entry.item.id).concat(entry.item));
        }
        for (const [storeName, items] of grouped) this.writeFallback(storeName, items);
      } catch (error) {
        for (const [key, value] of snapshots) {
          try {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
          } catch (rollbackError) {
            console.error('[HDOS DB] localStorage bundle rollback failed', rollbackError);
          }
        }
        throw error;
      }
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const storeNames = [...new Set(entries.map(entry => entry.storeName))];
        const tx = db.transaction(storeNames, 'readwrite');
        for (const entry of entries) tx.objectStore(entry.storeName).put(entry.item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB bundle transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB bundle transaction aborted'));
      } catch (error) {
        reject(error);
      }
    });
  }

  async put<T extends { id: string }>(
    storeName: StoreName,
    item: T
  ): Promise<void> {
    const db = await this.init();

    if (!db) {
      const existing = this.readFallback<T>(storeName);

      const updated = existing
        .filter((existingItem) => existingItem.id !== item.id)
        .concat(item);

      this.writeFallback(storeName, updated);
      return;
    }

    return new Promise((resolve, reject) => {
      let completed = false;

      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        store.put(item);

        tx.oncomplete = () => {
          completed = true;
          resolve();
        };

        tx.onerror = () => {
          if (!completed) {
            reject(tx.error);
          }
        };

        tx.onabort = () => {
          if (!completed) {
            reject(tx.error || new Error('IndexedDB transaction aborted'));
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async delete(storeName: StoreName, id: string): Promise<void> {
    const db = await this.init();

    if (!db) {
      const existing = this.readFallback<any>(storeName);

      const updated = existing.filter(
        (existingItem: any) => existingItem.id !== id
      );

      this.writeFallback(storeName, updated);
      return;
    }

    return new Promise((resolve, reject) => {
      let completed = false;

      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        store.delete(id);

        tx.oncomplete = () => {
          completed = true;
          resolve();
        };

        tx.onerror = () => {
          if (!completed) {
            reject(tx.error);
          }
        };

        tx.onabort = () => {
          if (!completed) {
            reject(tx.error || new Error('IndexedDB transaction aborted'));
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async clear(storeName: StoreName): Promise<void> {
    const db = await this.init();

    if (!db) {
      localStorage.removeItem(this.getFallbackKey(storeName));
      return;
    }

    return new Promise((resolve, reject) => {
      let completed = false;

      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        store.clear();

        tx.oncomplete = () => {
          completed = true;
          resolve();
        };

        tx.onerror = () => {
          if (!completed) {
            reject(tx.error);
          }
        };

        tx.onabort = () => {
          if (!completed) {
            reject(tx.error || new Error('IndexedDB transaction aborted'));
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async getById<T = any>(
    storeName: StoreName,
    id: string
  ): Promise<T | null> {
    const db = await this.init();

    if (!db) {
      const items = this.readFallback<T & { id: string }>(storeName);

      return (
        items.find(
          (item) => (item as T & { id: string }).id === id
        ) || null
      );
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(id);

        request.onsuccess = () => {
          resolve((request.result as T) || null);
        };

        request.onerror = () => {
          console.error(
            `[HDOS DB] getById failed for ${storeName}/${id}`,
            request.error
          );

          reject(new Error(`Gagal membaca data "${storeName}/${id}" dari IndexedDB.`, { cause: request.error }));
        };
      } catch (error) {
        console.error(
          `[HDOS DB] getById exception for ${storeName}/${id}`,
          error
        );

        reject(new Error(`Gagal membuka data "${storeName}/${id}" dari IndexedDB.`, { cause: error }));
      }
    });
  }
}

export const hdosDB = new HDOSDatabase();
