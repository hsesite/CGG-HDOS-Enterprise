import type {
  Inspection,
  Hazard,
  PICA,
  Incident,
  DocumentItem,
  ContractorPassport,
  MiningLocationGIS,
  AppWindow,
  WindowId,
  ImportedInspectionTemplate,
  PhotoEvidence,
  DraftPhotoEvidence,
  EvidenceOwnerEntity,
} from './types';
import { hdosDB } from './db';
import { hdosEvents } from './events';
import { hdosSync } from './sync';
import { hdosAuth } from './auth';
import { useState, useEffect } from 'react';

// Seed Data
const INITIAL_LOCATIONS: MiningLocationGIS[] = [
  {
    id: 'loc_pit_jaja',
    name: 'Pit Jaja KM10',
    utm: '51S 382900 mE 9672100 mN',
    lat: -2.9642,
    lng: 121.9421,
    description: 'Area penambangan utama pit timur',
    activeHazards: 0,
    activeInspections: 0,
    safetyStatus: 'SAFE',
    zoneType: 'PIT',
  },
  {
    id: 'loc_siumbatu',
    name: 'Siumbatu',
    utm: '51S 391200 mE 9680400 mN',
    lat: -2.8891,
    lng: 122.0165,
    description: 'Pelabuhan jetty pemuatan ore nikel',
    activeHazards: 0,
    activeInspections: 0,
    safetyStatus: 'SAFE',
    zoneType: 'PORT',
  },
  {
    id: 'loc_workshop',
    name: 'Workshop',
    utm: '51S 385100 mE 9674800 mN',
    lat: -2.9395,
    lng: 121.9618,
    description: 'Central Maintenance Workshop',
    activeHazards: 0,
    activeInspections: 0,
    safetyStatus: 'SAFE',
    zoneType: 'FACILITY',
  },
];

const INITIAL_CONTRACTORS: ContractorPassport[] = [
  {
    id: 'cont_sls',
    code: 'SLS',
    companyName: 'PT Sumber Logistik Sejahtera',
    picName: 'Hendrik Wijaya',
    picContact: '+62 811-4456-7890',
    manpowerCount: 142,
    equipmentCount: 38,
    kpiSafetyScore: 94.5,
    safeHours: 418200,
    activePicaCount: 0,
    mcuCompliancePercent: 98.2,
    inductionRatePercent: 100,
    status: 'ACTIVE',
    safetyPassportExpiry: '2027-12-31',
  },
];

const INITIAL_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc_1',
    docNumber: 'CGG-HSE-SOP-001',
    title: 'Standar Operasional Prosedur Pengelolaan Keselamatan',
    category: 'SOP',
    revision: 3,
    owner: 'SPV HSE',
    status: 'EFFECTIVE',
    effectiveDate: '2026-01-10',
    fileType: 'PDF',
    size: '2.4 MB',
    downloadCount: 184,
    smkpElement: 'Elemen I: Kebijakan Keselamatan',
    summary: 'Pedoman implementasi SMKP',
  },
];

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
];

export class HDOSCentralStore {
  public inspections: Inspection[] = [];
  public hazards: Hazard[] = [];
  public incidents: Incident[] = [];
  public picas: PICA[] = [];
  public documents: DocumentItem[] = INITIAL_DOCUMENTS;
  public contractors: ContractorPassport[] = INITIAL_CONTRACTORS;
  public importedInspectionTemplates: ImportedInspectionTemplate[] = [];
  public photoEvidence: PhotoEvidence[] = [];
  public locations: MiningLocationGIS[] = INITIAL_LOCATIONS;
  public windows: AppWindow[] = INITIAL_WINDOWS;
  public focusedWindowId: WindowId = 'dashboard';
  public isMobileMode: boolean = false;
  public missionControlOpen: boolean = false;
  public safeHours: number = 1482920;
  public weather = {
    temp: 32,
    humidity: 74,
    wbgt: 29.4,
    heatStressLevel: 'MODERATE' as 'NORMAL' | 'MODERATE' | 'HIGH' | 'EXTREME',
    rainMm: 0,
    pitStatus: 'OPERATIONAL' as 'OPERATIONAL' | 'STANDBY_RAIN' | 'RESTRICTED',
  };
  public liveFeed: Array<{ id: string; time: string; category: string; text: string; level: string }> = [];
  public isInitializing: boolean = false;
  public isInitialized: boolean = false;
  public lastInitError: string | null = null;
  public isRemoteHydrating: boolean = false;
  public lastRemoteHydratedAt: string | null = null;
  public lastRemoteHydrationError: string | null = null;

