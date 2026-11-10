import type { MiningLocationGIS } from './types';
/**
 * CGG HDOS API Transport Layer
 *
 * Architecture:
 *
 *   UI / Core Modules
 *          ↓
 *       hseApi
 *          ↓
 *   Google Apps Script Web App
 *          ↓
 *   Google Spreadsheet
 *
 * Build v1.0:
 *   - Offline-first remains in IndexedDB.
 *   - GAS is the cloud transport.
 *   - No Render.
 *   - No Express.
 *   - No PostgreSQL runtime.
 *
 * Important:
 * Google Apps Script Web Apps do not use the same route structure
 * as the previous Express backend.
 *
 * Therefore every request is sent to ONE GAS URL using POST,
 * with the internal API contract carried in the JSON envelope:
 *
 * {
 *   method,
 *   path,
 *   token,
 *   payload
 * }
 */

const GAS_API_URL = (
  import.meta.env.VITE_GAS_URL ?? ''
).replace(/\/$/, '');

const TOKEN_KEY = 'hdos_api_session';

// Prevent an older in-flight login response from replacing a newer session.
let sessionMutationGeneration = 0;

function beginSessionMutation(): number {
  sessionMutationGeneration += 1;
  return sessionMutationGeneration;
}

function commitSessionToken(token: string, generation: number): void {
  if (generation !== sessionMutationGeneration) {
    throw new ApiError(409, 'Respons autentikasi diabaikan karena sesi yang lebih baru sudah dimulai.');
  }
  setToken(token);
}

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message: string;
  status?: number;
  timestamp: string;
};

type GasRequest = {
  method:
    | 'GET'
    | 'POST'
    | 'PATCH'
    | 'DELETE';

  path: string;

  token: string | null;

  payload?: unknown;
};

export type ApiUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  status?: string;
  companyCode?: string;
  parentCompanyCode?: string;
  position?: string;
  department?: string;
  section?: string;
  /** Set only by an authorized verifier on the server. */
  roleVerified?: boolean;
};

export type ContractorFleetOwnership = 'OWNED' | 'RENTAL' | 'LEASED';
export type ContractorFleetP2HStatus = 'READY' | 'NOT_READY' | 'NOT_CHECKED';

export interface ContractorP2HRecord {
  id: string;
  code: string;
  fleetId: string;
  companyCode: string;
  parentCompanyCode?: string;
  unitNumber: string;
  inspectionDate: string;
  status: Exclude<ContractorFleetP2HStatus, 'NOT_CHECKED'>;
  hourMeter?: number | '';
  operatorName: string;
  findings: string;
  correctiveAction: string;
  checkedBy: string;
  photoFileId?: string;
  photoFileName?: string;
  photoMimeType?: string;
  createdAt: string;
}

export type ContractorP2HInput = Pick<ContractorP2HRecord, 'inspectionDate' | 'status' | 'hourMeter' | 'operatorName' | 'findings' | 'correctiveAction'> & Partial<Pick<ContractorP2HRecord, 'photoFileId' | 'photoFileName' | 'photoMimeType'>> & { requestId?: string };

