import { act, renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { useNodeContextMenu } from "@/components/map/useNodeContextMenu";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2 })];
const target = { nodeId: 1, position: { x: 10, y: 20 } };

function setup(overrides: Partial<Parameters<typeof useNodeContextMenu>[0]> = {}) {
  return renderHook((props) => useNodeContextMenu(props), {
    initialProps: {
      nodes,
      visibleNodeIds: new Set([1, 2]) as ReadonlySet<number>,
      resetRevision: 0,
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

  it("Escapeで閉じる", () => {
    const { result } = setup();
    act(() => result.current.open(target));

    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });

    expect(result.current.menu).toBeNull();
  });

  it("メニュー外のpointerdownとwheelで閉じる", () => {
    const { result } = setup();
    act(() => result.current.open(target));
    act(() => { fireEvent.pointerDown(document.body); });
    expect(result.current.menu).toBeNull();

    act(() => result.current.open(target));
    act(() => { fireEvent.wheel(document.body); });
    expect(result.current.menu).toBeNull();
  });

  it("メニュー内のpointerdownでは閉じない", () => {
    const { result } = setup();
    const menuElement = document.createElement("div");
    menuElement.setAttribute("role", "menu");
    document.body.appendChild(menuElement);
    act(() => result.current.open(target));

    act(() => { fireEvent.pointerDown(menuElement); });

    expect(result.current.menu).toEqual(target);
    menuElement.remove();
  });

  it("対象ノードが削除または非表示になるとmenuはnullになる", () => {
    const { result, rerender } = setup();
    act(() => result.current.open(target));

    rerender({ nodes: [nodes[1]], visibleNodeIds: new Set([2]), resetRevision: 0 });

    expect(result.current.menu).toBeNull();
  });

  it("resetRevisionが変わるとmenuはnullになり、戻しても復活しない", () => {
    const { result, rerender } = setup();
    act(() => result.current.open(target));

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 1 });
    expect(result.current.menu).toBeNull();

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 0 });
    expect(result.current.menu).toBeNull();
  });
});
