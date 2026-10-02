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
const DB_VERSION = 4;

export const STORES = [
  'config',
  'queue',
  'repository',
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

    this.initPromise = new Promise((resolve) => {
      let request: IDBOpenDBRequest;

      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        console.error('[HDOS DB] Exception opening IndexedDB', err);
        this.initPromise = null;
        resolve(null);
        return;
      }

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
        resolve(null);
      };

      request.onabort = () => {
        console.error('[HDOS DB] IndexedDB open aborted');
        this.db = null;
        this.initPromise = null;
        resolve(null);
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

      return [];
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
    }
  }

  async getAll<T = any>(storeName: StoreName): Promise<T[]> {
    const db = await this.init();

    if (!db) {
      return this.readFallback<T>(storeName);
    }

    return new Promise((resolve) => {
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

          resolve([]);
        };
      } catch (error) {
        console.error(
          `[HDOS DB] getAll exception for store ${storeName}`,
          error
        );

        resolve([]);
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

    return new Promise((resolve) => {
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

          resolve(null);
        };
      } catch (error) {
        console.error(
          `[HDOS DB] getById exception for ${storeName}/${id}`,
          error
        );

        resolve(null);
      }
    });
  }
}

export const hdosDB = new HDOSDatabase();
