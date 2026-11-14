import {
  findMapEntry,
  sortMapEntriesForDisplay,
  type MapIndexEntry,
  type MapIndexV1,
} from "@/domain/mapLibrary/mapIndex";
import type { MapTrashEntry, MapTrashState } from "@/domain/mapLibrary/mapTrash";
import type { MapLibraryStorage } from "@/services/persistence/mapLibraryStorage";
import type { MapStorageSession } from "@/types/mapStorageSession";
import type { LibraryBackupV1 } from "@/domain/mapLibrary/libraryBackupCodec";
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
      trashEntries: readonly MapTrashEntry[];
      trashStatus: "ok" | "corrupt";
    };

export type MapLibraryOperationResult =
  | {
      ok: true;
      remounted: boolean;
      notice: OperationNotice | null;
      saveRetryNotice: OperationNotice | null;
    }
  // enteredProtectedMode: 操作の失敗で保護モードへ移った（編集画面は作り直される）
  // canPermanentDelete: ゴミ箱移動不可（容量不足・ゴミ箱破損等）時に完全削除フォールバックを提示できる
  | {
      ok: false;
      notice: OperationNotice;
      enteredProtectedMode?: true;
      canPermanentDelete?: boolean;
    };

// 起動の結果から作る、シェルが持つ状態。セッションは (currentMapId, セッション番号) ごとに作り直す。
// セッション番号は useMapLibrary の ref だけが持ち、session の writeBody・registerFlush が閉じ込める
export type LibraryState =
  | {
      mode: "persistent";
      storage: MapLibraryStorage;
      index: MapIndexV1;
      session: MapStorageSession;
      startupNotice: OperationNotice | null;
      trash: MapTrashState;
    }
  | {
      mode: "protected";
      entry: MapIndexEntry;
      session: MapStorageSession;
      startupNotice: OperationNotice;
    };

export type PersistentLibraryState = Extract<LibraryState, { mode: "persistent" }>;

export type LibraryRestorePreview = {
  backup: LibraryBackupV1;
  indexRaw: string;
  session: MapStorageSession;
};

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

export function failedPermanentDeleteOperation(
  notice: OperationNotice,
): MapLibraryOperationResult {
  return { ok: false, notice, canPermanentDelete: true };
}

// 枝の移動を始めたセッションが今も開いているか。flush の再入や切り替えの後は移動しない
export function isActiveBranchMoveSource(
  library: LibraryState | null,
  session: MapStorageSession,
): library is PersistentLibraryState {
  return library?.mode === "persistent" && library.session === session;
}

export function protectedModeFailure(notice: OperationNotice): MapLibraryOperationResult {
  return { ok: false, notice, enteredProtectedMode: true };
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
      trashEntries: [],
      trashStatus: "ok",
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
    trashEntries: library.trash.status === "ok" ? library.trash.entries : [],
    trashStatus: library.trash.status,
  };
}

export function isSameTrashState(a: MapTrashState, b: MapTrashState): boolean {
  if (a.status !== b.status) return false;
  if (a.status === "corrupt" || b.status === "corrupt") return true;
  if (a.entries.length !== b.entries.length) return false;
  return a.entries.every((entry, index) => {
    const other = b.entries[index];
    return (
      entry.id === other.id &&
      entry.originalMapId === other.originalMapId &&
      entry.name === other.name &&
      entry.createdAt === other.createdAt &&
      entry.updatedAt === other.updatedAt &&
      entry.deletedAt === other.deletedAt &&
      entry.expiresAt === other.expiresAt &&
      entry.hasBody === other.hasBody
    );
  });
}
