import { hseApi } from './api';
import type { ApiUser } from './api';

export class AuthState {
  static saveUser(user: ApiUser): void {
    sessionStorage.setItem('hdos_current_user', JSON.stringify(user));
  }

  static getUser(): ApiUser | null {
    try {
      const stored = sessionStorage.getItem('hdos_current_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  static clear(): void {
    sessionStorage.removeItem('hdos_current_user');
  }

  static hasPermission(permission: string): boolean {
    const user = this.getUser();
    if (!user) return false;
    const rolePermissions: Record<string, string[]> = {
      KTT: ['admin.permissions.read', 'inspection.read', 'inspection.create', 'inspection.update', 'hazard.read', 'hazard.create', 'hazard.update', 'pica.read', 'pica.create', 'pica.update', 'incident.read', 'incident.create', 'incident.update'],
      'SPV HSE': ['inspection.read', 'inspection.create', 'inspection.update', 'hazard.read', 'hazard.create', 'hazard.update', 'pica.read', 'pica.create', 'pica.update', 'incident.read', 'incident.create'],
      'Foreman Safety': ['inspection.read', 'inspection.create', 'hazard.read', 'hazard.create', 'pica.read'],
      'Safety Officer': ['inspection.read', 'inspection.create', 'hazard.read', 'hazard.create'],
      'Contractor PIC': ['hazard.read', 'hazard.create', 'pica.read'],
      Employee: ['hazard.read', 'hazard.create'],
    };
    return user.roles.some((role) => rolePermissions[role]?.includes(permission) || false);
  }
}
