const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const apiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'api.ts'), 'utf8');
const syncUiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'SyncModule.tsx'), 'utf8');
const gasSource = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

const mapSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'MapModule.tsx'), 'utf8');

test('GIS risk markers and active finding counts derive from the current Hazard register', () => {
  assert.match(mapSource, /store\.hazards\.filter\(hazard =>[\s\S]*?hazard\.status !== 'CLOSED'/);
  assert.match(mapSource, /hazard\.riskMatrix\.level === 'CRITICAL'/);
  assert.match(mapSource, /hazard\.riskMatrix\.level === 'HIGH'/);
  assert.match(mapSource, /locationRiskById\.get\(location\.id\)/);
  assert.match(mapSource, /Temuan aktif:/);
  assert.doesNotMatch(mapSource, /location\.safetyStatus === 'ALERT'/);
});

test('frontend exposes the read-only GAS readiness endpoint without requiring a session token', () => {
  assert.match(apiSource, /async checkCloudReadiness\(\): Promise<CloudReadiness>/);
  assert.match(apiSource, /request<CloudReadiness>\('GET', '\/api\/health\/ready', undefined, null\)/);
  assert.match(gasSource, /path === '\/api\/health\/ready' && method === 'GET'/);
});

test('sync workspace distinguishes device connectivity from actual GAS backend readiness', () => {
  assert.match(syncUiSource, /Koneksi perangkat:/);
  assert.match(syncUiSource, /Kesiapan Backend Google Apps Script/);
  assert.match(syncUiSource, /BACKEND READY/);
  assert.match(syncUiSource, /NOT READY/);
  assert.match(syncUiSource, /UNAVAILABLE/);
  assert.match(syncUiSource, /Spreadsheet/);
  assert.match(syncUiSource, /Struktur sheet/);
  assert.match(syncUiSource, /Google OAuth/);
  assert.match(syncUiSource, /Kebijakan email CGG/);
  assert.match(syncUiSource, /Backup sukses ≤30 jam/);
  assert.match(syncUiSource, /Status ini memeriksa konfigurasi backend, akses folder backup Drive, trigger backup harian, dan backup sukses dalam 30 jam terakhir/);
});

test('backend readiness requires an accessible backup folder and installed daily backup trigger', () => {
  assert.match(gasSource, /backupFolderAccessible = Boolean\(backupFolder && backupFolder\.getId\(\) === backupFolderId\)/);
  assert.match(gasSource, /trigger\.getHandlerFunction\(\) === 'createDatabaseBackup'/);
  assert.match(gasSource, /const backupReady = backupFolderAccessible && dailyBackupTriggerInstalled && recentSuccessfulBackup/);
  assert.match(gasSource, /function isAccessibleDatabaseBackupFile_\(fileId, backupFolderId\)/);
  assert.match(gasSource, /file\.getMimeType\(\) !== MimeType\.GOOGLE_SHEETS/);
  assert.match(gasSource, /parents\.next\(\)\.getId\(\) === backupFolderId/);
  assert.match(gasSource, /&& backupReady/);
  assert.match(apiSource, /backupFolderAccessible: boolean/);
  assert.match(apiSource, /dailyBackupTriggerInstalled: boolean/);
  assert.match(apiSource, /recentSuccessfulBackup: boolean/);
  assert.match(syncUiSource, /Folder backup Drive/);
  assert.match(syncUiSource, /Trigger backup harian/);
  assert.match(syncUiSource, /Backup sukses ≤30 jam/);
});

test('cloud readiness failure is visible and does not mark the backend ready', () => {
  assert.match(syncUiSource, /status: 'unavailable'/);
  assert.match(syncUiSource, /status: result\.status/);
  assert.match(syncUiSource, /error instanceof Error \? error\.message/);
});

test('backend setup and both health routes expose one consistent release identifier', () => {
  assert.doesNotMatch(gasSource, /C-1E-[BC]/);
  assert.equal((gasSource.match(/version:\s*'C-1E-E'/g) || []).length, 2);
  assert.match(gasSource, /HDOS C-1E-E setup selesai/);
});
