'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { statusText, statusTone } = require('../src/view-utils');

test('describes dish connection states with an explicit subject and semantic tone', function() {
  assert.equal(statusText(null, ''), 'Connecting to dish');
  assert.equal(statusTone(null, ''), 'pending');
  assert.equal(statusText(null, 'timeout'), 'Dish unavailable');
  assert.equal(statusTone(null, 'timeout'), 'offline');
  assert.equal(statusText({ popPingLatencyMs: 31 }, ''), 'Dish online');
  assert.equal(statusTone({ popPingLatencyMs: 31 }, ''), 'online');
  assert.equal(statusText({ stowRequested: true }, ''), 'Dish stowed');
  assert.equal(statusTone({ stowRequested: true }, ''), 'warning');
  assert.equal(
    statusText({ disablementCode: 'DISH_DISABLED_COUNTRY' }, ''),
    'Dish disabled · Disabled Country'
  );
});
