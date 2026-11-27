export type CollabRoomExportResult =
  | { ok: true; value: Uint8Array }
  | { ok: false; reason: "export-failed" | "export-empty" };

export type CollabConnectionCountResult =
  | { ok: true; value: number }
  | { ok: false; reason: "connection-count-failed" };

export type CollabRoomDestroyResult =
  | { ok: true }
  | { ok: false; reason: "destroy-failed" };

/**
 * Durable Object ルームへの境界。Task 3 で実接続。Task 2 はモック注入。
 * ticket / token 平文をログに出さないこと。
 */
export type CollabRoomClient = {
  seed(sessionId: string, yjsUpdate: Uint8Array): Promise<
    { ok: true } | { ok: false; reason: "seed-failed" }
  >;
  exportYjsUpdate(sessionId: string): Promise<CollabRoomExportResult>;
  /**
   * 同時接続数（接続中 + reconnect grace。上限 8）。
   * Worker／ネットワーク失敗は ok:false（fail-closed。0 に倒さない）。
   */
  getConnectionCount(sessionId: string): Promise<CollabConnectionCountResult>;
  /** end 後に全 WS 切断 + ルーム破棄（再接続拒否）。非2xx／例外は destroy-failed */
  destroy(sessionId: string): Promise<CollabRoomDestroyResult>;
};

/** 同時接続上限（設計 §15。超過は 429） */
export const COLLAB_MAX_CONNECTIONS = 8;

/**
 * 設定不足時のプレースホルダ。
 * 本番は `createHttpCollabRoomClient`、Jest は `createMemoryCollabRoomClient` に差し替える。
 */
export function createUnimplementedCollabRoomClient(): CollabRoomClient {
  return {
    async seed() {
      return { ok: false, reason: "seed-failed" };
    },
    async exportYjsUpdate() {
      return { ok: false, reason: "export-failed" };
    },
    async getConnectionCount() {
      return { ok: false, reason: "connection-count-failed" };
    },
    async destroy() {
      return { ok: false, reason: "destroy-failed" };
    },
  };
}
