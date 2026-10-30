import {
  findMapEntry,
  pickUnusedMapId,
  sortMapEntriesForDisplay,
  type MapIndexEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import {
  hasMapBody,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { OperationNotice } from "@/types/operationNotice";

// useMapLibrary が持つ状態と、そこから導く表示用の値・操作の結果。React に依存しない

export type MapLibraryView =
  | { status: "loading" }
  | {
      status: "ready";
      storageMode: "persistent" | "protected";
      maps: readonly MapIndexEntry[]; // 表示順
      currentMap: MapIndexEntry;
      storageSession: MapStorageSession;
      startupNotice: OperationNotice | null;
    };

export type MapLibraryOperationResult =
  | {
      ok: true;
      remounted: boolean;
      notice: OperationNotice | null;
      saveRetryNotice: OperationNotice | null;
    }
  | { ok: false; notice: OperationNotice };

// 起動の結果から作る、シェルが持つ状態。セッションは (currentMapId, セッション番号) ごとに作り直す。
// セッション番号は useMapLibrary の ref だけが持ち、session の writeBody・registerFlush が閉じ込める
export type LibraryState =
  | {
      mode: "persistent";
      storage: MapLibraryStorage;
      index: MapIndexV1;
      session: MapStorageSession;
      startupNotice: OperationNotice | null;
    }
  | {
      mode: "protected";
      entry: MapIndexEntry;
      session: MapStorageSession;
      startupNotice: OperationNotice;
    };

export type PersistentLibraryState = Extract<LibraryState, { mode: "persistent" }>;

export const UNCHANGED_OPERATION_RESULT: MapLibraryOperationResult = {
  ok: true,
  remounted: false,
  notice: null,
  saveRetryNotice: null,
};

export function succeededOperation(
  notice: OperationNotice,
  remounted: boolean,
): MapLibraryOperationResult {
  return { ok: true, remounted, notice, saveRetryNotice: null };
}

export function failedOperation(notice: OperationNotice): MapLibraryOperationResult {
  return { ok: false, notice };
}

export function toMapLibraryView(library: LibraryState | null): MapLibraryView {
  if (library === null) return { status: "loading" };
  if (library.mode === "protected") {
    return {
      status: "ready",
      storageMode: "protected",
      maps: [library.entry],
      currentMap: library.entry,
      storageSession: library.session,
      startupNotice: library.startupNotice,
    };
  }
  const currentMap = findMapEntry(library.index, library.index.currentMapId);
  if (currentMap === null) {
    // decodeMapIndex と更新関数が currentMapId を maps の id に保つ
    throw new Error("現在のマップがインデックスにありません。");
  }
  return {
    status: "ready",
    storageMode: "persistent",
    maps: sortMapEntriesForDisplay(library.index.maps),
    currentMap,
    storageSession: library.session,
    startupNotice: library.startupNotice,
  };
}

// 新しいマップの id。インデックスの id と、本体が残っている id（孤立した本体）を使用済みとして避ける
export function pickNewMapId(
  storage: MapLibraryStorage,
  index: MapIndexV1,
  generateId: () => string,
): string | null {
  return pickUnusedMapId(
    generateId,
    (candidate) => findMapEntry(index, candidate) !== null || hasMapBody(storage, candidate),
  );
}
