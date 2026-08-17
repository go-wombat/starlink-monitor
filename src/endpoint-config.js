'use strict';

const DEFAULT_DISH_ADDRESS = '192.168.100.1';
const DISH_PORT = 9201;

function isValidDishAddress(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(value)) return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map(function(part) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    return octet <= 255 ? octet : null;
  });
  if (octets.some(function(octet) { return octet === null; })) return false;
  if (octets[0] === 0 || octets[0] === 127 || octets[0] >= 224) return false;
  return !octets.every(function(octet) { return octet === 255; });
}

module.exports = { DEFAULT_DISH_ADDRESS, DISH_PORT, isValidDishAddress };
