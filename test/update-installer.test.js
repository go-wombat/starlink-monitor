'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const updater = path.join(
  projectRoot,
  'overlay',
  'usr',
  'libexec',
  'starlink-monitor',
  'install-update.sh'
);

function writeExecutable(filename, source) {
  fs.writeFileSync(filename, source, { mode: 0o755 });
}

function createMocks(directory) {
  const packageBody = Buffer.from('verified test package\n');
  const checksum = crypto.createHash('sha256').update(packageBody).digest('hex');
  writeExecutable(path.join(directory, 'curl'), `#!/bin/sh
destination=''
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) destination="$2"; shift 2 ;;
    https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
case "$url" in
  */SHA256SUMS)
    if [ "\${MOCK_BAD_CHECKSUM:-}" = '1' ]; then
      hash='0000000000000000000000000000000000000000000000000000000000000000'
    else
      hash='${checksum}'
    fi
    printf '%s  gl-sdk4-ui-starlink-monitor_1.6.0_all.ipk\\n' "$hash" > "$destination"
    ;;
  */gl-sdk4-ui-starlink-monitor_1.6.0_all.ipk)
    printf 'verified test package\\n' > "$destination"
    ;;
  *) exit 22 ;;
esac
`);
  writeExecutable(path.join(directory, 'opkg'), `#!/bin/sh
case "$1" in
  status)
    if [ -f "$MOCK_OPKG_STATE" ]; then version='1.6.0'; else version='1.5.0'; fi
    printf 'Package: gl-sdk4-ui-starlink-monitor\\nVersion: %s\\nStatus: install ok installed\\n' "$version"
    ;;
  compare-versions)
    [ "$2" = '1.6.0' ] && [ "$3" = '>>' ] && [ "$4" = '1.5.0' ]
    ;;
  install)
    : > "$MOCK_OPKG_STATE"
    ;;
  *) exit 1 ;;
esac
`);
}

function runUpdater(mockDirectory, stateFile, extraEnv) {
  return spawnSync(updater, ['1.6.0'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
      MOCK_OPKG_STATE: stateFile,
      PATH: `${mockDirectory}:${process.env.PATH}`,
    },
  });
}

test('router updater verifies a fixed checksum before invoking opkg', function() {
  assert.equal(fs.existsSync('/tmp/starlink-monitor-update.lock'), false);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starlink-updater-test-'));
  try {
    createMocks(directory);
    const goodState = path.join(directory, 'good-installed');
    const success = runUpdater(directory, goodState);
    assert.equal(success.status, 0);
    assert.match(success.stdout, /^ok\|1\.6\.0\|[0-9a-f]{64}\n$/);
    assert.equal(fs.existsSync(goodState), true);

    const sameVersion = runUpdater(directory, goodState);
    assert.equal(sameVersion.status, 0);
    assert.equal(sameVersion.stdout, 'error|not_newer\n');

    const badState = path.join(directory, 'bad-installed');
    const mismatch = runUpdater(directory, badState, { MOCK_BAD_CHECKSUM: '1' });
    assert.equal(mismatch.status, 0);
    assert.equal(mismatch.stdout, 'error|checksum_mismatch\n');
    assert.equal(fs.existsSync(badState), false);
    assert.equal(fs.existsSync('/tmp/starlink-monitor-update.lock'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
