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

test('mobile web app manifest declares installable standalone HDOS scope', () => {
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.name, 'CGG HDOS Enterprise');
  assert.equal(parsed.short_name, 'CGG HDOS');
  assert.equal(parsed.display, 'standalone');
  assert.equal(parsed.start_url, './');
  assert.equal(parsed.scope, './');
  assert.ok(parsed.icons.some(icon => icon.src === './icons/hdos-icon.svg'));
});

test('HTML exposes manifest, mobile install metadata, and touch icon', () => {
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /rel="apple-touch-icon"/);
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
});

test('Vite exposes the complete build graph for lazy-module offline precaching', () => {
  assert.match(vite, /manifest: 'manifest.json'/);
  assert.match(worker, /Array\.isArray\(assetEntry\.css\)/);
  assert.match(worker, /Array\.isArray\(assetEntry\.assets\)/);
});

test('PWA cache upgrades remove stale HDOS shell versions', () => {
  assert.match(worker, /CACHE_NAME = CACHE_PREFIX \+ 'v2'/);
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
