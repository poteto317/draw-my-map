import { act, renderHook } from "@testing-library/react";
import { useNodeOnlyDeletionAction, type UseNodeOnlyDeletionActionOptions } from "../useNodeOnlyDeletionAction";
import { createTestNode } from "@/testing/createTestNode";

function options(): UseNodeOnlyDeletionActionOptions {
  return { selectedNodeId: 1, nodes: [createTestNode({ id: 1 })], visibleNodeIds: new Set([1]), deleteNodeOnly: jest.fn(() => ({ ok: true, deletedId: 1 })), publishNotice: jest.fn() };
}
it("未選択・欠損・非表示では無効、再renderで状態を更新する", () => {
  const props = options();
  const { result, rerender } = renderHook(useNodeOnlyDeletionAction, { initialProps: props });
  expect(result.current.canDelete).toBe(true);
  rerender({ ...props, selectedNodeId: null });
  expect(result.current.canDelete).toBe(false);
  act(() => result.current.deleteSelected());
  expect(props.deleteNodeOnly).not.toHaveBeenCalled();
  rerender({ ...props, nodes: [] });
  expect(result.current.canDelete).toBe(false);
  rerender({ ...props, visibleNodeIds: new Set() });
  expect(result.current.canDelete).toBe(false);
});
it("実行時のIDと可視集合を渡し成功を1回通知する", () => {
  const props = options();
  const { result, rerender } = renderHook(useNodeOnlyDeletionAction, { initialProps: props });
  const visible = new Set([1, 2]);
  rerender({ ...props, visibleNodeIds: visible });
  act(() => result.current.deleteSelected());
  expect(props.deleteNodeOnly).toHaveBeenCalledWith(1, visible);
  expect(props.publishNotice).toHaveBeenCalledTimes(1);
  expect(props.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "ノードだけ削除しました。子孫は残っています。" });
});
it.each(["node-missing", "node-hidden", "invalid-structure", "placement-failed"] as const)("APIの%s失敗を成功として扱わない", reason => {
  const props = options();
  props.deleteNodeOnly = jest.fn(() => ({ ok: false, reason }));
  const { result } = renderHook(() => useNodeOnlyDeletionAction(props));
  act(() => result.current.deleteSelected());
  expect(props.publishNotice).toHaveBeenCalledTimes(1);
  expect(props.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
});
