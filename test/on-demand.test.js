'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

function filesBelow(directory, prefix) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(function(entry) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.join(prefix || '', entry.name);
    return entry.isDirectory()
      ? filesBelow(absolutePath, relativePath)
      : [relativePath];
  });
}

test('package installs no background service, cron job, or persistent config', function() {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'gl-plugin.json'),
    'utf8'
  ));
  const overlayFiles = filesBelow(path.join(projectRoot, 'overlay')).sort();

  assert.equal(manifest.lifecycle, undefined);
  assert.deepEqual(overlayFiles, [
    path.join('usr', 'share', 'licenses', 'gl-sdk4-ui-starlink-monitor', 'THIRD_PARTY_NOTICES.md'),
    path.join('www', 'cgi-bin', 'gl-starlink-monitor'),
  ]);
});

test('router proxy is read-only and uses tmpfs for each response', function() {
  const proxy = fs.readFileSync(
    path.join(projectRoot, 'overlay', 'www', 'cgi-bin', 'gl-starlink-monitor'),
    'utf8'
  );

  assert.match(proxy, /response_path="\/tmp\/gl-starlink-monitor\.\$\$"/);
  assert.doesNotMatch(proxy, /\/etc\/|init\.d|crontab|\buci\b|\bopkg\b/);
  assert.doesNotMatch(proxy, /--request\s+(?:PUT|PATCH|DELETE)/);
});

test('browser polling pauses off-page and is destroyed with the view', function() {
  const view = fs.readFileSync(path.join(projectRoot, 'src', 'index.vue'), 'utf8');

  assert.match(view, /const HISTORY_INTERVAL_MS = 3000;/);
  assert.match(view, /document\.hidden/);
  assert.match(view, /beforeDestroy\(\)[\s\S]*this\.stopPolling\(\)/);
  assert.match(view, /clearInterval\(this\.statusTimer\)/);
  assert.match(view, /clearInterval\(this\.historyTimer\)/);
  assert.match(view, /clearInterval\(this\.obstructionTimer\)/);
});
