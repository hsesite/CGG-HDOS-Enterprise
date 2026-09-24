/**
 * HDOS IndexedDB Engine
 * Database: CGG_HDOS_DB
 * Stores: config, queue, repository, inspection, hazard, incident, pica, contractor, maps, photos, ai-cache, systemlog
 */

const DB_NAME = 'CGG_HDOS_DB';
const DB_VERSION = 3;

export const STORES = [
  'config',
  'queue',
  'repository',
  'inspection',
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
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[HDOS DB] IndexedDB not supported in this environment');
      return null;
    }

    this.initPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          STORES.forEach((storeName) => {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: 'id' });
            }
          });
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve(this.db);
        };

        request.onerror = (e) => {
          console.error('[HDOS DB] IndexedDB open error', e);
          resolve(null);
        };
      } catch (err) {
        console.error('[HDOS DB] Exception initializing IndexedDB', err);
        resolve(null);
      }
    });

    return this.initPromise;
  }

  async getAll<T = any>(storeName: StoreName): Promise<T[]> {
    const db = await this.init();
    if (!db) {
      const fallback = localStorage.getItem(`cgg_hdos_${storeName}`);
      return fallback ? JSON.parse(fallback) : [];
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as T[]) || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async put<T extends { id: string }>(storeName: StoreName, item: T): Promise<void> {
    const db = await this.init();
    if (!db) {
      const existing = await this.getAll(storeName);
      const updated = existing.filter((x: any) => x.id !== item.id).concat(item);
      localStorage.setItem(`cgg_hdos_${storeName}`, JSON.stringify(updated));
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async delete(storeName: StoreName, id: string): Promise<void> {
    const db = await this.init();
    if (!db) {
      const existing = await this.getAll(storeName);
      const updated = existing.filter((x: any) => x.id !== id);
      localStorage.setItem(`cgg_hdos_${storeName}`, JSON.stringify(updated));
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async clear(storeName: StoreName): Promise<void> {
    const db = await this.init();
    if (!db) {
      localStorage.removeItem(`cgg_hdos_${storeName}`);
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const hdosDB = new HDOSDatabase();
