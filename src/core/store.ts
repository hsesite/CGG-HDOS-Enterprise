import type { Inspection, Hazard, PICA, Incident, DocumentItem, ContractorPassport, MiningLocationGIS, AppWindow, WindowId, FormDefinition } from './types';
import { hdosDB } from './db';
import { hdosEvents } from './events';
import { hdosSync } from './sync';
import { hdosAuth } from './auth';
import { AuthState } from './auth-state';
import { hseApi } from './api';
import { useState, useEffect } from 'react';

function isLocalRecordVisible(
  record: Record<string, unknown>,
  user: ReturnType<typeof AuthState.getUser>,
  allowedCompanyCodes: ReadonlySet<string> = new Set<string>(),
): boolean {
  if (!user) return false;
  const roles = user.roles || [];
  if (roles.includes('Admin CGG')) return true;
  const own = String(user.companyCode || '').trim().toUpperCase();
  if (!own) return false;
  const company = String(record.companyCode || record.contractorCode || record.ownerCompanyCode || '').trim().toUpperCase();
  const subkon = String(record.subcontractorCode || record.subkonCode || '').trim().toUpperCase();
  const parent = String(record.parentCompanyCode || '').trim().toUpperCase();

  // Match the backend's approved, active Contractor/Subkon scope. The master
  // is supplied by the central company register; never hard-code tenant IDs.
  const oversightRoles = ['KTT', 'SPT', 'SPV', 'PJO', 'SPV HSE', 'Foreman Safety'];
  if (user.roleVerified === true && oversightRoles.some(role => roles.includes(role))) {
    return allowedCompanyCodes.has(company) ||
      allowedCompanyCodes.has(subkon) ||
      allowedCompanyCodes.has(parent);
  }

  // Unverified supervisory accounts use the same own-tenant cache scope as crew.
  if (user.parentCompanyCode) return company === own || subkon === own;
  return company === own || subkon === own || parent === own;
}

function getCurrentTenantFields() {
  const user = AuthState.getUser();
  const companyCode = String(user?.companyCode || (user?.roles?.includes('Admin CGG') ? 'CGG' : '')).trim().toUpperCase();
  const parentCompanyCode = String(user?.parentCompanyCode || '').trim().toUpperCase();
  return {
    companyCode,
    contractorCode: parentCompanyCode || companyCode,
    parentCompanyCode,
    ...(parentCompanyCode ? { subcontractorCode: companyCode } : {}),
  };
}
function createEntityId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    (char) => {
      const random = Math.random() * 16 | 0;
      const value =
        char === 'x'
          ? random
          : (random & 0x3) | 0x8;

      return value.toString(16);
    }
  );
}

