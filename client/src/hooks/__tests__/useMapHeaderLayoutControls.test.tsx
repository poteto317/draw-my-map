import { renderHook } from "@testing-library/react";
import { useMapHeaderLayoutControls } from "@/hooks/useMapHeaderLayoutControls";
import { createTestNode } from "@/testing/createTestNode";

const noop = () => {};
const noopBool = () => false;

function baseArgs(
  overrides: Partial<Parameters<typeof useMapHeaderLayoutControls>[0]> = {},
): Parameters<typeof useMapHeaderLayoutControls>[0] {
  const node = createTestNode({ id: 1, label: "a" });
  return {
    viewMode: "map",
    isProtectedMode: false,
    nodes: [node],
    layoutMode: "manual",
    treeDirection: "lr",
    layoutSpacing: { childGap: 100, siblingGap: 32 },
    selectedNodeId: 1,
    selectedNodeIds: [1],
    selectedNodeLocked: false,
    setTreeDirection: noop,
    setLayoutSpacing: noop,
    commitManualNodes: noopBool,
    toggleNodeEditLock: noopBool,
    lockNodeSubtree: noopBool,
    unlockNodeSubtree: noopBool,
    setLabelFontSize: noopBool,
    toggleLabelBold: noopBool,
    toggleLabelUnderline: noopBool,
    ...overrides,
  };
}

describe("useMapHeaderLayoutControls labelTextStyleVisible", () => {
  it("マップ表示・単一選択・保護外・nodes に primary があるとき true", () => {
    const { result } = renderHook(() => useMapHeaderLayoutControls(baseArgs()));

    expect(result.current.headerLayoutControls?.labelTextStyleVisible).toBe(true);
  });

  it("保護モードでは false", () => {
    const { result } = renderHook(() =>
      useMapHeaderLayoutControls(baseArgs({ isProtectedMode: true })),
    );

    expect(result.current.headerLayoutControls?.labelTextStyleVisible).toBe(false);
  });

  it("複数選択では false", () => {
    const nodes = [
      createTestNode({ id: 1, label: "a" }),
      createTestNode({ id: 2, label: "b" }),
    ];
    const { result } = renderHook(() =>
      useMapHeaderLayoutControls(baseArgs({
        nodes,
        selectedNodeId: 1,
        selectedNodeIds: [1, 2],
      })),
    );

    expect(result.current.headerLayoutControls?.labelTextStyleVisible).toBe(false);
  });

  it("nodes に無い primary では false", () => {
    const { result } = renderHook(() =>
      useMapHeaderLayoutControls(baseArgs({
        nodes: [createTestNode({ id: 2, label: "other" })],
        selectedNodeId: 1,
        selectedNodeIds: [1],
      })),
    );

    expect(result.current.headerLayoutControls?.labelTextStyleVisible).toBe(false);
  });
});
