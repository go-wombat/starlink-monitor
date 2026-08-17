'use strict';

const GPS_TO_UNIX_OFFSET_MS = (315964800 - 18) * 1000;

const EVENT_LABELS = {
  ACTUATOR_ACTIVITY: 'Dish repositioning',
  BOOTING: 'Starlink booting',
  CABLE_TEST: 'Cable test',
  ETH_NO_LINK: 'Ethernet link disconnected',
  HIGH_DOWNLINK_PACKET_LOSS: 'High downlink packet loss',
  INHIBIT_RF: 'Transmission paused',
  NO_DOWNLINK: 'No downlink signal',
  NO_PINGS: 'Network interruption',
  NO_SATS: 'No satellite in range',
  NO_SCHEDULE: 'No service scheduled',
  OBSTRUCTED: 'Dish view obstructed',
  RAIN_SNR_PERSISTENTLY_LOW: 'Weather interference',
  SEARCHING: 'Searching for satellites',
  SKY_SEARCH: 'Searching for satellites',
  SLEEPING: 'Scheduled sleep',
  STOWED: 'Dish stowed',
  THERMAL_SHUTDOWN: 'Thermal shutdown',
};

function numeric(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function decodeHistoryWindow(history, nowMs) {
  const newestCounter = numeric(history.current, 0);
  const latencies = Array.isArray(history.popPingLatencyMs)
    ? history.popPingLatencyMs
    : [];
  const length = latencies.length;
  if (!length || newestCounter <= 0) return [];

  const sampleCount = Math.min(newestCounter, length);
  const samples = [];
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const absoluteCounter = newestCounter - sampleCount + sampleIndex;
    const ringIndex = absoluteCounter % length;
    const latency = numeric(latencies[ringIndex], 0);
    samples.push({
      timestampMs: nowMs - (sampleCount - 1 - sampleIndex) * 1000,
      latencyMs: latency > 0 ? latency : null,
      dropRate: numeric((history.popPingDropRate || [])[ringIndex], 0),
      downlinkBps: numeric((history.downlinkThroughputBps || [])[ringIndex], 0),
      uplinkBps: numeric((history.uplinkThroughputBps || [])[ringIndex], 0),
      powerW: numeric((history.powerIn || [])[ringIndex], 0),
    });
  }
  return samples;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce(function(sum, value) { return sum + value; }, 0) / values.length;
}

function downsample(samples, maxPoints) {
  const limit = maxPoints || 180;
  if (samples.length <= limit) return samples.slice();
  const bucketSize = Math.ceil(samples.length / limit);
  const result = [];

  for (let start = 0; start < samples.length; start += bucketSize) {
    const bucket = samples.slice(start, start + bucketSize);
    const last = bucket[bucket.length - 1];
    const latencies = bucket
      .map(function(sample) { return sample.latencyMs; })
      .filter(function(value) { return value !== null; });
    result.push({
      timestampMs: last.timestampMs,
      latencyMs: latencies.length ? Math.max.apply(Math, latencies) : null,
      dropRate: average(bucket.map(function(sample) { return sample.dropRate; })),
      downlinkBps: average(bucket.map(function(sample) { return sample.downlinkBps; })),
      uplinkBps: average(bucket.map(function(sample) { return sample.uplinkBps; })),
      powerW: average(bucket.map(function(sample) { return sample.powerW; })),
    });
  }
  return result;
}

function nanosToMs(value) {
  return Math.round(numeric(value, 0) / 1000000);
}

function canonicalCause(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^EVENT_REASON_/, '')
    .replace(/^OUTAGE_/, '')
    .replace(/^UT_ALERT_/, '');
}

function eventLabel(cause) {
  const token = canonicalCause(cause);
  if (EVENT_LABELS[token]) return EVENT_LABELS[token];
  if (!token) return 'Unknown event';
  const words = token.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function eventIdentity(event) {
  const startMs = Math.round(numeric(event && event.startMs, 0));
  const cause = canonicalCause(event && event.cause) || 'UNKNOWN';
  return `${startMs}-${cause}`;
}

function decodeEvents(history) {
  const logEvents = history && history.eventLog && Array.isArray(history.eventLog.events)
    ? history.eventLog.events
    : [];
  if (logEvents.length) {
    return logEvents.map(function(event) {
      const decoded = {
        startMs: nanosToMs(event.startTimestampNs),
        durationMs: nanosToMs(event.durationNs),
        cause: event.reason || '',
        label: eventLabel(event.reason),
        severity: event.severity === 'EVENT_SEVERITY_CRITICAL'
          ? 'critical'
          : event.severity === 'EVENT_SEVERITY_WARNING'
            ? 'warning'
            : 'advisory',
      };
      decoded.id = eventIdentity(decoded);
      return decoded;
    });
  }

  const outages = history && Array.isArray(history.outages) ? history.outages : [];
  return outages.map(function(outage) {
    const gpsMs = nanosToMs(outage.startTimestampNs);
    const decoded = {
      startMs: gpsMs + GPS_TO_UNIX_OFFSET_MS,
      durationMs: nanosToMs(outage.durationNs),
      cause: outage.cause || '',
      label: eventLabel(outage.cause),
      severity: 'warning',
    };
    decoded.id = eventIdentity(decoded);
    return decoded;
  });
}

function pingSuccess(samples, count) {
  const window = samples.slice(-Math.max(1, count || 60));
  if (!window.length) return null;
  return Math.max(0, Math.min(100, (1 - average(
    window.map(function(sample) { return sample.dropRate; })
  )) * 100));
}

module.exports = {
  canonicalCause,
  decodeEvents,
  decodeHistoryWindow,
  downsample,
  eventIdentity,
  eventLabel,
  pingSuccess,
};
