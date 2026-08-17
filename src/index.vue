<template>
  <div class="starlink-monitor-wrapper" :class="{ 'is-dark-theme': themeName === 'dark' }">
    <starlink-page-header
      title="Starlink · Overview"
      :status="headerStatus"
      :subtitle="headerSubtitle"
      :tone="headerTone"
      :error="error"
      :loading="refreshing"
      @refresh="refreshAll"
    />

    <div class="metric-grid">
      <gl-card v-for="metric in metricCards" :key="metric.id" class="gl-sdk4-card gl-sdk4-card--fill metric-card">
        <button
          type="button"
          class="metric-action"
          :data-metric-id="metric.id"
          :aria-label="`Open ${metric.label} details`"
          @click="openMetric(metric.id)"
        >
          <div class="metric-topline">
            <span class="metric-label">{{ metric.label }}</span>
            <span class="metric-chevron" aria-hidden="true">›</span>
          </div>
          <div class="metric-reading">
            <span class="metric-value">{{ metric.value }}</span>
            <span v-if="metric.unit" class="metric-unit">{{ metric.unit }}</span>
          </div>
          <div class="metric-hint">{{ metric.hint }}</div>
        </button>
      </gl-card>
    </div>

    <div class="primary-grid">
      <gl-card class="gl-sdk4-card gl-sdk4-card--fill chart-card throughput-card">
        <starlink-panel-header
          title="Throughput"
          subtitle="Dish traffic over its local 15-minute buffer"
          badge="15 min"
        />
        <gl-stable-line-chart
          v-if="historyReady"
          class="chart-slot"
          :labels="chartLabels"
          :values="throughputSeries"
          :dataset-labels="['Download', 'Upload']"
          :border-color="throughputColors"
          :background-color="['transparent', 'transparent']"
          :height="320"
          :fill="false"
          :x="chartXAxis"
          :y="throughputYAxis"
          :plugins="chartPlugins"
          :minimum-y-max="250"
          :timeline-events="events"
          :timeline-start="timelineStart"
          :timeline-end="timelineEnd"
        />
        <div v-else class="empty-chart">Waiting for Starlink history…</div>
      </gl-card>

      <gl-card class="gl-sdk4-card gl-sdk4-card--fill obstruction-card">
        <starlink-panel-header
          title="Obstructions"
          subtitle="Current sky survey from the dish"
          badge="Survey"
          badge-tone="info"
        />
        <div v-if="obstructionReady" class="obstruction-visual">
          <canvas ref="obstructionCanvas" aria-label="Starlink obstruction map" />
          <div class="obstruction-legend">
            <span><i class="legend-clear" /> Clear</span>
            <span><i class="legend-partial" /> Partial</span>
            <span><i class="legend-blocked" /> Obstructed</span>
          </div>
        </div>
        <div v-else class="empty-chart obstruction-empty">
          Waiting for the obstruction survey…
        </div>
      </gl-card>
    </div>

    <div class="secondary-grid">
      <gl-card class="gl-sdk4-card gl-sdk4-card--fill chart-card">
        <starlink-panel-header
          title="Latency"
          subtitle="Maximum latency in each chart bucket"
          badge="15 min"
          :subtitle-lines="2"
        />
        <gl-stable-line-chart
          v-if="historyReady"
          class="chart-slot"
          :labels="chartLabels"
          :value="latencyValues"
          :dataset-labels="['PoP latency']"
          :border-color="latencyColor"
          background-color="transparent"
          :height="210"
          :fill="false"
          :x="chartXAxis"
          :y="latencyYAxis"
          :plugins="chartPlugins"
          :minimum-y-max="200"
          :timeline-events="events"
          :timeline-start="timelineStart"
          :timeline-end="timelineEnd"
        />
        <div v-else class="empty-chart compact">Waiting for history…</div>
      </gl-card>

      <gl-card class="gl-sdk4-card gl-sdk4-card--fill chart-card">
        <starlink-panel-header
          title="Power draw"
          subtitle="Terminal consumption reported by Dishy"
          badge="15 min"
          :subtitle-lines="2"
        />
        <gl-stable-line-chart
          v-if="historyReady"
          class="chart-slot"
          :labels="chartLabels"
          :value="powerValues"
          :dataset-labels="['Power']"
          :border-color="powerColor"
          background-color="transparent"
          :height="210"
          :fill="false"
          :x="chartXAxis"
          :y="powerYAxis"
          :plugins="chartPlugins"
          :minimum-y-max="150"
          :timeline-events="events"
          :timeline-start="timelineStart"
          :timeline-end="timelineEnd"
        />
        <div v-else class="empty-chart compact">Waiting for history…</div>
      </gl-card>

      <gl-card class="gl-sdk4-card gl-sdk4-card--fill chart-card">
        <starlink-panel-header
          title="Ping success"
          subtitle="Successful Starlink PoP pings"
          badge="15 min"
          :subtitle-lines="2"
        />
        <gl-stable-line-chart
          v-if="historyReady"
          class="chart-slot"
          :labels="chartLabels"
          :value="pingValues"
          :dataset-labels="['Success']"
          :border-color="pingColor"
          background-color="transparent"
          :height="210"
          :fill="false"
          :x="chartXAxis"
          :y="pingYAxis"
          :plugins="chartPlugins"
          :minimum-y-max="100"
          :timeline-events="events"
          :timeline-start="timelineStart"
          :timeline-end="timelineEnd"
        />
        <div v-else class="empty-chart compact">Waiting for history…</div>
      </gl-card>
    </div>

    <div class="detail-grid">
      <gl-card class="gl-sdk4-card gl-sdk4-card--fill events-card">
        <starlink-panel-header
          title="Events &amp; outages"
          subtitle="Recent events held by the dish"
          :badge="eventBadge"
          :badge-tone="eventBadgeTone"
        />
        <div v-if="recentEvents.length" class="event-list">
          <div v-for="event in recentEvents" :key="eventKey(event)" class="event-row">
            <span class="event-marker" :class="'event-' + event.severity" />
            <div class="event-main">
              <span class="event-title">{{ event.label }}</span>
              <span class="event-time">{{ formatEventTime(event.startMs) }}</span>
            </div>
            <span class="event-duration">{{ formatDuration(event.durationMs) }}</span>
          </div>
        </div>
        <div v-else class="empty-detail">No recent events reported.</div>
      </gl-card>

      <gl-card class="gl-sdk4-card gl-sdk4-card--fill device-card">
        <starlink-panel-header
          title="Terminal"
          subtitle="Local hardware and connection facts"
        />
        <div class="fact-list">
          <div v-for="row in deviceRows" :key="row.label" class="fact-row">
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </div>
        </div>
      </gl-card>
    </div>

    <div
      v-if="selectedMetric"
      class="metric-detail-backdrop"
      role="presentation"
      @click.self="closeMetric"
    >
      <section
        class="metric-detail-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="`${selectedMetric.label} details`"
      >
        <div class="metric-detail-header">
          <div>
            <starlink-status-badge text="15 min" />
            <h2>{{ selectedMetric.label }}</h2>
          </div>
          <button ref="metricClose" type="button" class="detail-close" aria-label="Close" @click="closeMetric">
            ×
          </button>
        </div>

        <div class="detail-figures">
          <div v-for="figure in selectedMetricFigures" :key="figure.label">
            <span>{{ figure.label }}</span>
            <strong>{{ figure.value }} <small v-if="figure.unit">{{ figure.unit }}</small></strong>
          </div>
        </div>

        <gl-stable-line-chart
          v-if="selectedMetricChart"
          class="detail-chart"
          :labels="chartLabels"
          :value="selectedMetricChart.values"
          :dataset-labels="[selectedMetric.label]"
          :border-color="selectedMetricChart.color"
          background-color="transparent"
          :height="250"
          :fill="false"
          :x="chartXAxis"
          :y="selectedMetricChart.yAxis"
          :plugins="chartPlugins"
          :minimum-y-max="selectedMetricChart.minimumYMax"
          :scale-key="selectedMetric.id"
          :timeline-events="events"
          :timeline-start="timelineStart"
          :timeline-end="timelineEnd"
        />

        <section v-if="selectedMetric.id === 'latency' && latencyHistogramPeak" class="histogram-section">
          <div class="histogram-heading">
            <div>
              <h3>Latency distribution</h3>
              <p>2 ms bins across the current dish buffer</p>
            </div>
            <span>{{ latencyHistogramPeak.toFixed(1) }}% max</span>
          </div>
          <div
            class="latency-histogram"
            :aria-label="`Latency distribution, peak ${latencyHistogramPeak.toFixed(1)} percent of samples in one bin`"
          >
            <i
              v-for="(percentage, index) in latencyHistogram"
              :key="index"
              :style="histogramBarStyle(percentage)"
              :title="histogramBarTitle(index, percentage)"
            />
          </div>
          <div class="histogram-axis"><span>0 ms</span><span>50 ms</span><span>100+ ms</span></div>
        </section>

        <div v-if="selectedMetric.id === 'obstruction'" class="obstruction-detail">
          <div v-for="row in obstructionDetailRows" :key="row.label" class="fact-row">
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </div>
        </div>

        <p class="metric-explainer">{{ selectedMetric.explainer }}</p>
      </section>
    </div>

  </div>
