import type { MapIndexEntry, MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import type { MapTrashEntry } from "@/domain/mapLibrary/mapTrash";
import {
  failedOperation,
  failedPermanentDeleteOperation,
  isActiveBranchMoveSource,
  isSameTrashState,
  succeededOperation,
  toMapLibraryView,
  UNCHANGED_OPERATION_RESULT,
} from "@/hooks/mapLibraryState";
import { createTestStorageSession } from "@/testing/createTestStorageSession";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";

function entry(id: string, updatedAt: string): MapIndexEntry {
  return { id, name: `名前-${id}`, createdAt: "2026-01-01T00:00:00.000Z", updatedAt };
}

const OLDER = entry("older", "2026-01-01T00:00:00.000Z");
const NEWER = entry("newer", "2026-02-01T00:00:00.000Z");

function indexOf(currentMapId: string, maps: MapIndexEntry[]): MapIndexV1 {
  return { version: 1, currentMapId, maps, legacyCleanupPending: false };
}

describe("isActiveBranchMoveSource", () => {
  const { storage } = createRecordingStorage();
  const session = createTestStorageSession().session;
  const persistent = {
    mode: "persistent" as const,
    storage,
    index: indexOf("older", [OLDER]),
    session,
    startupNotice: null,
    trash: { status: "ok" as const, entries: [] },
  };

  it("開いているセッションなら true", () => {
    expect(isActiveBranchMoveSource(persistent, session)).toBe(true);
  });

  it("別のセッション・起動前・保護モードは false", () => {
    expect(isActiveBranchMoveSource(persistent, createTestStorageSession().session)).toBe(false);
    expect(isActiveBranchMoveSource(null, session)).toBe(false);
    expect(isActiveBranchMoveSource({ mode: "protected", entry: OLDER, session, startupNotice: { kind: "error", message: "保護" } }, session)).toBe(false);
  });
});

describe("toMapLibraryView", () => {
  it("起動前（null）は loading を返す", () => {
    expect(toMapLibraryView(null)).toEqual({ status: "loading" });
  });

  it("通常のモードは一覧を表示順（更新日時の新しい順）に並べ、現在のマップとゴミ箱状態を返す", () => {
    const { storage } = createRecordingStorage();
    const session = createTestStorageSession().session;
    const notice = { kind: "warning" as const, message: "起動時の通知" };
    const trashEntry: MapTrashEntry = {
      id: "deleted-1",
      originalMapId: "deleted-1",
      name: "削除済み",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      deletedAt: "2026-02-01T00:00:00.000Z",
      expiresAt: "2026-03-03T00:00:00.000Z",
      hasBody: true,
    };

    const view = toMapLibraryView({
      mode: "persistent",
      storage,
      index: indexOf("older", [OLDER, NEWER]),
      session,
      startupNotice: notice,
      trash: { status: "ok", entries: [trashEntry] },
    });

    expect(view).toEqual({
      status: "ready",
      storageMode: "persistent",
      maps: [NEWER, OLDER],
      currentMap: OLDER,
      storageSession: session,
      startupNotice: notice,
      trashEntries: [trashEntry],
      trashStatus: "ok",
    });
  });

  it("ゴミ箱が破損しているときは trashStatus を corrupt・trashEntries を空配列にする", () => {
    const { storage } = createRecordingStorage();
    const session = createTestStorageSession().session;

    const view = toMapLibraryView({
      mode: "persistent",
      storage,
      index: indexOf("older", [OLDER]),
      session,
      startupNotice: null,
      trash: { status: "corrupt" },
    });

    expect(view).toEqual({
      status: "ready",
      storageMode: "persistent",
      maps: [OLDER],
      currentMap: OLDER,
      storageSession: session,
      startupNotice: null,
      trashEntries: [],
      trashStatus: "corrupt",
    });
  });

  it("保護モードは1件だけの一覧と、そのマップを現在のマップとして返し、ゴミ箱は空の ok とする", () => {
    const session = createTestStorageSession().session;
    const notice = { kind: "warning" as const, message: "保存されません" };

    expect(toMapLibraryView({ mode: "protected", entry: OLDER, session, startupNotice: notice })).toEqual({
      status: "ready",
      storageMode: "protected",
      maps: [OLDER],
      currentMap: OLDER,
      storageSession: session,
      startupNotice: notice,
      trashEntries: [],
      trashStatus: "ok",
    });
  });

  it("現在のマップがインデックスに無い状態は例外にする", () => {
    const { storage } = createRecordingStorage();

    expect(() => toMapLibraryView({
      mode: "persistent",
      storage,
      index: indexOf("missing", [OLDER]),
      session: createTestStorageSession().session,
      startupNotice: null,
      trash: { status: "ok", entries: [] },
    })).toThrow("現在のマップがインデックスにありません。");
  });
});

describe("操作の結果", () => {
  it("UNCHANGED_OPERATION_RESULT は再マウントも通知もしない成功", () => {
    expect(UNCHANGED_OPERATION_RESULT).toEqual({
      ok: true,
      remounted: false,
      notice: null,
      saveRetryNotice: null,
    });
  });

  it("succeededOperation は通知と再マウントの有無を持ち、保存の再試行の通知は持たない", () => {
    const notice = { kind: "status" as const, message: "作成しました" };

    expect(succeededOperation(notice, true)).toEqual({
      ok: true,
      remounted: true,
      notice,
      saveRetryNotice: null,
    });
  });

  it("failedOperation は通知だけを持つ失敗", () => {
    const notice = { kind: "error" as const, message: "失敗しました" };

    expect(failedOperation(notice)).toEqual({ ok: false, notice });
  });

  it("failedPermanentDeleteOperation は canPermanentDelete: true を持つ失敗", () => {
    const notice = { kind: "error" as const, message: "ゴミ箱に入れられません" };

    expect(failedPermanentDeleteOperation(notice)).toEqual({
      ok: false,
      notice,
      canPermanentDelete: true,
    });
  });
});

describe("isSameTrashState", () => {
  const sample: MapTrashEntry = {
    id: "t-1",
    originalMapId: "t-1",
    name: "削除済み",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    deletedAt: "2026-02-01T00:00:00.000Z",
    expiresAt: "2026-03-03T00:00:00.000Z",
    hasBody: true,
  };

  it("同じステータス・同じエントリ配列なら true、異なれば false を返す", () => {
    expect(isSameTrashState({ status: "corrupt" }, { status: "corrupt" })).toBe(true);
    expect(isSameTrashState({ status: "corrupt" }, { status: "ok", entries: [] })).toBe(false);
    expect(
      isSameTrashState(
        { status: "ok", entries: [sample] },
        { status: "ok", entries: [{ ...sample }] },
      ),
    ).toBe(true);
    expect(
      isSameTrashState(
        { status: "ok", entries: [sample] },
        { status: "ok", entries: [{ ...sample, name: "変更" }] },
      ),
    ).toBe(false);
    expect(
      isSameTrashState(
        { status: "ok", entries: [sample] },
        { status: "ok", entries: [] },
      ),
    ).toBe(false);
  });
});
