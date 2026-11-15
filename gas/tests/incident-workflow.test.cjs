const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const storeSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'),
  'utf8'
);
const incidentUiSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'IncidentModule.tsx'),
  'utf8'
);
const backendSource = fs.readFileSync(
  path.join(__dirname, '..', 'Code.gs'),
  'utf8'
);

test('local mutation policy mirrors backend Employee, verification, and read-only controller restrictions', () => {
  const start = storeSource.indexOf('private assertMutationAllowed(');
  const end = storeSource.indexOf('\n  public inspections:', start);
  assert.ok(start >= 0 && end > start);
  const policy = storeSource.slice(start, end);
  assert.match(policy, /roles\.includes\('Employee'\) && !roles\.includes\('Admin CGG'\) && !roles\.includes\('Company Admin'\)/);
  assert.match(policy, /verificationRequiredRoles/);
  assert.match(policy, /user\?\.roleVerified !== true && !\['inspection', 'hazard'\]\.includes\(action\)/);
  assert.match(policy, /readOnlyControllerRoles/);
  assert.match(policy, /user\?\.roleVerified === true/);
});

test('incident reporting UI is limited to roles accepted by the backend', () => {
  assert.match(incidentUiSource, /const incidentReportRoles = \['Company Admin', 'Contractor', 'Subkon', 'Crew', 'Foreman', 'Supervisor', 'Superintendent', 'Safety Officer', 'Paramedis', 'Contractor PIC'\]/);
  assert.match(incidentUiSource, /const canCreateIncident = isAdminCGG \|\|/);
  assert.match(incidentUiSource, /const employeeRestricted = assignedRoles\.includes\('Employee'\)/);
  assert.match(incidentUiSource, /!canCreateIncident/);
  assert.match(incidentUiSource, /\{canCreateIncident && <button/);
  assert.match(backendSource, /const isLimitedEmployee = roles\.indexOf\('Employee'\) >= 0 && !isAdminCGG_\(user\) && !isCompanyAdmin_\(user\)/);
  assert.match(backendSource, /if \(isLimitedEmployee && \['inspections', 'hazards', 'picas'\]\.indexOf\(entity\) === -1\)/);
  assert.match(backendSource, /function isReadOnlyController_\(user\)/);
});

test('incident reporter role eligibility remains distinct from investigator, reviewer, and closer authority', () => {
  assert.match(incidentUiSource, /const canEditInvestigation = isAdminCGG \|\| \(isVerified && assignedRoles\.some\(role => \['Foreman Safety', 'SPV HSE'\]/);
  assert.match(incidentUiSource, /const canReviewIncident = isAdminCGG \|\| \(isVerified && assignedRoles\.some\(role => \['KTT', 'SPT', 'SPV'\]/);
  assert.match(incidentUiSource, /const canCloseIncident = isAdminCGG \|\| \(isVerified && assignedRoles\.includes\('KTT'\)\)/);
});

test('backend does not let Employee role override Admin CGG or Company Admin on multi-role accounts', () => {
  const gateStart = backendSource.indexOf("const isLimitedEmployee = roles.indexOf('Employee')");
  const gateEnd = backendSource.indexOf("const id =", gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart);
  const gate = backendSource.slice(gateStart, gateEnd);
  assert.match(gate, /!isAdminCGG_\(user\) && !isCompanyAdmin_\(user\)/);
  assert.match(gate, /if \(isLimitedEmployee &&/);
  assert.doesNotMatch(gate, /roles\.indexOf\('Employee'\) !== -1/);
});

test('verified Incident workflow roles reach action-specific store authorization', () => {
  const storeSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'),
    'utf8'
  );
  const start = storeSource.indexOf('private assertMutationAllowed(');
  const end = storeSource.indexOf('public inspections:', start);
  assert.ok(start >= 0 && end > start);
  const policy = storeSource.slice(start, end);
  // Incident edits are not generic writes: updateIncident applies the
  // investigator/reviewer/closer role and status checks immediately after.
  assert.match(policy, /if \(action !== 'incident' && user\?\.roleVerified === true && roles\.some\(candidate => readOnlyControllerRoles\.includes\(candidate\)\)\)/);
  const updateStart = storeSource.indexOf('async updateIncident(');
  const updateEnd = storeSource.indexOf('async updatePICAStatus(', updateStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  const incidentUpdate = storeSource.slice(updateStart, updateEnd);
  assert.match(incidentUpdate, /isInvestigator/);
  assert.match(incidentUpdate, /isReviewer/);
  assert.match(incidentUpdate, /roles\.includes\('KTT'\)/);
  assert.match(incidentUpdate, /current\.status !== 'REVIEWED_KTT'/);
});
