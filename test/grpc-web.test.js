'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGrpcWebResponse } = require('../src/grpc-web');

function frame(flag, payload) {
  const bytes = Buffer.from(payload);
  const header = Buffer.alloc(5);
  header[0] = flag;
  header.writeUInt32BE(bytes.length, 1);
  return Buffer.concat([header, bytes]);
}

test('returns the protobuf message from a successful response', function() {
  const response = Buffer.concat([
    frame(0x00, [1, 2, 3]),
    frame(0x80, Buffer.from('grpc-status: 0\r\n')),
  ]);
  assert.deepEqual(Array.from(parseGrpcWebResponse(response)), [1, 2, 3]);
});

test('rejects a non-zero gRPC trailer', function() {
  const response = Buffer.concat([
    frame(0x00, [1]),
    frame(0x80, Buffer.from('grpc-status: 7\r\ngrpc-message: denied\r\n')),
  ]);
  assert.throws(
    function() { parseGrpcWebResponse(response); },
    /status 7: denied/
  );
});

test('rejects a truncated frame', function() {
  assert.throws(
    function() { parseGrpcWebResponse(Buffer.from([0, 0, 0, 0, 4, 1])); },
    /Truncated/
  );
});
