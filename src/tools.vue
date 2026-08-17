<template>
  <div class="starlink-page" :class="{ 'is-dark-theme': themeName === 'dark' }">
    <starlink-page-header
      title="Starlink · Tools"
      :status="headerStatus"
      :subtitle="headerSubtitle"
      :tone="headerTone"
      :show-action="false"
    />

    <div class="tools-grid">
      <gl-card class="gl-sdk4-card gl-sdk4-card--fill speed-card">
        <starlink-panel-header
          title="Speed test"
          subtitle="Measures this browser’s path through the Starlink connection"
          badge="On demand"
          badge-tone="info"
        />

        <div class="speed-readings">
          <div class="speed-reading" :class="{ active: speedPhase === 'download' }">
            <span>Download</span>
            <div><strong>{{ speedValue(speedResult.downloadMbps) }}</strong><small>Mbps</small></div>
          </div>
          <div class="speed-reading" :class="{ active: speedPhase === 'upload' }">
            <span>Upload</span>
            <div><strong>{{ speedValue(speedResult.uploadMbps) }}</strong><small>Mbps</small></div>
          </div>
          <div class="speed-reading latency-reading">
            <span>Dish PoP latency</span>
            <div><strong>{{ speedLatency }}</strong><small>ms</small></div>
          </div>
        </div>

        <div class="speed-track" :class="{ running: speedRunning }" aria-hidden="true">
          <span :style="speedTrackStyle" />
        </div>
        <div class="speed-state" aria-live="polite">
          <strong>{{ speedStatus }}</strong>
          <span v-if="speedDuration">{{ speedDuration }}</span>
        </div>

        <div class="action-row">
          <gl-button v-if="!speedRunning" type="primary" @click="startSpeedTest">
            {{ speedPhase === 'done' || speedPhase === 'error' ? 'Run again' : 'Start speed test' }}
          </gl-button>
          <gl-button v-else type="default" @click="cancelSpeedTest">Cancel</gl-button>
        </div>

        <p class="card-note">
          This can saturate the connection for about 20 seconds. Test payloads go directly from
          your browser to Cloudflare; the router does not buffer them.
        </p>
      </gl-card>

      <gl-card class="gl-sdk4-card gl-sdk4-card--fill diagnostics-card">
        <starlink-panel-header
          title="Local diagnostics"
          subtitle="One-shot check of the three read-only Starlink endpoints"
          badge="On demand"
          badge-tone="info"
        />

        <div v-if="diagnostics.length" class="diagnostic-list" aria-live="polite">
          <div v-for="row in diagnostics" :key="row.label" class="diagnostic-row">
            <span class="diagnostic-dot" :class="row.ok ? 'is-good' : 'is-bad'" />
            <div>
              <strong>{{ row.label }}</strong>
              <p>{{ row.detail }}</p>
            </div>
            <span class="diagnostic-time">{{ row.time }}</span>
          </div>
        </div>
        <div v-else class="diagnostic-empty">
          <span class="terminal-glyph">›_</span>
          <strong>Ready when you are</strong>
          <p>No requests have been made from this page.</p>
        </div>

        <div class="action-row diagnostics-actions">
          <gl-button type="primary" :loading="diagnosticsRunning" @click="runDiagnostics">
            Run diagnostics
          </gl-button>
          <gl-button
            v-if="diagnostics.length"
            type="default"
            :disabled="diagnosticsRunning"
            @click="copyDiagnostics"
          >
            Copy report
          </gl-button>
          <span v-if="copyState" class="copy-state" aria-live="polite">{{ copyState }}</span>
        </div>
      </gl-card>
    </div>

  </div>
</template>

<script>
const starlinkApi = require('./starlink-api');
const { decodeHistoryWindow } = require('./history');
const { runSpeedTest } = require('./speed-test');
const { finite, formatNumber, humanizeToken } = require('./view-utils');
const StarlinkPanelHeader = require('./panel-header.vue').default;
const StarlinkPageHeader = require('./page-header.vue').default;

