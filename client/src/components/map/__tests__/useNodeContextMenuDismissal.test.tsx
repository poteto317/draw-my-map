import { fireEvent, renderHook } from "@testing-library/react";
import { NODE_CONTEXT_MENU_ATTRIBUTE } from "@/components/map/nodeContextMenuDom";
import { useNodeContextMenuDismissal } from "@/components/map/useNodeContextMenuDismissal";

describe("useNodeContextMenuDismissal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("開いている間、EscapeでonDismissを呼ぶ", () => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Escape以外のキーでは呼ばない", () => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.keyDown(window, { key: "a" });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it.each([
    ["pointerdown", () => fireEvent.pointerDown(document.body)],
    ["wheel", () => fireEvent.wheel(document.body)],
    // fireEvent.blur also emits focusout, so dispatch a bare window blur like a browser does.
    ["blur", () => window.dispatchEvent(new Event("blur"))],
  ])("メニュー外の%sでonDismissを1回呼ぶ", (_name, fire) => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fire();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("フォーカスがメニュー外へ移るfocusoutでonDismissを1回呼ぶ", () => {
    document.body.innerHTML = `<div ${NODE_CONTEXT_MENU_ATTRIBUTE}=""><button id="item"></button></div><button id="outside"></button>`;
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.focusOut(document.getElementById("item")!, {
      relatedTarget: document.getElementById("outside"),
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("フォーカスがメニュー内へ移るfocusoutでは呼ばない", () => {
    document.body.innerHTML = `<div ${NODE_CONTEXT_MENU_ATTRIBUTE}=""><button id="a"></button><button id="b"></button></div>`;
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.focusOut(document.getElementById("a")!, {
      relatedTarget: document.getElementById("b"),
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("relatedTargetがnullのfocusoutではonDismissを呼ばない", () => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.focusOut(document.body, { relatedTarget: null });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("Tabキーでの押下でonDismissを1回呼ぶ", () => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.keyDown(window, { key: "Tab" });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("メニュー専用属性の内側のpointerdownでは呼ばない", () => {
    document.body.innerHTML = `<div ${NODE_CONTEXT_MENU_ATTRIBUTE}=""><button id="item"></button></div>`;
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.pointerDown(document.getElementById("item")!);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("閉じている間はどのイベントでも呼ばない", () => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(false, onDismiss));

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    fireEvent.wheel(document.body);
    fireEvent.blur(window);
    fireEvent.focusOut(document.body, { relatedTarget: null });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("アンマウント後はリスナーが解除される", () => {
    const onDismiss = jest.fn();
    const { unmount } = renderHook(() => useNodeContextMenuDismissal(true, onDismiss));
    unmount();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    fireEvent.focusOut(document.body, { relatedTarget: null });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("isOpenがfalseへ変わるとリスナーが解除される", () => {
    const onDismiss = jest.fn();
    const { rerender } = renderHook(
      ({ isOpen }) => useNodeContextMenuDismissal(isOpen, onDismiss),
      { initialProps: { isOpen: true } },
    );
    rerender({ isOpen: false });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
