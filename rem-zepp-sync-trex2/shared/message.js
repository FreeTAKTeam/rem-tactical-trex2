import './buffer'
import './logger'
import { EventBus } from './event'
import { SessionMgr, MESSAGE_LIMITS, validateChunk } from './reassembly'
import { Deferred } from './defer'
import { json2Buf, buf2Json, buf2hex, bin2hex, bin2json, str2buf } from './data'
import { isHmBleDefined, isHmAppDefined } from './js-module'

let logger

const noopLogger = {
  levels: { all: 'all', warn: 'warn' },
  connect() {},
  debug() {},
  error() {},
  log() {},
  warn() {},
}

function getLogger(name) {
  if (typeof Logger !== 'undefined' && Logger && typeof Logger.getLogger === 'function') {
    return Logger.getLogger(name)
  }

  return noopLogger
}

if (isHmAppDefined()) {
  logger = getLogger('device-message')
  // logger.level = logger.levels.warn
} else {
  logger = getLogger('side-message')
}

const DEBUG = false

export const MessageFlag = {
  App: 0x1,
}

export const MessageType = {
  Shake: 0x1,
  Close: 0x2,
  Heart: 0x3,
  Data: 0x4,
  DataWithSystemTool: 0x5,
  Log: 0x6,
}

export const MessageVersion = {
  Version1: 0x1,
}

export const MessagePayloadType = {
  Request: 0x1,
  Response: 0x2,
  Notify: 0x3,
}

// 中续，结束
export const MessagePayloadOpCode = {
  Continued: 0x0,
  Finished: 0x1,
}

let traceId = 10000
export function genTraceId() {
  return traceId++
}

let spanId = 1000
export function genSpanId() {
  return spanId++
}

export function getTimestamp(t = Date.now()) {
  return t % 10000000
}

export class MessageBuilder extends EventBus {
  constructor({ appId = 0, appDevicePort = 20, appSidePort = 0, ble = undefined } = {
    appId: 0,
    appDevicePort: 20,
    appSidePort: 0,
    ble: undefined,
  }, ) {
    super()
    this.ble = ble || (isHmBleDefined() ? hmBle : undefined)
    this.isDevice = Boolean(this.ble)
    this.isSide = !this.isDevice

    this.appId = appId
    this.appDevicePort = appDevicePort
    this.appSidePort = appSidePort
    this.sendMsg = this.getSafeSend()
    this.chunkSize = 2000
    this.tempBuf = null
    this.shakeTask = Deferred()
    this.waitingShakePromise = this.shakeTask.promise
    this.sessionMgr = new SessionMgr()
    this._deviceConnected = false
    this._disconnected = false
    this._connectionGeneration = 0
    this._pendingRequests = new Map()
    this._requestHandshake = null
    this._requestHandshakeReady = false
    this._onDeviceMessage = (message) => this.onMessage(message)
    this._onRequestResponse = ({ traceId, payload }) => {
      const request = this._pendingRequests.get(traceId)
      if (request) request.respond(payload)
    }
    this._onRequestError = (error) => {
      // EventBus iterates a live listener array: one shared listener avoids
      // skipping concurrent requests when settlement removes listeners.
      Array.from(this._pendingRequests.values()).forEach((request) => request.reject(error))
    }

    // 打开
    // console.log('jsfwk.error', logger.eventBus.count())
    // logger.warn('init=>',logger.eventBus.count())
    if (isHmAppDefined() && DEBUG) {
       logger.level = logger.levels.all
      logger.connect({
        log: (logEvent) => {
          this.log(JSON.stringify(logEvent))
          // console.log('jsfwk.error',JSON.stringify(logEvent))
        }
      })
    }
  }

  now(t = Date.now()) {
    return getTimestamp(t)
  }

  _resetHandshake() {
    this.shakeTask = Deferred()
    this.waitingShakePromise = this.shakeTask.promise
    this._requestHandshake = null
    this._requestHandshakeReady = false
  }

