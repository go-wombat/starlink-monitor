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

    <gl-card class="gl-sdk4-card endpoint-card">
      <starlink-panel-header
        title="Dish endpoint"
        subtitle="Local IPv4 address used by the authenticated router proxy"
        :badge="endpointAddress + ':' + endpointPort"
        badge-tone="info"
      />

      <div class="endpoint-form">
        <label class="endpoint-field">
          <span>Dish IP address</span>
          <input
            v-model.trim="endpointDraft"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            spellcheck="false"
            placeholder="192.168.100.1"
            :disabled="endpointBusy"
            :aria-invalid="endpointDraft.length > 0 && !endpointValid"
            @keydown.enter.prevent="saveEndpoint"
          />
        </label>
        <div class="endpoint-port" aria-label="Fixed Starlink API port">
          <span>Port</span>
          <strong>{{ endpointPort }}</strong>
          <small>Fixed</small>
        </div>
        <div class="endpoint-security">
          <strong>Admin-only setting</strong>
          <span>Only a validated IPv4 address is stored. The path, protocol and port cannot be changed.</span>
        </div>
      </div>

      <div class="action-row endpoint-actions">
        <gl-button
          type="primary"
          :loading="endpointSaving"
          :disabled="endpointBusy || !endpointValid || !endpointDirty"
          @click="saveEndpoint"
        >
          Save
        </gl-button>
        <gl-button
          type="default"
          :loading="endpointTesting"
          :disabled="endpointBusy || !endpointValid"
          @click="testEndpoint"
        >
          Test connection
        </gl-button>
        <gl-button
          type="default"
          :disabled="endpointBusy || (!endpointDirty && endpointAddress === endpointDefault)"
          @click="resetEndpoint"
        >
          Reset to default
        </gl-button>
        <span
          v-if="endpointMessage"
          class="endpoint-message"
          :class="'is-' + endpointMessageTone"
          aria-live="polite"
        >
          {{ endpointMessage }}
        </span>
      </div>
    </gl-card>

  </div>
</template>

