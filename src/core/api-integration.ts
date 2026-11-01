import { hdosStore } from './store';
import { hdosSync } from './sync';

import type {
  Inspection,
  Hazard,
  PICA,
  Incident,
} from './types';

/**
 * Single write path for operational records.
 *
 * HDOSCentralStore owns the local transaction and creates exactly one
 * offline-queue item for each record. The sync engine is the only component
 * that sends queued writes to the central GAS API.
 *
 * Do not call hseApi.create/update here: doing so in parallel with the
 * store-owned queue caused the same record to be submitted twice.
 */
export class ApiIntegration {
  async createInspection(
    inspection: Omit<Inspection, 'id' | 'code' | 'createdAt'>
  ): Promise<Inspection> {
    return hdosStore.addInspection(inspection);
  }

  async createHazard(
    hazard: Omit<Hazard, 'id' | 'code' | 'createdAt'>
  ): Promise<Hazard> {
    return hdosStore.addHazard(hazard);
  }

  async updatePICA(
    id: string,
    updates: Partial<PICA>
  ): Promise<PICA | null> {
    return hdosStore.updatePICAStatus(id, updates);
  }

  async createIncident(
    incident: Omit<Incident, 'id' | 'code' | 'createdAt'>
  ): Promise<Incident> {
    return hdosStore.addIncident(incident);
  }

  getSyncQueue() {
    return hdosSync.getQueue();
  }

  clearSyncQueue(): void {
    // Unsynchronized records must not be silently deleted.
    console.warn(
      '[HDOS api] clearSyncQueue disabled to protect queued data.'
    );
  }
}

export const apiIntegration = new ApiIntegration();
