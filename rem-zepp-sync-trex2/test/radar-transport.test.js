import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { loadBridge } from '../../scripts/testing/message-harness.mjs';
import { MESSAGE_LIMITS } from '../shared/reassembly.js';
import { fixtureState } from '../common/radar/fixtures.js';
import { createState, receiveSnapshot } from '../common/radar/state.js';

const directory = 'rem-zepp-sync-trex2/shared';
function receiver(options) {
  const h = loadBridge(directory, options);
  h.ready();
  h.errors = [];
  h.received = [];
  h.bridge.on('error', (error) => h.errors.push(error.message));
  h.bridge.on('data', (data) => h.received.push(data));
  return h;
}

function fragments(h, bytes, { traceId = 1234, spanId = 98, type = 3 } = {}) {
  const result = [];
  for (let start = 0; start < bytes.length; start += h.bridge.chunkSize) {
    const chunk = bytes.subarray(start, start + h.bridge.chunkSize);
    result.push(h.bridge.buildPayload({
      traceId, spanId, type, totalLength: bytes.length,
      seqId: result.length + 1, opCode: start + chunk.length === bytes.length ? 1 : 0, payload: chunk,
    }));
  }
  return result;
}
const deliver = (h, frame) => h.deliver(h.bridge.isSide ? frame : h.bridge.buildData(frame));

test('page cancellation releases only its request timer, fragments and listeners', () => {
  const h = loadBridge(directory);
  h.ready();
  const request = h.bridge.request({ method: 'REM_RADAR_SNAPSHOT' }, { timeout: 8000 });
  const result = h.observe(request);
  h.clock.tick();
  const traceId = h.requests()[0].traceId;
  const bytes = Buffer.from(JSON.stringify({ padding: 'x'.repeat(2500) }));
  deliver(h, fragments(h, bytes, { traceId, type: 2 })[0]);
  assert.equal(h.bridge.sessionMgr.sessions.size, 1);
  request.cancel();
  h.clock.tick();
  assert.equal(result.state, 'rejected');
  assert.match(result.error.message, /Cancelled/);
  assert.equal(h.bridge.sessionMgr.sessions.size, 0);
  h.clean();
});

test('a 50-marker Unicode snapshot survives actual Side Service fragmentation and reversed/duplicate delivery atomically', () => {
  const side = receiver({ side: true });
  const watch = receiver();
  const wall = 1790000000000;
  const snapshot = fixtureState('maximum', 0, wall).snapshot;
  snapshot.markers[0].label = 'Équipe / 救援 / 😀';
  side.bridge.response({ requestId: 88, data: snapshot });
  assert.ok(side.packets.length > 1);
  assert.ok(side.packets.length <= MESSAGE_LIMITS.chunks);
  const wireBytes = side.packets.reduce((sum, packet) => sum + side.bridge.readPayload(packet).payloadLength, 0);
  assert.ok(wireBytes < MESSAGE_LIMITS.bytes);
  const frames = [...side.packets].reverse();
  for (const frame of frames.slice(0, -1)) {
    deliver(watch, frame); deliver(watch, frame);
    assert.equal(watch.received.length, 0, 'partial data must never reach the reducer');
  }
  deliver(watch, frames.at(-1));
  for (const frame of frames) deliver(watch, frame);
  assert.equal(watch.received.length, 1, 'completed replay is suppressed within the bounded replay window');
  const decoded = watch.bridge.buf2Json(watch.received[0].payload);
  const state = receiveSnapshot(createState(), decoded, 0, wall);
  assert.equal(state.snapshot.markers.length, 50);
  assert.equal(state.snapshot.markers[0].label, snapshot.markers[0].label);
  assert.equal(state.snapshot.markers[0].color, snapshot.markers[0].color);
  assert.equal(watch.bridge.sessionMgr.sessions.size, 0);
  assert.equal(watch.timers.size, 0);
  assert.deepEqual(watch.errors, []);
});

