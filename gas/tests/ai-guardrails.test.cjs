const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const ai = fs.readFileSync(path.join(root, 'src', 'core', 'ai.ts'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'src', 'components', 'modules', 'AIModule.tsx'), 'utf8');

test('AI vision is explicitly a demo and cannot create operational hazard records', () => {
  assert.match(ai, /DEMO ONLY: this deterministic sample does not inspect imageUrl/);
  assert.match(moduleSource, /DEMO SIMULASI — BUKAN HASIL ANALISIS FOTO/);
  assert.match(moduleSource, /Hasil ini hanya simulasi demonstrasi/);
  assert.doesNotMatch(moduleSource, /await createHazardAction\(/);
  assert.doesNotMatch(moduleSource, /CAM-PIT-JAJA-04 · LIVE SENSOR FEED/);
});

test('AI document parser is not represented as actual file upload or parsing', () => {
  assert.match(moduleSource, /Upload dan parsing dokumen aktual belum tersedia/);
  assert.match(moduleSource, /Contoh Template Formulir \(Simulasi\)/);
});

test('rule-based SMKP guidance does not invent KTT PICA closure approval or generic slope factors', () => {
  assert.match(ai, /Alur PICA HDOS berakhir pada persetujuan SPV HSE; KTT bukan tahap persetujuan penutupan PICA/);
  assert.doesNotMatch(ai, /diverifikasi oleh KTT sebelum penutupan status/);
  assert.match(ai, /Jangan menggunakan angka FK generik sebagai pengganti kajian geoteknik yang disahkan/);
});

test('inspection records never substitute hard-coded sample GPS coordinates', () => {
  const inspection = fs.readFileSync(path.join(root, 'src', 'components', 'modules', 'InspectionModule.tsx'), 'utf8');
  assert.match(inspection, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(inspection, /Never substitute hard-coded sample coordinates/);
  assert.doesNotMatch(inspection, /lat: -2\.9395/);
  assert.doesNotMatch(inspection, /51S 385100 mE 9674800 mN/);
});
