'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  createFileRegistry,
  fromBinary,
  fromJson,
  toBinary,
  toJson,
} = require('@bufbuild/protobuf');
const { FileDescriptorSetSchema } = require('@bufbuild/protobuf/wkt');
const { parseGrpcWebResponse } = require('../src/grpc-web');

function grpcWebFrame(message) {
  const frame = Buffer.alloc(5 + message.length);
  frame[0] = 0;
  frame.writeUInt32BE(message.length, 1);
  Buffer.from(message).copy(frame, 5);
  return frame;
}

test('bundled descriptor decodes a Starlink status response', function() {
  const descriptorBytes = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'dish.protoset')
  );
  const descriptorSet = fromBinary(FileDescriptorSetSchema, descriptorBytes);
  const registry = createFileRegistry(descriptorSet);
  const responseSchema = registry.getMessage('SpaceX.API.Device.Response');

  assert.ok(responseSchema);

  const encodedResponse = toBinary(responseSchema, fromJson(responseSchema, {
    dishGetStatus: {
      deviceInfo: {
        hardwareVersion: 'mini1_prod2',
        softwareVersion: 'test-firmware',
        countryCode: 'FR',
      },
      downlinkThroughputBps: 12345678,
      uplinkThroughputBps: 2345678,
      popPingLatencyMs: 27,
    },
  }, { registry }));

  const decodedMessage = fromBinary(
    responseSchema,
    parseGrpcWebResponse(grpcWebFrame(encodedResponse))
  );
  const decodedJson = toJson(responseSchema, decodedMessage, { registry });

  assert.equal(decodedJson.dishGetStatus.deviceInfo.hardwareVersion, 'mini1_prod2');
  assert.equal(decodedJson.dishGetStatus.deviceInfo.countryCode, 'FR');
  assert.equal(decodedJson.dishGetStatus.popPingLatencyMs, 27);
});
