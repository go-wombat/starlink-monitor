'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  angularSeparationDeg,
  computeAlignment,
  resolveDishModel,
  wrapDegrees,
} = require('../src/alignment');

test('resolves common Starlink hardware families', function() {
  assert.equal(resolveDishModel('mini1_prod2', false), 'mini1');
  assert.equal(resolveDishModel('rev4_prod1', false), 'rev4Standard');
  assert.equal(resolveDishModel('rev4_hp_prod1', false), 'performanceGen3');
});

test('computes aligned pointing from converged attitude data', function() {
  const result = computeAlignment({
    deviceInfo: { hardwareVersion: 'mini1_prod2' },
    boresightAzimuthDeg: 179,
    boresightElevationDeg: 70,
    alignmentStats: {
      attitudeEstimationState: 'FILTER_CONVERGED',
      desiredBoresightAzimuthDeg: -179,
      desiredBoresightElevationDeg: 70,
      tiltAngleDeg: 19.5,
    },
  });

  assert.equal(result.model.displayName, 'Mini');
  assert.equal(result.isValid, true);
  assert.equal(result.isAligned, true);
  assert.equal(result.azimuthErrorDeg, -2);
  assert.ok(result.boresightErrorDeg < 1);
});

test('wraps angles and calculates spherical separation', function() {
  assert.equal(wrapDegrees(181), -179);
  assert.equal(wrapDegrees(-181), 179);
  assert.equal(angularSeparationDeg(0, 45, 0, 45), 0);
  assert.ok(angularSeparationDeg(0, 45, 90, 45) > 59);
});