</template>

<script>
const starlinkApi = require('./starlink-api');
const {
  decodeEvents,
  decodeHistoryWindow,
  downsample,
  eventIdentity,
  pingSuccess,
} = require('./history');
const { GlStableLineChart } = require('@gl-sdk4-plugin-kit/chart');
const { BIN_MS, MAX_MS, binLatencies } = require('./latency-histogram');
const StarlinkPanelHeader = require('./panel-header.vue').default;
const StarlinkPageHeader = require('./page-header.vue').default;
const StarlinkStatusBadge = require('./status-badge.vue').default;
const {
  formatRelativeTime,
  statusText: dishStatusText,
  statusTone: dishStatusTone,
} = require('./view-utils');

const STATUS_INTERVAL_MS = 10000;
const HISTORY_INTERVAL_MS = 3000;
const OBSTRUCTION_INTERVAL_MS = 300000;

function replaceArray(target, values) {
  target.splice.apply(target, [0, target.length].concat(values));
}

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function average(values) {
  const finiteValues = values.filter(function(value) { return Number.isFinite(Number(value)); });
  if (!finiteValues.length) return null;
  return finiteValues.reduce(function(total, value) { return total + Number(value); }, 0) / finiteValues.length;
}

export default {
  name: 'starlink-monitor',
  components: {
    GlStableLineChart,
    StarlinkPageHeader,
    StarlinkPanelHeader,
    StarlinkStatusBadge,
  },
  data() {
    return {
      status: null,
      rawSamples: [],
      events: [],
      obstructionMap: null,
      error: '',
      refreshing: false,
      lastUpdated: 0,
      lastHistoryAt: 0,
      lastObstructionAt: 0,
      chartLabels: [],
      throughputSeries: [[], []],
      latencyValues: [],
      powerValues: [],
      pingValues: [],
      statusInFlight: false,
      historyInFlight: false,
      obstructionInFlight: false,
      statusTimer: null,
      historyTimer: null,
      obstructionTimer: null,
      requestControllers: [],
      selectedMetricId: '',
    };
  },
  computed: {
    themeName() {
      return (this.$store && this.$store.state && this.$store.state.theme) || 'default';
    },
    historyReady() {
      return this.chartLabels.length > 0;
    },
    obstructionReady() {
      return Boolean(
        this.obstructionMap &&
        this.obstructionMap.numRows &&
        this.obstructionMap.numCols &&
        Array.isArray(this.obstructionMap.snr) &&
        this.obstructionMap.snr.length
      );
    },
    deviceInfo() {
      return (this.status && this.status.deviceInfo) || {};
    },
    deviceName() {
      return this.deviceInfo.hardwareVersion || '';
    },
    headerStatus() {
      return dishStatusText(this.status, this.error);
    },
    headerTone() {
      return dishStatusTone(this.status, this.error);
    },
    headerSubtitle() {
      const parts = [this.deviceName || 'Starlink terminal', 'Live telemetry and 15-minute history'];
      if (this.lastUpdated) parts.push(`Updated ${formatRelativeTime(this.lastUpdated)}`);
      return parts.join(' · ');
    },
    latestSample() {
      return this.rawSamples.length ? this.rawSamples[this.rawSamples.length - 1] : null;
    },
    currentPingSuccess() {
      return pingSuccess(this.rawSamples, 60);
    },
    metricCards() {
      const obstruction = this.status && this.status.obstructionStats;
      return [
        {
          id: 'download',
          label: 'Download',
          value: this.formatNumber(finite(this.status && this.status.downlinkThroughputBps, 0) / 1000000, 1),
          unit: 'Mbps',
          hint: 'Current dish traffic',
          explainer: 'Download throughput is the rate data arrives from the internet to the dish. It rises during downloads and usually sits near zero while the connection is idle.',
        },
        {
          id: 'upload',
          label: 'Upload',
          value: this.formatNumber(finite(this.status && this.status.uplinkThroughputBps, 0) / 1000000, 1),
          unit: 'Mbps',
          hint: 'Current dish traffic',
          explainer: 'Upload throughput is the rate data leaves the dish for the internet. Video calls, backups and sending large files make it rise.',
        },
        {
          id: 'latency',
          label: 'Latency',
          value: this.formatNumber(finite(this.status && this.status.popPingLatencyMs, 0), 0),
          unit: 'ms',
          hint: 'Dish to Starlink PoP',
          explainer: 'Latency is the round-trip time from the dish to the Starlink point of presence. Sustained high values can affect calls, games and interactive browsing.',
        },
        {
          id: 'power',
          label: 'Power draw',
          value: this.latestSample ? this.formatNumber(this.latestSample.powerW, 0) : '--',
          unit: this.latestSample ? 'W' : '',
          hint: 'Latest history sample',
          explainer: 'Power draw is the electricity currently used by the Starlink terminal. It can rise under load or while the dish heater is active.',
        },
        {
          id: 'ping',
          label: 'Ping success',
          value: this.currentPingSuccess === null ? '--' : this.formatNumber(this.currentPingSuccess, 1),
          unit: this.currentPingSuccess === null ? '' : '%',
          hint: 'Last 60 samples',
          explainer: 'Ping success is the share of Starlink test pings that received a response. Short dips may be invisible in normal use; sustained dips align with marked outages.',
        },
        {
          id: 'obstruction',
          label: 'Sky obstructed',
          value: obstruction
            ? this.formatNumber(finite(obstruction.fractionObstructed, 0) * 100, 2)
            : '--',
          unit: obstruction ? '%' : '',
          hint: obstruction && obstruction.patchesValid
            ? `${Number(obstruction.patchesValid).toLocaleString()} patches mapped`
            : 'Waiting for sky survey',
          explainer: 'Sky obstructed is the share of the dish survey blocked by objects such as trees or buildings. A clear view helps prevent brief interruptions.',
        },
      ];
    },
    selectedMetric() {
      if (!this.selectedMetricId) return null;
      return this.metricCards.find((metric) => metric.id === this.selectedMetricId) || null;
    },
    timelineStart() {
      return this.rawSamples.length ? this.rawSamples[0].timestampMs : 0;
    },
    timelineEnd() {
      return this.rawSamples.length
        ? this.rawSamples[this.rawSamples.length - 1].timestampMs
        : 0;
    },
    selectedMetricValues() {
      const id = this.selectedMetricId;
      if (!id || id === 'obstruction') return [];
      return this.rawSamples.map(function(sample) {
        if (id === 'download') return sample.downlinkBps / 1000000;
        if (id === 'upload') return sample.uplinkBps / 1000000;
        if (id === 'latency') return sample.latencyMs;
        if (id === 'power') return sample.powerW;
        if (id === 'ping') return Math.max(0, 1 - sample.dropRate) * 100;
        return null;
      }).filter(function(value) { return value !== null && Number.isFinite(Number(value)); });
    },
    selectedMetricFigures() {
      if (!this.selectedMetric) return [];
      if (this.selectedMetric.id === 'obstruction') {
        const obstruction = this.status && this.status.obstructionStats;
        return [
          { label: 'Current', value: this.selectedMetric.value, unit: this.selectedMetric.unit },
          {
            label: 'Mapped patches',
            value: obstruction && obstruction.patchesValid
              ? Number(obstruction.patchesValid).toLocaleString()
              : '--',
            unit: '',
          },
        ];
      }
      const mean = average(this.selectedMetricValues);
      const decimals = this.selectedMetric.id === 'ping'
        ? 1
        : this.selectedMetric.id === 'download' || this.selectedMetric.id === 'upload'
          ? 1
          : 0;
      return [
        {
          label: 'Average',
          value: mean === null ? '--' : this.formatNumber(mean, decimals),
          unit: this.selectedMetric.unit,
        },
        { label: 'Current', value: this.selectedMetric.value, unit: this.selectedMetric.unit },
      ];
    },
    selectedMetricChart() {
      if (!this.historyReady || !this.selectedMetric) return null;
      const charts = {
        download: { values: this.throughputSeries[0], color: this.throughputColors[0], yAxis: this.throughputYAxis, minimumYMax: 250 },
        upload: { values: this.throughputSeries[1], color: this.throughputColors[1], yAxis: this.throughputYAxis, minimumYMax: 250 },
        latency: { values: this.latencyValues, color: this.latencyColor, yAxis: this.latencyYAxis, minimumYMax: 200 },
        power: { values: this.powerValues, color: this.powerColor, yAxis: this.powerYAxis, minimumYMax: 150 },
        ping: { values: this.pingValues, color: this.pingColor, yAxis: this.pingYAxis, minimumYMax: 100 },
      };
      return charts[this.selectedMetric.id] || null;
    },
    latencyHistogram() {
      return binLatencies(this.rawSamples.map(function(sample) { return sample.latencyMs; }));
    },
    latencyHistogramPeak() {
      return this.latencyHistogram.length ? Math.max.apply(Math, this.latencyHistogram) : 0;
    },
    obstructionDetailRows() {
      const obstruction = (this.status && this.status.obstructionStats) || {};
      return [
        { label: 'Survey coverage', value: obstruction.validS ? this.formatUptime(obstruction.validS) : '--' },
        { label: 'Currently obstructed', value: obstruction.currentlyObstructed ? 'Yes' : 'No' },
        {
          label: 'Average obstruction duration',
          value: obstruction.avgProlongedObstructionValid
            ? this.formatDuration(finite(obstruction.avgProlongedObstructionDurationS, 0) * 1000)
            : '--',
        },
        {
          label: 'Average clear interval',
          value: obstruction.avgProlongedObstructionValid
            ? this.formatDuration(finite(obstruction.avgProlongedObstructionIntervalS, 0) * 1000)
            : '--',
        },
      ];
    },
    recentEvents() {
      return this.events.slice(0, 8);
    },
    eventBadge() {
      return this.recentEvents.length ? `${this.recentEvents.length} recent` : 'Clear';
    },
    eventBadgeTone() {
      return this.recentEvents.length ? 'warning' : 'success';
    },
    deviceRows() {
      const status = this.status || {};
      const info = this.deviceInfo;
      const obstruction = status.obstructionStats || {};
      return [
        { label: 'Hardware', value: info.hardwareVersion || '--' },
        { label: 'Software', value: info.softwareVersion || '--' },
        { label: 'Country', value: info.countryCode || '--' },
        { label: 'Uptime', value: this.formatUptime(status.deviceState && status.deviceState.uptimeS) },
        { label: 'Ethernet link', value: status.ethSpeedMbps ? `${status.ethSpeedMbps} Mbps` : '--' },
        { label: 'Service class', value: status.classOfService || '--' },
        { label: 'Sky observed', value: obstruction.validS ? this.formatUptime(obstruction.validS) : '--' },
        { label: 'Update state', value: this.humanizeToken(status.softwareUpdateState || 'unknown') },
      ];
    },
    chartXAxis() {
      return {
        display: true,
        ticks: { maxTicksLimit: 6, maxRotation: 0 },
      };
    },
    chartPlugins() {
      return {
        legend: {
          display: true,
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 7, boxHeight: 7 },
        },
        tooltip: { enabled: true },
      };
    },
    throughputYAxis() {
      return {
        display: true,
        min: 0,
        ticks: {
          maxTicksLimit: 5,
          callback: function(value) { return `${value} Mbps`; },
        },
      };
    },
    latencyYAxis() {
      return {
        display: true,
        min: 0,
        ticks: {
          maxTicksLimit: 5,
          callback: function(value) { return `${value} ms`; },
        },
      };
    },
    powerYAxis() {
      return {
        display: true,
        min: 0,
        ticks: {
          maxTicksLimit: 5,
          callback: function(value) { return `${value} W`; },
        },
      };
    },
    pingYAxis() {
      return {
        display: true,
        min: 0,
        max: 100,
        ticks: {
          maxTicksLimit: 5,
          callback: function(value) { return `${value}%`; },
        },
      };
    },
    throughputColors() {
      return [
        this.themeColor('--primary', '#1785ff'),
        this.themeColor('--success', '#20b26b'),
      ];
    },
    latencyColor() {
      return this.themeColor('--primary', '#1785ff');
    },
    powerColor() {
      return this.themeColor('--warning', '#e8a23a');
    },
    pingColor() {
      return this.themeColor('--success', '#20b26b');
    },
  },
  mounted() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('keydown', this.handleKeydown);
    window.addEventListener('resize', this.drawObstruction);
    this.refreshAll();
    this.startPolling();
  },
  beforeDestroy() {
    this.stopPolling();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('resize', this.drawObstruction);
    this.requestControllers.forEach(function(controller) { controller.abort(); });
    this.requestControllers = [];
  },
  methods: {
    openMetric(metricId) {
      this.selectedMetricId = metricId;
      this.$nextTick(() => {
        if (this.$refs.metricClose) this.$refs.metricClose.focus();
      });
    },
    closeMetric() {
      const metricId = this.selectedMetricId;
      this.selectedMetricId = '';
      this.$nextTick(function() {
        const trigger = document.querySelector(`[data-metric-id="${metricId}"]`);
        if (trigger) trigger.focus();
      });
    },
    handleKeydown(event) {
      if (event.key === 'Escape' && this.selectedMetricId) this.closeMetric();
    },
    histogramBarStyle(percentage) {
      const peak = this.latencyHistogramPeak;
      return {
        height: percentage > 0 && peak > 0
          ? `${Math.max(2, percentage / peak * 100)}%`
          : '0%',
      };
    },
    histogramBarTitle(index, percentage) {
      const start = index * BIN_MS;
      const range = index === this.latencyHistogram.length - 1
        ? `${MAX_MS}+ ms`
        : `${start}–${start + BIN_MS} ms`;
      return `${range}: ${percentage.toFixed(1)}%`;
    },
    startPolling() {
      this.statusTimer = window.setInterval(() => {
        if (!document.hidden) this.loadStatus().catch(this.noteError);
      }, STATUS_INTERVAL_MS);
      this.historyTimer = window.setInterval(() => {
        if (!document.hidden) this.loadHistory().catch(this.noteError);
      }, HISTORY_INTERVAL_MS);
      this.obstructionTimer = window.setInterval(() => {
        if (!document.hidden) this.loadObstruction().catch(this.noteError);
      }, OBSTRUCTION_INTERVAL_MS);
    },
    stopPolling() {
      window.clearInterval(this.statusTimer);
      window.clearInterval(this.historyTimer);
      window.clearInterval(this.obstructionTimer);
      this.statusTimer = null;
      this.historyTimer = null;
      this.obstructionTimer = null;
    },
    handleVisibilityChange() {
      if (document.hidden) return;
      const now = Date.now();
      this.loadStatus().catch(this.noteError);
      if (now - this.lastHistoryAt >= HISTORY_INTERVAL_MS) {
        this.loadHistory().catch(this.noteError);
      }
      if (now - this.lastObstructionAt >= OBSTRUCTION_INTERVAL_MS) {
        this.loadObstruction().catch(this.noteError);
      }
    },
    async refreshAll() {
      if (this.refreshing) return;
      this.refreshing = true;
      const results = await Promise.allSettled([
        this.loadStatus(true),
        this.loadHistory(true),
        this.loadObstruction(true),
      ]);
      const failed = results.find(function(result) { return result.status === 'rejected'; });
      if (failed) this.noteError(failed.reason);
      else this.error = '';
      this.refreshing = false;
    },
    async withTimeout(callback, timeoutMs) {
      const controller = new AbortController();
      this.requestControllers.push(controller);
      const timer = window.setTimeout(function() { controller.abort(); }, timeoutMs);
      try {
        return await callback(controller.signal);
      } finally {
        window.clearTimeout(timer);
        const index = this.requestControllers.indexOf(controller);
        if (index !== -1) this.requestControllers.splice(index, 1);
      }
    },
    async loadStatus(force) {
      if (this.statusInFlight || (document.hidden && !force)) return;
      this.statusInFlight = true;
      try {
        this.status = await this.withTimeout(starlinkApi.getStatus, 7000);
        this.lastUpdated = Date.now();
      } finally {
        this.statusInFlight = false;
      }
    },
    async loadHistory(force) {
      if (this.historyInFlight || (document.hidden && !force)) return;
      this.historyInFlight = true;
      try {
        const history = await this.withTimeout(starlinkApi.getHistory, 10000);
        const now = Date.now();
        const rawSamples = decodeHistoryWindow(history, now);
        const chartSamples = downsample(rawSamples, 180);
        this.rawSamples = rawSamples;
        this.events = decodeEvents(history)
          .filter(function(event) { return event.startMs > 0; })
          .sort(function(a, b) { return b.startMs - a.startMs; });
        replaceArray(this.chartLabels, chartSamples.map(this.formatChartTime));
        replaceArray(this.throughputSeries[0], chartSamples.map(function(sample) {
          return Number((sample.downlinkBps / 1000000).toFixed(2));
        }));
        replaceArray(this.throughputSeries[1], chartSamples.map(function(sample) {
          return Number((sample.uplinkBps / 1000000).toFixed(2));
        }));
        replaceArray(this.latencyValues, chartSamples.map(function(sample) {
          return sample.latencyMs === null ? null : Number(sample.latencyMs.toFixed(1));
        }));
        replaceArray(this.powerValues, chartSamples.map(function(sample) {
          return Number(sample.powerW.toFixed(1));
        }));
        replaceArray(this.pingValues, chartSamples.map(function(sample) {
          return Number((Math.max(0, 1 - sample.dropRate) * 100).toFixed(1));
        }));
        this.lastHistoryAt = now;
      } finally {
        this.historyInFlight = false;
      }
    },
    async loadObstruction(force) {
      if (this.obstructionInFlight || (document.hidden && !force)) return;
      this.obstructionInFlight = true;
      try {
        this.obstructionMap = await this.withTimeout(starlinkApi.getObstructionMap, 10000);
        this.lastObstructionAt = Date.now();
        this.$nextTick(this.drawObstruction);
      } finally {
        this.obstructionInFlight = false;
      }
    },
    noteError(error) {
      if (error && error.name === 'AbortError') {
        this.error = 'Starlink did not answer before the request timed out.';
      } else {
        this.error = error && error.message
          ? error.message
          : 'Could not read Starlink telemetry.';
      }
    },
    drawObstruction() {
      if (!this.obstructionReady || !this.$refs.obstructionCanvas) return;
      const canvas = this.$refs.obstructionCanvas;
      const rows = Number(this.obstructionMap.numRows);
      const cols = Number(this.obstructionMap.numCols);
      const grid = this.obstructionMap.snr;
      const availableSize = Math.max(180, canvas.parentElement.clientWidth - 16);
      const cssSize = Math.min(300, availableSize);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssSize * pixelRatio);
      canvas.height = Math.round(cssSize * pixelRatio);
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      const context = canvas.getContext('2d');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, cssSize, cssSize);

      const center = cssSize / 2;
      const radius = cssSize * 0.43;
      context.strokeStyle = this.themeColor('--border', 'rgba(128, 128, 128, 0.35)');
      context.lineWidth = 1;
      [1, 0.66, 0.33].forEach(function(scale) {
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
          context.globalAlpha = obstructed <= 0.02 ? 0.42 : 0.9;
          context.fillStyle = obstructed <= 0.02
            ? clear
            : obstructed <= 0.5
              ? partial
              : blocked;
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
      context.font = '12px sans-serif';
      context.textAlign = 'center';
      context.fillText('N', center, center - radius - 10);
      context.fillText('S', center, center + radius + 18);
      context.fillText('W', center - radius - 14, center + 4);
      context.fillText('E', center + radius + 14, center + 4);
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
    humanizeToken(value) {
      const words = String(value || '')
        .replace(/^DISH_/, '')
        .replace(/_/g, ' ')
        .toLowerCase();
      return words ? words.charAt(0).toUpperCase() + words.slice(1) : '--';
    },
    formatNumber(value, decimals) {
      return Number.isFinite(value) ? value.toFixed(decimals) : '--';
    },
    formatChartTime(sample) {
      const date = new Date(sample.timestampMs);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    formatEventTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    formatDuration(durationMs) {
      const seconds = Math.max(0, Math.round(durationMs / 1000));
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m ${seconds % 60}s`;
    },
    formatUptime(value) {
      const seconds = finite(value, 0);
      if (!seconds) return '--';
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const parts = [];
      if (days) parts.push(`${days}d`);
      if (hours || days) parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      return parts.join(' ');
    },
    eventKey(event) {
      return event.id || eventIdentity(event);
    },
  },
};
</script>

<style src="@gl-sdk4-plugin-kit/gl-card.css"></style>
<style src="@gl-sdk4-plugin-kit/gl-line-chart.css"></style>
<style src="./theme.css"></style>

<style scoped>
.starlink-monitor-wrapper {
  padding: 20px 0 28px;
  color: var(--text-color, var(--text));
}

.metric-topline,
.metric-reading,
.obstruction-legend,
.event-row,
.event-main,
.fact-row,
.metric-detail-header,
.histogram-heading {
  display: flex;
  align-items: center;
}

.metric-hint,
.event-time,
.event-duration {
  color: var(--hint-color, var(--text-weak, #8491a3));
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.metric-card {
  display: flex;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.metric-action {
  display: flex;
  width: 100%;
  min-height: 82px;
  flex: 1;
  flex-direction: column;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.metric-action:focus-visible {
  border-radius: 6px;
  outline: 2px solid var(--primary-color, var(--primary, #1785ff));
  outline-offset: 4px;
}

.metric-topline {
  justify-content: space-between;
  gap: 8px;
}

.metric-chevron {
  color: var(--hint-color, var(--text-weak));
  font-size: 18px;
  line-height: 1;
  transition: transform 120ms ease;
}

.metric-action:hover .metric-chevron {
  transform: translateX(2px);
}

.metric-label {
  color: var(--label-color, var(--text-weak));
  font-size: 12px;
  font-weight: 600;
}

.metric-reading {
  gap: 6px;
  margin: 8px 0 4px;
  white-space: nowrap;
}

.metric-value {
  color: var(--title-color, var(--text));
  font-size: 27px;
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1;
}

.metric-unit {
  align-self: flex-end;
  padding-bottom: 2px;
  color: var(--hint-color, var(--text-weak));
  font-size: 12px;
}

.metric-hint {
  overflow: hidden;
  margin-top: auto;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.primary-grid,
.secondary-grid,
.detail-grid {
  display: grid;
  align-items: stretch;
  gap: 16px;
  margin-bottom: 16px;
}

.primary-grid > *,
.secondary-grid > *,
.detail-grid > * {
  height: 100%;
  box-sizing: border-box;
}

.chart-card .chart-slot,
.chart-card .empty-chart,
.obstruction-card .obstruction-visual,
.obstruction-card .obstruction-empty,
.events-card .event-list,
.events-card .empty-detail,
.device-card .fact-list {
  flex: 1;
}

.primary-grid {
  grid-template-columns: minmax(0, 2fr) minmax(300px, 0.9fr);
}

.secondary-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.detail-grid {
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.8fr);
}

.chart-slot {
  min-width: 0;
}

.empty-chart,
.empty-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  color: var(--hint-color, var(--text-weak));
  font-size: 13px;
  text-align: center;
}

.empty-chart.compact {
  min-height: 210px;
}

.obstruction-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}

.obstruction-visual canvas {
  display: block;
  max-width: 100%;
}

.obstruction-legend {
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
  margin-top: 6px;
  color: var(--hint-color, var(--text-weak));
  font-size: 11px;
}

.obstruction-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.obstruction-legend i,
.event-marker {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.legend-clear,
.event-advisory {
  background: var(--success-color, var(--success, #20b26b));
}

.legend-partial,
.event-warning {
  background: var(--warning-color, var(--warning, #e8a23a));
}

.legend-blocked,
.event-critical {
  background: var(--error-color, var(--error, #e35d6a));
}

.obstruction-empty {
  min-height: 320px;
}

.event-list,
.fact-list {
  border-top: 1px solid var(--table-border, var(--border));
}

.event-row,
.fact-row {
  min-height: 40px;
  border-bottom: 1px solid var(--table-border, var(--border));
}

.event-row {
  gap: 9px;
}

.event-marker {
  flex: 0 0 auto;
}

.event-main {
  min-width: 0;
  flex: 1;
  justify-content: space-between;
  gap: 12px;
}

.event-title {
  overflow: hidden;
  color: var(--text-color, var(--text));
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-time,
.event-duration {
  flex: 0 0 auto;
  font-size: 11px;
}

.fact-row {
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
}

.fact-row span {
  color: var(--label-color, var(--text-weak));
}

.fact-row strong {
  overflow: hidden;
  color: var(--text-color, var(--text));
  font-weight: 500;
  text-align: right;
  text-overflow: ellipsis;
}

.empty-detail {
  min-height: 150px;
}

.metric-detail-backdrop {
  position: fixed;
  z-index: 3000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 15, 25, 0.52);
}

.metric-detail-panel {
  width: min(780px, 100%);
  max-height: calc(100vh - 48px);
  box-sizing: border-box;
  overflow-y: auto;
  padding: 20px;
  border: 1px solid var(--card-border, var(--border));
  border-radius: 12px;
  background: var(--card-color, var(--background, #fff));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
}

.metric-detail-header {
  justify-content: space-between;
  gap: 16px;
}

.metric-detail-header h2 {
  margin: 8px 0 0;
  color: var(--title-color, var(--text));
  font-size: 21px;
}

.detail-close {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 50%;
  outline: none;
  background: color-mix(in srgb, var(--text-color, #334155) 7%, transparent);
  color: var(--text-color, var(--text));
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.detail-close:focus-visible {
  outline: 2px solid var(--primary-color, var(--primary, #1785ff));
  outline-offset: 2px;
}

.detail-figures {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 18px 0 12px;
}

.detail-figures > div {
  padding: 13px 15px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-color, #334155) 5%, transparent);
}

.detail-figures span,
.detail-figures strong {
  display: block;
}

.detail-figures span {
  color: var(--hint-color, var(--text-weak));
  font-size: 11px;
  font-weight: 600;
}

.detail-figures strong {
  margin-top: 4px;
  color: var(--title-color, var(--text));
  font-size: 25px;
  line-height: 1.05;
}

.detail-figures small {
  color: var(--hint-color, var(--text-weak));
  font-size: 12px;
  font-weight: 500;
}

.detail-chart {
  margin-top: 6px;
}

.histogram-section {
  margin-top: 18px;
}

.histogram-heading {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 7px;
}

.histogram-heading h3 {
  margin: 0;
  color: var(--title-color, var(--text));
  font-size: 15px;
}

.histogram-heading p,
.histogram-heading > span,
.histogram-axis,
.metric-explainer {
  color: var(--hint-color, var(--text-weak));
}

.histogram-heading p {
  margin: 3px 0 0;
  font-size: 11px;
}

.histogram-heading > span {
  font-size: 10px;
  font-weight: 600;
}

.latency-histogram {
  display: flex;
  height: 90px;
  align-items: flex-end;
  gap: 1px;
}

.latency-histogram i {
  min-width: 1px;
  flex: 1;
  border-radius: 1px 1px 0 0;
  background: var(--primary-color, var(--primary, #1785ff));
  opacity: 0.82;
}

.histogram-axis {
  display: flex;
  justify-content: space-between;
  padding-top: 5px;
  border-top: 1px solid var(--table-border, var(--border));
  font-size: 10px;
}

.obstruction-detail {
  margin-top: 14px;
  border-top: 1px solid var(--table-border, var(--border));
}

.metric-explainer {
  margin: 17px 0 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-color, #334155) 4%, transparent);
  font-size: 12px;
  line-height: 1.55;
}

@media (max-width: 1180px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }

  .secondary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(135px, 1fr));
  }

  .primary-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }

  .metric-value {
    font-size: 24px;
  }

  .metric-detail-backdrop {
    align-items: flex-end;
    padding: 12px;
  }

  .metric-detail-panel {
    max-height: calc(100vh - 24px);
    padding: 17px;
  }
}
</style>
