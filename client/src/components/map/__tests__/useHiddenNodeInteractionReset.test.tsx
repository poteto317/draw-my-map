import { renderHook } from "@testing-library/react";
import { useHiddenNodeInteractionReset } from "@/components/map/useHiddenNodeInteractionReset";

type HarnessProps = {
  selectedNodeIds: readonly number[];
  selectedNodeId: number | null;
  editingNodeId: number | null;
  visibleNodeIds: ReadonlySet<number>;
};

describe("useHiddenNodeInteractionReset", () => {
  it("選択中ノードが非表示になるcommitで集合をpruneし一時操作を1回ずつ同期解除する", () => {
    const calls: string[] = [];
    const callbacks = {
      pruneSelectionToVisible: jest.fn(() => calls.push("prune")),
      cancelEditing: jest.fn(() => calls.push("editing")),
      cancelActiveGesture: jest.fn(() => calls.push("gesture")),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      {
        initialProps: {
          selectedNodeIds: [1],
          selectedNodeId: 1,
          editingNodeId: null,
          visibleNodeIds: new Set([1, 2]),
        },
      },
    );

    rerender({
      selectedNodeIds: [1],
      selectedNodeId: 1,
      editingNodeId: null,
      visibleNodeIds: new Set([2]),
    });

    expect(calls).toEqual(["prune", "gesture"]);
    expect(callbacks.pruneSelectionToVisible).toHaveBeenCalledWith(new Set([2]));
    expect(callbacks.cancelEditing).not.toHaveBeenCalled();
  });

  it("主選択が隠れ編集中も同じノードなら編集も解除する", () => {
    const callbacks = {
      pruneSelectionToVisible: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      {
        initialProps: {
          selectedNodeIds: [1],
          selectedNodeId: 1,
          editingNodeId: 1,
          visibleNodeIds: new Set([1, 2]),
        },
      },
    );

    rerender({
      selectedNodeIds: [1],
      selectedNodeId: 1,
      editingNodeId: 1,
      visibleNodeIds: new Set([2]),
    });

    expect(callbacks.pruneSelectionToVisible).toHaveBeenCalledTimes(1);
    expect(callbacks.cancelActiveGesture).toHaveBeenCalledTimes(1);
    expect(callbacks.cancelEditing).toHaveBeenCalledTimes(1);
  });

  it("編集中ノードが非表示になる場合だけ解除する", () => {
    const callbacks = {
      pruneSelectionToVisible: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      {
        initialProps: {
          selectedNodeIds: [],
          selectedNodeId: null,
          editingNodeId: 1,
          visibleNodeIds: new Set([1, 2]),
        },
      },
    );

    rerender({
      selectedNodeIds: [],
      selectedNodeId: null,
      editingNodeId: 1,
      visibleNodeIds: new Set([2]),
    });

    expect(callbacks.pruneSelectionToVisible).not.toHaveBeenCalled();
    expect(callbacks.cancelEditing).toHaveBeenCalledTimes(1);
    expect(callbacks.cancelActiveGesture).toHaveBeenCalledTimes(1);
  });

  it("非主選択のみ隠れても集合はpruneするがgesture/editingはキャンセルしない", () => {
    const callbacks = {
      pruneSelectionToVisible: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      {
        initialProps: {
          selectedNodeIds: [1, 2],
          selectedNodeId: 2,
          editingNodeId: 2,
          visibleNodeIds: new Set([1, 2]),
        },
      },
    );

    rerender({
      selectedNodeIds: [1, 2],
      selectedNodeId: 2,
      editingNodeId: 2,
      visibleNodeIds: new Set([2]),
    });

    expect(callbacks.pruneSelectionToVisible).toHaveBeenCalledWith(new Set([2]));
    expect(callbacks.cancelActiveGesture).not.toHaveBeenCalled();
    expect(callbacks.cancelEditing).not.toHaveBeenCalled();
  });

  it("可視IDが同じ別Setへ変わっても再解除しない", () => {
    const callbacks = {
      pruneSelectionToVisible: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      {
        initialProps: {
          selectedNodeIds: [1],
          selectedNodeId: 1,
          editingNodeId: null,
          visibleNodeIds: new Set([2]),
        },
      },
    );
    expect(callbacks.pruneSelectionToVisible).toHaveBeenCalledTimes(1);

    rerender({
      selectedNodeIds: [1],
      selectedNodeId: 1,
      editingNodeId: null,
      visibleNodeIds: new Set([2]),
    });

    expect(callbacks.pruneSelectionToVisible).toHaveBeenCalledTimes(1);
    expect(callbacks.cancelActiveGesture).toHaveBeenCalledTimes(1);
  });

  it("可視復帰後に同じノードが再び非表示になると一時操作を再解除する", () => {
    const callbacks = {
      pruneSelectionToVisible: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };
    const { rerender } = renderHook(
      (props: HarnessProps) => useHiddenNodeInteractionReset({ ...props, ...callbacks }),
      {
        initialProps: {
          selectedNodeIds: [1],
          selectedNodeId: 1,
          editingNodeId: 1,
          visibleNodeIds: new Set([2]),
        },
      },
    );

    rerender({
      selectedNodeIds: [1],
      selectedNodeId: 1,
      editingNodeId: 1,
      visibleNodeIds: new Set([1, 2]),
    });
    rerender({
      selectedNodeIds: [1],
      selectedNodeId: 1,
      editingNodeId: 1,
      visibleNodeIds: new Set([2]),
    });

    expect(callbacks.pruneSelectionToVisible).toHaveBeenCalledTimes(2);
    expect(callbacks.cancelEditing).toHaveBeenCalledTimes(2);
    expect(callbacks.cancelActiveGesture).toHaveBeenCalledTimes(2);
  });

  it("選択・編集中ノードが可視なら解除しない", () => {
    const callbacks = {
      pruneSelectionToVisible: jest.fn(),
      cancelEditing: jest.fn(),
      cancelActiveGesture: jest.fn(),
    };

    renderHook(() => useHiddenNodeInteractionReset({
      selectedNodeIds: [1],
      selectedNodeId: 1,
      editingNodeId: 2,
      visibleNodeIds: new Set([1, 2]),
      ...callbacks,
    }));

    expect(callbacks.pruneSelectionToVisible).not.toHaveBeenCalled();
    expect(callbacks.cancelEditing).not.toHaveBeenCalled();
    expect(callbacks.cancelActiveGesture).not.toHaveBeenCalled();
  });
});
