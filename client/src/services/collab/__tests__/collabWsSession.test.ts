/** @jest-environment node */

import {
  createCollabWsSession,
  type CollabWsTransport,
} from "@/services/collab/collabWsSession";
import type { CollabConnectionState } from "@/services/collab/collabConnectionTypes";

function createFakeTransport(): CollabWsTransport & {
  open(): void;
  deliver(data: Uint8Array): void;
  fail(err?: string): void;
  close(): void;
  sent: Uint8Array[];
} {
  let onOpen: (() => void) | null = null;
  let onMessage: ((data: Uint8Array) => void) | null = null;
  let onClose: (() => void) | null = null;
  let onError: ((message: string) => void) | null = null;
  const sent: Uint8Array[] = [];

  return {
    sent,
    connect(_url, handlers) {
      onOpen = handlers.onOpen;
      onMessage = handlers.onMessage;
      onClose = handlers.onClose;
      onError = handlers.onError;
    },
    send(data) {
      sent.push(data);
    },
    close() {
      onClose?.();
    },
    open() {
      onOpen?.();
    },
    deliver(data) {
      onMessage?.(data);
    },
    fail(err = "network") {
      onError?.(err);
    },
  };
}

describe("collabWsSession", () => {
  it("ticket 受理（サーバー応答）後に connecting → active", () => {
    const states: CollabConnectionState[] = [];
    const transport = createFakeTransport();
    const session = createCollabWsSession({
      wsUrl: "wss://collab.example.test/collab/s1",
      ticket: "payload.sig",
      transport,
      onStateChange: (s) => states.push(s),
    });

    expect(session.getState()).toBe("closed");
    session.connect();
    expect(session.getState()).toBe("connecting");
    transport.open();
    // WS open だけではまだ active ではない（ticket 未受理）
    expect(session.getState()).toBe("connecting");
    expect(transport.sent.length).toBe(1);
    transport.deliver(new Uint8Array([0, 1, 2]));
    expect(session.getState()).toBe("active");
    expect(states.at(-1)).toBe("active");
    expect(states.join(",")).not.toContain("payload.sig");
  });

  it("auth 失敗（受理前の切断）は error（reconnecting にしない）", () => {
    const transport = createFakeTransport();
    const session = createCollabWsSession({
      wsUrl: "wss://collab.example.test/collab/s1",
      ticket: "t.sig",
      transport,
    });
    session.connect();
    transport.open();
    expect(session.getState()).toBe("connecting");
    transport.close();
    expect(session.getState()).toBe("error");
  });

  it("active 後の切断で reconnecting、再接続は ticket 受理後に active", () => {
    const transport = createFakeTransport();
    const session = createCollabWsSession({
      wsUrl: "wss://collab.example.test/collab/s1",
      ticket: "t.sig",
      transport,
    });
    session.connect();
    transport.open();
    transport.deliver(new Uint8Array([1]));
    expect(session.getState()).toBe("active");
    transport.close();
    expect(session.getState()).toBe("reconnecting");
    session.connect("new.ticket");
    transport.open();
    expect(session.getState()).toBe("connecting");
    const sent = new TextDecoder().decode(transport.sent.at(-1)!);
    expect(sent).toBe("ticket:new.ticket");
    transport.deliver(new Uint8Array([1]));
    expect(session.getState()).toBe("active");
  });

  it("再接続試行中の切断は reconnecting に戻す（初回 auth 失敗だけ error）", () => {
    const transport = createFakeTransport();
    const session = createCollabWsSession({
      wsUrl: "wss://collab.example.test/collab/s1",
      ticket: "t.sig",
      transport,
    });
    session.connect();
    transport.open();
    transport.deliver(new Uint8Array([1]));
    transport.close();
    expect(session.getState()).toBe("reconnecting");
    session.connect("fresh.ticket");
    transport.open();
    expect(session.getState()).toBe("connecting");
    transport.close();
    expect(session.getState()).toBe("reconnecting");
  });

  it("明示 disconnect は closed", () => {
    const transport = createFakeTransport();
    const session = createCollabWsSession({
      wsUrl: "wss://collab.example.test/collab/s1",
      ticket: "t.sig",
      transport,
    });
    session.connect();
    transport.open();
    transport.deliver(new Uint8Array([1]));
    session.disconnect();
    expect(session.getState()).toBe("closed");
  });

  it("transport エラーは error 状態", () => {
    const transport = createFakeTransport();
    const session = createCollabWsSession({
      wsUrl: "wss://collab.example.test/collab/s1",
      ticket: "t.sig",
      transport,
    });
    session.connect();
    transport.fail("boom");
    expect(session.getState()).toBe("error");
  });
});
