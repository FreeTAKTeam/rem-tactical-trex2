import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Real bridge code and promise scheduling; native transports and time are supplied.
export function loadBridge(directory, { side = false, injected = false } = {}) {
  let now = 0;
  let nextTimer = 0; // Exercise cleanup when the platform returns handle zero.
  const timers = new Map();
  const callbacks = [];
  const packets = [];
  const warnings = [];
  let connects = 0;
  let disconnects = 0;
  let socketListener;
  const ble = {
    createConnect(callback) { connects++; callbacks.push(callback); },
    disConnect() { disconnects++; },
    connectStatus() { return true; },
    send(buffer, size) { packets.push(Buffer.from(buffer).subarray(0, size)); },
  };
  const context = vm.createContext({
    Buffer,
    console: { log: (...args) => warnings.push(args) },
    Logger: { getLogger: () => ({}) },
    ...(side || injected ? {} : { hmBle: ble }),
    ...(side ? {} : { hmApp: {} }),
    messaging: { peerSocket: {
      addListener(type, callback) {
        assert.equal(type, 'message');
        socketListener = callback;
      },
      send(buffer) { packets.push(Buffer.from(buffer)); },
    } },
    setTimeout(fn, delay = 0) {
      const id = nextTimer++;
      timers.set(id, { fn, at: now + Math.max(0, Number(delay) || 0) });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  const source = (name) => readFileSync(new URL(`../../${directory}/${name}.js`, import.meta.url), 'utf8');
  vm.runInContext(source('promise'), context, { filename: `${directory}/promise.js` });
  for (const name of ['event', 'defer', 'data', 'js-module', ...(directory === 'rem-zepp-sync-trex2/shared' ? ['reassembly'] : []), 'message']) {
    const script = source(name).replace(/^import .*\r?\n/gm, '').replace(/\bexport /g, '');
    vm.runInContext(script, context, { filename: `${directory}/${name}.js` });
  }
  const MessageBuilder = vm.runInContext('MessageBuilder', context);
  const bridge = new MessageBuilder({ appId: 123, ...(injected ? { ble } : {}) });
  const clock = {
    tick(ms = 0) {
      const end = now + ms;
      for (let count = 0; ; count++) {
        assert.ok(count < 10000, 'clock must become idle');
        const due = [...timers].filter(([, task]) => task.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        const [id, task] = due;
        timers.delete(id);
        now = task.at;
        task.fn();
      }
      now = end;
    },
  };
  function deliver(buffer, callback = callbacks.at(-1)) {
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    if (side) socketListener(data);
    else callback(0, data, data.byteLength);
  }
  function shake(callback) {
    deliver(bridge.buildBin({
      flag: 1, version: 1, type: 1, port1: 20, port2: 31,
      appId: 123, extra: 0, payload: Buffer.from([123]),
    }), callback);
  }
  function ready() {
    if (side) bridge.listen();
    else { bridge.connect(); shake(); }
    clock.tick();
  }
  function requests() {
    return packets.filter((packet) => side || packet.readUInt16LE(2) === 4)
      .map((packet) => bridge.readPayload(side ? packet : packet.subarray(16)))
      .filter((payload) => payload.payloadType === 1);
  }
  function respond(traceId, value, { malformed = false } = {}) {
    const payload = malformed ? Buffer.from('{bad json') : bridge.json2Buf(value);
    const frame = bridge.buildPayload({
      traceId, spanId: 1, seqId: 1, totalLength: payload.byteLength,
      type: 2, opCode: 1, payload,
    });
    deliver(side ? frame : bridge.buildData(frame));
  }
  function observe(promise) {
    const result = { state: 'pending', settlements: 0 };
    promise.then((value) => {
      result.state = 'fulfilled'; result.value = value; result.settlements++;
    }, (error) => {
      result.state = 'rejected'; result.error = error; result.settlements++;
    });
    return result;
  }
  function clean() {
    clock.tick();
    assert.equal(timers.size, 0, 'no request deadline or promise task remains');
    assert.equal(bridge.count('response'), 0);
    assert.equal(bridge.count('error'), 0);
    assert.equal(bridge._pendingRequests.size, 0);
    assert.equal(warnings.some((args) => String(args[0]).includes('Unhandled')), false);
  }
  return {
    bridge, context, clock, timers, callbacks, packets, shake, ready, requests,
    respond, observe, clean, ble, deliver,
    get connects() { return connects; },
    get disconnects() { return disconnects; },
  };
}
