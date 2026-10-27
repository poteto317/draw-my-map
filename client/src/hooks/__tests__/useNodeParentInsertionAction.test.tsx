import { act, renderHook } from "@testing-library/react";
import type { InsertParentNodeResult } from "@/domain/nodes/nodeParentInsertion";
import {
  useNodeParentInsertionAction,
  type UseNodeParentInsertionActionOptions,
} from "@/hooks/useNodeParentInsertionAction";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const R = createTestNode({ id: 1, parentId: null, x: 0, y: 0, label: "R" });
const A = createTestNode({ id: 2, parentId: 1, x: 220, y: 0, label: "A" });
const T = createTestNode({ id: 4, parentId: 1, x: 220, y: 100, label: "T" });

const baseNodes: readonly Node[] = [R, A, T];
const baseVisible: ReadonlySet<number> = new Set([1, 2, 4]);

function setup(overrides: Partial<UseNodeParentInsertionActionOptions> = {}) {
  const insertParentNode = jest.fn<InsertParentNodeResult, [number, ReadonlySet<number>]>();
  const publishNotice = jest.fn();
  const clearNotice = jest.fn();
  const initial: UseNodeParentInsertionActionOptions = {
    selectedNodeId: 4,
    nodes: baseNodes,
    visibleNodeIds: baseVisible,
    documentRevision: 3,
    insertParentNode,
    publishNotice,
    clearNotice,
    ...overrides,
  };
  const view = renderHook((props: UseNodeParentInsertionActionOptions) => useNodeParentInsertionAction(props), {
    initialProps: initial,
  });
  return { view, initial, insertParentNode, publishNotice, clearNotice };
}

describe("useNodeParentInsertionAction", () => {
  it("canInsert は選択・表示集合・nodes のどれが変わっても最新の値になる", () => {
    const { view, initial } = setup();
    expect(view.result.current.canInsert).toBe(true);

    view.rerender({ ...initial, selectedNodeId: null });
    expect(view.result.current.canInsert).toBe(false);
    view.rerender(initial);
    expect(view.result.current.canInsert).toBe(true);

    view.rerender({ ...initial, visibleNodeIds: new Set([1, 2]) });
    expect(view.result.current.canInsert).toBe(false);
    view.rerender(initial);
    expect(view.result.current.canInsert).toBe(true);

    view.rerender({ ...initial, nodes: [R, A] });
    expect(view.result.current.canInsert).toBe(false);
  });

  it("insertSelected は選択中のノードを、渡された表示集合そのままで挿入する", () => {
    const { view, insertParentNode } = setup();
    insertParentNode.mockReturnValue({ ok: false, reason: "node-hidden" });
    act(() => view.result.current.insertSelected());
    expect(insertParentNode).toHaveBeenCalledTimes(1);
    expect(insertParentNode.mock.calls[0][0]).toBe(4);
    expect(insertParentNode.mock.calls[0][1]).toBe(baseVisible);
  });

  it("未選択の insertSelected は何も呼ばない", () => {
    const { view, insertParentNode, publishNotice, clearNotice } = setup({ selectedNodeId: null });
    act(() => view.result.current.insertSelected());
    expect(insertParentNode).not.toHaveBeenCalled();
    expect(publishNotice).not.toHaveBeenCalled();
    expect(clearNotice).not.toHaveBeenCalled();
  });

  it("insert(2) は ID を指定して挿入を呼ぶ", () => {
    const { view, insertParentNode } = setup();
    insertParentNode.mockReturnValue({ ok: false, reason: "node-hidden" });
    act(() => view.result.current.insert(2));
    expect(insertParentNode).toHaveBeenCalledWith(2, baseVisible);
  });

  it("成功では枠を空にして、ラベルの編集を要求する", () => {
    const { view, insertParentNode, publishNotice, clearNotice } = setup();
    insertParentNode.mockReturnValueOnce({ ok: true, insertedId: 50 });
    act(() => view.result.current.insert(4));
    expect(clearNotice).toHaveBeenCalledTimes(1);
    expect(publishNotice).not.toHaveBeenCalled();
    expect(view.result.current.labelEditRequest).toEqual({ nodeId: 50, sequence: 1, documentRevision: 3 });
    expect(insertParentNode.mock.invocationCallOrder[0]).toBeLessThan(clearNotice.mock.invocationCallOrder[0]);

    insertParentNode.mockReturnValueOnce({ ok: true, insertedId: 51 });
    act(() => view.result.current.insert(4));
    expect(view.result.current.labelEditRequest).toEqual({ nodeId: 51, sequence: 2, documentRevision: 3 });
  });

  it("失敗では通知を1回発行し、枠も要求も変えない", () => {
    const { view, insertParentNode, publishNotice, clearNotice } = setup();
    insertParentNode.mockReturnValueOnce({ ok: true, insertedId: 50 });
    act(() => view.result.current.insert(4));
    const previous = view.result.current.labelEditRequest;

    insertParentNode.mockReturnValueOnce({ ok: false, reason: "placement-failed" });
    act(() => view.result.current.insert(4));
    expect(publishNotice).toHaveBeenCalledTimes(1);
    expect(publishNotice).toHaveBeenCalledWith({ kind: "error", message: "親ノードを挿入できませんでした。" });
    expect(clearNotice).toHaveBeenCalledTimes(1);
    expect(view.result.current.labelEditRequest).toBe(previous);
  });

  it("最初から失敗したときは要求が null のまま", () => {
    const { view, insertParentNode } = setup();
    insertParentNode.mockReturnValueOnce({ ok: false, reason: "node-hidden" });
    act(() => view.result.current.insert(4));
    expect(view.result.current.labelEditRequest).toBeNull();
  });

  it("世代が変わると古い要求は null になる", () => {
    const { view, initial, insertParentNode } = setup();
    insertParentNode.mockReturnValueOnce({ ok: true, insertedId: 50 });
    act(() => view.result.current.insert(4));
    expect(view.result.current.labelEditRequest).not.toBeNull();
    view.rerender({ ...initial, documentRevision: 4 });
    expect(view.result.current.labelEditRequest).toBeNull();
  });
});
