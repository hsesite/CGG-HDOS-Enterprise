import { hdosStore } from './store';
import { apiSyncQueue } from './sync-queue';
import { hseApi, ApiError } from './api';
import type { Inspection, Hazard, PICA, Incident, DocumentItem } from './types';

type ServerEnvelopeRecord = {
  id?: string;
  code?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string;
  updated_at?: string;
  payload?: Record<string, unknown>;
};

function normalizeRecord<T extends { id: string }>(record: T | ServerEnvelopeRecord): T {
  if (record && typeof record === 'object' && 'payload' in record && record.payload && typeof record.payload === 'object') {
    return {
      ...record.payload,
      id: String(record.id ?? (record.payload as { id?: string }).id ?? ''),
      code: String(record.code ?? (record.payload as { code?: string }).code ?? ''),
      status: String(record.status ?? (record.payload as { status?: string }).status ?? ''),
      createdAt: String(record.createdAt ?? record.created_at ?? (record.payload as { createdAt?: string }).createdAt ?? ''),
      updatedAt: String(record.updatedAt ?? record.updated_at ?? (record.payload as { updatedAt?: string }).updatedAt ?? ''),
    } as unknown as T;
  }

  return record as T;
}

export class ApiIntegration {
  async hydrateRemoteData(): Promise<void> {
    if (!hseApi.isAuthenticated) return;

    const [inspections, hazards, picas, incidents, documents] = await Promise.all([
      hseApi.list<Inspection | ServerEnvelopeRecord>('inspections'),
      hseApi.list<Hazard | ServerEnvelopeRecord>('hazards'),
      hseApi.list<PICA | ServerEnvelopeRecord>('picas'),
      hseApi.list<Incident | ServerEnvelopeRecord>('incidents'),
      hseApi.list<DocumentItem | ServerEnvelopeRecord>('repository'),
    ]);

    await hdosStore.hydrateRemoteData({
      inspections: inspections.map((item) => normalizeRecord<Inspection>(item)),
      hazards: hazards.map((item) => normalizeRecord<Hazard>(item)),
      picas: picas.map((item) => normalizeRecord<PICA>(item)),
      incidents: incidents.map((item) => normalizeRecord<Incident>(item)),
      documents: documents.map((item) => normalizeRecord<DocumentItem>(item)),
    });
  }

  async createInspection(inspection: Omit<Inspection, 'id' | 'code' | 'createdAt'>): Promise<Inspection> {
    const created = await hdosStore.addInspection(inspection);
    if (hseApi.isAuthenticated) {
      try {
        await hseApi.create('inspections', created);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          throw error;
        }
        console.warn('[HDOS api] inspection create failed, queued for sync', error);
        await apiSyncQueue.enqueue('inspection', 'CREATE', created);
      }
    } else {
      await apiSyncQueue.enqueue('inspection', 'CREATE', created);
    }
    return created;
  }

  async createHazard(hazard: Omit<Hazard, 'id' | 'code' | 'createdAt'>): Promise<Hazard> {
    const created = await hdosStore.addHazard(hazard);
    if (hseApi.isAuthenticated) {
      try {
        await hseApi.create('hazards', created);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          throw error;
        }
        console.warn('[HDOS api] hazard create failed, queued for sync', error);
        await apiSyncQueue.enqueue('hazard', 'CREATE', created);
      }
    } else {
      await apiSyncQueue.enqueue('hazard', 'CREATE', created);
    }
    return created;
  }

  async updatePICA(id: string, updates: Partial<PICA>): Promise<PICA | null> {
    const updated = await hdosStore.updatePICAStatus(id, updates);
    if (updated && hseApi.isAuthenticated) {
      try {
        await hseApi.update('picas', id, updates);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          throw error;
        }
        console.warn('[HDOS api] pica update failed, queued for sync', error);
        await apiSyncQueue.enqueue('pica', 'UPDATE', updates);
      }
    } else if (updated) {
      await apiSyncQueue.enqueue('pica', 'UPDATE', updates);
    }
    return updated;
  }

  async createIncident(incident: Omit<Incident, 'id' | 'code' | 'createdAt'>): Promise<Incident> {
    const created = await hdosStore.addIncident(incident);
    if (hseApi.isAuthenticated) {
      try {
        await hseApi.create('incidents', created);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          throw error;
        }
        console.warn('[HDOS api] incident create failed, queued for sync', error);
        await apiSyncQueue.enqueue('incident', 'CREATE', created);
      }
    } else {
      await apiSyncQueue.enqueue('incident', 'CREATE', created);
    }
    return created;
  }

  getSyncQueue() {
    return apiSyncQueue.getQueue();
  }

  clearSyncQueue() {
    apiSyncQueue.clearQueue();
  }
}

export const apiIntegration = new ApiIntegration();
