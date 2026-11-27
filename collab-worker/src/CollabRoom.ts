import {
  COLLAB_AWARENESS_UPDATE_LIMIT,
  COLLAB_DOC_UPDATE_LIMIT,
  COLLAB_EMPTY_ROOM_TTL_MS,
} from "./constants.js";
import { createSlidingWindowLimiter } from "./rateLimit.js";
import { RoomConnectionCore } from "./roomCore.js";
import { verifyCollabTicket } from "./ticket.js";
import {
  applySeedUpdate,
  classifyMessage,
  createAwareness,
  createRoomDoc,
  encodeAwarenessUpdate,
  encodeStateAsUpdate,
  encodeSyncStep1,
  encodeSyncUpdate,
  handleAwarenessMessage,
  handleSyncMessage,
  Y,
} from "./yjsProtocol.js";

export type CollabEnv = {
  COLLAB_ROOM: DurableObjectNamespace;
  TICKET_SECRET: string;
  SERVICE_SECRET: string;
  /** 任意。TTL 退避時に POST（body: yjs update, header Authorization） */
  ARTIFACT_EVACUATE_URL?: string;
};

type SessionSocket = {
  userId: string;
  socket: WebSocket;
  authed: boolean;
};

const TICKET_PREFIX = "ticket:";

function logSafe(message: string): void {
  console.log(message);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i)! ^ b.charCodeAt(i)!;
  return diff === 0;
}

function requireServiceAuth(request: Request, secret: string): boolean {
  const header = request.headers.get("Authorization") ?? "";
  return timingSafeEqualStr(header, `Bearer ${secret}`);
}

/**
 * セッション単位の Durable Object。
 * 所有者不在でも他参加者の接続が残ればルームは存続する。
 */