function elapsedMilliseconds(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export default {
  name: 'starlink-tools',
  components: { StarlinkPageHeader, StarlinkPanelHeader },
  data() {
    return {
      speedResult: {
        phase: 'idle',
        downloadMbps: null,
        uploadMbps: null,
        startedAtMs: null,
        endedAtMs: null,
      },
      speedLatencyValue: null,
      speedController: null,
      diagnosticsController: null,
      diagnosticsRunning: false,
      diagnostics: [],
      diagnosticPayload: null,
      copyState: '',
    };
  },
  computed: {
    themeName() {
      return (this.$store && this.$store.state && this.$store.state.theme) || 'default';
    },
    headerStatus() {
      if (this.diagnosticsRunning) return 'Running local diagnostics';
      if (this.speedRunning) return 'Speed test in progress';
      if (this.speedPhase === 'done') return 'Speed test complete';
      if (this.speedPhase === 'error') return 'Speed test failed';
      if (this.speedPhase === 'cancelled') return 'Speed test cancelled';
      if (this.diagnostics.length) {
        return this.diagnostics.every(function(row) { return row.ok; })
          ? 'Diagnostics complete'
          : 'Diagnostics found issues';
      }
      return 'Manual tools ready';
    },
    headerTone() {
      if (this.speedRunning || this.diagnosticsRunning) return 'warning';
      if (this.speedPhase === 'done') return 'online';
      if (this.speedPhase === 'error') return 'warning';
      if (this.diagnostics.length) {
        return this.diagnostics.every(function(row) { return row.ok; }) ? 'online' : 'warning';
      }
      return 'pending';
    },
    headerSubtitle() {
      if (this.diagnosticsRunning) return 'Checking status, history and obstruction endpoints';
      if (this.speedRunning) return 'Measuring this browser’s path through the Starlink connection';
      if (this.diagnostics.length) {
        const passed = this.diagnostics.filter(function(row) { return row.ok; }).length;
        return `${passed} of ${this.diagnostics.length} endpoint checks passed · Run only on demand`;
      }
      return 'Browser speed test and one-shot endpoint checks · Run only on demand';
    },
    speedPhase() {
      return this.speedResult.phase || 'idle';
    },
    speedRunning() {
      return ['download', 'upload'].includes(this.speedPhase);
    },
    speedLatency() {
      return this.speedLatencyValue === null ? '--' : formatNumber(this.speedLatencyValue, 0);
    },
    speedStatus() {
      const labels = {
        idle: 'Test has not been started',
        download: 'Measuring download…',
        upload: 'Measuring upload…',
        done: 'Measurement complete',
        error: 'Could not complete the measurement',
        cancelled: 'Measurement cancelled',
      };
      return labels[this.speedPhase] || humanizeToken(this.speedPhase);
    },
    speedDuration() {
      const start = this.speedResult.startedAtMs;
      const end = this.speedResult.endedAtMs;
      if (!start || !end) return '';
      return `${((end - start) / 1000).toFixed(1)} s`;
    },
    speedTrackStyle() {
      if (this.speedPhase === 'download') return { width: '45%' };
      if (this.speedPhase === 'upload') return { width: '82%' };
      if (this.speedPhase === 'done') return { width: '100%' };
      return { width: '0%' };
    },
  },
  mounted() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  },
  beforeDestroy() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.cancelSpeedTest();
    if (this.diagnosticsController) this.diagnosticsController.abort();
  },
  methods: {
    handleVisibilityChange() {
      if (document.hidden && this.speedRunning) this.cancelSpeedTest();
      if (document.hidden && this.diagnosticsController) this.diagnosticsController.abort();
    },
    speedValue(value) {
      return Number.isFinite(Number(value)) ? formatNumber(value, 1) : '--';
    },
    async readLatency(signal) {
      const controller = new AbortController();
      const handleAbort = function() { controller.abort(); };
      if (signal && signal.aborted) controller.abort();
      else if (signal) signal.addEventListener('abort', handleAbort, { once: true });
      const timeout = window.setTimeout(function() { controller.abort(); }, 5000);
      try {
        const status = await starlinkApi.getStatus(controller.signal);
        this.speedLatencyValue = finite(status.popPingLatencyMs, null);
      } catch (error) {
        this.speedLatencyValue = null;
      } finally {
        window.clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', handleAbort);
      }
    },
    async startSpeedTest() {
      if (this.speedRunning) return;
      const controller = new AbortController();
      this.speedController = controller;
      this.speedLatencyValue = null;
      this.speedResult = {
        phase: 'download',
        downloadMbps: null,
        uploadMbps: null,
        startedAtMs: Date.now(),
        endedAtMs: null,
      };
      await this.readLatency(controller.signal);
      if (controller.signal.aborted) return;
      await runSpeedTest((progress) => {
        this.speedResult = progress;
      }, controller.signal);
      if (this.speedController === controller) this.speedController = null;
    },
    cancelSpeedTest() {
      if (!this.speedController) return;
      this.speedController.abort();
      this.speedController = null;
      this.speedResult = {
        ...this.speedResult,
        phase: 'cancelled',
        endedAtMs: Date.now(),
      };
    },
    async timedDiagnostic(label, request, signal) {
      const startedAt = performance.now();
      try {
        const value = await request(signal);
        return { label, ok: true, ms: elapsedMilliseconds(startedAt), value };
      } catch (error) {
        return {
          label,
          ok: false,
          ms: elapsedMilliseconds(startedAt),
          error: error && error.message || 'Request failed',
        };
      }
    },
    async runDiagnostics() {
      if (this.diagnosticsRunning) return;
      this.diagnosticsRunning = true;
      this.copyState = '';
      const controller = new AbortController();
      this.diagnosticsController = controller;
      const timeout = window.setTimeout(function() { controller.abort(); }, 12000);
      const results = await Promise.all([
        this.timedDiagnostic('Status endpoint', starlinkApi.getStatus, controller.signal),
        this.timedDiagnostic('History endpoint', starlinkApi.getHistory, controller.signal),
        this.timedDiagnostic('Obstruction endpoint', starlinkApi.getObstructionMap, controller.signal),
      ]);
      window.clearTimeout(timeout);
      if (this.diagnosticsController === controller) this.diagnosticsController = null;

      const statusResult = results[0];
      const historyResult = results[1];
      const mapResult = results[2];
      const status = statusResult.value || {};
      const samples = historyResult.ok
        ? decodeHistoryWindow(historyResult.value || {}, Date.now())
        : [];
      const map = mapResult.value || {};
      const rows = [
        {
          label: statusResult.label,
          ok: statusResult.ok,
          time: `${statusResult.ms} ms`,
          detail: statusResult.ok
            ? `${status.deviceInfo && status.deviceInfo.hardwareVersion || 'Dish'} · ` +
              `${formatNumber(finite(status.popPingLatencyMs, 0), 0)} ms PoP latency`
            : statusResult.error,
        },
        {
          label: historyResult.label,
          ok: historyResult.ok,
          time: `${historyResult.ms} ms`,
          detail: historyResult.ok
            ? `${samples.length.toLocaleString()} one-second samples available`
            : historyResult.error,
        },
        {
          label: mapResult.label,
          ok: mapResult.ok,
          time: `${mapResult.ms} ms`,
          detail: mapResult.ok
            ? `${finite(map.numCols, 0)} × ${finite(map.numRows, 0)} cells · ` +
              `${Array.isArray(map.snr) ? map.snr.length.toLocaleString() : 0} values`
            : mapResult.error,
        },
      ];
      this.diagnostics = rows;
      this.diagnosticPayload = {
        generatedAt: new Date().toISOString(),
        pluginVersion: '1.2.8',
        endpoints: rows,
        terminal: statusResult.ok ? {
          hardwareVersion: status.deviceInfo && status.deviceInfo.hardwareVersion || null,
          softwareVersion: status.deviceInfo && status.deviceInfo.softwareVersion || null,
          uptimeS: status.deviceState && status.deviceState.uptimeS || null,
          popPingLatencyMs: status.popPingLatencyMs || null,
          obstructionFraction: status.obstructionStats && status.obstructionStats.fractionObstructed || null,
        } : null,
      };
      this.diagnosticsRunning = false;
    },
    async copyDiagnostics() {
      const text = JSON.stringify(this.diagnosticPayload, null, 2);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        this.copyState = 'Copied';
      } catch (error) {
        this.copyState = 'Copy failed';
      }
    },
  },
};
</script>

