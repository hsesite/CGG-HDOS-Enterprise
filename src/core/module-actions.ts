import { apiIntegration } from './api-integration';
import { apiSyncQueue } from './sync-queue';
import { AuditLog } from './audit';
import type { Inspection, Hazard, PICA, Incident } from './types';

// Export helper untuk modules
export async function createInspectionAction(inspection: Omit<Inspection, 'id' | 'code' | 'createdAt'>): Promise<Inspection> {
  try {
    const created = await apiIntegration.createInspection(inspection);
    AuditLog.log('CREATE', 'inspection', created.id, { title: created.title, location: created.location });
    return created;
  } catch (error) {
    console.error('[HDOS] inspection create error', error);
    throw error;
  }
}

export async function createHazardAction(hazard: Omit<Hazard, 'id' | 'code' | 'createdAt'>): Promise<Hazard> {
  try {
    const created = await apiIntegration.createHazard(hazard);
    AuditLog.log('CREATE', 'hazard', created.id, { title: created.title, level: created.riskMatrix.level });
    return created;
  } catch (error) {
    console.error('[HDOS] hazard create error', error);
    throw error;
  }
}

export async function updatePICAAction(id: string, updates: Partial<PICA>): Promise<PICA | null> {
  try {
    const updated = await apiIntegration.updatePICA(id, updates);
    if (updated) {
      AuditLog.log('UPDATE', 'pica', id, { status: updated.status });
    }
    return updated;
  } catch (error) {
    console.error('[HDOS] pica update error', error);
    throw error;
  }
}

export async function createIncidentAction(incident: Omit<Incident, 'id' | 'code' | 'createdAt'>): Promise<Incident> {
  try {
    const created = await apiIntegration.createIncident(incident);
    AuditLog.log('CREATE', 'incident', created.id, { title: created.title, type: created.type });
    return created;
  } catch (error) {
    console.error('[HDOS] incident create error', error);
    throw error;
  }
}

export function getSyncQueueStatus() {
  return apiIntegration.getSyncQueue();
}

export function clearSyncQueue() {
  apiIntegration.clearSyncQueue();
  AuditLog.log('ACTION', 'sync_queue', 'cleared', { count: 0 });
}
