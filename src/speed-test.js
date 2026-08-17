'use strict';

// User-triggered browser measurement. Traffic goes directly to Cloudflare so
// the router only serves this UI and never proxies or buffers the test payload.
const SPEED_ENDPOINT = 'https://speed.cloudflare.com';
const STREAMS = 4;
const DOWNLOAD_CHUNK_BYTES = 25000000;
const UPLOAD_CHUNK_BYTES = 8000000;
const SAMPLE_INTERVAL_MS = 250;
const RAMP_MS = 1000;
const MEASURE_MS = 8000;
const PHASE_MS = RAMP_MS + MEASURE_MS;
const HOLD_RESULT_MS = 700;
const REST_MS = 900;

function abortedError(signal) {
  if (signal && signal.reason) return signal.reason;
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function delay(milliseconds, signal) {
  return new Promise(function(resolve, reject) {
    if (signal && signal.aborted) return reject(abortedError(signal));
    const timer = window.setTimeout(resolve, milliseconds);
    if (signal) signal.addEventListener('abort', function() {
      window.clearTimeout(timer);
      reject(abortedError(signal));
    }, { once: true });
  });
}

function startPhase(getBytes, onMbps, signal) {
  const startedAt = performance.now();
  let rampBytes = null;
  let rampAt = 0;
  function rateSinceRamp(now) {
    const markBytes = rampBytes === null ? 0 : rampBytes;
    const markAt = rampBytes === null ? startedAt : rampAt;
    const seconds = (now - markAt) / 1000;
    return seconds > 0 ? ((getBytes() - markBytes) * 8) / seconds / 1e6 : 0;
  }
  const timer = window.setInterval(function() {
    const now = performance.now();
    if (rampBytes === null) {
      if (now - startedAt >= RAMP_MS) {
        rampBytes = getBytes();
        rampAt = now;
      }
      return;
    }
    if (now - rampAt >= 700) onMbps(rateSinceRamp(now));
  }, SAMPLE_INTERVAL_MS);
  return {
    shouldStop() {
      return Boolean(signal && signal.aborted) || performance.now() - startedAt >= PHASE_MS;
    },
    finish() {
      window.clearInterval(timer);
      return rateSinceRamp(performance.now());
    },
  };
}

async function measureDownload(onMbps, signal) {
  const controller = new AbortController();
  if (signal) signal.addEventListener('abort', function() { controller.abort(); }, { once: true });
  let receivedBytes = 0;
  const phase = startPhase(function() { return receivedBytes; }, onMbps, signal);
  const stopWatcher = window.setInterval(function() {
    if (phase.shouldStop()) controller.abort();
  }, 100);
  async function runStream() {
    try {
      while (!phase.shouldStop()) {
        const response = await fetch(
          `${SPEED_ENDPOINT}/__down?bytes=${DOWNLOAD_CHUNK_BYTES}&r=${Math.random()}`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok || !response.body) throw new Error('Download endpoint failed.');
        const reader = response.body.getReader();
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          receivedBytes += chunk.value.length;
        }
      }
    } catch (error) {
      // Phase completion aborts every stream; delivered bytes remain valid.
    }
  }
  await Promise.allSettled(Array.from({ length: STREAMS }, runStream));
  window.clearInterval(stopWatcher);
  const mbps = phase.finish();
  if (!receivedBytes) throw new Error('Download measurement failed.');
  return mbps;
}

async function measureUpload(onMbps, signal) {
  const sent = new Array(STREAMS).fill(0);
  const inFlightBytes = new Array(STREAMS).fill(0);
  const totalBytes = function() {
    return sent.reduce(function(sum, value) { return sum + value; }, 0) +
      inFlightBytes.reduce(function(sum, value) { return sum + value; }, 0);
  };
  const phase = startPhase(totalBytes, onMbps, signal);
  const requests = new Set();
  const stopWatcher = window.setInterval(function() {
    if (phase.shouldStop()) requests.forEach(function(xhr) { xhr.abort(); });
  }, 100);
  if (signal) signal.addEventListener('abort', function() {
    requests.forEach(function(xhr) { xhr.abort(); });
  }, { once: true });
  const payload = new Uint8Array(UPLOAD_CHUNK_BYTES);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(payload.subarray(0, 65536));
  }

  function sendChunk(streamIndex) {
    return new Promise(function(resolve) {
      const xhr = new XMLHttpRequest();
      requests.add(xhr);
      xhr.open('POST', `${SPEED_ENDPOINT}/__up`);
      xhr.timeout = PHASE_MS + 5000;
      xhr.upload.addEventListener('progress', function(event) {
        inFlightBytes[streamIndex] = event.loaded;
      });
      xhr.addEventListener('loadend', function() {
        requests.delete(xhr);
        sent[streamIndex] += inFlightBytes[streamIndex];
        inFlightBytes[streamIndex] = 0;
        resolve();
      });
      xhr.send(payload);
    });
  }
  async function uploadStream(streamIndex) {
    while (!phase.shouldStop()) await sendChunk(streamIndex);
  }
  await Promise.all(Array.from({ length: STREAMS }, function(_, index) {
    return uploadStream(index);
  }));
  window.clearInterval(stopWatcher);
  const mbps = phase.finish();
  if (!totalBytes()) throw new Error('Upload measurement failed.');
  return mbps;
}

async function runSpeedTest(onProgress, signal) {
  const progress = {
    phase: 'download',
    downloadMbps: null,
    uploadMbps: null,
    startedAtMs: Date.now(),
    endedAtMs: null,
  };
  function report() {
    if (!signal || !signal.aborted) onProgress({ ...progress });
  }
  report();
  try {
    progress.downloadMbps = await measureDownload(function(value) {
      progress.downloadMbps = value;
      report();
    }, signal);
    report();
    await delay(HOLD_RESULT_MS, signal);
    progress.phase = 'upload';
    progress.uploadMbps = null;
    report();
    await delay(REST_MS, signal);
    progress.uploadMbps = await measureUpload(function(value) {
      progress.uploadMbps = value;
      report();
    }, signal);
    progress.endedAtMs = Date.now();
    report();
    await delay(HOLD_RESULT_MS, signal);
    progress.phase = 'done';
    report();
  } catch (error) {
    if (signal && signal.aborted) return;
    progress.phase = 'error';
    report();
  }
}

module.exports = {
  PHASE_MS,
  SPEED_ENDPOINT,
  STREAMS,
  runSpeedTest,
};