  private listeners: Set<() => void> = new Set();
  private maxZIndex: number = 20;

  private async loadImportedTemplates(): Promise<void> {
    const configItems = await hdosDB.getAll<{ id: string; templates?: ImportedInspectionTemplate[] }>('config');
    const stored = configItems.find((item) => item.id === 'inspection_templates');
    this.importedInspectionTemplates = stored?.templates ?? [];
  }

  private async saveImportedTemplates(): Promise<void> {
    await hdosDB.put('config', {
      id: 'inspection_templates',
      templates: this.importedInspectionTemplates,
    });
  }

  async init(): Promise<void> {
    this.isInitializing = true;
    this.lastInitError = null;
    this.notify();

    try {
      const storedIns = await hdosDB.getAll<Inspection>('inspection');
      this.inspections = storedIns;

      const storedHaz = await hdosDB.getAll<Hazard>('hazard');
      this.hazards = storedHaz;

      const storedPicas = await hdosDB.getAll<PICA>('pica');
      this.picas = storedPicas;

      const storedInc = await hdosDB.getAll<Incident>('incident');
      this.incidents = storedInc;

      const storedDocs = await hdosDB.getAll<DocumentItem>('repository');
      if (storedDocs.length > 0) {
        this.documents = storedDocs;
      }

      const storedContractors = await hdosDB.getAll<ContractorPassport>('contractor');
      if (storedContractors.length > 0) {
        this.contractors = storedContractors;
      }

      const storedPhotoEvidence = await hdosDB.getAll<PhotoEvidence>('photos');
      this.photoEvidence = storedPhotoEvidence.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      await this.loadImportedTemplates();
    } catch (err) {
      console.warn('[HDOS Store] IndexedDB fallback', err);
      this.lastInitError = err instanceof Error ? err.message : 'Gagal memuat data lokal';
    } finally {
      this.isInitializing = false;
      this.isInitialized = true;
    }

    this.notify();
    hdosEvents.emit('store:initialized', {
      inspections: this.inspections.length,
      hazards: this.hazards.length,
      incidents: this.incidents.length,
      picas: this.picas.length,
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private getPendingIds(entity: 'inspection' | 'hazard' | 'incident' | 'pica' | 'repository' | 'contractor'): Set<string> {
    return new Set(
      hdosSync
        .getQueue()
        .filter((item) => item.entity === entity)
        .map((item) => String((item.payload as { id?: string } | null)?.id ?? ''))
        .filter(Boolean),
    );
  }

  private mergeRemoteRecords<T extends { id: string }>(
    localRecords: T[],
    remoteRecords: T[],
    entity: 'inspection' | 'hazard' | 'incident' | 'pica' | 'repository' | 'contractor',
  ): T[] {
    const merged = new Map<string, T>();
    const pendingIds = this.getPendingIds(entity);

    remoteRecords.forEach((record) => merged.set(record.id, record));

    localRecords.forEach((record) => {
      if (!merged.has(record.id) || pendingIds.has(record.id)) {
        merged.set(record.id, record);
      }
    });

    return Array.from(merged.values()).sort((a, b) => {
      const left = String((b as { createdAt?: string }).createdAt ?? '');
      const right = String((a as { createdAt?: string }).createdAt ?? '');
      return left.localeCompare(right);
    });
  }

  private async replaceStoreRecords<T extends { id: string }>(storeName: 'inspection' | 'hazard' | 'incident' | 'pica' | 'repository' | 'contractor', records: T[]): Promise<void> {
    await hdosDB.clear(storeName);
    for (const record of records) {
      await hdosDB.put(storeName, record);
    }
  }

  private async enqueueSync(
    entity: 'inspection' | 'hazard' | 'incident' | 'pica' | 'repository' | 'contractor',
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: unknown,
    note?: string,
  ): Promise<void> {
    await hdosSync.enqueue({
      entity,
      action,
      payload,
      note,
    });
  }

  openWindow(id: WindowId): void {
    this.maxZIndex += 1;
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, isOpen: true, isMinimized: false, zIndex: this.maxZIndex } : w));
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
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, isMinimized: false, zIndex: this.maxZIndex } : w));
    this.focusedWindowId = id;
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

  beginRemoteHydration(): void {
    this.isRemoteHydrating = true;
    this.lastRemoteHydrationError = null;
    this.notify();
    hdosEvents.emit('store:remote_hydration_started');
  }

  completeRemoteHydration(summary?: Record<string, unknown>): void {
    this.isRemoteHydrating = false;
    this.lastRemoteHydratedAt = new Date().toISOString();
    this.lastRemoteHydrationError = null;
    this.notify();
    hdosEvents.emit('store:remote_hydration_finished', summary);
  }

  failRemoteHydration(message: string): void {
    this.isRemoteHydrating = false;
    this.lastRemoteHydrationError = message;
    this.notify();
    hdosEvents.emit('store:remote_hydration_failed', { message });
  }

  async addInspection(inspection: Omit<Inspection, 'id' | 'code' | 'createdAt'>): Promise<Inspection> {
    const count = this.inspections.length + 1;
    const code = `INS-2026-${String(count).padStart(3, '0')}`;
    const id = `ins_${Date.now()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const failedItems = inspection.items.filter((item) => item.result === 'FAIL');
    let picaCreated: PICA | null = null;

    if (failedItems.length > 0) {
      const picaCount = this.picas.length + 1;
      const picaCode = `PICA-2026-${String(picaCount).padStart(3, '0')}`;
      const firstFail = failedItems[0];

      picaCreated = {
        id: `pica_${Date.now()}`,
        code: picaCode,
        source: 'INSPECTION',
        sourceRefCode: code,
        findingDescription: `Temuan: ${firstFail.question}`,
        correctiveAction: `Penuhi standar ${firstFail.standardRef}`,
        preventiveAction: 'Re-evaluasi kepatuhan prosedur',
        picDepartment: 'Operations',
        picName: 'PIC Terkait',
        targetDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        status: 'OPEN',
        daysAging: 0,
        approvalStages: { foreman: false, spvHse: false, ktt: false },
        createdAt: now,
      };

      firstFail.picaId = picaCreated.id;
      this.picas.unshift(picaCreated);
      await hdosDB.put('pica', picaCreated);
      await this.enqueueSync('pica', 'CREATE', picaCreated, `PICA otomatis dari inspeksi ${code}`);
      hdosEvents.emit('pica:created', picaCreated);
    }

    const newInspection: Inspection = {
      ...inspection,
      id,
      code,
      createdAt: now,
      status: failedItems.length > 0 ? 'PICA_TRIGGERED' : 'COMPLETED',
    };

    this.inspections.unshift(newInspection);
    await hdosDB.put('inspection', newInspection);

    const location = this.locations.find((item) => item.name === newInspection.location);
    if (location) {
      location.activeInspections += 1;
      if (newInspection.status === 'PICA_TRIGGERED') {
        location.safetyStatus = 'WARNING';
      }
    }

    await this.enqueueSync('inspection', 'CREATE', newInspection, `Inspeksi ${code} tersimpan lokal`);
    this.notify();
    hdosEvents.emit('inspection:created', newInspection);
    return newInspection;
  }

  async addHazard(hazard: Omit<Hazard, 'id' | 'code' | 'createdAt'>): Promise<Hazard> {
    const count = this.hazards.length + 1;
    const code = `HAZ-2026-${String(count).padStart(3, '0')}`;
    const id = `haz_${Date.now()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    let picaId: string | undefined = undefined;

    if (hazard.riskMatrix.level === 'CRITICAL' || hazard.riskMatrix.level === 'HIGH') {
      const picaCount = this.picas.length + 1;
      const picaCode = `PICA-2026-${String(picaCount).padStart(3, '0')}`;
      const picaCreated: PICA = {
        id: `pica_${Date.now()}`,
        code: picaCode,
        source: 'HAZARD',
        sourceRefCode: code,
        findingDescription: `Bahaya ${hazard.riskMatrix.level}: ${hazard.title}`,
        correctiveAction: hazard.actionTaken || 'Mitigasi langsung',
        preventiveAction: 'Sosialisasi JSA',
        picDepartment: 'Operations',
        picName: hazard.reporter,
        targetDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
        status: 'OPEN',
        daysAging: 0,
        approvalStages: { foreman: false, spvHse: false, ktt: false },
        createdAt: now,
      };
      picaId = picaCreated.id;
      this.picas.unshift(picaCreated);
      await hdosDB.put('pica', picaCreated);
      await this.enqueueSync('pica', 'CREATE', picaCreated, `PICA otomatis dari hazard ${code}`);
      hdosEvents.emit('pica:created', picaCreated);
    }

    const newHazard: Hazard = {
      ...hazard,
      id,
      code,
      createdAt: now,
      picaId,
      status: picaId ? 'PICA_ISSUED' : 'OPEN',
    };

    this.hazards.unshift(newHazard);
    await hdosDB.put('hazard', newHazard);
    await this.enqueueSync('hazard', 'CREATE', newHazard, `Hazard ${code} tersimpan lokal`);

    const loc = this.locations.find((l) => l.name === hazard.location);
    if (loc) {
      loc.activeHazards += 1;
      if (hazard.riskMatrix.level === 'CRITICAL') loc.safetyStatus = 'ALERT';
    }

    this.notify();
    hdosEvents.emit('hazard:created', newHazard);
    return newHazard;
  }

  async addIncident(incident: Omit<Incident, 'id' | 'code' | 'createdAt'>): Promise<Incident> {
    const count = this.incidents.length + 1;
    const code = `INC-2026-${String(count).padStart(3, '0')}`;
    const id = `inc_${Date.now()}`;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const newInc: Incident = { ...incident, id, code, createdAt: now };

    this.incidents.unshift(newInc);
    await hdosDB.put('incident', newInc);
    await this.enqueueSync('incident', 'CREATE', newInc, `Insiden ${code} tersimpan lokal`);
    this.notify();
    hdosEvents.emit('incident:created', newInc);
    return newInc;
  }

  async updateHazard(id: string, updates: Partial<Hazard>): Promise<Hazard | null> {
    const index = this.hazards.findIndex((hazard) => hazard.id === id);
    if (index === -1) return null;

    const updated: Hazard = {
      ...this.hazards[index],
      ...updates,
      riskMatrix: updates.riskMatrix ? { ...this.hazards[index].riskMatrix, ...updates.riskMatrix } : this.hazards[index].riskMatrix,
    };

    this.hazards[index] = updated;
    await hdosDB.put('hazard', updated);
    await this.enqueueSync('hazard', 'UPDATE', updated, `Hazard ${updated.code} diperbarui`);
    this.notify();
    hdosEvents.emit('hazard:updated', updated);
    return updated;
  }

  async updatePICAStatus(id: string, updates: Partial<PICA>): Promise<PICA | null> {
    const index = this.picas.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const current = this.picas[index];
    const updated: PICA = {
      ...current,
      ...updates,
      approvalStages: {
        ...current.approvalStages,
        ...(updates.approvalStages ?? {}),
      },
    };

    const msUntilTarget = new Date(updated.targetDate).getTime() - Date.now();
    updated.daysAging = Math.max(0, Math.ceil(Math.abs(msUntilTarget) / 86400000));
    if (updated.status !== 'CLOSED' && msUntilTarget < 0) {
      updated.status = 'OVERDUE';
    }

    if (updated.approvalStages.foreman && updated.approvalStages.spvHse && updated.approvalStages.ktt) {
      updated.status = 'CLOSED';
      updated.completionDate = new Date().toISOString().split('T')[0];
    }

    this.picas[index] = updated;
    await hdosDB.put('pica', updated);

    const linkedHazardIndex = this.hazards.findIndex((hazard) => hazard.picaId === updated.id);
    if (linkedHazardIndex >= 0 && updated.status === 'CLOSED') {
      const linkedHazard = { ...this.hazards[linkedHazardIndex], status: 'CLOSED' as const };
      this.hazards[linkedHazardIndex] = linkedHazard;
      await hdosDB.put('hazard', linkedHazard);
      await this.enqueueSync('hazard', 'UPDATE', linkedHazard, `Hazard ${linkedHazard.code} ditutup dari PICA`);
      hdosEvents.emit('hazard:updated', linkedHazard);
    }

    await this.enqueueSync('pica', 'UPDATE', updated, `PICA ${updated.code} diperbarui`);
    this.notify();
    hdosEvents.emit('pica:updated', updated);
    return updated;
  }

  async updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | null> {
    const index = this.incidents.findIndex((incident) => incident.id === id);
    if (index === -1) return null;

    const updated: Incident = {
      ...this.incidents[index],
      ...updates,
      timeline: updates.timeline ?? this.incidents[index].timeline,
      fiveWhyAnalysis: updates.fiveWhyAnalysis ?? this.incidents[index].fiveWhyAnalysis,
      correctiveActions: updates.correctiveActions ?? this.incidents[index].correctiveActions,
    };

    this.incidents[index] = updated;
    await hdosDB.put('incident', updated);
    await this.enqueueSync('incident', 'UPDATE', updated, `Insiden ${updated.code} diperbarui`);
    this.notify();
    hdosEvents.emit('incident:updated', updated);
    return updated;
  }

  getPhotoEvidence(ownerEntity: EvidenceOwnerEntity, ownerId: string): PhotoEvidence[] {
    return this.photoEvidence.filter((item) => item.ownerEntity === ownerEntity && item.ownerId === ownerId);
  }

  countPhotoEvidence(ownerEntity: EvidenceOwnerEntity, ownerId: string): number {
    return this.getPhotoEvidence(ownerEntity, ownerId).length;
  }

  async attachPhotoEvidence(
    ownerEntity: EvidenceOwnerEntity,
    ownerId: string,
    evidenceItems: DraftPhotoEvidence[],
    createdBy: string,
  ): Promise<PhotoEvidence[]> {
    if (evidenceItems.length === 0) return [];

    const now = new Date().toISOString();
    const storedItems = evidenceItems.map<PhotoEvidence>((item, index) => ({
      ...item,
      id: `photo_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      ownerEntity,
      ownerId,
      createdAt: now,
      createdBy,
      syncStatus: 'LOCAL_ONLY',
    }));

    for (const item of storedItems) {
      await hdosDB.put('photos', item);
    }

    this.photoEvidence = [...storedItems, ...this.photoEvidence].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    this.notify();
    hdosEvents.emit('photo:evidence_added', {
      ownerEntity,
      ownerId,
      count: storedItems.length,
    });
    return storedItems;
  }

  async addDocument(document: Omit<DocumentItem, 'id' | 'docNumber' | 'revision'>): Promise<DocumentItem> {
    const count = this.documents.filter((item) => item.category === document.category).length + 1;
    const categoryCode = document.category.toUpperCase();
    const newDocument: DocumentItem = {
      ...document,
      id: `doc_${Date.now()}`,
      docNumber: `CGG-HSE-${categoryCode}-${String(count).padStart(3, '0')}`,
      revision: 1,
    };

    this.documents = [newDocument, ...this.documents];
    await hdosDB.put('repository', newDocument);
    await this.enqueueSync('repository', 'CREATE', newDocument, `Dokumen ${newDocument.docNumber} tersimpan lokal`);
    this.notify();
    hdosEvents.emit('repository:created', newDocument);
    return newDocument;
  }

  async updateDocument(id: string, updates: Partial<DocumentItem>): Promise<DocumentItem | null> {
    const index = this.documents.findIndex((document) => document.id === id);
    if (index === -1) return null;

    const updated: DocumentItem = {
      ...this.documents[index],
      ...updates,
    };

    this.documents[index] = updated;
    await hdosDB.put('repository', updated);
    await this.enqueueSync('repository', 'UPDATE', updated, `Dokumen ${updated.docNumber} diperbarui lokal`);
    this.notify();
    hdosEvents.emit('repository:updated', updated);
    return updated;
  }

  async addContractor(contractor: Omit<ContractorPassport, 'id'>): Promise<ContractorPassport> {
    const newContractor: ContractorPassport = {
      ...contractor,
      id: `contractor_${Date.now()}`,
    };

    this.contractors = [newContractor, ...this.contractors];
    await hdosDB.put('contractor', newContractor);
    await this.enqueueSync('contractor', 'CREATE', newContractor, `Kontraktor ${newContractor.code} tersimpan lokal`);
    this.notify();
    hdosEvents.emit('contractor:created', newContractor);
    return newContractor;
  }

  async updateContractor(id: string, updates: Partial<ContractorPassport>): Promise<ContractorPassport | null> {
    const index = this.contractors.findIndex((contractor) => contractor.id === id);
    if (index === -1) return null;

    const updated: ContractorPassport = {
      ...this.contractors[index],
      ...updates,
    };

    this.contractors[index] = updated;
    await hdosDB.put('contractor', updated);
    await this.enqueueSync('contractor', 'UPDATE', updated, `Kontraktor ${updated.code} diperbarui lokal`);
    this.notify();
    hdosEvents.emit('contractor:updated', updated);
    return updated;
  }

  async importInspectionTemplate(template: Omit<ImportedInspectionTemplate, 'id' | 'createdAt'>): Promise<ImportedInspectionTemplate> {
    const importedTemplate: ImportedInspectionTemplate = {
      ...template,
      id: `tmpl_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    this.importedInspectionTemplates = [importedTemplate, ...this.importedInspectionTemplates];
    await this.saveImportedTemplates();
    this.notify();
    hdosEvents.emit('inspection_template:imported', importedTemplate);
    return importedTemplate;
  }

  async hydrateRemoteData(data: {
    inspections?: Inspection[];
    hazards?: Hazard[];
    picas?: PICA[];
    incidents?: Incident[];
    documents?: DocumentItem[];
    contractors?: ContractorPassport[];
  }): Promise<void> {
    const nextInspections = data.inspections ? this.mergeRemoteRecords(this.inspections, data.inspections, 'inspection') : this.inspections;
    const nextHazards = data.hazards ? this.mergeRemoteRecords(this.hazards, data.hazards, 'hazard') : this.hazards;
    const nextPicas = data.picas ? this.mergeRemoteRecords(this.picas, data.picas, 'pica') : this.picas;
    const nextIncidents = data.incidents ? this.mergeRemoteRecords(this.incidents, data.incidents, 'incident') : this.incidents;
    const nextDocuments = data.documents ? this.mergeRemoteRecords(this.documents, data.documents, 'repository') : this.documents;
    const nextContractors = data.contractors ? this.mergeRemoteRecords(this.contractors, data.contractors, 'contractor') : this.contractors;

    this.inspections = nextInspections;
    this.hazards = nextHazards;
    this.picas = nextPicas;
    this.incidents = nextIncidents;
    this.documents = nextDocuments;
    this.contractors = nextContractors;

    await this.replaceStoreRecords('inspection', nextInspections);
    await this.replaceStoreRecords('hazard', nextHazards);
    await this.replaceStoreRecords('pica', nextPicas);
    await this.replaceStoreRecords('incident', nextIncidents);
    await this.replaceStoreRecords('repository', nextDocuments);
    await this.replaceStoreRecords('contractor', nextContractors);

    this.notify();
    hdosEvents.emit('store:remote_hydrated', {
      inspections: nextInspections.length,
      hazards: nextHazards.length,
      picas: nextPicas.length,
      incidents: nextIncidents.length,
      documents: nextDocuments.length,
      contractors: nextContractors.length,
    });
  }
}

export const hdosStore = new HDOSCentralStore();

export function useHDOSStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return hdosStore.subscribe(() => setTick((t) => t + 1));
  }, []);

  return hdosStore;
}
