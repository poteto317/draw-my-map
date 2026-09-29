import { renderHook } from "@testing-library/react";
import {
  resolveEffectiveVisibleNodeIds,
  useStageInteractionValues,
} from "@/components/map/useStageInteractionValues";
import type { Viewport } from "@/components/map/mapViewport";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

type HarnessProps = {
  nodes: readonly Node[];
  visibleNodeIds?: ReadonlySet<number>;
  onViewportChange: (viewport: Viewport) => void;
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => void;
};

const initialNodes = [
  createTestNode({ id: 1, label: "親" }),
  createTestNode({ id: 2, label: "子" }),
];

describe("resolveEffectiveVisibleNodeIds", () => {
  it("明示された可視ID集合をそのまま使う", () => {
    const visibleNodeIds = new Set([2]);

    expect(resolveEffectiveVisibleNodeIds(initialNodes, visibleNodeIds)).toBe(visibleNodeIds);
  });

  it("可視ID集合を省略すると現在の全node IDを返す", () => {
    expect([...resolveEffectiveVisibleNodeIds(initialNodes, undefined)]).toEqual([1, 2]);
  });
});

describe("useStageInteractionValues", () => {
  it("rerender後もref identityを保ち、currentだけを最新入力へ同期する", () => {
    const initialCallbacks = {
      onViewportChange: jest.fn(),
      onSelectNode: jest.fn(),
      onMoveNode: jest.fn(),
      onConnectNodes: jest.fn(),
    };
    const initialVisibleNodeIds = new Set([1]);
    const { result, rerender } = renderHook(
      (props: HarnessProps) => useStageInteractionValues(props),
      {
        initialProps: {
          nodes: initialNodes,
          visibleNodeIds: initialVisibleNodeIds,
          ...initialCallbacks,
        },
      },
    );
    const initialRefs = result.current;

    expect(initialRefs.nodesRef.current).toBe(initialNodes);
    expect(initialRefs.visibleNodeIdsRef.current).toBe(initialVisibleNodeIds);
    expect(initialRefs.onViewportChangeRef.current).toBe(initialCallbacks.onViewportChange);
    expect(initialRefs.onSelectNodeRef.current).toBe(initialCallbacks.onSelectNode);
    expect(initialRefs.onMoveNodeRef.current).toBe(initialCallbacks.onMoveNode);
    expect(initialRefs.onConnectNodesRef.current).toBe(initialCallbacks.onConnectNodes);

    const nextNodes = [createTestNode({ id: 3, label: "次" })];
    const nextVisibleNodeIds = new Set([3]);
    const nextCallbacks = {
      onViewportChange: jest.fn(),
      onSelectNode: jest.fn(),
      onMoveNode: jest.fn(),
      onConnectNodes: jest.fn(),
    };
    rerender({
      nodes: nextNodes,
      visibleNodeIds: nextVisibleNodeIds,
      ...nextCallbacks,
    });

    expect(result.current.nodesRef).toBe(initialRefs.nodesRef);
    expect(result.current.visibleNodeIdsRef).toBe(initialRefs.visibleNodeIdsRef);
    expect(result.current.onViewportChangeRef).toBe(initialRefs.onViewportChangeRef);
    expect(result.current.onSelectNodeRef).toBe(initialRefs.onSelectNodeRef);
    expect(result.current.onMoveNodeRef).toBe(initialRefs.onMoveNodeRef);
    expect(result.current.onConnectNodesRef).toBe(initialRefs.onConnectNodesRef);
    expect(result.current.nodesRef.current).toBe(nextNodes);
    expect(result.current.visibleNodeIdsRef.current).toBe(nextVisibleNodeIds);
    expect(result.current.onViewportChangeRef.current).toBe(nextCallbacks.onViewportChange);
    expect(result.current.onSelectNodeRef.current).toBe(nextCallbacks.onSelectNode);
    expect(result.current.onMoveNodeRef.current).toBe(nextCallbacks.onMoveNode);
    expect(result.current.onConnectNodesRef.current).toBe(nextCallbacks.onConnectNodes);
  });

  it("visibleNodeIds省略時はnodes変更後も全node IDを同期する", () => {
    const callbacks = {
      onViewportChange: jest.fn(),
      onSelectNode: jest.fn(),
      onMoveNode: jest.fn(),
      onConnectNodes: jest.fn(),
    };
    const { result, rerender } = renderHook(
      (props: HarnessProps) => useStageInteractionValues(props),
      { initialProps: { nodes: initialNodes, ...callbacks } },
    );
    const visibleNodeIdsRef = result.current.visibleNodeIdsRef;

    expect([...visibleNodeIdsRef.current]).toEqual([1, 2]);

    rerender({
      nodes: [createTestNode({ id: 4 }), createTestNode({ id: 5 })],
      ...callbacks,
    });

    expect(result.current.visibleNodeIdsRef).toBe(visibleNodeIdsRef);
    expect([...result.current.visibleNodeIdsRef.current]).toEqual([4, 5]);
  });
});
