export class MessageBuilder {
  constructor() {
    this.handlers = {};
  }

  listen(callback) {
    this.listener = callback;
    if (
      typeof messaging !== "undefined" &&
      messaging.peerSocket &&
      typeof messaging.peerSocket.addEventListener === "function"
    ) {
      messaging.peerSocket.addEventListener("message", (event) => {
        const handler = this.handlers.request;
        if (handler) {
          handler({
            request: { payload: event.data },
            response: (payload) => this.call(payload),
          });
        }
      });
    }
    callback && callback();
  }

  on(event, handler) {
    this.handlers[event] = handler;
  }

  call(payload) {
    const buffer = this.json2Buf(payload);
    if (
      typeof messaging !== "undefined" &&
      messaging.peerSocket &&
      messaging.peerSocket.readyState === messaging.peerSocket.OPEN
    ) {
      messaging.peerSocket.send(buffer);
    }
    return buffer;
  }

  json2Buf(value) {
    return new TextEncoder().encode(JSON.stringify(value)).buffer;
  }

  buf2Json(buffer) {
    if (buffer && typeof buffer === "object" && !("byteLength" in buffer)) {
      return buffer;
    }
    return JSON.parse(new TextDecoder().decode(buffer));
  }
}
