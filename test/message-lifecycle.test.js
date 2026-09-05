import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Run with: .tools/node-v20.19.5-win-x64/node.exe --test test/message-lifecycle.test.js
// Load each bridge's real Promise, Deferred, EventBus and data helpers. Only
// platform BLE/socket, logging, Buffer and the clock are supplied by the VM host.
function loadBridge(directory, { side = false, injected = false } = {}) {
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
  const source = (name) => readFileSync(new URL(`../${directory}/${name}.js`, import.meta.url), 'utf8');
  vm.runInContext(source('promise'), context, { filename: `${directory}/promise.js` });
  for (const name of ['event', 'defer', 'data', 'js-module', 'message']) {
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
    respond, observe, clean, ble,
    get connects() { return connects; },
    get disconnects() { return disconnects; },
  };
}

for (const directory of ['shared', 'rem-zepp-sync-trex2/shared']) {
  for (const failingMethod of ['createConnect', 'send']) {
    test(`${directory}: failed ${failingMethod} rolls back registration and permits retry`, () => {
      const h = loadBridge(directory);
      const original = h.ble[failingMethod];
      h.ble[failingMethod] = () => { throw Error('radio failed'); };
      const pending = h.observe(h.bridge.request({}));
      assert.throws(() => h.bridge.connect(), /radio failed/);
      h.clock.tick();
      assert.equal(h.bridge._deviceConnected, false);
      assert.equal(h.bridge.count('message'), 0);
      assert.equal(h.disconnects, 1);
      assert.equal(pending.state, 'rejected');
      h.clean();
      h.ble[failingMethod] = original;
      h.ready();
      assert.equal(h.bridge.count('message'), 1);
      const result = h.observe(h.bridge.request({}));
      h.clock.tick();
      h.respond(h.requests()[0].traceId, { ok: true });
      h.clock.tick();
      assert.equal(result.value.ok, true);
      h.clean();
    });
  }
  test(`${directory}: bundled promise supports race/finally`, () => {
    const h = loadBridge(directory);
    const result = h.observe(vm.runInContext(
      'Promise.race([Promise.resolve(42)]).finally(() => {})', h.context,
    ));
    h.clock.tick();
    assert.equal(result.value, 42);
    h.clean();
  });

  test(`${directory}: handshake timeout never sends later or retains request continuations`, () => {
    const h = loadBridge(directory);
    h.bridge.connect();
    for (let i = 0; i < 30; i++) {
      const result = h.observe(h.bridge.request({ i }, { timeout: 10 }));
      h.clock.tick(10);
      assert.equal(result.state, 'rejected');
      assert.match(result.error.message, /Timed out in 10ms/);
      h.clean();
    }
    assert.equal(h.bridge.waitingShakePromise._deferreds.length, 1);
    h.shake();
    h.clock.tick();
    assert.equal(h.requests().length, 0);
    h.clean();
  });

  test(`${directory}: success routes responses by ID and clears both listeners and timer zero`, () => {
    const h = loadBridge(directory);
    // Queue before connect so the first request deadline has timer handle zero.
    const result = h.observe(h.bridge.request({ method: 'status' }, { timeout: 100 }));
    h.bridge.connect();
    h.shake();
    h.clock.tick();
    const [request] = h.requests();
    h.respond(request.traceId + 1, { wrong: true });
    h.clock.tick();
    assert.equal(result.state, 'pending');
    h.respond(request.traceId, { ok: true });
    h.clock.tick();
    assert.equal(result.state, 'fulfilled');
    assert.equal(result.value.ok, true);
    assert.equal(h.bridge.sessionMgr.sessions.size, 0);
    h.clean();
    h.clock.tick(1000);
    assert.equal(result.settlements, 1);
  });

  test(`${directory}: response shares original deadline with handshake`, () => {
    const h = loadBridge(directory);
    h.bridge.connect();
    const result = h.observe(h.bridge.request({}, { timeout: 100 }));
    h.clock.tick(80);
    h.shake();
    h.clock.tick();
    assert.equal(h.requests().length, 1);
    h.clock.tick(19);
    assert.equal(result.state, 'pending');
    h.clock.tick(1);
    assert.equal(result.state, 'rejected');
    h.respond(h.requests()[0].traceId, { late: true });
    h.clean();
    assert.equal(result.settlements, 1);
  });

  test(`${directory}: concurrent success, malformed JSON and timeout settle independently`, () => {
    const h = loadBridge(directory);
    h.ready();
    const results = [0, 1, 2].map((i) => h.observe(h.bridge.request({ i }, { timeout: 50 })));
    h.clock.tick();
    const requests = h.requests();
    h.respond(requests[1].traceId, {}, { malformed: true });
    h.respond(requests[0].traceId, { ok: true });
    h.clock.tick();
    assert.equal(results[0].state, 'fulfilled');
    assert.equal(results[1].error.name, 'SyntaxError');
    assert.equal(results[2].state, 'pending');
    assert.equal(h.timers.size, 1);
    h.clock.tick(50);
    assert.equal(results[2].state, 'rejected');
    h.clean();
  });

  for (const ready of [false, true]) {
    test(`${directory}: shared error cancels all requests ${ready ? 'after' : 'before'} handshake`, () => {
      const h = loadBridge(directory);
      if (ready) h.ready();
      else h.bridge.connect();
      const results = [0, 1, 2].map((i) => h.observe(h.bridge.request({ i })));
      h.clock.tick();
      const error = Error('transport failure');
      h.bridge.emit('error', error);
      h.clock.tick();
      results.forEach((result) => assert.equal(result.error, error));
      h.clean();
      if (!ready) {
        h.shake();
        h.clock.tick();
        assert.equal(h.requests().length, 0);
      }
    });

    test(`${directory}: disconnect cancels all requests ${ready ? 'after' : 'before'} handshake`, () => {
      const h = loadBridge(directory);
      if (ready) h.ready();
      else h.bridge.connect();
      const results = [0, 1, 2].map((i) => h.observe(h.bridge.request({ i })));
      h.clock.tick();
      const count = h.requests().length;
      const oldCallback = h.callbacks[0];
      const oldTask = h.bridge.shakeTask;
      h.bridge.disConnect();
      oldTask.resolve(); // Includes a queued promise callback from the old connection.
      h.shake(oldCallback);
      h.clock.tick();
      results.forEach((result) => {
        assert.equal(result.state, 'rejected');
        assert.match(result.error.message, /Disconnected/);
      });
      assert.equal(h.requests().length, count);
      assert.equal(h.bridge.appSidePort, 0);
      h.clean();
      const disconnected = h.observe(h.bridge.request({}));
      h.clock.tick();
      assert.equal(disconnected.state, 'rejected');
      h.clean();
    });
  }

  test(`${directory}: connect/disconnect are idempotent and reconnect requires fresh handshake`, () => {
    const h = loadBridge(directory);
    let callbackCount = 0;
    const cb = (bridge) => { assert.equal(bridge, h.bridge); callbackCount++; };
    const externalListener = () => {};
    h.bridge.on('message', externalListener);
    h.bridge.connect(cb);
    h.bridge.connect(cb);
    assert.equal(h.connects, 1);
    assert.equal(h.bridge.count('message'), 2);
    assert.equal(h.packets.length, 1);
    h.shake();
    h.clock.tick();
    const oldPromise = h.bridge.waitingShakePromise;
    h.bridge.disConnect(cb);
    h.bridge.disConnect(cb);
    assert.equal(h.disconnects, 1);
    assert.equal(h.packets.filter((packet) => packet.readUInt16LE(2) === 2).length, 1);
    assert.equal(h.bridge.count('message'), 1, 'preserves unrelated message listener');
    h.bridge.connect(cb);
    assert.notEqual(h.bridge.waitingShakePromise, oldPromise);
    const result = h.observe(h.bridge.request({ fresh: true }, { timeout: 100 }));
    h.shake(h.callbacks[0]);
    h.clock.tick();
    assert.equal(h.requests().length, 0, 'old BLE callback cannot complete new handshake');
    h.shake();
    h.clock.tick();
    assert.equal(h.requests().length, 1);
    h.respond(h.requests()[0].traceId, { ok: true });
    h.clock.tick();
    assert.equal(result.state, 'fulfilled');
    assert.equal(callbackCount, 5);
    h.clean();
  });

  test(`${directory}: synchronous send failure and synchronous response both clear deadlines`, () => {
    const h = loadBridge(directory);
    h.ready();
    const error = Error('send failed');
    h.bridge.sendJson = () => { throw error; };
    const failed = h.observe(h.bridge.request({}));
    h.clock.tick();
    assert.equal(failed.error, error);
    h.clean();
    h.bridge.sendJson = ({ requestId }) => h.bridge.emit('response', {
      traceId: requestId, payload: Buffer.from('{"ok":true}'),
    });
    const success = h.observe(h.bridge.request({}));
    h.clock.tick();
    assert.equal(success.value.ok, true);
    h.clean();
  });

  test(`${directory}: cleanup preserves unrelated response/error listeners and event delivery`, () => {
    const h = loadBridge(directory);
    h.ready();
    const response = h.observe(h.bridge.request({}));
    let responseEvents = 0;
    let errorEvents = 0;
    const onResponse = () => { responseEvents++; };
    const onError = () => { errorEvents++; };
    // Registered after the bridge handlers to catch EventBus's live-array trap.
    h.bridge.on('response', onResponse);
    h.clock.tick();
    h.respond(h.requests()[0].traceId, { ok: true });
    h.clock.tick();
    assert.equal(response.state, 'fulfilled');
    assert.equal(responseEvents, 1);
    assert.equal(h.bridge.count('response'), 1);
    const failure = h.observe(h.bridge.request({}));
    h.bridge.on('error', onError);
    h.bridge.emit('error', Error('failure'));
    h.clock.tick();
    assert.equal(failure.state, 'rejected');
    assert.equal(errorEvents, 1);
    assert.equal(h.bridge.count('error'), 1);
    h.bridge.off('response', onResponse);
    h.bridge.off('error', onError);
    h.clean();
  });

  test(`${directory}: disconnect before queued ready send prevents transmission`, () => {
    const h = loadBridge(directory);
    h.ready();
    const result = h.observe(h.bridge.request({}));
    h.bridge.disConnect();
    h.clock.tick();
    assert.equal(result.state, 'rejected');
    assert.equal(h.requests().length, 0);
    h.clean();
  });

  test(`${directory}: rejected handshake rejects pending requests without timer leaks`, () => {
    const h = loadBridge(directory);
    h.bridge.connect();
    const result = h.observe(h.bridge.request({}));
    const error = Error('handshake failed');
    h.bridge.shakeTask.reject(error);
    h.clock.tick();
    assert.equal(result.error, error);
    assert.equal(h.requests().length, 0);
    h.clean();
  });

  test(`${directory}: serialization errors reject and default/zero deadlines are enforced`, () => {
    const h = loadBridge(directory);
    h.ready();
    const data = {};
    data.circular = data;
    const invalid = h.observe(h.bridge.request(data));
    h.clock.tick();
    assert.equal(invalid.state, 'rejected');
    h.clean();
    const normal = h.observe(h.bridge.request({}));
    h.clock.tick(59999);
    assert.equal(normal.state, 'pending');
    h.clock.tick(1);
    assert.equal(normal.state, 'rejected');
    h.clean();
    const immediate = h.observe(h.bridge.request({}, { timeout: 0 }));
    h.clock.tick();
    assert.match(immediate.error.message, /Timed out in 0ms/);
    h.clean();
  });

  test(`${directory}: side listen/request/call/requestCb still use peer socket`, () => {
    const h = loadBridge(directory, { side: true });
    h.ready();
    const result = h.observe(h.bridge.request({ method: 'side' }));
    h.clock.tick();
    h.respond(h.requests()[0].traceId, { side: true });
    h.clock.tick();
    assert.equal(result.value.side, true);
    h.clean();
    h.bridge.call({ notification: true });
    let callbackValue;
    h.bridge.requestCb({}, { timeout: 50 }, (error, value) => {
      assert.equal(error, null);
      callbackValue = value;
    });
    h.clock.tick();
    assert.equal(h.packets.some((packet) => h.bridge.readPayload(packet).payloadType === 3), true);
    h.respond(h.requests().at(-1).traceId, { callback: true });
    h.clock.tick();
    assert.equal(callbackValue.callback, true);
    assert.equal(h.connects, 0);
    h.clean();
  });

  test(`${directory}: legacy call queued before first connect still waits for handshake`, () => {
    const h = loadBridge(directory);
    h.bridge.call({ notification: true });
    h.bridge.connect();
    h.clock.tick();
    assert.equal(h.packets.length, 1);
    h.shake();
    h.clock.tick();
    assert.equal(h.packets.length, 2);
    assert.equal(h.bridge.readPayload(h.packets[1].subarray(16)).payloadType, 3);
    h.clean();
  });
}

test('companion: injected BLE works without global hmBle', () => {
  const h = loadBridge('rem-zepp-sync-trex2/shared', { injected: true });
  h.ready();
  const result = h.observe(h.bridge.request({}));
  h.clock.tick();
  h.respond(h.requests()[0].traceId, { injected: true });
  h.clock.tick();
  assert.equal(result.value.injected, true);
  h.bridge.disConnect();
  assert.equal(h.disconnects, 1);
  h.clean();
});