  connect(cb) {
    if (this._deviceConnected) {
      cb && cb(this)
      return
    }

    // disConnect installs a fresh deferred; keep initial pre-connect callers.
    this.appSidePort = 0
    this._disconnected = false
    this._deviceConnected = true
    const shakeTask = this.shakeTask
    this._watchRequestHandshake()
    this.on('message', this._onDeviceMessage)

    try {
      this.ble &&
        this.ble.createConnect((index, data, size) => {
          // A callback from a closed connection must not revive it after reconnect.
          if (!this._deviceConnected || this.shakeTask !== shakeTask) return
          this.onFragmentData(data)
        })
      this.sendShake()
    } catch (error) {
      // Registration can succeed before handshake sending fails. Roll back
      // both native state and listeners even if sending Close also fails.
      try { this.disConnect() } catch (cleanupError) {}
      throw error
    }
    cb && cb(this)
  }

  disConnect(cb) {
    const wasConnected = this._deviceConnected
    this._deviceConnected = false
    this._disconnected = true
    this._connectionGeneration += 1
    this._onRequestError(Error('Disconnected.'))
    this.off('message', this._onDeviceMessage)
    this.sessionMgr.clear()
    this._resetHandshake()

    try {
      if (wasConnected) this.sendClose()
    } finally {
      this.appSidePort = 0
      if (wasConnected && this.ble) this.ble.disConnect()
    }
    cb && cb(this)
  }

  connectStatus(){
    return this.ble && this.ble.connectStatus()
  }

  listen(cb) {
    messaging &&
      messaging.peerSocket.addListener('message', (message) => {
        // logger.warn('[RAW] [R] receive size=>%d bin=>%s', message.byteLength, this.bin2hex(message))
        this.onMessage(message)
      })

    this.waitingShakePromise = Promise.resolve()
    this._disconnected = false
    this._watchRequestHandshake()
    cb && cb(this)
  }

  buildBin(data) {
    const size = 16 + data.payload.byteLength
    let buf = Buffer.alloc(size)
    let offset = 0

    buf.writeUInt8(data.flag, offset)
    offset += 1

    buf.writeUInt8(data.version, offset)
    offset += 1

    buf.writeUInt16LE(data.type, offset)
    offset += 2

    buf.writeUInt16LE(data.port1, offset)
    offset += 2

    buf.writeUInt16LE(data.port2, offset)
    offset += 2

    buf.writeUInt32LE(data.appId, offset)
    offset += 4

    buf.writeUInt32LE(data.extra, offset)
    offset += 4

    buf.fill(data.payload, offset, data.payload.byteLength + offset)

    return buf
  }

  buildShake() {
    return this.buildBin({
      flag: MessageFlag.App,
      version: MessageVersion.Version1,
      type: MessageType.Shake,
      port1: this.appDevicePort,
      port2: this.appSidePort,
      appId: this.appId,
      extra: 0,
      payload: Buffer.from([this.appId]),
    })
  }

  sendShake() {
    if (this.appSidePort === 0) {
      const shake = this.buildShake()
      this.sendMsg(shake)
    }
  }

  buildClose() {
    return this.buildBin({
      flag: MessageFlag.App,
      version: MessageVersion.Version1,
      type: MessageType.Close,
      port1: this.appDevicePort,
      port2: this.appSidePort,
      appId: this.appId,
      extra: 0,
      payload: Buffer.from([this.appId]),
    })
  }

  sendClose() {
    if (this.appSidePort !== 0) {
      const close = this.buildClose()

      this.sendMsg(close)
    }
  }

  readBin(arrayBuf) {
    const buf = Buffer.from(arrayBuf)
    let offset = 0

    const flag = buf.readUInt8(offset)
    offset += 1

    const version = buf.readUInt8(offset)
    offset += 1

    const type = buf.readUInt16LE(offset)
    offset += 2

    const port1 = buf.readUInt16LE(offset)
    offset += 2

    const port2 = buf.readUInt16LE(offset)
    offset += 2

    const appId = buf.readUInt32LE(offset)
    offset += 4

    const extra = buf.readUInt32LE(offset)
    offset += 4

    const payload = buf.subarray(offset)

    return {
      flag,
      version,
      type,
      port1,
      port2,
      appId,
      extra,
      payload,
    }
  }

  // opts 覆盖头部选项
  buildData(payload, opts = {}) {
    return this.buildBin({
      flag: MessageFlag.App,
      version: MessageVersion.Version1,
      type: MessageType.Data,
      port1: this.appDevicePort,
      port2: this.appSidePort,
      appId: this.appId,
      extra: 0,
      ...opts,
      payload,
    })
  }

