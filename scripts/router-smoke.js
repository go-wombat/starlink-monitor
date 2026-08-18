#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  createFileRegistry,
  fromBinary,
  toJson,
} = require('@bufbuild/protobuf');
const { FileDescriptorSetSchema } = require('@bufbuild/protobuf/wkt');
const auth = require('gl-sdk4-plugin-kit/lib/auth');
const { readRouterPassword } = require('gl-sdk4-plugin-kit/lib/prompt');
const { resolveTarget } = require('gl-sdk4-plugin-kit/lib/target-config');
const { parseGrpcWebResponse } = require('../src/grpc-web');

const projectRoot = path.join(__dirname, '..');
const cliPath = path.join(projectRoot, 'node_modules', '.bin', 'glplugin');

function parseArgs(values) {
  const parsed = {
    target: '',
    install: false,
    passwordStdin: false,
    allowUnverified: false,
  };
  values.forEach(function(value) {
    if (value === '--install') parsed.install = true;
    else if (value === '--password-stdin') parsed.passwordStdin = true;
    else if (value === '--allow-unverified') parsed.allowUnverified = true;
    else if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    else if (!parsed.target) parsed.target = value;
    else throw new Error('Usage: npm run router:smoke -- [target] [--install] [--password-stdin] [--allow-unverified]');
  });
  return parsed;
}

function runCli(args, options) {
  const settings = options || {};
  const result = spawnSync(cliPath, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    input: settings.input,
    stdio: settings.inherit
      ? 'inherit'
      : ['pipe', 'inherit', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`glplugin ${args[0]} failed with exit code ${result.status}`);
  }
}

function requestRouter(target, pathname, headers) {
  const rpcEndpoint = auth.normalizeRouterUrl(target.rpcHost, { https: target.https });
  const endpoint = new URL(pathname, rpcEndpoint.origin);
  const transport = endpoint.protocol === 'https:' ? https : http;
  return new Promise(function(resolve, reject) {
    const request = transport.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || undefined,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'GET',
      headers: headers || {},
      rejectUnauthorized: target.insecure !== true,
      timeout: 10000,
    }, function(response) {
      const chunks = [];
      response.on('data', function(chunk) { chunks.push(Buffer.from(chunk)); });
      response.on('end', function() {
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    request.on('error', reject);
    request.on('timeout', function() {
      request.destroy(new Error('Router request timed out after 10000 ms'));
    });
    request.end();
  });
}

function decodeStatus(body) {
  const descriptorBytes = fs.readFileSync(path.join(projectRoot, 'src', 'dish.protoset'));
  const descriptorSet = fromBinary(FileDescriptorSetSchema, descriptorBytes);
  const registry = createFileRegistry(descriptorSet);
  const responseSchema = registry.getMessage('SpaceX.API.Device.Response');
  assert.ok(responseSchema, 'Starlink response descriptor is missing');
  const messageBytes = parseGrpcWebResponse(body);
  const response = toJson(responseSchema, fromBinary(responseSchema, messageBytes), { registry });
  assert.ok(response.dishGetStatus, 'Dish status payload is missing');
  return response.dishGetStatus;
}

function logPass(name, detail) {
  process.stdout.write(`  [PASS] ${name}: ${detail}\n`);
}

async function smoke(values) {
  const parsed = parseArgs(values);
  const target = resolveTarget(parsed.target, { cwd: projectRoot, env: process.env });
  const password = await readRouterPassword({
    passwordStdin: parsed.passwordStdin,
    question: `Admin password for ${target.rpcHost}: `,
  });

  if (parsed.install) {
    const installArgs = ['install'];
    if (parsed.target) installArgs.push(parsed.target);
    if (parsed.allowUnverified) installArgs.push('--allow-unverified');
    runCli(installArgs, { inherit: true });
    logPass('package-install', 'SDK CLI installed the freshly built IPK');
  }

  const testArgs = ['test'];
  if (parsed.target) testArgs.push(parsed.target);
  testArgs.push('--password-stdin');
  if (parsed.allowUnverified) testArgs.push('--allow-unverified');
  runCli(testArgs, { input: `${password}\n` });
  logPass('sdk-router-test', 'firmware, menus, bundles, exports and required capabilities passed');

  const unauthenticated = await requestRouter(
    target,
    '/cgi-bin/gl-starlink-monitor?action=status'
  );
  assert.equal(unauthenticated.status, 401, 'CGI without a session must return 401');
  logPass('cgi-no-session', 'HTTP 401');

  const unknownSession = await requestRouter(
    target,
    '/cgi-bin/gl-starlink-monitor?action=status',
    { 'X-GL-Admin-Token': 'Z'.repeat(32) }
  );
  assert.equal(unknownSession.status, 401, 'CGI with an unknown session must return 401');
  logPass('cgi-unknown-session', 'HTTP 401');

  const session = await auth.login(target.rpcHost, password, target.username, {
    https: target.https,
    insecure: target.insecure,
    timeout: 10000,
  });
  try {
    const config = await auth.call(
      target.rpcHost,
      session.sid,
      'starlink-monitor',
      'get_config',
      {},
      { https: target.https, insecure: target.insecure, timeout: 10000 }
    );
    assert.match(config.address, /^(?:\d{1,3}\.){3}\d{1,3}$/);
    assert.equal(Number(config.port), 9201);
    logPass('plugin-rpc', `${config.address}:${config.port}`);

    const authenticated = await requestRouter(
      target,
      '/cgi-bin/gl-starlink-monitor?action=status',
      {
        Accept: 'application/grpc-web+proto',
        'X-GL-Admin-Token': session.sid,
      }
    );
    assert.equal(authenticated.status, 200, 'Authenticated Starlink status must return 200');
    assert.match(
      String(authenticated.headers['content-type'] || ''),
      /^application\/grpc-web\+proto/
    );
    const status = decodeStatus(authenticated.body);
    const hardware = status.deviceInfo && status.deviceInfo.hardwareVersion || 'Dish';
    const latency = Number(status.popPingLatencyMs);
    assert.ok(Number.isFinite(latency), 'Dish latency must be a finite number');
    logPass('live-starlink-status', `${hardware}, ${Math.round(latency)} ms PoP latency`);
  } finally {
    await auth.logout(target.rpcHost, session.sid, {
      https: target.https,
      insecure: target.insecure,
      timeout: 10000,
    });
  }

  process.stdout.write('Router smoke test passed.\n');
}

if (require.main === module) {
  smoke(process.argv.slice(2)).catch(function(error) {
    process.stderr.write(`Router smoke test failed: ${error.message}\n`);
    process.exitCode = error.exitCode || 1;
  });
}

module.exports = { decodeStatus, parseArgs, requestRouter, smoke };
