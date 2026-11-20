import { act, renderHook } from "@testing-library/react";
import { useMapViewBookmarks } from "@/hooks/useMapViewBookmarks";
import { mapViewBookmarkKey, updateMapViewBookmarks } from "@/services/persistence/mapViewBookmarkStorage";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";
import { INITIAL_VIEWPORT } from "@/types/viewport";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

const identity = { id: "map-1", createdAt: "2026-11-20T00:00:00.000Z" };
const snapshot: MapViewSnapshot = {
  viewport: INITIAL_VIEWPORT,
  selectedNodeId: 1,
  selectedNodeIds: [1],
  collapsedNodeIds: [],
  focusRootId: null,
  resolutionMode: "auto",
  autoResolutionLevel: "all",
};

it("effect 内の同期 read で ready になり、保存済みブックマークを返す", () => {
  const key = mapViewBookmarkKey(identity)!;
  const { storage } = createRecordingStorage();
  expect(updateMapViewBookmarks(storage, identity, { kind: "save", name: "遠景", snapshot }).ok).toBe(true);

  const { result } = renderHook(() => useMapViewBookmarks(storage, identity.id, identity.createdAt, true));

  expect(result.current.ready).toBe(true);
  expect(result.current.key).toBe(key);
  expect(result.current.bookmarks).toEqual([{ name: "遠景", snapshot }]);
});

it("無効時は ready にならず、有効化すると同期で一覧を読む", () => {
  const { storage } = createRecordingStorage();
  updateMapViewBookmarks(storage, identity, { kind: "save", name: "遠景", snapshot });

  const { result, rerender } = renderHook(
    ({ enabled }) => useMapViewBookmarks(storage, identity.id, identity.createdAt, enabled),
    { initialProps: { enabled: false } },
  );
  expect(result.current.ready).toBe(false);
  expect(result.current.bookmarks).toEqual([]);

  rerender({ enabled: true });
  expect(result.current.ready).toBe(true);
  expect(result.current.bookmarks).toEqual([{ name: "遠景", snapshot }]);
});

it("保存成功で一覧を更新し、空名は失敗にする", () => {
  const { storage } = createRecordingStorage();
  const { result } = renderHook(() => useMapViewBookmarks(storage, identity.id, identity.createdAt, true));
  expect(result.current.ready).toBe(true);

  act(() => {
    expect(result.current.save("  ", snapshot)).toBe(false);
  });
  expect(result.current.bookmarks).toEqual([]);
  expect(result.current.notice?.message).toBe("表示ブックマーク名を入力してください。");

  act(() => {
    expect(result.current.save("遠景", snapshot)).toBe(true);
  });
  expect(result.current.bookmarks).toEqual([{ name: "遠景", snapshot }]);
  expect(result.current.notice).toBeNull();
});
