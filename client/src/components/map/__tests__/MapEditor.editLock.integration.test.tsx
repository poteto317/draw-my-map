import { act, renderHook } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";

function node(id: number, overrides: Partial<ReturnType<typeof createTestNode>> = {}) {
  return createTestNode({
    id,
    parentId: null,
    x: id * 120,
    y: 100,
    width: 100,
    height: 60,
    label: `N${id}`,
    ...overrides,
  });
}

function lockedNode(id: number) {
  return { ...node(id), locked: true as const };
}

const visibleAll = () => new Set([1, 2, 3]);

describe("MapEditor edit lock（useNodes 経路）", () => {
  it("locked ノードのドラッグは座標を変えない", () => {
    const { result } = renderHook(() => useNodes());
    const initial = lockedNode(1);

    act(() => {
      result.current.replaceMap({ layoutMode: "manual", nodes: [initial] });
      result.current.selectNode(1);
    });

    const before = result.current.nodes[0];
    act(() => {
      result.current.moveNode(1, before.x + 50, before.y + 50);
    });

    expect(result.current.nodes[0]).toEqual(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("locked ノードの削除はノードを残す", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({ layoutMode: "manual", nodes: [lockedNode(1), node(2)] });
    });

    act(() => {
      result.current.deleteNode(1);
    });

    expect(result.current.nodes.map((item) => item.id)).toEqual([1, 2]);
  });

  it("locked を含む統合は拒否する", () => {
    const { result } = renderHook(() => useNodes());
    const nodes = [lockedNode(1), { ...node(2), parentId: null, x: 300 }];
    act(() => {
      result.current.replaceMap({ layoutMode: "manual", nodes });
      result.current.selectNode(1);
      result.current.toggleNodeSelection(2);
    });

    let mergeResult: ReturnType<typeof result.current.mergeNodes> | undefined;
    act(() => {
      mergeResult = result.current.mergeNodes(
        [1, 2],
        1,
        "",
        visibleAll(),
        { ok: false, reason: "locked" },
        "map-test",
      );
    });

    expect(mergeResult).toEqual({ ok: false, reason: "locked" });
    expect(result.current.nodes).toHaveLength(2);
  });

  it("locked ノードのラベル更新は無視する", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({ layoutMode: "manual", nodes: [lockedNode(1)] });
    });

    act(() => {
      result.current.updateNodeLabel(1, "変更不可");
    });

    expect(result.current.nodes[0]?.label).toBe("N1");
  });

  it("locked ノードの分割は拒否する", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.replaceMap({
        layoutMode: "manual",
        nodes: [{ ...lockedNode(1), label: "a,b" }],
      });
    });

    let splitResult: ReturnType<typeof result.current.splitNode> | undefined;
    act(() => {
      splitResult = result.current.splitNode(
        1,
        ",",
        visibleAll(),
        { ok: false, reason: "locked" },
      );
    });

    expect(splitResult).toEqual({ ok: false, reason: "locked" });
    expect(result.current.nodes).toHaveLength(1);
  });

  it("locked ノードのラベル書式変更は無操作で Undo も増えない", () => {
    const { result } = renderHook(() => useNodes());
    const initial = lockedNode(1);
    act(() => {
      result.current.replaceMap({ layoutMode: "manual", nodes: [initial] });
    });

    expect(typeof result.current.setLabelFontSize).toBe("function");
    expect(typeof result.current.toggleLabelBold).toBe("function");
    expect(typeof result.current.toggleLabelUnderline).toBe("function");

    const before = result.current.nodes[0];
    act(() => {
      result.current.setLabelFontSize(1, 18);
      result.current.toggleLabelBold(1);
      result.current.toggleLabelUnderline(1);
    });

    expect(result.current.nodes[0]).toEqual(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("locked ノードの icon / kind 変更は無操作で Undo も増えない", () => {
    const { result } = renderHook(() => useNodes());
    const initial = lockedNode(1);
    act(() => {
      result.current.replaceMap({ layoutMode: "manual", nodes: [initial] });
    });

    expect(typeof result.current.setNodeIcon).toBe("function");
    expect(typeof result.current.setNodeKind).toBe("function");

    const before = result.current.nodes[0];
    act(() => {
      result.current.setNodeIcon(1, "🔥");
      result.current.setNodeKind(1, "question");
    });

    expect(result.current.nodes[0]).toEqual(before);
    expect(result.current.canUndo).toBe(false);
  });
});
