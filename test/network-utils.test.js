'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  displayName,
  formatBytes,
  normalizeClients,
  sortClients,
  totalTraffic,
} = require('../src/network-utils');

test('normalizes and sorts clients without mutating the RPC result', function() {
  const response = { clients: [
    { name: 'Offline', online: false, total_rx: 5000, total_tx: 0 },
    { alias: 'Laptop', online: true, total_rx: 20, total_tx: 10 },
    { name: 'Phone', online: true, total_rx: 100, total_tx: 100 },
  ] };
  const clients = normalizeClients(response);
  const sorted = sortClients(clients);
  assert.deepEqual(sorted.map(displayName), ['Phone', 'Laptop', 'Offline']);
  assert.equal(response.clients[0].name, 'Offline');
});

test('formats and totals documented RX/TX counters', function() {
  assert.equal(formatBytes(1500000), '1.50 MB');
  assert.equal(totalTraffic([{ total_rx: 2 }, { total_rx: '3' }], 'total_rx'), 5);
});
