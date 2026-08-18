'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseArgs } = require('../scripts/router-smoke');

test('router smoke arguments keep installation explicit', function() {
  assert.deepEqual(parseArgs([]), {
    target: '',
    install: false,
    passwordStdin: false,
    allowUnverified: false,
  });
  assert.deepEqual(parseArgs(['lab', '--install', '--password-stdin']), {
    target: 'lab',
    install: true,
    passwordStdin: true,
    allowUnverified: false,
  });
  assert.throws(function() { parseArgs(['--unknown']); }, /Unknown option/);
});
