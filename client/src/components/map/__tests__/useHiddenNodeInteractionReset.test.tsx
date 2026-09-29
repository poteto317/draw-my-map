import { renderHook } from "@testing-library/react";
import { useHiddenNodeInteractionReset } from "@/components/map/useHiddenNodeInteractionReset";

type HarnessProps = {
  selectedNodeId: number | null;
  editingNodeId: number | null;
  visibleNodeIds: ReadonlySet<number>;
};

describe("useHiddenNodeInteractionReset", () => {
  it("選択中ノードが非表示になるcommitで一時操作を1回ずつ同期解除する", () => {
    const calls: string[] = [];
    const callbacks = {
      onSelectNode: jest.fn(() => calls.push("select")),
      cancelEditing: jest.fn(() => calls.push("editing")),
      cancelActiveGesture: jest.fn(() => calls.push("gesture")),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      { initialProps: { selectedNodeId: 1, editingNodeId: null, visibleNodeIds: new Set([1, 2]) } },
    );

    rerender({ selectedNodeId: 1, editingNodeId: null, visibleNodeIds: new Set([2]) });

    expect(calls).toEqual(["select", "editing", "gesture"]);
    expect(callbacks.onSelectNode).toHaveBeenCalledWith(null);
  });

  it("編集中ノードが非表示になる場合だけ解除する", () => {
    const callbacks = {
      onSelectNode: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      { initialProps: { selectedNodeId: null, editingNodeId: 1, visibleNodeIds: new Set([1, 2]) } },
    );

    rerender({ selectedNodeId: null, editingNodeId: 1, visibleNodeIds: new Set([2]) });

    expect(callbacks.onSelectNode).toHaveBeenCalledTimes(1);
    expect(callbacks.cancelEditing).toHaveBeenCalledTimes(1);
    expect(callbacks.cancelActiveGesture).toHaveBeenCalledTimes(1);
  });

  it("可視IDが同じ別Setへ変わっても再解除しない", () => {
    const callbacks = {
      onSelectNode: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      { initialProps: { selectedNodeId: 1, editingNodeId: null, visibleNodeIds: new Set([2]) } },
    );
    expect(callbacks.onSelectNode).toHaveBeenCalledTimes(1);

    rerender({ selectedNodeId: 1, editingNodeId: null, visibleNodeIds: new Set([2]) });

    expect(callbacks.onSelectNode).toHaveBeenCalledTimes(1);
    expect(callbacks.cancelEditing).toHaveBeenCalledTimes(1);
    expect(callbacks.cancelActiveGesture).toHaveBeenCalledTimes(1);
  });

  it("可視復帰後に同じノードが再び非表示になると一時操作を再解除する", () => {
    const callbacks = {
      onSelectNode: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      { initialProps: { selectedNodeId: 1, editingNodeId: 1, visibleNodeIds: new Set([2]) } },
    );

    rerender({ selectedNodeId: 1, editingNodeId: 1, visibleNodeIds: new Set([1, 2]) });
    rerender({ selectedNodeId: 1, editingNodeId: 1, visibleNodeIds: new Set([2]) });

    expect(callbacks.onSelectNode).toHaveBeenCalledTimes(2);
    expect(callbacks.cancelEditing).toHaveBeenCalledTimes(2);
    expect(callbacks.cancelActiveGesture).toHaveBeenCalledTimes(2);
  });

  it("選択・編集中ノードが可視なら解除しない", () => {
    const callbacks = {
      onSelectNode: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };

    renderHook(() => useHiddenNodeInteractionReset({
      selectedNodeId: 1,
      editingNodeId: 2,
      visibleNodeIds: new Set([1, 2]),
      ...callbacks,
    }));

    expect(callbacks.onSelectNode).not.toHaveBeenCalled();
    expect(callbacks.cancelEditing).not.toHaveBeenCalled();
    expect(callbacks.cancelActiveGesture).not.toHaveBeenCalled();
  });
});
