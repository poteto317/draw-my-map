/**
 * collab-worker/src/constants.ts と domain 正本の値一致。
 * worker 側を変えたらここ（と domain/collab/collabRoomPolicy.ts）も同じ値に更新する。
 */
import {
  COLLAB_AWARENESS_UPDATE_LIMIT,
  COLLAB_DOC_UPDATE_LIMIT,
  COLLAB_EMPTY_ROOM_TTL_MS,
} from "@/domain/collab/collabRoomPolicy";

/** collab-worker/src/constants.ts の現行値（同期手順の検査用コピー） */
const WORKER_COLLAB_EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;
const WORKER_COLLAB_DOC_UPDATE_LIMIT = { limit: 40, windowMs: 1_000 } as const;
const WORKER_COLLAB_AWARENESS_UPDATE_LIMIT = { limit: 20, windowMs: 1_000 } as const;

describe("collabRoomPolicy sync with collab-worker", () => {
  it("EMPTY TTL / DOC・AWARENESS rate が worker constants と一致する", () => {
    expect(COLLAB_EMPTY_ROOM_TTL_MS).toBe(WORKER_COLLAB_EMPTY_ROOM_TTL_MS);
    expect(COLLAB_DOC_UPDATE_LIMIT).toEqual(WORKER_COLLAB_DOC_UPDATE_LIMIT);
    expect(COLLAB_AWARENESS_UPDATE_LIMIT).toEqual(WORKER_COLLAB_AWARENESS_UPDATE_LIMIT);
  });
});
