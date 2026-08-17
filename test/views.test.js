'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');

test('declares five native submenu views with matching source and menu files', function() {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'gl-plugin.json'), 'utf8'));
  assert.deepEqual(manifest.views.map(function(view) { return view.id; }), [
    'starlink-monitor',
    'starlink-monitor-dish',
    'starlink-monitor-sky',
    'starlink-monitor-network',
    'starlink-monitor-tools',
  ]);

  manifest.views.forEach(function(view) {
    assert.equal(fs.existsSync(path.join(projectRoot, view.entry)), true);
    assert.equal(fs.existsSync(path.join(projectRoot, view.menu)), true);
    const menu = JSON.parse(fs.readFileSync(path.join(projectRoot, view.menu), 'utf8'));
    assert.equal(menu.view, view.id);
    assert.equal(menu.level, 2);
    assert.equal(menu.parent, 'starlink');
  });
});

test('tools view is manual and visible pages tear down all polling', function() {
  const overview = fs.readFileSync(path.join(projectRoot, 'src', 'index.vue'), 'utf8');
  const dish = fs.readFileSync(path.join(projectRoot, 'src', 'dish.vue'), 'utf8');
  const sky = fs.readFileSync(path.join(projectRoot, 'src', 'sky.vue'), 'utf8');
  const network = fs.readFileSync(path.join(projectRoot, 'src', 'network.vue'), 'utf8');
  const tools = fs.readFileSync(path.join(projectRoot, 'src', 'tools.vue'), 'utf8');

  [overview, dish, sky, network].forEach(function(source) {
    assert.match(source, /document\.hidden/);
    assert.match(source, /beforeDestroy\(\)/);
    assert.match(source, /clearInterval/);
  });
  const mountedBlock = tools.slice(
    tools.indexOf('  mounted()'),
    tools.indexOf('  beforeDestroy()')
  );
  assert.match(tools, /mounted\(\)[\s\S]*visibilitychange/);
  assert.doesNotMatch(mountedBlock, /startSpeedTest\(/);
  assert.doesNotMatch(mountedBlock, /runDiagnostics\(/);
  assert.match(mountedBlock, /loadEndpointConfig\(\)/);
  assert.match(tools, /beforeDestroy\(\)[\s\S]*cancelSpeedTest\(\)/);
  assert.match(tools, /gl-sdk4-plugin-kit\/lib\/safe-rpc-mixin/);
  assert.match(tools, /title="Dish endpoint"/);
  assert.match(tools, /safeRpc\('starlink-monitor', 'set_config'/);
  assert.match(tools, /safeRpc\('starlink-monitor', 'test_config'/);
  assert.doesNotMatch(tools, /\$axios|fetch\([^)]*(?:set_config|test_config)/);
  assert.match(network, /const NETWORK_INTERVAL_MS = 5000;/);
  assert.match(network, /routerCall\('clients', 'get_list'\)/);
  assert.doesNotMatch(network, /setInfo|removeOffline|cleanTraffic/);
});

test('overview keeps cards aligned within each dashboard row', function() {
  const overview = fs.readFileSync(path.join(projectRoot, 'src', 'index.vue'), 'utf8');
  assert.match(overview, /:height="320"/);
  assert.match(overview, /return this\.events\.slice\(0, 8\)/);
  assert.match(overview, /const \{ GlStableLineChart \} = require\('@gl-sdk4-plugin-kit\/chart'\)/);
  assert.match(overview, /components: \{[\s\S]*GlStableLineChart,[\s\S]*StarlinkPageHeader,[\s\S]*StarlinkPanelHeader,[\s\S]*StarlinkStatusBadge/);
  assert.match(overview, /<gl-stable-line-chart/);
  assert.match(overview, /:minimum-y-max="250"/);
  assert.match(overview, /:timeline-events="events"/);
  assert.match(overview, /@gl-sdk4-plugin-kit\/gl-line-chart\.css/);
  assert.doesNotMatch(overview, /<gl-line-chart|axisMaxima|nextStableAxisMaximum|eventBands/);
  assert.doesNotMatch(overview, /outage-layer|outage-band|outageBandStyle/);
  assert.doesNotMatch(overview, /event\.startMs}-\$\{event\.cause}-\$\{event\.durationMs/);
  assert.match(overview, /\.primary-grid > \*,[\s\S]*\.detail-grid > \*[\s\S]*height: 100%/);
  assert.match(overview, /\.metric-card \{[\s\S]*height: 100%/);
});

test('all views share one meaningful page header contract', function() {
  const views = {
    Overview: fs.readFileSync(path.join(projectRoot, 'src', 'index.vue'), 'utf8'),
    Dish: fs.readFileSync(path.join(projectRoot, 'src', 'dish.vue'), 'utf8'),
    Sky: fs.readFileSync(path.join(projectRoot, 'src', 'sky.vue'), 'utf8'),
    Network: fs.readFileSync(path.join(projectRoot, 'src', 'network.vue'), 'utf8'),
    Tools: fs.readFileSync(path.join(projectRoot, 'src', 'tools.vue'), 'utf8'),
  };
  const header = fs.readFileSync(path.join(projectRoot, 'src', 'page-header.vue'), 'utf8');

  Object.keys(views).forEach(function(name) {
    const source = views[name];
    assert.match(source, new RegExp(`title="Starlink · ${name}"`));
    assert.match(source, /<starlink-page-header/);
    assert.match(source, /StarlinkPageHeader/);
    assert.doesNotMatch(source, /<gl-title|class="page-toolbar"|class="status-dot"/);
  });

  assert.match(header, /<gl-title :title="title"/);
  assert.match(header, /aria-live="polite"/);
  assert.match(header, /role="alert"/);
  assert.match(header, /\['online', 'warning', 'offline', 'pending'\]/);
  assert.match(views.Overview, /Live telemetry and 15-minute history/);
  assert.match(views.Dish, /Alignment, health and terminal details/);
  assert.match(views.Sky, /Obstruction survey and terminal pointing/);
  assert.match(views.Network, /GL\.iNet clients, radios and traffic counters/);
  assert.match(views.Tools, /Browser speed test and one-shot endpoint checks/);
});

test('all dashboard panels share one header and semantic badge contract', function() {
  const viewNames = ['index.vue', 'dish.vue', 'sky.vue', 'network.vue', 'tools.vue'];
  const views = viewNames.map(function(name) {
    return fs.readFileSync(path.join(projectRoot, 'src', name), 'utf8');
  });
  const combined = views.join('\n');
  const panelHeader = fs.readFileSync(path.join(projectRoot, 'src', 'panel-header.vue'), 'utf8');
  const statusBadge = fs.readFileSync(path.join(projectRoot, 'src', 'status-badge.vue'), 'utf8');

  views.forEach(function(source) {
    assert.match(source, /<starlink-panel-header/);
    assert.match(source, /StarlinkPanelHeader/);
  });

  assert.match(panelHeader, /<starlink-status-badge/);
  assert.match(panelHeader, /title: \{ type: String, required: true \}/);
  assert.match(panelHeader, /subtitle: \{ type: String, required: true \}/);
  assert.match(panelHeader, /subtitleLines/);
  assert.match(panelHeader, /badgeTone/);
  assert.match(statusBadge, /\['neutral', 'info', 'success', 'warning', 'danger'\]/);
  assert.match(statusBadge, /\.status-badge::before/);
  assert.match(statusBadge, /var\(--text-color, var\(--text\)\)/);
  assert.doesNotMatch(combined, /card-heading|section-heading|range-badge|survey-badge/);
  assert.doesNotMatch(combined, /health-badge|health-count|manual-badge/);
  assert.match(views[0], /badge="15 min"/);
  assert.equal((views[0].match(/:subtitle-lines="2"/g) || []).length, 3);
  assert.match(views[1], /:badge-tone="alignmentBadgeTone"/);
  assert.match(views[2], /:badge-tone="surveyBadgeTone"/);
  assert.match(views[3], /activeRadios \+ '\/' \+ radios\.length \+ ' active'/);
  assert.match(views[4], /badge="On demand"/);
});

test('all views provide a readable local theme contract for firmware Dark mode', function() {
  const viewNames = ['index.vue', 'dish.vue', 'sky.vue', 'network.vue', 'tools.vue'];
  const views = viewNames.map(function(name) {
    return fs.readFileSync(path.join(projectRoot, 'src', name), 'utf8');
  });
  const theme = fs.readFileSync(path.join(projectRoot, 'src', 'theme.css'), 'utf8');

  views.forEach(function(source) {
    assert.match(source, /'is-dark-theme': themeName === 'dark'/);
    assert.match(source, /themeName\(\)[\s\S]*\$store\.state\.theme/);
    assert.match(source, /<style src="\.\/theme\.css"><\/style>/);
  });

  assert.match(theme, /\.starlink-monitor-wrapper\.is-dark-theme/);
  assert.match(theme, /\.starlink-page\.is-dark-theme/);
  assert.match(theme, /\.network-wrapper\.is-dark-theme/);
  assert.match(theme, /--title-color: #cdcee0/);
  assert.match(theme, /--text-color: #e7e8f3/);
  assert.match(theme, /--card-border: #36384f/);
});

test('all secondary views keep dashboard rows and data columns aligned', function() {
  const network = fs.readFileSync(path.join(projectRoot, 'src', 'network.vue'), 'utf8');
  const dish = fs.readFileSync(path.join(projectRoot, 'src', 'dish.vue'), 'utf8');
  const sky = fs.readFileSync(path.join(projectRoot, 'src', 'sky.vue'), 'utf8');
  const tools = fs.readFileSync(path.join(projectRoot, 'src', 'tools.vue'), 'utf8');

  assert.match(network, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(network, /gl-sdk4-card--fill summary-card/);
  assert.match(network, /class="client-columns"/);
  assert.match(network, /\.client-columns,[\s\S]*\.client-row[\s\S]*grid-template-columns/);
  assert.match(dish, /gl-sdk4-card--fill terminal-card/);
  assert.match(dish, /gl-sdk4-card--fill alignment-card/);
  assert.match(dish, /\.top-grid > \*, \.detail-grid > \*[\s\S]*height: 100%/);
  assert.match(sky, /grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(sky, /gl-sdk4-card--fill map-card/);
  assert.doesNotMatch(sky, /class="load-note"/);
  assert.match(tools, /\.tools-grid > \*[\s\S]*height: 100%/);
  assert.match(tools, /gl-sdk4-card--fill speed-card/);
  [network, dish, sky, tools].forEach(function(source) {
    assert.match(source, /@gl-sdk4-plugin-kit\/gl-card\.css/);
    assert.doesNotMatch(source, /::v-deep|\/deep\/|>>>/);
  });
});
