export type UserRole =
  | 'KTT'
  | 'Project Manager'
  | 'SPV HSE'
  | 'Foreman Safety'
  | 'Safety Officer'
  | 'Paramedis'
  | 'Contractor PIC'
  | 'Employee';

export type MiningArea =
  | 'Pit Jaja KM10'
  | 'Siumbatu'
  | 'Workshop'
  | 'Stockpile'
  | 'Fuel Bay'
  | 'Haul Road';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  badgeNumber: string;
  company: string;
  email: string;
}

export interface InspectionItem {
  id: string;
  question: string;
  standardRef: string;
  result: 'PASS' | 'FAIL' | 'NA';
  notes?: string;
  photoUrl?: string;
  picaId?: string;
}

export interface Inspection {
  id: string;
  code: string;
  title: string;
  templateType: 'APAR' | 'HEAVY_EQUIPMENT' | 'WORKSHOP' | 'PIT_SLOPE';
  location: MiningArea;
  inspectorName: string;
  inspectorRole: UserRole;
  date: string;
  status: 'COMPLETED' | 'PICA_TRIGGERED' | 'DRAFT';
  smkpElement: string;
  scorePercent: number;
  items: InspectionItem[];
  gpsCoordinates: {
    lat: number;
    lng: number;
    utm: string;
  };
  notes?: string;
  createdAt: string;
}

export interface Hazard {
  id: string;
  code: string;
  title: string;
  category: 'Unsafe Action' | 'Unsafe Condition' | 'Environmental';
  location: MiningArea;
  specificLocation: string;
  riskMatrix: {
    severity: 1 | 2 | 3 | 4 | 5;
    likelihood: 1 | 2 | 3 | 4 | 5;
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
  reporter: string;
  reporterRole: UserRole;
  status: 'OPEN' | 'INVESTIGATION' | 'PICA_ISSUED' | 'CLOSED';
  photoUrl?: string;
  aiDetected?: boolean;
  aiSuggestions?: string[];
  picaId?: string;
  createdAt: string;
  actionTaken?: string;
}

export interface Incident {
  id: string;
  code: string;
  title: string;
  type: 'Near Miss' | 'Property Damage' | 'Medical Treatment' | 'Lost Time' | 'Fatality';
  date: string;
  time: string;
  location: MiningArea;
  victimsCount: number;
  damageCostEst?: string;
  status: 'REPORTED' | 'INVESTIGATING' | 'REVIEWED_KTT' | 'CLOSED';
  timeline: { time: string; event: string }[];
  fiveWhyAnalysis: string[];
  rootCause: string;
  correctiveActions: string[];
  smkpReportSubmitted: boolean;
  reporter: string;
  createdAt: string;
}

export interface PICA {
  id: string;
  code: string;
  source: 'INSPECTION' | 'HAZARD' | 'INCIDENT' | 'AUDIT';
  sourceRefCode: string;
  findingDescription: string;
  correctiveAction: string;
  preventiveAction: string;
  picDepartment: string;
  picName: string;
  targetDate: string;
  completionDate?: string;
  status: 'OPEN' | 'PROGRESS' | 'CLOSED' | 'OVERDUE';
  daysAging: number;
  approvalStages: {
    foreman: boolean;
    spvHse: boolean;
    ktt: boolean;
  };
  evidencePhotoUrl?: string;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  docNumber: string; // e.g. CGG-HSE-SOP-001
  title: string;
  category: 'SOP' | 'WI' | 'Form' | 'Inspection' | 'Incident' | 'PICA' | 'Contractor';
  revision: number;
  owner: string;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'EFFECTIVE';
  effectiveDate: string;
  fileType: 'PDF' | 'DOCX' | 'XLSX';
  size: string;
  downloadCount: number;
  smkpElement: string;
  summary: string;
}

export interface ContractorPassport {
  id: string;
  code: string; // e.g. SLS, VIP, BUMA, PAMA
  companyName: string;
  picName: string;
  picContact: string;
  manpowerCount: number;
  equipmentCount: number;
  kpiSafetyScore: number;
  safeHours: number;
  activePicaCount: number;
  mcuCompliancePercent: number;
  inductionRatePercent: number;
  status: 'ACTIVE' | 'WARNING' | 'SUSPENDED';
  safetyPassportExpiry: string;
}

export interface MiningLocationGIS {
  id: string;
  name: MiningArea;
  utm: string;
  lat: number;
  lng: number;
  description: string;
  activeHazards: number;
  activeInspections: number;
  safetyStatus: 'SAFE' | 'WARNING' | 'ALERT';
  zoneType: 'PIT' | 'HAUL_ROAD' | 'PORT' | 'FACILITY';
}

export interface SyncQueueItem {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'inspection' | 'hazard' | 'incident' | 'pica' | 'repository' | 'contractor';
  payload: any;
  timestamp: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'CONFLICT';
  retryCount: number;
  note?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'sync';
  timestamp: string;
  read: boolean;
}

export type WindowId =
  | 'dashboard'
  | 'inspection'
  | 'hazard'
  | 'pica'
  | 'incident'
  | 'repository'
  | 'contractor'
  | 'map'
  | 'ai'
  | 'sync';

export interface AppWindow {
  id: WindowId;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
}
