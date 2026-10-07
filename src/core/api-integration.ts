import { hdosStore } from './store';
import { hdosSync } from './sync';
import { hseApi, ApiError } from './api';

import type {
  Inspection,
  Hazard,
  PICA,
  Incident,
} from './types';

function isAuthenticatedAndOnline(): boolean {
  return (
    hseApi.isAuthenticated &&
    hdosSync.getIsOnline()
  );
}

async function enqueueCreate(
  entity:
    | 'inspection'
    | 'hazard'
    | 'pica'
    | 'incident',
  payload: unknown
): Promise<void> {
  await hdosSync.enqueue({
    entity,
    action: 'CREATE',
    payload,
  });
}

async function syncCreatedRecord<T>(
  entity:
    | 'inspections'
    | 'hazards'
    | 'picas'
    | 'incidents',
  queueEntity:
    | 'inspection'
    | 'hazard'
    | 'pica'
    | 'incident',
  record: T
): Promise<void> {
  if (isAuthenticatedAndOnline()) {
    try {
      await hseApi.create(
        entity,
        record
      );
      return;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        await enqueueCreate(
          queueEntity,
          record
        );

        throw error;
      }

      console.warn(
        `[HDOS api] ${queueEntity} cloud create failed, queued for sync`,
        error
      );
    }
  }

  await enqueueCreate(
    queueEntity,
    record
  );
}

export class ApiIntegration {
  async createInspection(
    inspection: Omit<
      Inspection,
      'id' | 'code' | 'createdAt'
    >
  ): Promise<Inspection> {
    const picaCountBefore =
      hdosStore.picas.length;

    const created =
      await hdosStore.addInspection(
        inspection
      );

    /*
     * addInspection() may automatically create a PICA
     * when one or more checklist items fail.
     *
     * Capture newly-created PICA records so they do not
     * remain local-only.
     */
    const newPicas =
      hdosStore.picas.slice(
        0,
        hdosStore.picas.length -
          picaCountBefore
      );

    try {
      await syncCreatedRecord(
        'inspections',
        'inspection',
        created
      );

      for (
        const pica of newPicas
      ) {
        await syncCreatedRecord(
          'picas',
          'pica',
          pica
        );
      }
    } catch (error) {
      /*
       * Local record has already been committed to IndexedDB.
       * If authentication failed, let the caller handle login
       * renewal. The record remains safely queued.
       */
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        throw error;
      }
    }

    return created;
  }

  async createHazard(
    hazard: Omit<
      Hazard,
      'id' | 'code' | 'createdAt'
    >
  ): Promise<Hazard> {
    const picaCountBefore =
      hdosStore.picas.length;

    const created =
      await hdosStore.addHazard(
        hazard
      );

    /*
     * addHazard() automatically creates a PICA for
     * HIGH / CRITICAL hazards.
     */
    const newPicas =
      hdosStore.picas.slice(
        0,
        hdosStore.picas.length -
          picaCountBefore
      );

    try {
      await syncCreatedRecord(
        'hazards',
        'hazard',
        created
      );

      for (
        const pica of newPicas
      ) {
        await syncCreatedRecord(
          'picas',
          'pica',
          pica
        );
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        throw error;
      }
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

    /*
     * The queue payload MUST contain the record ID.
     * This fixes the previous UPDATE queue defect where
     * the queue item ID was incorrectly parsed as the PICA ID.
     */
    const cloudPayload: Partial<PICA> & {
      id: string;
    } = {
      ...updates,
      id,
    };

    if (
      isAuthenticatedAndOnline()
    ) {
      try {
        await hseApi.update(
          'picas',
          id,
          updates
        );

        return updated;
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
          '[HDOS api] PICA update failed, queued for sync',
          error
        );
      }
    }

    await hdosSync.enqueue({
      entity: 'pica',
      action: 'UPDATE',
      payload: cloudPayload,
    });

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

    if (
      isAuthenticatedAndOnline()
    ) {
      try {
        await hseApi.create(
          'incidents',
          created
        );

        return created;
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          await enqueueCreate(
            'incident',
            created
          );

          throw error;
        }

        console.warn(
          '[HDOS api] incident create failed, queued for sync',
          error
        );
      }
    }

    await enqueueCreate(
      'incident',
      created
    );

    return created;
  }

  getSyncQueue() {
    return hdosSync.getQueue();
  }

  clearSyncQueue(): void {
    /*
     * Build v1.0:
     * Do not silently delete unsynchronized data.
     */
    console.warn(
      '[HDOS api] clearSyncQueue disabled in Build v1.0 to protect queued data.'
    );
  }
}

export const apiIntegration =
  new ApiIntegration();
