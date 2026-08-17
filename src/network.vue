<template>
  <div class="network-wrapper" :class="{ 'is-dark-theme': themeName === 'dark' }">
    <starlink-page-header
      title="Starlink · Network"
      :status="headerStatus"
      :subtitle="headerSubtitle"
      :tone="headerTone"
      :error="error"
      :loading="refreshing"
      @refresh="refresh"
    />

    <div class="summary-grid">
      <gl-card class="gl-sdk4-card gl-sdk4-card--fill summary-card">
        <div class="gl-sdk4-card__grow summary-card-body">
          <span>Connected</span>
          <strong>{{ onlineClients.length }}</strong>
          <small>online now</small>
        </div>
      </gl-card>
      <gl-card class="gl-sdk4-card gl-sdk4-card--fill summary-card">
        <div class="gl-sdk4-card__grow summary-card-body">
          <span>Wireless</span>
          <strong>{{ wirelessCount }}</strong>
          <small>{{ activeRadios }} active radio{{ activeRadios === 1 ? '' : 's' }}</small>
        </div>
      </gl-card>
      <gl-card class="gl-sdk4-card gl-sdk4-card--fill summary-card">
        <div class="gl-sdk4-card__grow summary-card-body">
          <span>Wired</span>
          <strong>{{ wiredCount }}</strong>
          <small>connected clients</small>
        </div>
      </gl-card>
      <gl-card class="gl-sdk4-card gl-sdk4-card--fill summary-card">
        <div class="gl-sdk4-card__grow summary-card-body">
          <span>Client traffic</span>
          <strong>{{ formatBytes(connectedRx + connectedTx) }}</strong>
          <small>RX {{ formatBytes(connectedRx) }} · TX {{ formatBytes(connectedTx) }}</small>
        </div>
      </gl-card>
    </div>

    <gl-card v-if="radios.length" class="gl-sdk4-card radios-card">
      <starlink-panel-header
        title="Wi-Fi radios"
        subtitle="Current radio state reported by the router"
        :badge="activeRadios + '/' + radios.length + ' active'"
        :badge-tone="radioBadgeTone"
      />
      <div class="radio-list">
        <div v-for="radio in radios" :key="radio.name" class="radio-row">
          <span class="radio-dot" :class="radioIsActive(radio) ? 'is-active' : ''" />
          <strong>{{ radio.name || 'Wi-Fi radio' }}</strong>
          <span class="radio-state">{{ radioIsActive(radio) ? 'Active' : 'Off' }}</span>
          <span class="radio-channel">{{ radio.channel ? `Channel ${radio.channel}` : 'No channel' }}</span>
        </div>
      </div>
    </gl-card>

    <gl-card class="gl-sdk4-card clients-card">
      <starlink-panel-header
        title="Clients"
        subtitle="Connected and known devices reported by the router"
        :badge="filteredClients.length + ' shown'"
      />
      <div class="clients-toolbar">
        <div class="segmented" role="tablist" aria-label="Client list">
          <button
            type="button"
            role="tab"
            :aria-selected="clientMode === 'connected'"
            :class="{ active: clientMode === 'connected' }"
            @click="clientMode = 'connected'"
          >
            Connected <span>{{ onlineClients.length }}</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="clientMode === 'known'"
            :class="{ active: clientMode === 'known' }"
            @click="clientMode = 'known'"
          >
            Known <span>{{ clients.length }}</span>
          </button>
        </div>
        <label class="search-box">
          <span class="sr-only">Search clients</span>
          <input v-model.trim="query" type="search" placeholder="Search name, IP or MAC" />
        </label>
      </div>

      <div v-if="filteredClients.length" class="client-columns" aria-hidden="true">
        <span />
        <span>Device</span>
        <span>Access</span>
        <span>Interface</span>
        <span>Traffic</span>
        <span />
      </div>
      <div v-if="filteredClients.length" class="client-list">
        <button
          v-for="(client, index) in filteredClients"
          :key="clientKey(client, index)"
          type="button"
          class="client-row"
          @click="openClient(client)"
        >
          <span class="device-icon" :class="client.online ? 'is-online' : ''" aria-hidden="true">
            <i />
          </span>
          <span class="client-identity">
            <strong>{{ displayName(client) }}</strong>
            <small>{{ client.ip || 'No IP address' }} · {{ client.mac || 'No MAC address' }}</small>
          </span>
          <span class="client-access" :class="{ 'is-paused': client.blocked }">
            {{ client.blocked ? 'Paused' : 'Allowed' }}
          </span>
          <span class="iface-badge">{{ interfaceLabel(client.iface) }}</span>
          <span class="client-traffic">
            <strong>RX {{ formatBytes(client.total_rx) }}</strong>
            <small>TX {{ formatBytes(client.total_tx) }}</small>
          </span>
          <span class="chevron" aria-hidden="true">›</span>
        </button>
      </div>
      <div v-else class="empty-list">
        {{ query ? 'No clients match this search.' : 'No clients in this view.' }}
      </div>
    </gl-card>

    <div
      v-if="selectedClient"
      class="detail-backdrop"
      role="presentation"
      @click.self="closeClient"
    >
      <section
        class="detail-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="`${displayName(selectedClient)} details`"
      >
        <div class="detail-header">
          <div>
            <span class="detail-state" :class="selectedClient.online ? 'online' : ''">
              {{ selectedClient.online ? 'Connected' : 'Offline' }}
            </span>
            <h2>{{ displayName(selectedClient) }}</h2>
          </div>
          <button ref="clientClose" type="button" class="close-button" aria-label="Close" @click="closeClient">
            ×
          </button>
        </div>
        <div class="detail-traffic">
          <div><span>Received</span><strong>{{ formatBytes(selectedClient.total_rx) }}</strong></div>
          <div><span>Sent</span><strong>{{ formatBytes(selectedClient.total_tx) }}</strong></div>
        </div>
        <div class="fact-list">
          <div v-for="row in selectedClientRows" :key="row.label" class="fact-row">
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
const {
  clientKey,
  displayName,
  formatBytes,
  formatDuration,
  interfaceLabel,
  normalizeClients,
  sortClients,
  totalTraffic,
} = require('./network-utils');
const StarlinkPanelHeader = require('./panel-header.vue').default;
const StarlinkPageHeader = require('./page-header.vue').default;
const { formatRelativeTime } = require('./view-utils');

