import type { CollabConnectionState } from "@/services/collab/collabConnectionTypes";

export type CollabWsTransportHandlers = {
  onOpen: () => void;
  onMessage: (data: Uint8Array) => void;
  onClose: () => void;
  onError: (message: string) => void;
};

/** ブラウザ WebSocket を差し替え可能にする（Jest 用） */
export type CollabWsTransport = {
  connect(url: string, handlers: CollabWsTransportHandlers): void;
  send(data: Uint8Array): void;
  close(): void;
};

export type CollabWsSessionOptions = {
  wsUrl: string;
  ticket: string;
  transport: CollabWsTransport;
  onStateChange?: (state: CollabConnectionState) => void;
  /** 受信バイナリ（Yjs sync / awareness）。ticket 平文は渡さない */
  onMessage?: (data: Uint8Array) => void;
};

export type CollabWsSession = {
  getState(): CollabConnectionState;
  /** 任意で新しい短命 ticket を渡して接続／再接続する */
  connect(nextTicket?: string): void;
  disconnect(): void;
  send(data: Uint8Array): void;
};

function ticketPrefix(): Uint8Array {
  return new TextEncoder().encode("ticket:");
}

function encodeTicketMessage(ticket: string): Uint8Array {
  const prefix = ticketPrefix();
  const ticketBytes = new TextEncoder().encode(ticket);
  const out = new Uint8Array(prefix.length + ticketBytes.length);
  out.set(prefix, 0);
  out.set(ticketBytes, prefix.length);
  return out;
}

/**
 * 共同編集 WS セッションの接続状態機械。
 * ticket 送信後、サーバー応答（受理）を受けてから active。
 * 受理前の切断は auth 失敗として error（reconnecting にしない）。
 */
export function createCollabWsSession(options: CollabWsSessionOptions): CollabWsSession {
  let state: CollabConnectionState = "closed";
  let intentionalClose = false;
  let ticketSent = false;
  let ticketAccepted = false;
  /** 一度でも受理済みなら再接続中の一時失敗は reconnecting に戻す（初回 auth 失敗のみ error） */
  let everAccepted = false;
  let ticket = options.ticket;

  function setState(next: CollabConnectionState): void {
    state = next;
    options.onStateChange?.(next);
  }

  return {
    getState() {
      return state;
    },

    connect(nextTicket?: string) {
      if (typeof nextTicket === "string" && nextTicket.length > 0) {
        ticket = nextTicket;
      }
      intentionalClose = false;
      ticketSent = false;
      ticketAccepted = false;
      setState("connecting");
      options.transport.connect(options.wsUrl, {
        onOpen: () => {
          if (!ticketSent) {
            options.transport.send(encodeTicketMessage(ticket));
            ticketSent = true;
          }
          // active は ticket 受理（最初のサーバーメッセージ）まで待つ
        },
        onMessage: (data) => {
          if (!ticketAccepted && state === "connecting") {
            ticketAccepted = true;
            everAccepted = true;
            setState("active");
          }
          options.onMessage?.(data);
        },
        onClose: () => {
          if (intentionalClose) {
            setState("closed");
            return;
          }
          if (state === "error" || state === "closed") return;
          // 初回 ticket 未受理の切断のみ error。再接続試行の失敗は grace 内 reconnecting
          if (!ticketAccepted && !everAccepted) {
            setState("error");
            return;
          }
          setState("reconnecting");
        },
        onError: () => {
          if (everAccepted && !intentionalClose) {
            setState("reconnecting");
            return;
          }
          setState("error");
        },
      });
    },

    disconnect() {
      intentionalClose = true;
      options.transport.close();
      setState("closed");
    },

    send(data) {
      if (state !== "active") return;
      options.transport.send(data);
    },
  };
}
