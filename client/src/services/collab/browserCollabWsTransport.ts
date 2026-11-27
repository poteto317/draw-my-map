import type { CollabWsTransport } from "@/services/collab/collabWsSession";

/** ブラウザ標準 WebSocket を CollabWsTransport に適合 */
export function createBrowserCollabWsTransport(): CollabWsTransport {
  let socket: WebSocket | null = null;

  return {
    connect(url, handlers) {
      socket?.close();
      socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      socket.addEventListener("open", () => handlers.onOpen());
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          handlers.onMessage(new TextEncoder().encode(event.data));
          return;
        }
        if (event.data instanceof ArrayBuffer) {
          handlers.onMessage(new Uint8Array(event.data));
          return;
        }
        if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then((buf) => {
            handlers.onMessage(new Uint8Array(buf));
          });
        }
      });
      socket.addEventListener("close", () => handlers.onClose());
      socket.addEventListener("error", () => handlers.onError("ws-error"));
    },
    send(data) {
      socket?.send(data);
    },
    close() {
      socket?.close();
      socket = null;
    },
  };
}
