import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import type {
  MapBackupSnapshot,
  MapFlushResult,
  MapStorageSession,
} from "@/types/mapStorageSession";

const memoryStorage: MapLibraryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  key: () => null,
  length: 0,
};

const EMPTY_DOCUMENT_JSON = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [],
});

/**
 * `/collab/[token]` 参加者用の一時ストレージ。
 * localStorage 正本には書かず、Yjs 同期後の投影を MapEditor が保持する。
 */
export function createCollabJoinStorageSession(token: string): MapStorageSession {
  const mapId = `collab-join:${token.slice(0, 12)}`;
  let body: string | null = EMPTY_DOCUMENT_JSON;
  const flushes = new Set<() => MapFlushResult>();
  const snapshots = new Set<() => MapBackupSnapshot>();

  return {
    mapId,
    sessionNumber: 0,
    storage: memoryStorage,
    readBody: () => ({ ok: true, value: body }),
    writeBody: (json) => {
      body = json;
      return { status: "saved" };
    },
    registerFlush: (flush) => {
      flushes.add(flush);
      return () => {
        flushes.delete(flush);
      };
    },
    registerBackupSnapshot: (snapshot) => {
      snapshots.add(snapshot);
      return () => {
        snapshots.delete(snapshot);
      };
    },
    readBackupSnapshot: () => {
      for (const snapshot of snapshots) return snapshot();
      return null;
    },
    rebaseSnapshot: (json) => {
      body = json;
    },
  };
}