export interface ContractorFleetUnit {
  id: string;
  code: string;
  companyCode: string;
  parentCompanyCode?: string;
  unitNumber: string;
  unitType: string;
  brand: string;
  model: string;
  ownershipType: ContractorFleetOwnership;
  p2hStatus: ContractorFleetP2HStatus;
  p2hLastCheckedAt?: string;
  p2hCheckedBy?: string;
  siaExpiry: string;
  siaFileId?: string;
  siaFileName?: string;
  siaMimeType?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export type ContractorFleetInput = Pick<ContractorFleetUnit,
  'unitNumber' | 'unitType' | 'brand' | 'model' | 'ownershipType' | 'p2hStatus' | 'siaExpiry'
> & { status?: 'ACTIVE' | 'INACTIVE' };

export type ContractorComplianceReportStatus = 'SUBMITTED' | 'VERIFIED' | 'RETURNED';

export interface ContractorComplianceReport {
  id: string;
  code: string;
  period: string;
  companyCode: string;
  parentCompanyCode?: string;
  manpowerCount: number;
  equipmentCount: number;
  mcuEligibleCount: number;
  mcuFitCount: number;
  inductionRequiredCount: number;
  inductionCompletedCount: number;
  safeHours: number;
  ltiCount: number;
  remarks: string;
  status: ContractorComplianceReportStatus;
  submittedBy: string;
  submittedAt: string;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ContractorComplianceReportInput = Pick<ContractorComplianceReport,
  'period' | 'manpowerCount' | 'equipmentCount' | 'mcuEligibleCount' |
  'mcuFitCount' | 'inductionRequiredCount' | 'inductionCompletedCount' |
  'safeHours' | 'ltiCount' | 'remarks'
>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getApiBaseUrl(): string {
  return GAS_API_URL;
}

function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage.getItem(
    TOKEN_KEY
  );
}

function setToken(
  token: string | null
): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.sessionStorage.setItem(
      TOKEN_KEY,
      token
    );
  } else {
    window.sessionStorage.removeItem(
      TOKEN_KEY
    );
  }
}

function createTransportError(): ApiError {
  return new ApiError(
    503,
    'Layanan Google Apps Script HDOS belum dikonfigurasi. Data lokal tetap tersedia melalui mode Offline.'
  );
}

async function request<T>(
  method: GasRequest['method'],
  path: string,
  payload?: unknown,
  authToken?: string | null
): Promise<T> {
  const baseUrl =
    getApiBaseUrl();

  if (!baseUrl) {
    throw createTransportError();
  }

  const requestBody: GasRequest = {
    method,
    path,
    token: authToken === undefined ? getToken() : authToken,
    payload,
  };

  let response: Response;

  try {
    response = await fetch(
      baseUrl,
      {
        method: 'POST',

        /*
         * Important for Google Apps Script Web Apps:
         * keep this a simple request so the browser does not
         * perform an Authorization/application-json preflight.
         */
        headers: {
          'content-type':
            'text/plain;charset=utf-8',
        },

        redirect: 'follow',

        body: JSON.stringify(
          requestBody
        ),
      }
    );
  } catch (error) {
    throw new ApiError(
      0,
      error instanceof Error
        ? error.message
        : 'Koneksi ke Google Apps Script gagal.'
    );
  }

  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    // The server may already have committed a write even when the browser
    // cannot read its response. Treat this as transient so idempotent CREATE
    // requests can safely be replayed instead of becoming permanent conflicts.
    throw new ApiError(
      0,
      error instanceof Error
        ? `Respons Google Apps Script gagal dibaca: ${error.message}`
        : 'Respons Google Apps Script gagal dibaca.'
    );
  }

  let body:
    | ApiEnvelope<T>
    | null = null;

  try {
    body =
      raw
        ? (JSON.parse(raw) as ApiEnvelope<T>)
        : null;
  } catch (error) {
    // A successful HTTP status with an unreadable/non-JSON body does not prove
    // that the server rejected the write. Use a retryable gateway status.
    throw new ApiError(
      response.ok ? 502 : (response.status || 502),
      'Respons Google Apps Script tidak valid.'
    );
  }

  if (
    !response.ok ||
    !body?.success
  ) {
    throw new ApiError(
      body?.status ||
        (response.ok ? 502 : (response.status || 500)),
      body?.message ||
        `API request failed (${response.status})`
    );
  }

  return body.data;
}

