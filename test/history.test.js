'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeEvents,
  decodeHistoryWindow,
  downsample,
  pingSuccess,
} = require('../src/history');

test('unrolls the dish ring buffer in chronological order', function() {
  const samples = decodeHistoryWindow({
    current: '5',
    popPingLatencyMs: [30, 40, 10, 20],
    popPingDropRate: [0, 1, 0, 0.5],
    downlinkThroughputBps: [300, 400, 100, 200],
    uplinkThroughputBps: [30, 40, 10, 20],
    powerIn: [60, 70, 40, 50],
  }, 10000);

  assert.deepEqual(samples.map(function(sample) { return sample.latencyMs; }), [40, 10, 20, 30]);
  assert.deepEqual(samples.map(function(sample) { return sample.timestampMs; }), [7000, 8000, 9000, 10000]);
});

test('downsamples throughput by average and preserves latency spikes', function() {
  const samples = [
    { timestampMs: 1, latencyMs: 10, dropRate: 0, downlinkBps: 10, uplinkBps: 2, powerW: 40 },
    { timestampMs: 2, latencyMs: 90, dropRate: 0.5, downlinkBps: 30, uplinkBps: 4, powerW: 60 },
    { timestampMs: 3, latencyMs: 20, dropRate: 0, downlinkBps: 50, uplinkBps: 6, powerW: 80 },
    { timestampMs: 4, latencyMs: 30, dropRate: 0, downlinkBps: 70, uplinkBps: 8, powerW: 100 },
  ];
  const result = downsample(samples, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].latencyMs, 90);
  assert.equal(result[0].downlinkBps, 20);
  assert.equal(result[1].powerW, 90);
});

test('computes ping success over the requested tail', function() {
  assert.equal(pingSuccess([{ dropRate: 0 }, { dropRate: 0.5 }], 2), 75);
});

test('decodes event log labels and severity', function() {
  const events = decodeEvents({
    eventLog: {
      events: [{
        reason: 'EVENT_REASON_OUTAGE_OBSTRUCTED',
        severity: 'EVENT_SEVERITY_WARNING',
        startTimestampNs: '1000000000',
        durationNs: '2000000000',
      }],
    },
  });
  assert.equal(events[0].label, 'Dish view obstructed');
  assert.equal(events[0].severity, 'warning');
  assert.equal(events[0].startMs, 1000);
  assert.equal(events[0].durationMs, 2000);
});