  json2Buf(obj) {
    return json2Buf(obj)
  }

  buf2Json(buf) {
    return buf2Json(buf)
  }

  buf2hex(buf) {
    return buf2hex(buf)
  }

  bin2hex(bin) {
    return bin2hex(bin)
  }

  bin2json(bin) {
    return bin2json(bin)
  }

  sendBin(buf) {
    // hmBle 发送消息
    // logger.warn('[RAW] [S] send size=%d bin=%s', buf.byteLength, this.bin2hex(buf.buffer))
    console.log('sendBin-------', buf.byteLength)
    this.ble.send(buf.buffer, buf.byteLength)
  }

  sendBinBySide(buf) {
    // side 发送消息
    // logger.warn('[RAW] [S] send size=%d bin=%s', buf.byteLength, this.bin2hex(buf.buffer))
    messaging.peerSocket.send(buf.buffer)
  }

  // 通用获取逻辑
  getSafeSend() {
    if (this.isDevice) {
      return this.sendBin.bind(this)
    } else {
      return this.sendBinBySide.bind(this)
    }
  }

  _logSend(buf) {
    // 日志的 send 里面不要打日志
    if (this.isDevice) {
      this.ble.send(buf.buffer, buf.byteLength)
    } else {
      messaging.peerSocket.send(buf.buffer)
    }
  }

  // 大数据的复杂头部分包协议
  sendHmProtocol({ requestId, dataBin, type }, { messageType = MessageType.Data } = {}) {
    const dataSize = this.chunkSize
    const headerSize = 0
    const userDataLength = dataBin.byteLength
    if (!Number.isInteger(dataSize) || dataSize < 1 || dataSize > MESSAGE_LIMITS.chunkBytes ||
        userDataLength < 1 || userDataLength > MESSAGE_LIMITS.bytes ||
        Math.ceil(userDataLength / dataSize) > MESSAGE_LIMITS.chunks) {
      throw Error('Message payload exceeds transport limits.')
    }

    let offset = 0
    const _buf = Buffer.alloc(dataSize)
    const traceId = requestId ? requestId : genTraceId()
    const spanId = genSpanId()
    let seqId = 1

    const count = Math.ceil(userDataLength / dataSize)

    function genSeqId() {
      return seqId++
    }

    for (let i = 1; i <= count; i++) {
      if (i === count) {
        // last
        const tailSize = userDataLength - offset
        const tailBuf = Buffer.alloc(headerSize + tailSize)

        dataBin.copy(tailBuf, headerSize, offset, offset + tailSize)
        offset += tailSize
        this.sendDataWithSession({
          traceId,
          spanId: spanId,
          seqId: genSeqId(),
          payload: tailBuf,
          type,
          opCode: MessagePayloadOpCode.Finished,
          totalLength: userDataLength,
        }, { messageType })

        break
      }

      dataBin.copy(_buf, headerSize, offset, offset + dataSize)
      offset += dataSize

      this.sendDataWithSession({
        traceId,
        spanId: spanId,
        seqId: genSeqId(),
        payload: _buf,
        type,
        opCode: MessagePayloadOpCode.Continued,
        totalLength: userDataLength,
      }, { messageType })
    }

    if (offset === userDataLength) {
      // logger.debug('HmProtocol send ok msgSize=> %d dataSize=> %d', offset, userDataLength)
    } else {
      // logger.error('HmProtocol send error msgSize=> %d dataSize=> %d', offset, userDataLength)
    }
  }

  // 大数据的简单分包协议
  sendSimpleProtocol({ dataBin }, { messageType = MessageType.Data } = {}) {
    const dataSize = this.chunkSize
    const headerSize = 0
    const userDataLength = dataBin.byteLength

    let offset = 0
    const _buf = Buffer.alloc(dataSize)

    const count = Math.ceil(userDataLength / dataSize)

    for (let i = 1; i <= count; i++) {
      if (i === count) {
        // last
        const tailSize = userDataLength - offset
        const tailBuf = Buffer.alloc(headerSize + tailSize)

        dataBin.copy(tailBuf, headerSize, offset, offset + tailSize)
        offset += tailSize
        this.sendSimpleData({ payload: tailBuf }, { messageType })

        break
      }

      dataBin.copy(_buf, headerSize, offset, offset + dataSize)
      offset += dataSize

      this.sendSimpleData({ payload: _buf }, { messageType })
    }

    if (offset === userDataLength) {
      // logger.debug('SimpleProtocol send ok msgSize=> %d dataSize=> %d', offset, userDataLength)
    } else {
      // logger.error('SimpleProtocol send error msgSize=> %d dataSize=> %d', offset, userDataLength)
    }
  }

