const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = fs.readFileSync(
  path.join(__dirname, '..', 'Code.gs'),
  'utf8'
);

test('database readiness and recovery use one canonical schema validator', () => {
  assert.match(backend, /function validateDatabaseSpreadsheet_\(spreadsheet\)/);
  assert.match(backend, /const validation = validateDatabaseSpreadsheet_\(spreadsheet\)/);
  assert.match(backend, /schemaReady: validation\.valid/);
  assert.match(backend, /const recoveryValidation = validateDatabaseSpreadsheet_\(recoveredSpreadsheet\)/);
  assert.match(backend, /if \(!recoveryValidation\.valid\)/);
});

test('database backup is not marked successful until copied spreadsheet opens and schema validates', () => {
  const backupStart = backend.indexOf('function createDatabaseBackup()');
  const recoveryStart = backend.indexOf('function createDatabaseRecoveryCopy(', backupStart);
  assert.notEqual(backupStart, -1);
  assert.notEqual(recoveryStart, -1);
  const backup = backend.slice(backupStart, recoveryStart);
  const mimeCheck = backup.indexOf('verifiedBackup.getMimeType() !== MimeType.GOOGLE_SHEETS');
  const openCopy = backup.indexOf('SpreadsheetApp.openById(verifiedBackup.getId())');
  const schemaCheck = backup.indexOf('validateDatabaseSpreadsheet_(backupSpreadsheet)');
  const successLog = backup.indexOf("logSheet.appendRow([backupId, createdAt, verifiedBackup.getId()");
  assert.ok(mimeCheck >= 0);
  assert.ok(openCopy > mimeCheck);
  assert.ok(schemaCheck > openCopy);
  assert.ok(successLog > schemaCheck);
  assert.match(backup, /backupValidation\.missingSheets\.join\(', '\)/);
  assert.match(backup, /backupValidation\.invalidSheets\.join\(', '\)/);
});

test('recovery validation failure reports missing sheets and invalid schemas without undefined variables', () => {
  const start = backend.indexOf('function createDatabaseRecoveryCopy(backupFileId)');
  const end = backend.indexOf('function installDailyDatabaseBackupTrigger()', start);
  const recovery = backend.slice(start, end);
  assert.match(recovery, /recoveryValidation\.missingSheets\.join\(', '\)/);
  assert.match(recovery, /recoveryValidation\.invalidSheets\.join\(', '\)/);
  assert.doesNotMatch(recovery, /invalidSheets\.length/);
});
