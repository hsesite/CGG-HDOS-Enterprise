import type { ApiUser } from './api';

export const CREW_BASE_MODULES = ['dashboard', 'repository', 'inspection', 'hazard'] as const;

export const ROLES_REQUIRING_VERIFICATION = [
  'KTT',
  'Project Manager',
  'SPV HSE',
  'Foreman Safety',
  'PJO',
] as const;

export type HDOSModule =
  | 'dashboard' | 'inspection' | 'hazard' | 'pica' | 'incident'
  | 'repository' | 'contractor' | 'map' | 'ai' | 'sync' | 'settings';

export function isCggAdmin(user: ApiUser | null | undefined): boolean {
  return Boolean(user?.roles?.includes('Admin CGG'));
}

export function requiresRoleVerification(user: ApiUser | null | undefined): boolean {
  return Boolean(user?.roles?.some((role) =>
    (ROLES_REQUIRING_VERIFICATION as readonly string[]).includes(role)
  ));
}

/** Senior roles fail closed until the server confirms role verification. */
export function canAccessModule(user: ApiUser | null | undefined, module: HDOSModule): boolean {
  if (!user) return false;
  if (isCggAdmin(user)) return true;

  if (requiresRoleVerification(user) && user.roleVerified !== true) {
    return (CREW_BASE_MODULES as readonly string[]).includes(module);
  }

  const roles = user.roles || [];
  if (roles.includes('Company Admin')) return true;
  if (['PJO', 'SPV HSE', 'Foreman Safety'].some((role) => roles.includes(role))) {
    return ['dashboard', 'repository', 'contractor', 'inspection', 'hazard', 'pica', 'incident', 'map', 'ai'].includes(module);
  }
  if (roles.includes('Contractor')) {
    return ['dashboard', 'repository', 'contractor', 'inspection', 'hazard', 'pica', 'incident', 'map'].includes(module);
  }
  if (roles.includes('Subkon')) {
    return ['dashboard', 'repository', 'inspection', 'hazard', 'pica', 'incident', 'map'].includes(module);
  }
  if (roles.includes('Employee')) return (CREW_BASE_MODULES as readonly string[]).includes(module);

  switch (module) {
    case 'dashboard': case 'hazard': case 'map': return true;
    case 'inspection': return ['KTT', 'Project Manager', 'Safety Officer'].some((role) => roles.includes(role));
    case 'pica': return ['KTT', 'Project Manager', 'Contractor PIC'].some((role) => roles.includes(role));
    case 'incident': return ['KTT', 'Project Manager', 'Paramedis', 'Safety Officer'].some((role) => roles.includes(role));
    case 'repository': return ['KTT', 'Project Manager'].some((role) => roles.includes(role));
    case 'contractor': return ['KTT', 'Project Manager', 'Contractor PIC'].some((role) => roles.includes(role));
    case 'ai': return ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'PJO'].some((role) => roles.includes(role));
    case 'sync': case 'settings': return false;
    default: return false;
  }
}

export function canDownloadDocuments(user: ApiUser | null | undefined): boolean {
  return Boolean(user && (isCggAdmin(user) || (user.companyCode?.trim().toUpperCase() === 'CGG' && user.roleVerified === true)));
}

export function canManagePersonnel(user: ApiUser | null | undefined): boolean {
  return isCggAdmin(user);
}
