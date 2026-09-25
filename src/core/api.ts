const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
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
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  const token = getToken();
  if (token) headers.set('authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
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
