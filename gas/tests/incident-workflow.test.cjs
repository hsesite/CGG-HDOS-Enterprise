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
  assert.match(backendSource, /if \(role === 'Employee' && \['inspections', 'hazards'\]\.indexOf\(entity\) === -1\)/);
  assert.match(backendSource, /function isReadOnlyController_\(user\)/);
});

test('incident reporter role eligibility remains distinct from investigator, reviewer, and closer authority', () => {
  assert.match(incidentUiSource, /const canEditInvestigation = isAdminCGG \|\| \(isVerified && assignedRoles\.some\(role => \['Foreman Safety', 'SPV HSE'\]/);
  assert.match(incidentUiSource, /const canReviewIncident = isAdminCGG \|\| \(isVerified && assignedRoles\.some\(role => \['KTT', 'SPT', 'SPV'\]/);
  assert.match(incidentUiSource, /const canCloseIncident = isAdminCGG \|\| \(isVerified && assignedRoles\.includes\('KTT'\)\)/);
});
