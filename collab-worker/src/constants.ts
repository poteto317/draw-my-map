/**
 * 接続ポリシー定数。
 * client 正本: `client/src/domain/collab/collabRoomPolicy.ts`（EMPTY TTL / DOC・AWARENESS rate）
 * 再接続猶予正本: `client/src/domain/collab/collabConnectionTypes.ts`
 * 変更時は client 側も同じ値にし、`collabRoomPolicy.sync.test.ts` が通ることを確認する。
 */

/** 同時接続上限（設計 §15。超過は 429） */
export const COLLAB_MAX_CONNECTIONS = 8;

/** 切断後の再接続猶予 */
export const COLLAB_RECONNECT_GRACE_MS = 2 * 60 * 1000;

/** 全員切断後の成果物退避 TTL（client domain/collab/collabRoomPolicy と同期） */
export const COLLAB_EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

export const COLLAB_DOC_UPDATE_LIMIT = { limit: 40, windowMs: 1_000 } as const;
export const COLLAB_AWARENESS_UPDATE_LIMIT = { limit: 20, windowMs: 1_000 } as const;

export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;
