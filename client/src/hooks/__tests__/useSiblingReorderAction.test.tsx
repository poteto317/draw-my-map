import { act, renderHook } from "@testing-library/react";
import { useNodeDuplicationAction } from "@/hooks/useNodeDuplicationAction";
import { useSiblingReorderAction } from "@/hooks/useSiblingReorderAction";
import type {
  ReorderSiblingResult,
  SiblingReorderRequest,
} from "@/domain/nodes/nodeSiblingOrder";
import { createTestNode } from "@/testing/createTestNode";

const NODES = [
  createTestNode({ id: 1 }),
  createTestNode({ id: 2, parentId: 1 }),
  createTestNode({ id: 3, parentId: 1 }),
  createTestNode({ id: 4, parentId: 1 }),
];
const ALL_VISIBLE: ReadonlySet<number> = new Set([1, 2, 3, 4]);

const SUCCESS: ReorderSiblingResult = {
  ok: true,
  direction: "up",
  visibleIndex: 0,
  visibleCount: 3,
  isRoot: false,
};

function createReorderSibling(result: ReorderSiblingResult = SUCCESS) {
  return jest.fn<ReorderSiblingResult, [number, SiblingReorderRequest, ReadonlySet<number>]>(
    () => result,
  );
}

type HookProps = {
  selectedNodeId: number | null;
  nodes?: typeof NODES;
  visibleNodeIds?: ReadonlySet<number>;
  documentRevision?: number;
  reorderSibling?: ReturnType<typeof createReorderSibling>;
};

function renderAction(initial: HookProps) {
  const defaultReorder = createReorderSibling();
  return renderHook(
    (props: HookProps) =>
      useSiblingReorderAction({
        selectedNodeId: props.selectedNodeId,
        nodes: props.nodes ?? NODES,
        visibleNodeIds: props.visibleNodeIds ?? ALL_VISIBLE,
        documentRevision: props.documentRevision ?? 0,
        reorderSibling: props.reorderSibling ?? defaultReorder,
      }),
    { initialProps: initial },
  );
}

