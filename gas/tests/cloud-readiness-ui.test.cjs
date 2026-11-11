const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const apiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'api.ts'), 'utf8');
const syncUiSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'SyncModule.tsx'), 'utf8');
const gasSource = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

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
  assert.match(syncUiSource, /Status ini hanya memeriksa kesiapan konfigurasi/);
});

test('cloud readiness failure is visible and does not mark the backend ready', () => {
  assert.match(syncUiSource, /status: 'unavailable'/);
  assert.match(syncUiSource, /status: result\.status/);
  assert.match(syncUiSource, /error instanceof Error \? error\.message/);
});