const NETWORK_INTERVAL_MS = 5000;

export default {
  name: 'starlink-network',
  components: { StarlinkPageHeader, StarlinkPanelHeader },
  data() {
    return {
      clients: [],
      clientStatus: null,
      radios: [],
      clientMode: 'connected',
      query: '',
      selectedClient: null,
      error: '',
      refreshing: false,
      inFlight: false,
      lastUpdated: 0,
      timer: null,
    };
  },
  computed: {
    themeName() {
      return (this.$store && this.$store.state && this.$store.state.theme) || 'default';
    },
    headerStatus() {
      if (this.error) return 'Router data unavailable';
      return this.lastUpdated ? 'Router network ready' : 'Loading router network';
    },
    headerTone() {
      if (this.error) return 'offline';
      return this.lastUpdated ? 'online' : 'pending';
    },
    headerSubtitle() {
      if (!this.lastUpdated) return 'GL.iNet clients, radios and traffic counters';
      const radios = `${this.activeRadios} active Wi-Fi radio${this.activeRadios === 1 ? '' : 's'}`;
      return `${this.onlineClients.length} connected clients · ${radios} · ` +
        `Updated ${formatRelativeTime(this.lastUpdated)}`;
    },
    onlineClients() {
      return this.clients.filter(function(client) { return Boolean(client.online); });
    },
    wirelessCount() {
      const count = this.clientStatus && Number(this.clientStatus.wireless_total);
      return Number.isFinite(count) ? count : 0;
    },
    wiredCount() {
      const count = this.clientStatus && Number(this.clientStatus.cable_total);
      return Number.isFinite(count) ? count : 0;
    },
    activeRadios() {
      return this.radios.filter(this.radioIsActive).length;
    },
    radioBadgeTone() {
      return this.activeRadios === this.radios.length ? 'success' : 'warning';
    },
    connectedRx() {
      return totalTraffic(this.onlineClients, 'total_rx');
    },
    connectedTx() {
      return totalTraffic(this.onlineClients, 'total_tx');
    },
    filteredClients() {
      const source = this.clientMode === 'connected' ? this.onlineClients : this.clients;
      const needle = this.query.toLowerCase();
      const filtered = needle
        ? source.filter(function(client) {
          return [client.alias, client.name, client.ip, client.mac, client.iface]
            .some(function(value) { return String(value || '').toLowerCase().includes(needle); });
        })
        : source;
      return sortClients(filtered);
    },
    selectedClientRows() {
      const client = this.selectedClient || {};
      return [
        { label: 'IP address', value: client.ip || '--' },
        { label: 'MAC address', value: client.mac || '--' },
        { label: 'Interface', value: interfaceLabel(client.iface) },
        { label: 'Online time', value: formatDuration(client.online_time) },
        { label: 'Access', value: client.blocked ? 'Paused' : 'Allowed' },
        { label: 'Class', value: client.class || '--' },
      ];
    },
  },
  mounted() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('keydown', this.handleKeydown);
    this.refresh();
    this.timer = window.setInterval(() => {
      if (!document.hidden) this.loadNetwork().catch(this.noteError);
    }, NETWORK_INTERVAL_MS);
  },
  beforeDestroy() {
    window.clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('keydown', this.handleKeydown);
  },
  methods: {
    clientKey,
    displayName,
    formatBytes,
    interfaceLabel,
    async refresh() {
      if (this.refreshing) return;
      this.refreshing = true;
      try {
        await this.loadNetwork(true);
      } catch (error) {
        this.noteError(error);
      } finally {
        this.refreshing = false;
      }
    },
    async loadNetwork(force) {
      if (this.inFlight || (document.hidden && !force)) return;
      this.inFlight = true;
      try {
        const results = await Promise.allSettled([
          this.routerCall('clients', 'get_list'),
          this.routerCall('clients', 'get_status'),
          this.routerCall('wifi', 'get_status'),
        ]);
        if (results[0].status === 'rejected') throw results[0].reason;
        this.clients = normalizeClients(results[0].value);
        if (results[1].status === 'fulfilled') this.clientStatus = results[1].value;
        if (results[2].status === 'fulfilled') {
          this.radios = Array.isArray(results[2].value && results[2].value.res)
            ? results[2].value.res
            : [];
        }
        if (this.selectedClient) {
          const selectedMac = this.selectedClient.mac;
          this.selectedClient = this.clients.find(function(client) {
            return selectedMac && client.mac === selectedMac;
          }) || this.selectedClient;
        }
        this.lastUpdated = Date.now();
        this.error = '';
      } finally {
        this.inFlight = false;
      }
    },
    handleVisibilityChange() {
      if (!document.hidden) this.loadNetwork().catch(this.noteError);
    },
    handleKeydown(event) {
      if (event.key === 'Escape' && this.selectedClient) this.closeClient();
    },
    openClient(client) {
      this.selectedClient = client;
      this.$nextTick(() => {
        if (this.$refs.clientClose) this.$refs.clientClose.focus();
      });
    },
    closeClient() {
      this.selectedClient = null;
    },
    radioIsActive(radio) {
      const state = radio && radio.state;
      return state === true || state === 1 || state === '1' || state === 'on' || state === 'up';
    },
    routerCall(namespace, method) {
      if (typeof this.$rpcRequest !== 'function') {
        return Promise.reject(new Error('GL.iNet admin RPC runtime is unavailable.'));
      }
      return this.$rpcRequest('call', ['sid', namespace, method, {}]);
    },
    noteError(error) {
      this.error = error && error.message
        ? error.message
        : 'Could not read the router client list.';
    },
  },
};
</script>

