import { act, renderHook } from "@testing-library/react";
import * as nodeLabelSearch from "@/domain/search/nodeLabelSearch";
import { useNodeLabelSearch } from "@/hooks/useNodeLabelSearch";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("@/domain/search/nodeLabelSearch", () => {
  const actual = jest.requireActual<typeof nodeLabelSearch>(
    "@/domain/search/nodeLabelSearch",
  );
  return {
    ...actual,
    createNodeSearchIndex: jest.fn(actual.createNodeSearchIndex),
  };
});

describe("useNodeLabelSearch", () => {
  it("一致したノードに現在の表示状態を付けて返す", () => {
    const nodes = [
      createTestNode({ id: 1, label: "Alpha" }),
      createTestNode({ id: 2, label: "Alphabet" }),
    ];
    const { result } = renderHook(() =>
      useNodeLabelSearch({ nodes, visibleNodeIds: new Set([1]) }),
    );

    act(() => result.current.setQuery("alpha"));

    expect(result.current.hasQuery).toBe(true);
    expect(result.current.total).toBe(2);
    expect(result.current.matches).toEqual([
      { nodeId: 1, label: "Alpha", parentLabel: null, hidden: false },
      { nodeId: 2, label: "Alphabet", parentLabel: null, hidden: true },
    ]);
  });

  it("nodesを差し替えると同じ検索語で索引と結果を作り直す", () => {
    const firstNodes = [createTestNode({ id: 1, label: "target old" })];
    const { result, rerender } = renderHook(
      ({ nodes }) => useNodeLabelSearch({ nodes, visibleNodeIds: new Set<number>() }),
      { initialProps: { nodes: firstNodes } },
    );
    act(() => result.current.setQuery("target"));
    expect(result.current.matches.map(({ nodeId }) => nodeId)).toEqual([1]);

    const nextNodes = [
      createTestNode({ id: 2, label: "target new" }),
      createTestNode({ id: 3, label: "unrelated" }),
    ];
    rerender({ nodes: nextNodes });

    expect(result.current.query).toBe("target");
    expect(result.current.matches).toEqual([
      { nodeId: 2, label: "target new", parentLabel: null, hidden: true },
    ]);
  });

  it("visibleNodeIdsの変化ではhiddenだけを更新する", () => {
    const nodes = [createTestNode({ id: 1, label: "target" })];
    const { result, rerender } = renderHook(
      ({ visibleNodeIds }) => useNodeLabelSearch({ nodes, visibleNodeIds }),
      { initialProps: { visibleNodeIds: new Set<number>() } },
    );
    act(() => result.current.setQuery("target"));
    expect(result.current.matches[0]).toMatchObject({ nodeId: 1, hidden: true });

    rerender({ visibleNodeIds: new Set([1]) });

    expect(result.current.matches[0]).toMatchObject({ nodeId: 1, hidden: false });
  });

  it("空白だけの検索語では検索中にせず結果を返さない", () => {
    const nodes = [createTestNode({ id: 1, label: "target" })];
    const { result } = renderHook(() =>
      useNodeLabelSearch({ nodes, visibleNodeIds: new Set([1]) }),
    );

    act(() => result.current.setQuery(" 　"));

    expect(result.current.hasQuery).toBe(false);
    expect(result.current.matches).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it("nodesの参照が同じなら検索語の変更で索引を作り直さない", () => {
    const nodes = [createTestNode({ id: 1, label: "alpha beta" })];
    const createIndex = jest.mocked(nodeLabelSearch.createNodeSearchIndex);
    createIndex.mockClear();
    const { result } = renderHook(() =>
      useNodeLabelSearch({ nodes, visibleNodeIds: new Set([1]) }),
    );
    const callsAfterMount = createIndex.mock.calls.length;

    act(() => result.current.setQuery("alpha"));
    act(() => result.current.setQuery("beta"));

    expect(createIndex).toHaveBeenCalledTimes(callsAfterMount);
  });
});
