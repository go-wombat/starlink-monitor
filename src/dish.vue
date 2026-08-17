<template>
  <div class="starlink-page" :class="{ 'is-dark-theme': themeName === 'dark' }">
    <starlink-page-header
      title="Starlink · Dish"
      :status="connectionText"
      :subtitle="headerSubtitle"
      :tone="headerTone"
      :error="error"
      :loading="loading"
      @refresh="loadStatus(true)"
    />

    <template v-if="status">
      <gl-card v-if="updateBanner" class="gl-sdk4-card update-banner">
        <strong>{{ updateBanner }}</strong>
      </gl-card>

      <div class="top-grid">
        <gl-card class="gl-sdk4-card gl-sdk4-card--fill alignment-card">
          <starlink-panel-header
            title="Alignment"
            subtitle="Live pointing direction reported by the dish"
            :badge="alignmentVerdict"
            :badge-tone="alignmentBadgeTone"
          />

          <div class="dial-grid">
            <div class="dial-panel">
              <div class="dial-label">Rotation</div>
              <svg viewBox="0 0 240 240" role="img" :aria-label="rotationAria">
                <circle cx="120" cy="120" r="94" class="dial-ring" />
                <path v-if="alignment.isValid" :d="rotationWedge" class="target-wedge" />
                <circle
                  v-for="dot in rotationDots"
                  :key="dot.key"
                  :cx="dot.x"
                  :cy="dot.y"
                  r="1.7"
                  class="dial-dot"
                />
                <text x="120" y="17" text-anchor="middle" class="dial-mark">N</text>
                <text x="224" y="124" text-anchor="middle" class="dial-mark">E</text>
                <text x="120" y="232" text-anchor="middle" class="dial-mark">S</text>
                <text x="16" y="124" text-anchor="middle" class="dial-mark">W</text>
                <g :transform="`rotate(${alignment.boresightAzimuthDeg} 120 120)`">
                  <line x1="120" y1="120" x2="120" y2="31" class="dial-needle" />
                  <rect x="105" y="113" width="30" height="14" rx="3" class="dish-body" />
                </g>
                <circle cx="120" cy="120" r="4" class="dial-hub" />
              </svg>
              <div class="dial-reading">
                <strong>{{ degrees(alignment.boresightAzimuthDeg, 1) }}</strong>
                <span>target {{ degrees(alignment.desiredAzimuthDeg, 1) }}</span>
              </div>
            </div>

            <div class="dial-panel">
              <div class="dial-label">Elevation</div>
              <svg viewBox="0 0 240 240" role="img" :aria-label="elevationAria">
                <path d="M 211 120 A 91 91 0 0 0 120 29" class="tilt-ring" />
                <path v-if="alignment.isValid" :d="elevationWedge" class="target-wedge" />
                <line x1="120" y1="120" x2="211" y2="120" class="tilt-baseline" />
                <g :transform="`rotate(${-alignment.boresightElevationDeg} 120 120)`">
                  <line x1="120" y1="120" x2="207" y2="120" class="dial-needle" />
                  <rect x="112" y="105" width="16" height="30" rx="3" class="dish-body" />
                </g>
                <circle cx="120" cy="120" r="4" class="dial-hub" />
                <text x="218" y="139" text-anchor="middle" class="dial-mark">0°</text>
                <text x="120" y="19" text-anchor="middle" class="dial-mark">90°</text>
                <text x="185" y="53" text-anchor="middle" class="dial-mark">45°</text>
                <text x="120" y="218" text-anchor="middle" class="tilt-value">
                  physical tilt {{ degrees(alignment.tiltAngleDeg, 1) }}
                </text>
              </svg>
              <div class="dial-reading">
                <strong>{{ degrees(alignment.boresightElevationDeg, 1) }}</strong>
                <span>target {{ degrees(alignment.desiredElevationDeg, 1) }}</span>
              </div>
            </div>
          </div>

          <div class="alignment-facts">
            <div v-for="fact in alignmentFacts" :key="fact.label" class="mini-fact">
              <span>{{ fact.label }}</span>
              <strong :class="fact.tone || ''">{{ fact.value }}</strong>
            </div>
          </div>
        </gl-card>

        <gl-card class="gl-sdk4-card gl-sdk4-card--fill alerts-card">
          <starlink-panel-header
            title="Health"
            subtitle="Active warnings from the terminal"
            :badge="alerts.length ? alerts.length + ' active' : 'Clear'"
            :badge-tone="alerts.length ? 'warning' : 'success'"
          />
          <div v-if="alerts.length" class="alert-list" aria-live="polite">
            <div v-for="alert in alerts" :key="alert.key" class="alert-row">
              <span class="alert-marker" :class="`severity-${alert.severity}`" />
              <div>
                <strong>{{ alert.message }}</strong>
                <p v-if="alert.advice">{{ alert.advice }}</p>
              </div>
            </div>
          </div>
          <div v-else class="clear-state">
            <span class="clear-ring" />
            <strong>No active alerts</strong>
            <p>Ethernet, thermal and pointing checks are clear.</p>
          </div>
        </gl-card>
      </div>

      <div class="detail-grid">
        <gl-card class="gl-sdk4-card gl-sdk4-card--fill terminal-card">
          <starlink-panel-header
            title="Terminal"
            subtitle="Hardware, service and software details"
          />
          <div class="fact-grid">
            <div v-for="row in terminalFacts" :key="row.label" class="fact-row">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </gl-card>

        <gl-card class="gl-sdk4-card gl-sdk4-card--fill subsystems-card">
          <starlink-panel-header
            title="Subsystems"
            subtitle="Boot and radio readiness"
          />
          <div class="readiness-grid">
            <div v-for="item in readiness" :key="item.label" class="readiness-item">
              <span class="readiness-dot" :class="item.ready ? 'is-ready' : 'not-ready'" />
              <span>{{ item.label }}</span>
              <strong>{{ item.ready ? 'Ready' : 'Starting' }}</strong>
            </div>
          </div>
        </gl-card>
      </div>
    </template>

    <div v-else-if="!error" class="loading-state">Reading terminal status…</div>
  </div>