export const hseApi = {
  get baseUrl(): string {
    return getApiBaseUrl();
  },

  get isAuthenticated(): boolean {
    return Boolean(
      getToken()
    );
  },

  async login(
    email: string,
    password: string
  ): Promise<ApiUser> {
    const sessionGeneration = beginSessionMutation();
    const data =
      await request<{
        token: string;
        user: ApiUser;
      }>(
        'POST',
        '/api/auth/login',
        {
          email,
          password,
        }
      );

    commitSessionToken(data.token, sessionGeneration);

    return data.user;
  },

  async createUser(input: { displayName: string; email: string; password: string; role: 'Company Admin' | 'Contractor' | 'Subkon' | 'KTT' | 'SPT' | 'SPV' | 'Project Manager' | 'Superintendent' | 'Supervisor' | 'Foreman' | 'PJO' | 'SPV HSE' | 'Foreman Safety' | 'Safety Officer' | 'Paramedis' | 'Contractor PIC' | 'Employee'; companyCode?: string; parentCompanyCode?: string; position?: string; department?: string; section?: string }): Promise<ApiUser> {
    return request<ApiUser>('POST', '/api/users', input);
  },

  async loginWithGoogle(credential: string): Promise<ApiUser> {
    const sessionGeneration = beginSessionMutation();
    const data = await request<{ token: string; user: ApiUser }>(
      'POST',
      '/api/auth/google',
      { credential }
    );
    commitSessionToken(data.token, sessionGeneration);
    return data.user;
  },

  async submitGoogleProfile(input: { credential: string; displayName: string; companyCode: string; position: string; department: string; section: string }): Promise<{ pending?: boolean; message?: string; token?: string; user?: ApiUser }> {
    const sessionGeneration = beginSessionMutation();
    const result = await request<{ pending?: boolean; message?: string; token?: string; user?: ApiUser }>('POST', '/api/auth/google/onboard', input);
    if (result.token) commitSessionToken(result.token, sessionGeneration);
    return result;
  },

  async listPublicCompanies(): Promise<Array<{ code: string; name: string; role: string; parentCompanyCode?: string }>> {
    return request<Array<{ code: string; name: string; role: string; parentCompanyCode?: string }>>('GET', '/api/public/companies');
  },

  async listCompanies(): Promise<Array<{ code: string; name: string; role: 'Contractor' | 'Subkon'; parentCompanyCode?: string; emailDomains: string; autoProvision: boolean; status: string; passportStatus: 'ACTIVE' | 'WARNING' | 'SUSPENDED'; picName: string; picContact: string; safetyPassportExpiry: string }>> {
    return request<Array<{ code: string; name: string; role: 'Contractor' | 'Subkon'; parentCompanyCode?: string; emailDomains: string; autoProvision: boolean; status: string; passportStatus: 'ACTIVE' | 'WARNING' | 'SUSPENDED'; picName: string; picContact: string; safetyPassportExpiry: string }>>('GET', '/api/companies');
  },

  async upsertCompany(input: { code: string; name: string; role: 'Contractor' | 'Subkon'; parentCompanyCode?: string; emailDomains?: string; autoProvision?: boolean; status: 'ACTIVE' | 'INACTIVE'; passportStatus?: 'ACTIVE' | 'WARNING' | 'SUSPENDED'; picName?: string; picContact?: string; safetyPassportExpiry?: string }): Promise<{ code: string; name: string; role: 'Contractor' | 'Subkon'; parentCompanyCode?: string; emailDomains: string; autoProvision: boolean; status: string; passportStatus: 'ACTIVE' | 'WARNING' | 'SUSPENDED'; picName: string; picContact: string; safetyPassportExpiry: string }> {
    return request('POST', '/api/companies', input);
  },

  async listContractorFleet(): Promise<ContractorFleetUnit[]> {
    return request<ContractorFleetUnit[]>('GET', '/api/contractor/fleet');
  },

  async listContractorP2HHistory(fleetId: string): Promise<ContractorP2HRecord[]> {
    return request<ContractorP2HRecord[]>('GET', `/api/contractor/fleet/${encodeURIComponent(fleetId)}/p2h`);
  },

  async createContractorP2HRecord(fleetId: string, input: ContractorP2HInput): Promise<ContractorP2HRecord> {
    return request<ContractorP2HRecord>('POST', `/api/contractor/fleet/${encodeURIComponent(fleetId)}/p2h`, input);
  },

  async getContractorP2HPhoto(recordId: string): Promise<{ fileName: string; mimeType: string; base64: string }> {
    return request<{ fileName: string; mimeType: string; base64: string }>('GET', `/api/contractor/p2h/${encodeURIComponent(recordId)}/photo`);
  },

  async createContractorFleetUnit(input: ContractorFleetInput): Promise<ContractorFleetUnit> {
    return request<ContractorFleetUnit>('POST', '/api/contractor/fleet', input);
  },

  async updateContractorFleetUnit(id: string, input: Partial<ContractorFleetInput>): Promise<ContractorFleetUnit> {
    return request<ContractorFleetUnit>('PATCH', `/api/contractor/fleet/${encodeURIComponent(id)}`, input);
  },

  async uploadContractorSia(fleetId: string, input: { fileName: string; mimeType: string; fileBase64: string; uploadKey?: string }): Promise<{ id: string; siaFileName: string; siaMimeType: string; updatedAt: string }> {
    return request('POST', `/api/contractor/fleet/${encodeURIComponent(fleetId)}/sia`, input);
  },

  async previewContractorSia(fleetId: string): Promise<{ fileName: string; mimeType: string; base64: string }> {
    return request('GET', `/api/contractor/fleet/${encodeURIComponent(fleetId)}/sia`);
  },

  async listContractorComplianceReports(): Promise<ContractorComplianceReport[]> {
    return request<ContractorComplianceReport[]>('GET', '/api/contractor/reports');
  },

  async submitContractorComplianceReport(input: ContractorComplianceReportInput): Promise<ContractorComplianceReport> {
    return request<ContractorComplianceReport>('POST', '/api/contractor/reports', input);
  },

  async updateContractorComplianceReport(id: string, input: { action?: 'VERIFY' | 'RETURN'; reviewNotes?: string } | ContractorComplianceReportInput): Promise<ContractorComplianceReport> {
    return request<ContractorComplianceReport>('PATCH', `/api/contractor/reports/${encodeURIComponent(id)}`, input);
  },

  async listLocations(): Promise<MiningLocationGIS[]> {
    return request<MiningLocationGIS[]>('GET', '/api/locations');
  },

  async createLocation(input: Omit<MiningLocationGIS, 'activeHazards' | 'activeInspections' | 'safetyStatus'>): Promise<MiningLocationGIS> {
    return request<MiningLocationGIS>('POST', '/api/locations', input);
  },

  async deleteLocation(id: string): Promise<{ id: string; deleted: boolean }> {
    return request<{ id: string; deleted: boolean }>('DELETE', `/api/locations/${encodeURIComponent(id)}`);
  },

  async listUsers(): Promise<ApiUser[]> {
    return request<ApiUser[]>('GET', '/api/users');
  },

  async updateUserAccess(id: string, updates: { role?: 'Admin CGG' | 'Company Admin' | 'Contractor' | 'Subkon' | 'KTT' | 'SPT' | 'SPV' | 'Project Manager' | 'Superintendent' | 'Supervisor' | 'Foreman' | 'PJO' | 'SPV HSE' | 'Foreman Safety' | 'Safety Officer' | 'Paramedis' | 'Contractor PIC' | 'Employee'; status?: 'ACTIVE' | 'INACTIVE'; companyCode?: string; parentCompanyCode?: string; roleVerified?: boolean; position?: string }): Promise<ApiUser> {
    return request<ApiUser>('PATCH', `/api/users/${encodeURIComponent(id)}`, updates);
  },

  async listAuditLogs(): Promise<Array<Record<string, unknown>>> {
    return request<Array<Record<string, unknown>>>('GET', '/api/audit');
  },

  async listRepository(): Promise<Array<Record<string, unknown>>> {
    return request<Array<Record<string, unknown>>>('GET', '/api/repository');
  },

  async uploadRepositoryDocument(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('POST', '/api/repository', input);
  },

  async uploadOperationalPhoto(input: { fileName: string; mimeType: string; fileBase64: string; uploadKey: string }): Promise<{ photoFileId: string; photoUrl: string; fileName: string; mimeType: string }> {
    return request<{ photoFileId: string; photoUrl: string; fileName: string; mimeType: string }>('POST', '/api/photos', input);
  },

  async previewRepositoryFile(id: string): Promise<{ fileName: string; mimeType: string; base64: string }> {
    return request<{ fileName: string; mimeType: string; base64: string }>('GET', `/api/repository/${encodeURIComponent(id)}/preview`);
  },

  async downloadRepositoryFile(id: string, authToken?: string | null): Promise<{ fileName: string; mimeType: string; base64: string }> {
    return request<{ fileName: string; mimeType: string; base64: string }>('GET', `/api/repository/${encodeURIComponent(id)}/file`, undefined, authToken);
  },

  async deleteRepositoryDocument(id: string, authToken?: string | null): Promise<{ id: string; deleted: boolean }> {
    return request<{ id: string; deleted: boolean }>('DELETE', `/api/repository/${encodeURIComponent(id)}`, undefined, authToken);
  },

  async deleteOperationalRecord(entity: 'inspections' | 'hazards' | 'picas' | 'incidents', id: string, authToken?: string): Promise<{ id: string; deleted: boolean }> {
    return request<{ id: string; deleted: boolean }>('DELETE', `/api/${entity}/${encodeURIComponent(id)}`, undefined, authToken);
  },

  async listOperationalRecords(entity: 'inspections' | 'hazards' | 'picas' | 'incidents'): Promise<Array<Record<string, unknown>>> {
    return request<Array<Record<string, unknown>>>('GET', `/api/${entity}`);
  },

  async getOperationalRecord(entity: 'inspections' | 'hazards' | 'picas' | 'incidents', id: string, authToken?: string | null): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('GET', `/api/${entity}/${encodeURIComponent(id)}`, undefined, authToken);
  },

  async listPublishedForms(): Promise<Array<Record<string, unknown>>> {
    return request<Array<Record<string, unknown>>>('GET', '/api/forms');
  },

  async publishFormDefinition(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>('POST', '/api/forms', input);
  },

  get authToken(): string | null {
    return getToken();
  },

  async logout(authToken?: string | null): Promise<void> {
    const tokenToRevoke = authToken === undefined ? getToken() : authToken;
    // Only invalidate in-flight authentication when this logout targets the
    // currently active token; revoking an older tab's token must not cancel a new login.
    const ownsCurrentSession = getToken() === tokenToRevoke;
    const sessionGeneration = ownsCurrentSession
      ? beginSessionMutation()
      : sessionMutationGeneration;
    try {
      if (tokenToRevoke) {
        await request<null>(
          'POST',
          '/api/auth/logout',
          undefined,
          tokenToRevoke
        );
      }
    } finally {
      // Never clear a newer user's token when revoking an older session.
      if (
        ownsCurrentSession &&
        sessionGeneration === sessionMutationGeneration &&
        getToken() === tokenToRevoke
      ) setToken(null);
    }
  },

  me(authToken?: string): Promise<ApiUser> {
    return request<ApiUser>(
      'GET',
      '/api/me',
      undefined,
      authToken
    );
  },

  list<T>(
    entity:
      | 'inspections'
      | 'hazards'
      | 'picas'
      | 'incidents'
  ): Promise<T[]> {
    return request<T[]>(
      'GET',
      `/api/${entity}`
    );
  },

  get<T>(
    entity:
      | 'inspections'
      | 'hazards'
      | 'picas'
      | 'incidents',
    id: string
  ): Promise<T> {
    return request<T>(
      'GET',
      `/api/${entity}/${encodeURIComponent(id)}`
    );
  },

  create<T>(
    entity:
      | 'inspections'
      | 'hazards'
      | 'picas'
      | 'incidents',
    payload: unknown,
    authToken?: string
  ): Promise<T> {
    return request<T>(
      'POST',
      `/api/${entity}`,
      payload,
      authToken
    );
  },

  update<T>(
    entity:
      | 'inspections'
      | 'hazards'
      | 'picas'
      | 'incidents',
    id: string,
    payload: unknown,
    authToken?: string
  ): Promise<T> {
    return request<T>(
      'PATCH',
      `/api/${entity}/${encodeURIComponent(id)}`,
      payload,
      authToken
    );
  },
};
