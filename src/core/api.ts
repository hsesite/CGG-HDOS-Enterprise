import type { MiningLocationGIS } from './types';
/**
 * CGG HDOS API Transport Layer
 *
 * Architecture:
 *
 *   UI / Core Modules
 *          ↓
 *       hseApi
 *          ↓
 *   Google Apps Script Web App
 *          ↓
 *   Google Spreadsheet
 *
 * Build v1.0:
 *   - Offline-first remains in IndexedDB.
 *   - GAS is the cloud transport.
 *   - No Render.
 *   - No Express.
 *   - No PostgreSQL runtime.
 *
 * Important:
 * Google Apps Script Web Apps do not use the same route structure
 * as the previous Express backend.
 *
 * Therefore every request is sent to ONE GAS URL using POST,
 * with the internal API contract carried in the JSON envelope:
 *
 * {
 *   method,
 *   path,
 *   token,
 *   payload
 * }
 */

const GAS_API_URL = (
  import.meta.env.VITE_GAS_URL ?? ''
).replace(/\/$/, '');

const TOKEN_KEY = 'hdos_api_session';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message: string;
  status?: number;
  timestamp: string;
};

type GasRequest = {
  method:
    | 'GET'
    | 'POST'
    | 'PATCH'
    | 'DELETE';

  path: string;

  token: string | null;

  payload?: unknown;
};

export type ApiUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  status?: string;
  companyCode?: string;
  parentCompanyCode?: string;
  position?: string;
  department?: string;
  section?: string;
  /** Set only by an authorized verifier on the server. */
  roleVerified?: boolean;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getApiBaseUrl(): string {
  return GAS_API_URL;
}

function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(
    TOKEN_KEY
  );
}

function setToken(
  token: string | null
): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.localStorage.setItem(
      TOKEN_KEY,
      token
    );
  } else {
    window.localStorage.removeItem(
      TOKEN_KEY
    );
  }
}

function createTransportError(): ApiError {
  return new ApiError(
    503,
    'Layanan Google Apps Script HDOS belum dikonfigurasi. Data lokal tetap tersedia melalui mode Offline.'
  );
}

async function request<T>(
  method: GasRequest['method'],
  path: string,
  payload?: unknown,
  authToken?: string | null
): Promise<T> {
  const baseUrl =
    getApiBaseUrl();

  if (!baseUrl) {
    throw createTransportError();
  }

  const requestBody: GasRequest = {
    method,
    path,
    token: authToken === undefined ? getToken() : authToken,
    payload,
  };

  let response: Response;

  try {
    response = await fetch(
      baseUrl,
      {
        method: 'POST',

        /*
         * Important for Google Apps Script Web Apps:
         * keep this a simple request so the browser does not
         * perform an Authorization/application-json preflight.
         */
        headers: {
          'content-type':
            'text/plain;charset=utf-8',
        },

        redirect: 'follow',

        body: JSON.stringify(
          requestBody
        ),
      }
    );
  } catch (error) {
    throw new ApiError(
      0,
      error instanceof Error
        ? error.message
        : 'Koneksi ke Google Apps Script gagal.'
    );
  }

  const raw =
    await response
      .text()
      .catch(() => '');

  let body:
    | ApiEnvelope<T>
    | null = null;

  try {
    body =
      raw
        ? (JSON.parse(raw) as ApiEnvelope<T>)
        : null;
  } catch (error) {
    throw new ApiError(
      response.status || 502,
      'Respons Google Apps Script tidak valid.'
    );
  }

  if (
    !response.ok ||
    !body?.success
  ) {
    throw new ApiError(
      body?.status ||
        response.status ||
        500,
      body?.message ||
        `API request failed (${response.status})`
    );
  }

  return body.data;
}

