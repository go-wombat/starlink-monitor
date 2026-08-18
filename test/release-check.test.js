'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RELEASE_API_URL,
  compareVersions,
  parseVersion,
  releaseState,
} = require('../src/release-check');

test('compares stable release versions without accepting loose tags', function() {
  assert.equal(RELEASE_API_URL, 'https://api.github.com/repos/go-wombat/starlink-monitor/releases/latest');
  assert.deepEqual(parseVersion('v1.5.0'), [1, 5, 0]);
  assert.equal(parseVersion('1.5'), null);
  assert.equal(parseVersion('v1.5.0-beta.1'), null);
  assert.equal(compareVersions('1.5.0', '1.4.9'), 1);
  assert.equal(compareVersions('1.4.0', 'v1.4.0'), 0);
  assert.equal(compareVersions('1.3.9', '1.4.0'), -1);
});

test('normalizes the latest stable GitHub release to a fixed repository URL', function() {
  assert.deepEqual(releaseState('1.4.0', {
    tag_name: 'v1.5.0',
    draft: false,
    prerelease: false,
    html_url: 'https://attacker.invalid/release',
  }), {
    latestVersion: '1.5.0',
    releaseUrl: 'https://github.com/go-wombat/starlink-monitor/releases/tag/v1.5.0',
    updateAvailable: true,
    currentAhead: false,
  });
  assert.equal(releaseState('1.5.0', {
    tag_name: 'v1.5.0',
    draft: false,
    prerelease: false,
  }).updateAvailable, false);
  assert.equal(releaseState('1.6.0', {
    tag_name: 'v1.5.0',
    draft: false,
    prerelease: false,
  }).currentAhead, true);
  assert.throws(function() {
    releaseState('1.5.0', { tag_name: 'v1.6.0-beta.1', prerelease: true });
  }, /invalid_release/);
});
