import { act, renderHook } from "@testing-library/react";
import { useMapResolutionFilter } from "@/hooks/useMapResolutionFilter";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [
  createTestNode({ id: 1, parentId: null, importance: "high" }),
  createTestNode({ id: 2, parentId: 1, importance: "medium" }),
  createTestNode({ id: 3, parentId: 1, importance: "low" }),
];

describe("useMapResolutionFilter", () => {
  it("scale=1ではauto/allで全ノードを表示する", () => {
    const { result } = renderHook(() => useMapResolutionFilter({
      nodes,
      scale: 1,
      resetRevision: 0,
    }));

    expect(result.current).toMatchObject({ mode: "auto", level: "all" });
    expect([...result.current.visibleNodeIds]).toEqual([1, 2, 3]);
  });

  it("autoではズームアウトに応じてhighへ遷移する", () => {
    const { result, rerender } = renderHook(
      ({ scale }) => useMapResolutionFilter({ nodes, scale, resetRevision: 0 }),
      { initialProps: { scale: 1 } },
    );

    rerender({ scale: 0.5 });

    expect(result.current).toMatchObject({ mode: "auto", level: "high" });
    expect([...result.current.visibleNodeIds]).toEqual([1]);
  });

  it("manual mediumはscale=0.25でも固定される", () => {
    const { result, rerender } = renderHook(
      ({ scale }) => useMapResolutionFilter({ nodes, scale, resetRevision: 0 }),
      { initialProps: { scale: 1 } },
    );

    act(() => result.current.setMode("medium"));
    rerender({ scale: 0.25 });

    expect(result.current).toMatchObject({ mode: "medium", level: "medium" });
    expect([...result.current.visibleNodeIds]).toEqual([1, 2]);
  });

  it("autoへ戻すと現在のscaleからhighを再判定する", () => {
    const { result, rerender } = renderHook(
      ({ scale }) => useMapResolutionFilter({ nodes, scale, resetRevision: 0 }),
      { initialProps: { scale: 1 } },
    );

    act(() => result.current.setMode("medium"));
    rerender({ scale: 0.25 });
    act(() => result.current.setMode("auto"));

    expect(result.current).toMatchObject({ mode: "auto", level: "high" });
    expect([...result.current.visibleNodeIds]).toEqual([1]);
  });

  it.each([
    [1, 0.97, "all", "medium"],
    [0.5, 0.62, "high", "medium"],
  ] as const)(
    "手動からautoへの復帰時は初期scale=%sのpreviousを破棄してscale=%sから%sを%sへ再判定する",
    (initialScale, autoScale, previousLevel, expectedLevel) => {
      const { result, rerender } = renderHook(
        ({ scale }: { scale: number }) => useMapResolutionFilter({
          nodes,
          scale,
          resetRevision: 0,
        }),
        { initialProps: { scale: initialScale } as { scale: number } },
      );

      expect(result.current.level).toBe(previousLevel);
      act(() => result.current.setMode("medium"));
      rerender({ scale: autoScale });
      act(() => result.current.setMode("auto"));

      expect(result.current).toMatchObject({ mode: "auto", level: expectedLevel });
    },
  );

  it.each([
    [1, 0.97, "all"],
    [0.5, 0.62, "high"],
  ] as const)(
    "通常auto中はprevious=%sでscale=%sでもヒステリシスを維持する",
    (initialScale, nextScale, expectedLevel) => {
      const { result, rerender } = renderHook(
        ({ scale }: { scale: number }) => useMapResolutionFilter({
          nodes,
          scale,
          resetRevision: 0,
        }),
        { initialProps: { scale: initialScale } as { scale: number } },
      );

      rerender({ scale: nextScale });

      expect(result.current).toMatchObject({ mode: "auto", level: expectedLevel });
    },
  );

  it("importance変更時に可視IDを再計算する", () => {
    const hiddenChildNodes = [
      createTestNode({ id: 1, parentId: null, importance: "low" }),
      createTestNode({ id: 2, parentId: 1, importance: "low" }),
    ];
    const { result, rerender } = renderHook(
      ({ currentNodes }) => useMapResolutionFilter({
        nodes: currentNodes,
        scale: 0.5,
        resetRevision: 0,
      }),
      { initialProps: { currentNodes: hiddenChildNodes } },
    );

    expect([...result.current.visibleNodeIds]).toEqual([]);

    rerender({ currentNodes: [
      hiddenChildNodes[0],
      { ...hiddenChildNodes[1], importance: "high" },
    ] });

    expect([...result.current.visibleNodeIds]).toEqual([1, 2]);
  });

  it("resetRevisionの増加で直前allを破棄しscale=0.97からmediumへ再判定する", () => {
    const { result, rerender } = renderHook(
      ({ scale, resetRevision }) => useMapResolutionFilter({ nodes, scale, resetRevision }),
      { initialProps: { scale: 1, resetRevision: 0 } },
    );

    act(() => result.current.setMode("medium"));
    rerender({ scale: 0.97, resetRevision: 0 });
    expect(result.current).toMatchObject({ mode: "medium", level: "medium" });

    rerender({ scale: 0.97, resetRevision: 1 });

    expect(result.current).toMatchObject({ mode: "auto", level: "medium" });
    expect([...result.current.visibleNodeIds]).toEqual([1, 2]);
  });

  it("resetScaleを省略したresetは現在のscaleからauto段階を再判定する", () => {
    const { result, rerender } = renderHook(
      ({ scale, resetRevision }) => useMapResolutionFilter({ nodes, scale, resetRevision }),
      { initialProps: { scale: 1, resetRevision: 0 } },
    );

    act(() => result.current.setMode("high"));
    rerender({ scale: 0.97, resetRevision: 1 });

    expect(result.current).toMatchObject({ mode: "auto", level: "medium" });
  });

  it.each(["auto", "high", "medium", "all"] as const)(
    "resetScale指定時は%sから保留倍率のauto段階へ復帰する",
    (mode) => {
      const { result, rerender } = renderHook(
        ({ scale, resetRevision }) => useMapResolutionFilter({
          nodes,
          scale,
          resetRevision,
          resetScale: 1,
        }),
        { initialProps: { scale: 1, resetRevision: 0 } },
      );

      if (mode !== "auto") {
        act(() => result.current.setMode(mode));
      }
      rerender({ scale: 0.5, resetRevision: 1 });

      expect(result.current).toMatchObject({ mode: "auto", level: "all" });
    },
  );

  it("保留resetの完了後は通常のヒステリシスを適用する", () => {
    const { result, rerender } = renderHook(
      ({ scale }) => useMapResolutionFilter({
        nodes,
        scale,
        resetRevision: 0,
        resetScale: 1,
      }),
      { initialProps: { scale: 0.5 } },
    );

    expect(result.current).toMatchObject({ mode: "auto", level: "all" });
    rerender({ scale: 1 });
    rerender({ scale: 0.5 });

    expect(result.current).toMatchObject({ mode: "auto", level: "high" });
    expect([...result.current.visibleNodeIds]).toEqual([1]);
  });

  it("auto/allのreset後もallを履歴へ確定しscale=0.97でallを維持する", () => {
    const { result, rerender } = renderHook(
      ({ scale, resetRevision }) => useMapResolutionFilter({ nodes, scale, resetRevision }),
      { initialProps: { scale: 1, resetRevision: 0 } },
    );

    rerender({ scale: 1, resetRevision: 1 });
    expect(result.current).toMatchObject({ mode: "auto", level: "all" });

    rerender({ scale: 0.97, resetRevision: 1 });

    expect(result.current).toMatchObject({ mode: "auto", level: "all" });
    expect([...result.current.visibleNodeIds]).toEqual([1, 2, 3]);
  });
});

it.each(["auto", "high"] as const)("viewport復帰は%sモードを保持して初期倍率へauto履歴を戻す", mode => {
  const { result, rerender } = renderHook(({ scale }) => useMapResolutionFilter({ nodes, scale, resetRevision: 0 }), { initialProps: { scale: 0.5 } });
  act(() => result.current.setMode(mode));
  expect(result.current.level).toBe("high");
  act(() => result.current.resetViewportScale(1));
  expect(result.current).toMatchObject({ mode, level: mode === "auto" ? "all" : "high" });
  rerender({ scale: 1 });
  rerender({ scale: 0.97 });
  expect(result.current).toMatchObject({ mode, level: mode === "auto" ? "all" : "high" });
});
