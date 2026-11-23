import { act, renderHook } from "@testing-library/react";
import { useMapLibrary, type MapLibraryView } from "../useMapLibrary";
import { createRecordingStorage, seedMapLibrary } from "@/testing/mapLibraryTestStorage";
import { createMapDocument, serializeMapDocument, parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import { createTestNode } from "@/testing/createTestNode";
import { mapBodyKey, MAP_INDEX_STORAGE_KEY } from "@/services/persistence/mapLibraryStorage";
import { BRANCH_MOVE_JOURNAL_KEY } from "@/services/persistence/branchMoveJournal";

const body = (labels: string[]) => serializeMapDocument(createMapDocument([
  createTestNode({ id: 1, parentId: null, label: "親" }),
  ...labels.map((label, i) => createTestNode({ id: i + 2, parentId: 1, label })),
], "manual"));

function ready(view: MapLibraryView) {
  if (view.status !== "ready") throw new Error("not ready");
  return view;
}

function setup() {
  let failSource = false;
  let failRestore = false;
  const recording = createRecordingStorage({
    initial: {},
    failSetItem: (key) => failSource && key === mapBodyKey("a"),
    failRemoveItem: (key) => failRestore && key === mapBodyKey("new-map"),
  });
  seedMapLibrary(recording.storage, [{ id: "a", json: body(["枝", "弟"]), name: "計画" }]);
  const hook = renderHook(() => useMapLibrary({
    getStorage: () => recording.storage,
    now: () => new Date("2026-11-23T00:00:00Z"),
    generateId: () => "new-map",
  }));
  return { ...recording, ...hook, fail: (restore = false) => { failSource = true; failRestore = restore; } };
}

describe("useMapLibrary.extractBranchToNewMap", () => {
  it("切り出し成功後に新マップを開き、元マップにスタブを残す", () => {
    const { result, storage } = setup();
    const session = ready(result.current.view).storageSession;
    act(() => {
      expect(result.current.extractBranchToNewMap(session, 2).ok).toBe(true);
    });
    expect(ready(result.current.view).currentMap.id).toBe("new-map");
    const source = parseMapDocumentJson(storage.getItem(mapBodyKey("a"))!);
    const target = parseMapDocumentJson(storage.getItem(mapBodyKey("new-map"))!);
    expect(target.ok && target.value.nodes.map((n) => n.label)).toEqual(["枝"]);
    expect(source.ok && source.value.nodes.some((n) => n.mapLinks?.[0]?.targetMapId === "new-map")).toBe(true);
  });

  it("同じ時刻でインデックス作成と openedAt を更新する", () => {
    const { result, storage } = setup();
    const session = ready(result.current.view).storageSession;
    act(() => {
      expect(result.current.extractBranchToNewMap(session, 2).ok).toBe(true);
    });
    const index = JSON.parse(storage.getItem(MAP_INDEX_STORAGE_KEY)!);
    const expected = "2026-11-23T00:00:00.000Z";
    expect(index.maps.map((m: { updatedAt: string }) => m.updatedAt)).toEqual([expected, expected]);
    expect(index.maps.find((m: { id: string }) => m.id === "new-map")?.createdAt).toBe(expected);
  });

  it("flush 失敗時は切り出さない", () => {
    const { result } = setup();
    const session = ready(result.current.view).storageSession;
    session.registerFlush(() => ({ status: "failed", error: "full" }));
    act(() => {
      expect(result.current.extractBranchToNewMap(session, 2).ok).toBe(false);
    });
    expect(ready(result.current.view).currentMap.id).toBe("a");
  });

  it("ロールバック成功なら現在セッションと原本を保持する", () => {
    const { result, fail, entries } = setup();
    const old = ready(result.current.view).storageSession;
    const before = entries();
    fail();
    act(() => {
      const extracted = result.current.extractBranchToNewMap(old, 2);
      expect(extracted.ok).toBe(false);
      expect(extracted).not.toHaveProperty("enteredProtectedMode");
    });
    expect(entries()).toEqual(before);
    expect(ready(result.current.view).storageSession).toBe(old);
  });

  it("復元不能では旧セッションを無効にし、原本表示の保護モードへ移る", () => {
    const { result, fail, entries, operations } = setup();
    const old = ready(result.current.view).storageSession;
    fail(true);
    act(() => {
      expect(result.current.extractBranchToNewMap(old, 2)).toMatchObject({ ok: false, enteredProtectedMode: true });
    });
    const view = ready(result.current.view);
    expect(view.storageMode).toBe("protected");
    expect(view.storageSession.readBody()).toEqual({ ok: true, value: body(["枝", "弟"]) });
    expect(entries()[BRANCH_MOVE_JOURNAL_KEY]).toBeDefined();
    operations.length = 0;
    expect(old.writeBody("late")).toEqual({ status: "inactive" });
    let oldFlushed = false;
    old.registerFlush(() => { oldFlushed = true; return { status: "unchanged" }; });
    act(() => { result.current.createMap("追加"); result.current.extractBranchToNewMap(old, 2); });
    expect(oldFlushed).toBe(false);
    expect(operations).toEqual([]);
  });
});