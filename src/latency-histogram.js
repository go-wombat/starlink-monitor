'use strict';

const BIN_MS = 2;
const MAX_MS = 100;
const BIN_COUNT = MAX_MS / BIN_MS + 1;

function binLatencies(values) {
  const bins = new Array(BIN_COUNT).fill(0);
  const valid = (Array.isArray(values) ? values : []).filter(function(value) {
    return value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
  });
  if (!valid.length) return bins;

  valid.forEach(function(value) {
    const index = Math.min(Math.floor(Number(value) / BIN_MS), BIN_COUNT - 1);
    bins[index] += 1;
  });
  return bins.map(function(count) { return count / valid.length * 100; });
}

module.exports = {
  BIN_COUNT,
  BIN_MS,
  MAX_MS,
  binLatencies,
};
