import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { useNodeEditing } from "@/components/map/useNodeEditing";
import type { Node } from "@/types/node";

const nodes: Node[] = [
  { id: 1, parentId: null, x: 50, y: 30, width: 100, height: 60, label: "既存ラベル" , importance: "medium" as const},
];

function useEditingStartedInLayout(
  currentNodes: Node[],
  onUpdateLabel: (id: number, label: string) => void,
) {
  const editing = useNodeEditing(currentNodes, onUpdateLabel);
  const { startEditing } = editing;
  useLayoutEffect(() => {
    startEditing(1);
  }, [currentNodes, startEditing]);
  return editing;
}

describe("useNodeEditing", () => {
  it("loads an existing node label when editing starts without a draft", () => {
    const { result } = renderHook(() => useNodeEditing(nodes, jest.fn()));

    act(() => result.current.startEditing(1));

    expect(result.current.editingNodeId).toBe(1);
    expect(result.current.editingNode).toBe(nodes[0]);
    expect(result.current.editingText).toBe("既存ラベル");
  });

  it("uses a supplied empty draft for a newly created node id", () => {
    const { result } = renderHook(() => useNodeEditing(nodes, jest.fn()));

    act(() => result.current.startEditing(2, ""));

    expect(result.current.editingNodeId).toBe(2);
    expect(result.current.editingNode).toBeNull();
    expect(result.current.editingText).toBe("");
  });

  it("does not start editing an absent node without a supplied draft", () => {
    const { result } = renderHook(() => useNodeEditing(nodes, jest.fn()));

    act(() => result.current.startEditing(2));

    expect(result.current.editingNodeId).toBeNull();
    expect(result.current.editingText).toBe("");
  });

  it("commits the edited label and clears the editing state", () => {
    const onUpdateLabel = jest.fn();
    const { result } = renderHook(() => useNodeEditing(nodes, onUpdateLabel));

    act(() => result.current.startEditing(1));
    act(() => result.current.setEditingText("更新"));
    act(() => result.current.commitEditing());

    expect(onUpdateLabel).toHaveBeenCalledWith(1, "更新");
    expect(result.current.editingNodeId).toBeNull();
    expect(result.current.editingText).toBe("");
  });

  it("cancels an edit without updating the node label", () => {
    const onUpdateLabel = jest.fn();
    const { result } = renderHook(() => useNodeEditing(nodes, onUpdateLabel));

    act(() => result.current.startEditing(1));
    act(() => result.current.setEditingText("変更しない"));
    act(() => result.current.cancelEditing());

    expect(onUpdateLabel).not.toHaveBeenCalled();
    expect(result.current.editingNodeId).toBeNull();
    expect(result.current.editingText).toBe("");
  });

  it("ノード更新後もstartEditingの参照を維持する", () => {
    const onUpdateLabel = jest.fn();
    const { result, rerender } = renderHook(
      ({ currentNodes }) => useNodeEditing(currentNodes, onUpdateLabel),
      { initialProps: { currentNodes: nodes } },
    );
    const startEditing = result.current.startEditing;

    rerender({ currentNodes: [{ ...nodes[0], x: 200 }] });

    expect(result.current.startEditing).toBe(startEditing);
  });

  it("初回取得したstartEditingは最新ノードのラベルを参照する", () => {
    const onUpdateLabel = jest.fn();
    const { result, rerender } = renderHook(
      ({ currentNodes }) => useNodeEditing(currentNodes, onUpdateLabel),
      { initialProps: { currentNodes: nodes } },
    );
    const startEditing = result.current.startEditing;

    rerender({ currentNodes: [{ ...nodes[0], label: "最新ラベル" }] });
    act(() => startEditing(1));

    expect(result.current.editingText).toBe("最新ラベル");
  });

  it("ノード更新直後のlayout effectでも最新ラベルで編集を開始する", () => {
    const onUpdateLabel = jest.fn();
    const { result, rerender } = renderHook(
      ({ currentNodes }) => useEditingStartedInLayout(currentNodes, onUpdateLabel),
      { initialProps: { currentNodes: nodes } },
    );

    rerender({ currentNodes: [{ ...nodes[0], label: "layout直後のラベル" }] });

    expect(result.current.editingText).toBe("layout直後のラベル");
  });
});