</template>

<script>
const starlinkApi = require('./starlink-api');
const { computeAlignment } = require('./alignment');
const { firingAlerts } = require('./dish-alerts');
const StarlinkPanelHeader = require('./panel-header.vue').default;
const StarlinkPageHeader = require('./page-header.vue').default;
const {
  bandwidthReason,
  formatRelativeTime,
  formatUptime,
  humanizeToken,
  serviceClass,
  statusText,
  statusTone: dishStatusTone,
} = require('./view-utils');

const STATUS_INTERVAL_MS = 10000;
const DEG_TO_RAD = Math.PI / 180;

function pointOnCircle(centerX, centerY, radius, angleDeg) {
  const angle = angleDeg * DEG_TO_RAD;
  return { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) };
}

function sectorPath(centerX, centerY, radius, centerDeg, spanDeg) {
  const safeSpan = Math.max(0.1, Math.min(359.9, spanDeg));
  const start = pointOnCircle(centerX, centerY, radius, centerDeg - safeSpan / 2);
  const end = pointOnCircle(centerX, centerY, radius, centerDeg + safeSpan / 2);
  return `M${centerX},${centerY} L${start.x.toFixed(2)},${start.y.toFixed(2)} ` +
    `A${radius},${radius} 0 ${safeSpan > 180 ? 1 : 0} 1 ${end.x.toFixed(2)},${end.y.toFixed(2)} Z`;
}

