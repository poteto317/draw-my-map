import { act, renderHook } from "@testing-library/react";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapLibraryOperationResult, MapLibraryView } from "@/hooks/useMapLibrary";
import { usePendingMapNavigation } from "@/hooks/usePendingMapNavigation";
import { createTestStorageSession } from "@/testing/createTestStorageSession";

function createReadyView(
  mapId: string,
  sessionNumber: number,
  storageMode: "persistent" | "protected" = "persistent",
): MapLibraryView {
  const entry = {
    id: mapId,
    name: `マップ ${mapId}`,
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
  };
  return {
    status: "ready",
    storageMode,
    maps: [entry],
    currentMap: entry,
    storageSession: createTestStorageSession({ mapId, sessionNumber }).session,
    startupNotice: null,
    trashEntries: [],
    trashStatus: "ok",
    libraryMeta: createEmptyMapLibraryMeta(),
    libraryMetaStatus: "ready",
  };
}

describe("usePendingMapNavigation", () => {
  it("保護モードでは切替を拒否してエラー通知を出し pendingNavigation を立てない", () => {
    const switchMap = jest.fn<MapLibraryOperationResult, [string]>();
    const publishShellNotice = jest.fn();
    const { result } = renderHook(() =>
      usePendingMapNavigation({
        view: createReadyView("map-a", 1, "protected"),
        switchMap,
        publishShellNotice,
      }),
    );

    act(() => {
      result.current.switchToMapTarget("map-b", 42);
    });

    expect(switchMap).not.toHaveBeenCalled();
    expect(result.current.pendingNavigation).toBeNull();
    expect(publishShellNotice).toHaveBeenCalledWith({
      kind: "error",
      message: "保護モードのため他のマップへ移動できません。",
    });
  });

  it("switchMap 成功時にトークン付き pendingNavigation を発行し、セッション不一致で自動破棄する", () => {
    const switchMap = jest.fn<MapLibraryOperationResult, [string]>().mockReturnValue({
      ok: true,
      remounted: true,
      notice: { kind: "status", message: "切り替えました" },
      saveRetryNotice: null,
      sessionNumber: 2,
    });
    const publishShellNotice = jest.fn();

    const { result, rerender } = renderHook(
      ({ view }: { view: MapLibraryView }) =>
        usePendingMapNavigation({ view, switchMap, publishShellNotice }),
      { initialProps: { view: createReadyView("map-a", 1) } },
    );

    act(() => {
      result.current.switchToMapTarget("map-b", 42);
    });

    // view がまだ map-a/1 なので stale と判定される前に、切替後の map-b/2 へ遷移すると保持される
    rerender({ view: createReadyView("map-b", 2) });
    act(() => {
      result.current.switchToMapTarget("map-b", 42);
    });
    expect(result.current.pendingNavigation).toEqual({
      mapId: "map-b",
      sessionNumber: 2,
      nodeId: 42,
      token: 2,
    });

    // 別セッションへ移ると stale として自動破棄される
    rerender({ view: createReadyView("map-c", 3) });
    expect(result.current.pendingNavigation).toBeNull();
  });
});
