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
      shortcutsEnabled: true,
      ...overrides,
    },
  });
}

describe("useNodeContextMenu", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

    rerender({ nodes, visibleNodeIds: new Set([2]), resetRevision: 0, viewport, shortcutsEnabled: true });
    expect(result.current.menu).toBeNull();

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 0, viewport, shortcutsEnabled: true });
    expect(result.current.menu).toBeNull();
  });

  it("resetRevisionが変わるとmenuはnullになり、戻しても復活しない", () => {
    const { result, rerender } = setup();
    act(() => result.current.open(target));

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 1, viewport, shortcutsEnabled: true });
    expect(result.current.menu).toBeNull();

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 0, viewport, shortcutsEnabled: true });
    expect(result.current.menu).toBeNull();
  });

  it("リセット後でもopenできる", () => {
    const { result, rerender } = setup();
    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 1, viewport, shortcutsEnabled: true });

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
      shortcutsEnabled: true,
    });
    expect(result.current.menu).toBeNull();

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 0, viewport, shortcutsEnabled: true });
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
      shortcutsEnabled: true,
    });

    expect(result.current.menu).toEqual(target);
  });

  it("shortcutsEnabledがfalseの間はEscapeで閉じず、trueへ戻すと再登録なしで閉じる", () => {
    const addListener = jest.spyOn(window, "addEventListener");
    const { result, rerender } = setup({ shortcutsEnabled: false });
    act(() => result.current.open(target));
    const keydownCount = () => addListener.mock.calls.filter(([type]) => type === "keydown").length;
    const registered = keydownCount();

    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(result.current.menu).toEqual(target);

    rerender({
      nodes,
      visibleNodeIds: new Set([1, 2]),
      resetRevision: 0,
      viewport,
      shortcutsEnabled: true,
    });
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });

    expect(result.current.menu).toBeNull();
    expect(registered).toBe(1);
    expect(keydownCount()).toBe(1);
  });
});