export default {
  name: 'starlink-dish',
  components: { StarlinkPageHeader, StarlinkPanelHeader },
  data() {
    return {
      status: null,
      error: '',
      loading: false,
      lastUpdated: 0,
      timer: null,
      controller: null,
      relativeClock: Date.now(),
      clockTimer: null,
    };
  },
  computed: {
    themeName() {
      return (this.$store && this.$store.state && this.$store.state.theme) || 'default';
    },
    alignment() {
      return computeAlignment(this.status || {});
    },
    modelName() {
      return this.alignment.model.displayName;
    },
    connectionText() {
      return statusText(this.status, this.error);
    },
    headerTone() {
      return dishStatusTone(this.status, this.error);
    },
    relativeUpdated() {
      this.relativeClock;
      return formatRelativeTime(this.lastUpdated);
    },
    headerSubtitle() {
      const parts = [this.modelName, 'Alignment, health and terminal details'];
      if (this.lastUpdated) parts.push(`Updated ${this.relativeUpdated}`);
      return parts.join(' · ');
    },
    alerts() {
      return firingAlerts(this.status && this.status.alerts);
    },
    alignmentVerdict() {
      if (!this.alignment.isValid) return 'Settling';
      return this.alignment.isAligned ? 'Aligned' : 'Needs adjustment';
    },
    alignmentBadgeTone() {
      if (!this.alignment.isValid) return 'neutral';
      return this.alignment.isAligned ? 'success' : 'warning';
    },
    rotationDots() {
      return Array.from({ length: 72 }, function(_, index) {
        const angle = index * 5 - 90;
        const point = pointOnCircle(120, 120, 94, angle);
        return { key: index, x: point.x, y: point.y };
      });
    },
    rotationWedge() {
      return sectorPath(
        120, 120, 91, this.alignment.desiredAzimuthDeg - 90,
        Math.min(180, this.alignment.azimuthToleranceDeg * 2)
      );
    },
    elevationWedge() {
      const lower = this.alignment.lowerElevationLimitDeg;
      const upper = this.alignment.upperElevationLimitDeg;
      return sectorPath(120, 120, 89, -(lower + upper) / 2, upper - lower);
    },
    rotationAria() {
      return `Dish rotation ${this.degrees(this.alignment.boresightAzimuthDeg, 1)}, ` +
        `target ${this.degrees(this.alignment.desiredAzimuthDeg, 1)}`;
    },
    elevationAria() {
      return `Dish elevation ${this.degrees(this.alignment.boresightElevationDeg, 1)}, ` +
        `target ${this.degrees(this.alignment.desiredElevationDeg, 1)}`;
    },
    alignmentFacts() {
      const reading = this.alignment;
      return [
        { label: 'Pointing error', value: this.degrees(reading.boresightErrorDeg, 2), tone: reading.isAligned ? 'good' : 'warn' },
        { label: 'Rotate', value: `${this.degrees(Math.abs(reading.azimuthErrorDeg), 2)} ${reading.azimuthErrorDeg > 0 ? 'counter-clockwise' : 'clockwise'}` },
        { label: 'Elevation correction', value: `${this.degrees(Math.abs(reading.elevationErrorDeg), 2)} ${reading.elevationErrorDeg > 0 ? 'down' : 'up'}` },
        { label: 'Attitude filter', value: humanizeToken(this.status.alignmentStats && this.status.alignmentStats.attitudeEstimationState || 'unknown') },
      ];
    },
    terminalFacts() {
      const status = this.status || {};
      const info = status.deviceInfo || {};
      const gps = status.gpsStats || {};
      return [
        { label: 'Model', value: this.modelName },
        { label: 'Hardware', value: info.hardwareVersion || '--' },
        { label: 'Firmware', value: info.softwareVersion || '--' },
        { label: 'Country', value: info.countryCode || '--' },
        { label: 'Uptime', value: formatUptime(status.deviceState && status.deviceState.uptimeS) },
        { label: 'Boot count', value: info.bootcount === undefined ? '--' : String(info.bootcount) },
        { label: 'Service class', value: serviceClass(status.classOfService) },
        { label: 'GPS', value: gps.gpsValid ? `${gps.gpsSats || 0} satellites · locked` : 'No fix' },
        { label: 'Position filter', value: humanizeToken(gps.pntFilterConvergenceState || 'unknown') },
        { label: 'Ethernet link', value: status.ethSpeedMbps ? `${status.ethSpeedMbps} Mbps` : '--' },
        { label: 'NAT', value: humanizeToken(status.natFlag || 'unknown') },
        { label: 'Connected routers', value: Array.isArray(status.connectedRouters) ? String(status.connectedRouters.length) : '0' },
        { label: 'Download restriction', value: bandwidthReason(status.dlBandwidthRestrictedReason) },
        { label: 'Upload restriction', value: bandwidthReason(status.ulBandwidthRestrictedReason) },
        { label: 'Software update', value: humanizeToken(status.softwareUpdateState || 'idle') },
      ];
    },
    readiness() {
      const states = this.status && this.status.readyStates || {};
      return ['scp', 'l1l2', 'xphy', 'aap', 'rf'].map(function(key) {
        return { label: key.toUpperCase(), ready: states[key] === true };
      });
    },
    updateBanner() {
      const status = this.status || {};
      const seconds = Number(status.secondsUntilSwupdateRebootPossible);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return `Software update ready · reboot possible in ${formatUptime(seconds)}`;
      }
      const state = status.softwareUpdateState;
      return state && state !== 'IDLE' ? `Software update: ${humanizeToken(state)}` : '';
    },
  },
  mounted() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.loadStatus(true);
    this.timer = window.setInterval(() => {
      if (!document.hidden) this.loadStatus();
    }, STATUS_INTERVAL_MS);
    this.clockTimer = window.setInterval(() => { this.relativeClock = Date.now(); }, 5000);
  },
  beforeDestroy() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.clearInterval(this.timer);
    window.clearInterval(this.clockTimer);
    if (this.controller) this.controller.abort();
  },
  methods: {
    handleVisibilityChange() {
      if (!document.hidden) this.loadStatus();
    },
    async loadStatus(force) {
      if (this.loading || (document.hidden && !force)) return;
      this.loading = true;
      const controller = new AbortController();
      this.controller = controller;
      const timeout = window.setTimeout(function() { controller.abort(); }, 7000);
      try {
        this.status = await starlinkApi.getStatus(controller.signal);
        this.lastUpdated = Date.now();
        this.error = '';
      } catch (error) {
        this.error = error && error.name === 'AbortError'
          ? 'Starlink did not answer before the request timed out.'
          : (error && error.message || 'Could not read Starlink status.');
      } finally {
        window.clearTimeout(timeout);
        if (this.controller === controller) this.controller = null;
        this.loading = false;
      }
    },
    degrees(value, digits) {
      return `${Number(value || 0).toFixed(digits)}°`;
    },
  },
};
</script>

