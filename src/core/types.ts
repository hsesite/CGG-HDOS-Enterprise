export type UserRole =
  | 'KTT'
  | 'Project Manager'
  | 'SPV HSE'
  | 'Foreman Safety'
  | 'Safety Officer'
  | 'Paramedis'
  | 'Contractor PIC'
  | 'Employee'
  | 'Admin CGG'
  | 'Contractor'
  | 'Subkon';

export type MiningArea = string;

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
  /** Published Repository form that originated this inspection, when applicable. */
  sourceFormId?: string;
  sourceFormNumber?: string;
  sourceDocumentId?: string;
  location: MiningArea;
  inspectorName: string;
  inspectorRole: UserRole;
  date: string;
  status: 'COMPLETED' | 'PICA_TRIGGERED' | 'DRAFT';
  smkpElement: string;
  scorePercent: number;
  items: InspectionItem[];
  gpsCoordinates?: {
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

export type DocumentLevel =
  | 'Level 1 - Manual Mutu'
  | 'Level 2 - Prosedur'
  | 'Level 3 - Instruksi Kerja'
  | 'Level 4 - Record, Form, Attachment';

export interface DocumentControlMetadata {
  department: string;
  registerNo: string;
  documentLevel: DocumentLevel | '-';
  documentType: string;
  sourceDocumentNumber: string;
  revisionStatus: string;
  approvalDate: string;
  remarks: string;
  weight: string;
  activeWeight: string;
  softCopyFiling: string;
  hardCopyFiling: string;
  planDistribution: string;
  actualDistribution: string;
  distributedTo: string;
  user: string;
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
  /** Tenant ownership fields; required for contractor/subkon visibility. */
  companyCode?: string;
  parentCompanyCode?: string;
  ownerUserId?: string;
  documentControl?: DocumentControlMetadata;
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
  zoneType: 'PIT' | 'HAUL_ROAD' | 'STOCKPILE' | 'PREPARASI' | 'NURSERY' | 'JETTY' | 'ETO' | 'SAMPLE_HOUSE' | 'PORT' | 'FACILITY';
}

export interface SyncQueueItem {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity:
    | 'inspection'
    | 'hazard'
    | 'incident'
    | 'pica'
    | 'repository'
    | 'contractor';
  payload: unknown;
  timestamp: string;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'CONFLICT';
  retryCount: number;
  note?: string;
  error?: string;
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
  | 'sync'
  | 'settings';

export interface AppWindow {
  id: WindowId;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
}
// ============================================================
// HDOS FORM RUNTIME CONTRACT
// ============================================================

/**
 * Generic field types used by the Dynamic Form / Runtime Engine.
 *
 * A document imported from Word, Excel, PDF or another source
 * can eventually be mapped into this contract.
 */
export type FormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'DATE'
  | 'TIME'
  | 'DATETIME'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'RADIO'
  | 'CHECKBOX'
  | 'PHOTO'
  | 'GPS'
  | 'SIGNATURE'
  | 'QR'
  | 'RISK_MATRIX'
  | 'TABLE';

/**
 * Option used by SELECT / MULTI_SELECT / RADIO / CHECKBOX fields.
 */
export interface FormFieldOption {
  value: string;
  label: string;
}

/**
 * Validation rules that can be interpreted by the Runtime Engine.
 */
export interface FormFieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/**
 * Defines one field/question in a dynamic form.
 */
export interface FormFieldDefinition {
  id: string;
  order: number;

  label: string;
  description?: string;

  type: FormFieldType;

  options?: FormFieldOption[];

  validation?: FormFieldValidation;

  /**
   * Used for HSE findings.
   * If true, a negative answer can become a Finding.
   */
  createsFindingOnNegative?: boolean;

  /**
   * Defines the negative answer/value for fields that can
   * generate an HSE finding.
   */
  negativeValue?: string;

  /**
   * Allows a field to be displayed only when another field
   * satisfies a condition.
   */
  visibility?: {
    fieldId: string;
    operator:
      | 'equals'
      | 'not_equals'
      | 'contains'
      | 'not_contains';
    value: string;
  };

  /**
   * Metadata used by the Runtime Engine and AI parser.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Runtime form definition.
 *
 * This is the normalized representation of a form/checklist
 * originating from Repository.
 */
export interface FormApprovalRecord {
  role: 'Foreman Safety' | 'SPV HSE' | 'KTT';
  approvedBy: string;
  approvedAt: string;
}

export interface FormApprovalWorkflow {
  contentReviewed: boolean;
  referencesReviewed: boolean;
  criticalityReviewed: boolean;
  approvals: {
    foreman?: FormApprovalRecord;
    spvHse?: FormApprovalRecord;
    ktt?: FormApprovalRecord;
  };
  publishedBy?: string;
  publishedAt?: string;
}

export interface FormDefinition {
  id: string;

  /**
   * Repository document that is the source of this form.
   */
  sourceDocumentId?: string;

  formNumber?: string;
  title: string;

  category?: string;
  department?: string;
  area?: string;

  revision?: string;
  effectiveDate?: string;

  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

  version: number;

  fields: FormFieldDefinition[];

  /**
   * Indicates that the definition was generated by AI.
   */
  approvalWorkflow?: FormApprovalWorkflow;

  generatedByAI?: boolean;

  /**
   * AI confidence for the generated structure.
   * This is informational and must not bypass human approval.
   */
  aiConfidence?: number;

  createdAt: string;
  updatedAt: string;
}

/**
 * One submitted answer from a Runtime Form.
 */
export interface FormAnswer {
  fieldId: string;

  value:
    | string
    | number
    | boolean
    | string[]
    | null;

  /**
   * Evidence attached to this answer.
   */
  evidenceIds?: string[];

  /**
   * GPS captured at the time of answering.
   */
  gpsCoordinates?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number;
  };

  timestamp: string;
}

/**
 * A runtime form submission.
 *
 * This is the bridge between the generic Form Engine and
 * domain modules such as Inspection, Hazard and Incident.
 */
export interface FormSubmission {
  id: string;

  formId: string;
  formVersion: number;

  submittedBy: string;

  startedAt: string;
  submittedAt?: string;

  status: 'DRAFT' | 'SUBMITTED' | 'SYNCED' | 'REJECTED';

  answers: FormAnswer[];

  /**
   * Generated findings from negative answers.
   */
  findingIds?: string[];

  /**
   * Domain record created from this submission.
   */
  inspectionId?: string;
  hazardIds?: string[];
  incidentId?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Normalized HSE Finding.
 *
 * Finding is intentionally separate from PICA.
 * One finding can create one PICA without duplicating
 * the finding data inside the PICA contract.
 */
export interface HSEFinding {
  id: string;

  sourceType:
    | 'INSPECTION'
    | 'HAZARD'
    | 'INCIDENT'
    | 'AUDIT'
    | 'FORM';

  sourceId: string;

  formId?: string;
  fieldId?: string;

  title: string;
  description: string;

  answerValue?: string | number | boolean;

  severity?: number;
  likelihood?: number;

  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  photoIds?: string[];

  gpsCoordinates?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };

  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

  picaId?: string;

  createdAt: string;
  updatedAt: string;
}
