import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { useMapEditorCommentsDialog } from "@/hooks/useMapEditorCommentsDialog";

function setup(initialMapId = "map-a") {
  const fallbackFocusRef = createRef<HTMLButtonElement>();
  const fallback = document.createElement("button");
  const opener = document.createElement("button");
  document.body.append(fallback, opener);
  (fallbackFocusRef as { current: HTMLButtonElement | null }).current = fallback;
  const hook = renderHook(
    ({ mapId }: { mapId: string }) => useMapEditorCommentsDialog({ mapId, fallbackFocusRef }),
    { initialProps: { mapId: initialMapId } },
  );
  (hook.result.current.buttonRef as { current: HTMLButtonElement | null }).current = opener;
  return { ...hook, fallback, opener };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useMapEditorCommentsDialog", () => {
  it("初期は閉じていて、絞り込みは all", () => {
    const { result } = setup();
    expect(result.current.open).toBe(false);
    expect(result.current.initialFilter).toBe("all");
  });

  it("show で指定の絞り込みで開き、close で閉じる", () => {
    const { result } = setup();
    act(() => result.current.show("selected"));
    expect(result.current.open).toBe(true);
    expect(result.current.initialFilter).toBe("selected");
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });

  it("閉じたら入口のボタンへフォーカスを戻す", () => {
    const { result, opener } = setup();
    act(() => result.current.show("all"));
    act(() => result.current.close());
    expect(document.activeElement).toBe(opener);
  });

  it("入口のボタンが無効なら代わりのボタンへフォーカスを戻す", () => {
    const { result, opener, fallback } = setup();
    opener.disabled = true;
    act(() => result.current.show("all"));
    act(() => result.current.close());
    expect(document.activeElement).toBe(fallback);
  });

  it("開いていない間はフォーカスを動かさない", () => {
    const { rerender, opener, fallback } = setup();
    rerender({ mapId: "map-a" });
    expect(document.activeElement).not.toBe(opener);
    expect(document.activeElement).not.toBe(fallback);
  });

  it("マップを切り替えたら閉じる（L-166）", () => {
    const { result, rerender } = setup();
    act(() => result.current.show("selected"));
    rerender({ mapId: "map-b" });
    expect(result.current.open).toBe(false);
  });
});