test('maximum 64 KiB messages complete and larger inbound/outbound messages are rejected without partial sends', () => {
  const h = receiver();
  const bytes = Buffer.alloc(MESSAGE_LIMITS.bytes, 120);
  for (const frame of fragments(h, bytes)) deliver(h, frame);
  assert.equal(h.received[0].payload.byteLength, MESSAGE_LIMITS.bytes);
  const invalid = h.bridge.buildPayload({ traceId: 92, spanId: 1, seqId: 1, type: 3, totalLength: MESSAGE_LIMITS.bytes + 1, opCode: 0, payload: Buffer.alloc(2000) });
  deliver(h, invalid);
  assert.equal(h.bridge.sessionMgr.sessions.size, 0);
  assert.match(h.errors.at(-1), /Invalid message size/);
  const sent = h.packets.length;
  assert.throws(() => h.bridge.sendHmProtocol({ dataBin: Buffer.alloc(MESSAGE_LIMITS.bytes + 1), type: 1 }), /exceeds transport limits/);
  assert.equal(h.packets.length, sent);
});

test('conflicting duplicates and changing declared lengths discard the entire message', () => {
  for (const corrupt of ['bytes', 'length']) {
    const h = receiver();
    const frames = fragments(h, Buffer.alloc(4001, 97));
    deliver(h, frames[0]);
    const duplicate = Buffer.from(frames[0]);
    if (corrupt === 'bytes') duplicate[66] = 98;
    else duplicate.writeUInt32LE(4002, 16);
    deliver(h, duplicate);
    assert.equal(h.received.length, 0);
    assert.equal(h.bridge.sessionMgr.sessions.size, 0);
    assert.equal(h.timers.size, 0);
    assert.match(h.errors.at(-1), /Conflicting duplicate|length changed/);
  }
});

test('fixed expiry is not refreshed by duplicates; expired spans cannot be resurrected', () => {
  const h = receiver();
  const frames = fragments(h, Buffer.alloc(4001));
  deliver(h, frames[0]);
  h.clock.tick(9000); deliver(h, frames[0]);
  h.clock.tick(1000);
  assert.equal(h.bridge.sessionMgr.sessions.size, 0);
  assert.equal(h.timers.size, 0);
  assert.match(h.errors.at(-1), /timed out/);
  for (const frame of frames) deliver(h, frame);
  assert.equal(h.received.length, 0);
  assert.equal(h.timers.size, 0);
  for (const frame of fragments(h, Buffer.alloc(4001), { spanId: 99 })) deliver(h, frame);
  assert.equal(h.received.length, 1);
});

test('active session and completed replay caches stay bounded', () => {
  const h = receiver();
  for (let i = 0; i < MESSAGE_LIMITS.sessions + 1; i++) deliver(h, fragments(h, Buffer.alloc(4001), { traceId: i + 1 })[0]);
  assert.equal(h.bridge.sessionMgr.sessions.size, MESSAGE_LIMITS.sessions);
  assert.equal(h.timers.size, MESSAGE_LIMITS.sessions);
  assert.match(h.errors.at(-1), /Too many incomplete/);
  h.clock.tick(MESSAGE_LIMITS.timeoutMs);
  assert.equal(h.bridge.sessionMgr.sessions.size, 0);
  for (let i = 0; i < 30; i++) deliver(h, fragments(h, Buffer.from('{}'), { traceId: i + 50 })[0]);
  assert.equal(h.bridge.sessionMgr.retired.size, MESSAGE_LIMITS.retired);
  assert.equal(h.timers.size, 0);
});

