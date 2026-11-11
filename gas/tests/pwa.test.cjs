const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const manifest = fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.tsx'), 'utf8');
const vite = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
const buildValidator = fs.readFileSync(path.join(root, 'scripts', 'validate-pwa-build.mjs'), 'utf8');
const database = fs.readFileSync(path.join(root, 'src', 'core', 'db.ts'), 'utf8');

test('mobile web app manifest declares installable standalone HDOS scope', () => {
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.name, 'CGG HDOS Enterprise');
  assert.equal(parsed.short_name, 'CGG HDOS');
  assert.equal(parsed.display, 'standalone');
  assert.equal(parsed.start_url, './');
  assert.equal(parsed.scope, './');
  assert.ok(parsed.icons.some(icon => icon.src === './logo-cgg.png.jpeg' && icon.type === 'image/jpeg'));
});

test('HTML exposes manifest, mobile install metadata, and touch icon', () => {
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.ok(html.includes("rel=\"icon\" type=\"image/jpeg\" href=\"./logo-cgg.png.jpeg\""));
  assert.match(html, /theme-color/);
});

test('production frontend registers the service worker relative to the deployed base path', () => {
  assert.match(main, /import\.meta\.env\.PROD && 'serviceWorker' in navigator/);
  assert.match(main, /navigator\.serviceWorker\.register\(\`\$\{import\.meta\.env\.BASE_URL\}sw\.js\`/);
  assert.match(main, /updateViaCache: 'none'/);
});

test('service worker precaches app shell and built entry assets for offline reopening', () => {
  assert.match(worker, /fetch\(indexUrl, \{ cache: 'reload' \}\)/);
  assert.match(worker, /cache\.put\(indexUrl, response\.clone\(\)\)/);
  assert.match(worker, /const assetPaths = new Set/);
  assert.match(worker, /new URL\('manifest\.json', scopeUrl\)/);
  assert.match(worker, /assetPaths\.add\(assetEntry\.file\)/);
  assert.match(worker, /cache\.put\(assetUrl\.href, assetResponse\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
  assert.ok(worker.includes("new URL('logo-cgg.png.jpeg', scopeUrl)"));
});

test('Vite exposes the complete build graph for lazy-module offline precaching', () => {
  assert.match(vite, /manifest: 'manifest.json'/);
  assert.match(worker, /Array\.isArray\(assetEntry\.css\)/);
  assert.match(worker, /Array\.isArray\(assetEntry\.assets\)/);
});

test('production artifact validator checks the PWA shell and every manifest asset', () => {
  assert.match(buildValidator, /manifest\.webmanifest/);
  assert.match(buildValidator, /manifest\.json/);
  assert.match(buildValidator, /entry\.isEntry/);
  assert.match(buildValidator, /existsSync\(absolutePath\)/);
  assert.match(buildValidator, /out-of-scope asset/);
});

test('PWA cache upgrades remove stale HDOS shell versions', () => {
  assert.match(worker, /CACHE_NAME = CACHE_PREFIX \+ 'v4'/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
  assert.match(worker, /caches\.delete\(key\)/);
});

test('service worker never intercepts non-GET or cross-origin API requests', () => {
  assert.match(worker, /if \(request\.method !== 'GET'\) return/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /request\.destination\)\) return/);
  assert.match(worker, /if \(request\.mode === 'navigate'\)/);
  assert.match(worker, /cache\.match\(new URL\('index\.html', scopeUrl\)\.href\)/);
});

test('service worker keeps app assets same-origin and within its registration scope', () => {
  assert.match(worker, /assetUrl\.origin !== self\.location\.origin/);
  assert.match(worker, /assetUrl\.href\.startsWith\(scopeUrl\)/);
  assert.match(worker, /url\.href\.startsWith\(scopeUrl\.href\)/);
  assert.match(worker, /\['script', 'style', 'image', 'font'\]/);
});


test('uncached app assets return an explicit offline response instead of an empty service-worker result', () => {
  assert.match(worker, /\.catch\(\(\) => cached \|\| new Response\(/);
  assert.match(worker, /Aset HDOS ini belum tersimpan di cache/);
  assert.match(worker, /status: 503/);
  assert.match(worker, /Content-Type': 'text\/plain; charset=utf-8/);
});


test('mobile IndexedDB requests persistent browser storage without blocking startup', () => {
  assert.match(database, /const persistStorage = navigator\.storage\?\.persist/);
  assert.match(database, /persistStorage\.call\(navigator\.storage\)/);
  assert.match(database, /Persistent browser storage granted/);
  assert.match(database, /Persistent browser storage was not granted; keep regular backups/);
  assert.match(database, /Persistent storage request failed; continuing with browser defaults/);
  assert.ok(database.indexOf('resolve(openedDb)') > database.indexOf('persistStorage.call(navigator.storage)'));
});


test('sync module exposes offline storage usage, quota, and persistence status diagnostics', () => {
  const syncModule = fs.readFileSync(path.join(root, 'src', 'components', 'modules', 'SyncModule.tsx'), 'utf8');
  assert.match(syncModule, /navigator\.storage/);
  assert.match(syncModule, /storage\.estimate\(\)/);
  assert.match(syncModule, /storage\.persisted\(\)/);
  assert.match(syncModule, /Kapasitas Penyimpanan Offline Perangkat/);
  assert.match(syncModule, /Perlindungan eviksi/);
  assert.match(syncModule, /void refreshStorageStatus\(\)/);
});


test('CGG logo is used by app shell, desktop/mobile branding, and module loading states without white padding', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const login = fs.readFileSync(path.join(root, 'src', 'components', 'auth', 'LoginScreen.tsx'), 'utf8');
  const menu = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'MenuBar.tsx'), 'utf8');
  const windowWrapper = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'WindowWrapper.tsx'), 'utf8');
  const mobile = fs.readFileSync(path.join(root, 'src', 'components', 'mobile', 'IOSMobileSimulator.tsx'), 'utf8');
  assert.match(app, /import cggLogo from '\.\.\/logo-cgg\.png\.jpeg'/);
  for (const source of [app, login, menu, windowWrapper, mobile]) {
    assert.match(source, /alt="Logo CGG"/);
  }
  assert.match(app, /object-cover/);
  assert.match(login, /object-cover/);
  assert.doesNotMatch(app, /bg-white p-2 shadow/);
  assert.doesNotMatch(login, /bg-white p-2 shadow/);
  assert.doesNotMatch(menu, /bg-white p-0\.5/);
  assert.doesNotMatch(windowWrapper, /bg-white p-1/);
  assert.doesNotMatch(mobile, /bg-white p-0\.5/);
  assert.match(windowWrapper, /Memuat modul operasional/);
  assert.match(mobile, /Memuat modul operasional/);
});


test('desktop and iPhone shells provide responsive device framing and motion-aware polish', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const desktopWindow = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'WindowWrapper.tsx'), 'utf8');
  const mobile = fs.readFileSync(path.join(root, 'src', 'components', 'mobile', 'IOSMobileSimulator.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');
  const dock = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'Dock.tsx'), 'utf8');
  assert.match(app, /<MenuBar\s*\/>/);
  assert.match(app, /hdos-desktop-wallpaper/);
  assert.match(desktopWindow, /hdos-window/);
  assert.match(desktopWindow, /hdos-traffic-light/);
  assert.match(mobile, /hdos-iphone-stage/);
  assert.match(mobile, /hdos-iphone-shell/);
  assert.match(mobile, /hdos-dynamic-island/);
  assert.match(mobile, /hdos-home-indicator/);
  assert.match(styles, /@media \(min-width: 768px\)/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(dock, /hdos-macos-dock/);
});


test('glass UI remains enabled on mobile and desktop wallpaper supports visible glass refraction', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  assert.match(styles, /backdrop-filter: blur\(34px\) saturate\(175%\)/);
  assert.match(styles, /backdrop-filter: blur\(24px\) saturate\(165%\)/);
  assert.match(styles, /backdrop-filter: blur\(18px\) saturate\(155%\)/);
  assert.doesNotMatch(styles, /backdrop-filter: none/);
  assert.match(styles, /rgba\(255,255,255,\.22\)/);
  assert.match(app, /className="hdos-desktop-wallpaper fixed inset-0 pointer-events-none z-0" \/>/);
  assert.doesNotMatch(app, /hdos-desktop-wallpaper[\s\S]{0,180}style=\{\{/);
});

test('contractor and subcontractor comparison chart is available within each tenant scope', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src', 'components', 'modules', 'DashboardModule.tsx'), 'utf8');
  assert.match(dashboard, /const isOversight = companyCode === 'CGG' && sessionUser\?\.roleVerified === true/);
  assert.match(dashboard, /const canSeeCompanyComparison = isOwnerAdmin \|\| isOversight \|\| isContractor \|\| isSubcontractor/);
  assert.match(dashboard, /company\.companyRole === 'Subkon'/);
  assert.match(dashboard, /String\(company\.parentCompanyCode \|\| ''\)\.trim\(\)\.toUpperCase\(\) === companyCode/);
  assert.match(dashboard, /const tenantDashboardCodes = isContractor/);
  assert.match(dashboard, /roles\.includes\('Contractor'\)/);
  assert.match(dashboard, /roles\.includes\('Contractor PIC'\)/);
  assert.match(dashboard, /roles\.includes\('Company Admin'\)/);
  assert.match(dashboard, /isSubcontractor && companyCode \? \[companyCode\] : \[\]/);
  assert.match(dashboard, /Grafik siap — menunggu master perusahaan/);
  assert.match(dashboard, /\{canSeeCompanyComparison && \(/);
  assert.match(dashboard, /Perbandingan aktivitas perusahaan Anda dengan subkontraktor yang terdaftar di bawahnya/);
  assert.match(dashboard, /const dashboardInspections = store\.inspections\.filter\(recordInDashboardScope\)/);
  assert.match(dashboard, /const inspections = dashboardInspections\.filter/);
});
