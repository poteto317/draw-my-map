/**
 * 接続ポリシー型・再接続猶予は domain 正本。
 * ここはサービス層向けの再エクスポート。
 */
export {
  COLLAB_RECONNECT_GRACE_MS,
  type CollabConnectionState,
} from "@/domain/collab/collabConnectionTypes";

export {
  COLLAB_AWARENESS_UPDATE_LIMIT,
  COLLAB_DOC_UPDATE_LIMIT,
  COLLAB_EMPTY_ROOM_TTL_MS,
} from "@/domain/collab/collabRoomPolicy";

export type { CollabTicketClaims } from "@/domain/collab/collabApiDto";
