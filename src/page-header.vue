<template>
  <header class="starlink-page-header">
    <gl-title :title="title" />

    <div class="page-toolbar">
      <div class="connection-summary" aria-live="polite">
        <span class="status-dot" :class="`is-${tone}`" aria-hidden="true" />
        <div class="status-copy">
          <div class="connection-title">{{ status }}</div>
          <div class="connection-subtitle">{{ subtitle }}</div>
        </div>
      </div>

      <slot name="action">
        <gl-button
          v-if="showAction"
          type="default"
          :loading="loading"
          @click="$emit('refresh')"
        >
          {{ actionLabel }}
        </gl-button>
      </slot>
    </div>

    <gl-tips
      v-if="error"
      class="page-alert"
      role="alert"
      state="warning"
      :tips="error"
    />
  </header>
</template>

<script>
export default {
  name: 'StarlinkPageHeader',
  props: {
    title: { type: String, required: true },
    status: { type: String, required: true },
    subtitle: { type: String, required: true },
    tone: {
      type: String,
      default: 'pending',
      validator(value) {
        return ['online', 'warning', 'offline', 'pending'].includes(value);
      },
    },
    error: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    showAction: { type: Boolean, default: true },
    actionLabel: { type: String, default: 'Refresh' },
  },
};
</script>

<style scoped>
.starlink-page-header {
  min-width: 0;
}

.page-toolbar,
.connection-summary {
  display: flex;
  align-items: center;
}

.page-toolbar {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.connection-summary {
  min-width: 0;
  gap: 10px;
}

.status-copy {
  min-width: 0;
}

.status-dot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--hint-color, #8491a3);
  box-shadow: 0 0 0 4px rgba(132, 145, 163, 0.12);
}

.status-dot.is-online {
  background: var(--success-color, var(--success, #20b26b));
  box-shadow: 0 0 0 4px rgba(32, 178, 107, 0.12);
}

.status-dot.is-warning {
  background: var(--warning-color, var(--warning, #e8a23a));
  box-shadow: 0 0 0 4px rgba(232, 162, 58, 0.12);
}

.status-dot.is-offline {
  background: var(--error-color, var(--error, #e35d6a));
  box-shadow: 0 0 0 4px rgba(227, 93, 106, 0.12);
}

.connection-title {
  overflow: hidden;
  color: var(--title-color, var(--text));
  font-size: 15px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-subtitle {
  overflow: hidden;
  margin-top: 2px;
  color: var(--hint-color, var(--text-weak, #8491a3));
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-alert {
  margin: -2px 0 16px;
}

@media (max-width: 640px) {
  .page-toolbar {
    align-items: flex-start;
  }

  .connection-subtitle {
    white-space: normal;
  }
}
</style>
