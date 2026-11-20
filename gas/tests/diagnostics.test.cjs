const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const diagnostics = fs.readFileSync(path.join(__dirname, '..', 'Diagnostics.gs'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

test('diagnostic route is POST-only and separate from normal session auth', () => {
  assert.match(backend, /path === '\/api\/diagnostics\/report'/);
  assert.match(backend, /method !== 'POST'/);
  assert.match(backend, /handleReadOnlyDiagnostics_\(params\)/);
});

test('diagnostic API requires a dedicated Script Property secret', () => {
  assert.match(diagnostics, /HDOS_DIAGNOSTICS_TOKEN/);
  assert.match(diagnostics, /constantTimeDiagnosticTokenMatch_/);
  assert.match(diagnostics, /diagnosticToken/);
});

test('diagnostic API is aggregate-only and does not invoke write or migration helpers', () => {
  assert.match(diagnostics, /mode: 'READ_ONLY'/);
  assert.match(diagnostics, /liveDatabaseChanged: false/);
  assert.doesNotMatch(diagnostics, /\.setValues\s*\(/);
  assert.doesNotMatch(diagnostics, /\.appendRow\s*\(/);
  assert.doesNotMatch(diagnostics, /\.clear(?:Contents|Content)\s*\(/);
  assert.doesNotMatch(diagnostics, /insertSheet\s*\(/);
  assert.doesNotMatch(diagnostics, /createDatabaseBackup\s*\(/);
  assert.doesNotMatch(diagnostics, /installDailyDatabaseBackupTrigger\s*\(/);
  assert.doesNotMatch(diagnostics, /setup\s*\(/);
  assert.match(diagnostics, /getSheetByName\(/);
  assert.doesNotMatch(diagnostics, /getSheet_\(/);
});

test('orphan PICA counter is limited to Hazard-origin references', () => {
  assert.match(diagnostics, /row\.source \|\| ''\)\.toUpperCase\(\) === 'HAZARD'/);
});
