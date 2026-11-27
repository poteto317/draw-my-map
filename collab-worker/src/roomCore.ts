import {
  COLLAB_EMPTY_ROOM_TTL_MS,
  COLLAB_MAX_CONNECTIONS,
  COLLAB_RECONNECT_GRACE_MS,
} from "./constants.js";

export type RoomConnectResult =
  | { ok: true; userId: string; reconnecting: boolean }
  | { ok: false; reason: "too-many-connections"; status: 429 }
  | { ok: false; reason: "room-gone" };

type Participant = {
  userId: string;
  /** 同一 userId のライブ WS 数（参照カウント） */
  liveSockets: number;
  disconnectedAt: number | null;
  droppedForGrace: boolean;
};

/**
 * 接続枠・再接続猶予・空室 TTL の純粋ロジック（DO / memory mock で共有する契約）。
 * Yjs 文書本体は呼び出し側が持つ。
 */
export class RoomConnectionCore {
  private readonly participants = new Map<string, Participant>();
  private emptySince: number | null = null;
  private destroyed = false;

  constructor(private readonly nowMs: () => number = () => Date.now()) {}

  isDestroyed(): boolean {
    return this.destroyed;
  }

  activeCount(): number {
    let n = 0;
    for (const p of this.participants.values()) {
      if (p.liveSockets > 0) n++;
    }
    return n;
  }

  occupiedSlots(): number {
    const now = this.nowMs();
    this.dropExpiredGrace();
    let n = 0;
    for (const p of this.participants.values()) {
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

  connect(userId: string): RoomConnectResult {
    if (this.destroyed) return { ok: false, reason: "room-gone" };
    this.dropExpiredGrace();
    const now = this.nowMs();
    let participant = this.participants.get(userId);

    if (participant && participant.liveSockets > 0) {
      participant.liveSockets += 1;
      return { ok: true, userId, reconnecting: false };
    }

    const reconnecting =
      participant !== undefined &&
      participant.liveSockets === 0 &&
      participant.disconnectedAt !== null &&
      !participant.droppedForGrace &&
      now - participant.disconnectedAt < COLLAB_RECONNECT_GRACE_MS;

    if (!reconnecting && this.occupiedSlots() >= COLLAB_MAX_CONNECTIONS) {
      return { ok: false, reason: "too-many-connections", status: 429 };
    }

    if (!participant) {
      participant = {
        userId,
        liveSockets: 1,
        disconnectedAt: null,
        droppedForGrace: false,
      };
      this.participants.set(userId, participant);
    } else {
      participant.liveSockets = 1;
      participant.disconnectedAt = null;
      participant.droppedForGrace = false;
    }
    this.emptySince = null;
    return { ok: true, userId, reconnecting };
  }

  /**
   * ソケット 1 本分を減らす。liveSockets が残れば参加者は接続中のまま。
   * @returns 参加者として完全切断したか
   */
  disconnect(userId: string): boolean {
    const participant = this.participants.get(userId);
    if (!participant || participant.liveSockets <= 0) return false;
    participant.liveSockets -= 1;
    if (participant.liveSockets > 0) {
      return false;
    }
    participant.disconnectedAt = this.nowMs();
    if (this.activeCount() === 0) {
      this.emptySince = this.nowMs();
    }
    return true;
  }

  wasDroppedForGrace(userId: string): boolean {
    this.dropExpiredGrace();
    return this.participants.get(userId)?.droppedForGrace === true;
  }

  isConnected(userId: string): boolean {
    return (this.participants.get(userId)?.liveSockets ?? 0) > 0;
  }

  /**
   * 空室 TTL 超過なら true（呼び出し側が成果物退避して destroy）。
   */
  shouldEvacuate(): boolean {
    if (this.destroyed) return false;
    if (this.activeCount() > 0) {
      this.emptySince = null;
      return false;
    }
    if (this.emptySince === null) {
      this.emptySince = this.nowMs();
      return false;
    }
    return this.nowMs() - this.emptySince >= COLLAB_EMPTY_ROOM_TTL_MS;
  }

  markDestroyed(): void {
    this.destroyed = true;
    this.participants.clear();
  }

  private dropExpiredGrace(): void {
    const now = this.nowMs();
    for (const p of this.participants.values()) {
      if (
        p.liveSockets === 0 &&
        p.disconnectedAt !== null &&
        !p.droppedForGrace &&
        now - p.disconnectedAt >= COLLAB_RECONNECT_GRACE_MS
      ) {
        p.droppedForGrace = true;
      }
    }
  }
}
