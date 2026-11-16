import { act, renderHook } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";

function setup() {
  const view = renderHook(() => useNodes());
  act(() => {
    view.result.current.replaceMap({
      layoutMode: "manual",
      nodes: [
        createTestNode({ id: 1, label: "りんご" }),
        createTestNode({ id: 2, label: "みかん" }),
        createTestNode({ id: 3, label: "ぶどう" }),
      ],
    });
  });
  return view;
}

function labels(result: ReturnType<typeof setup>["result"]) {
  return result.current.nodes.map((node) => node.label);
}

describe("useNodes の updateNodeLabels", () => {
  it("指定したノードのラベルをまとめて変え、指定外は変えない", () => {
    const { result } = setup();

    let applied = false;
    act(() => { applied = result.current.updateNodeLabels(new Map([[1, "リンゴ"], [2, "ミカン"]])); });

    expect(applied).toBe(true);
    expect(labels(result)).toEqual(["リンゴ", "ミカン", "ぶどう"]);
  });

  it("一括置換は 1 回の Undo で全件戻り、1 回の Redo で全件やり直す", () => {
    const { result } = setup();

    act(() => { result.current.updateNodeLabels(new Map([[1, "リンゴ"], [2, "ミカン"]])); });
    act(() => { result.current.undo(); });
    expect(labels(result)).toEqual(["りんご", "みかん", "ぶどう"]);
    expect(result.current.canUndo).toBe(false);

    act(() => { result.current.redo(); });
    expect(labels(result)).toEqual(["リンゴ", "ミカン", "ぶどう"]);
  });

  it("全件がすでに同じラベルなら受理して true を返し、履歴を積まない", () => {
    const { result } = setup();
    act(() => { result.current.updateNodeLabels(new Map([[3, "ブドウ"]])); });

    let applied = false;
    act(() => { applied = result.current.updateNodeLabels(new Map([[1, "りんご"], [3, "ブドウ"]])); });

    expect(applied).toBe(true);
    act(() => { result.current.undo(); });
    // 同値の呼び出しが履歴を積んでいれば、ここでは id 3 が「ブドウ」のまま残る
    expect(labels(result)).toEqual(["りんご", "みかん", "ぶどう"]);
    expect(result.current.canUndo).toBe(false);
  });

  it.each([
    ["空の Map", new Map<number, string>()],
    ["全 ID が不在", new Map([[98, "x"], [99, "y"]])],
  ])("%sでは false を返し何も変えない", (_name, replacements) => {
    const { result } = setup();

    let applied = true;
    act(() => { applied = result.current.updateNodeLabels(replacements); });

    expect(applied).toBe(false);
    expect(labels(result)).toEqual(["りんご", "みかん", "ぶどう"]);
    expect(result.current.canUndo).toBe(false);
  });
});
