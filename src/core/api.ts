/**
 * CGG HDOS API Transport Layer
 *
 * Architecture:
 *   UI / Core Modules
 *          ↓
 *       hseApi
 *          ↓
 *   Transport endpoint
 *
 * Build v1.0:
 *   - Offline-first data remains in IndexedDB.
 *   - Google Apps Script will become the cloud transport.
 *   - No runtime dependency on Render / Express / PostgreSQL.
 *
 * IMPORTANT:
 * This file intentionally keeps the existing `hseApi` contract
 * so existing modules do not need to be rewritten at once.
 */

const GAS_API_URL = (
  import.meta.env.VITE_GAS_URL ?? ''
).replace(/\/$/, '');

const TOKEN_KEY = 'hdos_api_session';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
};

export type ApiUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
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

/**
 * Returns the configured Google Apps Script endpoint.
 *
 * An empty value is intentional during the transition phase.
 * It prevents the application from silently calling localhost
 * or an obsolete Render backend.
 */
function getApiBaseUrl(): string {
  return GAS_API_URL;
}

function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    window.sessionStorage.removeItem(TOKEN_KEY);
  }
}

function createTransportError(): ApiError {
  return new ApiError(
    503,
    'Layanan cloud HDOS belum dikonfigurasi. Data lokal tetap tersedia melalui mode Offline.'
  );
}

/**
 * Generic HTTP transport.
 *
 * This function is deliberately isolated so the transport can
 * later be replaced by the Google Apps Script connector without
 * changing the domain modules.
 */
async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    throw createTransportError();
  }

  const headers = new Headers(init.headers);

  headers.set('content-type', 'application/json');

  const token = getToken();

  if (token) {
    headers.set(
      'authorization',
      `Bearer ${token}`
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${baseUrl}${path}`,
      {
        ...init,
        headers,
      }
    );
  } catch (error) {
    throw new ApiError(
      0,
      error instanceof Error
        ? error.message
        : 'Koneksi ke layanan HDOS gagal.'
    );
  }

  const body =
    (await response
      .json()
      .catch(() => null)) as
      | ApiEnvelope<T>
      | null;

  if (
    !response.ok ||
    !body?.success
  ) {
    throw new ApiError(
      response.status,
      body?.message ||
        `API request failed (${response.status})`
    );
  }

  return body.data;
}

export const hseApi = {
  /**
   * Exposes the currently configured cloud endpoint.
   */
  get baseUrl(): string {
    return getApiBaseUrl();
  },

  /**
   * Authentication state remains session based.
   *
   * The actual credential validation will be moved to
   * Google Apps Script in C-1C.
   */
  get isAuthenticated(): boolean {
    return Boolean(getToken());
  },

  /**
   * Login contract is intentionally preserved.
   *
   * C-1C will connect this endpoint to the GAS authentication
   * service. Until then, an unconfigured GAS endpoint returns
   * a controlled 503 instead of attempting Render/localhost.
   */
  async login(
    email: string,
    password: string
  ): Promise<ApiUser> {
    const data =
      await request<{
        token: string;
        user: ApiUser;
      }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

    setToken(data.token);

    return data.user;
  },

  async logout(): Promise<void> {
    try {
      if (getToken()) {
        await request<null>(
          '/api/auth/logout',
          {
            method: 'POST',
          }
        );
      }
    } finally {
      setToken(null);
    }
  },

  me(): Promise<ApiUser> {
    return request<ApiUser>(
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
      `/api/${entity}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
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
      `/api/${entity}/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },
};
