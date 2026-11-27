import { resolveCollabAwarenessSelection } from "@/domain/collab/resolveCollabAwarenessSelection";

describe("resolveCollabAwarenessSelection", () => {
  const viewport = { offsetX: 10, offsetY: 20, scale: 2 };

  it("screen / viewport 欠落や scale 0 は null（捏造しない）", () => {
    expect(
      resolveCollabAwarenessSelection({
        selectedNodeIds: [1],
        screen: null,
        viewport,
      }),
    ).toBeNull();
    expect(
      resolveCollabAwarenessSelection({
        selectedNodeIds: [1],
        screen: { width: 100, height: 80 },
        viewport: null,
      }),
    ).toBeNull();
    expect(
      resolveCollabAwarenessSelection({
        selectedNodeIds: [1],
        screen: { width: 100, height: 80 },
        viewport: { ...viewport, scale: 0 },
      }),
    ).toBeNull();
  });

  it("画面中心をワールド座標へ写像する", () => {
    expect(
      resolveCollabAwarenessSelection({
        selectedNodeIds: [3, 4],
        screen: { width: 100, height: 80 },
        viewport,
      }),
    ).toEqual({
      selectedNodeIds: [3, 4],
      viewportCenter: { x: (50 - 10) / 2, y: (40 - 20) / 2 },
    });
  });
});