export const hseApi = {
  get baseUrl(): string {
    return getApiBaseUrl();
  },

  get isAuthenticated(): boolean {
    return Boolean(
      getToken()
    );
  },

  async login(
    email: string,
    password: string
  ): Promise<ApiUser> {
    const data =
      await request<{
        token: string;
        user: ApiUser;
      }>(
        'POST',
        '/api/auth/login',
        {
          email,
          password,
        }
      );

    setToken(
      data.token
    );

    return data.user;
  },

  async createUser(input: { displayName: string; email: string; password: string; role: 'Company Admin' | 'Contractor' | 'Subkon' | 'KTT' | 'SPT' | 'SPV' | 'Project Manager' | 'Superintendent' | 'Supervisor' | 'Foreman' | 'PJO' | 'SPV HSE' | 'Foreman Safety' | 'Safety Officer' | 'Paramedis' | 'Contractor PIC' | 'Employee'; companyCode?: string; parentCompanyCode?: string; position?: string; department?: string; section?: string }): Promise<ApiUser> {
    return request<ApiUser>('POST', '/api/users', input);
  },

  async loginWithGoogle(credential: string): Promise<ApiUser> {
    const data = await request<{ token: string; user: ApiUser }>(
      'POST',
      '/api/auth/google',
      { credential }
    );
    setToken(data.token);
    return data.user;
  },

  async submitGoogleProfile(input: { credential: string; displayName: string; companyCode: string; position: string; department: string; section: string }): Promise<{ pending?: boolean; message?: string; token?: string; user?: ApiUser }> {
    const result = await request<{ pending?: boolean; message?: string; token?: string; user?: ApiUser }>('POST', '/api/auth/google/onboard', input);
    if (result.token) setToken(result.token);
    return result;
  },

  async listPublicCompanies(): Promise<Array<{ code: string; name: string; role: string; parentCompanyCode?: string }>> {
    return request<Array<{ code: string; name: string; role: string; parentCompanyCode?: string }>>('GET', '/api/public/companies');
  },

  async listCompanies(): Promise<Array<{ code: string; name: string; role: 'Contractor' | 'Subkon'; parentCompanyCode?: string; emailDomains: string; autoProvision: boolean; status: string }>> {
    return request<Array<{ code: string; name: string; role: 'Contractor' | 'Subkon'; parentCompanyCode?: string; emailDomains: string; autoProvision: boolean; status: string }>>('GET', '/api/companies');
  },

  async upsertCompany(input: { code: string; name: string; role: 'Contractor' | 'Subkon'; parentCompanyCode?: string; emailDomains?: string; autoProvision?: boolean; status: 'ACTIVE' | 'INACTIVE' }): Promise<{ code: string; name: string; role: 'Contractor' | 'Subkon'; parentCompanyCode?: string; emailDomains: string; autoProvision: boolean; status: string }> {
    return request('POST', '/api/companies', input);
  },

  async listLocations(): Promise<MiningLocationGIS[]> {
    return request<MiningLocationGIS[]>('GET', '/api/locations');
  },

  async createLocation(input: Omit<MiningLocationGIS, 'activeHazards' | 'activeInspections' | 'safetyStatus'>): Promise<MiningLocationGIS> {
    return request<MiningLocationGIS>('POST', '/api/locations', input);
  },

  async deleteLocation(id: string): Promise<{ id: string; deleted: boolean }> {
    return request<{ id: string; deleted: boolean }>('DELETE', `/api/locations/${encodeURIComponent(id)}`);
  },

  async listUsers(): Promise<ApiUser[]> {
    return request<ApiUser[]>('GET', '/api/users');
  },

  async updateUserAccess(id: string, updates: { role?: 'Admin CGG' | 'Company Admin' | 'Contractor' | 'Subkon' | 'KTT' | 'SPT' | 'SPV' | 'Project Manager' | 'Superintendent' | 'Supervisor' | 'Foreman' | 'PJO' | 'SPV HSE' | 'Foreman Safety' | 'Safety Officer' | 'Paramedis' | 'Contractor PIC' | 'Employee'; status?: 'ACTIVE' | 'INACTIVE'; companyCode?: string; parentCompanyCode?: string; roleVerified?: boolean; position?: string }): Promise<ApiUser> {
    return request<ApiUser>('PATCH', `/api/users/${encodeURIComponent(id)}`, updates);
  },

  async listRepository(): Promise<Array<Record<string, unknown>>> {
    return request<Array<Record<string, unknown>>>('GET', '/api/repository');
  },

  async uploadRepositoryDocument(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('POST', '/api/repository', input);
  },

  async previewRepositoryFile(id: string): Promise<{ fileName: string; mimeType: string; base64: string }> {
    return request<{ fileName: string; mimeType: string; base64: string }>('GET', `/api/repository/${encodeURIComponent(id)}/preview`);
  },

  async downloadRepositoryFile(id: string, authToken?: string | null): Promise<{ fileName: string; mimeType: string; base64: string }> {
    return request<{ fileName: string; mimeType: string; base64: string }>('GET', `/api/repository/${encodeURIComponent(id)}/file`, undefined, authToken);
  },

  async deleteRepositoryDocument(id: string): Promise<{ id: string; deleted: boolean }> {
    return request<{ id: string; deleted: boolean }>('DELETE', `/api/repository/${encodeURIComponent(id)}`);
  },

  async deleteOperationalRecord(entity: 'inspections' | 'hazards' | 'picas' | 'incidents', id: string, authToken?: string): Promise<{ id: string; deleted: boolean }> {
    return request<{ id: string; deleted: boolean }>('DELETE', `/api/${entity}/${encodeURIComponent(id)}`, undefined, authToken);
  },

  async listOperationalRecords(entity: 'inspections' | 'hazards' | 'picas' | 'incidents'): Promise<Array<Record<string, unknown>>> {
    return request<Array<Record<string, unknown>>>('GET', `/api/${entity}`);
  },

  async listPublishedForms(): Promise<Array<Record<string, unknown>>> {
    return request<Array<Record<string, unknown>>>('GET', '/api/forms');
  },

  async publishFormDefinition(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('POST', '/api/forms', input);
  },

  get authToken(): string | null {
    return getToken();
  },

  async logout(authToken?: string | null): Promise<void> {
    const tokenToRevoke = authToken === undefined ? getToken() : authToken;
    try {
      if (tokenToRevoke) {
        await request<null>(
          'POST',
          '/api/auth/logout',
          undefined,
          tokenToRevoke
        );
      }
    } finally {
      // Never clear a newer user's token when revoking an older session.
      if (getToken() === tokenToRevoke) setToken(null);
    }
  },

  me(authToken?: string): Promise<ApiUser> {
    return request<ApiUser>(
      'GET',
      '/api/me',
      undefined,
      authToken
    );
  },

  list<T>(
    entity:
      | 'inspections'
      | 'hazards'
      | 'picas'
      | 'incidents'
  ): Promise<T[]> {
    return request<T[]>(
      'GET',
      `/api/${entity}`
    );
  },

  get<T>(
    entity:
      | 'inspections'
      | 'hazards'
      | 'picas'
      | 'incidents',
    id: string
  ): Promise<T> {
    return request<T>(
      'GET',
      `/api/${entity}/${encodeURIComponent(id)}`
    );
  },

  create<T>(
    entity:
      | 'inspections'
      | 'hazards'
      | 'picas'
      | 'incidents',
    payload: unknown,
    authToken?: string
  ): Promise<T> {
    return request<T>(
      'POST',
      `/api/${entity}`,
      payload,
      authToken
    );
  },

  update<T>(
    entity:
      | 'inspections'
      | 'hazards'
      | 'picas'
      | 'incidents',
    id: string,
    payload: unknown,
    authToken?: string
  ): Promise<T> {
    return request<T>(
      'PATCH',
      `/api/${entity}/${encodeURIComponent(id)}`,
      payload,
      authToken
    );
  },
};
