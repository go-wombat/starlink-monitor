'use strict';

const { humanizeToken } = require('./view-utils');

const DISH_ALERTS = [
  ['dishWaterDetected', 'Water detected inside the dish', 'critical'],
  ['routerWaterDetected', 'Water detected inside the router', 'critical'],
  ['thermalShutdown', 'Dish shut itself down to cool off', 'critical'],
  ['noEthernetLink', 'No Ethernet link to the router', 'critical'],
  ['motorsStuck', 'Dish motors are stuck', 'critical'],
  ['thermalThrottle', 'Dish is limiting speed to cool down', 'warning'],
  ['powerSupplyThermalThrottle', 'Power supply is limiting power to cool down', 'warning'],
  ['slowEthernetSpeeds', 'Ethernet link to the router is slow', 'warning'],
  ['slowEthernetSpeeds100', 'Ethernet link is capped at 100 Mbps', 'warning', 'Check the Starlink cable and both connectors.'],
  ['upsuRouterPortSlow', 'Power supply router port is running slowly', 'warning'],
  ['mastNotNearVertical', 'Mast is not near vertical', 'warning'],
  ['lowMotorCurrent', 'Dish motor current is low', 'warning'],
  ['lowerSignalThanPredicted', 'Weather is affecting the signal', 'warning', 'Check the sky map if the weather is clear.'],
  ['dbfTelemStale', 'Dish telemetry is stale', 'warning'],
  ['unexpectedLocation', 'Dish is away from its registered service location', 'warning'],
  ['obstructionMapReset', 'Obstruction map was reset and is rebuilding', 'advisory'],
  ['roaming', 'Dish is roaming', 'advisory'],
  ['isHeating', 'Dish is heating to melt snow or ice', 'advisory'],
  ['isPowerSaveIdle', 'Dish is sleeping to save power', 'advisory'],
  ['installPending', 'Installation is still pending', 'advisory'],
].map(function(entry) {
  return { key: entry[0], message: entry[1], severity: entry[2], advice: entry[3] || '' };
});

function firingAlerts(alerts) {
  const source = alerts || {};
  const known = new Set(DISH_ALERTS.map(function(spec) { return spec.key; }));
  const result = DISH_ALERTS.filter(function(spec) { return source[spec.key] === true; });
  Object.keys(source).forEach(function(key) {
    if (source[key] === true && !known.has(key)) {
      result.push({ key, message: humanizeToken(key), severity: 'warning', advice: '' });
    }
  });
  const order = { critical: 0, warning: 1, advisory: 2 };
  return result.sort(function(a, b) { return order[a.severity] - order[b.severity]; });
}

module.exports = { DISH_ALERTS, firingAlerts };
