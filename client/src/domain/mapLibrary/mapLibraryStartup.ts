import {
  parseMapDocumentJsonWithVersion,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import type { OperationNotice } from "@/types/operationNotice";
import {
  createMapIndexEntry,
  createSingleMapIndex,
  decodeMapIndex,
  isValidMapId,
  pickUnusedMapId,
  sortMapEntriesForDisplay,
  withLegacyCleanupPending,
  type MapIndexV1,
} from "./mapIndex";
import { DEFAULT_MAP_NAME } from "./mapName";

export type MapLibraryStartupSnapshot =
  | { kind: "unavailable" }
  | {
      kind: "available";
      indexRaw: string | null;
      legacyRaw: string | null;
      bodyIds: readonly string[];
    };

export type MapLibraryStartupDeps = {
  now: () => Date;
  generateId: () => string;
};

export type ProtectedStartup = {
  mapId: string;
  initialJson: string | null;
  notice: OperationNotice;
};

export type MapLibraryStartupPlan =
  | { kind: "protected"; protectedStartup: ProtectedStartup }
  | { kind: "open"; index: MapIndexV1 }
  | { kind: "cleanupLegacy"; index: MapIndexV1; cleanedIndex: MapIndexV1 }
  | {
      kind: "initialize";
      index: MapIndexV1;
      notice: OperationNotice | null;
      onFailure: ProtectedStartup;
    }
  | {
      kind: "migrate";
      bodyId: string;
      bodyJson: string;
      index: MapIndexV1;
      // 本体かインデックスの書き込みが容量不足のときに、旧キーを消してやり直す場合のインデックス（P: false）
      retryIndex: MapIndexV1;
      // やり直しが失敗したときに書き戻す旧キーの元の文字列
      legacyRaw: string;
      onFailure: ProtectedStartup;
      // やり直しで消した旧キーを書き戻せなかったとき
      onLegacyLost: ProtectedStartup;
    }
  | {
      kind: "rebuild";
      corruptRaw: string;
      index: MapIndexV1;
      notice: OperationNotice;
      onFailure: ProtectedStartup;
    };

type AvailableSnapshot = Extract<MapLibraryStartupSnapshot, { kind: "available" }>;

const RESTORED_MAP_NAME_PREFIX = "復元したマップ";

const UNAVAILABLE_WARNING =
  "ブラウザの保存領域を使えないため、このマップは保存されません。必要な場合はJSONで書き出してください。";
const INITIALIZE_FAILURE =
  "ブラウザに保存できないため、このマップは保存されません。必要な場合はJSONで書き出してください。";
const MIGRATE_FAILURE =
  "以前の保存データを新しい形式へ移行できませんでした。この画面での変更は保存されません。必要な場合はJSONで書き出してください。";
const MIGRATE_LEGACY_LOST_FAILURE =
  "以前の保存データを新しい形式へ移行できず、ブラウザにも残せませんでした。この画面での変更は保存されません。ページを閉じる前に、JSONで書き出してください。";
const LEGACY_CORRUPT_WARNING =
  "以前の保存データを読み込めなかったため、空のマップで開始します。以前の保存データは消さずに残しています。";
const LEGACY_CORRUPT_FAILURE =
  "以前の保存データを読み込めず、ブラウザにも保存できないため、このマップは保存されません。以前の保存データは消さずに残しています。";
const REBUILD_WARNING =
  "マップの一覧を読み取れなかったため、保存済みのマップから一覧を作り直しました。マップ名は「復元したマップ」になっています。";
const REBUILD_EMPTY_WARNING =
  "マップの一覧を読み取れなかったため、空のマップで開始します。";
const REBUILD_FAILURE =
  "マップの一覧を読み取れませんでした。保存データを守るため、この画面での変更は保存されません。";

// 保護モードの id はどこにも書かないため、孤立した本体との一致を確かめない。
function createProtectedStartup(
  deps: MapLibraryStartupDeps,
  initialJson: string | null,
  notice: OperationNotice,
): ProtectedStartup {
  return { mapId: deps.generateId(), initialJson, notice };
}

function toProtectedPlan(protectedStartup: ProtectedStartup): MapLibraryStartupPlan {
  return { kind: "protected", protectedStartup };
}

// 「無題のマップ」1件のインデックス。id は残っている本体と重ならないものを選び、決められなければ null。
// 本体は書かない（移行では計画の bodyJson を runner がこの id へ書く）。
function createUntitledIndex(
  snapshot: AvailableSnapshot,
  deps: MapLibraryStartupDeps,
  legacyCleanupPending: boolean,
): MapIndexV1 | null {
  const id = pickUnusedMapId(deps.generateId, (candidate) =>
    snapshot.bodyIds.includes(candidate),
  );
  if (id === null) {
    return null;
  }
  const entry = createMapIndexEntry(id, DEFAULT_MAP_NAME, deps.now().toISOString());
  return createSingleMapIndex(entry, legacyCleanupPending);
}

function planInitialize(
  snapshot: AvailableSnapshot,
  deps: MapLibraryStartupDeps,
  notice: OperationNotice | null,
  failureMessage: string,
): MapLibraryStartupPlan {
  const index = createUntitledIndex(snapshot, deps, false);
  const onFailure = createProtectedStartup(deps, null, {
    kind: "error",
    message: failureMessage,
  });
  if (index === null) {
    return toProtectedPlan(onFailure);
  }
  return { kind: "initialize", index, notice, onFailure };
}

// 旧キーの書き込み・削除は計画に入れない。後始末は原則として次の起動の cleanupLegacy が行う。
// 例外は、本体かインデックスの書き込みが容量不足で失敗したときに writeMigratedMap が行うやり直し
// （旧キーを消して書き直し、失敗したら legacyRaw を書き戻す）で、そのための値だけをここで用意する。
function planFromLegacy(
  snapshot: AvailableSnapshot,
  legacyRaw: string,
  deps: MapLibraryStartupDeps,
): MapLibraryStartupPlan {
  const parsed = parseMapDocumentJsonWithVersion(legacyRaw);
  if (!parsed.ok) {
    return planInitialize(
      snapshot,
      deps,
      { kind: "warning", message: LEGACY_CORRUPT_WARNING },
      LEGACY_CORRUPT_FAILURE,
    );
  }

  const index = createUntitledIndex(snapshot, deps, true);
  const onFailure = createProtectedStartup(deps, legacyRaw, {
    kind: "error",
    message: MIGRATE_FAILURE,
  });
  if (index === null) {
    return toProtectedPlan(onFailure);
  }
  return {
    kind: "migrate",
    bodyId: index.currentMapId,
    bodyJson: serializeMapDocument(parsed.value.document),
    index,
    retryIndex: withLegacyCleanupPending(index, false),
    legacyRaw,
    onFailure,
    onLegacyLost: {
      ...onFailure,
      notice: { kind: "error", message: MIGRATE_LEGACY_LOST_FAILURE },
    },
  };
}

// 残っている本体を id の昇順に「復元したマップ N」として並べる。本体の中身は読まない。
function createRestoredIndex(
  bodyIds: readonly string[],
  nowIso: string,
): MapIndexV1 | null {
  const ids = [...new Set(bodyIds.filter(isValidMapId))].sort();
  if (ids.length === 0) {
    return null;
  }
  const maps = ids.map((id, position) =>
    createMapIndexEntry(id, `${RESTORED_MAP_NAME_PREFIX} ${position + 1}`, nowIso),
  );
  return {
    version: 1,
    currentMapId: sortMapEntriesForDisplay(maps)[0].id,
    maps,
    legacyCleanupPending: false,
  };
}

// 旧キーの有無や状態にかかわらず、移行はやり直さず旧キーにも触れない。
function planRebuild(
  snapshot: AvailableSnapshot,
  corruptRaw: string,
  deps: MapLibraryStartupDeps,
): MapLibraryStartupPlan {
  const restored = createRestoredIndex(snapshot.bodyIds, deps.now().toISOString());
  const index = restored ?? createUntitledIndex(snapshot, deps, false);
  const onFailure = createProtectedStartup(deps, null, {
    kind: "error",
    message: REBUILD_FAILURE,
  });
  if (index === null) {
    return toProtectedPlan(onFailure);
  }
  return {
    kind: "rebuild",
    corruptRaw,
    index,
    notice: {
      kind: "warning",
      message: restored === null ? REBUILD_EMPTY_WARNING : REBUILD_WARNING,
    },
    onFailure,
  };
}

export function planMapLibraryStartup(
  snapshot: MapLibraryStartupSnapshot,
  deps: MapLibraryStartupDeps,
): MapLibraryStartupPlan {
  if (snapshot.kind === "unavailable") {
    return toProtectedPlan(
      createProtectedStartup(deps, null, {
        kind: "warning",
        message: UNAVAILABLE_WARNING,
      }),
    );
  }

  if (snapshot.indexRaw !== null) {
    const decoded = decodeMapIndex(snapshot.indexRaw);
    if (decoded.kind === "corrupt") {
      return planRebuild(snapshot, snapshot.indexRaw, deps);
    }
    // 補正が必要だったインデックスも、ここでは書き直さずにそのまま開く。
    if (!decoded.index.legacyCleanupPending) {
      return { kind: "open", index: decoded.index };
    }
    return {
      kind: "cleanupLegacy",
      index: decoded.index,
      cleanedIndex: withLegacyCleanupPending(decoded.index, false),
    };
  }

  if (snapshot.legacyRaw === null) {
    return planInitialize(snapshot, deps, null, INITIALIZE_FAILURE);
  }
  return planFromLegacy(snapshot, snapshot.legacyRaw, deps);
}
