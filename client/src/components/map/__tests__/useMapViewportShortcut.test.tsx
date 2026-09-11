import { renderHook } from "@testing-library/react";
import { useMapViewportShortcut } from "@/components/map/useMapViewportShortcut";

const node = { id: 1, parentId: null, x: 100, y: 50, width: 80, height: 40, label: "" };

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
