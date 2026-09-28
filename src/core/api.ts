const API_BASE_URL = (
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_GAS_URL ??
  'http://localhost:4000'
).replace(/\/$/, '');

const IS_GOOGLE_APPS_SCRIPT = API_BASE_URL.includes('script.google.com');
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
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
  else window.sessionStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  let response: Response;

  if (!IS_GOOGLE_APPS_SCRIPT) {
    // Standard Express.js REST API
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } else {
    // Google Apps Script (fallback - not recommended)
    const url = new URL(API_BASE_URL);
    const method = (init.method ?? 'GET').toUpperCase();
    url.searchParams.set('path', path);
    url.searchParams.set('method', method);
    if (token) url.searchParams.set('token', token);
    const body = init.body ? (typeof init.body === 'string' ? init.body : JSON.stringify(init.body)) : undefined;
    if (body) url.searchParams.set('payload', body);
    console.log('[API] GAS Request:', url.toString());
    response = await fetch(url.toString(), { method: 'GET' });
  }

  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.success) {
    throw new ApiError(response.status, body?.message || `API request failed (${response.status})`);
  }
  return body.data;
}

export const hseApi = {
  get baseUrl(): string { return API_BASE_URL; },
  get isAuthenticated(): boolean { return Boolean(getToken()); },

  async login(email: string, password: string): Promise<ApiUser> {
    const data = await request<{ token: string; user: ApiUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data.user;
  },

  async logout(): Promise<void> {
    try { if (getToken()) await request<null>('/api/auth/logout', { method: 'POST' }); }
    finally { setToken(null); }
  },

  me(): Promise<ApiUser> { return request<ApiUser>('/api/me'); },

  list<T>(entity: 'inspections' | 'hazards' | 'picas' | 'incidents'): Promise<T[]> {
    return request<T[]>(`/api/${entity}`);
  },

  get<T>(entity: 'inspections' | 'hazards' | 'picas' | 'incidents', id: string): Promise<T> {
    return request<T>(`/api/${entity}/${encodeURIComponent(id)}`);
  },

  create<T>(entity: 'inspections' | 'hazards' | 'picas' | 'incidents', payload: unknown): Promise<T> {
    return request<T>(`/api/${entity}`, { method: 'POST', body: JSON.stringify(payload) });
  },

  update<T>(entity: 'inspections' | 'hazards' | 'picas' | 'incidents', id: string, payload: unknown): Promise<T> {
    return request<T>(`/api/${entity}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },
};
