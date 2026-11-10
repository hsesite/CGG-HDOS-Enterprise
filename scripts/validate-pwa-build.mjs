import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const dist = resolve('dist');
const requiredFiles = [
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'manifest.json',
  'icons/hdos-icon.svg',
];

for (const relativePath of requiredFiles) {
  const absolutePath = resolve(dist, relativePath);
  if (!absolutePath.startsWith(dist + sep) || !existsSync(absolutePath)) {
    throw new Error(`PWA production artifact is missing: ${relativePath}`);
  }
}

const buildManifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
const entries = Object.values(buildManifest);
if (!entries.length || !entries.some(entry => entry && entry.isEntry && /\.js$/.test(entry.file || ''))) {
  throw new Error('Vite build manifest does not contain a JavaScript entry point.');
}

const emittedAssets = new Set();
for (const entry of entries) {
  if (!entry || typeof entry !== 'object') continue;
  if (typeof entry.file === 'string') emittedAssets.add(entry.file);
  if (Array.isArray(entry.css)) entry.css.forEach(file => {
    if (typeof file === 'string') emittedAssets.add(file);
  });
  if (Array.isArray(entry.assets)) entry.assets.forEach(file => {
    if (typeof file === 'string') emittedAssets.add(file);
  });
}

for (const relativePath of emittedAssets) {
  const absolutePath = resolve(dist, relativePath);
  if (!absolutePath.startsWith(dist + sep) || !existsSync(absolutePath)) {
    throw new Error(`Vite manifest references a missing or out-of-scope asset: ${relativePath}`);
  }
}

console.log(`PWA build validation passed: ${requiredFiles.length} shell files and ${emittedAssets.size} manifest assets are present.`);
