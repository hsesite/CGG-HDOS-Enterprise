import type { Inspection, Hazard, PICA, Incident, DocumentItem, ContractorPassport, MiningLocationGIS, AppWindow, WindowId } from './types';
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

  private listeners: Set<() => void> = new Set();
  private maxZIndex: number = 20;

  async init(): Promise<void> {
    try {
      const storedIns = await hdosDB.getAll<Inspection>('inspection');
      if (storedIns.length > 0) this.inspections = storedIns;

      const storedHaz = await hdosDB.getAll<Hazard>('hazard');
      if (storedHaz.length > 0) this.hazards = storedHaz;

      const storedPicas = await hdosDB.getAll<PICA>('pica');
      if (storedPicas.length > 0) this.picas = storedPicas;

      const storedInc = await hdosDB.getAll<Incident>('incident');
      if (storedInc.length > 0) this.incidents = storedInc;
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
