const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const syncSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'core', 'sync.ts'),
  'utf8'
);

test('Contractor SIA queue replays CREATE only and quarantines unsupported UPDATE/DELETE', () => {
  const createStart = syncSource.indexOf("if (\n            item.action === 'CREATE'");
  const updateStart = syncSource.indexOf("} else if (\n            item.action === 'UPDATE'", createStart);
  const deleteStart = syncSource.indexOf("} else if (item.action === 'DELETE'", updateStart);
  const successStart = syncSource.indexOf('await hdosDB.delete(\n            \'queue\'', deleteStart);

  assert.ok(createStart >= 0, 'CREATE replay branch must exist');
  assert.ok(updateStart > createStart, 'UPDATE replay branch must follow CREATE');
  assert.ok(deleteStart > updateStart, 'DELETE replay branch must follow UPDATE');
  assert.ok(successStart > deleteStart, 'queue success handling must follow DELETE');

  const createBranch = syncSource.slice(createStart, updateStart);
  const updateBranch = syncSource.slice(updateStart, deleteStart);
  const deleteBranch = syncSource.slice(deleteStart, successStart);

  assert.match(createBranch, /endpoint === 'contractor-sia'/);
  assert.match(createBranch, /uploadOfflineContractorSia\(localDocument\)/);
  assert.match(createBranch, /localDocument\.kind !== 'contractor-sia'/);
  assert.match(updateBranch, /endpoint === 'contractor-sia'\) throw new Error\('Antrean Contractor hanya mendukung operasi CREATE\.'/);
  assert.match(deleteBranch, /endpoint === 'contractor-sia'\) throw new Error\('Antrean Contractor tidak mendukung penghapusan otomatis\.'/);
});

test('Unsupported Contractor SIA queue actions are retained as conflicts instead of silently removed', () => {
  const catchStart = syncSource.indexOf('} catch (error) {', syncSource.indexOf("endpoint === 'contractor-sia'"));
  assert.ok(catchStart >= 0);
  const catchBranch = syncSource.slice(catchStart, catchStart + 1300);
  assert.match(catchBranch, /item\.status = retryable && item\.retryCount < MAX_RETRIES\s*\? 'PENDING'\s*:\s*'CONFLICT'/);
  assert.match(catchBranch, /item\.error = error instanceof Error \? error\.message : String\(error\)/);
  assert.match(catchBranch, /await hdosDB\.put\(\s*'queue',\s*item\s*\)/);
});
