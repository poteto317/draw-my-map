import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import type { MapStorageSession } from "@/types/mapStorageSession";

const noopProtectedStorage: MapLibraryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  key: () => null,
  length: 0,
};

// 保護モードのセッション。どこにも書かず、最初に渡された内容だけを返す。
export function createProtectedStorageSession(
  mapId: string,
  initialJson: string | null,
): MapStorageSession {
  return {
    mapId,
    sessionNumber: 0,
    storage: noopProtectedStorage,
    readBody: () => ({ ok: true, value: initialJson }),
    writeBody: () => ({ status: "inactive" }),
    registerFlush: () => () => {},
    registerBackupSnapshot: () => () => {},
    readBackupSnapshot: () => null,
    rebaseSnapshot: () => {},
  };
}
