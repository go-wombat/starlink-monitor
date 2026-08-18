'use strict';

const RELEASE_API_URL = 'https://api.github.com/repos/go-wombat/starlink-monitor/releases/latest';
const RELEASE_PAGE_PREFIX = 'https://github.com/go-wombat/starlink-monitor/releases/tag/';

function parseVersion(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) throw new Error('invalid_version');
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
}

function releaseState(currentVersion, payload) {
  const latestParts = payload && parseVersion(payload.tag_name);
  if (!parseVersion(currentVersion) || !latestParts || payload.draft || payload.prerelease) {
    throw new Error('invalid_release');
  }
  const latestVersion = latestParts.join('.');
  return {
    latestVersion,
    releaseUrl: RELEASE_PAGE_PREFIX + encodeURIComponent(`v${latestVersion}`),
    updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
  };
}

module.exports = { RELEASE_API_URL, compareVersions, parseVersion, releaseState };
