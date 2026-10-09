import type { Inspection, Hazard, PICA, Incident, DocumentItem, ContractorPassport, MiningLocationGIS, AppWindow, WindowId, FormDefinition } from './types';
import { hdosDB } from './db';
import { hdosEvents } from './events';
import { hdosSync } from './sync';
import { hdosAuth } from './auth';
import { useState, useEffect } from 'react';

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

  private listeners: Set<() => void> = new Set();
  private maxZIndex: number = 20;

  async init(): Promise<void> {
  try {
    // One-time cleanup of legacy demo records from this browser. The owner requested a clean start.
    const cleanupKey = 'cgg_hdos_empty_start_v1';
    if (localStorage.getItem(cleanupKey) !== 'done') {
      for (const storeName of ['queue','repository','form-definition','inspection','inspection-draft','hazard','incident','pica','contractor','maps','photos','ai-cache','systemlog'] as const) {
        const records = await hdosDB.getAll<{ id: string }>(storeName);
        for (const record of records) await hdosDB.delete(storeName, record.id);
      }
      for (const key of ['cgg_hdos_location_master','cgg_hdos_contractor_master','cgg_hdos_safe_hours','cgg_hdos_weather']) localStorage.removeItem(key);
      localStorage.setItem(cleanupKey, 'done');
    }
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
  } catch (err) {
    console.warn('[HDOS Store] IndexedDB fallback', err);
  }

  this.notify();
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
    const location: MiningLocationGIS = { ...input, id: createEntityId(), activeHazards: 0, activeInspections: 0, safetyStatus: 'SAFE' };
    await hdosDB.put('maps', location);
    this.locations = [...this.locations, location];
    this.notify();
    return location;
  }

  async deleteLocation(id: string): Promise<void> {
    await hdosDB.delete('maps', id);
    this.locations = this.locations.filter((item) => item.id !== id);
    this.notify();
  }

  async addContractor(input: Omit<ContractorPassport, 'id' | 'manpowerCount' | 'equipmentCount' | 'kpiSafetyScore' | 'safeHours' | 'activePicaCount' | 'mcuCompliancePercent' | 'inductionRatePercent'>): Promise<ContractorPassport> {
    const contractor: ContractorPassport = { ...input, id: createEntityId(), manpowerCount: 0, equipmentCount: 0, kpiSafetyScore: 0, safeHours: 0, activePicaCount: 0, mcuCompliancePercent: 0, inductionRatePercent: 0 };
    await hdosDB.put('contractor', contractor);
    this.contractors = [...this.contractors, contractor];
    this.notify();
    return contractor;
  }

  async deleteContractor(id: string): Promise<void> {
    await hdosDB.delete('contractor', id);
    this.contractors = this.contractors.filter((item) => item.id !== id);
    this.notify();
  }

  async addDocument(
  input: Omit<DocumentItem, 'id' | 'docNumber' | 'revision'>
): Promise<DocumentItem> {
  const categoryCode: Record<DocumentItem['category'], string> = {
    SOP: 'SOP',
    WI: 'WI',
    Form: 'FORM',
    Inspection: 'INS',
    Incident: 'INC',
    PICA: 'PICA',
    Contractor: 'CON',
  };

  const prefix = `CGG-HSE-${categoryCode[input.category]}`;

  // Find the highest existing document number for this category.
  const existingNumbers = this.documents
    .filter((doc) => doc.docNumber.startsWith(`${prefix}-`))
    .map((doc) => {
      const match = doc.docNumber.match(/-(\d+)$/);
      return match ? Number(match[1]) : 0;
    });

  const nextNumber =
    existingNumbers.length > 0
      ? Math.max(...existingNumbers) + 1
      : 1;

  const docNumber = `${prefix}-${String(nextNumber).padStart(3, '0')}`;

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
    const existing = this.documents.find((doc) => doc.id === documentId);
    if (!existing) throw new Error('Dokumen tidak ditemukan.');

    // Keep completed inspection records intact; only remove the repository entry
    // and its generated form definition. Inspection history remains available.
    const relatedForms = this.formDefinitions.filter((form) => form.sourceDocumentId === documentId);
    await hdosDB.delete('repository', documentId);
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

  async addInspection(inspection: Omit<Inspection, 'id' | 'code' | 'createdAt'>): Promise<Inspection> {
    const count = this.inspections.length + 1;
    const code = `INS-2026-${String(count).padStart(3, '0')}`;
    const id = createEntityId();
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const failedItems = inspection.items.filter((item) => item.result === 'FAIL');

    // Create one PICA for every failed checklist item so no finding is lost.
    for (const failedItem of failedItems) {
      const picaCount = this.picas.length + 1;
      const picaCode = `PICA-${new Date().getFullYear()}-${String(picaCount).padStart(3, '0')}`;
      const picaId = createEntityId();
      const picaCreated: PICA = {
        id: picaId,
        code: picaCode,
        source: 'INSPECTION',
        sourceRefCode: code,
        findingDescription: `Temuan: ${failedItem.question}${failedItem.notes ? ` — ${failedItem.notes}` : ''}`,
        correctiveAction: `Penuhi standar ${failedItem.standardRef || 'sesuai dokumen sumber'} dan verifikasi ulang sebelum pekerjaan dilanjutkan.`,
        preventiveAction: 'Evaluasi akar penyebab dan perbarui pengendalian agar ketidaksesuaian tidak berulang.',
        picDepartment: 'Operations',
        picName: 'PIC Terkait',
        targetDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        status: 'OPEN',
        daysAging: 0,
        approvalStages: { foreman: false, spvHse: false, ktt: false },
        createdAt: now,
      };

      failedItem.picaId = picaId;
      this.picas.unshift(picaCreated);
      await hdosDB.put('pica', picaCreated);
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
    this.notify();
    hdosEvents.emit('inspection:created', newInspection);
    return newInspection;
  }

  async addHazard(
    hazard: Omit<
      Hazard,
      'id' | 'code' | 'createdAt'
    >
  ): Promise<Hazard> {
    const count =
      this.hazards.length + 1;

    const year =
      new Date().getFullYear();

    const code =
      `HAZ-${year}-${String(
        count
      ).padStart(3, '0')}`;

    const id =
      createEntityId();

    const now =
      new Date()
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19);

    /*
     * Build v1.0:
     * Every validated hazard produces a PICA.
     *
     * PICA target:
     * LOW      = 30 days
     * MEDIUM   = 14 days
     * HIGH     = 7 days
     * CRITICAL = 24 hours
     */
    const targetDays: Record<
      Hazard['riskMatrix']['level'],
      number
    > = {
      LOW: 30,
      MEDIUM: 14,
      HIGH: 7,
      CRITICAL: 1,
    };

    const picaTarget =
      new Date();

    if (
      hazard.riskMatrix.level ===
      'CRITICAL'
    ) {
      picaTarget.setTime(
        picaTarget.getTime() +
          24 * 60 * 60 * 1000
      );
    } else {
      picaTarget.setDate(
        picaTarget.getDate() +
          targetDays[
            hazard.riskMatrix.level
          ]
      );
    }

    const picaId =
      createEntityId();

    const picaCode =
      `PICA-${year}-${String(
        this.picas.length + 1
      ).padStart(3, '0')}`;

    const picaCreated: PICA = {
      id: picaId,
      code: picaCode,

      source: 'HAZARD',
      sourceRefCode: code,

      findingDescription:
        `Temuan Hazard ${hazard.riskMatrix.level}: ${hazard.title}`,

      correctiveAction:
        hazard.actionTaken?.trim()
          ? hazard.actionTaken
          : 'Laksanakan tindakan pengendalian sesuai hasil penilaian risiko dan pastikan kondisi aman.',

      preventiveAction:
        'Lakukan evaluasi penyebab, verifikasi efektivitas pengendalian, dan cegah terulangnya kondisi serupa.',

      picDepartment:
        'Operations',

      picName:
        'PIC Belum Ditentukan',

      targetDate:
        picaTarget
          .toISOString()
          .split('T')[0],

      status:
        'OPEN',

      daysAging:
        0,

      approvalStages: {
        foreman: false,
        spvHse: false,
        ktt: false,
      },

      createdAt:
        now,
    };

    /*
     * PICA is created before the Hazard object so the
     * Hazard can retain the authoritative PICA ID.
     */
    this.picas.unshift(
      picaCreated
    );

    await hdosDB.put(
      'pica',
      picaCreated
    );

    hdosEvents.emit(
      'pica:created',
      picaCreated
    );

    const newHazard: Hazard = {
      ...hazard,

      id,
      code,

      createdAt: now,

      /*
       * Every hazard now has a PICA.
       */
      picaId,

      status:
        'PICA_ISSUED',
    };

    this.hazards.unshift(
      newHazard
    );

    await hdosDB.put(
      'hazard',
      newHazard
    );

    /*
     * Update location telemetry.
     */
    const loc =
      this.locations.find(
        (l) =>
          l.name ===
          hazard.location
      );

    if (loc) {
      loc.activeHazards += 1;

      if (
        hazard.riskMatrix.level ===
        'CRITICAL'
      ) {
        loc.safetyStatus =
          'ALERT';
      } else if (
        hazard.riskMatrix.level ===
          'HIGH' &&
        loc.safetyStatus ===
          'SAFE'
      ) {
        loc.safetyStatus =
          'WARNING';
      }
    }

    this.notify();

    hdosEvents.emit(
      'hazard:created',
      newHazard
    );

    return newHazard;
  }
  async addIncident(incident: Omit<Incident, 'id' | 'code' | 'createdAt'>): Promise<Incident> {
    const count = this.incidents.length + 1;
    const code = `INC-2026-${String(count).padStart(3, '0')}`;
    const id = createEntityId();
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const newInc: Incident = { ...incident, id, code, createdAt: now };

    this.incidents.unshift(newInc);
    await hdosDB.put('incident', newInc);
    this.notify();
    hdosEvents.emit('incident:created', newInc);
    return newInc;
  }

  async updatePICAStatus(id: string, updates: Partial<PICA>): Promise<PICA | null> {
    const index = this.picas.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const current = this.picas[index];
    const updated = { ...current, ...updates };

    if (updated.approvalStages.foreman && updated.approvalStages.spvHse && updated.approvalStages.ktt) {
      updated.status = 'CLOSED';
      updated.completionDate = new Date().toISOString().split('T')[0];
    }

    this.picas[index] = updated;
    await hdosDB.put('pica', updated);
    this.notify();
    hdosEvents.emit('pica:updated', updated);
    return updated;
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
