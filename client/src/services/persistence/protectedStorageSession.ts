import type { MapStorageSession } from "@/types/mapStorageSession";

// 保護モードのセッション。どこにも書かず、最初に渡された内容だけを返す。
export function createProtectedStorageSession(
  mapId: string,
  initialJson: string | null,
): MapStorageSession {
  return {
    mapId,
    readBody: () => ({ ok: true, value: initialJson }),
    writeBody: () => ({ status: "inactive" }),
    registerFlush: () => () => {},
  };
}
