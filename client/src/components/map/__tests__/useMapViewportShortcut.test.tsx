import { renderHook } from "@testing-library/react";
import { useMapViewportShortcut } from "@/components/map/useMapViewportShortcut";

const node = { id: 1, parentId: null, x: 100, y: 50, width: 80, height: 40, label: "" };

function pressF(target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("useMapViewportShortcut", () => {
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

  it("ラベル編集中はFキーを無視する", () => {
    const onFocusNode = jest.fn();
    renderHook(() => useMapViewportShortcut({
      nodes: [node], selectedNodeId: 1, isEditing: true,
      screen: { width: 800, height: 600 },
      hasActiveGesture: () => false, onFocusNode,
    }));

    pressF();
    expect(onFocusNode).not.toHaveBeenCalled();
  });

  it("pointer gesture中はFキーを無視する", () => {
    const onFocusNode = jest.fn();
    renderHook(() => useMapViewportShortcut({
      nodes: [node], selectedNodeId: 1, isEditing: false,
      screen: { width: 800, height: 600 },
      hasActiveGesture: () => true, onFocusNode,
    }));

    pressF();
    expect(onFocusNode).not.toHaveBeenCalled();
  });

  it.each(["input", "textarea", "select"])("%sからのFキーを無視する", (tagName) => {
    const target = document.body.appendChild(document.createElement(tagName));
    const onFocusNode = jest.fn();
    renderHook(() => useMapViewportShortcut({
      nodes: [node], selectedNodeId: 1, isEditing: false,
      screen: { width: 800, height: 600 }, hasActiveGesture: () => false, onFocusNode,
    }));

    pressF(target);
    expect(onFocusNode).not.toHaveBeenCalled();
    target.remove();
  });

  it("contenteditable内の子要素からのFキーを無視する", () => {
    const editor = document.body.appendChild(document.createElement("div"));
    editor.setAttribute("contenteditable", "true");
    const target = editor.appendChild(document.createElement("span"));
    const onFocusNode = jest.fn();
    renderHook(() => useMapViewportShortcut({
      nodes: [node], selectedNodeId: 1, isEditing: false,
      screen: { width: 800, height: 600 }, hasActiveGesture: () => false, onFocusNode,
    }));

    pressF(target);
    expect(onFocusNode).not.toHaveBeenCalled();
    editor.remove();
  });

  it("欠損選択とunmount後は何もしない", () => {
    const onFocusNode = jest.fn();
    const { unmount } = renderHook(() => useMapViewportShortcut({
      nodes: [], selectedNodeId: 1, isEditing: false,
      screen: { width: 800, height: 600 }, hasActiveGesture: () => false, onFocusNode,
    }));
    pressF();
    unmount();
    pressF();
    expect(onFocusNode).not.toHaveBeenCalled();
  });
});