export class CollabRoom implements DurableObject {
  private readonly doc: Y.Doc;
  private readonly awareness;
  private readonly connections: RoomConnectionCore;
  private readonly sockets = new Map<WebSocket, SessionSocket>();
  private readonly docLimiter = createSlidingWindowLimiter(COLLAB_DOC_UPDATE_LIMIT);
  private readonly awarenessLimiter = createSlidingWindowLimiter(
    COLLAB_AWARENESS_UPDATE_LIMIT,
  );
  private evacuateAlarmSet = false;
  private evacuated = false;
  private sessionId: string | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: CollabEnv,
  ) {
    this.doc = createRoomDoc();
    this.awareness = createAwareness(this.doc);
    this.connections = new RoomConnectionCore(() => Date.now());

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "seed") return;
      this.broadcastRaw(encodeSyncUpdate(update), origin instanceof WebSocket ? origin : null);
    });

    this.awareness.on(
      "update",
      (
        {
          added,
          updated,
          removed,
        }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        const changed = added.concat(updated, removed);
        const msg = encodeAwarenessUpdate(this.awareness, changed);
        this.broadcastRaw(msg, origin instanceof WebSocket ? origin : null);
      },
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "rooms" && parts[1]) {
      this.sessionId = parts[1];
      if (!requireServiceAuth(request, this.env.SERVICE_SECRET)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const action = parts[2];
      if (action === "seed" && request.method === "POST") {
        return this.handleSeed(request);
      }
      if (action === "export" && request.method === "GET") {
        return this.handleExport();
      }
      if (action === "connections" && request.method === "GET") {
        // API 上限判定用: 接続中 + reconnect grace 枠
        return Response.json({ count: this.connections.occupiedSlots() });
      }
      if (action === "destroy" && request.method === "POST") {
        // end 成功後: 成果物は既に R2。退避せず kick + markDestroyed
        await this.destroyRoom("room-ended");
        return new Response(null, { status: 204 });
      }
      return new Response("Not Found", { status: 404 });
    }

    if (
      parts[0] === "collab" &&
      parts[1] &&
      request.headers.get("Upgrade") === "websocket"
    ) {
      this.sessionId = parts[1];
      return this.handleWebsocket(parts[1]);
    }

    return new Response("Not Found", { status: 404 });
  }

  async alarm(): Promise<void> {
    this.evacuateAlarmSet = false;
    if (!this.connections.shouldEvacuate()) return;
    await this.evacuateAndDestroy();
  }

  private async handleSeed(request: Request): Promise<Response> {
    if (this.connections.isDestroyed()) {
      return new Response("Gone", { status: 410 });
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength === 0) {
      return new Response("Empty", { status: 400 });
    }
    applySeedUpdate(this.doc, body);
    this.evacuated = false;
    logSafe("seed-ok");
    return new Response(null, { status: 204 });
  }

  private handleExport(): Response {
    if (this.connections.isDestroyed()) {
      return new Response(null, { status: 404 });
    }
    const update = encodeStateAsUpdate(this.doc);
    if (update.byteLength === 0) {
      return new Response(null, { status: 404 });
    }
    return new Response(update, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  }

  private handleWebsocket(sessionId: string): Response {
    if (this.connections.isDestroyed()) {
      return new Response("Gone", { status: 410 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const session: SessionSocket = {
      userId: "",
      socket: server,
      authed: false,
    };
    this.sockets.set(server, session);

    server.addEventListener("message", (event) => {
      void this.onSocketMessage(sessionId, session, event.data);
    });
    server.addEventListener("close", () => {
      this.onSocketClose(session);
    });
    server.addEventListener("error", () => {
      this.onSocketClose(session);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async onSocketMessage(
    sessionId: string,
    session: SessionSocket,
    raw: unknown,
  ): Promise<void> {
    const data =
      typeof raw === "string"
        ? new TextEncoder().encode(raw)
        : raw instanceof ArrayBuffer
          ? new Uint8Array(raw)
          : raw instanceof Uint8Array
            ? raw
            : null;
    if (!data) return;

    if (!session.authed) {
      const text = new TextDecoder().decode(data);
      if (!text.startsWith(TICKET_PREFIX)) {
        session.socket.close(4401, "unauthorized");
        return;
      }
      const ticket = text.slice(TICKET_PREFIX.length);
      const claims = await verifyCollabTicket(ticket, this.env.TICKET_SECRET);
      if (!claims || claims.sessionId !== sessionId) {
        logSafe("ws-auth-failed reason=invalid-ticket");
        session.socket.close(4401, "unauthorized");
        return;
      }
      const connected = this.connections.connect(claims.userId);
      if (!connected.ok) {
        if (connected.reason === "too-many-connections") {
          logSafe("ws-auth-failed reason=too-many-connections");
          session.socket.close(4429, "too-many-connections");
          return;
        }
        session.socket.close(4410, "room-gone");
        return;
      }
      session.userId = claims.userId;
      session.authed = true;
      this.evacuateAlarmSet = false;
      try {
        session.socket.send(encodeSyncStep1(this.doc));
      } catch {
        logSafe("ws-sync-send-failed");
      }
      return;
    }

    const kind = classifyMessage(data);
    const now = Date.now();
    if (kind === "sync") {
      if (!this.docLimiter.allow(`${session.userId}:doc`, now)) return;
      const reply = handleSyncMessage(this.doc, data);
      if (reply) {
        try {
          session.socket.send(reply);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (kind === "awareness") {
      if (!this.awarenessLimiter.allow(`${session.userId}:aw`, now)) return;
      handleAwarenessMessage(this.awareness, data);
    }
  }

  private onSocketClose(session: SessionSocket): void {
    this.sockets.delete(session.socket);
    if (session.authed && session.userId) {
      // 参照カウント: 同一 userId の別 WS が残っていれば空室 TTL に入らない
      this.connections.disconnect(session.userId);
    }
    if (this.connections.activeCount() === 0) {
      void this.scheduleEvacuateAlarm();
    }
  }

  private async scheduleEvacuateAlarm(): Promise<void> {
    if (this.evacuateAlarmSet) return;
    this.evacuateAlarmSet = true;
    try {
      await this.state.storage.setAlarm(Date.now() + COLLAB_EMPTY_ROOM_TTL_MS);
    } catch {
      logSafe("alarm-schedule-failed");
    }
  }

  private async evacuateAndDestroy(): Promise<void> {
    if (!this.evacuated) {
      const update = encodeStateAsUpdate(this.doc);
      // 空文書は正本にしない（失敗≠空 MapDocument 成功）
      if (update.byteLength > 0 && this.env.ARTIFACT_EVACUATE_URL) {
        try {
          const response = await fetch(this.env.ARTIFACT_EVACUATE_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.env.SERVICE_SECRET}`,
              "content-type": "application/octet-stream",
              "x-collab-session-id": this.sessionId ?? "",
            },
            body: update,
          });
          if (response.ok) {
            this.evacuated = true;
            logSafe("evacuate-ok");
          } else {
            logSafe("evacuate-failed");
          }
        } catch {
          logSafe("evacuate-failed");
        }
      } else if (update.byteLength > 0) {
        try {
          await this.state.storage.put("evacuatedUpdate", update);
          this.evacuated = true;
          logSafe("evacuate-stored");
        } catch {
          logSafe("evacuate-store-failed");
        }
      }
    }

    await this.destroyRoom("room-ttl");
  }

  /** 全 WS 切断 + ルーム破棄。再接続は 410。 */
  private async destroyRoom(closeReason: string): Promise<void> {
    for (const ws of this.sockets.keys()) {
      try {
        ws.close(1000, closeReason);
      } catch {
        /* ignore */
      }
    }
    this.sockets.clear();
    this.connections.markDestroyed();
  }

  private broadcastRaw(data: Uint8Array, except: WebSocket | null): void {
    for (const [ws, session] of this.sockets) {
      if (!session.authed) continue;
      if (except && ws === except) continue;
      try {
        ws.send(data);
      } catch {
        /* ignore */
      }
    }
  }
}
