import { parseRemStatusCache, serializeRemStatus } from "./remModel.js";

export const REM_CACHE_FILE = "rem_status.pipe";

function getFs(options = {}) {
  if (options.fs !== undefined) {
    return options.fs;
  }

  if (typeof hmFS !== "undefined") {
    return hmFS;
  }

  return null;
}

function stringToArrayBuffer(value) {
  const buffer = new ArrayBuffer(value.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return buffer;
}

function arrayBufferToString(buffer, length) {
  const bytes = new Uint8Array(buffer);
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function hasZosSyncApi(fs) {
  return fs && typeof fs.openSync === "function";
}

function hasTextFileApi(fs) {
  return fs && typeof fs.writeTextFile === "function" && typeof fs.readTextFile === "function";
}

function openForWrite(fs, path) {
  if (hasZosSyncApi(fs)) {
    try {
      return fs.openSync({
        path,
        flag: (fs.O_RDWR || 0) | (fs.O_CREAT || 0) | (fs.O_TRUNC || 0),
      });
    } catch (error) {
      return null;
    }
  }

  if (typeof fs.open !== "function") {
    return null;
  }

  try {
    if (fs.O_RDWR !== undefined || fs.O_CREAT !== undefined || fs.O_TRUNC !== undefined) {
      return fs.open(path, (fs.O_RDWR || 0) | (fs.O_CREAT || 0) | (fs.O_TRUNC || 0));
    }
    return fs.open(path, "w");
  } catch (error) {
    return null;
  }
}

function openForRead(fs, path) {
  if (hasZosSyncApi(fs)) {
    try {
      return fs.openSync({
        path,
        flag: fs.O_RDONLY || 0,
      });
    } catch (error) {
      return null;
    }
  }

  if (typeof fs.open !== "function") {
    return null;
  }

  try {
    if (fs.O_RDONLY !== undefined) {
      return fs.open(path, fs.O_RDONLY);
    }
    return fs.open(path, "r");
  } catch (error) {
    return null;
  }
}

function closeQuietly(fs, handle) {
  try {
    if (hasZosSyncApi(fs) && typeof fs.closeSync === "function") {
      fs.closeSync({ fd: handle });
    } else {
      fs.close && fs.close(handle);
    }
  } catch (error) {
  }
}

export function writeRemStatusCache(status, options = {}) {
  const fs = getFs(options);
  if (!fs) {
    return { ok: false, reason: "UNSUPPORTED" };
  }

  const path = options.path || REM_CACHE_FILE;
  const payload = serializeRemStatus(status);

  if (hasTextFileApi(fs)) {
    try {
      fs.writeTextFile(path, payload);
      return { ok: true, path, bytes: payload.length };
    } catch (error) {
      return { ok: false, reason: "WRITE_FAILED", error: String(error?.message || error) };
    }
  }

  const handle = openForWrite(fs, path);
  if (handle === null || handle === undefined) {
    return { ok: false, reason: "OPEN_FAILED" };
  }

  try {
    if (hasZosSyncApi(fs) && typeof fs.writeSync === "function") {
      const buffer = stringToArrayBuffer(payload);
      fs.writeSync({
        fd: handle,
        buffer,
        options: {
          offset: 0,
          length: payload.length,
          position: 0,
        },
      });
    } else if (typeof fs.write === "function") {
      fs.write(handle, payload, 0, payload.length);
    } else {
      return { ok: false, reason: "WRITE_UNSUPPORTED" };
    }
    return { ok: true, path, bytes: payload.length };
  } catch (error) {
    return { ok: false, reason: "WRITE_FAILED", error: String(error?.message || error) };
  } finally {
    closeQuietly(fs, handle);
  }
}

export function readRemStatusCache(options = {}) {
  const fs = getFs(options);
  if (!fs) {
    return { ok: false, reason: "UNSUPPORTED", status: null };
  }

  const path = options.path || REM_CACHE_FILE;

  if (hasTextFileApi(fs)) {
    try {
      const payload = fs.readTextFile(path);
      return { ok: true, status: parseRemStatusCache(String(payload || "")) };
    } catch (error) {
      return { ok: false, reason: "READ_FAILED", status: null, error: String(error?.message || error) };
    }
  }

  const handle = openForRead(fs, path);
  if (handle === null || handle === undefined) {
    return { ok: true, status: null, reason: "NO_CACHE" };
  }

  try {
    let payload = "";
    if (hasZosSyncApi(fs) && typeof fs.readSync === "function") {
      const stat = typeof fs.statSync === "function" ? fs.statSync({ path }) : null;
      const length = Math.min(Number(stat?.size) || options.maxBytes || 768, options.maxBytes || 768);
      const buffer = new ArrayBuffer(length || 1);
      const bytesRead = fs.readSync({
        fd: handle,
        buffer,
        options: {
          offset: 0,
          length,
          position: 0,
        },
      });
      payload = arrayBufferToString(buffer, bytesRead || 0);
    } else if (typeof fs.read === "function") {
      payload = String(fs.read(handle, options.maxBytes || 768) || "");
    } else {
      return { ok: false, reason: "READ_UNSUPPORTED", status: null };
    }
    return { ok: true, status: parseRemStatusCache(payload) };
  } catch (error) {
    return { ok: false, reason: "READ_FAILED", status: null, error: String(error?.message || error) };
  } finally {
    closeQuietly(fs, handle);
  }
}