<style src="@gl-sdk4-plugin-kit/gl-card.css"></style>
<style src="./theme.css"></style>

<style scoped>
.starlink-page { padding: 20px 0 28px; color: var(--text-color, var(--text)); }
.fact-row, .readiness-item { display: flex; align-items: center; }
.alert-marker, .readiness-dot { display: inline-block; flex: 0 0 auto; border-radius: 50%; }
.update-banner { margin-bottom: 16px; }
.update-banner { color: var(--warning-color, #e8a23a); font-size: 13px; }
.top-grid, .detail-grid { display: grid; gap: 16px; align-items: stretch; margin-bottom: 16px; }
.top-grid { grid-template-columns: minmax(0, 1.65fr) minmax(290px, .75fr); }
.detail-grid { grid-template-columns: minmax(0, 1.5fr) minmax(280px, .7fr); }
.top-grid > *, .detail-grid > * { box-sizing: border-box; height: 100%; }
.alerts-card .alert-list, .alerts-card .clear-state, .terminal-card .fact-grid, .subsystems-card .readiness-grid { flex: 1; }
.dial-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.dial-panel { min-width: 0; padding: 12px; border: 1px solid var(--card-border, var(--border)); border-radius: 10px; background: var(--body-background, rgba(127,127,127,.03)); }
.dial-panel svg { display: block; width: 100%; max-width: 260px; margin: 0 auto; }
.dial-label { color: var(--hint-color, var(--text-weak)); font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
.dial-ring, .tilt-ring, .tilt-baseline { fill: none; stroke: var(--card-border, var(--border)); }
.dial-ring { stroke-width: 1; }
.tilt-ring { stroke-width: 3; stroke-linecap: round; }
.tilt-baseline { stroke-width: 1; }
.target-wedge { fill: var(--primary-color, var(--primary, #1785ff)); opacity: .15; }
.dial-dot { fill: var(--hint-color, var(--text-weak, #8491a3)); opacity: .72; }
.dial-mark, .tilt-value { fill: var(--hint-color, var(--text-weak, #8491a3)); font-family: sans-serif; font-size: 11px; font-weight: 600; }
.dial-needle { stroke: #ffac30; stroke-width: 2.5; stroke-linecap: round; }
.dish-body { fill: var(--title-color, var(--text, #fff)); stroke: var(--card-border, var(--border)); stroke-width: 1; }
.dial-hub { fill: #ffac30; }
.dial-reading { display: flex; align-items: baseline; justify-content: center; gap: 8px; margin-top: -10px; }
.dial-reading strong { color: var(--title-color, var(--text)); font-size: 20px; font-variant-numeric: tabular-nums; }
.dial-reading span { color: var(--hint-color, var(--text-weak)); font-size: 11px; }
.alignment-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; margin-top: 14px; border-top: 1px solid var(--card-border, var(--border)); }
.mini-fact, .fact-row { display: flex; justify-content: space-between; gap: 14px; min-height: 40px; align-items: center; border-bottom: 1px solid var(--card-border, var(--border)); font-size: 12px; }
.mini-fact span, .fact-row span { color: var(--hint-color, var(--text-weak)); }
.mini-fact strong, .fact-row strong { overflow: hidden; color: var(--text-color, var(--text)); font-weight: 550; text-align: right; text-overflow: ellipsis; }
.mini-fact strong.good { color: var(--success-color, #20b26b); }
.mini-fact strong.warn { color: var(--warning-color, #e8a23a); }
.alert-list { border-top: 1px solid var(--card-border, var(--border)); }
.alert-row { display: flex; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--card-border, var(--border)); }
.alert-marker { width: 8px; height: 8px; margin-top: 5px; }
.severity-critical { background: var(--error-color, #e35d6a); }
.severity-warning { background: var(--warning-color, #e8a23a); }
.severity-advisory { background: var(--primary-color, #1785ff); }
.alert-row strong { display: block; color: var(--text-color, var(--text)); font-size: 12px; line-height: 1.4; }
.alert-row p, .clear-state p { margin: 4px 0 0; color: var(--hint-color, var(--text-weak)); font-size: 11px; line-height: 1.45; }
.clear-state { display: flex; min-height: 255px; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.clear-ring { width: 34px; height: 34px; margin-bottom: 12px; border: 3px solid var(--success-color, #20b26b); border-radius: 50%; box-shadow: 0 0 0 8px rgba(32,178,107,.1); }
.clear-state strong { color: var(--success-color, #20b26b); font-size: 14px; }
.fact-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 20px; border-top: 1px solid var(--card-border, var(--border)); }
.readiness-grid { border-top: 1px solid var(--card-border, var(--border)); }
.readiness-item { min-height: 42px; gap: 9px; border-bottom: 1px solid var(--card-border, var(--border)); font-size: 12px; }
.readiness-dot { width: 8px; height: 8px; }
.readiness-dot.is-ready { background: var(--success-color, #20b26b); }
.readiness-dot.not-ready { background: var(--warning-color, #e8a23a); }
.readiness-item span:nth-child(2) { flex: 1; color: var(--text-color, var(--text)); }
.readiness-item strong { color: var(--hint-color, var(--text-weak)); font-size: 11px; }
.loading-state { display: flex; min-height: 360px; align-items: center; justify-content: center; color: var(--hint-color, var(--text-weak)); font-size: 13px; }
@media (max-width: 1180px) { .fact-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 980px) { .top-grid, .detail-grid { grid-template-columns: 1fr; } .top-grid > *, .detail-grid > * { height: auto; } }
@media (max-width: 640px) { .dial-grid, .alignment-facts, .fact-grid { grid-template-columns: 1fr; } }
</style>
