const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const moduleSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'components', 'modules', 'InspectionModule.tsx'),
  'utf8'
);
const storeSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'core', 'store.ts'),
  'utf8'
);

test('built-in and Repository inspection flows require an evidence photo saved for offline replay', () => {
  assert.match(moduleSource, /if \(!inspectionPhoto\)/);
  assert.match(moduleSource, /saveOfflineOperationalPhoto\(inspectionPhoto\)/);
  assert.match(moduleSource, /Foto bukti pemeriksaan wajib dilampirkan/);
  assert.match(storeSource, /!inspection\.localPhotoId && !\(inspection\.photoFileId && inspection\.photoUrl\)/);
});

test('failed inspection findings require a real PICA owner and target date before local queueing', () => {
  assert.match(moduleSource, /failedItems\.length > 0 &&[\s\S]*?picaDepartment\.trim\(\)[\s\S]*?picaPicName\.trim\(\)[\s\S]*?picaPicEmail\.trim\(\)[\s\S]*?picaTargetDate/);
  assert.match(storeSource, /failedItems\.length > 0 &&[\s\S]*?inspection\.picaDepartment[\s\S]*?inspection\.picaPicName[\s\S]*?inspection\.picaPicEmail[\s\S]*?inspection\.picaTargetDate/);
  assert.match(storeSource, /assignedToEmail: String\(inspection\.picaPicEmail \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.doesNotMatch(storeSource, /PIC Belum Ditentukan/);
});

test('default inspection submit is duplicate guarded and always releases its submitting state', () => {
  const start = moduleSource.indexOf('const handleSubmit = async');
  const end = moduleSource.indexOf('\n  return (', start);
  const handler = moduleSource.slice(start, end);
  assert.match(handler, /if \(submittingRef\.current\) return/);
  assert.match(handler, /submittingRef\.current = true/);
  assert.match(handler, /finally \{[\s\S]*?submittingRef\.current = false/);
});
