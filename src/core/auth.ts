import type { UserRole, UserProfile } from './types';
import { hdosEvents } from './events';
import { AuthState } from './auth-state';
import { canAccessModule, isCggAdmin } from './access-policy';

const VALID_ROLES: UserRole[] = ['Admin CGG', 'Company Admin', 'Contractor', 'Subkon', 'PJO', 'KTT', 'SPT', 'SPV', 'Project Manager', 'Superintendent', 'Supervisor', 'Foreman', 'SPV HSE', 'Foreman Safety', 'Safety Officer', 'Paramedis', 'Contractor PIC', 'Employee'];

// Kept as an empty compatibility export for older UI imports. No sample employees are shipped.
export const USER_PROFILES: Partial<Record<UserRole, UserProfile>> = {};

export class HDOSAuthEngine {
  private selectedRole: UserRole | null = null;

  getCurrentUser(): UserProfile {
    const user = AuthState.getUser();
    const assignedRole = (user?.roles.find((value): value is UserRole => VALID_ROLES.includes(value as UserRole)) || this.selectedRole || 'Employee');
    const verificationRoles = ['KTT', 'SPT', 'SPV', 'Project Manager', 'Superintendent', 'Supervisor', 'Foreman', 'SPV HSE', 'Foreman Safety', 'PJO'];
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
    if (!sessionUser) return false;
    return canAccessModule(sessionUser, moduleName as import('./access-policy').HDOSModule);
  }

  canApprovePICA(): boolean {
    const user = AuthState.getUser();
    if (!user || user.roleVerified !== true) return false;
    // Match the server-enforced PICA stages exactly. Admin/KTT/PM/PJO
    // oversight does not grant authority to approve either HSE stage.
    return user.roles.some((role) => role === 'Foreman Safety' || role === 'SPV HSE');
  }

  init(): void {
    this.selectedRole = null;
  }
}

export const hdosAuth = new HDOSAuthEngine();
hdosAuth.init();
