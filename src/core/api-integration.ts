import { hdosStore } from './store';
import { apiSyncQueue } from './sync-queue';
import { hseApi, ApiError } from './api';
import type { Inspection, Hazard, PICA, Incident } from './types';

export class ApiIntegration {
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
