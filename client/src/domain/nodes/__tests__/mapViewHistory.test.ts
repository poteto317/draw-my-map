import {
  EMPTY_MAP_VIEW_HISTORY,
  MAX_MAP_VIEW_HISTORY,
  recordMapViewHistory,
  travelMapViewHistory,
} from "@/domain/nodes/mapViewHistory";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

function view(offsetX: number): MapViewSnapshot {
  return {
    viewport: { offsetX, offsetY: 0, scale: 1 },
    selectedNodeId: null,
    selectedNodeIds: [],
    focusRootId: null,
    collapsedNodeIds: [],
    resolutionMode: "auto",
    autoResolutionLevel: "all",
  };
}

it("記録は上限まで残し、進む履歴を消す", () => {
  let history = EMPTY_MAP_VIEW_HISTORY;
  for (let offsetX = 0; offsetX < MAX_MAP_VIEW_HISTORY + 1; offsetX += 1) {
    history = recordMapViewHistory(history, view(offsetX));
  }
  expect(history.back).toHaveLength(MAX_MAP_VIEW_HISTORY);
  expect(history.back[0]?.viewport.offsetX).toBe(1);
  expect(history.forward).toEqual([]);
});

it("戻る・進むはスタックを対称に入れ替える", () => {
  const recorded = recordMapViewHistory(EMPTY_MAP_VIEW_HISTORY, view(0));
  const back = travelMapViewHistory(recorded, "back", view(1));
  expect(back).toEqual({
    destination: view(0),
    next: { back: [], forward: [view(1)] },
  });
  const forward = travelMapViewHistory(back!.next, "forward", view(0));
  expect(forward).toEqual({
    destination: view(1),
    next: { back: [view(0)], forward: [] },
  });
  expect(travelMapViewHistory(EMPTY_MAP_VIEW_HISTORY, "back", view(2))).toBeNull();
});
