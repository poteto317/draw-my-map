import { renderHook, act } from "@testing-library/react";
import { RECT_HEIGHT, RECT_WIDTH } from "@/config/shapes";
import { useNodeLayoutState } from "@/hooks/useNodeLayoutState";
import type { Node } from "@/types/node";

function node(
  id: number,
  parentId: number | null,
  x: number,
  y: number,
): Node {
  return {
    id,
    parentId,
    x,
    y,
    width: RECT_WIDTH,
    height: RECT_HEIGHT,
    label: "",
  };
}

describe("useNodeLayoutState", () => {
  it("空の手動配置で開始する", () => {
    const { result } = renderHook(() => useNodeLayoutState());

    expect(result.current.nodes).toEqual([]);
    expect(result.current.layoutMode).toBe("manual");
  });

  it("検証済みノードとモードを座標維持したまま置き換える", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const imported = [node(10, null, 900, 800), node(11, 10, 15, 25)];
    const before = imported.map((item) => ({ ...item }));

    act(() => result.current.replaceLayoutState(imported, "auto"));

    expect(result.current.nodes).toBe(imported);
    expect(result.current.nodes).toEqual(before);
    expect(result.current.layoutMode).toBe("auto");
  });

  it("置き換えると初回renderの更新関数にもノードとモードを即時反映する", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const { replaceLayoutState, applyNonStructuralChange, applyManualMove } = result.current;
    const imported = [node(10, null, 900, 800)];
    let observedNodes!: readonly Node[];
    let moved!: boolean;

    act(() => {
      replaceLayoutState(imported, "auto");
      applyNonStructuralChange((current) => {
        observedNodes = current;
        return null;
      });
      moved = applyManualMove(() => []);
    });

    expect(observedNodes).toBe(imported);
    expect(moved).toBe(false);
    expect(result.current.nodes).toBe(imported);
    expect(result.current.replaceLayoutState).toBe(replaceLayoutState);

    act(() => {
      replaceLayoutState(imported, "manual");
      moved = applyManualMove((current) => current.map((item) => ({ ...item, x: 50 })));
    });

    expect(moved).toBe(true);
    expect(result.current.nodes[0].x).toBe(50);
    expect(result.current.layoutMode).toBe("manual");
  });

  it("手動モードでは候補をそのまま確定する", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const candidate = [node(1, null, 50, 70)];
    let applied!: boolean;

    act(() => {
      applied = result.current.applyTreeChange(() => candidate);
    });

    expect(applied).toBe(true);
    expect(result.current.nodes).toBe(candidate);
  });

  it("構造変更は同じbatchの直前更新を参照して候補を作る", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const root = node(1, null, 50, 70);
    const child = node(2, 1, 250, 70);

    act(() => {
      result.current.applyNonStructuralChange(() => [root]);
      result.current.applyTreeChange((currentNodes) => [
        ...currentNodes,
        child,
      ]);
    });
    let currentAfterTreeChange!: readonly Node[];
    act(() => {
      result.current.applyNonStructuralChange((currentNodes) => {
        currentAfterTreeChange = currentNodes;
        return [...currentNodes];
      });
    });

    expect(result.current.nodes).toEqual([root, child]);
    expect(currentAfterTreeChange).toEqual([root, child]);
  });

  it("自動モードへの切り替えで最新ノードを整列する", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const setLayoutMode = result.current.setLayoutMode;
    act(() => {
      result.current.applyNonStructuralChange(() => [
        node(1, null, 50, 70),
        node(2, null, 500, 300),
      ]);
    });

    act(() => setLayoutMode("auto"));

    expect(result.current.layoutMode).toBe("auto");
    expect(result.current.nodes[0]).toMatchObject({ x: 50, y: 70 });
    expect(result.current.nodes[1].x).toBe(50);
    expect(result.current.nodes[1].y).toBeGreaterThan(70 + RECT_HEIGHT);
    expect(result.current.setLayoutMode).toBe(setLayoutMode);
  });

  it("無効なノードでは自動モードへの切り替えを原子的に拒否する", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const invalidNodes = [node(1, null, Number.NaN, 70)];
    act(() => result.current.applyNonStructuralChange(() => invalidNodes));

    act(() => result.current.setLayoutMode("auto"));

    expect(result.current.layoutMode).toBe("manual");
    expect(result.current.nodes).toBe(invalidNodes);
  });

  it("自動レイアウトに失敗したツリー候補を確定しない", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    act(() => result.current.setLayoutMode("auto"));
    const nodesBefore = result.current.nodes;
    let applied!: boolean;

    act(() => {
      applied = result.current.applyTreeChange(() => [
        node(1, null, Number.NaN, 70),
      ]);
    });

    expect(applied).toBe(false);
    expect(result.current.nodes).toBe(nodesBefore);
    expect(result.current.layoutMode).toBe("auto");
  });

  it("自動モード中は手動変更の候補生成を実行せず状態を維持する", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const initialNodes = [node(1, null, 50, 70)];
    act(() => result.current.applyNonStructuralChange(() => initialNodes));
    act(() => result.current.setLayoutMode("auto"));
    const nodesBefore = result.current.nodes;
    const createCandidate = jest.fn(() => [node(1, null, 900, 900)]);
    let applied!: boolean;

    act(() => {
      applied = result.current.applyManualMove(createCandidate);
    });

    expect(applied).toBe(false);
    expect(createCandidate).not.toHaveBeenCalled();
    expect(result.current.nodes).toBe(nodesBefore);
  });

  it("自動モード中も非構造変更は再配置せず確定する", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const initialNodes = [node(1, null, 50, 70)];
    act(() => result.current.applyNonStructuralChange(() => initialNodes));
    act(() => result.current.setLayoutMode("auto"));

    act(() => {
      result.current.applyNonStructuralChange((current) => current.map((currentNode) => (
        { ...currentNode, label: "更新" }
      )));
    });

    expect(result.current.nodes[0]).toMatchObject({
      x: 50,
      y: 70,
      label: "更新",
    });
  });

  it("初回renderの更新関数は同じbatchの最新状態を参照する", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const applyNonStructuralChange = result.current.applyNonStructuralChange;
    const first = node(1, null, 50, 70);
    let nodesDuringBatch!: readonly Node[];

    act(() => {
      applyNonStructuralChange(() => [first]);
      result.current.setLayoutMode("auto");
      applyNonStructuralChange((currentNodes) => {
        nodesDuringBatch = currentNodes;
        return [...currentNodes];
      });
    });

    expect(nodesDuringBatch).toEqual([first]);
    expect(result.current.layoutMode).toBe("auto");
    expect(result.current.applyNonStructuralChange).toBe(
      applyNonStructuralChange,
    );
  });

  it("状態更新後も公開する状態操作の参照を維持する", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const callbacks = {
      applyNonStructuralChange: result.current.applyNonStructuralChange,
      applyManualMove: result.current.applyManualMove,
      applyTreeChange: result.current.applyTreeChange,
      setLayoutMode: result.current.setLayoutMode,
    };

    act(() => (
      result.current.applyNonStructuralChange(() => [node(1, null, 50, 70)])
    ));
    act(() => result.current.setLayoutMode("auto"));

    expect(result.current.applyNonStructuralChange).toBe(
      callbacks.applyNonStructuralChange,
    );
    expect(result.current.applyManualMove).toBe(
      callbacks.applyManualMove,
    );
    expect(result.current.applyTreeChange).toBe(callbacks.applyTreeChange);
    expect(result.current.setLayoutMode).toBe(callbacks.setLayoutMode);
  });
});
