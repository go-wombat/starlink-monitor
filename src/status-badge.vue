<template>
  <span class="status-badge" :class="`is-${tone}`">
    {{ text }}
  </span>
</template>

<script>
const TONES = ['neutral', 'info', 'success', 'warning', 'danger'];

export default {
  name: 'StarlinkStatusBadge',
  props: {
    text: { type: [String, Number], required: true },
    tone: {
      type: String,
      default: 'neutral',
      validator(value) {
        return TONES.includes(value);
      },
    },
  },
};
</script>

<style scoped>
.status-badge {
  display: inline-flex;
  min-height: 24px;
  box-sizing: border-box;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border: 1px solid var(--card-border, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--hint-color, #8491a3) 9%, transparent);
  color: var(--text-color, var(--text));
  font-size: 11px;
  font-weight: 650;
  line-height: 1.25;
  white-space: nowrap;
}

.status-badge::before {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--hint-color, #8491a3);
  content: '';
}

.status-badge.is-info {
  background: color-mix(in srgb, var(--primary-color, #1785ff) 10%, transparent);
}

.status-badge.is-info::before {
  background: var(--primary-color, #1785ff);
}

.status-badge.is-success {
  background: color-mix(in srgb, var(--success-color, #20b26b) 10%, transparent);
}

.status-badge.is-success::before {
  background: var(--success-color, #20b26b);
}

.status-badge.is-warning {
  background: color-mix(in srgb, var(--warning-color, #e8a23a) 11%, transparent);
}

.status-badge.is-warning::before {
  background: var(--warning-color, #e8a23a);
}

.status-badge.is-danger {
  background: color-mix(in srgb, var(--error-color, #e35d6a) 10%, transparent);
}

.status-badge.is-danger::before {
  background: var(--error-color, #e35d6a);
}
</style>
