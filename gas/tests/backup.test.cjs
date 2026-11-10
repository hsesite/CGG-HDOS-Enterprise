const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backupSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'core', 'backup.ts'),
  'utf8'
);

test('backup serializes Blob attachments with MIME type and restores them as Blob', () => {
  assert.match(backupSource, /value instanceof Blob/);
  assert.match(backupSource, /__hdosBackupBinary: 'blob'/);
  assert.match(backupSource, /type: value\.type/);
  assert.match(backupSource, /new Blob\(\[bytes\], \{ type:/);
});

test('backup preserves ArrayBuffer attachments through export and restore', () => {
  assert.match(backupSource, /value instanceof ArrayBuffer/);
  assert.match(backupSource, /__hdosBackupBinary: 'arraybuffer'/);
  assert.match(backupSource, /:\s*bytes\.buffer/);
});

test('binary conversion traverses nested records and arrays', () => {
  assert.match(backupSource, /Array\.isArray\(value\)\) return Promise\.all\(value\.map\(encodeBinary\)\)/);
  assert.match(backupSource, /Object\.entries\(value as Record<string, unknown>\)/);
  assert.match(backupSource, /Object\.entries\(item\)\.map\(\(\[key, child\]\)/);
});

test('backup checksum is calculated from the canonical serialized payload', () => {
  assert.match(backupSource, /const canonicalPayload = JSON\.parse\(JSON\.stringify\(payload\)\)/);
  assert.match(backupSource, /checksum\(canonicalPayload\)/);
  assert.match(backupSource, /const expected = await checksum\(payload\)/);
  assert.match(backupSource, /expected !== archive\.checksum/);
});

test('backup excludes device configuration and scopes queued work to its originating account', () => {
  assert.match(backupSource, /if \(storeName === 'config'\) continue/);
  assert.match(backupSource, /item\.ownerUserId === owner\.userId && item\.ownerCompanyCode === owner\.companyCode/);
});

test('backup restore rejects another company or parent-company scope', () => {
  assert.match(backupSource, /archive\.owner\.companyCode !== owner\.companyCode/);
  assert.match(backupSource, /archive\.owner\.parentCompanyCode !== owner\.parentCompanyCode/);
});

test('restore is merge-only and applies validated changes atomically', () => {
  assert.match(backupSource, /Merge-only restore/);
  assert.match(backupSource, /deleteIds: \[\]/);
  assert.match(backupSource, /await hdosDB\.reconcileSnapshotBundle\(changes\)/);
});

test('in-flight queue items are reset to pending when restored', () => {
  assert.match(backupSource, /item\.status === 'SYNCING'/);
  assert.match(backupSource, /item\.status = 'PENDING'/);
  assert.match(backupSource, /delete item\.syncStartedAt/);
});

test('backup export enforces the same 100 MB limit as restore after binary encoding', () => {
  assert.match(backupSource, /const serialized = JSON\.stringify\(archive\)/);
  assert.match(backupSource, /const backupBlob = new Blob\(\[serialized\], \{ type: 'application\/json' \}\)/);
  assert.match(backupSource, /backupBlob\.size <= 0 \|\| backupBlob\.size > MAX_BACKUP_BYTES/);
  assert.match(backupSource, /Backup melebihi batas 100 MB setelah lampiran dikodekan/);
  assert.match(backupSource, /file\.size > MAX_BACKUP_BYTES/);
});


test('backup captures all local stores from one IndexedDB readonly snapshot', () => {
  assert.match(backupSource, /const localSnapshot = await hdosDB\.getAllBundle\(includedStores\)/);
  assert.match(backupSource, /const all = \(localSnapshot\[storeName\] \|\| \[\]\) as unknown\[\]/);
  assert.doesNotMatch(backupSource, /const all = await hdosDB\.getAll/);
});

test('restore validates archive metadata and rejects unknown store names', () => {
  assert.match(backupSource, /typeof archive\.owner\.userId !== 'string'/);
  assert.match(backupSource, /Number\.isFinite\(Date\.parse\(archive\.createdAt\)\)/);
  assert.match(backupSource, /!\/\^\[a-f0-9\]\{64\}\$\/i\.test\(archive\.checksum\)/);
  assert.match(backupSource, /allowedStores\.has\(key as StoreName\)/);
});

test('restore rejects duplicate record IDs instead of silently overwriting archive entries', () => {
  assert.match(backupSource, /const seenIds = new Set<string>\(\)/);
  assert.match(backupSource, /if \(seenIds\.has\(item\.id\)\)/);
  assert.match(backupSource, /Backup memiliki ID duplikat/);
});

test('restore validates offline photo and Contractor SIA Blob metadata before writing', () => {
  assert.match(backupSource, /item\.blob instanceof Blob/);
  assert.match(backupSource, /item\.blob\.type !== item\.mimeType/);
  assert.match(backupSource, /item\.blob\.size !== item\.size/);
  assert.match(backupSource, /const maxBytes = isSia \? 10 \* 1024 \* 1024 : 5 \* 1024 \* 1024/);
  assert.match(backupSource, /item\.fleetId !== 'string'/);
  assert.match(backupSource, /Lampiran pada backup modul photos tidak valid/);
});