// Operational master data starts empty. Populate it from Settings after verification.
const INITIAL_WINDOWS: AppWindow[] = [
  { id: 'dashboard', title: 'HDOS Dashboard', isOpen: true, isMinimized: false, isMaximized: false, zIndex: 10 },
  { id: 'inspection', title: 'Inspection Runtime', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'hazard', title: 'Hazard Management', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'pica', title: 'PICA Tracking', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'incident', title: 'Incident Investigation', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'repository', title: 'Document Control', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'contractor', title: 'Contractor Passport', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'map', title: 'Mining GIS Map', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'ai', title: 'AI Vision & Assistant', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'sync', title: 'Offline Queue & Sync', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
  { id: 'settings', title: 'Pengaturan & Master Data', isOpen: false, isMinimized: false, isMaximized: false, zIndex: 5 },
];

export class HDOSCentralStore {
  private assertMutationAllowed(action: 'location' | 'contractor' | 'document' | 'inspection' | 'hazard' | 'incident' | 'pica', updates?: Partial<PICA>): void {
    const role = hdosAuth.getCurrentRole();
    if (action === 'pica') {
      const allowedKeys = ['status', 'correctiveAction', 'evidencePhotoUrl', 'evidencePhotoFileId', 'submittedAt', 'closeRequestedAt', 'hseValidatedBy', 'hseValidatedRole', 'hseValidatedAt', 'completionDate', 'rejectionReason', 'updatedAt'];
      if (updates && Object.keys(updates).every((key) => allowedKeys.includes(key))) return;
      throw new Error('Perubahan PICA hanya dapat dilakukan oleh PIC yang ditugaskan atau HSE validator.');
    }
    if (['PJO', 'SPV HSE', 'Foreman Safety'].includes(role) && !['inspection', 'hazard', 'incident'].includes(action)) {
      throw new Error('Akun ini hanya dapat membuat laporan operasional.');
    }
    if (role === 'Employee' && !['inspection', 'hazard', 'incident'].includes(action)) {
      throw new Error('Akun umum hanya dapat membuat laporan Inspeksi, Hazard, dan Insiden.');
    }
  }

  public inspections: Inspection[] = [];
  public hazards: Hazard[] = [];
  public incidents: Incident[] = [];
  public picas: PICA[] = [];
  public documents: DocumentItem[] = [];
  public formDefinitions: FormDefinition[] = [];
  public contractors: ContractorPassport[] = [];
  public locations: MiningLocationGIS[] = [];
  public windows: AppWindow[] = INITIAL_WINDOWS;
  public focusedWindowId: WindowId = 'dashboard';
  public isMobileMode: boolean = false;
  public missionControlOpen: boolean = false;
  public safeHours: number = 0;
  public weather: { temp: number | null; humidity: number | null; wbgt: number | null; heatStressLevel: 'NORMAL' | 'MODERATE' | 'HIGH' | 'EXTREME' | null; rainMm: number | null; pitStatus: 'OPERATIONAL' | 'STANDBY_RAIN' | 'RESTRICTED' | null } = {
    temp: null, humidity: null, wbgt: null, heatStressLevel: null, rainMm: null, pitStatus: null,
  };
  public liveFeed: Array<{ id: string; time: string; category: string; text: string; level: string }> = [];
  public lastCloudRefreshAt: string | null = null;
  public cloudRefreshFailedSources: string[] = [];

  private listeners: Set<() => void> = new Set();
  private maxZIndex: number = 20;

  async init(): Promise<void> {
  try {
    // Never carry another account's freshness indicator across a workspace switch.
    this.lastCloudRefreshAt = null;
    this.cloudRefreshFailedSources = [];

    // Load the active account's durable queue before reconciling cloud snapshots.
    // This ensures pending offline writes are never overwritten by older server data.
    await hdosSync.init();

    // Preserve all operational offline data during application upgrades.
    // Only explicitly identified demo seed records are removed below.
    this.inspections = await hdosDB.getAll<Inspection>('inspection');

    this.hazards = await hdosDB.getAll<Hazard>('hazard');

    this.picas = await hdosDB.getAll<PICA>('pica');

    this.incidents = await hdosDB.getAll<Incident>('incident');

    // Repository persistence. Remove the known demo seed from older browser databases.
    // Real uploaded documents and their linked forms are preserved.
    const storedDocuments = await hdosDB.getAll<DocumentItem>('repository');
    const seededDemoDocument = storedDocuments.find((doc) => doc.id === 'doc_1');
    if (seededDemoDocument) {
      await hdosDB.delete('repository', seededDemoDocument.id);
      await hdosDB.delete('photos', 'document-file-doc_1');
    }
    this.documents = storedDocuments.filter((doc) => doc.id !== 'doc_1');
    this.contractors = await hdosDB.getAll<ContractorPassport>('contractor');
    this.locations = await hdosDB.getAll<MiningLocationGIS>('maps');

    const storedFormDefinitions =
      await hdosDB.getAll<FormDefinition>('form-definition');
    const seededDemoForms = storedFormDefinitions.filter((form) => form.sourceDocumentId === 'doc_1');
    for (const form of seededDemoForms) {
      await hdosDB.delete('form-definition', form.id);
    }
    this.formDefinitions = storedFormDefinitions.filter((form) => form.sourceDocumentId !== 'doc_1');
    // IndexedDB is shared by browser profiles, not by HDOS accounts. Apply the
    // tenant boundary to cached data before exposing it to any module.
    const currentUser = AuthState.getUser();
    if (currentUser) {
      const ownCompanyCode = String(currentUser.companyCode || '').trim().toUpperCase();
      const canSeeAllContractors = currentUser.roles?.includes('Admin CGG') || ownCompanyCode === 'CGG';
      this.contractors = this.contractors.filter(contractor =>
        canSeeAllContractors || String(contractor.code || '').trim().toUpperCase() === ownCompanyCode
      );
      try {
        // The server master is authoritative across devices. Keep the cached
        // IndexedDB copy only when the API is unavailable (offline mode).
        const centralLocations = await hseApi.listLocations();
        this.locations = centralLocations;
        for (const location of centralLocations) await hdosDB.put('maps', location);
      } catch (error) {
        console.warn('[HDOS Store] Master area pusat tidak tersedia; memakai cache lokal.', error);
      }
      try {
        const centralCompanies = await hseApi.listCompanies();
        await this.setContractorsFromCompanyMaster(centralCompanies);
      } catch (error) {
        console.warn('[HDOS Store] Master kontraktor pusat tidak tersedia; memakai cache lokal.', error);
      }
    }
    const allowedCompanyCodes = new Set(this.contractors.flatMap(company => [
      String(company.code || '').trim().toUpperCase(),
      String(company.parentCompanyCode || '').trim().toUpperCase(),
    ]).filter(Boolean));
    this.inspections = this.inspections.filter(record => isLocalRecordVisible(record as unknown as Record<string, unknown>, currentUser, allowedCompanyCodes));
    this.hazards = this.hazards.filter(record => isLocalRecordVisible(record as unknown as Record<string, unknown>, currentUser, allowedCompanyCodes));
    this.picas = this.picas.filter(record => isLocalRecordVisible(record as unknown as Record<string, unknown>, currentUser, allowedCompanyCodes));
    this.incidents = this.incidents.filter(record => isLocalRecordVisible(record as unknown as Record<string, unknown>, currentUser, allowedCompanyCodes));
    this.documents = this.documents.filter(record => isLocalRecordVisible(record as unknown as Record<string, unknown>, currentUser, allowedCompanyCodes));
    this.formDefinitions = this.formDefinitions.filter(form => this.documents.some(document => document.id === form.sourceDocumentId));
    this.contractors = this.contractors.filter(record => {
      if (!currentUser) return false;
      if (currentUser.roles.includes('Admin CGG')) return true;

      // Verified CGG oversight roles need visibility across the registered
      // contractor and subcontractor master, not a hard-coded company list.
      const oversightRoles = ['KTT', 'SPT', 'SPV', 'SPV HSE', 'Foreman Safety', 'PJO'];
      if (currentUser.roleVerified === true && oversightRoles.some(role => currentUser.roles.includes(role))) {
        return true;
      }

      // A contractor/company administrator can see its own company and its
      // registered subcontractors. A subcontractor account sees only itself.
      const ownCompanyCode = String(currentUser.companyCode || '').trim().toUpperCase();
      if (!ownCompanyCode) return false;
      const recordCode = String(record.code || '').trim().toUpperCase();
      const parentCode = String(record.parentCompanyCode || '').trim().toUpperCase();
      return recordCode === ownCompanyCode || parentCode === ownCompanyCode;
    });

    if (currentUser && hseApi.isAuthenticated) {
      await this.refreshCloudData();
    }

  } catch (err) {
    console.error('[HDOS Store] Gagal memuat data lokal secara lengkap', err);
    this.liveFeed.unshift({
      id: `storage-read-error-${Date.now()}`,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      category: 'SYSTEM',
      text: 'Peringatan: pembacaan penyimpanan lokal gagal. Data tidak ditampilkan sebagai data kosong; periksa koneksi/kapasitas penyimpanan browser dan muat ulang.',
      level: 'warning',
    });
  }

  this.notify();
}

  setCentralRepositoryDocuments(documents: DocumentItem[]): void {
    this.documents = documents;
    this.notify();
  }

  async mergeCloudOperationalRecords(entity: 'inspections' | 'hazards' | 'picas' | 'incidents', records: Array<Record<string, unknown>>): Promise<void> {
    const rows = records.filter((record) => record && typeof record.id === 'string' && record.id.trim());
    const currentUser = AuthState.getUser();
    const ownerKey = currentUser?.id
      ? `${String(currentUser.id)}::${String(currentUser.companyCode || '').trim().toUpperCase()}`
      : '';
    const activeOwnerKey = (): string => {
      const activeUser = AuthState.getUser();
      return activeUser?.id
        ? `${String(activeUser.id)}::${String(activeUser.companyCode || '').trim().toUpperCase()}`
        : '';
    };

    // A cloud response belongs to the identity that initiated it. Never use
    // another account's queue snapshot or publish stale results after a switch.
    if (!currentUser || !ownerKey || activeOwnerKey() !== ownerKey) return;
    const queueOwner = hdosSync.getOwnerSnapshot();
    const queueMatchesOwner = Boolean(
      queueOwner &&
      queueOwner.userId === String(currentUser.id) &&
      queueOwner.companyCode === String(currentUser.companyCode || '').trim().toUpperCase()
    );
    const queueEntity = {
      inspections: 'inspection',
      hazards: 'hazard',
      picas: 'pica',
      incidents: 'incident',
    }[entity];
    const pendingIds = new Set(
      (queueMatchesOwner ? hdosSync.getQueue() : [])
        .filter((item) => item.entity === queueEntity && item.status !== 'SYNCED')
        .flatMap((item) => {
          const payload = item.payload;
          if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const id = (payload as Record<string, unknown>).id;
            return typeof id === 'string' && id.trim() ? [id] : [];
          }
          return [];
        })
    );

    // A successful cloud list is the authoritative snapshot for this user's
    // visible tenant scope. Keep local writes only while they are still queued;
    // otherwise deleted cloud records would reappear forever from IndexedDB.
    const mergeSnapshot = async <T extends { id: string }>(
      storeName: 'inspection' | 'hazard' | 'pica' | 'incident',
      current: T[],
    ): Promise<T[]> => {
      const visibleLocal = current.filter((record) =>
        isLocalRecordVisible(record as unknown as Record<string, unknown>, currentUser, new Set(this.contractors.flatMap(company => [String(company.code || '').trim().toUpperCase(), String(company.parentCompanyCode || '').trim().toUpperCase()]).filter(Boolean)))
      );
      const remote = rows.filter((record) =>
        isLocalRecordVisible(record, currentUser, new Set(this.contractors.flatMap(company => [String(company.code || '').trim().toUpperCase(), String(company.parentCompanyCode || '').trim().toUpperCase()]).filter(Boolean)))
      ) as unknown as T[];
      const remoteIds = new Set(remote.map((record) => record.id));
      const merged = new Map<string, T>(remote.map((record) => [record.id, record]));

      // An unsynced local create/update must win over an older server snapshot.
      for (const local of visibleLocal) {
        if (pendingIds.has(local.id)) merged.set(local.id, local);
      }

      // Remove stale records from this tenant's local cache, but never touch
      // another tenant's cached data or any record still waiting to sync.
      for (const local of visibleLocal) {
        if (!remoteIds.has(local.id) && !pendingIds.has(local.id)) {
          await hdosDB.delete(storeName, local.id);
        }
      }

      const snapshot = [...merged.values()];
      for (const record of snapshot) await hdosDB.put(storeName, record);
      return snapshot;
    };

    let snapshot: unknown[];
    if (entity === 'inspections') {
      snapshot = await mergeSnapshot('inspection', this.inspections);
    } else if (entity === 'hazards') {
      snapshot = await mergeSnapshot('hazard', this.hazards);
    } else if (entity === 'picas') {
      snapshot = await mergeSnapshot('pica', this.picas);
    } else {
      snapshot = await mergeSnapshot('incident', this.incidents);
    }

    // IndexedDB writes above are tenant-filtered, but the in-memory store is
    // shared by the active workspace. Recheck identity immediately before publish.
    if (activeOwnerKey() !== ownerKey) return;
    if (entity === 'inspections') this.inspections = snapshot as unknown as Inspection[];
    else if (entity === 'hazards') this.hazards = snapshot as unknown as Hazard[];
    else if (entity === 'picas') this.picas = snapshot as unknown as PICA[];
    else this.incidents = snapshot as unknown as Incident[];
    this.notify();
  }

  /**
   * Reconcile the active tenant's local workspace with the central GAS database.
   * Successful cloud snapshots are authoritative; unsynced local writes are
   * protected by the queue-aware merge routine above.
   */
  async refreshCloudData(): Promise<{ refreshed: string[]; failed: string[] }> {
    const user = AuthState.getUser();
    const token = hseApi.authToken;
    if (!user?.id || !token || !hseApi.isAuthenticated) return { refreshed: [], failed: ['session'] };
    const refreshed: string[] = [];
    const failed: string[] = [];
    const ownerKey = `${user.id}::${String(user.companyCode || '').trim().toUpperCase()}`;
    const isSameSession = () => {
      const active = AuthState.getUser();
      return hseApi.authToken === token && active?.id === user.id &&
        `${active.id}::${String(active.companyCode || '').trim().toUpperCase()}` === ownerKey;
    };

    const entities = ['inspections', 'hazards', 'picas', 'incidents'] as const;
    const results = await Promise.allSettled([
      ...entities.map(entity => hseApi.listOperationalRecords(entity)),
      hseApi.listRepository(),
      hseApi.listPublishedForms(),
    ]);
    if (!isSameSession()) return { refreshed, failed: ['session-changed'] };

    for (let index = 0; index < entities.length; index += 1) {
      const result = results[index];
      if (result.status !== 'fulfilled') {
        failed.push(entities[index]);
        console.warn(`[HDOS Store] Snapshot cloud ${entities[index]} belum tersedia; cache lokal dipertahankan.`, result.reason);
        continue;
      }
      if (!isSameSession()) return { refreshed, failed: ['session-changed'] };
      await this.mergeCloudOperationalRecords(entities[index], result.value);
      refreshed.push(entities[index]);
    }

    const repositoryResult = results[4];
    if (repositoryResult.status === 'fulfilled' && isSameSession()) {
      const pendingRepositoryDeletes = new Set(
        hdosSync.getQueue()
          .filter(item => item.entity === 'repository' && item.action === 'DELETE' && item.status !== 'SYNCED')
          .map(item => {
            const payload = item.payload && typeof item.payload === 'object'
              ? item.payload as Record<string, unknown>
              : {};
            return String(payload.id || '').trim();
          })
          .filter(Boolean)
      );
      const remote = repositoryResult.value
        .filter((record): record is Record<string, unknown> & { id: string } =>
          Boolean(record && typeof record.id === 'string' && record.id.trim())
        )
        .filter(record => !pendingRepositoryDeletes.has(record.id))
        .filter(record => isLocalRecordVisible(record, user, new Set(this.contractors.flatMap(company => [String(company.code || '').trim().toUpperCase(), String(company.parentCompanyCode || '').trim().toUpperCase()]).filter(Boolean)))) as unknown as DocumentItem[];
      const remoteById = new Map(remote.map(document => [document.id, document]));
      const localOffline = this.documents.filter(document =>
        isLocalRecordVisible(document as unknown as Record<string, unknown>, user, new Set(this.contractors.flatMap(company => [String(company.code || '').trim().toUpperCase(), String(company.parentCompanyCode || '').trim().toUpperCase()]).filter(Boolean))) &&
        !remoteById.has(document.id) &&
        document.cloudStored !== true
      );
      const merged = [...remote, ...localOffline];
      for (const document of remote) await hdosDB.put('repository', document);
      const remoteIds = new Set(remote.map(document => document.id));
      for (const local of this.documents) {
        if (isLocalRecordVisible(local as unknown as Record<string, unknown>, user, new Set(this.contractors.flatMap(company => [String(company.code || '').trim().toUpperCase(), String(company.parentCompanyCode || '').trim().toUpperCase()]).filter(Boolean))) &&
            local.cloudStored === true && !remoteIds.has(local.id)) {
          await hdosDB.delete('repository', local.id);
          await hdosDB.delete('photos', `document-file-${local.id}`);
        }
      }
      if (!isSameSession()) return { refreshed, failed: ['session-changed'] };
      this.documents = merged;
      this.formDefinitions = this.formDefinitions.filter(form =>
        merged.some(document => document.id === form.sourceDocumentId)
      );
      refreshed.push('repository');
    } else if (repositoryResult.status === 'rejected') {
      failed.push('repository');
      console.warn('[HDOS Store] Repository pusat belum tersedia; cache lokal dipertahankan.', repositoryResult.reason);
    }

    const formsResult = results[5];
    if (formsResult.status === 'fulfilled' && isSameSession()) {
      const availableDocumentIds = new Set(this.documents.map(document => document.id));
      const availableForms = formsResult.value.filter(form => {
        const sourceDocumentId = String(form.sourceDocumentId || '').trim();
        return !sourceDocumentId || availableDocumentIds.has(sourceDocumentId);
      }) as unknown as FormDefinition[];
      await this.mergePublishedFormDefinitions(availableForms);
    } else if (formsResult.status === 'rejected') {
      failed.push('forms');
      console.warn('[HDOS Store] Formulir terbit pusat belum tersedia; cache lokal dipertahankan.', formsResult.reason);
    } else {
      refreshed.push('forms');
    }

    if (isSameSession()) {
      if (refreshed.length > 0) this.lastCloudRefreshAt = new Date().toISOString();
      this.cloudRefreshFailedSources = [...failed];
      this.notify();
    }
    return { refreshed, failed };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  openWindow(id: WindowId): void {
    this.maxZIndex += 1;

    // HDOS uses a single active workspace: switching modules closes the
    // previous module instead of leaving several full-screen windows stacked.
    this.windows = this.windows.map((w) =>
      w.id === id
        ? { ...w, isOpen: true, isMinimized: false, zIndex: this.maxZIndex }
        : { ...w, isOpen: false, isMinimized: false }
    );

    this.focusedWindowId = id;
    this.missionControlOpen = false;
    this.notify();
    hdosEvents.emit('window:opened', { id });
  }

  closeWindow(id: WindowId): void {
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, isOpen: false } : w));
    const openWindows = this.windows.filter((w) => w.isOpen && !w.isMinimized);
    if (openWindows.length > 0) {
      const top = openWindows.sort((a, b) => b.zIndex - a.zIndex)[0];
      this.focusedWindowId = top.id;
    }
    this.notify();
    hdosEvents.emit('window:closed', { id });
  }

  minimizeWindow(id: WindowId): void {
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, isMinimized: true } : w));
    const openWindows = this.windows.filter((w) => w.isOpen && !w.isMinimized);
    if (openWindows.length > 0) {
      const top = openWindows.sort((a, b) => b.zIndex - a.zIndex)[0];
      this.focusedWindowId = top.id;
    }
    this.notify();
  }

  toggleMaximizeWindow(id: WindowId): void {
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, isMaximized: !w.isMaximized } : w));
    this.notify();
  }

  bringToFront(id: WindowId): void {
    this.maxZIndex += 1;

    // Mission Control and window focus use the same single-active-module rule.
    this.windows = this.windows.map((w) =>
      w.id === id
        ? { ...w, isOpen: true, isMinimized: false, zIndex: this.maxZIndex }
        : { ...w, isOpen: false, isMinimized: false }
    );

    this.focusedWindowId = id;
    this.missionControlOpen = false;
    this.notify();
  }

  toggleMissionControl(): void {
    this.missionControlOpen = !this.missionControlOpen;
    this.notify();
  }

  setMobileMode(isMobile: boolean): void {
    this.isMobileMode = isMobile;
    this.notify();
  }

  async addLocation(input: Omit<MiningLocationGIS, 'id' | 'activeHazards' | 'activeInspections' | 'safetyStatus'>): Promise<MiningLocationGIS> {
    this.assertMutationAllowed('location');
    const name = String(input.name || '').trim();
    if (name.length < 2) throw new Error('Nama area minimal 2 karakter.');
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Koordinat latitude dan longitude harus berupa angka yang valid.');
    if (lat < -90 || lat > 90) throw new Error('Latitude harus berada pada rentang -90 sampai 90 derajat.');
    if (lng < -180 || lng > 180) throw new Error('Longitude harus berada pada rentang -180 sampai 180 derajat.');
    const duplicate = this.locations.some(location =>
      location.name.trim().toLocaleLowerCase('id-ID') === name.toLocaleLowerCase('id-ID') &&
      location.zoneType === input.zoneType
    );
    if (duplicate) throw new Error('Area dengan nama dan kategori yang sama sudah terdaftar.');
    const location = await hseApi.createLocation({ ...input, name, utm: String(input.utm || '').trim(), description: String(input.description || '').trim(), lat, lng, id: createEntityId() });
    await hdosDB.put('maps', location);
    this.locations = [...this.locations.filter(item => item.id !== location.id), location];
    this.notify();
    return location;
  }

  async deleteLocation(id: string): Promise<void> {
    this.assertMutationAllowed('location');
    await hseApi.deleteLocation(id);
    await hdosDB.delete('maps', id);
    this.locations = this.locations.filter((item) => item.id !== id);
    this.notify();
  }

  async setContractorsFromCompanyMaster(companies: Array<{
    code: string; name: string; role: 'Contractor' | 'Subkon'; parentCompanyCode?: string; status: string;
    passportStatus?: 'ACTIVE' | 'WARNING' | 'SUSPENDED'; picName?: string;
    picContact?: string; safetyPassportExpiry?: string;
  }>): Promise<void> {
    const mapped: ContractorPassport[] = companies.map(company => ({
      id: company.code,
      code: company.code,
      companyName: company.name,
      companyRole: company.role,
      parentCompanyCode: company.parentCompanyCode || '',
      picName: company.picName || '',
      picContact: company.picContact || '',
      manpowerCount: 0,
      equipmentCount: 0,
      kpiSafetyScore: 0,
      safeHours: 0,
      activePicaCount: 0,
      mcuCompliancePercent: 0,
      inductionRatePercent: 0,
      status: company.status === 'INACTIVE' ? 'SUSPENDED' : (company.passportStatus || 'ACTIVE'),
      safetyPassportExpiry: company.safetyPassportExpiry || '',
    }));
    this.contractors = mapped;
    for (const contractor of mapped) await hdosDB.put('contractor', contractor);
    this.notify();
  }

  async addContractor(input: Omit<ContractorPassport, 'id' | 'manpowerCount' | 'equipmentCount' | 'kpiSafetyScore' | 'safeHours' | 'activePicaCount' | 'mcuCompliancePercent' | 'inductionRatePercent'>): Promise<ContractorPassport> {
    this.assertMutationAllowed('contractor');
    const contractor: ContractorPassport = { ...input, id: createEntityId(), manpowerCount: 0, equipmentCount: 0, kpiSafetyScore: 0, safeHours: 0, activePicaCount: 0, mcuCompliancePercent: 0, inductionRatePercent: 0 };
    await hdosDB.put('contractor', contractor);
    this.contractors = [...this.contractors, contractor];
    this.notify();
    return contractor;
  }

  async deleteContractor(id: string): Promise<void> {
    this.assertMutationAllowed('contractor');
    await hdosDB.delete('contractor', id);
    this.contractors = this.contractors.filter((item) => item.id !== id);
    this.notify();
  }

  async addDocument(
  input: Omit<DocumentItem, 'id' | 'docNumber' | 'revision'> & { docNumber?: string; revision?: number }
): Promise<DocumentItem> {
   this.assertMutationAllowed('document');
  const categoryCode: Partial<Record<DocumentItem['category'], string>> = {
    SOP: 'SOP', JSA: 'JSA', WI: 'WI', IBPR: 'IBPR', Kebijakan: 'KEBIJAKAN',
    Form: 'FORM', Memo: 'MEMO', 'Work Permit': 'WP', Lainnya: 'DOC',
    Inspection: 'INS', Incident: 'INC', PICA: 'PICA', Contractor: 'CON',
  };

  const prefix = `CGG-HSE-${categoryCode[input.category] || 'DOC'}`;

  // Generate an internal fallback only when the user has not supplied the
  // official number printed on the controlled source document.
  const existingNumbers = this.documents
    .filter((doc) => doc.docNumber.startsWith(`${prefix}-`))
    .map((doc) => {
      const match = doc.docNumber.match(/-(\d+)$/);
      return match ? Number(match[1]) : 0;
    });
  const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  const generatedNumber = `${prefix}-${String(nextNumber).padStart(3, '0')}`;
  const docNumber = input.docNumber?.trim() || generatedNumber;

  const newDocument: DocumentItem = {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `doc_${crypto.randomUUID()}`
        : `doc_${Date.now()}`,
    docNumber,
    revision: 1,
    ...input,
  };

  // Offline First: persist to IndexedDB before updating the UI state.
  await hdosDB.put('repository', newDocument);

  this.documents = [newDocument, ...this.documents];

  this.notify();

  hdosEvents.emit('document:created', {
    documentId: newDocument.id,
    docNumber: newDocument.docNumber,
    title: newDocument.title,
    category: newDocument.category,
  });

  return newDocument;
}

  async updateDocument(
    documentId: string,
    updates: Partial<Omit<DocumentItem, 'id' | 'docNumber'>>
  ): Promise<DocumentItem> {
    this.assertMutationAllowed('document');
    const existing = this.documents.find((doc) => doc.id === documentId);
    if (!existing) {
      throw new Error('Dokumen tidak ditemukan.');
    }

    const updated: DocumentItem = {
      ...existing,
      ...updates,
      id: existing.id,
      docNumber: existing.docNumber,
    };

    await hdosDB.put('repository', updated);
    this.documents = this.documents.map((doc) =>
      doc.id === documentId ? updated : doc
    );
    this.notify();
    hdosEvents.emit('document:updated', {
      documentId: updated.id,
      docNumber: updated.docNumber,
      title: updated.title,
      status: updated.status,
    });
    return updated;
  }

  async deleteDocument(documentId: string): Promise<void> {
    this.assertMutationAllowed('document');
    const existing = this.documents.find((doc) => doc.id === documentId);
    if (!existing) throw new Error('Dokumen tidak ditemukan.');

    // Keep completed inspection records intact; only remove the repository entry
    // and its generated form definition. Inspection history remains available.
    const relatedForms = this.formDefinitions.filter((form) => form.sourceDocumentId === documentId);

    if (existing.cloudStored) {
      if (hseApi.baseUrl && hseApi.isAuthenticated) {
        // Online deletion is acknowledged by the central API before local metadata
        // is removed, so permission or Drive errors cannot silently hide the file.
        await hseApi.deleteRepositoryDocument(documentId);
      } else {
        // Offline deletion is durable and replayed with the same tenant session
        // when connectivity returns. The central Drive file is not discarded locally.
        await hdosSync.enqueueBatch([], [{
          action: 'DELETE',
          entity: 'repository',
          payload: { id: documentId },
          note: `Penghapusan dokumen Repository ${existing.docNumber}`,
        }]);
      }
    }

    await hdosDB.delete('repository', documentId);
    await hdosDB.delete('photos', `document-file-${documentId}`);
    for (const form of relatedForms) {
      await hdosDB.delete('form-definition', form.id);
    }

    this.documents = this.documents.filter((doc) => doc.id !== documentId);
    this.formDefinitions = this.formDefinitions.filter((form) => form.sourceDocumentId !== documentId);
    this.notify();
    hdosEvents.emit('document:deleted', {
      documentId,
      docNumber: existing.docNumber,
      title: existing.title,
    });
  }

  async addFormDefinition(
  input: Omit<FormDefinition, 'id' | 'createdAt' | 'updatedAt'>
): Promise<FormDefinition> {
  // Form definitions are generated from an already registered repository document.
  // This is not a document-control edit: operational staff need to generate/use
  // the checklist from an approved source document without receiving repository
  // upload/edit/delete privileges.
  const sourceDocument = this.documents.find((doc) => doc.id === input.sourceDocumentId);
  if (!sourceDocument) {
    throw new Error('Formulir tidak dapat dibuat karena dokumen sumber tidak ditemukan di Repository SMKP. Sinkronkan Repository lalu coba kembali.');
  }
  const now = new Date().toISOString();

  const formDefinition: FormDefinition = {
    id:
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
        ? `form_${crypto.randomUUID()}`
        : `form_${Date.now()}`,
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  await hdosDB.put('form-definition', formDefinition);

  this.formDefinitions = [
    formDefinition,
    ...this.formDefinitions,
  ];

  this.notify();

  hdosEvents.emit('form-definition:created', {
    formId: formDefinition.id,
    sourceDocumentId: formDefinition.sourceDocumentId,
    title: formDefinition.title,
  });

  return formDefinition;
}
  async updateFormDefinition(
    formId: string,
    updates: Partial<Omit<FormDefinition, 'id' | 'createdAt'>>
  ): Promise<FormDefinition> {
    this.assertMutationAllowed('document');
    const existing = this.formDefinitions.find((form) => form.id === formId);
    if (!existing) {
      throw new Error('Formulir tidak ditemukan.');
    }

    const updated: FormDefinition = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await hdosDB.put('form-definition', updated);
    this.formDefinitions = this.formDefinitions.map((form) =>
      form.id === formId ? updated : form
    );
    this.notify();
    hdosEvents.emit('form-definition:updated', {
      formId: updated.id,
      sourceDocumentId: updated.sourceDocumentId,
      title: updated.title,
      status: updated.status,
    });
    return updated;
  }

  getFormDefinitionByDocumentId(
  documentId: string
): FormDefinition | undefined {
  return this.formDefinitions.find(
    (form) => form.sourceDocumentId === documentId
  );
}

  async mergePublishedFormDefinitions(forms: FormDefinition[]): Promise<void> {
    if (!Array.isArray(forms) || forms.length === 0) return;
    const published = forms.filter((form) =>
      form && form.status === 'PUBLISHED' && Array.isArray(form.fields) && form.fields.length > 0
    );
    for (const remote of published) {
      const local = this.formDefinitions.find((form) =>
        form.id === remote.id || form.sourceDocumentId === remote.sourceDocumentId
      );
      const merged: FormDefinition = {
        ...(local || {}),
        ...remote,
        id: remote.id || local?.id || createEntityId(),
        createdAt: remote.createdAt || local?.createdAt || new Date().toISOString(),
        updatedAt: remote.updatedAt || local?.updatedAt || new Date().toISOString(),
      } as FormDefinition;
      await hdosDB.put('form-definition', merged);
      this.formDefinitions = [
        merged,
        ...this.formDefinitions.filter((form) =>
          form.id !== merged.id && form.sourceDocumentId !== merged.sourceDocumentId
        ),
      ];
    }
    this.notify();
  }

  async addInspection(inspection: Omit<Inspection, 'id' | 'code' | 'createdAt'>): Promise<Inspection> {
    this.assertMutationAllowed('inspection');
    const id = createEntityId();
    const code = `INS-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const tenantFields = getCurrentTenantFields();
    const failedItems = inspection.items.filter((item) => item.result === 'FAIL');
    const createdPicas: PICA[] = [];

    for (const failedItem of failedItems) {
      const picaId = createEntityId();
      const picaCode = `PICA-${new Date().getFullYear()}-${picaId.slice(0, 8).toUpperCase()}`;
      const picaCreated: PICA = {
        ...tenantFields, id: picaId, code: picaCode, source: 'INSPECTION',
        sourceRefCode: code,
        findingDescription: `Temuan: ${failedItem.question}${failedItem.notes ? ` — ${failedItem.notes}` : ''}`,
        correctiveAction: `Penuhi standar ${failedItem.standardRef || 'sesuai dokumen sumber'} dan verifikasi ulang sebelum pekerjaan dilanjutkan.`,
        preventiveAction: 'Evaluasi akar penyebab dan perbarui pengendalian agar ketidaksesuaian tidak berulang.',
        picDepartment: String(inspection.picaDepartment || '').trim() || 'Belum Ditentukan',
        picName: String(inspection.picaPicName || '').trim() || 'PIC Belum Ditentukan',
        assignedToEmail: String(inspection.picaPicEmail || '').trim().toLowerCase(),
        targetDate: inspection.picaTargetDate || new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        status: 'OPEN', daysAging: 0,
        approvalStages: { foreman: false, spvHse: false, ktt: false }, createdAt: now,
      };
      failedItem.picaId = picaId;
      createdPicas.push(picaCreated);
    }

    const newInspection: Inspection = {
      ...inspection, ...tenantFields, id, code, createdAt: now,
      status: failedItems.length > 0 ? 'PICA_TRIGGERED' : 'COMPLETED',
    };
    const records = [
      ...createdPicas.map(item => ({ storeName: 'pica' as const, item })),
      { storeName: 'inspection' as const, item: newInspection },
    ];
    const queueItems = [
      ...createdPicas.map(item => ({ action: 'CREATE' as const, entity: 'pica' as const, payload: item, note: `PICA otomatis dari Inspection ${code}` })),
      { action: 'CREATE' as const, entity: 'inspection' as const, payload: newInspection, note: `Inspection ${code}` },
    ];
    await hdosSync.enqueueBatch(records, queueItems);

    this.picas = [...createdPicas].reverse().concat(this.picas);
    this.inspections.unshift(newInspection);
    createdPicas.forEach(pica => hdosEvents.emit('pica:created', pica));
    this.notify();
    hdosEvents.emit('inspection:created', newInspection);
    return newInspection;
  }

  async addHazard(
    hazard: Omit<Hazard, 'id' | 'code' | 'createdAt'>
  ): Promise<Hazard> {
    this.assertMutationAllowed('hazard');
    const year = new Date().getFullYear();
    const id = createEntityId();
    const code = `HAZ-${year}-${id.slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const targetDays: Record<Hazard['riskMatrix']['level'], number> = { LOW: 30, MEDIUM: 14, HIGH: 7, CRITICAL: 1 };
    const picaTarget = new Date();
    if (hazard.riskMatrix.level === 'CRITICAL') picaTarget.setTime(picaTarget.getTime() + 86400000);
    else picaTarget.setDate(picaTarget.getDate() + targetDays[hazard.riskMatrix.level]);
    const picaId = createEntityId();
    const picaCode = `PICA-${year}-${picaId.slice(0, 8).toUpperCase()}`;
    const tenantFields = getCurrentTenantFields();
    const picaCreated: PICA = {
      ...tenantFields, id: picaId, code: picaCode, source: 'HAZARD', sourceRefCode: code,
      findingDescription: `Temuan Hazard ${hazard.riskMatrix.level}: ${hazard.title}`,
      correctiveAction: hazard.actionTaken?.trim() ? hazard.actionTaken : 'Laksanakan tindakan pengendalian sesuai hasil penilaian risiko dan pastikan kondisi aman.',
      preventiveAction: 'Lakukan evaluasi penyebab, verifikasi efektivitas pengendalian, dan cegah terulangnya kondisi serupa.',
      picDepartment: 'Operations', picName: 'PIC Belum Ditentukan',
      targetDate: picaTarget.toISOString().split('T')[0], status: 'OPEN', daysAging: 0,
      approvalStages: { foreman: false, spvHse: false, ktt: false }, createdAt: now,
    };
    const newHazard: Hazard = {
      ...hazard, ...tenantFields, id, code, createdAt: now, picaId, status: 'PICA_ISSUED',
    };
    await hdosSync.enqueueBatch(
      [{ storeName: 'pica', item: picaCreated }, { storeName: 'hazard', item: newHazard }],
      [
        { action: 'CREATE', entity: 'pica', payload: picaCreated, note: `PICA otomatis dari Hazard ${code}` },
        { action: 'CREATE', entity: 'hazard', payload: newHazard, note: `Hazard ${code}` },
      ]
    );

    this.picas.unshift(picaCreated);
    this.hazards.unshift(newHazard);
    const loc = this.locations.find((l) => l.name === hazard.location);
    if (loc) {
      loc.activeHazards += 1;
      if (hazard.riskMatrix.level === 'CRITICAL') loc.safetyStatus = 'ALERT';
      else if (hazard.riskMatrix.level === 'HIGH' && loc.safetyStatus === 'SAFE') loc.safetyStatus = 'WARNING';
    }
    this.notify();
    hdosEvents.emit('pica:created', picaCreated);
    hdosEvents.emit('hazard:created', newHazard);
    return newHazard;
  }
  async addIncident(incident: Omit<Incident, 'id' | 'code' | 'createdAt'>): Promise<Incident> {
    this.assertMutationAllowed('incident');
    const id = createEntityId();
    const code = `INC-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newInc: Incident = { ...incident, ...getCurrentTenantFields(), id, code, createdAt: now };

    await hdosSync.enqueueBatch(
      [{ storeName: 'incident', item: newInc }],
      [{ action: 'CREATE', entity: 'incident', payload: newInc, note: `Incident ${code}` }]
    );
    this.incidents.unshift(newInc);
    this.notify();
    hdosEvents.emit('incident:created', newInc);
    return newInc;
  }

  async updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | null> {
    this.assertMutationAllowed('incident');
    const index = this.incidents.findIndex(incident => incident.id === id);
    if (index < 0) return null;

    const current = this.incidents[index];
    if (current.status === 'CLOSED') throw new Error('Insiden yang sudah ditutup tidak dapat diubah.');
    const user = AuthState.getUser();
    const roles = user?.roles || [];
    const isAdminCGG = roles.includes('Admin CGG');
    const isVerified = user?.roleVerified === true;
    const isInvestigator = isVerified && roles.some(role => ['Foreman Safety', 'SPV HSE'].includes(role));
    const isReviewer = isVerified && roles.some(role => ['KTT', 'SPT', 'SPV'].includes(role));
    const nextStatus = updates.status || current.status;

    if (updates.status === 'REVIEWED_KTT') {
      if (!isAdminCGG && !isReviewer) throw new Error('Review insiden hanya dapat dilakukan KTT/SPT/SPV yang telah diverifikasi.');
      if (current.status !== 'INVESTIGATING') throw new Error('Insiden harus dalam status Investigating sebelum direview.');
      const whys = updates.fiveWhyAnalysis || current.fiveWhyAnalysis;
      const rootCause = updates.rootCause ?? current.rootCause;
      const actions = updates.correctiveActions || current.correctiveActions;
      if (whys.filter(item => String(item || '').trim()).length < 5 || !String(rootCause || '').trim() || !actions.some(item => String(item || '').trim())) {
        throw new Error('Review memerlukan lima tahapan Why, akar penyebab, dan tindakan koreksi yang lengkap.');
      }
    } else if (updates.status === 'CLOSED') {
      if (!isAdminCGG && !(isVerified && roles.includes('KTT'))) throw new Error('Penutupan insiden hanya dapat dilakukan KTT terverifikasi atau Admin CGG.');
      if (current.status !== 'REVIEWED_KTT') throw new Error('Insiden harus direview terlebih dahulu sebelum ditutup.');
    } else {
      if (!isAdminCGG && !isInvestigator) throw new Error('Pembaruan investigasi hanya dapat dilakukan Foreman Safety atau SPV HSE terverifikasi.');
      if (current.status !== 'INVESTIGATING' || nextStatus !== 'INVESTIGATING') throw new Error('Data investigasi hanya dapat diperbarui selama status Investigating.');
      const allowedKeys = ['fiveWhyAnalysis', 'rootCause', 'correctiveActions', 'timeline'];
      if (Object.keys(updates).some(key => !allowedKeys.includes(key))) throw new Error('Field yang dikirim tidak diizinkan untuk pembaruan investigasi.');
    }

    const persistedIncidents = await hdosDB.getAll<Incident>('incident');
    const persistedVersion = persistedIncidents.find(incident => incident.id === id)?.updatedAt;
    const serverPayload: Incident = { ...current, ...updates, updatedAt: persistedVersion || current.updatedAt };
    const updated: Incident = { ...serverPayload };
    if (updates.status === 'REVIEWED_KTT') {
      updated.reviewedBy = user?.displayName || user?.email || 'Reviewer';
      updated.reviewedAt = new Date().toISOString();
    }
    if (updates.status === 'CLOSED') {
      updated.closedBy = user?.displayName || user?.email || 'KTT';
      updated.closedAt = new Date().toISOString();
    }
    await hdosSync.enqueueBatch(
      [{ storeName: 'incident', item: updated }],
      [{ action: 'UPDATE', entity: 'incident', payload: serverPayload, note: `Pembaruan investigasi insiden ${updated.code}` }]
    );
    this.incidents[index] = updated;
    this.notify();
    hdosEvents.emit('incident:updated', updated);
    return updated;
  }

  async updatePICAStatus(id: string, updates: Partial<PICA>): Promise<PICA | null> {
    this.assertMutationAllowed('pica', updates);
    const index = this.picas.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const current = this.picas[index];
    if (current.status === 'CLOSED') throw new Error('PICA sudah ditutup dan tidak dapat diubah.');
    const sessionUser = AuthState.getUser();
    const role = hdosAuth.getCurrentRole();
    const email = String(sessionUser?.email || '').trim().toLowerCase();
    const isAssignedPIC = Boolean(current.assignedToEmail && current.assignedToEmail.toLowerCase() === email);
    const isHSEValidator = sessionUser?.roleVerified === true && (sessionUser.roles || []).some((assignedRole) => ['Foreman Safety', 'SPV HSE'].includes(assignedRole));
    const persistedPicas = await hdosDB.getAll<PICA>('pica');
    const persistedVersion = persistedPicas.find(pica => pica.id === id)?.updatedAt;
    const updated: PICA = { ...current, ...updates, updatedAt: persistedVersion || current.updatedAt, approvalStages: current.approvalStages || { foreman: false, spvHse: false, ktt: false } };

    if (updates.status === 'WAITING_HSE') {
      if (!isAssignedPIC) throw new Error('Hanya PIC yang ditugaskan dapat mengajukan penutupan PICA.');
      if (!String(updates.correctiveAction || current.correctiveAction || '').trim()) throw new Error('Tindakan perbaikan wajib diisi.');
      if (!String(updates.evidencePhotoUrl || current.evidencePhotoUrl || '').trim() || !String(updates.evidencePhotoFileId || current.evidencePhotoFileId || '').trim()) throw new Error('Foto bukti penyelesaian wajib diunggah ke Google Drive.');
      updated.status = 'WAITING_HSE';
      updated.submittedAt = new Date().toISOString();
      updated.closeRequestedAt = updated.submittedAt;
      updated.rejectionReason = '';
    } else if (updates.status === 'CLOSED') {
      if (!isHSEValidator) throw new Error('Penutupan PICA hanya dapat divalidasi Foreman Safety atau SPV HSE.');
      if (current.status !== 'WAITING_HSE') throw new Error('PICA belum diajukan PIC untuk validasi HSE.');
      updated.status = 'CLOSED';
      updated.completionDate = new Date().toISOString().split('T')[0];
      updated.hseValidatedBy = sessionUser?.displayName || email;
      updated.hseValidatedRole = role;
      updated.hseValidatedAt = new Date().toISOString();
    } else if (updates.status === 'PROGRESS') {
      if (current.status === 'WAITING_HSE') {
        if (!isHSEValidator) throw new Error('Hanya HSE yang dapat mengembalikan pengajuan PICA kepada PIC.');
        if (!String(updates.rejectionReason || '').trim()) throw new Error('Alasan pengembalian wajib diisi.');
      } else if (!isAssignedPIC || !['OPEN', 'PROGRESS'].includes(current.status)) {
        throw new Error('Perubahan status hanya dapat dilakukan PIC yang ditugaskan.');
      }
      updated.status = 'PROGRESS';
    } else if (updates.status && updates.status !== current.status) {
      throw new Error('Status PICA tidak valid.');
    }

    await hdosSync.enqueueBatch(
      [{ storeName: 'pica', item: updated }],
      [{ action: 'UPDATE', entity: 'pica', payload: updated, note: `Tindak lanjut PICA ${updated.code}` }]
    );
    this.picas[index] = updated;
    this.notify();
    hdosEvents.emit('pica:updated', updated);
    return updated;
  }}

export const hdosStore = new HDOSCentralStore();

export function useHDOSStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return hdosStore.subscribe(() => setTick((t) => t + 1));
  }, []);

  return hdosStore;
}
