import type { UserRole, UserProfile } from './types';
import { hdosEvents } from './events';
import { AuthState } from './auth-state';

const VALID_ROLES: UserRole[] = ['Admin CGG', 'Company Admin', 'Contractor', 'Subkon', 'PJO', 'KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'Safety Officer', 'Paramedis', 'Contractor PIC', 'Employee'];

// Kept as an empty compatibility export for older UI imports. No sample employees are shipped.
export const USER_PROFILES: Partial<Record<UserRole, UserProfile>> = {};

export class HDOSAuthEngine {
  private selectedRole: UserRole | null = null;

  getCurrentUser(): UserProfile {
    const user = AuthState.getUser();
    const assignedRole = (user?.roles.find((value): value is UserRole => VALID_ROLES.includes(value as UserRole)) || this.selectedRole || 'Employee');
    const verificationRoles = ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'PJO'];
    const hasUnverifiedSeniorRole = Boolean(user?.roles.some((value) => verificationRoles.includes(value)) && user?.roleVerified !== true);
    // Until verification, behave as Crew in module-level controls as well as navigation.
    const role: UserRole = hasUnverifiedSeniorRole ? 'Employee' : assignedRole;
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
    const sessionUser = AuthState.getUser();
    const roles = sessionUser?.roles || [];
    const role = this.getCurrentRole();
    const verificationRoles = ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'PJO'];
    if (roles.some((value) => verificationRoles.includes(value)) && sessionUser?.roleVerified !== true) {
      return ['dashboard', 'repository', 'inspection', 'hazard'].includes(moduleName);
    }
    if (roles.includes('Admin CGG')) return true;
    if (roles.includes('Company Admin')) return true;
    if (['PJO', 'SPV HSE', 'Foreman Safety'].some((value) => roles.includes(value))) {
      return ['dashboard', 'repository', 'contractor', 'inspection', 'hazard', 'pica', 'incident', 'map', 'ai'].includes(moduleName);
    }
    if (roles.includes('Contractor')) return ['dashboard', 'repository', 'contractor', 'inspection', 'hazard', 'pica', 'incident', 'map'].includes(moduleName);
    if (roles.includes('Subkon')) return ['dashboard', 'repository', 'inspection', 'hazard', 'pica', 'incident', 'map'].includes(moduleName);
    if (roles.includes('Employee')) return ['dashboard', 'repository', 'inspection', 'hazard'].includes(moduleName);
    if (role === 'Project Manager') return true;
    switch (moduleName) {
      case 'dashboard': return true;
      case 'inspection': return ['KTT', 'Project Manager', 'Safety Officer'].includes(role);
      case 'hazard': return true;
      case 'pica': return ['KTT', 'Project Manager', 'Contractor PIC'].includes(role);
      case 'incident': return ['KTT', 'Project Manager', 'Paramedis', 'Safety Officer'].includes(role);
      case 'repository': return ['KTT', 'Project Manager'].includes(role);
      case 'contractor': return ['KTT', 'Project Manager', 'Contractor PIC'].includes(role);
      case 'map': return true;
      case 'ai': return true;
      case 'settings': return false;
      default: return false;
    }
  }

  canApprovePICA(): boolean {
    const role = this.getCurrentRole();
    return ['KTT', 'PJO', 'SPV HSE', 'Foreman Safety'].includes(role);
  }

  init(): void {
    this.selectedRole = null;
  }
}

export const hdosAuth = new HDOSAuthEngine();
hdosAuth.init();
