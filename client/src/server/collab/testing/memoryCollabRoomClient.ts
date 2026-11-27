import {
  COLLAB_MAX_CONNECTIONS,
  type CollabRoomClient,
  type CollabRoomExportResult,
} from "@/server/collab/collabRoomClient";
import { verifyCollabTicket } from "@/server/collab/collabTicket";
import { COLLAB_RECONNECT_GRACE_MS } from "@/domain/collab/collabConnectionTypes";
import {
  COLLAB_AWARENESS_UPDATE_LIMIT,
  COLLAB_DOC_UPDATE_LIMIT,
  COLLAB_EMPTY_ROOM_TTL_MS,
} from "@/domain/collab/collabRoomPolicy";

export type MemoryCollabConnectResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid-ticket" }
  | { ok: false; reason: "too-many-connections"; status: 429 }
  | { ok: false; reason: "room-gone" };

export type MemoryCollabRateResult =
  | { ok: true }
  | { ok: false; reason: "rate-limited" | "not-connected" };

type Participant = {
  userId: string;
  /** 同一 userId のライブ接続数（参照カウント） */
  liveSockets: number;
  disconnectedAt: number | null;
  droppedForGrace: boolean;
  docHits: number[];
  awarenessHits: number[];
};

type RoomState = {
  update: Uint8Array | null;
  participants: Map<string, Participant>;
  emptySince: number | null;
  evacuated: Uint8Array | null;
  destroyed: boolean;
};

export type MemoryCollabRoomClient = CollabRoomClient & {
  connect(sessionId: string, ticket: string): Promise<MemoryCollabConnectResult>;
  disconnect(sessionId: string, userId: string): void;
  isActiveParticipant(sessionId: string, userId: string): boolean;
  wasDroppedForGrace(sessionId: string, userId: string): boolean;
  acceptDocUpdate(sessionId: string, userId: string): MemoryCollabRateResult;
  acceptAwarenessUpdate(sessionId: string, userId: string): MemoryCollabRateResult;
  tick(): Promise<void>;
  getEvacuatedArtifact(sessionId: string): Uint8Array | null;
};

export type MemoryCollabRoomOptions = {
  ticketSecret: string;
  nowMs?: () => number;
  ownerUserId?: string;
  onEvacuate?: (sessionId: string, update: Uint8Array) => void | Promise<void>;
  /** grace 脱落時（Worker→Next drop-participant 相当） */
  onParticipantDrop?: (sessionId: string, userId: string) => void | Promise<void>;
  /** 診断用。ticket 平文を渡さないこと */
  log?: (message: string) => void;
};

function pruneWindow(hits: number[], now: number, windowMs: number): number[] {
  return hits.filter((t) => now - t < windowMs);
}

function allowRate(
  hits: number[],
  now: number,
  limit: number,
  windowMs: number,
): { ok: boolean; next: number[] } {
  const next = pruneWindow(hits, now, windowMs);
  if (next.length >= limit) return { ok: false, next };
  next.push(now);
  return { ok: true, next };
}

/**
 * Jest / CI 用のインメモリ DO ルーム。
 * CollabRoomClient 契約 + 接続・TTL・レート制限の振る舞いを再現する。
 */
