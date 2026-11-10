const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const syncUiSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'SyncModule.tsx'),
  'utf8'
);

test('resolved sync audit entries do not count as actionable queue work', () => {
  assert.match(syncUiSource, /const actionableQueue = queue\.filter\(item => item\.status !== 'RESOLVED'\)/);
  assert.match(syncUiSource, /const resolvedQueueCount = queue\.length - actionableQueue\.length/);
  assert.match(syncUiSource, /disabled=\{syncing \|\| !online \|\| actionableQueue\.length === 0\}/);
  assert.match(syncUiSource, /Aktif: \{actionableQueue\.length\} · Arsip: \{resolvedQueueCount\}/);
});

test('manual sync failures are surfaced in the activity log without losing queue state', () => {
  const start = syncUiSource.indexOf('const handleTriggerSync = async () => {');
  const end = syncUiSource.indexOf('\n  };', start);
  assert.ok(start >= 0 && end > start);
  const handler = syncUiSource.slice(start, end);
  assert.match(handler, /try \{/);
  assert.match(handler, /await hdosSync\.retryFailedItems\(\)/);
  assert.match(handler, /await hdosSync\.triggerSync\(\)/);
  assert.match(handler, /catch \(error\)/);
  assert.match(handler, /Sinkronisasi gagal dijalankan/);
  assert.match(handler, /setQueue\(hdosSync\.getQueue\(\)\)/);
  assert.match(handler, /setSyncing\(hdosSync\.getIsSyncing\(\)\)/);
});
