import { ApiError, hseApi, type ApiUser } from './api';
import { AuthState } from './auth-state';

export async function loginUser(email: string, password: string): Promise<ApiUser> {
  try {
    const user = await hseApi.login(email, password);
    AuthState.saveUser(user);
    return user;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) throw new Error('Email atau password salah');
      if (error.status === 429) throw new Error('Terlalu banyak percobaan login. Coba lagi dalam beberapa menit');
    }
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  try {
    await hseApi.logout();
  } finally {
    AuthState.clear();
  }
}

export function getCurrentUser(): ApiUser | null {
  return AuthState.getUser();
}

export function hasPermission(permission: string): boolean {
  return AuthState.hasPermission(permission);
}
