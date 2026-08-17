<template>
  <div class="starlink-page" :class="{ 'is-dark-theme': themeName === 'dark' }">
    <starlink-page-header
      title="Starlink · Sky"
      :status="connectionText"
      :subtitle="headerSubtitle"
      :tone="headerTone"
      :error="error"
      :loading="loading"
      @refresh="refresh(true)"
    />

    <div v-if="status || obstructionMap" class="sky-grid">
      <gl-card class="gl-sdk4-card gl-sdk4-card--fill map-card">
        <starlink-panel-header
          title="Field of view"
          subtitle="Current survey reported by the dish"
          :badge="surveyVerdict"
          :badge-tone="surveyBadgeTone"
        />

        <div v-if="obstructionReady" class="map-wrap">
          <canvas
            ref="obstructionCanvas"
            role="img"
            :aria-label="mapAriaLabel"
          />
          <div class="map-legend" aria-hidden="true">
            <span><i class="clear" /> Clear</span>
            <span><i class="partial" /> Partial</span>
            <span><i class="blocked" /> Obstructed</span>
          </div>
        </div>
        <div v-else class="map-empty">Waiting for the dish to return its sky survey…</div>
      </gl-card>

      <div class="side-stack">
        <gl-card class="gl-sdk4-card gl-sdk4-card--fill survey-card">
          <starlink-panel-header
            title="Survey"
            subtitle="Coverage and obstruction quality"
            compact
          />
          <div class="metric-grid">
            <div v-for="metric in surveyMetrics" :key="metric.label" class="metric-tile">
              <span>{{ metric.label }}</span>
              <strong :class="metric.tone || ''">{{ metric.value }}</strong>
              <small>{{ metric.hint }}</small>
            </div>
          </div>
        </gl-card>

        <gl-card class="gl-sdk4-card gl-sdk4-card--fill pointing-card">
          <starlink-panel-header
            title="Pointing"
            subtitle="How the terminal is aimed at the usable sky"
            compact
          />
          <div class="fact-list">
            <div v-for="row in pointingRows" :key="row.label" class="fact-row">
              <span>{{ row.label }}</span>
              <strong :class="row.tone || ''">{{ row.value }}</strong>
            </div>
          </div>
        </gl-card>
      </div>
    </div>

    <div v-else-if="!error" class="loading-state">Reading the sky survey…</div>
  </div>
</template>

<script>
const starlinkApi = require('./starlink-api');
const { computeAlignment } = require('./alignment');
const StarlinkPanelHeader = require('./panel-header.vue').default;
const StarlinkPageHeader = require('./page-header.vue').default;
const {
  finite,
  formatNumber,
  formatRelativeTime,
  formatUptime,
  statusText,
  statusTone: dishStatusTone,
} = require('./view-utils');

const STATUS_INTERVAL_MS = 10000;
const OBSTRUCTION_INTERVAL_MS = 300000;

