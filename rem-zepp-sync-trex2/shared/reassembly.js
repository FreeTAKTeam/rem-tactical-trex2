import { EventBus } from './event.js'

export const MESSAGE_LIMITS = {
  bytes: 65536,
  chunkBytes: 2000,
  chunks: 64,
  sessions: 4,
  retired: 16,
  timeoutMs: 10000,
}

export function validateChunk(chunk, chunkSize = MESSAGE_LIMITS.chunkBytes) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MESSAGE_LIMITS.chunkBytes ||
      !Number.isInteger(chunk.totalLength) || chunk.totalLength < 1 || chunk.totalLength > MESSAGE_LIMITS.bytes ||
      ![1, 2, 3].includes(chunk.payloadType)) throw Error('Invalid message size or type.')
  const count = Math.ceil(chunk.totalLength / chunkSize)
  if (count > MESSAGE_LIMITS.chunks || !Number.isInteger(chunk.seqId) || chunk.seqId < 1 || chunk.seqId > count ||
      chunk.opCode !== (chunk.seqId === count ? 1 : 0) ||
      chunk.payloadLength !== Math.min(chunkSize, chunk.totalLength - (chunk.seqId - 1) * chunkSize) ||
      !chunk.payload || chunk.payload.byteLength !== chunk.payloadLength) throw Error('Invalid message fragment.')
  return count
}

function equalBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false
  for (let i = 0; i < left.byteLength; i++) if (left[i] !== right[i]) return false
  return true
}

class MessageSession extends EventBus {
  constructor(id, type, ctx, spanId) {
    super()
    this.id = id
    this.type = type
    this.spanId = spanId
    this.chunkSize = ctx.chunkSize
    this.chunks = new Map()
    this.totalLength = null
    this.finishChunk = null
    this.closed = false
    // A fixed deadline is never extended by duplicate or trickled fragments.
    this.timer = setTimeout(() => this.fail(Error('Message reassembly timed out.')), MESSAGE_LIMITS.timeoutMs)
  }

  fail(error) {
    if (this.closed) return
    this.releaseBuf()
    this.emit('error', error)
  }

  addChunk(chunk) {
    if (this.closed || chunk.spanId !== this.spanId) return
    let count
    try {
      count = validateChunk(chunk, this.chunkSize)
      if (this.totalLength !== null && this.totalLength !== chunk.totalLength) throw Error('Message length changed.')
      const prior = this.chunks.get(chunk.seqId)
      if (prior) {
        if (!equalBytes(prior, chunk.payload)) throw Error('Conflicting duplicate fragment.')
        return
      }
    } catch (error) {
      this.fail(error)
      return
    }
    this.totalLength = chunk.totalLength
    // Native BLE may reuse a callback buffer; retain a bounded independent copy.
    this.chunks.set(chunk.seqId, Buffer.from(chunk.payload))
    if (chunk.opCode === 1) this.finishChunk = { ...chunk }
    if (this.chunks.size !== count || !this.finishChunk) return
    const ordered = []
    for (let index = 1; index <= count; index++) ordered.push(this.chunks.get(index))
    const payload = Buffer.concat(ordered)
    const complete = { ...this.finishChunk, payload, payloadLength: payload.byteLength }
    this.releaseBuf()
    this.emit('data', complete)
  }

  releaseBuf() {
    this.closed = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.chunks.clear()
    this.finishChunk = null
    this.totalLength = null
  }
}

export class SessionMgr {
  constructor() {
    this.sessions = new Map()
    this.retired = new Set()
  }

  key(session) { return `${session.id}:${session.type}` }
  token(id, type, spanId) { return `${id}:${type}:${spanId}` }

  newSession(id, type, ctx, spanId) {
    if (this.retired.has(this.token(id, type, spanId))) return null
    if (this.sessions.size >= MESSAGE_LIMITS.sessions) throw Error('Too many incomplete messages.')
    const session = new MessageSession(id, type, ctx, spanId)
    this.sessions.set(this.key(session), session)
    return session
  }

  destroy(session) {
    session.releaseBuf()
    if (this.sessions.get(this.key(session)) !== session) return
    this.sessions.delete(this.key(session))
    this.retired.add(this.token(session.id, session.type, session.spanId))
    if (this.retired.size > MESSAGE_LIMITS.retired) this.retired.delete(this.retired.values().next().value)
  }

  cancel(id, type) {
    const session = this.getById(id, type)
    if (session) this.destroy(session)
  }

  has(id, type) { return this.sessions.has(this.key({ id, type })) }
  getById(id, type) { return this.sessions.get(this.key({ id, type })) }

  clear() {
    for (const session of Array.from(this.sessions.values())) this.destroy(session)
    this.retired.clear()
  }
}
