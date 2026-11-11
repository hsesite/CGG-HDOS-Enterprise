const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const syncSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'),
  'utf8'
);

test('legacy queue entries without a complete owner identity are quarantined regardless of retry count', () => {
  const start = syncSource.indexOf('let quarantinedCount = 0;');
  const end = syncSource.indexOf('this.queue = owner ?', start);
  assert.ok(start >= 0 && end > start);
  const recovery = syncSource.slice(start, end);

  assert.match(recovery, /\(!item\.ownerUserId \|\| !item\.ownerCompanyCode\) && item\.status !== 'CONFLICT'/);
  assert.match(recovery, /item\.status = 'CONFLICT'/);
  assert.match(recovery, /item\.retryCount = MAX_RETRIES/);
  assert.match(recovery, /Item offline lama tidak memiliki identitas pemilik/);
  assert.doesNotMatch(recovery, /item\.retryCount < MAX_RETRIES/);
});

test('ownerless legacy queue entries are never assigned to the currently logged-in account', () => {
  assert.match(
    syncSource,
    /storedQueue\.filter\(item => item\.ownerUserId === owner\.userId && item\.ownerCompanyCode === owner\.companyCode\)/
  );
  assert.match(syncSource, /ownerless|identitas pemilik/i);
});

test('recovery writes remain bound to the active initialization generation and account', () => {
  const start = syncSource.indexOf('const recoverInterruptedQueue = async');
  const end = syncSource.indexOf('if (owner && typeof navigator', start);
  assert.ok(start >= 0 && end > start);
  const recovery = syncSource.slice(start, end);
  assert.match(recovery, /abandonStaleInitialization\(\)/);
  assert.match(recovery, /item\.ownerUserId !== owner\?\.userId/);
  assert.match(recovery, /item\.ownerCompanyCode !== owner\?\.companyCode/);
});
