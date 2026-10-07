import { hdosStore } from './store';
import { hdosSync } from './sync';
import { hseApi, ApiError } from './api';

import type {
  Inspection,
  Hazard,
  PICA,
  Incident,
} from './types';

export class ApiIntegration {
  async createInspection(
    inspection: Omit<
      Inspection,
      'id' | 'code' | 'createdAt'
    >
  ): Promise<Inspection> {
    const created =
      await hdosStore.addInspection(
        inspection
      );

    if (hseApi.isAuthenticated) {
      try {
        await hseApi.create(
          'inspections',
          created
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          await hdosSync.enqueue({
            entity: 'inspection',
            action: 'CREATE',
            payload: created,
          });

          throw error;
        }

        console.warn(
          '[HDOS api] inspection create failed, queued for sync',
          error
        );

        await hdosSync.enqueue({
          entity: 'inspection',
          action: 'CREATE',
          payload: created,
        });
      }
    } else {
      await hdosSync.enqueue({
        entity: 'inspection',
        action: 'CREATE',
        payload: created,
      });
    }

    return created;
  }

  async createHazard(
    hazard: Omit<
      Hazard,
      'id' | 'code' | 'createdAt'
    >
  ): Promise<Hazard> {
    const created =
      await hdosStore.addHazard(
        hazard
      );

    if (hseApi.isAuthenticated) {
      try {
        await hseApi.create(
          'hazards',
          created
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          await hdosSync.enqueue({
            entity: 'hazard',
            action: 'CREATE',
            payload: created,
          });

          throw error;
        }

        console.warn(
          '[HDOS api] hazard create failed, queued for sync',
          error
        );

        await hdosSync.enqueue({
          entity: 'hazard',
          action: 'CREATE',
          payload: created,
        });
      }
    } else {
      await hdosSync.enqueue({
        entity: 'hazard',
        action: 'CREATE',
        payload: created,
      });
    }

    return created;
  }

  async updatePICA(
    id: string,
    updates: Partial<PICA>
  ): Promise<PICA | null> {
    const updated =
      await hdosStore.updatePICAStatus(
        id,
        updates
      );

    if (!updated) {
      return null;
    }

    const cloudPayload = {
      ...updates,
      id,
    };

    if (hseApi.isAuthenticated) {
      try {
        await hseApi.update(
          'picas',
          id,
          updates
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          await hdosSync.enqueue({
            entity: 'pica',
            action: 'UPDATE',
            payload: cloudPayload,
          });

          throw error;
        }

        console.warn(
          '[HDOS api] pica update failed, queued for sync',
          error
        );

        await hdosSync.enqueue({
          entity: 'pica',
          action: 'UPDATE',
          payload: cloudPayload,
        });
      }
    } else {
      await hdosSync.enqueue({
        entity: 'pica',
        action: 'UPDATE',
        payload: cloudPayload,
      });
    }

    return updated;
  }

  async createIncident(
    incident: Omit<
      Incident,
      'id' | 'code' | 'createdAt'
    >
  ): Promise<Incident> {
    const created =
      await hdosStore.addIncident(
        incident
      );

    if (hseApi.isAuthenticated) {
      try {
        await hseApi.create(
          'incidents',
          created
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          await hdosSync.enqueue({
            entity: 'incident',
            action: 'CREATE',
            payload: created,
          });

          throw error;
        }

        console.warn(
          '[HDOS api] incident create failed, queued for sync',
          error
        );

        await hdosSync.enqueue({
          entity: 'incident',
          action: 'CREATE',
          payload: created,
        });
      }
    } else {
      await hdosSync.enqueue({
        entity: 'incident',
        action: 'CREATE',
        payload: created,
      });
    }

    return created;
  }

  getSyncQueue() {
    return hdosSync.getQueue();
  }

  clearSyncQueue(): void {
    /*
     * Deliberately does not delete the authoritative
     * IndexedDB queue automatically.
     *
     * Queue deletion must remain an explicit operation.
     */
    console.warn(
      '[HDOS api] clearSyncQueue disabled in Build v1.0 to protect queued data.'
    );
  }
}

export const apiIntegration =
  new ApiIntegration();
