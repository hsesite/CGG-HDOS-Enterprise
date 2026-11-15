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

test('database backup comparison detects changed cell values even when dimensions and headers match', () => {
  const vm = require('node:vm');
  const start = backend.indexOf('function normalizeDatabaseCellForComparison_');
  const end = backend.indexOf('\nfunction getHealthReadiness_', start);
  assert.ok(start >= 0 && end > start);
  const context = { CONFIG: { SHEETS: ['hazards'] }, Date, String, Math };
  vm.createContext(context);
  vm.runInContext(backend.slice(start, end) + '\nthis.compareDatabaseSpreadsheetSnapshots_ = compareDatabaseSpreadsheetSnapshots_;', context);

  const makeSheet = values => ({
    getLastRow: () => values.length,
    getLastColumn: () => values[0]?.length || 0,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => values.slice(row - 1, row - 1 + rowCount)
        .map(line => line.slice(column - 1, column - 1 + columnCount))
    })
  });
  const makeSpreadsheet = values => ({
    getSheetByName: name => name === 'hazards' || name === 'repository' ? makeSheet(values) : null
  });

  const source = [['id', 'status'], ['HZ-1', 'OPEN'], ['HZ-2', 'CLOSED']];
  const exactCopy = [['id', 'status'], ['HZ-1', 'OPEN'], ['HZ-2', 'CLOSED']];
  const alteredCopy = [['id', 'status'], ['HZ-1', 'OPEN'], ['HZ-2', 'OPEN']];
  assert.equal(context.compareDatabaseSpreadsheetSnapshots_(makeSpreadsheet(source), makeSpreadsheet(exactCopy)).valid, true);
  const altered = context.compareDatabaseSpreadsheetSnapshots_(makeSpreadsheet(source), makeSpreadsheet(alteredCopy));
  assert.equal(altered.valid, false);
  assert.match(altered.mismatches.join(' '), /isi berbeda pada baris/);
});

test('database backup comparison reads large sheets in bounded chunks', () => {
  assert.match(backend, /const chunkSize = 500/);
  assert.match(backend, /for \(let startRow = 2; startRow <= sourceLastRow; startRow \+= chunkSize\)/);
  assert.match(backend, /normalizeDatabaseCellForComparison_\(sourceValues\[row\]\[column\]\)/);
});

test('database readiness detects a recent successful backup and rejects stale or failed backup logs', () => {
  const vm = require('node:vm');
  const start = backend.indexOf('function hasRecentSuccessfulDatabaseBackup_(');
  const end = backend.indexOf('\nfunction getHealthReadiness_()', start);
  assert.ok(start >= 0 && end > start);
  const context = { Date, Math, Number, String };
  vm.createContext(context);
  vm.runInContext(backend.slice(start, end), context);

  const headers = ['id', 'createdAt', 'fileId', 'fileName', 'status', 'triggeredBy', 'message'];
  let record = ['b1', new Date().toISOString(), 'drive-file-1', 'backup', 'SUCCESS', 'SCRIPT', 'verified'];
  const sheet = {
    getLastRow: () => 2,
    getLastColumn: () => headers.length,
    getRange: (row, column, rowCount, columnCount) => ({
      getValues: () => [ (row === 1 ? headers : record).slice(column - 1, column - 1 + columnCount) ]
    })
  };
  const spreadsheet = { getSheetByName: name => name === 'backup_logs' ? sheet : null };
  assert.equal(context.hasRecentSuccessfulDatabaseBackup_(spreadsheet, 30), true);
  record = ['b1', '2020-01-01T00:00:00.000Z', 'drive-file-1', 'backup', 'SUCCESS', 'SCRIPT', 'verified'];
  assert.equal(context.hasRecentSuccessfulDatabaseBackup_(spreadsheet, 30), false);
  record = ['b1', new Date().toISOString(), 'drive-file-1', 'backup', 'FAILED', 'SCRIPT', 'failed'];
  assert.equal(context.hasRecentSuccessfulDatabaseBackup_(spreadsheet, 30), false);
  record = ['b1', new Date().toISOString(), '', 'backup', 'SUCCESS', 'SCRIPT', 'missing file id'];
  assert.equal(context.hasRecentSuccessfulDatabaseBackup_(spreadsheet, 30), false);
});

test('recovery validation failure reports missing sheets and invalid schemas without undefined variables', () => {
  const start = backend.indexOf('function createDatabaseRecoveryCopy(backupFileId)');
  const end = backend.indexOf('function installDailyDatabaseBackupTrigger()', start);
  const recovery = backend.slice(start, end);
  assert.match(recovery, /recoveryValidation\.missingSheets\.join\(', '\)/);
  assert.match(recovery, /recoveryValidation\.invalidSheets\.join\(', '\)/);
  assert.doesNotMatch(recovery, /invalidSheets\.length/);
});
