const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

function extractFunction(name, nextName) {
  const start = source.indexOf('function ' + name + '(');
  const end = source.indexOf('function ' + nextName + '(', start + 1);
  assert.ok(start >= 0 && end > start, 'function boundaries for ' + name);
  return source.slice(start, end);
}

test('monthly contractor report retries acknowledge an exact already-committed submission', () => {
  const helper = extractFunction('normalizeContractorComplianceReport_', 'canSubmitContractorComplianceReport_');
  const create = extractFunction('createContractorComplianceReport_', 'updateContractorComplianceReport_');
  const normalized = {
    period: '2026-11', remarks: 'Laporan bulanan',
    manpowerCount: 20, equipmentCount: 5, mcuEligibleCount: 20, mcuFitCount: 19,
    inductionRequiredCount: 20, inductionCompletedCount: 20, safeHours: 12000, ltiCount: 0
  };
  const existing = {
    ...normalized, id: 'report-1', code: 'CPR-SLS-2026-11', companyCode: 'SLS',
    status: 'SUBMITTED', createdAt: '2026-11-15T00:00:00.000Z'
  };
  let appended = 0;
  const context = {
    isObject_: value => value !== null && typeof value === 'object' && !Array.isArray(value),
    httpError_: (status, message) => Object.assign(new Error(message), { status }),
    canSubmitContractorComplianceReport_: () => true,
    findCompanyRegistry_: () => ({ status: 'ACTIVE', role: 'Contractor' }),
    getSheet_: () => ({ appendRow: () => { appended += 1; } }),
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    readAll_: () => [existing],
    success_: data => ({ success: true, data }),
    error_: (status, message) => ({ success: false, status, message }),
    ENTITY_SCHEMAS: { contractor_reports: ['id'] },
    buildEntityRow_: () => [],
    SpreadsheetApp: { flush: () => {} },
    logAudit_: () => {},
    Utilities: { getUuid: () => 'uuid' },
    Date,
    String,
    Object
  };
  vm.createContext(context);
  vm.runInContext(helper + '\n' + create, context);
  const user = { companyCode: 'SLS', email: 'pic@sls.co.id', roles: ['Contractor PIC'] };

  const replay = context.createContractorComplianceReport_(normalized, user);
  assert.equal(replay.success, true);
  assert.equal(replay.data.id, 'report-1');
  assert.equal(appended, 0);

  const changed = context.createContractorComplianceReport_({ ...normalized, remarks: 'Isi berbeda' }, user);
  assert.equal(changed.success, false);
  assert.equal(changed.status, 409);
  assert.equal(appended, 0);
});
