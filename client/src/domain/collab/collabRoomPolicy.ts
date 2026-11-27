/**
 * 共同編集ルームの接続ポリシー正本（client / collab-worker で値を一致させる）。
 *
 * collab-worker 側: `collab-worker/src/constants.ts`
 * 変更時は両方を同じ値にし、`collabRoomPolicy.sync.test.ts` が通ることを確認する。
 */

/** 全員切断後、成果物退避してルーム破棄するまでの TTL */
export const COLLAB_EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

/** 文書更新のレート制限（接続あたり） */
export const COLLAB_DOC_UPDATE_LIMIT = { limit: 40, windowMs: 1_000 } as const;

/** awareness 更新のレート制限（接続あたり） */
export const COLLAB_AWARENESS_UPDATE_LIMIT = { limit: 20, windowMs: 1_000 } as const;
