import { act, renderHook } from "@testing-library/react";
import { useCommandPalette } from "@/hooks/useCommandPalette";

type Options = { mapId: string; documentRevision: number };

function setup(initial: Options = { mapId: "map-a", documentRevision: 1 }) {
  return renderHook(
    (props: Options) => useCommandPalette(props),
    { initialProps: initial },
  );
}

describe("useCommandPalette", () => {
  it("open / close / setQuery / moveHighlight / setReject / consumeFocusRequest を公開する", () => {
    const view = setup();

    expect(view.result.current.screen).toBe("closed");

    act(() => view.result.current.open());
    expect(view.result.current).toMatchObject({
      screen: "open",
      query: "",
      activeIndex: 0,
      closeReason: null,
      focusRequest: null,
    });

    act(() => view.result.current.setQuery("undo"));
    expect(view.result.current.query).toBe("undo");
    expect(view.result.current.activeIndex).toBe(0);

    act(() => view.result.current.moveHighlight("down", 3));
    expect(view.result.current.activeIndex).toBe(1);

    act(() => view.result.current.setReject("選択がありません"));
    expect(view.result.current.rejectMessage).toBe("選択がありません");
    expect(view.result.current.rejectSequence).toBeGreaterThan(0);

    act(() => view.result.current.close("dismiss"));
    expect(view.result.current).toMatchObject({
      screen: "closed",
      closeReason: "dismiss",
      focusRequest: { kind: "restore-opener" },
    });

    act(() => view.result.current.consumeFocusRequest());
    expect(view.result.current.focusRequest).toBeNull();
  });

  it("execute-immediate と execute-dialog では focusRequest を付けない", () => {
    const view = setup();

    act(() => view.result.current.open());
    act(() => view.result.current.close("execute-immediate"));
    expect(view.result.current.focusRequest).toBeNull();
    expect(view.result.current.closeReason).toBe("execute-immediate");

    act(() => view.result.current.open());
    act(() => view.result.current.close("execute-dialog"));
    expect(view.result.current.focusRequest).toBeNull();
    expect(view.result.current.closeReason).toBe("execute-dialog");
  });

  it("mapId 変化で stale 自動 close する（L-037）", () => {
    const view = setup({ mapId: "map-a", documentRevision: 1 });
    act(() => view.result.current.open());

    act(() => {
      view.rerender({ mapId: "map-b", documentRevision: 1 });
    });

    expect(view.result.current).toMatchObject({
      screen: "closed",
      closeReason: "stale",
      focusRequest: { kind: "restore-opener" },
    });
  });

  it("documentRevision 変化で stale 自動 close する（L-037）", () => {
    const view = setup({ mapId: "map-a", documentRevision: 1 });
    act(() => view.result.current.open());

    act(() => {
      view.rerender({ mapId: "map-a", documentRevision: 2 });
    });

    expect(view.result.current).toMatchObject({
      screen: "closed",
      closeReason: "stale",
      focusRequest: { kind: "restore-opener" },
    });
  });

  it("閉じていれば mapId / documentRevision が変わっても閉じたまま", () => {
    const view = setup({ mapId: "map-a", documentRevision: 1 });

    act(() => {
      view.rerender({ mapId: "map-b", documentRevision: 5 });
    });

    expect(view.result.current.screen).toBe("closed");
    expect(view.result.current.closeReason).toBeNull();
  });

  it("open 時に Options の mapId / documentRevision を開いた世代として記録する", () => {
    const view = setup({ mapId: "map-a", documentRevision: 7 });
    act(() => view.result.current.open());

    act(() => {
      view.rerender({ mapId: "map-a", documentRevision: 7 });
    });
    expect(view.result.current.screen).toBe("open");

    act(() => {
      view.rerender({ mapId: "map-a", documentRevision: 8 });
    });
    expect(view.result.current.closeReason).toBe("stale");
  });
});
