// テスト専用。本体のコードから import しない。
import {
  decodeMapIndex,
  encodeMapIndex,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
} from "@/services/persistence/mapLibraryStorage";

export type SeedMap = {
  id?: string;
  name?: string;
  json: string | null;
  createdAt?: string;
  updatedAt?: string;
};

const DEFAULT_SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

// インデックスと、json が null でない項目の本体を書く。インデックスを返す。
export function seedMapLibrary(
  storage: Storage,
  maps: readonly SeedMap[],
  options: { currentMapId?: string; legacyCleanupPending?: boolean } = {},
): MapIndexV1 {
  const entries = maps.map((map, i) => ({
    id: map.id ?? `map-${i + 1}`,
    name: map.name ?? `マップ ${i + 1}`,
    createdAt: map.createdAt ?? DEFAULT_SEED_TIMESTAMP,
    updatedAt: map.updatedAt ?? DEFAULT_SEED_TIMESTAMP,
  }));
  const index: MapIndexV1 = {
    version: 1,
    currentMapId: options.currentMapId ?? entries[0].id,
    maps: entries,
    legacyCleanupPending: options.legacyCleanupPending ?? false,
  };
  maps.forEach((map, i) => {
    if (map.json !== null) {
      storage.setItem(mapBodyKey(entries[i].id), map.json);
    }
  });
  storage.setItem(MAP_INDEX_STORAGE_KEY, encodeMapIndex(index));
  return index;
}

// インデックスが無いか、デコードできなければ null を返す。
export function readMapIndex(storage: Storage): MapIndexV1 | null {
  const raw = storage.getItem(MAP_INDEX_STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  const decoded = decodeMapIndex(raw);
  return decoded.kind === "ok" ? decoded.index : null;
}

function readCurrentMapId(storage: Storage): string | null {
  return readMapIndex(storage)?.currentMapId ?? null;
}

export function readActiveMapJson(storage: Storage): string | null {
  const id = readCurrentMapId(storage);
  return id === null ? null : storage.getItem(mapBodyKey(id));
}

export function activeMapBodyKey(storage: Storage): string {
  const id = readCurrentMapId(storage);
  if (id === null) {
    throw new Error("マップのインデックスがありません。");
  }
  return mapBodyKey(id);
}

export type StorageOperation =
  | { type: "setItem"; key: string; value: string }
  | { type: "removeItem"; key: string };

function storedSize(data: ReadonlyMap<string, string>): number {
  let size = 0;
  for (const [key, value] of data) {
    size += key.length + value.length;
  }
  return size;
}

// 本物の Storage と同じ形（length・key・null を返す getItem・clear）で、
// 失敗させた書き込みは値を変えず例外（既定は QuotaExceededError、failSetItemError で名前を変える）を投げる。
// capacity を指定すると、書き込んだ後のキーと値の文字数の合計がそれを超える書き込みを
// QuotaExceededError で失敗させる。operations には成否にかかわらず試みた書き込みを順に記録する。
export function createRecordingStorage(
  options: {
    initial?: Record<string, string>;
    failSetItem?: (key: string, value: string) => boolean;
    failSetItemError?: string;
    capacity?: number;
    failRemoveItem?: (key: string) => boolean;
    failGetItem?: boolean;
    beforeRemoveItem?: (key: string) => void;
  } = {},
): {
  storage: Storage;
  operations: StorageOperation[];
  entries: () => Record<string, string>;
} {
  const data = new Map<string, string>(Object.entries(options.initial ?? {}));
  const operations: StorageOperation[] = [];
  const storage: Storage = {
    get length() {
      return data.size;
    },
    key(i) {
      return [...data.keys()][i] ?? null;
    },
    getItem(key) {
      if (options.failGetItem) {
        throw new DOMException("blocked", "SecurityError");
      }
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      operations.push({ type: "setItem", key, value });
      if (options.failSetItem?.(key, value)) {
        throw new DOMException("failed", options.failSetItemError ?? "QuotaExceededError");
      }
      if (options.capacity !== undefined) {
        const next = new Map(data);
        next.set(key, value);
        if (storedSize(next) > options.capacity) {
          throw new DOMException("full", "QuotaExceededError");
        }
      }
      data.set(key, value);
    },
    removeItem(key) {
      operations.push({ type: "removeItem", key });
      options.beforeRemoveItem?.(key);
      if (options.failRemoveItem?.(key)) {
        throw new DOMException("blocked", "SecurityError");
      }
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
  return { storage, operations, entries: () => Object.fromEntries(data) };
}
