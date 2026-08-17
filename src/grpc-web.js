'use strict';

const MESSAGE_FRAME = 0x00;
const TRAILERS_FRAME = 0x80;

function parseTrailers(text) {
  let status = 0;
  let message = '';
  text.split('\r\n').forEach(function(line) {
    const separator = line.indexOf(':');
    if (separator === -1) return;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'grpc-status') status = Number(value);
    if (key === 'grpc-message') {
      try {
        message = decodeURIComponent(value);
      } catch (error) {
        message = value;
      }
    }
  });
  return { status, message };
}

function parseGrpcWebResponse(input) {
  const body = input instanceof Uint8Array ? input : new Uint8Array(input);
  let offset = 0;
  let responseMessage = null;

  while (offset + 5 <= body.length) {
    const flag = body[offset];
    const frameLength = new DataView(
      body.buffer,
      body.byteOffset + offset + 1,
      4
    ).getUint32(0, false);
    const payloadStart = offset + 5;
    const payloadEnd = payloadStart + frameLength;
    if (payloadEnd > body.length) throw new Error('Truncated gRPC-web frame.');

    const payload = body.subarray(payloadStart, payloadEnd);
    offset = payloadEnd;

    if (flag === MESSAGE_FRAME) {
      responseMessage = payload;
    } else if (flag & TRAILERS_FRAME) {
      const trailers = parseTrailers(new TextDecoder().decode(payload));
      if (trailers.status !== 0) {
        throw new Error(
          `Starlink returned gRPC status ${trailers.status}${trailers.message ? `: ${trailers.message}` : ''}.`
        );
      }
    }
  }

  if (offset !== body.length) throw new Error('Invalid trailing gRPC-web bytes.');
  if (!responseMessage) throw new Error('Starlink returned no protobuf message.');
  return responseMessage;
}

module.exports = { parseGrpcWebResponse, parseTrailers };