describe("useSiblingReorderAction", () => {
  describe("canMoveUp / canMoveDown", () => {
    it("未選択なら両方 false", () => {
      const { result } = renderAction({ selectedNodeId: null });
      expect(result.current.canMoveUp).toBe(false);
      expect(result.current.canMoveDown).toBe(false);
    });

    it.each([
      [3, true, true],
      [2, false, true],
      [4, true, false],
    ])("ノード %i を選択すると up=%s / down=%s", (selectedNodeId, up, down) => {
      const { result } = renderAction({ selectedNodeId });
      expect(result.current.canMoveUp).toBe(up);
      expect(result.current.canMoveDown).toBe(down);
    });

    it("表示集合から前の兄弟を外すと上へ動かせない", () => {
      const { result } = renderAction({
        selectedNodeId: 3,
        visibleNodeIds: new Set([1, 3, 4]),
      });
      expect(result.current.canMoveUp).toBe(false);
      expect(result.current.canMoveDown).toBe(true);
    });

    it("nodes から後ろの兄弟を外すと下へ動かせない", () => {
      const { result } = renderAction({
        selectedNodeId: 3,
        nodes: NODES.filter((node) => node.id !== 4),
      });
      expect(result.current.canMoveUp).toBe(true);
      expect(result.current.canMoveDown).toBe(false);
    });
  });

  describe("moveSelected / reorder", () => {
    it("moveSelected('up') は選択中のノードと受け取った表示集合で reorderSibling を1回呼ぶ", () => {
      const reorderSibling = createReorderSibling();
      const visibleNodeIds = new Set([1, 2, 3, 4]);
      const { result } = renderAction({ selectedNodeId: 3, visibleNodeIds, reorderSibling });

      act(() => result.current.moveSelected("up"));

      expect(reorderSibling).toHaveBeenCalledTimes(1);
      expect(reorderSibling).toHaveBeenCalledWith(
        3,
        { kind: "step", direction: "up" },
        visibleNodeIds,
      );
      expect(reorderSibling.mock.calls[0][2]).toBe(visibleNodeIds);
    });

    it("moveSelected('down') は down の step で呼ぶ", () => {
      const reorderSibling = createReorderSibling();
      const { result } = renderAction({ selectedNodeId: 2, reorderSibling });

      act(() => result.current.moveSelected("down"));

      expect(reorderSibling).toHaveBeenCalledWith(
        2,
        { kind: "step", direction: "down" },
        ALL_VISIBLE,
      );
    });

    it("未選択なら moveSelected は reorderSibling も通知も呼ばない", () => {
      const reorderSibling = createReorderSibling();
      const { result } = renderAction({ selectedNodeId: null, reorderSibling });

      act(() => result.current.moveSelected("up"));

      expect(reorderSibling).not.toHaveBeenCalled();
      expect(result.current.notice).toBeNull();
    });

    it("reorder は渡された nodeId と request でそのまま reorderSibling を呼ぶ", () => {
      const reorderSibling = createReorderSibling();
      const { result } = renderAction({ selectedNodeId: null, reorderSibling });
      const request: SiblingReorderRequest = {
        kind: "drop",
        target: { position: "before", anchorId: 2 },
      };

      act(() => result.current.reorder(4, request));

      expect(reorderSibling).toHaveBeenCalledTimes(1);
      expect(reorderSibling).toHaveBeenCalledWith(4, request, ALL_VISIBLE);
    });
  });

  describe("通知", () => {
    it("成功すると移動先の位置を通知する", () => {
      const { result } = renderAction({ selectedNodeId: 3 });
      act(() => result.current.moveSelected("up"));
      expect(result.current.notice).toEqual({
        kind: "status",
        message: "枝を上へ移動しました（見えている兄弟の3件中1番目）。",
      });
    });

    it("端では端の文言を通知する", () => {
      const reorderSibling = createReorderSibling({
        ok: false,
        reason: "at-edge",
        direction: "up",
        hiddenBeyond: false,
        isRoot: false,
      });
      const { result } = renderAction({ selectedNodeId: 2, reorderSibling });
      act(() => result.current.moveSelected("up"));
      expect(result.current.notice).toEqual({
        kind: "status",
        message: "これ以上上へ移動できません（見えている兄弟の先頭です）。",
      });
    });

    it("invalid-target はエラーを通知する", () => {
      const reorderSibling = createReorderSibling({ ok: false, reason: "invalid-target" });
      const { result } = renderAction({ selectedNodeId: 3, reorderSibling });
      act(() => result.current.moveSelected("up"));
      expect(result.current.notice).toEqual({
        kind: "error",
        message: "枝の順序を変更できませんでした。",
      });
    });

    it("documentRevision が変わると通知を消す", () => {
      const { result, rerender } = renderAction({ selectedNodeId: 3, documentRevision: 0 });
      act(() => result.current.moveSelected("up"));
      expect(result.current.notice).not.toBeNull();

      rerender({ selectedNodeId: 3, documentRevision: 1 });

      expect(result.current.notice).toBeNull();
    });

    it("別の useRevisionScopedNotice の通知を消さない", () => {
      const reorderSibling = createReorderSibling();
      const { result } = renderHook(() => ({
        reorder: useSiblingReorderAction({
          selectedNodeId: 3,
          nodes: NODES,
          visibleNodeIds: ALL_VISIBLE,
          documentRevision: 0,
          reorderSibling,
        }),
        duplication: useNodeDuplicationAction({
          selectedNodeId: 3,
          documentRevision: 0,
          duplicateSubtree: () => 10,
        }),
      }));

      act(() => result.current.duplication.duplicateSelected());
      const duplicationNotice = result.current.duplication.notice;
      expect(duplicationNotice).not.toBeNull();

      act(() => result.current.reorder.moveSelected("up"));

      expect(result.current.reorder.notice).not.toBeNull();
      expect(result.current.duplication.notice).toBe(duplicationNotice);
    });
  });
});
