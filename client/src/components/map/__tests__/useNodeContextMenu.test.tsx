import { act, fireEvent, renderHook } from "@testing-library/react";
import { useNodeContextMenu } from "@/components/map/useNodeContextMenu";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2 })];
const viewport = { offsetX: 0, offsetY: 0, scale: 1 };
const target = { nodeId: 1, position: { x: 10, y: 20 } };

function setup(overrides: Partial<Parameters<typeof useNodeContextMenu>[0]> = {}) {
  return renderHook((props) => useNodeContextMenu(props), {
    initialProps: {
      nodes,
      visibleNodeIds: new Set([1, 2]) as ReadonlySet<number>,
      resetRevision: 0,
      viewport,
      ...overrides,
    },
  });
}

describe("useNodeContextMenu", () => {
  it("openで対象を保持し、closeでnullに戻す", () => {
    const { result } = setup();
    expect(result.current.menu).toBeNull();

    act(() => result.current.open(target));
    expect(result.current.menu).toEqual(target);

    act(() => result.current.close());
    expect(result.current.menu).toBeNull();
  });

  it("閉じるリスナーと接続されている（Escapeでmenuがnullになる）", () => {
    const { result } = setup();
    act(() => result.current.open(target));
    expect(result.current.menu).toEqual(target);

    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });

    expect(result.current.menu).toBeNull();
  });

  it("失効した対象ではmenuがnullになる", () => {
    const { result, rerender } = setup();
    act(() => result.current.open(target));

    rerender({ nodes, visibleNodeIds: new Set([2]), resetRevision: 0, viewport });
    expect(result.current.menu).toBeNull();

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 0, viewport });
    expect(result.current.menu).toBeNull();
  });

  it("resetRevisionが変わるとmenuはnullになり、戻しても復活しない", () => {
    const { result, rerender } = setup();
    act(() => result.current.open(target));

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 1, viewport });
    expect(result.current.menu).toBeNull();

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 0, viewport });
    expect(result.current.menu).toBeNull();
  });

  it("リセット後でもopenできる", () => {
    const { result, rerender } = setup();
    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 1, viewport });

    act(() => result.current.open(target));

    expect(result.current.menu).toEqual(target);
  });

  it("viewportが変わるとmenuはnullになり、戻しても復活しない", () => {
    const { result, rerender } = setup();
    act(() => result.current.open(target));

    rerender({
      nodes,
      visibleNodeIds: new Set([1, 2]),
      resetRevision: 0,
      viewport: { offsetX: 30, offsetY: 0, scale: 1 },
    });
    expect(result.current.menu).toBeNull();

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 0, viewport });
    expect(result.current.menu).toBeNull();
  });

  it("値が同じ新しいviewportオブジェクトへ再レンダーしてもmenuは維持される", () => {
    const { result, rerender } = setup();
    act(() => result.current.open(target));

    rerender({
      nodes,
      visibleNodeIds: new Set([1, 2]),
      resetRevision: 0,
      viewport: { ...viewport },
    });

    expect(result.current.menu).toEqual(target);
  });
});
