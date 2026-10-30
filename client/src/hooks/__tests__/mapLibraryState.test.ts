import type { MapIndexEntry, MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import {
  failedOperation,
  pickNewMapId,
  succeededOperation,
  toMapLibraryView,
  UNCHANGED_OPERATION_RESULT,
} from "@/hooks/mapLibraryState";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
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

describe("toMapLibraryView", () => {
  it("起動前（null）は loading を返す", () => {
    expect(toMapLibraryView(null)).toEqual({ status: "loading" });
  });

  it("通常のモードは一覧を表示順（更新日時の新しい順）に並べ、現在のマップを引く", () => {
    const { storage } = createRecordingStorage();
    const session = createTestStorageSession().session;
    const notice = { kind: "warning" as const, message: "起動時の通知" };

    const view = toMapLibraryView({
      mode: "persistent",
      storage,
      index: indexOf("older", [OLDER, NEWER]),
      session,
      startupNotice: notice,
    });

    expect(view).toEqual({
      status: "ready",
      storageMode: "persistent",
      maps: [NEWER, OLDER],
      currentMap: OLDER,
      storageSession: session,
      startupNotice: notice,
    });
  });

  it("保護モードは1件だけの一覧と、そのマップを現在のマップとして返す", () => {
    const session = createTestStorageSession().session;
    const notice = { kind: "warning" as const, message: "保存されません" };

    expect(toMapLibraryView({ mode: "protected", entry: OLDER, session, startupNotice: notice })).toEqual({
      status: "ready",
      storageMode: "protected",
      maps: [OLDER],
      currentMap: OLDER,
      storageSession: session,
      startupNotice: notice,
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
});

describe("pickNewMapId", () => {
  it("インデックスにある id と、本体だけが残っている id を避ける", () => {
    const { storage } = createRecordingStorage({ initial: { [mapBodyKey("orphan")]: "{}" } });
    const ids = ["older", "orphan", "fresh"];
    const generateId = jest.fn(() => ids.shift()!);

    expect(pickNewMapId(storage, indexOf("older", [OLDER]), generateId)).toBe("fresh");
    expect(generateId).toHaveBeenCalledTimes(3);
  });

  it("本体を読めない id は使用済みとして扱い、使える id を作れなければ null を返す", () => {
    const { storage } = createRecordingStorage({ failGetItem: true });

    expect(pickNewMapId(storage, indexOf("older", [OLDER]), () => "fresh")).toBeNull();
  });
});
