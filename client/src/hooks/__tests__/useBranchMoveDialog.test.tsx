import { act, renderHook } from "@testing-library/react";
import { useBranchMoveDialog } from "@/hooks/useBranchMoveDialog";
import { useNodes } from "@/hooks/useNodes";
import type { Node } from "@/types/node";

const nodes: Node[] = [
  { id: 1, parentId: null, label: "元親", x: 0, y: 0, width: 100, height: 60, importance: "medium" },
  { id: 2, parentId: 1, label: "枝", x: 200, y: 0, width: 100, height: 60, importance: "low" },
  { id: 3, parentId: 2, label: "子", x: 400, y: 0, width: 100, height: 60, importance: "low" },
  { id: 4, parentId: null, label: "祖先", x: 0, y: 300, width: 100, height: 60, importance: "low" },
  { id: 5, parentId: 4, label: "親", x: 200, y: 300, width: 100, height: 60, importance: "low" },
];

const TIMESTAMP = "2026-10-31T00:00:00.000Z";

function setup(resolutionVisibleNodeIds: ReadonlySet<number> = new Set([1])) {
  const expandNodes = jest.fn();
  const setResolutionMode = jest.fn();
  const publishNotice = jest.fn();
  const transfer = jest.fn(() => ({
    ok: false as const,
    notice: { kind: "error" as const, message: "保存できません" },
  }));
  const hook = renderHook(() => {
    const editor = useNodes();
    const dialog = useBranchMoveDialog({
      mapId: "a",
      mapMoveTargets: [
        { id: "a", name: "A", updatedAt: TIMESTAMP },
        { id: "b", name: "B", updatedAt: TIMESTAMP },
      ],
      nodes: editor.nodes,
      selectedNodeId: editor.selectedNodeId,
      documentRevision: editor.documentRevision,
      moveBranch: editor.moveBranch,
      onMoveBranchToMap: transfer,
      expandNodes,
      setResolutionMode,
      resolutionVisibleNodeIds,
      publishNotice,
    });
    return { editor, dialog };
  });
  act(() => hook.result.current.editor.replaceMap({ nodes, layoutMode: "manual" }));
  act(() => hook.result.current.editor.selectNode(2));
  return { ...hook, expandNodes, setResolutionMode, publishNotice, transfer };
}

it("開いた時点のsourceを固定して成功時だけ全祖先を展開し全表示にする", () => {
  const h = setup();
  act(() => h.result.current.dialog.open());
  act(() => h.result.current.editor.selectNode(3));
  act(() => h.result.current.dialog.setParentTarget("5"));
  expect(h.expandNodes).not.toHaveBeenCalled();
  expect(h.setResolutionMode).not.toHaveBeenCalled();

  act(() => h.result.current.dialog.submit());

  expect(h.result.current.editor.nodes.find(n => n.id === 2)?.parentId).toBe(5);
  expect(h.result.current.editor.nodes.find(n => n.id === 3)?.parentId).toBe(2);
  expect(h.expandNodes).toHaveBeenCalledWith([5, 4]);
  expect(h.setResolutionMode).toHaveBeenCalledWith("all");
  expect(h.result.current.dialog.screen).toBe("closed");
  expect(h.result.current.dialog.focusRequest).toBe("header");
  expect(h.publishNotice).toHaveBeenCalledWith({
    kind: "status",
    message: "枝を移動しました。Fキーで選択ノードへ移動できます。",
  });
  expect(h.result.current.dialog).not.toHaveProperty("sourceId");
});

it("sourceが見えていれば、移動先の祖先が隠れていても表示レベルを変えない", () => {
  // 見える集合は祖先を含むので、source が見えていれば移動先の祖先も移動後に見える
  const h = setup(new Set([1, 2, 3]));
  act(() => h.result.current.dialog.open());
  act(() => h.result.current.dialog.setParentTarget("5"));

  act(() => h.result.current.dialog.submit());

  expect(h.result.current.editor.nodes.find(n => n.id === 2)?.parentId).toBe(5);
  expect(h.expandNodes).toHaveBeenCalledWith([5, 4]);
  expect(h.setResolutionMode).not.toHaveBeenCalled();
});

it("置換後に同じIDがあっても古い確定操作を拒否する", () => {
  const h = setup();
  act(() => h.result.current.dialog.open());
  act(() => h.result.current.dialog.setParentTarget("5"));
  const oldSequence = h.result.current.dialog.error.sequence;
  const oldSubmit = h.result.current.dialog.submit;

  act(() => h.result.current.editor.replaceMap({ nodes, layoutMode: "manual" }));

  expect(h.result.current.dialog.canSubmit).toBe(false);
  expect(h.result.current.dialog.error.sequence).toBeGreaterThan(oldSequence);
  act(oldSubmit);
  expect(h.result.current.editor.nodes).toEqual(nodes);
  expect(h.expandNodes).not.toHaveBeenCalled();
  expect(h.publishNotice).not.toHaveBeenCalled();
});

it("別マップの失敗では閉じず表示調整も通知も行わない", () => {
  const h = setup();
  act(() => h.result.current.dialog.open());
  act(() => h.result.current.dialog.setTargetMapId("b"));

  act(() => h.result.current.dialog.submit());

  expect(h.transfer).toHaveBeenCalledWith(2, "b");
  expect(h.result.current.dialog.screen).toBe("open");
  expect(h.result.current.dialog.error.message).toBe("保存できません");
  expect(h.result.current.editor.nodes).toEqual(nodes);
  expect(h.expandNodes).not.toHaveBeenCalled();
  expect(h.publishNotice).not.toHaveBeenCalled();
});

it("現在の親や子孫を候補にせず、未選択・不正候補は確定できない", () => {
  const h = setup();
  act(() => h.result.current.dialog.open());
  expect(h.result.current.dialog.parentCandidates.map(n => n.id)).toEqual([4, 5]);
  expect(h.result.current.dialog.canSubmit).toBe(false);

  act(() => h.result.current.dialog.setParentTarget("3"));
  act(() => h.result.current.dialog.submit());
  expect(h.result.current.editor.nodes).toEqual(nodes);

  act(() => h.result.current.dialog.close());
  act(() => h.result.current.editor.selectNode(null));
  act(() => h.result.current.dialog.open());
  expect(h.result.current.dialog.screen).toBe("closed");
});