export function createMemoryCollabRoomClient(
  options: MemoryCollabRoomOptions,
): MemoryCollabRoomClient {
  const rooms = new Map<string, RoomState>();
  const nowMs = options.nowMs ?? (() => Date.now());
  const log = options.log;

  function getOrCreate(sessionId: string): RoomState {
    let room = rooms.get(sessionId);
    if (!room) {
      room = {
        update: null,
        participants: new Map(),
        emptySince: null,
        evacuated: null,
        destroyed: false,
      };
      rooms.set(sessionId, room);
    }
    return room;
  }

  function activeCount(room: RoomState): number {
    let n = 0;
    for (const p of room.participants.values()) {
      if (p.liveSockets > 0) n++;
    }
    return n;
  }

  /** 接続中 + 猶予内の切断枠（上限カウント用） */
  function occupiedSlots(room: RoomState, now: number): number {
    let n = 0;
    for (const p of room.participants.values()) {
      if (p.liveSockets > 0) {
        n++;
        continue;
      }
      if (
        p.disconnectedAt !== null &&
        !p.droppedForGrace &&
        now - p.disconnectedAt < COLLAB_RECONNECT_GRACE_MS
      ) {
        n++;
      }
    }
    return n;
  }

  function dropExpiredGrace(room: RoomState, sessionId: string, now: number): string[] {
    const dropped: string[] = [];
    for (const p of room.participants.values()) {
      if (
        p.liveSockets === 0 &&
        p.disconnectedAt !== null &&
        !p.droppedForGrace &&
        now - p.disconnectedAt >= COLLAB_RECONNECT_GRACE_MS
      ) {
        p.droppedForGrace = true;
        dropped.push(p.userId);
        log?.(`participant-dropped session=${"***"} user=${p.userId}`);
      }
    }
    return dropped;
  }

  async function flushGraceDrops(sessionId: string, room: RoomState): Promise<void> {
    const dropped = dropExpiredGrace(room, sessionId, nowMs());
    for (const userId of dropped) {
      try {
        await options.onParticipantDrop?.(sessionId, userId);
      } catch {
        log?.("participant-drop-failed");
      }
    }
  }

  async function maybeEvacuate(sessionId: string, room: RoomState): Promise<void> {
    const now = nowMs();
    if (room.destroyed) return;
    if (activeCount(room) > 0) {
      room.emptySince = null;
      return;
    }
    if (room.emptySince === null) {
      room.emptySince = now;
      return;
    }
    if (now - room.emptySince < COLLAB_EMPTY_ROOM_TTL_MS) return;
    // 退避失敗でも空文書を正本にしない（失敗≠空 MapDocument 成功・設計 §12.3）
    if (room.update && room.update.byteLength > 0 && !room.evacuated) {
      try {
        await options.onEvacuate?.(sessionId, room.update);
        room.evacuated = room.update;
      } catch {
        log?.("evacuate-failed");
        // evacuated は立てない。空 Uint8Array も成功扱いにしない
      }
    }
    room.destroyed = true;
    room.participants.clear();
    log?.("room-destroyed");
  }

  return {
    async seed(sessionId, yjsUpdate) {
      try {
        const room = getOrCreate(sessionId);
        if (room.destroyed) return { ok: false, reason: "seed-failed" };
        room.update = yjsUpdate;
        room.evacuated = null;
        return { ok: true };
      } catch {
        return { ok: false, reason: "seed-failed" };
      }
    },

    async exportYjsUpdate(sessionId): Promise<CollabRoomExportResult> {
      const room = rooms.get(sessionId);
      if (room?.destroyed) {
        return { ok: false, reason: "export-failed" };
      }
      if (!room?.update || room.update.byteLength === 0) {
        return { ok: false, reason: "export-empty" };
      }
      return { ok: true, value: room.update };
    },

    async getConnectionCount(sessionId) {
      const room = rooms.get(sessionId);
      if (!room || room.destroyed) {
        return { ok: true, value: 0 };
      }
      await flushGraceDrops(sessionId, room);
      return { ok: true, value: occupiedSlots(room, nowMs()) };
    },

    async destroy(sessionId) {
      const room = rooms.get(sessionId);
      if (!room || room.destroyed) return { ok: true };
      room.destroyed = true;
      room.participants.clear();
      log?.("room-destroyed");
      return { ok: true };
    },

    async connect(sessionId, ticket) {
      const now = nowMs();
      const claims = verifyCollabTicket(ticket, options.ticketSecret, now);
      if (!claims || claims.sessionId !== sessionId) {
        log?.("connect-rejected reason=invalid-ticket");
        return { ok: false, reason: "invalid-ticket" };
      }

      const room = getOrCreate(sessionId);
      if (room.destroyed) {
        return { ok: false, reason: "room-gone" };
      }
      await flushGraceDrops(sessionId, room);

      let participant = room.participants.get(claims.userId);
      if (participant && participant.liveSockets > 0) {
        participant.liveSockets += 1;
        log?.(`connect-ok user=${claims.userId} ref=${participant.liveSockets}`);
        return { ok: true, userId: claims.userId };
      }

      const reconnecting =
        participant !== undefined &&
        participant.liveSockets === 0 &&
        participant.disconnectedAt !== null &&
        !participant.droppedForGrace &&
        now - participant.disconnectedAt < COLLAB_RECONNECT_GRACE_MS;

      if (!reconnecting && occupiedSlots(room, now) >= COLLAB_MAX_CONNECTIONS) {
        log?.("connect-rejected reason=too-many-connections");
        return { ok: false, reason: "too-many-connections", status: 429 };
      }

      if (!participant) {
        participant = {
          userId: claims.userId,
          liveSockets: 1,
          disconnectedAt: null,
          droppedForGrace: false,
          docHits: [],
          awarenessHits: [],
        };
        room.participants.set(claims.userId, participant);
      } else {
        participant.liveSockets = 1;
        participant.disconnectedAt = null;
        participant.droppedForGrace = false;
      }
      room.emptySince = null;
      // ownerUserId は参照のみ（切断しても他者継続。特別扱い不要）
      void options.ownerUserId;
      log?.(`connect-ok user=${claims.userId}`);
      return { ok: true, userId: claims.userId };
    },

    disconnect(sessionId, userId) {
      const room = rooms.get(sessionId);
      if (!room) return;
      const participant = room.participants.get(userId);
      if (!participant || participant.liveSockets <= 0) return;
      participant.liveSockets -= 1;
      if (participant.liveSockets > 0) {
        log?.(`disconnect user=${userId} ref=${participant.liveSockets}`);
        return;
      }
      participant.disconnectedAt = nowMs();
      if (activeCount(room) === 0) {
        room.emptySince = nowMs();
      }
      log?.(`disconnect user=${userId}`);
    },

    isActiveParticipant(sessionId, userId) {
      const room = rooms.get(sessionId);
      return (room?.participants.get(userId)?.liveSockets ?? 0) > 0;
    },

    wasDroppedForGrace(sessionId, userId) {
      const room = rooms.get(sessionId);
      if (!room) return false;
      // 同期 API: 脱落を即マークし、通知は best-effort で発火
      const newly = dropExpiredGrace(room, sessionId, nowMs());
      for (const id of newly) {
        void Promise.resolve(options.onParticipantDrop?.(sessionId, id)).catch(() => {
          log?.("participant-drop-failed");
        });
      }
      return room.participants.get(userId)?.droppedForGrace === true;
    },

    acceptDocUpdate(sessionId, userId) {
      const room = rooms.get(sessionId);
      const participant = room?.participants.get(userId);
      if (!room || !participant || participant.liveSockets <= 0) {
        return { ok: false, reason: "not-connected" };
      }
      const now = nowMs();
      const result = allowRate(
        participant.docHits,
        now,
        COLLAB_DOC_UPDATE_LIMIT.limit,
        COLLAB_DOC_UPDATE_LIMIT.windowMs,
      );
      participant.docHits = result.next;
      return result.ok ? { ok: true } : { ok: false, reason: "rate-limited" };
    },

    acceptAwarenessUpdate(sessionId, userId) {
      const room = rooms.get(sessionId);
      const participant = room?.participants.get(userId);
      if (!room || !participant || participant.liveSockets <= 0) {
        return { ok: false, reason: "not-connected" };
      }
      const now = nowMs();
      const result = allowRate(
        participant.awarenessHits,
        now,
        COLLAB_AWARENESS_UPDATE_LIMIT.limit,
        COLLAB_AWARENESS_UPDATE_LIMIT.windowMs,
      );
      participant.awarenessHits = result.next;
      return result.ok ? { ok: true } : { ok: false, reason: "rate-limited" };
    },

    async tick() {
      for (const [sessionId, room] of rooms) {
        await flushGraceDrops(sessionId, room);
        await maybeEvacuate(sessionId, room);
      }
    },

    getEvacuatedArtifact(sessionId) {
      return rooms.get(sessionId)?.evacuated ?? null;
    },
  };
}