test('bad chunk indices, lengths, opcodes, types and short frames never create a session', () => {
  for (const [offset, width, value] of [[12, 4, 0], [12, 4, 99], [20, 4, 1999], [24, 1, 9], [25, 1, 1]]) {
    const h = receiver();
    const frame = fragments(h, Buffer.alloc(4001))[0];
    if (width === 4) frame.writeUInt32LE(value, offset); else frame.writeUInt8(value, offset);
    assert.doesNotThrow(() => deliver(h, frame));
    assert.equal(h.bridge.sessionMgr.sessions.size, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(h.errors.length, 1);
  }
  const h = receiver();
  assert.doesNotThrow(() => deliver(h, Buffer.alloc(10)));
  assert.doesNotThrow(() => h.deliver(Buffer.alloc(3)));
  assert.doesNotThrow(() => h.deliver(Buffer.alloc(3000)));
  assert.equal(h.bridge.sessionMgr.sessions.size, 0);
});

test('request timeout frees a partially reassembled response before the reassembly deadline', () => {
  const h = receiver();
  const request = h.observe(h.bridge.request({ method: 'radar-fixture' }, { timeout: 100 }));
  h.clock.tick();
  const traceId = h.requests()[0].traceId;
  deliver(h, fragments(h, Buffer.alloc(4001), { traceId, type: 2 })[0]);
  assert.equal(h.bridge.sessionMgr.sessions.size, 1);
  h.clock.tick(100);
  assert.equal(request.state, 'rejected');
  assert.equal(h.bridge.sessionMgr.sessions.size, 0);
  assert.equal(h.timers.size, 0);
});

test('disconnect frees all buffers and timers and ignores queued fragments on both ends', () => {
  for (const side of [true, false]) {
    const h = receiver({ side });
    const frames = fragments(h, Buffer.alloc(4001));
    deliver(h, frames[0]);
    h.bridge.disConnect();
    assert.equal(h.bridge.sessionMgr.sessions.size, 0);
    assert.equal(h.bridge.sessionMgr.retired.size, 0);
    assert.equal(h.timers.size, 0);
    for (const frame of frames) deliver(h, frame);
    assert.equal(h.received.length, 0);
    assert.equal(h.bridge.sessionMgr.sessions.size, 0);
  }
});

test('callback exceptions still release the assembled session', () => {
  const h = receiver();
  h.bridge.on('call', () => { throw Error('application callback'); });
  assert.throws(() => deliver(h, fragments(h, Buffer.from('{}'))[0]), /application callback/);
  assert.equal(h.bridge.sessionMgr.sessions.size, 0);
  assert.equal(h.timers.size, 0);
});

test('saved asynchronous replies cannot send after teardown or into a newer connection', async () => {
  const h = receiver({ side: true });
  const replies = [];
  h.bridge.on('request', (ctx) => replies.push(ctx.response));
  deliver(h, fragments(h, Buffer.from('{}'), { traceId: 77, type: 1 })[0]);
  let completeFetch;
  const fetch = new Promise((resolve) => { completeFetch = resolve; });
  const lateReply = fetch.then((data) => replies[0]({ data }));
  h.bridge.disConnect();
  const sent = h.packets.length;
  completeFetch({ stale: true });
  await lateReply;
  assert.equal(h.packets.length, sent);
  h.ready();
  replies[0]({ data: { staleAfterReconnect: true } });
  assert.equal(h.packets.length, sent);
  deliver(h, fragments(h, Buffer.from('{}'), { traceId: 78, type: 1 })[0]);
  replies[1]({ data: { current: true } });
  assert.equal(h.packets.length, sent + 1);
});

test('legacy timer polyfill cancels native handle zero', () => {
  const stopped = [];
  const context = vm.createContext({
    timer: { createTimer: () => 0, stopTimer: (id) => stopped.push(id) },
    isHmTimerDefined: () => true,
  });
  context.getGlobal = () => context;
  const source = readFileSync(new URL('../shared/setTimeout.js', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '');
  vm.runInContext(source, context);
  context.clearTimeout(context.setTimeout(() => {}, 10));
  context.clearImmediate(0); context.clearInterval(0);
  assert.deepEqual(stopped, [0, 0, 0]);
});