<style src="@gl-sdk4-plugin-kit/gl-card.css"></style>
<style src="./theme.css"></style>

<style scoped>
.network-wrapper {
  padding: 20px 0 28px;
  color: var(--text-color, var(--text));
}

.clients-toolbar,
.detail-header,
.detail-traffic,
.fact-row {
  display: flex;
  align-items: center;
}

.radio-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--hint-color, #8491a3);
}

.radio-dot.is-active {
  background: var(--success-color, var(--success, #20b26b));
  box-shadow: 0 0 0 4px rgba(32, 178, 107, 0.12);
}

.summary-card span,
.summary-card small,
.radio-row span,
.client-identity small,
.client-traffic small,
.fact-row span {
  color: var(--hint-color, var(--text-weak, #8491a3));
}

.radios-card,
.summary-grid {
  margin-bottom: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 12px;
  align-items: stretch;
}

.summary-card {
  box-sizing: border-box;
  min-height: 100px;
  min-width: 0;
  height: 100%;
}

.summary-card-body {
  display: flex;
  box-sizing: border-box;
  min-width: 0;
  flex-direction: column;
}

.summary-card-body > span,
.summary-card-body > small {
  display: block;
  font-size: 11px;
}

.summary-card-body > small {
  overflow: hidden;
  margin-top: auto;
  padding-top: 5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-card-body > strong {
  display: block;
  margin: 7px 0 3px;
  color: var(--title-color, var(--text));
  font-size: 28px;
  line-height: 1;
}

.detail-header h2 {
  margin: 0;
  color: var(--title-color, var(--text));
}

.radio-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  grid-auto-rows: 1fr;
  gap: 8px;
}

.radio-row {
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr) 64px 90px;
  gap: 9px;
  min-height: 44px;
  align-items: center;
  padding: 0 11px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--text-color, #334155) 4%, transparent);
  font-size: 12px;
}

.radio-row strong {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.radio-state,
.radio-channel {
  text-align: right;
  white-space: nowrap;
}

.clients-toolbar {
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}

.segmented {
  display: inline-flex;
  min-height: 40px;
  box-sizing: border-box;
  padding: 3px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-color, #334155) 7%, transparent);
}

.segmented button {
  padding: 7px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hint-color, var(--text-weak));
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
}

.segmented button.active {
  background: var(--card-color, var(--background, #fff));
  color: var(--title-color, var(--text));
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
}

.segmented button span {
  margin-left: 3px;
  opacity: 0.58;
  font-size: 10px;
}

.search-box {
  width: min(280px, 45%);
}

.search-box input {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 0 11px;
  border: 1px solid var(--card-border, var(--border));
  border-radius: 7px;
  outline: none;
  background: transparent;
  color: var(--text-color, var(--text));
  font: inherit;
  font-size: 12px;
}

.search-box input:focus,
.segmented button:focus-visible,
.client-row:focus-visible,
.close-button:focus-visible {
  outline: 2px solid var(--primary-color, var(--primary, #1785ff));
  outline-offset: 2px;
}

.client-columns,
.client-row {
  display: grid;
  grid-template-columns: 32px minmax(180px, 1fr) 70px 96px 120px 14px;
  gap: 12px;
  align-items: center;
}

.client-columns {
  padding: 0 11px 7px;
  color: var(--hint-color, var(--text-weak));
  font-size: 10px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.client-columns span:nth-child(n + 3) {
  text-align: right;
}

.client-list {
  display: flex;
  max-height: 610px;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.client-row {
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  padding: 9px 11px;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-color, #334155) 4%, transparent);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.client-row:hover {
  background: color-mix(in srgb, var(--text-color, #334155) 8%, transparent);
}

.device-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-color, #334155) 8%, transparent);
}

.device-icon i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--hint-color, #8491a3);
}

.device-icon.is-online i {
  background: var(--success-color, var(--success, #20b26b));
}

.client-identity {
  min-width: 0;
}

.client-identity strong,
.client-identity small,
.client-traffic strong,
.client-traffic small {
  display: block;
}

.client-identity strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.client-identity small,
.client-traffic {
  margin-top: 2px;
  font-size: 10.5px;
}

.client-identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.client-access,
.iface-badge,
.detail-state {
  color: var(--hint-color, var(--text-weak));
  font-size: 10px;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}

.client-access.is-paused {
  color: var(--warning-color, var(--warning, #e8a23a));
}

.iface-badge,
.detail-state {
  overflow: hidden;
  padding: 4px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-color, #334155) 7%, transparent);
  text-overflow: ellipsis;
}

.client-traffic {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.client-traffic strong {
  color: var(--text-color, var(--text));
  font-weight: 600;
}

.chevron {
  color: var(--hint-color, var(--text-weak));
  font-size: 21px;
}

.empty-list {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  color: var(--hint-color, var(--text-weak));
  font-size: 12px;
}

.detail-backdrop {
  position: fixed;
  z-index: 3000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 15, 25, 0.52);
}

.detail-panel {
  width: min(560px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 20px;
  border: 1px solid var(--card-border, var(--border));
  border-radius: 12px;
  background: var(--card-color, var(--background, #fff));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
}

.detail-header {
  justify-content: space-between;
  gap: 16px;
}

.detail-header h2 {
  margin-top: 6px;
  font-size: 20px;
}

.detail-state.online {
  color: var(--success-color, var(--success, #20b26b));
}

.close-button {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-color, #334155) 7%, transparent);
  color: var(--text-color, var(--text));
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.detail-traffic {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 18px 0;
}

.detail-traffic div {
  padding: 13px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text-color, #334155) 5%, transparent);
}

.detail-traffic span,
.detail-traffic strong {
  display: block;
}

.detail-traffic span {
  color: var(--hint-color, var(--text-weak));
  font-size: 11px;
}

.detail-traffic strong {
  margin-top: 4px;
  font-size: 18px;
}

.fact-list {
  border-top: 1px solid var(--table-border, var(--border));
}

.fact-row {
  min-height: 42px;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--table-border, var(--border));
  font-size: 12px;
}

.fact-row strong {
  font-weight: 500;
  text-align: right;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 780px) {
  .client-columns {
    display: none;
  }

  .client-row {
    grid-template-columns: 32px minmax(0, 1fr) 110px 14px;
  }

  .client-access,
  .iface-badge {
    display: none;
  }
}

@media (max-width: 620px) {
  .summary-grid,
  .radio-list {
    grid-template-columns: 1fr;
  }

  .clients-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .search-box {
    width: 100%;
  }

  .client-row {
    grid-template-columns: 32px minmax(0, 1fr) 14px;
  }

  .client-traffic {
    display: none;
  }

  .detail-backdrop {
    align-items: flex-end;
    padding: 12px;
  }
}
</style>
