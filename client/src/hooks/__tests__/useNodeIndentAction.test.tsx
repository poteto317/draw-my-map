import { renderHook } from "@testing-library/react";
import { useNodeIndentAction } from "@/hooks/useNodeIndentAction";
import type {
  ChangeNodeIndentResult,
  NodeIndentDirection,
} from "@/domain/nodes/nodeIndent";
import { createTestNode } from "@/testing/createTestNode";
import type { OperationNotice } from "@/types/operationNotice";

// R(1) の子が A(2)・T(4)・B(3) の順
const R = createTestNode({ id: 1, label: "R" });
const A = createTestNode({ id: 2, parentId: 1, label: "A" });
const T = createTestNode({ id: 4, parentId: 1, label: "T" });
const B = createTestNode({ id: 3, parentId: 1, label: "B" });
const NODES = [R, A, T, B];
const ALL_VISIBLE: ReadonlySet<number> = new Set([1, 2, 3, 4]);

const INDENT_OK: ChangeNodeIndentResult = {
  ok: true,
  direction: "indent",
  newParentId: 2,
  newParentLabel: "A",
  depth: 3,
};
const OUTDENT_OK: ChangeNodeIndentResult = {
  ok: true,
  direction: "outdent",
  newParentId: 1,
  newParentLabel: "R",
  depth: 2,
};

function createChange(result: ChangeNodeIndentResult = INDENT_OK) {
  return jest.fn<ChangeNodeIndentResult, [number, NodeIndentDirection, ReadonlySet<number>]>(
    () => result,
  );
}

type HookProps = {
  selectedNodeId: number | null;
  nodes?: typeof NODES;
  visibleNodeIds?: ReadonlySet<number>;
  changeNodeIndent?: ReturnType<typeof createChange>;
};

function renderAction(initial: HookProps) {
  const expandNodes = jest.fn<void, [readonly number[]]>();
  const publishNotice = jest.fn<void, [OperationNotice]>();
  const defaultChange = createChange();
  const rendered = renderHook(
    (props: HookProps) =>
      useNodeIndentAction({
        selectedNodeId: props.selectedNodeId,
        nodes: props.nodes ?? NODES,
        visibleNodeIds: props.visibleNodeIds ?? ALL_VISIBLE,
        changeNodeIndent: props.changeNodeIndent ?? defaultChange,
        expandNodes,
        publishNotice,
      }),
    { initialProps: initial },
  );
  return { ...rendered, expandNodes, publishNotice, defaultChange };
}

