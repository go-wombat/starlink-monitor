'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  DEFAULT_DISH_ADDRESS,
  DISH_PORT,
  isValidDishAddress,
} = require('../src/endpoint-config');

const projectRoot = path.join(__dirname, '..');

test('validates canonical unicast IPv4 dish addresses', function() {
  assert.equal(DEFAULT_DISH_ADDRESS, '192.168.100.1');
  assert.equal(DISH_PORT, 9201);
  ['192.168.100.1', '10.0.0.42', '100.64.0.1', '223.255.255.254'].forEach(function(address) {
    assert.equal(isValidDishAddress(address), true, address);
  });
  [
    '', 'dish.local', 'http://192.168.100.1', '192.168.100.1:9201',
    '192.168.001.1', '256.1.1.1', '0.0.0.0', '127.0.0.1',
    '224.0.0.1', '255.255.255.255', '1.2.3', '1.2.3.4.5',
  ].forEach(function(address) {
    assert.equal(isValidDishAddress(address), false, address);
  });
});

test('authenticated RPC module stores only the address and fixes the Starlink target', function() {
  const rpc = fs.readFileSync(
    path.join(projectRoot, 'overlay', 'usr', 'lib', 'oui-httpd', 'rpc', 'starlink-monitor'),
    'utf8'
  );

  assert.match(rpc, /@method-name: get_config/);
  assert.match(rpc, /@method-name: set_config/);
  assert.match(rpc, /@method-name: test_config/);
  assert.match(rpc, /cursor:set\("starlink-monitor", "main", "address", address\)/);
  assert.match(rpc, /DISH_PORT = 9201/);
  assert.match(rpc, /SpaceX\.API\.Device\.Device\/Handle/);
  assert.doesNotMatch(rpc, /params\.(?:url|port|path|request)/);
});
