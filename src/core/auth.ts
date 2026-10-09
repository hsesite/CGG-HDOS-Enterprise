import type { UserRole, UserProfile } from './types';
import { hdosEvents } from './events';
import { AuthState } from './auth-state';

const VALID_ROLES: UserRole[] = ['Admin CGG', 'Contractor', 'Subkon', 'KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'Safety Officer', 'Paramedis', 'Contractor PIC', 'Employee'];

// Kept as an empty compatibility export for older UI imports. No sample employees are shipped.
export const USER_PROFILES: Partial<Record<UserRole, UserProfile>> = {};

export class HDOSAuthEngine {
  private selectedRole: UserRole | null = null;

  getCurrentUser(): UserProfile {
    const user = AuthState.getUser();
    const role = (user?.roles.find((value): value is UserRole => VALID_ROLES.includes(value as UserRole)) || this.selectedRole || 'Employee');
    return {
      id: user?.id || '',
      name: user?.displayName || '',
      role,
      badgeNumber: '',
      company: '',
      email: user?.email || '',
    };
  }

  getCurrentRole(): UserRole {
    return this.getCurrentUser().role;
  }

  setRole(role: UserRole): void {
    const user = AuthState.getUser();
    // A user may only select a role explicitly assigned by the server.
    if (!user || !user.roles.includes(role)) return;
    this.selectedRole = role;
    hdosEvents.emit('auth:role_changed', this.getCurrentUser());
  }

  canAccess(moduleName: string): boolean {
    const roles = AuthState.getUser()?.roles || [];
    if (roles.includes('Admin CGG')) return true;
    const role = this.getCurrentRole();
    if (role === 'Project Manager' || role === 'SPV HSE') return true;
    switch (moduleName) {
      case 'dashboard': return true;
      case 'repository': return ['Admin CGG', 'Contractor', 'Subkon'].some((value) => roles.includes(value));
      case 'contractor': return ['Admin CGG', 'Contractor'].some((value) => roles.includes(value));
      case 'inspection': return ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'Safety Officer'].includes(role);
      case 'hazard': return true;
      case 'pica': return ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'Contractor PIC'].includes(role);
      case 'incident': return ['KTT', 'Project Manager', 'SPV HSE', 'Paramedis', 'Safety Officer'].includes(role);
      case 'repository': return ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety'].includes(role);
      case 'contractor': return ['KTT', 'Project Manager', 'SPV HSE', 'Contractor PIC'].includes(role);
      case 'map': return true;
      case 'ai': return true;
      case 'settings': return roles.includes('Admin CGG');
      default: return false;
    }
  }

  canApprovePICA(): boolean {
    const role = this.getCurrentRole();
    return ['KTT', 'SPV HSE', 'Foreman Safety'].includes(role);
  }

  init(): void {
    this.selectedRole = null;
  }
}

export const hdosAuth = new HDOSAuthEngine();
hdosAuth.init();
