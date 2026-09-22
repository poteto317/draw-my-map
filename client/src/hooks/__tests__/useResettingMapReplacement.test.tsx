import { act, renderHook } from "@testing-library/react";
import { useResettingMapReplacement } from "@/hooks/useResettingMapReplacement";
import type { NodeMapState } from "@/types/nodeMapState";

const importedMap: NodeMapState = {
  layoutMode: "auto",
  nodes: [{
    id: 10,
    parentId: null,
    x: 20,
    y: 30,
    width: 160,
    height: 64,
    label: "読み込み済み",
  }],
};

describe("useResettingMapReplacement", () => {
  it("マップ置換ごとにstageのreset revisionも進める", () => {
    const replaceMap = jest.fn();
    const { result } = renderHook(() => useResettingMapReplacement(replaceMap));

    act(() => result.current.replaceMapAndReset(importedMap));
    act(() => result.current.replaceMapAndReset(importedMap));

    expect(replaceMap).toHaveBeenNthCalledWith(1, importedMap);
    expect(replaceMap).toHaveBeenNthCalledWith(2, importedMap);
    expect(result.current.resetRevision).toBe(2);
  });
});
