const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'components', 'mobile', 'IOSMobileSimulator.tsx'),
  'utf8'
);

test('mobile secondary navigation only lists modules allowed by the shared access policy', () => {
  assert.match(mobileSource, /import \{ canAccessModule, type HDOSModule \} from '\.\.\/\.\.\/core\/access-policy'/);
  assert.match(mobileSource, /\.filter\(\(\[tab\]\) => canAccessModule\(currentUser, tab\)\)/);
  for (const moduleName of ['incident', 'repository', 'contractor', 'ai', 'sync', 'settings']) {
    assert.match(mobileSource, new RegExp(`canAccessModule\\(currentUser, tab\\)`));
    assert.ok(mobileSource.includes(`['incident', 'repository', 'contractor', 'ai', 'sync', 'settings']`));
  }
});

test('mobile primary navigation protects every direct module entry point', () => {
  for (const moduleName of ['dashboard', 'inspection', 'hazard', 'map', 'pica']) {
    assert.ok(
      mobileSource.includes(`canAccessModule(currentUser, '${moduleName}') && <button`),
      `Expected ${moduleName} mobile entry to use the shared access policy`
    );
  }
});

test('mobile workspace returns to an authorized default when the active role loses access', () => {
  assert.match(mobileSource, /useEffect\(\(\) => \{\s*if \(!canAccessModule\(currentUser, activeTab\)\) \{\s*setActiveTab\('dashboard'\)/);
  assert.match(mobileSource, /currentUser\?\.roleVerified, roleKey, activeTab/);
});

test('mobile content rendering is guarded independently from navigation visibility', () => {
  for (const moduleName of ['dashboard', 'inspection', 'map', 'repository', 'pica', 'hazard', 'ai', 'incident', 'contractor', 'sync', 'settings']) {
    assert.ok(
      mobileSource.includes(`activeTab === '${moduleName}' && canAccessModule(currentUser, '${moduleName}') &&`),
      `Expected ${moduleName} mobile content to require authorization at render time`
    );
  }
});

test('mobile workspace exposes logout and delegates to the central session handler', () => {
  assert.match(mobileSource, /interface IOSMobileSimulatorProps\s*\{\s*onLogout: \(\) => void/);
  assert.match(mobileSource, /onClick=\{onLogout\}/);
  assert.match(mobileSource, /aria-label="Keluar dari akun"/);
  const appSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'App.tsx'),
    'utf8'
  );
  assert.match(appSource, /<IOSMobileSimulator onLogout=\{handleLogout\} \/>/);
});
