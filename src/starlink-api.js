'use strict';

const {
  createFileRegistry,
  fromBinary,
  toJson,
} = require('@bufbuild/protobuf');
const { FileDescriptorSetSchema } = require('@bufbuild/protobuf/wkt');
const { createAdminSessionHeaders } = require('@gl-sdk4-plugin-kit/admin-session');
const { parseGrpcWebResponse } = require('./grpc-web');
const protosetModule = require('./dish.protoset');

const protosetDataUrl = typeof protosetModule === 'string'
  ? protosetModule
  : protosetModule.default;

let decoder = null;

function decodeInlineAsset(dataUrl) {
  const separator = dataUrl.indexOf(',');
  if (separator === -1 || !dataUrl.slice(0, separator).includes(';base64')) {
    throw new Error('Bundled Starlink descriptor is invalid.');
  }
  const binary = atob(dataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getDecoder() {
  if (decoder) return decoder;
  const descriptorBytes = decodeInlineAsset(protosetDataUrl);
  const descriptorSet = fromBinary(FileDescriptorSetSchema, descriptorBytes);
  const registry = createFileRegistry(descriptorSet);
  const responseSchema = registry.getMessage('SpaceX.API.Device.Response');
  if (!responseSchema) throw new Error('Starlink response schema is unavailable.');
  decoder = { registry, responseSchema };
  return decoder;
}

async function request(action, signal) {
  const response = await fetch(`/cgi-bin/gl-starlink-monitor?action=${action}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: createAdminSessionHeaders(window, {
      Accept: 'application/grpc-web+proto',
    }),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body && body.error ? `: ${body.error}` : '';
    } catch (error) {
      detail = '';
    }
    throw new Error(`Starlink proxy returned HTTP ${response.status}${detail}.`);
  }

  const messageBytes = parseGrpcWebResponse(await response.arrayBuffer());
  const currentDecoder = getDecoder();
  const message = fromBinary(currentDecoder.responseSchema, messageBytes);
  return toJson(currentDecoder.responseSchema, message, {
    registry: currentDecoder.registry,
  });
}

async function getStatus(signal) {
  const response = await request('status', signal);
  return response.dishGetStatus || {};
}

async function getHistory(signal) {
  const response = await request('history', signal);
  return response.dishGetHistory || {};
}

async function getObstructionMap(signal) {
  const response = await request('obstruction', signal);
  return response.dishGetObstructionMap || {};
}

module.exports = { getHistory, getObstructionMap, getStatus };
