const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'),
  'utf8'
);

test('a committed cloud mutation remains retryable if local acknowledgement or version propagation fails', () => {
  assert.match(source, /let cloudMutationCommitted = false;\s*try \{/);
  assert.match(source, /await hseApi\.createContractorP2HRecord[\s\S]{0,160}cloudMutationCommitted = true;/);
  assert.match(source, /await hseApi\.submitContractorComplianceReport[\s\S]{0,160}cloudMutationCommitted = true;/);
  assert.match(source, /const serverRecord = await hseApi\.create[\s\S]{0,180}cloudMutationCommitted = true;/);
  assert.match(source, /const serverRecord = await hseApi\.update[\s\S]{0,180}cloudMutationCommitted = true;/);
  assert.match(source, /await hseApi\.deleteOperationalRecord[\s\S]{0,120}cloudMutationCommitted = true;/);
  assert.match(source, /const retryable = cloudMutationCommitted \|\| isRetryableSyncError\(error\)/);
});

test('retry after a committed cloud mutation preserves the idempotent queue payload', () => {
  const catchStart = source.indexOf('} catch (error) {', source.indexOf('cloudMutationCommitted = true;'));
  const catchEnd = source.indexOf('await hdosDB.put(', catchStart);
  const handler = source.slice(catchStart, catchEnd);
  assert.match(handler, /item\.retryCount \+= 1/);
  assert.match(handler, /retryable && item\.retryCount < MAX_RETRIES/);
  assert.doesNotMatch(handler, /delete\s+item\.payload/);
});
