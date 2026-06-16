import test from "node:test";
import assert from "node:assert/strict";

import {
  clearRemStatusCache,
  readRemStatusCache,
  writeRemStatusCache,
} from "../common/remCache.js";
import { getMockRemStatus, getNextMockRemStatus } from "../common/mockRem.js";

function createMemoryFs() {
  const files = new Map();
  return {
    files,
    open(path, flag) {
      if (flag === "w") {
        files.set(path, "");
      }
      return path;
    },
    write(handle, buffer) {
      files.set(handle, String(buffer));
      return String(buffer).length;
    },
    read(handle) {
      return files.get(handle) || "";
    },
    close() {},
    remove(path) {
      files.delete(path);
    },
  };
}

function createZosMemoryFs() {
  const files = new Map();
  return {
    O_RDONLY: 0,
    O_RDWR: 2,
    O_CREAT: 64,
    O_TRUNC: 512,
    openSync({ path, flag }) {
      if ((flag & this.O_CREAT) === this.O_CREAT && !files.has(path)) {
        files.set(path, "");
      }
      if (!files.has(path)) {
        throw new Error("missing");
      }
      return path;
    },
    statSync({ path }) {
      const value = files.get(path);
      return value === undefined ? undefined : { size: value.length };
    },
    writeSync({ fd, buffer, options }) {
      const bytes = new Uint8Array(buffer).slice(0, options?.length || buffer.byteLength);
      const text = Array.from(bytes)
        .map((byte) => String.fromCharCode(byte))
        .join("");
      files.set(fd, text);
      return text.length;
    },
    readSync({ fd, buffer, options }) {
      const value = files.get(fd) || "";
      const bytes = new Uint8Array(buffer);
      const length = Math.min(options?.length || bytes.length, value.length);
      for (let index = 0; index < length; index += 1) {
        bytes[index] = value.charCodeAt(index);
      }
      return length;
    },
    closeSync() {},
    rmSync({ path }) {
      files.delete(path);
      return 0;
    },
  };
}

test("writeRemStatusCache and readRemStatusCache use watchface-owned hmFS", () => {
  const fs = createMemoryFs();
  const status = getMockRemStatus(1, 1760000000000);

  const writeResult = writeRemStatusCache(status, { fs });
  const readResult = readRemStatusCache({ fs });

  assert.equal(writeResult.ok, true);
  assert.equal(readResult.ok, true);
  assert.equal(readResult.status.connection, "CONNECTED");
  assert.equal(readResult.status.priority, "HIGH");
});

test("writeRemStatusCache and readRemStatusCache support Zepp openSync APIs", () => {
  const fs = createZosMemoryFs();
  const status = getMockRemStatus(3, 1760000000000);

  const writeResult = writeRemStatusCache(status, { fs });
  const readResult = readRemStatusCache({ fs });

  assert.equal(writeResult.ok, true);
  assert.equal(readResult.ok, true);
  assert.equal(readResult.status.connection, "CONNECTED");
  assert.equal(readResult.status.priority, "EMERGENCY");
});

test("writeRemStatusCache and readRemStatusCache support text-file adapters", () => {
  const files = new Map();
  const adapter = {
    writeTextFile(path, data) {
      files.set(path, data);
    },
    readTextFile(path) {
      return files.get(path) || "";
    },
    removeTextFile(path) {
      files.delete(path);
    },
  };

  const status = getMockRemStatus(2, 1760000000000);
  assert.equal(writeRemStatusCache(status, { fs: adapter }).ok, true);
  assert.equal(readRemStatusCache({ fs: adapter }).status.connection, "STALE");
  assert.equal(clearRemStatusCache({ fs: adapter }).ok, true);
  assert.equal(readRemStatusCache({ fs: adapter }).status, null);
});

test("readRemStatusCache reports unsupported when hmFS is unavailable", () => {
  const result = readRemStatusCache({ fs: null });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "UNSUPPORTED");
});

test("clearRemStatusCache removes the stored pipe cache", () => {
  const fs = createMemoryFs();
  writeRemStatusCache(getMockRemStatus(0, 1760000000000), { fs });

  assert.equal(clearRemStatusCache({ fs }).ok, true);
  assert.equal(readRemStatusCache({ fs }).status, null);
});

test("getNextMockRemStatus cycles through six proof states", () => {
  const states = Array.from({ length: 7 }, (_, index) =>
    getNextMockRemStatus(index, 1760000000000).connection,
  );

  assert.deepEqual(states, [
    "CONNECTED",
    "CONNECTED",
    "STALE",
    "CONNECTED",
    "ERROR",
    "CONNECTED",
    "CONNECTED",
  ]);
});
