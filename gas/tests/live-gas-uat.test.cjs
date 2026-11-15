const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const runnerUrl = pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'live-gas-uat.mjs')).href;

function runSmokeTest(readiness) {
  const preload = `
    globalThis.fetch = async (_url, options) => {
      const { path } = JSON.parse(options.body);
      const responses = {
        '/api/health/live': { success: true, data: { status: 'live', version: 'test' } },
        '/api/health/ready': ${JSON.stringify(readiness)},
        '/api/public/companies': { success: true, data: [] },
        '/api/me': { success: false, status: 401, message: 'Unauthorized' }
      };
      return new Response(JSON.stringify(responses[path]), { status: 200 });
    };
    process.env.HDOS_GAS_URL = 'https://script.google.com/macros/s/test/exec';
    process.env.HDOS_UAT_ACCOUNTS_JSON = '[]';
    await import(${JSON.stringify(runnerUrl)});
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', preload], { encoding: 'utf8' });
}

function readResult(stdout) {
  const marker = 'UAT_RESULT_JSON=';
  const resultStart = stdout.indexOf(marker);
  assert.notEqual(resultStart, -1, stdout);
  return JSON.parse(stdout.slice(resultStart + marker.length));
}

test('explicit backend not_ready is a warning in the read-only smoke test', () => {
  const result = runSmokeTest({
    success: true,
    data: {
      status: 'not_ready',
      checks: { spreadsheetAccessible: true, schemaReady: false },
      message: 'Readiness belum READY.'
    }
  });

  assert.equal(result.status, 0, result.stderr);
  const output = readResult(result.stdout);
  assert.equal(output.failed, 0);
  assert.equal(output.results.find(item => item.name === 'health/ready').status, 'WARN');
});

test('unavailable readiness response remains a smoke-test failure', () => {
  const result = runSmokeTest({ success: false, status: 503, message: 'Unavailable' });

  assert.equal(result.status, 1, result.stderr);
  const output = readResult(result.stdout);
  assert.equal(output.failed, 1);
  assert.equal(output.results.find(item => item.name === 'health/ready').status, 'FAIL');
});