<script>
const safeRpcMixin = require('gl-sdk4-plugin-kit/lib/safe-rpc-mixin');
const {
  DEFAULT_DISH_ADDRESS,
  DISH_PORT,
  isValidDishAddress,
} = require('./endpoint-config');
const pluginPackage = require('../package.json');
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
  mixins: [safeRpcMixin],
  data() {
    return {
      endpointAddress: DEFAULT_DISH_ADDRESS,
      endpointDraft: DEFAULT_DISH_ADDRESS,
      endpointDefault: DEFAULT_DISH_ADDRESS,
      endpointPort: DISH_PORT,
      endpointLoading: false,
      endpointSaving: false,
      endpointTesting: false,
      endpointMessage: '',
      endpointMessageTone: 'neutral',
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
    endpointBusy() {
      return this.endpointLoading || this.endpointSaving || this.endpointTesting;
    },
    endpointValid() {
      return isValidDishAddress(this.endpointDraft);
    },
    endpointDirty() {
      return this.endpointDraft !== this.endpointAddress;
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
    this.loadEndpointConfig();
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
    async loadEndpointConfig() {
      this.endpointLoading = true;
      const result = await this.safeRpc('starlink-monitor', 'get_config', {});
      if (result && isValidDishAddress(result.address)) {
        this.endpointAddress = result.address;
        this.endpointDraft = result.address;
        this.endpointDefault = isValidDishAddress(result.default_address)
          ? result.default_address
          : DEFAULT_DISH_ADDRESS;
        this.endpointPort = Number(result.port) || DISH_PORT;
      } else {
        this.endpointMessage = 'Could not read the router setting';
        this.endpointMessageTone = 'error';
      }
      this.endpointLoading = false;
    },
    async saveEndpoint() {
      if (this.endpointBusy || !this.endpointValid || !this.endpointDirty) return;
      this.endpointSaving = true;
      this.endpointMessage = '';
      const result = await this.safeRpc('starlink-monitor', 'set_config', {
        address: this.endpointDraft,
      });
      if (result && !result.err_code && isValidDishAddress(result.address)) {
        this.endpointAddress = result.address;
        this.endpointDraft = result.address;
        this.endpointMessage = `Saved ${result.address}:${Number(result.port) || DISH_PORT}`;
        this.endpointMessageTone = 'success';
      } else {
        this.endpointMessage = result && result.err_msg === 'invalid_ipv4_address'
          ? 'Enter a valid unicast IPv4 address'
          : 'Could not save the router setting';
        this.endpointMessageTone = 'error';
      }
      this.endpointSaving = false;
    },
    async testEndpoint() {
      if (this.endpointBusy || !this.endpointValid) return;
      this.endpointTesting = true;
      this.endpointMessage = '';
      const result = await this.safeRpc('starlink-monitor', 'test_config', {
        address: this.endpointDraft,
      });
      if (result && result.reachable) {
        this.endpointMessage = `Dish responded at ${result.address}:${Number(result.port) || DISH_PORT}`;
        this.endpointMessageTone = 'success';
      } else {
        this.endpointMessage = result && result.err_msg === 'invalid_ipv4_address'
          ? 'Enter a valid unicast IPv4 address'
          : `No Starlink response from ${this.endpointDraft}:${DISH_PORT}`;
        this.endpointMessageTone = 'error';
      }
      this.endpointTesting = false;
    },
    async resetEndpoint() {
      if (this.endpointBusy) return;
      this.endpointDraft = this.endpointDefault;
      if (!this.endpointDirty) {
        this.endpointMessage = 'Default address is already active';
        this.endpointMessageTone = 'neutral';
        return;
      }
      await this.saveEndpoint();
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
        pluginVersion: pluginPackage.version,
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
.endpoint-card { margin-bottom: 16px; }
.endpoint-form { display: grid; grid-template-columns: minmax(240px, 1fr) 120px minmax(280px, 1.4fr); gap: 14px; align-items: end; }
.endpoint-field { display: flex; min-width: 0; flex-direction: column; gap: 7px; }
.endpoint-field > span, .endpoint-port > span { color: var(--hint-color, var(--text-weak)); font-size: 10px; font-weight: 650; letter-spacing: .05em; text-transform: uppercase; }
.endpoint-field input { box-sizing: border-box; width: 100%; height: 42px; padding: 0 13px; border: 1px solid var(--card-border, var(--border)); border-radius: 8px; outline: none; background: var(--body-background, rgba(127,127,127,.03)); color: var(--text-color, var(--text)); font: 600 13px/1 monospace; }
.endpoint-field input:focus { border-color: var(--primary-color, #1785ff); box-shadow: 0 0 0 2px rgba(23,133,255,.12); }
.endpoint-field input[aria-invalid="true"] { border-color: var(--error-color, #e35d6a); }
.endpoint-field input:disabled { cursor: not-allowed; opacity: .6; }
.endpoint-port { display: grid; box-sizing: border-box; height: 68px; grid-template-columns: 1fr auto; align-content: center; gap: 5px 8px; padding: 10px 13px; border: 1px solid var(--card-border, var(--border)); border-radius: 8px; background: var(--body-background, rgba(127,127,127,.03)); }
.endpoint-port > span { grid-column: 1 / -1; }
.endpoint-port strong { color: var(--title-color, var(--text)); font-size: 17px; font-variant-numeric: tabular-nums; }
.endpoint-port small { align-self: center; color: var(--hint-color, var(--text-weak)); font-size: 10px; }
.endpoint-security { display: flex; box-sizing: border-box; min-height: 68px; flex-direction: column; justify-content: center; padding: 10px 13px; border-radius: 8px; background: rgba(23,133,255,.07); }
.endpoint-security strong { color: var(--title-color, var(--text)); font-size: 11px; }
.endpoint-security span { margin-top: 3px; color: var(--hint-color, var(--text-weak)); font-size: 10px; line-height: 1.4; }
.endpoint-actions { margin-top: 16px; flex-wrap: wrap; }
.endpoint-message { margin-left: auto; font-size: 11px; }
.endpoint-message.is-success { color: var(--success-color, #20b26b); }
.endpoint-message.is-error { color: var(--error-color, #e35d6a); }
.endpoint-message.is-neutral { color: var(--hint-color, var(--text-weak)); }
@keyframes progress-flow { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .speed-track span { transition: none; } .speed-track.running span { animation: none; } }
@media (max-width: 980px) { .tools-grid { grid-template-columns: 1fr; grid-auto-rows: auto; } .tools-grid > * { height: auto; } .endpoint-form { grid-template-columns: minmax(0, 1fr) 110px; } .endpoint-security { grid-column: 1 / -1; } }
@media (max-width: 640px) { .speed-readings { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .endpoint-form { grid-template-columns: 1fr; } .endpoint-security { grid-column: auto; } .endpoint-message { width: 100%; margin-left: 0; } }
</style>
