import { act, renderHook } from "@testing-library/react";
import { useMapLibrary, type MapLibraryView } from "../useMapLibrary";
import { createRecordingStorage, seedMapLibrary } from "@/testing/mapLibraryTestStorage";
import { createMapDocument, serializeMapDocument, parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import { createTestNode } from "@/testing/createTestNode";
import { mapBodyKey, MAP_INDEX_STORAGE_KEY } from "@/services/persistence/mapLibraryStorage";
import { BRANCH_MOVE_JOURNAL_KEY } from "@/services/persistence/branchMoveJournal";

const body = (label: string) => serializeMapDocument(createMapDocument([
  createTestNode({ id: 1, parentId: null, label }),
  createTestNode({ id: 2, parentId: 1, label: "子孫" }),
], "manual"));
function ready(view: MapLibraryView) {
  if (view.status !== "ready") throw new Error("not ready");
  return view;
}
function setup() {
  let failSource = false;
  let failRestore = false;
  const recording = createRecordingStorage({
    failSetItem: key => failSource && key === mapBodyKey("a"),
    failRemoveItem: key => failRestore && key === mapBodyKey("b"),
  });
  seedMapLibrary(recording.storage, [{ id: "a", json: body("保存済み") }, { id: "b", json: null }]);
  const hook = renderHook(() => useMapLibrary({ getStorage: () => recording.storage, now: () => new Date("2026-10-31T00:00:00Z"), generateId: () => "new" }));
  return { ...recording, ...hook, fail: (restore = false) => { failSource = true; failRestore = restore; } };
}

describe("useMapLibrary.moveBranchToMap", () => {
  it("flushした最新ラベルと全子孫を移動し、成功後だけセッションを切り替える", () => {
    const { result, storage } = setup();
    const old = ready(result.current.view).storageSession;
    old.registerFlush(() => { const saved = old.writeBody(body("保存前の変更")); return saved.status === "saved" ? saved : { status: "failed", error: "failed" }; });
    act(() => { expect(result.current.moveBranchToMap(old, "b", 1).ok).toBe(true); });
    expect(ready(result.current.view).currentMap.id).toBe("b");
    const target = parseMapDocumentJson(storage.getItem(mapBodyKey("b"))!);
    expect(target.ok && target.value.nodes.map(n => n.label)).toEqual(["保存前の変更", "子孫"]);
    expect(old.writeBody(body("遅い保存"))).toEqual({ status: "inactive" });
    const current = ready(result.current.view).storageSession;
    let currentFlushed = false;
    let oldFlushed = false;
    current.registerFlush(() => { currentFlushed = true; return { status: "unchanged" }; });
    old.registerFlush(() => { oldFlushed = true; return { status: "unchanged" }; });
    act(() => { result.current.switchMap("a"); });
    expect(currentFlushed).toBe(true);
    expect(oldFlushed).toBe(false);
  });

  it("登録されたflushの失敗では移動せず現在セッションを保つ", () => {
    const { result, entries } = setup();
    const old = ready(result.current.view).storageSession;
    let called = false;
    old.registerFlush(() => { called = true; return { status: "failed", error: "full" }; });
    const before = entries();
    act(() => { expect(result.current.moveBranchToMap(old, "b", 1).ok).toBe(false); });
    expect(called).toBe(true);
    expect(entries()).toEqual(before);
    expect(ready(result.current.view).storageSession).toBe(old);
  });

  it.each(["同一", "削除済み", "別セッション", "ABA"])("%sの呼び出しを保存せず拒否する", kind => {
    const { result, entries, operations } = setup();
    const old = ready(result.current.view).storageSession;
    if (kind === "削除済み") act(() => { result.current.deleteMap("b"); });
    if (kind === "別セッション") act(() => { result.current.switchMap("b"); });
    if (kind === "ABA") act(() => { result.current.switchMap("b"); result.current.switchMap("a"); });
    const before = entries();
    operations.length = 0;
    act(() => { expect(result.current.moveBranchToMap(old, kind === "同一" ? "a" : "b", 1).ok).toBe(false); });
    expect(entries()).toEqual(before);
    expect(operations).toEqual([]);
  });

  it("flush中に削除された移動先を最新indexで検出する", () => {
    const { result, storage, entries } = setup();
    const old = ready(result.current.view).storageSession;
    old.registerFlush(() => {
      const index = JSON.parse(storage.getItem(MAP_INDEX_STORAGE_KEY)!);
      storage.setItem(MAP_INDEX_STORAGE_KEY, JSON.stringify({ ...index, maps: index.maps.slice(0, 1) }));
      return { status: "unchanged" };
    });
    act(() => { expect(result.current.moveBranchToMap(old, "b", 1).ok).toBe(false); });
    expect(entries()[mapBodyKey("a")]).toBe(body("保存済み"));
    expect(entries()[mapBodyKey("b")]).toBeUndefined();
  });

  it("flush後の最新indexの名前を保ち、両日時を更新する", () => {
    const { result, storage } = setup();
    const old = ready(result.current.view).storageSession;
    old.registerFlush(() => {
      const index = JSON.parse(storage.getItem(MAP_INDEX_STORAGE_KEY)!);
      index.maps[1].name = "変更後の名前";
      storage.setItem(MAP_INDEX_STORAGE_KEY, JSON.stringify(index));
      return { status: "unchanged" };
    });
    act(() => { expect(result.current.moveBranchToMap(old, "b", 1).ok).toBe(true); });
    const view = ready(result.current.view);
    expect(view.currentMap.name).toBe("変更後の名前");
    expect(view.maps.map(m => m.updatedAt)).toEqual(["2026-10-31T00:00:00.000Z", "2026-10-31T00:00:00.000Z"]);
  });

  it.each([
    ["legacyCleanupPending の欠落", (index: Record<string, unknown>) => { delete index.legacyCleanupPending; }],
    ["updatedAt の不正", (index: Record<string, unknown>) => { (index.maps as Record<string, unknown>[])[0].updatedAt = "x"; }],
  ])("補正待ちのインデックス（%s）でも移動できる", (_name, breakIndex) => {
    const recording = createRecordingStorage();
    seedMapLibrary(recording.storage, [{ id: "a", json: body("保存済み") }, { id: "b", json: null }]);
    const index = JSON.parse(recording.storage.getItem(MAP_INDEX_STORAGE_KEY)!);
    breakIndex(index);
    recording.storage.setItem(MAP_INDEX_STORAGE_KEY, JSON.stringify(index));
    const { result } = renderHook(() => useMapLibrary({ getStorage: () => recording.storage, now: () => new Date("2026-10-31T00:00:00Z"), generateId: () => "new" }));
    const session = ready(result.current.view).storageSession;

    act(() => { expect(result.current.moveBranchToMap(session, "b", 2).ok).toBe(true); });

    expect(ready(result.current.view).currentMap.id).toBe("b");
    expect(recording.entries()[BRANCH_MOVE_JOURNAL_KEY]).toBeUndefined();
  });

  it("ロールバック成功なら現在セッションと原本を保持する", () => {
    const { result, fail, entries } = setup();
    const old = ready(result.current.view).storageSession;
    const before = entries();
    fail();
    act(() => {
      const moved = result.current.moveBranchToMap(old, "b", 1);
      expect(moved.ok).toBe(false);
      expect(moved).not.toHaveProperty("enteredProtectedMode");
    });
    expect(entries()).toEqual(before);
    expect(ready(result.current.view).storageSession).toBe(old);
  });

  it("復元不能では旧セッションを無効にし、原本表示の保護モードへ移る", () => {
    const { result, fail, entries, operations } = setup();
    const old = ready(result.current.view).storageSession;
    fail(true);
    act(() => {
      expect(result.current.moveBranchToMap(old, "b", 1)).toMatchObject({ ok: false, enteredProtectedMode: true });
    });
    const view = ready(result.current.view);
    expect(view.storageMode).toBe("protected");
    expect(view.storageSession.readBody()).toEqual({ ok: true, value: body("保存済み") });
    expect(entries()[BRANCH_MOVE_JOURNAL_KEY]).toBeDefined();
    operations.length = 0;
    expect(old.writeBody("late")).toEqual({ status: "inactive" });
    let oldFlushed = false;
    old.registerFlush(() => { oldFlushed = true; return { status: "unchanged" }; });
    act(() => { result.current.createMap("追加"); result.current.moveBranchToMap(old, "b", 1); });
    expect(oldFlushed).toBe(false);
    expect(operations).toEqual([]);
  });
});
