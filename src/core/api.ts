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
    | 'PATCH';

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
  payload?: unknown
): Promise<T> {
  const baseUrl =
    getApiBaseUrl();

  if (!baseUrl) {
    throw createTransportError();
  }

  const requestBody: GasRequest = {
    method,
    path,
    token: getToken(),
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

  async createUser(input: { displayName: string; email: string; password: string; role: 'Company Admin' | 'Contractor' | 'Subkon' | 'PJO' | 'SPV HSE' | 'Foreman Safety' | 'Safety Officer' | 'Paramedis' | 'Contractor PIC' | 'Employee'; companyCode?: string; parentCompanyCode?: string; position?: string; department?: string; section?: string }): Promise<ApiUser> {
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

  async submitGoogleProfile(input: { credential: string; displayName: string; companyCode: string; position: string; department: string; section: string }): Promise<{ pending: boolean; message: string }> {
    return request<{ pending: boolean; message: string }>('POST', '/api/auth/google/onboard', input);
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

  async listUsers(): Promise<ApiUser[]> {
    return request<ApiUser[]>('GET', '/api/users');
  },

  async updateUserAccess(id: string, updates: { role?: 'Admin CGG' | 'Company Admin' | 'Contractor' | 'Subkon' | 'PJO' | 'SPV HSE' | 'Foreman Safety' | 'Safety Officer' | 'Paramedis' | 'Contractor PIC' | 'Employee'; status?: 'ACTIVE' | 'INACTIVE'; companyCode?: string; parentCompanyCode?: string }): Promise<ApiUser> {
    return request<ApiUser>('PATCH', `/api/users/${encodeURIComponent(id)}`, updates);
  },

  async logout(): Promise<void> {
    try {
      if (getToken()) {
        await request<null>(
          'POST',
          '/api/auth/logout'
        );
      }
    } finally {
      setToken(null);
    }
  },

  me(): Promise<ApiUser> {
    return request<ApiUser>(
      'GET',
      '/api/me'
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
    payload: unknown
  ): Promise<T> {
    return request<T>(
      'POST',
      `/api/${entity}`,
      payload
    );
  },

  update<T>(
    entity:
      | 'inspections'
      | 'hazards'
      | 'picas'
      | 'incidents',
    id: string,
    payload: unknown
  ): Promise<T> {
    return request<T>(
      'PATCH',
      `/api/${entity}/${encodeURIComponent(id)}`,
      payload
    );
  },
};