export default {
  name: 'starlink-sky',
  components: { StarlinkPageHeader, StarlinkPanelHeader },
  data() {
    return {
      status: null,
      obstructionMap: null,
      error: '',
      loading: false,
      statusInFlight: false,
      obstructionInFlight: false,
      statusTimer: null,
      obstructionTimer: null,
      clockTimer: null,
      controllers: [],
      lastUpdated: 0,
      relativeClock: Date.now(),
    };
  },
  computed: {
    themeName() {
      return (this.$store && this.$store.state && this.$store.state.theme) || 'default';
    },
    obstructionReady() {
      const map = this.obstructionMap || {};
      return Boolean(map.numRows && map.numCols && Array.isArray(map.snr) && map.snr.length);
    },
    alignment() {
      return computeAlignment(this.status || {});
    },
    obstructionStats() {
      return this.status && this.status.obstructionStats || {};
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
      const parts = ['Obstruction survey and terminal pointing'];
      if (this.lastUpdated) parts.push(`Updated ${this.relativeUpdated}`);
      return parts.join(' · ');
    },
    obstructionPercent() {
      return Math.max(0, finite(this.obstructionStats.fractionObstructed, 0) * 100);
    },
    surveyVerdict() {
      if (!this.obstructionReady) return 'Survey pending';
      if (this.obstructionPercent < 0.5) return 'Clear view';
      if (this.obstructionPercent < 3) return 'Minor obstruction';
      return 'Obstructed';
    },
    surveyBadgeTone() {
      if (!this.obstructionReady) return 'neutral';
      if (this.obstructionPercent < 0.5) return 'success';
      if (this.obstructionPercent < 3) return 'warning';
      return 'danger';
    },
    surveyMetrics() {
      const stats = this.obstructionStats;
      const patches = finite(stats.patchesValid, 0);
      const interval = finite(stats.avgProlongedObstructionDurationS, 0) ||
        finite(stats.avgProlongedObstructionIntervalS, 0);
      return [
        {
          label: 'Obstructed',
          value: this.status ? `${formatNumber(this.obstructionPercent, 2)}%` : '--',
          hint: this.obstructionPercent < 0.5 ? 'Excellent field of view' : 'Lower is better',
          tone: this.obstructionPercent < 0.5 ? 'good' : this.obstructionPercent < 3 ? 'warn' : 'bad',
        },
        {
          label: 'Sky observed',
          value: formatUptime(stats.validS),
          hint: 'Survey uptime held by Dishy',
        },
        {
          label: 'Patches mapped',
          value: patches ? Math.round(patches).toLocaleString() : '--',
          hint: this.obstructionReady ? `${this.obstructionMap.numCols} × ${this.obstructionMap.numRows} grid` : 'Waiting for map',
        },
        {
          label: 'Long obstruction',
          value: interval ? `${formatNumber(interval, 1)} s` : '--',
          hint: 'Mean prolonged interval reported',
        },
      ];
    },
    pointingRows() {
      const reading = this.alignment;
      return [
        { label: 'Azimuth', value: this.degrees(reading.boresightAzimuthDeg, 1) },
        { label: 'Elevation', value: this.degrees(reading.boresightElevationDeg, 1) },
        { label: 'Physical tilt', value: this.degrees(reading.tiltAngleDeg, 1) },
        { label: 'Desired azimuth', value: this.degrees(reading.desiredAzimuthDeg, 1) },
        { label: 'Desired elevation', value: this.degrees(reading.desiredElevationDeg, 1) },
        {
          label: 'Alignment',
          value: reading.isValid ? (reading.isAligned ? 'Aligned' : 'Needs adjustment') : 'Settling',
          tone: reading.isValid ? (reading.isAligned ? 'good' : 'warn') : '',
        },
      ];
    },
    mapAriaLabel() {
      return `Starlink sky map. ${this.surveyVerdict}. ${formatNumber(this.obstructionPercent, 2)} percent obstructed.`;
    },
  },
  watch: {
    themeName() {
      this.$nextTick(this.drawObstruction);
    },
  },
  mounted() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('resize', this.drawObstruction);
    this.refresh(true);
    this.startPolling();
    this.clockTimer = window.setInterval(() => { this.relativeClock = Date.now(); }, 5000);
  },
  beforeDestroy() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('resize', this.drawObstruction);
    this.stopPolling();
    window.clearInterval(this.clockTimer);
    this.controllers.forEach(function(controller) { controller.abort(); });
    this.controllers = [];
  },
  methods: {
    startPolling() {
      this.stopPolling();
      this.statusTimer = window.setInterval(() => {
        if (!document.hidden) this.loadStatus();
      }, STATUS_INTERVAL_MS);
      this.obstructionTimer = window.setInterval(() => {
        if (!document.hidden) this.loadObstruction();
      }, OBSTRUCTION_INTERVAL_MS);
    },
    stopPolling() {
      window.clearInterval(this.statusTimer);
      window.clearInterval(this.obstructionTimer);
      this.statusTimer = null;
      this.obstructionTimer = null;
    },
    handleVisibilityChange() {
      if (!document.hidden) this.refresh();
    },
    async refresh(force) {
      if (document.hidden && !force) return;
      this.loading = true;
      this.error = '';
      const results = await Promise.allSettled([
        this.loadStatus(force),
        this.loadObstruction(force),
      ]);
      const failure = results.find(function(result) { return result.status === 'rejected'; });
      if (failure) this.noteError(failure.reason);
      this.loading = false;
    },
    async withTimeout(request, milliseconds) {
      const controller = new AbortController();
      this.controllers.push(controller);
      const timeout = window.setTimeout(function() { controller.abort(); }, milliseconds);
      try {
        return await request(controller.signal);
      } finally {
        window.clearTimeout(timeout);
        const index = this.controllers.indexOf(controller);
        if (index !== -1) this.controllers.splice(index, 1);
      }
    },
    async loadStatus(force) {
      if (this.statusInFlight || (document.hidden && !force)) return;
      this.statusInFlight = true;
      try {
        this.status = await this.withTimeout(starlinkApi.getStatus, 8000);
        this.lastUpdated = Date.now();
      } finally {
        this.statusInFlight = false;
      }
    },
    async loadObstruction(force) {
      if (this.obstructionInFlight || (document.hidden && !force)) return;
      this.obstructionInFlight = true;
      try {
        this.obstructionMap = await this.withTimeout(starlinkApi.getObstructionMap, 10000);
        this.$nextTick(this.drawObstruction);
      } finally {
        this.obstructionInFlight = false;
      }
    },
    noteError(error) {
      this.error = error && error.name === 'AbortError'
        ? 'Starlink did not answer before the request timed out.'
        : (error && error.message || 'Could not read the sky survey.');
    },
    drawObstruction() {
      if (!this.obstructionReady || !this.$refs.obstructionCanvas) return;
      const canvas = this.$refs.obstructionCanvas;
      const rows = Number(this.obstructionMap.numRows);
      const cols = Number(this.obstructionMap.numCols);
      const grid = this.obstructionMap.snr;
      const available = canvas.parentElement.clientWidth - 12;
      const cssSize = Math.max(260, Math.min(590, available));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssSize * pixelRatio);
      canvas.height = Math.round(cssSize * pixelRatio);
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      const context = canvas.getContext('2d');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, cssSize, cssSize);

      const center = cssSize / 2;
      const radius = cssSize * 0.425;
      const border = this.themeColor('--border', 'rgba(128,128,128,.35)');
      context.strokeStyle = border;
      context.lineWidth = 1;
      [1, 0.75, 0.5, 0.25].forEach(function(scale) {
        context.beginPath();
        context.arc(center, center, radius * scale, 0, Math.PI * 2);
        context.stroke();
      });
      context.beginPath();
      context.moveTo(center - radius, center);
      context.lineTo(center + radius, center);
      context.moveTo(center, center - radius);
      context.lineTo(center, center + radius);
      context.stroke();

      const mapSize = radius * 2;
      const cellWidth = mapSize / cols;
      const cellHeight = mapSize / rows;
      const originX = center - radius;
      const originY = center - radius;
      const clear = this.themeColor('--success', '#20b26b');
      const partial = this.themeColor('--warning', '#e8a23a');
      const blocked = this.themeColor('--error', '#e35d6a');
      context.save();
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.clip();
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const value = finite(grid[row * cols + col], -1);
          if (value < 0) continue;
          const obstructed = 1 - value;
          context.globalAlpha = obstructed <= 0.02 ? 0.4 : 0.92;
          context.fillStyle = obstructed <= 0.02 ? clear : obstructed <= 0.5 ? partial : blocked;
          context.fillRect(
            originX + col * cellWidth,
            originY + row * cellHeight,
            Math.ceil(cellWidth + 0.25),
            Math.ceil(cellHeight + 0.25)
          );
        }
      }
      context.restore();
      context.globalAlpha = 1;
      context.fillStyle = this.themeColor('--text-weak', '#8491a3');
      context.font = '600 12px sans-serif';
      context.textAlign = 'center';
      context.fillText('N', center, center - radius - 12);
      context.fillText('S', center, center + radius + 20);
      context.fillText('W', center - radius - 17, center + 4);
      context.fillText('E', center + radius + 17, center + 4);
    },
    themeColor(variable, fallback) {
      this.themeName;
      try {
        const value = this.$getThemeRealVal && this.$getThemeRealVal(variable);
        return value || fallback;
      } catch (error) {
        return fallback;
      }
    },
    degrees(value, digits) {
      return `${finite(value, 0).toFixed(digits)}°`;
    },
  },
};
</script>