<style src="@gl-sdk4-plugin-kit/gl-card.css"></style>
<style src="./theme.css"></style>

<style scoped>
.starlink-page { padding: 20px 0 28px; color: var(--text-color, var(--text)); }
.tools-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 16px; align-items: stretch; margin-bottom: 16px; }
.tools-grid > * { box-sizing: border-box; height: 100%; }
.card-note, .diagnostic-row p, .diagnostic-empty p { color: var(--hint-color, var(--text-weak, #8491a3)); }
.speed-readings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.speed-reading { display: flex; box-sizing: border-box; min-width: 0; min-height: 94px; flex-direction: column; padding: 15px; border: 1px solid var(--card-border, var(--border)); border-radius: 10px; background: var(--body-background, rgba(127,127,127,.03)); }
.speed-reading.active { border-color: var(--primary-color, #1785ff); box-shadow: inset 0 0 0 1px var(--primary-color, #1785ff); }
.speed-reading > span { color: var(--hint-color, var(--text-weak)); font-size: 10px; font-weight: 650; letter-spacing: .05em; text-transform: uppercase; }
.speed-reading div { display: flex; align-items: baseline; gap: 5px; margin-top: auto; padding-top: 10px; }
.speed-reading strong { color: var(--title-color, var(--text)); font-size: 27px; font-weight: 650; font-variant-numeric: tabular-nums; }
.speed-reading small { color: var(--hint-color, var(--text-weak)); font-size: 10px; }
.speed-track { height: 4px; margin-top: 20px; overflow: hidden; border-radius: 4px; background: var(--card-border, var(--border)); }
.speed-track span { display: block; height: 100%; border-radius: inherit; background: var(--primary-color, #1785ff); transition: width .25s ease; }
.speed-track.running span { background-image: linear-gradient(90deg, var(--primary-color, #1785ff), #54b7ff, var(--primary-color, #1785ff)); background-size: 200% 100%; animation: progress-flow 1.6s linear infinite; }
.speed-state { display: flex; justify-content: space-between; gap: 10px; min-height: 36px; padding-top: 9px; font-size: 11px; }
.speed-state strong { color: var(--text-color, var(--text)); font-weight: 550; }
.speed-state span { color: var(--hint-color, var(--text-weak)); font-variant-numeric: tabular-nums; }
.action-row { display: flex; min-height: 40px; align-items: center; gap: 10px; }
.card-note { margin: 14px 0 0; font-size: 11px; line-height: 1.5; }
.diagnostic-list { min-height: 192px; flex: 1; border-top: 1px solid var(--card-border, var(--border)); }
.diagnostic-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 12px 0; border-bottom: 1px solid var(--card-border, var(--border)); }
.diagnostic-dot { width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; }
.diagnostic-dot.is-good { background: var(--success-color, #20b26b); }
.diagnostic-dot.is-bad { background: var(--error-color, #e35d6a); }
.diagnostic-row strong { display: block; color: var(--text-color, var(--text)); font-size: 12px; font-weight: 600; }
.diagnostic-row p { margin: 3px 0 0; font-size: 10px; line-height: 1.4; }
.diagnostic-time { color: var(--hint-color, var(--text-weak)); font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.diagnostic-empty { display: flex; min-height: 192px; flex: 1; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.terminal-glyph { margin-bottom: 10px; color: var(--primary-color, #1785ff); font-family: monospace; font-size: 30px; font-weight: 700; }
.diagnostic-empty strong { color: var(--title-color, var(--text)); font-size: 13px; }
.diagnostic-empty p { margin: 4px 0 0; font-size: 11px; }
.diagnostics-actions { margin-top: 14px; }
.copy-state { color: var(--success-color, #20b26b); font-size: 11px; }
@keyframes progress-flow { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .speed-track span { transition: none; } .speed-track.running span { animation: none; } }
@media (max-width: 980px) { .tools-grid { grid-template-columns: 1fr; grid-auto-rows: auto; } .tools-grid > * { height: auto; } }
@media (max-width: 640px) { .speed-readings { grid-template-columns: 1fr; } }
</style>
