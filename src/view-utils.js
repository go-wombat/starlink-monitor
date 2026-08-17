'use strict';

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function humanizeToken(value) {
  return String(value || '')
    .replace(/^(DISH_|ALERT_|DISABLEMENT_|FILTER_|NAT_|SOFTWARE_UPDATE_)/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, function(letter) { return letter.toUpperCase(); });
}

function formatNumber(value, digits) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatUptime(seconds) {
  const value = Math.max(0, finite(seconds, 0));
  if (!value) return '--';
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '--';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function statusText(status, error) {
  if (!status) return error ? 'Dish unavailable' : 'Connecting to dish';
  if (status.stowRequested) return 'Dish stowed';
  if (status.disablementCode && status.disablementCode !== 'OKAY') {
    return `Dish disabled · ${humanizeToken(status.disablementCode)}`;
  }
  const readiness = Object.values(status.readyStates || {});
  if (readiness.length && readiness.some(function(value) { return value === false; })) {
    return 'Dish connecting';
  }
  return finite(status.popPingLatencyMs, 0) > 0 ? 'Dish online' : 'Dish connected';
}

function statusTone(status, error) {
  if (!status) return error ? 'offline' : 'pending';
  if (status.stowRequested) return 'warning';
  if (status.disablementCode && status.disablementCode !== 'OKAY') return 'warning';
  const readiness = Object.values(status.readyStates || {});
  return readiness.length && readiness.some(function(value) { return value === false; })
    ? 'warning'
    : 'online';
}

function serviceClass(value) {
  const labels = {
    CONSUMER: 'Residential',
    BUSINESS: 'Business',
    BUSINESS_PLUS: 'Business Plus',
  };
  return labels[value] || humanizeToken(value || 'unknown');
}

function bandwidthReason(value) {
  if (!value || value === 'NO_LIMIT' || value === 'NO_RESTRICTION') return 'None';
  return humanizeToken(value);
}

module.exports = {
  bandwidthReason,
  finite,
  formatNumber,
  formatRelativeTime,
  formatUptime,
  humanizeToken,
  serviceClass,
  statusText,
  statusTone,
};
