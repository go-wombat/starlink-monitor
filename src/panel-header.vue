<template>
  <div
    class="panel-header"
    :class="{ 'is-compact': compact, 'has-two-line-subtitle': subtitleLines === 2 }"
  >
    <h3>{{ title }}</h3>
    <div v-if="hasBadge" class="panel-badge-slot">
      <starlink-status-badge
        :text="badge"
        :tone="badgeTone"
      />
    </div>
    <p>{{ subtitle }}</p>
  </div>
</template>

<script>
const StarlinkStatusBadge = require('./status-badge.vue').default;

export default {
  name: 'StarlinkPanelHeader',
  components: { StarlinkStatusBadge },
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, required: true },
    badge: { type: [String, Number], default: '' },
    badgeTone: {
      type: String,
      default: 'neutral',
      validator(value) {
        return ['neutral', 'info', 'success', 'warning', 'danger'].includes(value);
      },
    },
    compact: { type: Boolean, default: false },
    subtitleLines: {
      type: Number,
      default: 1,
      validator(value) {
        return [1, 2].includes(value);
      },
    },
  },
  computed: {
    hasBadge() {
      return this.badge !== '' && this.badge !== null && this.badge !== undefined;
    },
  },
};
</script>

<style scoped>
.panel-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 42px;
  align-items: flex-start;
  gap: 4px 12px;
  margin-bottom: 14px;
}

.panel-header.is-compact {
  margin-bottom: 10px;
}

.panel-header.has-two-line-subtitle p {
  min-height: 2.9em;
}

.panel-badge-slot {
  grid-column: 2;
  grid-row: 1;
}

.panel-header h3 {
  display: flex;
  grid-column: 1;
  grid-row: 1;
  min-height: 24px;
  align-items: center;
  margin: 0;
  color: var(--title-color, var(--text));
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
}

.panel-header p {
  grid-column: 1 / -1;
  grid-row: 2;
  margin: 0;
  color: var(--hint-color, var(--text-weak, #8491a3));
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 540px) {
  .panel-header {
    min-height: 0;
  }

  .panel-header p {
    max-width: 42ch;
  }
}
</style>
