import { act, renderHook } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";

function setup() {
  const view = renderHook(() => useNodes());
  act(() => {
    view.result.current.replaceMap({
      layoutMode: "manual",
      nodes: [
        createTestNode({ id: 1, importance: "high" }),
        createTestNode({ id: 2, importance: "medium" }),
        createTestNode({ id: 3, importance: "medium" }),
      ],
    });
  });
  return view;
}

function importances(result: ReturnType<typeof setup>["result"]) {
  return result.current.nodes.map((node) => node.importance);
}

describe("useNodes の updateNodesImportance", () => {
  it("指定した複数ノードの重要度をまとめて変え、選択外は変えない", () => {
    const { result } = setup();

    let applied = false;
    act(() => { applied = result.current.updateNodesImportance([1, 2], "low"); });

    expect(applied).toBe(true);
    expect(importances(result)).toEqual(["low", "low", "medium"]);
  });

  it("一括変更は1回のUndoで全件戻り、1回のRedoで全件やり直す", () => {
    const { result } = setup();

    act(() => { result.current.updateNodesImportance([1, 2], "low"); });
    act(() => { result.current.undo(); });
    expect(importances(result)).toEqual(["high", "medium", "medium"]);
    expect(result.current.canUndo).toBe(false);

    act(() => { result.current.redo(); });
    expect(importances(result)).toEqual(["low", "low", "medium"]);
  });

  it("全件がすでに同値なら受理してtrueを返し、履歴を積まない", () => {
    const { result } = setup();
    act(() => { result.current.updateNodesImportance([3], "high"); });

    let applied = false;
    act(() => { applied = result.current.updateNodesImportance([1, 3], "high"); });

    expect(applied).toBe(true);
    act(() => { result.current.undo(); });
    // 同値の呼び出しが履歴を積んでいれば、ここでは id 3 が high のまま残る
    expect(importances(result)).toEqual(["high", "medium", "medium"]);
    expect(result.current.canUndo).toBe(false);
  });

  it.each([
    ["空配列", [] as number[]],
    ["全IDが不在", [998, 999]],
  ])("%sではfalseを返し何も変えない", (_name, ids) => {
    const { result } = setup();

    let applied = true;
    act(() => { applied = result.current.updateNodesImportance(ids, "low"); });

    expect(applied).toBe(false);
    expect(importances(result)).toEqual(["high", "medium", "medium"]);
    expect(result.current.canUndo).toBe(false);
  });
});
