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

test('package installs no background service, cron job, or persistent telemetry', function() {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'gl-plugin.json'),
    'utf8'
  ));
  const overlayFiles = filesBelow(path.join(projectRoot, 'overlay')).sort();

  assert.deepEqual(manifest.lifecycle, {
    postinst: 'hooks/postinst',
    postrm: 'hooks/postrm',
  });
  assert.deepEqual(manifest.package.conffiles, ['/etc/config/starlink-monitor']);
  assert.deepEqual(overlayFiles, [
    path.join('etc', 'config', 'starlink-monitor'),
    path.join('usr', 'lib', 'oui-httpd', 'rpc', 'starlink-monitor'),
    path.join('usr', 'libexec', 'starlink-monitor', 'admin-session.sh'),
    path.join('usr', 'libexec', 'starlink-monitor', 'install-update.sh'),
    path.join('usr', 'share', 'licenses', 'gl-sdk4-ui-starlink-monitor', 'THIRD_PARTY_NOTICES.md'),
    path.join('www', 'cgi-bin', 'gl-starlink-monitor'),
  ]);
});

test('package lifecycle only refreshes the firmware RPC cache', function() {
  const postinst = fs.readFileSync(path.join(projectRoot, 'hooks', 'postinst'), 'utf8');
  const postrm = fs.readFileSync(path.join(projectRoot, 'hooks', 'postrm'), 'utf8');

  [postinst, postrm].forEach(function(hook) {
    assert.match(hook, /\[ -n "\$\{IPKG_INSTROOT:-\}" \] && exit 0/);
    assert.match(hook, /\/usr\/sbin\/nginx -s reload/);
    assert.doesNotMatch(hook, /\b(?:start|stop|restart)\b|init\.d|crontab|daemon/i);
  });
});

test('verified updates run only after an explicit authenticated RPC call', function() {
  const updater = fs.readFileSync(
    path.join(projectRoot, 'overlay', 'usr', 'libexec', 'starlink-monitor', 'install-update.sh'),
    'utf8'
  );
  const rpc = fs.readFileSync(
    path.join(projectRoot, 'overlay', 'usr', 'lib', 'oui-httpd', 'rpc', 'starlink-monitor'),
    'utf8'
  );
  const tools = fs.readFileSync(path.join(projectRoot, 'src', 'tools.vue'), 'utf8');

  assert.match(updater, /RELEASE_BASE_URL='https:\/\/github\.com\/go-wombat\/starlink-monitor\/releases\/download'/);
  assert.match(updater, /--proto '=https'/);
  assert.match(updater, /--proto-redir '=https'/);
  assert.match(updater, /SHA256SUMS/);
  assert.match(updater, /sha256sum "\$package_path"/);
  assert.match(updater, /opkg compare-versions "\$version" '>>' "\$installed_version"/);
  assert.match(updater, /opkg install "\$package_path"/);
  assert.match(updater, /starlink-monitor-update\.lock/);
  assert.doesNotMatch(updater, /crontab|init\.d|uci set|daemon/i);

  assert.match(rpc, /function M\.install_update\(params\)/);
  assert.match(rpc, /valid_version\(version\)/);
  assert.match(rpc, /UPDATE_SCRIPT \.\. " " \.\. version/);
  assert.match(tools, /window\.confirm\(/);
  assert.match(tools, /safeRpc\('starlink-monitor', 'install_update'/);
  const mountedBlock = tools.slice(tools.indexOf('  mounted()'), tools.indexOf('  beforeDestroy()'));
  assert.doesNotMatch(mountedBlock, /checkForUpdates\(|installUpdate\(/);
});

test('router proxy requires an admin session, stays read-only, and uses tmpfs', function() {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'gl-plugin.json'),
    'utf8'
  ));
  const proxy = fs.readFileSync(
    path.join(projectRoot, 'overlay', 'www', 'cgi-bin', 'gl-starlink-monitor'),
    'utf8'
  );
  const auth = fs.readFileSync(
    path.join(projectRoot, 'overlay', 'usr', 'libexec', 'starlink-monitor', 'admin-session.sh'),
    'utf8'
  );

  assert.deepEqual(
    ['gl-oui-rpc', 'ubus', 'jsonfilter'].filter(function(name) {
      return manifest.package.depends.includes(name);
    }),
    ['gl-oui-rpc', 'ubus', 'jsonfilter']
  );
  assert.match(proxy, /\. \/usr\/libexec\/starlink-monitor\/admin-session\.sh/);
  assert.match(proxy, /gl_sdk4_require_admin_session/);
  assert.ok(
    proxy.indexOf('gl_sdk4_require_admin_session') < proxy.indexOf('case "${QUERY_STRING:-}"'),
    'authorization must happen before action parsing'
  );
  assert.match(auth, /HTTP_X_GL_ADMIN_TOKEN/);
  assert.match(auth, /ubus call gl-session session/);
  assert.match(auth, /\[ "\$aclgroup" = 'root' \]/);
  assert.match(proxy, /response_path="\/tmp\/gl-starlink-monitor\.\$\$"/);
  assert.match(proxy, /uci -q get starlink-monitor\.main\.address/);
  assert.match(proxy, /"http:\/\/\$\{dish_address\}:9201\/SpaceX\.API\.Device\.Device\/Handle"/);
  assert.doesNotMatch(proxy, /init\.d|crontab|\bopkg\b/);
  assert.doesNotMatch(proxy, /--request\s+(?:PUT|PATCH|DELETE)/);
  assert.doesNotMatch(proxy, /QUERY_STRING[^\n]*(?:address|host|port|url)/);
});

test('browser proxy calls use the SDK admin-session header helper', function() {
  const api = fs.readFileSync(path.join(projectRoot, 'src', 'starlink-api.js'), 'utf8');

  assert.match(api, /@gl-sdk4-plugin-kit\/admin-session/);
  assert.match(api, /createAdminSessionHeaders\(window/);
  assert.match(api, /credentials: 'same-origin'/);
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