<style src="@gl-sdk4-plugin-kit/gl-card.css"></style>
<style src="./theme.css"></style>

<style scoped>
.starlink-page { padding: 20px 0 28px; color: var(--text-color, var(--text)); }
.fact-row { display: flex; align-items: center; }
.metric-tile span, .metric-tile small { color: var(--hint-color, var(--text-weak, #8491a3)); }
.sky-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, .75fr); gap: 16px; align-items: stretch; margin-bottom: 16px; }
.map-card, .survey-card, .pointing-card { box-sizing: border-box; height: 100%; }
.side-stack { display: grid; grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 16px; height: 100%; }
.side-stack > * { box-sizing: border-box; height: 100%; }
.map-wrap { display: flex; min-height: 560px; flex: 1; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
.map-wrap canvas { display: block; max-width: 100%; }
.map-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: -4px; color: var(--hint-color, var(--text-weak)); font-size: 11px; }
.map-legend span { display: inline-flex; align-items: center; gap: 6px; }
.map-legend i { width: 8px; height: 8px; border-radius: 50%; }
.map-legend .clear { background: var(--success-color, #20b26b); }
.map-legend .partial { background: var(--warning-color, #e8a23a); }
.map-legend .blocked { background: var(--error-color, #e35d6a); }
.map-empty, .loading-state { display: flex; min-height: 400px; flex: 1; align-items: center; justify-content: center; color: var(--hint-color, var(--text-weak)); font-size: 13px; text-align: center; }
.metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); flex: 1; gap: 10px; }
.metric-tile { display: flex; box-sizing: border-box; min-width: 0; height: 100%; flex-direction: column; padding: 13px; border: 1px solid var(--card-border, var(--border)); border-radius: 9px; background: var(--body-background, rgba(127,127,127,.03)); }
.metric-tile span, .metric-tile small { display: block; font-size: 10px; }
.metric-tile small { margin-top: auto; }
.metric-tile strong { display: block; margin: 7px 0 4px; color: var(--title-color, var(--text)); font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
.metric-tile strong.good, .fact-row strong.good { color: var(--success-color, #20b26b); }
.metric-tile strong.warn, .fact-row strong.warn { color: var(--warning-color, #e8a23a); }
.metric-tile strong.bad { color: var(--error-color, #e35d6a); }
.fact-list { flex: 1; border-top: 1px solid var(--card-border, var(--border)); }
.fact-row { min-height: 42px; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--card-border, var(--border)); font-size: 12px; }
.fact-row span { color: var(--hint-color, var(--text-weak)); }
.fact-row strong { color: var(--text-color, var(--text)); font-weight: 550; text-align: right; }
@media (max-width: 980px) { .sky-grid { grid-template-columns: 1fr; } .map-card, .survey-card, .pointing-card, .side-stack > * { height: auto; } .side-stack { grid-template-rows: auto; height: auto; } .map-wrap { min-height: 430px; } }
@media (max-width: 540px) { .metric-grid { grid-template-columns: 1fr; } .map-wrap { min-height: 320px; } }
</style>
