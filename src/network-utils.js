'use strict';

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeClients(response) {
  if (!response || !Array.isArray(response.clients)) return [];
  return response.clients.filter(function(client) {
    return client && typeof client === 'object';
  });
}

function displayName(client) {
  return String(client.alias || client.name || '').trim() || 'Unknown device';
}

function clientKey(client, index) {
  const identity = client.mac || client.ip || displayName(client);
  return `${identity}-${client.iface || ''}-${index || 0}`;
}

function formatBytes(value) {
  let amount = Math.max(0, finite(value, 0));
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  while (amount >= 1000 && index < units.length - 1) {
    amount /= 1000;
    index += 1;
  }
  const digits = amount >= 100 || index === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits)} ${units[index]}`;
}

function formatDuration(seconds) {
  const value = Math.max(0, finite(seconds, 0));
  if (!value) return '--';
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function interfaceLabel(value) {
  const label = String(value || '').trim();
  return label || 'Unknown link';
}

function totalTraffic(clients, field) {
  return (Array.isArray(clients) ? clients : []).reduce(function(total, client) {
    return total + Math.max(0, finite(client && client[field], 0));
  }, 0);
}

function sortClients(clients) {
  return (Array.isArray(clients) ? clients : []).slice().sort(function(a, b) {
    const onlineDelta = Number(Boolean(b.online)) - Number(Boolean(a.online));
    if (onlineDelta) return onlineDelta;
    const trafficA = finite(a.total_rx, 0) + finite(a.total_tx, 0);
    const trafficB = finite(b.total_rx, 0) + finite(b.total_tx, 0);
    if (trafficA !== trafficB) return trafficB - trafficA;
    return displayName(a).localeCompare(displayName(b));
  });
}

module.exports = {
  clientKey,
  displayName,
  formatBytes,
  formatDuration,
  interfaceLabel,
  normalizeClients,
  sortClients,
  totalTraffic,
};