  sendJson({ requestId = 0, json, type = MessagePayloadType.Request }) {
    const packageBin = this.json2Buf(json)
    const traceId = requestId ? requestId : genTraceId()

    this.sendHmProtocol({ requestId: traceId, dataBin: packageBin, type })
  }

  sendLog(str) {
    const packageBuf = str2buf(str)

    this.sendSimpleProtocol({ dataBin: packageBuf }, { messageType: MessageType.Log })
  }

  sendDataWithSession({ traceId, spanId, seqId, payload, type, opCode, totalLength }, { messageType }, ) {
    const payloadBin = this.buildPayload({
      traceId,
      spanId,
      seqId,
      totalLength,
      type,
      opCode,
      payload,
    })

    let data = this.isDevice ? this.buildData(payloadBin, { type: messageType }) : payloadBin

    this.sendMsg(data)
  }

  sendSimpleData({ payload }, { messageType }) {
    let data = this.isDevice ? this.buildData(payload, { type: messageType }) : payload

    this._logSend(data)
  }

  buildPayload(data) {
    const size = 66 + data.payload.byteLength
    let buf = Buffer.alloc(size)
    let offset = 0

    // header
    // traceId
    buf.writeUInt32LE(data.traceId, offset)
    offset += 4

    // parentId
    buf.writeUInt32LE(0, offset)
    offset += 4

    // spanId
    buf.writeUInt32LE(data.spanId, offset)
    offset += 4

    // seqId // 顺序 id,消息部分顺序序列号
    buf.writeUInt32LE(data.seqId, offset)
    offset += 4

    // message total length
    buf.writeUInt32LE(data.totalLength, offset)
    offset += 4

    // payload length 当前
    buf.writeUInt32LE(data.payload.byteLength, offset)
    offset += 4

    // payload type
    buf.writeUInt8(data.type, offset)
    offset += 1

    // opCode
    buf.writeUInt8(data.opCode, offset)
    offset += 1

    // timestamp1
    buf.writeUInt32LE(this.now(), offset)
    offset += 4

    // timestamp2
    buf.writeUInt32LE(0, offset)
    offset += 4

    // timestamp3
    buf.writeUInt32LE(0, offset)
    offset += 4

    // timestamp4
    buf.writeUInt32LE(0, offset)
    offset += 4

    // timestamp5
    buf.writeUInt32LE(0, offset)
    offset += 4

    // timestamp6
    buf.writeUInt32LE(0, offset)
    offset += 4

    // timestamp7
    buf.writeUInt32LE(0, offset)
    offset += 4

    // timestamp8
    buf.writeUInt32LE(0, offset)
    offset += 4

    // extra1
    buf.writeUInt32LE(0, offset)
    offset += 4

    // extra2
    buf.writeUInt32LE(0, offset)
    offset += 4

    // payload
    buf.fill(data.payload, offset, data.payload.byteLength + offset)

    return buf
  }

