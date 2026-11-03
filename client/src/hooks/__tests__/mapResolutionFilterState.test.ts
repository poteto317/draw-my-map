import {
  createResolutionFilterState,
  reduceResolutionFilterState,
  resolveEffectiveFilterScale,
} from "@/hooks/mapResolutionFilterState";

describe("mapResolutionFilterState", () => {
  it("resetは手動状態をautoと保留倍率付きの初期段階へ置き換える", () => {
    const manualHighState = {
      mode: "high" as const,
      previousAutoLevel: "medium" as const,
      pendingResetScale: null,
    };

    const reset = reduceResolutionFilterState(manualHighState, {
      type: "reset",
      level: "all",
      pendingScale: 1,
    });

    expect(reset).toEqual({
      mode: "auto",
      previousAutoLevel: "all",
      pendingResetScale: 1,
    });
    expect(resolveEffectiveFilterScale(reset, 0.5)).toBe(1);
  });

  it("手動からautoへ戻すと過去のauto段階と保留倍率を破棄する", () => {
    const state = {
      mode: "medium" as const,
      previousAutoLevel: "high" as const,
      pendingResetScale: 0.5,
    };

    expect(reduceResolutionFilterState(state, { type: "setMode", mode: "auto" }))
      .toEqual({
        mode: "auto",
        previousAutoLevel: null,
        pendingResetScale: null,
      });
  });

  it("現在倍率が保留倍率に到達すると通常倍率を再び使う", () => {
    const state = {
      mode: "auto" as const,
      previousAutoLevel: "all" as const,
      pendingResetScale: 1,
    };

    const completed = reduceResolutionFilterState(state, { type: "completePendingReset" });

    expect(completed).toEqual({ ...state, pendingResetScale: null });
    expect(resolveEffectiveFilterScale(completed, 0.5)).toBe(0.5);
  });

  it("明示mode操作は保留倍率を解除する", () => {
    const state = {
      mode: "auto" as const,
      previousAutoLevel: "all" as const,
      pendingResetScale: 1,
    };

    expect(reduceResolutionFilterState(state, { type: "setMode", mode: "high" }))
      .toEqual({ ...state, mode: "high", pendingResetScale: null });
  });

  it("保留reset中は古いauto段階で履歴を上書きしない", () => {
    const state = {
      mode: "auto" as const,
      previousAutoLevel: "all" as const,
      pendingResetScale: 1,
    };

    expect(reduceResolutionFilterState(state, {
      type: "setPreviousAutoLevel",
      level: "medium",
    })).toBe(state);
  });

  it.each([
    [createResolutionFilterState(), { type: "setMode", mode: "auto" } as const],
    [
      { mode: "auto" as const, previousAutoLevel: "medium" as const, pendingResetScale: null },
      { type: "setPreviousAutoLevel", level: "medium" } as const,
    ],
    [
      { mode: "auto" as const, previousAutoLevel: "all" as const, pendingResetScale: null },
      { type: "completePendingReset" } as const,
    ],
    [
      { mode: "auto" as const, previousAutoLevel: "all" as const, pendingResetScale: 1 },
      { type: "reset", level: "all", pendingScale: 1 } as const,
    ],
    [
      { mode: "medium" as const, previousAutoLevel: "high" as const, pendingResetScale: null },
      { type: "setMode", mode: "medium" } as const,
    ],
  ])("同値actionはstateのidentityを維持する", (state, action) => {
    expect(reduceResolutionFilterState(state, action)).toBe(state);
  });
});

it("resetViewportは手動modeを保持しauto履歴と保留倍率だけを戻す", () => {
  expect(reduceResolutionFilterState({ mode: "high", previousAutoLevel: "high", pendingResetScale: null }, { type: "resetViewport", level: "all", pendingScale: 1 }))
    .toEqual({ mode: "high", previousAutoLevel: "all", pendingResetScale: 1 });
});
