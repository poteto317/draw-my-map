import { renderHook, act } from "@testing-library/react";
import { RECT_HEIGHT, RECT_WIDTH } from "@/config/shapes";
import { useNodeLayoutState } from "@/hooks/useNodeLayoutState";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import { createTestNode } from "@/testing/createTestNode";

function node(
  id: number,
  parentId: number | null,
  x: number,
  y: number,
): Node {
  return createTestNode({
    id,
    parentId,
    x,
    y,
    width: RECT_WIDTH,
    height: RECT_HEIGHT,
    label: "",
  });
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
      importance: "medium" as const,
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

  it("ツリー変更の候補生成へ同じbatchで切り替えた最新の配置モードを渡す", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const { applyTreeChange, setLayoutMode } = result.current;
    const observedModes: NodeLayoutMode[] = [];

    act(() => {
      applyTreeChange((current, mode) => {
        observedModes.push(mode);
        return [...current, node(1, null, 50, 70)];
      });
      setLayoutMode("auto");
      applyTreeChange((current, mode) => {
        observedModes.push(mode);
        return [...current];
      });
      setLayoutMode("manual");
      applyTreeChange((current, mode) => {
        observedModes.push(mode);
        return [...current];
      });
    });

    expect(observedModes).toEqual(["manual", "auto", "manual"]);
  });

  it("引数を1つだけ受け取るツリー変更の候補生成もそのまま使える", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const candidate = [node(1, null, 50, 70)];
    const createCandidate = jest.fn((current: readonly Node[]) => [...current, ...candidate]);
    let applied!: boolean;

    act(() => { applied = result.current.applyTreeChange(createCandidate); });

    expect(applied).toBe(true);
    expect(createCandidate).toHaveBeenCalledTimes(1);
    expect(result.current.nodes).toEqual(candidate);
  });

  it("getCurrentStateは同じbatchの最新のノードとモードを返す", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const { getCurrentState, applyTreeChange, setLayoutMode } = result.current;
    const candidate = [node(1, null, 50, 70)];
    let observed!: ReturnType<typeof getCurrentState>;

    act(() => {
      applyTreeChange(() => candidate);
      setLayoutMode("auto");
      observed = getCurrentState();
    });

    expect(observed).toEqual({ layoutMode: "auto", nodes: result.current.nodes });
    expect(observed.nodes).toBe(result.current.nodes);
  });

  it("getCurrentStateは状態と履歴を変えない", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    act(() => { result.current.applyTreeChange(() => [node(1, null, 50, 70)]); });
    const before = { nodes: result.current.nodes, canUndo: result.current.canUndo, canRedo: result.current.canRedo };

    act(() => { result.current.getCurrentState(); });

    expect(result.current.nodes).toBe(before.nodes);
    expect(result.current.canUndo).toBe(before.canUndo);
    expect(result.current.canRedo).toBe(before.canRedo);
  });

  it("getCurrentStateの関数参照は更新後も安定している", () => {
    const { result } = renderHook(() => useNodeLayoutState());
    const { getCurrentState } = result.current;

    act(() => {
      result.current.applyTreeChange(() => [node(1, null, 50, 70)]);
      result.current.setLayoutMode("auto");
    });

    expect(result.current.getCurrentState).toBe(getCurrentState);
  });

  describe("履歴", () => {
    it("非構造変更・ツリー変更・モード変更をそれぞれ1操作として戻し、やり直す", () => {
      const { result } = renderHook(() => useNodeLayoutState());
      const first = [node(1, null, 50, 70)];
      const second = [node(1, null, 50, 70), node(2, null, 500, 300)];

      act(() => { result.current.applyNonStructuralChange(() => first); });
      act(() => { result.current.applyTreeChange(() => second); });
      act(() => result.current.setLayoutMode("auto"));
      const auto = result.current.nodes;

      let undone!: boolean;
      act(() => { undone = result.current.undo(); });
      expect(undone).toBe(true);
      expect(result.current.layoutMode).toBe("manual");
      expect(result.current.nodes).toBe(second);

      act(() => { result.current.undo(); });
      expect(result.current.nodes).toBe(first);
      act(() => { result.current.undo(); });
      expect(result.current.nodes).toEqual([]);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.redo();
        result.current.redo();
        result.current.redo();
      });
      expect(result.current.layoutMode).toBe("auto");
      expect(result.current.nodes).toBe(auto);
      expect(result.current.canRedo).toBe(false);
    });

    it("空履歴のUndo・Redoはfalseを返す", () => {
      const { result } = renderHook(() => useNodeLayoutState());
      let undone!: boolean;
      let redone!: boolean;

      act(() => {
        undone = result.current.undo();
        redone = result.current.redo();
      });

      expect(undone).toBe(false);
      expect(redone).toBe(false);
    });

    it("同値の有効候補はtrueを返しつつ履歴とRedoを維持する", () => {
      const { result } = renderHook(() => useNodeLayoutState());
      act(() => { result.current.applyNonStructuralChange(() => [node(1, null, 50, 70)]); });
      act(() => { result.current.applyNonStructuralChange((current) => current.map((item) => ({ ...item, label: "a" }))); });
      act(() => { result.current.undo(); });
      const results: boolean[] = [];

      act(() => {
        results.push(result.current.applyNonStructuralChange((current) => current.map((item) => ({ ...item }))));
        results.push(result.current.applyManualMove((current) => [...current]));
        results.push(result.current.applyTreeChange((current) => [...current]));
      });

      expect(results).toEqual([true, true, true]);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);
    });

    it("null候補・自動配置中の手動移動・配置失敗はfalseを返しRedoを維持する", () => {
      const { result } = renderHook(() => useNodeLayoutState());
      act(() => result.current.replaceLayoutState([node(1, null, 50, 70)], "auto"));
      act(() => { result.current.applyNonStructuralChange((current) => current.map((item) => ({ ...item, label: "a" }))); });
      act(() => { result.current.undo(); });
      const results: boolean[] = [];

      act(() => {
        results.push(result.current.applyNonStructuralChange(() => null));
        results.push(result.current.applyManualMove(() => [node(1, null, 900, 900)]));
        results.push(result.current.applyTreeChange(() => [node(1, null, Number.NaN, 70)]));
      });

      expect(results).toEqual([false, false, false]);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it("置き換えると過去と未来の履歴を消す", () => {
      const { result } = renderHook(() => useNodeLayoutState());
      act(() => { result.current.applyNonStructuralChange(() => [node(1, null, 50, 70)]); });
      act(() => { result.current.applyNonStructuralChange(() => [node(1, null, 60, 70)]); });
      act(() => { result.current.undo(); });

      act(() => result.current.replaceLayoutState([node(5, null, 0, 0)], "manual"));

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it("移動グループ中の手動移動は終了時に1操作として記録する", () => {
      const { result } = renderHook(() => useNodeLayoutState());
      const start = [node(1, null, 50, 70)];
      act(() => { result.current.applyNonStructuralChange(() => start); });

      act(() => {
        const lease = result.current.beginMoveHistory();
        result.current.applyManualMove(() => [node(1, null, 60, 70)]);
        result.current.applyManualMove(() => [node(1, null, 80, 90)]);
        lease.finish();
      });
      expect(result.current.nodes[0]).toMatchObject({ x: 80, y: 90 });

      act(() => { result.current.undo(); });
      expect(result.current.nodes).toBe(start);
    });

    it("履歴操作の関数参照は更新後も安定している", () => {
      const { result } = renderHook(() => useNodeLayoutState());
      const { undo, redo, beginMoveHistory, replaceLayoutState } = result.current;

      act(() => { result.current.applyNonStructuralChange(() => [node(1, null, 50, 70)]); });
      act(() => { result.current.undo(); });

      expect(result.current.undo).toBe(undo);
      expect(result.current.redo).toBe(redo);
      expect(result.current.beginMoveHistory).toBe(beginMoveHistory);
      expect(result.current.replaceLayoutState).toBe(replaceLayoutState);
    });
  });
});
