import { UserRole, UserProfile } from './types';
import { hdosEvents } from './events';

export const USER_PROFILES: Record<UserRole, UserProfile> = {
  'KTT': {
    id: 'usr_ktt_01',
    name: 'Ir. Bambang Hartono, S.T., M.T.',
    role: 'KTT',
    badgeNumber: 'CGG-KTT-001',
    company: 'PT Citra Graha Gemilang',
    email: 'ktt@ptcgg.com',
  },
  'Project Manager': {
    id: 'usr_pm_02',
    name: 'Darmawan Santoso, S.T.',
    role: 'Project Manager',
    badgeNumber: 'CGG-PM-004',
    company: 'PT Citra Graha Gemilang',
    email: 'pm.site@ptcgg.com',
  },
  'SPV HSE': {
    id: 'usr_spv_03',
    name: 'Ahmad Fauzi, S.K.M.',
    role: 'SPV HSE',
    badgeNumber: 'CGG-HSE-012',
    company: 'PT Citra Graha Gemilang',
    email: 'hse.spv@ptcgg.com',
  },
  'Foreman Safety': {
    id: 'usr_foreman_04',
    name: 'Rudi Hermawan',
    role: 'Foreman Safety',
    badgeNumber: 'CGG-SAF-028',
    company: 'PT Citra Graha Gemilang',
    email: 'rudi.safety@ptcgg.com',
  },
  'Safety Officer': {
    id: 'usr_officer_05',
    name: 'Doni Pratama',
    role: 'Safety Officer',
    badgeNumber: 'CGG-SAF-045',
    company: 'PT Citra Graha Gemilang',
    email: 'doni.officer@ptcgg.com',
  },
  'Paramedis': {
    id: 'usr_med_06',
    name: 'Ns. Maya Indriani, S.Kep.',
    role: 'Paramedis',
    badgeNumber: 'CGG-MED-003',
    company: 'PT Citra Graha Gemilang Medical Team',
    email: 'medic.site@ptcgg.com',
  },
  'Contractor PIC': {
    id: 'usr_contractor_07',
    name: 'Hendrik Wijaya (SLS PIC)',
    role: 'Contractor PIC',
    badgeNumber: 'SLS-HSE-007',
    company: 'PT Sumber Logistik Sejahtera (SLS)',
    email: 'hendrik@sls-mining.com',
  },
  'Employee': {
    id: 'usr_emp_08',
    name: 'Joko Purnomo (Haul Truck Operator)',
    role: 'Employee',
    badgeNumber: 'CGG-OPS-119',
    company: 'PT Citra Graha Gemilang Mining Ops',
    email: 'joko.p@ptcgg.com',
  },
};

export class HDOSAuthEngine {
  private currentRole: UserRole = 'SPV HSE';

  getCurrentUser(): UserProfile {
    return USER_PROFILES[this.currentRole];
  }

  getCurrentRole(): UserRole {
    return this.currentRole;
  }

  setRole(role: UserRole): void {
    this.currentRole = role;
    localStorage.setItem('cgg_hdos_role', role);
    hdosEvents.emit('auth:role_changed', this.getCurrentUser());
  }

  canAccess(moduleName: string): boolean {
    const role = this.currentRole;
    if (role === 'KTT') return true;
    if (role === 'Project Manager') return moduleName !== 'system';
    if (role === 'SPV HSE') return true;

    switch (moduleName) {
      case 'dashboard':
        return true;
      case 'inspection':
        return ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'Safety Officer'].includes(role);
      case 'hazard':
        return true; // Everyone can report hazard
      case 'pica':
        return ['KTT', 'Project Manager', 'SPV HSE', 'Foreman Safety', 'Contractor PIC'].includes(role);
      case 'incident':
        return ['KTT', 'Project Manager', 'SPV HSE', 'Paramedis', 'Safety Officer'].includes(role);
      case 'repository':
        return true;
      case 'contractor':
        return ['KTT', 'Project Manager', 'SPV HSE', 'Contractor PIC'].includes(role);
      case 'map':
        return true;
      case 'ai':
        return true;
      default:
        return true;
    }
  }

  canApprovePICA(): boolean {
    return ['KTT', 'SPV HSE', 'Foreman Safety'].includes(this.currentRole);
  }

  init(): void {
    const saved = localStorage.getItem('cgg_hdos_role') as UserRole;
    if (saved && USER_PROFILES[saved]) {
      this.currentRole = saved;
    }
  }
}

export const hdosAuth = new HDOSAuthEngine();
hdosAuth.init();
