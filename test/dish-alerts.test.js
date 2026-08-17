'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { firingAlerts } = require('../src/dish-alerts');

test('orders terminal alerts by severity and keeps unknown flags visible', function() {
  const alerts = firingAlerts({
    isHeating: true,
    thermalThrottle: true,
    dishWaterDetected: true,
    futureFirmwareAlert: true,
    ignoredFalseFlag: false,
  });

  assert.deepEqual(alerts.map(function(alert) { return alert.key; }), [
    'dishWaterDetected',
    'thermalThrottle',
    'futureFirmwareAlert',
    'isHeating',
  ]);
  assert.equal(alerts[2].message, 'Future Firmware Alert');
});