  readPayload(arrayBuf) {
    if (!arrayBuf || arrayBuf.byteLength < 67 || arrayBuf.byteLength > 66 + MESSAGE_LIMITS.chunkBytes) {
      throw Error('Invalid message frame length.')
    }
    const buf = Buffer.from(arrayBuf)
    let offset = 0

    const traceId = buf.readUInt32LE(offset)
    offset += 4

    const parentId = buf.readUInt32LE(offset)
    offset += 4

    const spanId = buf.readUInt32LE(offset)
    offset += 4

    const seqId = buf.readUInt32LE(offset)
    offset += 4

    const totalLength = buf.readUInt32LE(offset)
    offset += 4

    const payloadLength = buf.readUInt32LE(offset)
    offset += 4

    const payloadType = buf.readUInt8(offset)
    offset += 1

    const opCode = buf.readUInt8(offset)
    offset += 1

    const timestamp1 = buf.readUInt32LE(offset)
    offset += 4

    const timestamp2 = buf.readUInt32LE(offset)
    offset += 4

    const timestamp3 = buf.readUInt32LE(offset)
    offset += 4

    const timestamp4 = buf.readUInt32LE(offset)
    offset += 4

    const timestamp5 = buf.readUInt32LE(offset)
    offset += 4

    const timestamp6 = buf.readUInt32LE(offset)
    offset += 4

    const timestamp7 = buf.readUInt32LE(offset)
    offset += 4

    const timestamp8 = buf.readUInt32LE(offset)
    offset += 4

    const extra1 = buf.readUInt32LE(offset)
    offset += 4

    const extra2 = buf.readUInt32LE(offset)
    offset += 4

    const payload = buf.subarray(offset)

    return {
      traceId,
      parentId,
      spanId,
      seqId,
      totalLength,
      payloadLength,
      payloadType,
      opCode,
      timestamp1,
      timestamp2,
      timestamp3,
      timestamp4,
      timestamp5,
      timestamp6,
      timestamp7,
      timestamp8,
      extra1,
      extra2,
      payload,
    }
  }

  onFragmentData(bin) {
    if (this.isDevice && !this._deviceConnected) return
    if (!bin || bin.byteLength < 16 || bin.byteLength > 82 + MESSAGE_LIMITS.chunkBytes) {
      this.emit('error', Error('Invalid transport frame length.'))
      return
    }
    const data = this.readBin(bin)
    this.emit('raw', bin)

    // logger.debug('receive data=>', JSON.stringify(data))
    if (data.flag === MessageFlag.App && data.type === MessageType.Shake) {
      this.appSidePort = data.port2
      // logger.debug('appSidePort=>', data.port2)
      this.shakeTask.resolve()
    } else if (
      data.flag === MessageFlag.App &&
      data.type === MessageType.Data &&
      data.port2 === this.appSidePort
    ) {
      this.emit('message', data.payload)
      this.emit('read', data)
    } else if (
      data.flag === MessageFlag.App &&
      data.type === MessageType.DataWithSystemTool &&
      data.port2 === this.appSidePort
    ) {
      this.emit('message', data.payload)
      this.emit('read', data)
    } else if (
      data.flag === MessageFlag.App &&
      data.type === MessageType.Log &&
      data.port2 === this.appSidePort
    ) {
      this.emit('log', data.payload)
    } else {
      // logger.error('error appSidePort=>%d data=>%j', this.appSidePort, data)
    }
  }

  onMessage(messagePayload) {
    if (this._disconnected) return
    let payload
    try {
      payload = this.readPayload(messagePayload)
    } catch (error) {
      this.emit('error', error)
      return
    }
    let session = this.sessionMgr.getById(payload.traceId, payload.payloadType)
    if (session && session.spanId !== payload.spanId) return
    try {
      validateChunk(payload, this.chunkSize)
    } catch (error) {
      if (session) this.sessionMgr.destroy(session)
      this.emit('error', error)
      return
    }

    if (!session) {
      try {
        session = this.sessionMgr.newSession(payload.traceId, payload.payloadType, this, payload.spanId)
      } catch (error) {
        this.emit('error', error)
        return
      }
      if (!session) return

      session.on('data', (fullPayload) => {
        try {
          if (fullPayload.payloadType === MessagePayloadType.Request) {
            const generation = this._connectionGeneration
            this.emit('request', {
              request: fullPayload,
              response: ({ data }) => {
                if (this._disconnected || generation !== this._connectionGeneration) return
                this.response({ requestId: fullPayload.traceId, data })
              },
            })
          } else if (fullPayload.payloadType === MessagePayloadType.Response) {
            this.emit('response', fullPayload)
          } else if (fullPayload.payloadType === MessagePayloadType.Notify) {
            this.emit('call', fullPayload)
          }

          this.emit('data', fullPayload)
        } finally {
          this.sessionMgr.destroy(session)
        }
      })

      session.on('error', (error) => {
        this.sessionMgr.destroy(session)
        this.emit('error', error)
      })
    }

    session.addChunk(payload)
  }

