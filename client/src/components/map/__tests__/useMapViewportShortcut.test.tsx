import { renderHook } from "@testing-library/react";
import { useMapViewportShortcut } from "@/components/map/useMapViewportShortcut";
import { createTestNode } from "@/testing/createTestNode";

const node = createTestNode({ x: 100, y: 50, width: 80, height: 40 });

function pressF(target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("useMapViewportShortcut", () => {
  it("F以外のキーではgesture状態を照会しない", () => {
    const hasActiveGesture = jest.fn(() => false);
    renderHook(() => useMapViewportShortcut({
      nodes: [node],
      selectedNodeId: 1,
      isEditing: false,
      screen: { width: 800, height: 600 },
      hasActiveGesture,
      onFocusNode: jest.fn(),
    }));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(hasActiveGesture).not.toHaveBeenCalled();
  });

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
  ])("修飾キー付きFではブラウザ既定動作を妨げない", (modifier) => {
    const hasActiveGesture = jest.fn(() => false);
    const onFocusNode = jest.fn();
    renderHook(() => useMapViewportShortcut({
      nodes: [node],
      selectedNodeId: 1,
      isEditing: false,
      screen: { width: 800, height: 600 },
      hasActiveGesture,
      onFocusNode,
    }));
    const event = new KeyboardEvent("keydown", {
      key: "f",
      bubbles: true,
      cancelable: true,
      ...modifier,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(hasActiveGesture).not.toHaveBeenCalled();
    expect(onFocusNode).not.toHaveBeenCalled();
  });

  it("選択ノードとscreenをフォーカスcommandへ渡す", () => {
    const onFocusNode = jest.fn();
    renderHook(() => useMapViewportShortcut({
      nodes: [node],
      selectedNodeId: 1,
      isEditing: false,
      screen: { width: 800, height: 600 },
      hasActiveGesture: () => false,
      onFocusNode,
    }));

    const event = pressF();

    expect(event.defaultPrevented).toBe(true);
    expect(onFocusNode).toHaveBeenCalledWith(node, { width: 800, height: 600 });
  });

  it("nodes更新時もlistenerを再登録せず最新ノードを使用する", () => {
    const addEventListener = jest.spyOn(window, "addEventListener");
    const removeEventListener = jest.spyOn(window, "removeEventListener");
    const onFocusNode = jest.fn();
    const screen = { width: 800, height: 600 };
    const movedNode = { ...node, x: 240 };
    const { rerender, unmount } = renderHook(
      ({ nodes }) => useMapViewportShortcut({
        nodes,
        selectedNodeId: 1,
        isEditing: false,
        screen,
        hasActiveGesture: () => false,
        onFocusNode,
      }),
      { initialProps: { nodes: [node] } },
    );

    rerender({ nodes: [movedNode] });
    pressF();

    expect(onFocusNode).toHaveBeenCalledWith(movedNode, screen);
    expect(addEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    expect(removeEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(0);

    unmount();
    expect(removeEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
  });

  it("unmount後はkeydownを処理しない", () => {
    const onFocusNode = jest.fn();
    const { unmount } = renderHook(() => useMapViewportShortcut({
      nodes: [node], selectedNodeId: 1, isEditing: false,
      screen: { width: 800, height: 600 }, hasActiveGesture: () => false, onFocusNode,
    }));
    unmount();
    pressF();

    expect(onFocusNode).not.toHaveBeenCalled();
  });
});
