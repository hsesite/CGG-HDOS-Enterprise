import type { ReactNode } from 'react';
import { hseApi } from '../api';

export function withPermission(permission: string, component: ReactNode, fallback?: ReactNode): ReactNode {
  if (typeof window === 'undefined') return fallback || null;
  const user = window.sessionStorage.getItem('hdos_current_user');
  if (!user) return fallback || null;
  try {
    const parsed = JSON.parse(user);
    const hasPermission = parsed.roles?.some((role: string) => {
      const roleMap: Record<string, string[]> = {
        KTT: ['admin.permissions.read', 'inspection.read', 'inspection.create', 'inspection.update', 'hazard.read', 'hazard.create', 'hazard.update', 'pica.read', 'pica.create', 'pica.update', 'incident.read', 'incident.create', 'incident.update'],
        'SPV HSE': ['inspection.read', 'inspection.create', 'inspection.update', 'hazard.read', 'hazard.create', 'hazard.update', 'pica.read', 'pica.create', 'pica.update', 'incident.read', 'incident.create'],
        'Foreman Safety': ['inspection.read', 'inspection.create', 'hazard.read', 'hazard.create', 'pica.read'],
        'Safety Officer': ['inspection.read', 'inspection.create', 'hazard.read', 'hazard.create'],
        'Contractor PIC': ['hazard.read', 'hazard.create', 'pica.read'],
        Employee: ['hazard.read', 'hazard.create'],
      };
      return roleMap[role]?.includes(permission) || false;
    });
    return hasPermission ? component : fallback || null;
  } catch (error) {
    console.warn('[HDOS permission] check failed', error);
    return fallback || null;
  }
}

export function usePermission(permission: string): boolean {
  try {
    const user = window.sessionStorage.getItem('hdos_current_user');
    if (!user) return false;
    const parsed = JSON.parse(user);
    return parsed.roles?.some((role: string) => {
      const roleMap: Record<string, string[]> = {
        KTT: ['admin.permissions.read', 'inspection.read', 'inspection.create', 'inspection.update', 'hazard.read', 'hazard.create', 'hazard.update', 'pica.read', 'pica.create', 'pica.update', 'incident.read', 'incident.create', 'incident.update'],
        'SPV HSE': ['inspection.read', 'inspection.create', 'inspection.update', 'hazard.read', 'hazard.create', 'hazard.update', 'pica.read', 'pica.create', 'pica.update', 'incident.read', 'incident.create'],
        'Foreman Safety': ['inspection.read', 'inspection.create', 'hazard.read', 'hazard.create', 'pica.read'],
        'Safety Officer': ['inspection.read', 'inspection.create', 'hazard.read', 'hazard.create'],
        'Contractor PIC': ['hazard.read', 'hazard.create', 'pica.read'],
        Employee: ['hazard.read', 'hazard.create'],
      };
      return roleMap[role]?.includes(permission) || false;
    }) || false;
  } catch (error) {
    console.warn('[HDOS permission] check failed', error);
    return false;
  }
}