describe("useNodeIndentAction", () => {
  describe("canIndent / canOutdent", () => {
    it("未選択なら両方 false", () => {
      const { result } = renderAction({ selectedNodeId: null });
      expect(result.current.canIndent).toBe(false);
      expect(result.current.canOutdent).toBe(false);
    });

    it("T を選択すると両方 true", () => {
      const { result } = renderAction({ selectedNodeId: 4 });
      expect(result.current.canIndent).toBe(true);
      expect(result.current.canOutdent).toBe(true);
    });

    it("A は下げられず上げられる", () => {
      const { result } = renderAction({ selectedNodeId: 2 });
      expect(result.current.canIndent).toBe(false);
      expect(result.current.canOutdent).toBe(true);
    });

    it("R は両方 false", () => {
      const { result } = renderAction({ selectedNodeId: 1 });
      expect(result.current.canIndent).toBe(false);
      expect(result.current.canOutdent).toBe(false);
    });

    it("表示集合から A を外して T を選択すると canIndent は false", () => {
      const { result } = renderAction({ selectedNodeId: 4, visibleNodeIds: new Set([1, 3, 4]) });
      expect(result.current.canIndent).toBe(false);
    });

    it("nodes の順序が変わって rerender すると canIndent が変わる", () => {
      const { result, rerender } = renderAction({ selectedNodeId: 4 });
      expect(result.current.canIndent).toBe(true);
      rerender({ selectedNodeId: 4, nodes: [R, T, A, B] });
      expect(result.current.canIndent).toBe(false);
    });

    it("表示集合だけが変わって rerender すると canIndent が変わる", () => {
      const { result, rerender } = renderAction({ selectedNodeId: 4 });
      expect(result.current.canIndent).toBe(true);
      rerender({ selectedNodeId: 4, visibleNodeIds: new Set([1, 3, 4]) });
      expect(result.current.canIndent).toBe(false);
      rerender({ selectedNodeId: 4, visibleNodeIds: ALL_VISIBLE });
      expect(result.current.canIndent).toBe(true);
    });
  });

  describe("要求", () => {
    it("changeSelected('indent') は選択中のノードと渡した表示集合で1回呼ぶ", () => {
      const visible = new Set([1, 2, 3, 4]);
      const { result, defaultChange } = renderAction({ selectedNodeId: 4, visibleNodeIds: visible });
      result.current.changeSelected("indent");
      expect(defaultChange).toHaveBeenCalledTimes(1);
      expect(defaultChange.mock.calls[0][0]).toBe(4);
      expect(defaultChange.mock.calls[0][1]).toBe("indent");
      expect(defaultChange.mock.calls[0][2]).toBe(visible);
    });

    it("未選択の changeSelected は何も呼ばない", () => {
      const { result, defaultChange, expandNodes, publishNotice } = renderAction({
        selectedNodeId: null,
      });
      result.current.changeSelected("indent");
      result.current.changeSelected("outdent");
      expect(defaultChange).not.toHaveBeenCalled();
      expect(expandNodes).not.toHaveBeenCalled();
      expect(publishNotice).not.toHaveBeenCalled();
    });

    it("change(3, 'outdent') は (3, 'outdent', 表示集合) で呼ぶ", () => {
      const { result, defaultChange } = renderAction({ selectedNodeId: null });
      result.current.change(3, "outdent");
      expect(defaultChange).toHaveBeenCalledTimes(1);
      expect(defaultChange).toHaveBeenCalledWith(3, "outdent", ALL_VISIBLE);
    });
  });

  describe("展開", () => {
    it("成功した下げで新しい親を1回展開する", () => {
      const { result, expandNodes } = renderAction({ selectedNodeId: 4 });
      result.current.change(4, "indent");
      expect(expandNodes).toHaveBeenCalledTimes(1);
      expect(expandNodes).toHaveBeenCalledWith([2]);
    });

    it.each<[string, ChangeNodeIndentResult]>([
      ["成功した上げ", OUTDENT_OK],
      ["at-edge（下げる）", { ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: false, isRoot: false }],
      ["placement-failed", { ok: false, reason: "placement-failed" }],
      ["invalid-structure", { ok: false, reason: "invalid-structure" }],
    ])("%s では展開しない", (_name, outcome) => {
      const { result, expandNodes } = renderAction({
        selectedNodeId: 4,
        changeNodeIndent: createChange(outcome),
      });
      result.current.change(4, "indent");
      expect(expandNodes).not.toHaveBeenCalled();
    });
  });

  describe("通知", () => {
    it.each<[string, ChangeNodeIndentResult, OperationNotice]>([
      ["下げ成功", INDENT_OK, { kind: "status", message: "枝の階層を下げました（「A」の子、第3階層）。" }],
      ["上げ成功", OUTDENT_OK, { kind: "status", message: "枝の階層を上げました（「R」の子、第2階層）。" }],
      [
        "at-edge",
        { ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: false, isRoot: false },
        { kind: "status", message: "これ以上階層を下げられません（見えている直前の兄弟がありません）。" },
      ],
      [
        "placement-failed",
        { ok: false, reason: "placement-failed" },
        { kind: "error", message: "枝の階層を変更できませんでした。" },
      ],
      [
        "invalid-structure",
        { ok: false, reason: "invalid-structure" },
        { kind: "error", message: "枝の階層を変更できませんでした。" },
      ],
    ])("%s で通知を1回発行する", (_name, outcome, expected) => {
      const { result, publishNotice } = renderAction({
        selectedNodeId: 4,
        changeNodeIndent: createChange(outcome),
      });
      result.current.change(4, "indent");
      expect(publishNotice).toHaveBeenCalledTimes(1);
      expect(publishNotice).toHaveBeenCalledWith(expected);
    });
  });

  it("成功した下げは changeNodeIndent → expandNodes → publishNotice の順に呼ぶ", () => {
    const { result, defaultChange, expandNodes, publishNotice } = renderAction({ selectedNodeId: 4 });
    result.current.change(4, "indent");
    const change = defaultChange.mock.invocationCallOrder[0];
    const expand = expandNodes.mock.invocationCallOrder[0];
    const publish = publishNotice.mock.invocationCallOrder[0];
    expect(change).toBeLessThan(expand);
    expect(expand).toBeLessThan(publish);
  });
});
