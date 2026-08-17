'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BIN_COUNT, binLatencies } = require('../src/latency-histogram');

test('bins latency in 2 ms steps with a 100+ overflow bar', function() {
  const bins = binLatencies([0, 1.9, 2, 99.9, 100, 240]);
  assert.equal(bins.length, BIN_COUNT);
  assert.ok(Math.abs(bins[0] - 100 / 3) < 0.000001);
  assert.ok(Math.abs(bins[1] - 100 / 6) < 0.000001);
  assert.ok(Math.abs(bins[49] - 100 / 6) < 0.000001);
  assert.ok(Math.abs(bins[50] - 100 / 3) < 0.000001);
});

test('ignores invalid and negative samples', function() {
  const bins = binLatencies([null, undefined, -1, 'bad']);
  assert.equal(bins.every(function(value) { return value === 0; }), true);
});
