import { act, renderHook } from "@testing-library/react";

import { useBranchCollapse } from "../useBranchCollapse";
import { deriveNodeCollapse } from "@/domain/nodes/nodeCollapse";
import type { Node } from "@/types/node";

jest.mock("@/domain/nodes/nodeCollapse", () => {
  const actual = jest.requireActual<typeof import("@/domain/nodes/nodeCollapse")>(
    "@/domain/nodes/nodeCollapse",
  );
  return { ...actual, deriveNodeCollapse: jest.fn(actual.deriveNodeCollapse) };
});

const deriveSpy = jest.mocked(deriveNodeCollapse);

function node(id: number, parentId: number | null, label = `node-${id}`): Node {
  return { id, parentId, x: 0, y: 0, width: 120, height: 48, label, importance: "medium" };
}

const nestedNodes = Object.freeze([
  Object.freeze(node(1, null)),
  Object.freeze(node(2, 1)),
  Object.freeze(node(3, 2)),
  Object.freeze(node(4, 1)),
  Object.freeze(node(5, null)),
  Object.freeze(node(6, 5)),
]) as readonly Node[];

describe("useBranchCollapse", () => {
  it("同じnodesとrevisionの無関係な再描画では派生集合の参照を維持する", () => {
    const { result, rerender } = renderHook(
      ({ unrelated }) => {
        void unrelated;
        return useBranchCollapse({ nodes: nestedNodes, documentRevision: 0 });
      },
      { initialProps: { unrelated: 0 } },
    );
    const initial = result.current;

    rerender({ unrelated: 1 });

    expect(result.current.collapsedNodeIds).toBe(initial.collapsedNodeIds);
    expect(result.current.collapseVisibleNodeIds).toBe(initial.collapseVisibleNodeIds);
    expect(result.current.hiddenCountById).toBe(initial.hiddenCountById);
  });

  it("無関係な再描画では表示導出の全木走査を再実行しない", () => {
    const { result, rerender } = renderHook(
      ({ unrelated }) => {
        void unrelated;
        return useBranchCollapse({ nodes: nestedNodes, documentRevision: 0 });
      },
      { initialProps: { unrelated: 0 } },
    );
    act(() => result.current.toggle(2));
    deriveSpy.mockClear();

    rerender({ unrelated: 1 });
    rerender({ unrelated: 2 });

    expect(deriveSpy).not.toHaveBeenCalled();
    expect([...result.current.collapsedNodeIds]).toEqual([2]);
  });

  it("toggleの状態更新では表示導出を1回だけ行う", () => {
    const { result } = renderHook(() => useBranchCollapse({ nodes: nestedNodes, documentRevision: 0 }));
    deriveSpy.mockClear();

    act(() => result.current.toggle(1));

    expect(deriveSpy).toHaveBeenCalledTimes(1);
    expect([...result.current.collapseVisibleNodeIds]).toEqual([1, 5, 6]);
  });

  it("葉のtoggleと閉じていないIDのexpandは状態を変えず派生集合の参照を維持する", () => {
    const { result } = renderHook(() => useBranchCollapse({ nodes: nestedNodes, documentRevision: 0 }));
    act(() => result.current.toggle(2));
    const before = result.current;
    deriveSpy.mockClear();

    act(() => {
      result.current.toggle(3);
      result.current.toggle(999);
      result.current.expandNodes([1, 999]);
    });

    expect(deriveSpy).not.toHaveBeenCalled();
    expect(result.current.collapsedNodeIds).toBe(before.collapsedNodeIds);
    expect(result.current.collapseVisibleNodeIds).toBe(before.collapseVisibleNodeIds);
  });

  it("初期状態は全展開で、入れ子の枝を折りたたんでも元のnodesを変更しない", () => {
    const before = JSON.stringify(nestedNodes);
    const { result } = renderHook(() => useBranchCollapse({ nodes: nestedNodes, documentRevision: 0 }));

    expect([...result.current.collapseVisibleNodeIds]).toEqual([1, 2, 3, 4, 5, 6]);

    act(() => result.current.toggle(2));
    expect([...result.current.collapsedNodeIds]).toEqual([2]);
    expect([...result.current.collapseVisibleNodeIds]).toEqual([1, 2, 4, 5, 6]);
    expect(result.current.hiddenCountById.get(2)).toBe(1);

    act(() => result.current.toggle(1));
    expect([...result.current.collapsedNodeIds]).toEqual([2, 1]);
    expect([...result.current.collapseVisibleNodeIds]).toEqual([1, 5, 6]);
    expect(JSON.stringify(nestedNodes)).toBe(before);
  });

  it("同じイベント内の2枝のtoggleとexpandをどちらも反映する", () => {
    const { result } = renderHook(() => useBranchCollapse({ nodes: nestedNodes, documentRevision: 0 }));

    act(() => {
      result.current.toggle(1);
      result.current.toggle(5);
    });
    expect([...result.current.collapsedNodeIds]).toEqual([1, 5]);

    act(() => {
      result.current.expandNodes([1]);
      result.current.expandNodes([5]);
    });
    expect(result.current.collapsedNodeIds.size).toBe(0);
  });

  it("revision変更時は同じIDの新文書でも初回描画から全展開になる", () => {
    const { result, rerender } = renderHook(
      ({ nodes, revision }) => useBranchCollapse({ nodes, documentRevision: revision }),
      { initialProps: { nodes: nestedNodes, revision: 10 } },
    );
    act(() => result.current.toggle(1));

    const replacement = [node(1, null, "new root"), node(7, 1, "new child")];
    rerender({ nodes: replacement, revision: 11 });

    expect(result.current.collapsedNodeIds.size).toBe(0);
    expect([...result.current.collapseVisibleNodeIds]).toEqual([1, 7]);
  });

  it("削除されたIDは、同じrevisionで再追加されても旧折りたたみ状態が復活しない", () => {
    const branch = [node(1, null), node(2, 1)];
    const { result, rerender } = renderHook(
      ({ nodes }) => useBranchCollapse({ nodes, documentRevision: 3 }),
      { initialProps: { nodes: branch } },
    );
    act(() => result.current.toggle(1));

    rerender({ nodes: [node(2, null)] });
    rerender({ nodes: [node(1, null), node(3, 1)] });

    expect(result.current.collapsedNodeIds.size).toBe(0);
    expect([...result.current.collapseVisibleNodeIds]).toEqual([1, 3]);
  });

  it("葉になったIDは、同じrevisionで子が再追加されても旧折りたたみ状態が復活しない", () => {
    const { result, rerender } = renderHook(
      ({ nodes }) => useBranchCollapse({ nodes, documentRevision: 4 }),
      { initialProps: { nodes: [node(1, null), node(2, 1)] } },
    );
    act(() => result.current.toggle(1));

    rerender({ nodes: [node(1, null)] });
    rerender({ nodes: [node(1, null), node(3, 1)] });

    expect(result.current.collapsedNodeIds.size).toBe(0);
    expect([...result.current.collapseVisibleNodeIds]).toEqual([1, 3]);
  });

  it("ラベル変更だけなら折りたたみ状態を保持する", () => {
    const { result, rerender } = renderHook(
      ({ nodes }) => useBranchCollapse({ nodes, documentRevision: 5 }),
      { initialProps: { nodes: [node(1, null), node(2, 1)] } },
    );
    act(() => result.current.toggle(1));

    rerender({ nodes: [node(1, null, "renamed"), node(2, 1)] });

    expect([...result.current.collapsedNodeIds]).toEqual([1]);
    expect([...result.current.collapseVisibleNodeIds]).toEqual([1]);
  });

  it("canToggleは子を持つ実在ノードだけを操作可能と返す", () => {
    const { result } = renderHook(() => useBranchCollapse({ nodes: nestedNodes, documentRevision: 0 }));

    expect(result.current.canToggle(1)).toBe(true);
    expect(result.current.canToggle(2)).toBe(true);
    expect(result.current.canToggle(3)).toBe(false);
    expect(result.current.canToggle(999)).toBe(false);
  });

  it("不正forestでは全nodesを可視にして操作を無効化する", () => {
    const invalid = [node(1, null), node(1, null)];
    const { result } = renderHook(() => useBranchCollapse({ nodes: invalid, documentRevision: 0 }));

    expect(result.current.index).toBeNull();
    expect(result.current.canToggle(1)).toBe(false);
    expect([...result.current.collapseVisibleNodeIds]).toEqual([1]);
    act(() => {
      result.current.toggle(1);
      result.current.expandNodes([1]);
    });
    expect(result.current.collapsedNodeIds.size).toBe(0);
  });

  it("10,000階層の直線木でも再帰エラーなく折りたたみ・件数・展開を導出する", () => {
    const count = 10_000;
    const deepNodes = Array.from({ length: count }, (_, index) => node(index + 1, index === 0 ? null : index));
    const { result } = renderHook(() => useBranchCollapse({ nodes: deepNodes, documentRevision: 0 }));

    expect(result.current.canToggle(count)).toBe(false);
    expect(result.current.canToggle(5_000)).toBe(true);
    act(() => {
      result.current.toggle(2);
      result.current.toggle(5_000);
    });

    expect([...result.current.collapsedNodeIds].sort((a, b) => a - b)).toEqual([2, 5_000]);
    expect(result.current.collapseVisibleNodeIds.size).toBe(2);
    expect(result.current.hiddenCountById.get(2)).toBe(9_998);

    act(() => result.current.expandNodes([2]));

    expect([...result.current.collapsedNodeIds]).toEqual([5_000]);
    expect(result.current.collapseVisibleNodeIds.size).toBe(5_000);
    expect(result.current.hiddenCountById.get(5_000)).toBe(5_000);
  });
});
