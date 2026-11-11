const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backupSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'core', 'backup.ts'),
  'utf8'
);


test('Subkon backup scope is restricted to its own company and does not inherit parent or sibling data', () => {
  const start = backupSource.indexOf('function recordTenantMatches(');
  const end = backupSource.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start);
  const helper = backupSource.slice(start, end + 2);
  assert.match(helper, /if \(owner\.parentCompanyCode\)/);
  assert.match(helper, /return company === owner\.companyCode \|\| subkon === owner\.companyCode/);
  assert.doesNotMatch(helper, /codes\.includes\(owner\.parentCompanyCode\)/);
  assert.doesNotMatch(helper, /company === owner\.parentCompanyCode/);
  assert.match(helper, /parent === owner\.companyCode/);
});

test('Contractor root backup retains its own and registered Subkon records', () => {
  const start = backupSource.indexOf('function recordTenantMatches(');
  const end = backupSource.indexOf('\n}\n', start);
  const helper = backupSource.slice(start, end + 2);
  assert.match(helper, /company === owner\.companyCode \|\| subkon === owner\.companyCode \|\| parent === owner\.companyCode/);
  assert.match(helper, /!company && !subkon && !parent/);
});

test('Admin CGG backup includes all authorized company tenants', () => {
  assert.match(backupSource, /const isAdminCGG = \(user\.roles \|\| \[\]\)\.includes\('Admin CGG'\)/);
  assert.match(backupSource, /if \(isAdminCGG && companyCode !== 'CGG'\)/);
  const start = backupSource.indexOf('function recordTenantMatches(');
  const end = backupSource.indexOf('\n}\n', start);
  const helper = backupSource.slice(start, end + 2);
  assert.match(helper, /if \(owner\.isAdminCGG\) return true/);
  assert.match(backupSource, /archive\.owner\.isAdminCGG === true && !owner\.isAdminCGG/);
  // Queue entries and binary attachments remain bound to the exporting user.
  assert.match(backupSource, /item\.ownerUserId === owner\.userId && item\.ownerCompanyCode === owner\.companyCode/);
  assert.match(backupSource, /photo\.ownerUserId === owner\.userId/);
});

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

test('restore is add-only, preserves existing local IDs, and applies inserts atomically', () => {
  assert.match(backupSource, /Add-only restore/);
  assert.match(backupSource, /await hdosDB\.insertSnapshotBundle\(changes\)/);
  assert.match(backupSource, /skipped \+= result\.skipped/);
  const dbSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'core', 'db.ts'), 'utf8');
  assert.match(dbSource, /async insertSnapshotBundle\(/);
  assert.match(dbSource, /const request = store\.get\(record\.id\)/);
  assert.match(dbSource, /if \(request\.result === undefined\)/);
  assert.match(dbSource, /store\.put\(record\)/);
  assert.match(dbSource, /else \{\s*skipped\+\+;/);
});

test('restore rejects backups created by a different user account, even in the same tenant', () => {
  assert.match(backupSource, /archive\.owner\.userId !== owner\.userId/);
  assert.match(backupSource, /Backup dibuat oleh akun pengguna yang berbeda/);
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


test('restore validates both operational-photo and SIA attachment type and fleet references before any local write', () => {
  assert.match(backupSource, /const restoredPhotos = new Map/);
  assert.match(backupSource, /queuePayload\.localPhotoId/);
  assert.match(backupSource, /photo\.kind === 'contractor-sia'/);
  assert.match(backupSource, /queuePayload\.localDocumentId/);
  assert.match(backupSource, /document\.kind !== 'contractor-sia'/);
  assert.match(backupSource, /document\.fleetId !== queuePayload\.fleetId/);
  const validationIndex = backupSource.indexOf('const restoredPhotos = new Map');
  const writeIndex = backupSource.indexOf('await hdosDB.insertSnapshotBundle(changes)');
  assert.ok(validationIndex >= 0 && writeIndex > validationIndex, 'attachment validation must precede the atomic restore write');
});


test('backup export and restore exclude records explicitly owned by another local account', () => {
  assert.match(backupSource, /function recordUserMatches\(record: unknown, owner: BackupOwner\)/);
  assert.match(backupSource, /userId === owner\.userId/);
  assert.match(backupSource, /recordUserMatches\(value, owner\) && recordTenantMatches\(value, owner\)/);
  assert.match(backupSource, /!recordUserMatches\(item, owner\) \|\| !recordTenantMatches\(item, owner\)/);
});


test('restore refuses Blob attachments when IndexedDB is unavailable instead of losing binary bytes in localStorage', () => {
  assert.match(backupSource, /const hasBinaryAttachments =/);
  assert.match(backupSource, /\(record as Record<string, unknown>\)\.blob instanceof Blob/);
  assert.match(backupSource, /typeof window === 'undefined' \|\| !window\.indexedDB/);
  assert.match(backupSource, /Perangkat tidak menyediakan IndexedDB/);
  const guardIndex = backupSource.indexOf('const hasBinaryAttachments =');
  const writeIndex = backupSource.indexOf('await hdosDB.insertSnapshotBundle(changes)');
  assert.ok(guardIndex >= 0 && writeIndex > guardIndex, 'Blob storage capability must be checked before restore writes');
});
