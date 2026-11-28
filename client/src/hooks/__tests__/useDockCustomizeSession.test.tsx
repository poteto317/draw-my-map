import { act, renderHook } from "@testing-library/react";
import { createDefaultDockVisibleSlotIds } from "@/domain/dock/defaultDockLayout";
import type { DockLayoutPrefs } from "@/domain/dock/defaultDockLayout";
import type { SetDockLayoutResult } from "@/hooks/useUiPrefs";
import { useDockCustomizeSession } from "@/hooks/useDockCustomizeSession";

describe("useDockCustomizeSession", () => {
  it("openCustomize で現在の visible を下書きに載せ、open にする", () => {
    const setDockLayout = jest.fn((): SetDockLayoutResult => ({ ok: true }));
    const { result } = renderHook(() =>
      useDockCustomizeSession({
        visibleSlotIds: ["undoRedo", "collab"],
        setDockLayout,
      }),
    );

    expect(result.current.open).toBe(false);

    act(() => {
      result.current.openCustomize();
    });

    expect(result.current.open).toBe(true);
    expect(result.current.draftVisibleSlotIds).toEqual(["undoRedo", "collab"]);
  });

  it("apply 成功で setDockLayout を呼び閉じる", () => {
    const setDockLayout = jest.fn(
      (layout: DockLayoutPrefs): SetDockLayoutResult => {
        expect(layout.visibleSlotIds).toEqual(["commandPalette"]);
        return { ok: true };
      },
    );
    const { result } = renderHook(() =>
      useDockCustomizeSession({
        visibleSlotIds: ["undoRedo"],
        setDockLayout,
      }),
    );

    act(() => {
      result.current.openCustomize();
      result.current.setDraftVisibleSlotIds(["commandPalette"]);
    });

    let applyResult: SetDockLayoutResult | undefined;
    act(() => {
      applyResult = result.current.applyCustomize();
    });

    expect(applyResult).toEqual({ ok: true });
    expect(setDockLayout).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(false);
  });

  it("apply 失敗では閉じず、setDockLayout のロールバックに委ねる", () => {
    const setDockLayout = jest.fn(
      (): SetDockLayoutResult => ({ ok: false, message: "失敗" }),
    );
    const { result } = renderHook(() =>
      useDockCustomizeSession({
        visibleSlotIds: ["undoRedo"],
        setDockLayout,
      }),
    );

    act(() => {
      result.current.openCustomize();
      result.current.setDraftVisibleSlotIds(["commandPalette"]);
    });
    act(() => {
      expect(result.current.applyCustomize()).toEqual({
        ok: false,
        message: "失敗",
      });
    });

    expect(result.current.open).toBe(true);
    expect(setDockLayout).toHaveBeenCalledTimes(1);
    expect(setDockLayout).toHaveBeenCalledWith({
      visibleSlotIds: ["commandPalette"],
    });
  });

  it("resetDraftToDefault は既定 visible を下書きへ入れる", () => {
    const { result } = renderHook(() =>
      useDockCustomizeSession({
        visibleSlotIds: ["collab"],
        setDockLayout: () => ({ ok: true }),
      }),
    );

    act(() => {
      result.current.openCustomize();
      result.current.resetDraftToDefault();
    });

    expect(result.current.draftVisibleSlotIds).toEqual(
      createDefaultDockVisibleSlotIds(),
    );
  });

  it("cancelCustomize は適用前スナップショットへ復元して閉じる", () => {
    let liveVisible: DockLayoutPrefs["visibleSlotIds"] = ["undoRedo"];
    const setDockLayout = jest.fn(
      (layout: DockLayoutPrefs): SetDockLayoutResult => {
        liveVisible = [...layout.visibleSlotIds];
        return { ok: true };
      },
    );
    const { result } = renderHook(() =>
      useDockCustomizeSession({
        visibleSlotIds: ["undoRedo"],
        setDockLayout,
      }),
    );

    act(() => {
      result.current.openCustomize();
      result.current.setDraftVisibleSlotIds(["commandPalette"]);
    });

    // prefs が open 後に変わっても、cancel は open 時スナップショットへ戻す
    act(() => {
      setDockLayout({ visibleSlotIds: ["commandPalette"] });
      result.current.cancelCustomize();
    });

    expect(result.current.open).toBe(false);
    expect(liveVisible).toEqual(["undoRedo"]);
    expect(setDockLayout).toHaveBeenLastCalledWith({
      visibleSlotIds: ["undoRedo"],
    });
  });
});