  _watchRequestHandshake() {
    const handshake = this.waitingShakePromise
    if (this._requestHandshake === handshake) return
    this._requestHandshake = handshake
    this._requestHandshakeReady = false
    // Only one promise continuation per handshake. Timed-out requests must
    // not leave closures (and their payloads) on an unresolved shared promise.
    handshake.then(() => {
      if (this._requestHandshake !== handshake) return
      this._requestHandshakeReady = true
      Array.from(this._pendingRequests.values()).forEach((request) => request.start())
    }, (error) => {
      if (this._requestHandshake === handshake) this._onRequestError(error)
    })
  }

  request(data, opts) {
    const { timeout = 60000 } = opts || {}
    const defer = Deferred()
    if (this._disconnected) {
      defer.reject(Error('Disconnected.'))
      return defer.promise
    }

    const requestId = genTraceId()
    let timer = null
    let settled = false
    let sent = false
    const finish = (succeeded, value) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      this._pendingRequests.delete(requestId)
      this.sessionMgr.cancel(requestId, MessagePayloadType.Response)
      if (this._pendingRequests.size === 0) {
        // Replace EventBus's arrays instead of splicing the array an active
        // emit is walking, so unrelated listeners still receive this event.
        for (const [type, listener] of [
          ['response', this._onRequestResponse],
          ['error', this._onRequestError],
        ]) {
          const listeners = this.map.get(type)
          if (listeners) this.map.set(type, listeners.filter((cb) => cb !== listener))
        }
      }
      if (succeeded) defer.resolve(value)
      else defer.reject(value)
    }
    // The page owns this request, while the bridge may also serve Status.
    // Cancel only its deadline, fragments and listeners on page teardown.
    defer.promise.cancel = () => finish(false, Error('Cancelled.'))
    const request = {
      reject: (error) => finish(false, error),
      respond: (payload) => {
        if (!sent || settled) return
        try {
          finish(true, this.buf2Json(payload))
        } catch (error) {
          finish(false, error)
        }
      },
      start: () => {
        if (settled || sent) return
        sent = true
        try {
          this.sendJson({ requestId, json: data, type: MessagePayloadType.Request })
        } catch (error) {
          finish(false, error)
        }
      },
    }

    if (this._pendingRequests.size === 0) {
      this.on('response', this._onRequestResponse)
      this.on('error', this._onRequestError)
    }
    this._pendingRequests.set(requestId, request)
    // The deadline covers both handshake and response, and is always cleared
    // on settlement (including synchronous send/JSON failures and disconnect).
    timer = setTimeout(() => finish(false, Error(`Timed out in ${timeout}ms.`)), timeout)
    this._watchRequestHandshake()
    if (this._requestHandshakeReady) this.waitingShakePromise.then(request.start)
    return defer.promise
  }

  requestCb(data, opts, cb) {
    const _requestCb = () => {
      const defaultOpts = { timeout: 60000 }

      if (typeof opts === 'function') {
        cb = opts
        opts = defaultOpts
      } else {
        opts = Object.assign(defaultOpts, opts)
      }

      const requestId = genTraceId()
      let timer1 = null
      let hasReturned = false

      const transact = ({ traceId, payload }) => {
        // logger.debug('traceId=>%d payload=>%s', traceId, payload.toString('hex'))
        if (traceId === requestId) {
          const resultJson = this.buf2Json(payload)
          // logger.debug('request id=>%d payload=>%j', requestId, data)
          // logger.debug('response id=>%d payload=>%j', requestId, resultJson)

          this.off('response', transact)
          timer1 && clearTimeout(timer1)
          timer1 = null
          hasReturned = true
          cb(null, resultJson)
        }
      }

      this.on('response', transact)
      this.sendJson({ requestId, json: data, type: MessagePayloadType.Request })

      timer1 = setTimeout(() => {
        timer1 = null
        if (hasReturned) {
          return
        }

        // logger.error(`request time out in ${opts.timeout}ms error=>%d data=>%j`, requestId, data)
        this.off('response', transact)
        cb(Error(`Timed out in ${opts.timeout}ms.`))
      }, opts.timeout)
    }

    return this.waitingShakePromise.then(_requestCb)
  }

  response({ requestId, data }) {
    this.sendJson({ requestId, json: data, type: MessagePayloadType.Response })
  }

  call(data) {
    return this.waitingShakePromise.then(() => {
      return this.sendJson({ json: data, type: MessagePayloadType.Notify })
    })
  }

  log(str) {
    return this.waitingShakePromise.then(() => {
      return this.sendLog(str)
    })
  }
}
