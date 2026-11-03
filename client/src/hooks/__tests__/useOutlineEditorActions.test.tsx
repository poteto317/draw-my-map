import { act, renderHook } from "@testing-library/react";
import { useOutlineEditorActions, type UseOutlineEditorActionsOptions } from "@/hooks/useOutlineEditorActions";
import { buildOutlineRows } from "@/domain/outline/outlineRows";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
function setup(overrides: Partial<UseOutlineEditorActionsOptions> = {}) {
    const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2 })];
    const props: UseOutlineEditorActionsOptions = { nodes, model: buildOutlineRows(nodes), selectedNodeId: 2, enabled: true, documentRevision: 0,
        api: { selectNode: jest.fn(), updateNodeLabel: jest.fn(), insertForest: jest.fn(() => ({ ok: true, rootId: 3, count: 1 })), addChildNode: jest.fn(() => 3), addSiblingNode: jest.fn(() => 3), reorderSibling: jest.fn(), changeNodeIndent: jest.fn(), deleteNodeOnly: jest.fn(() => ({ ok: true, deletedId: 2 })) }, expandNodes: jest.fn(), publishNotice: jest.fn(), ...overrides };
    return { props, ...renderHook(useOutlineEditorActions, { initialProps: props }) };
}
it("空マップではルート追加だけが可能", () => { const h = setup({ nodes: [], model: buildOutlineRows([]), selectedNodeId: null }); expect(h.result.current.canAddRoot).toBe(true); expect(h.result.current.canAddRelated).toBe(false); expect(h.result.current.canDelete).toBe(false); });
it.each(["addRoot", "addChild", "addSibling"] as const)("%s成功の新IDを編集する", action => {
    const h = setup();
    act(() => h.result.current[action]());
    expect(h.props.api.selectNode).not.toHaveBeenCalled();
    h.rerender({ ...h.props, nodes: [...h.props.nodes, createTestNode({ id: 3 })], model: buildOutlineRows([...h.props.nodes, createTestNode({ id: 3 })]) });
    expect(h.result.current.draft?.nodeId).toBe(3);
    const api = action === "addRoot" ? h.props.api.insertForest : action === "addChild" ? h.props.api.addChildNode : h.props.api.addSiblingNode;
    expect(api).toHaveBeenCalledTimes(1);
});
it("追加失敗はdraftとfocusを変更しない", () => { const h = setup(); jest.mocked(h.props.api.addChildNode).mockReturnValue(null); act(() => h.result.current.addChild()); expect(h.result.current.draft).toBeNull(); expect(h.result.current.focusRequest).toBeNull(); expect(h.props.publishNotice).toHaveBeenCalledTimes(1); });
it("削除成功は全件集合を渡し、選択せず残った先頭へfocus", () => { const h = setup(); act(() => h.result.current.deleteSelected()); expect(h.props.api.deleteNodeOnly).toHaveBeenCalledWith(2, h.props.model.allNodeIds); expect(h.props.api.selectNode).not.toHaveBeenCalled(); expect(h.result.current.focusRequest?.target).toEqual({ kind: "row", nodeId: 1 }); });
it("disabled後は古いcallbackでも操作しない", () => { const h = setup(); const add = h.result.current.addRoot; h.rerender({ ...h.props, enabled: false }); act(() => add()); expect(h.props.api.insertForest).not.toHaveBeenCalled(); });
it("ルート追加失敗も元のdraftとfocusを保持する", () => {
    const h = setup();
    act(() => h.result.current.beginEdit(2));
    const draft = h.result.current.draft;
    jest.mocked(h.props.api.insertForest).mockReturnValue({ ok: false, reason: "placement-failed" });
    act(() => h.result.current.addRoot());
    expect(h.result.current.draft).toBe(draft);
    expect(h.result.current.focusRequest).toBeNull();
    expect(h.props.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
});
it("移動と階層変更は全件集合を渡し既存通知と展開を利用", () => {
    const h = setup();
    jest.mocked(h.props.api.reorderSibling).mockReturnValue({ ok: false, reason: "placement-failed" });
    jest.mocked(h.props.api.changeNodeIndent).mockReturnValue({ ok: true, direction: "indent", newParentId: 1, newParentLabel: "", depth: 2 });
    act(() => h.result.current.move("up"));
    act(() => h.result.current.changeIndent("indent"));
    expect(h.props.api.reorderSibling).toHaveBeenCalledWith(2, { kind: "step", direction: "up" }, h.props.model.allNodeIds);
    expect(h.props.api.changeNodeIndent).toHaveBeenCalledWith(2, "indent", h.props.model.allNodeIds);
    expect(h.props.expandNodes).toHaveBeenCalledWith([1]);
    expect(h.props.publishNotice).toHaveBeenCalledTimes(2);
});
it("先頭の上移動と階層下げ、ルートの階層上げを無効にする", () => {
    const h = setup({ selectedNodeId: 1 });
    expect(h.result.current.canMoveUp).toBe(false);
    expect(h.result.current.canIndent).toBe(false);
    expect(h.result.current.canOutdent).toBe(false);
    act(() => { h.result.current.move("up"); h.result.current.changeIndent("indent"); h.result.current.changeIndent("outdent"); });
    expect(h.props.api.reorderSibling).not.toHaveBeenCalled();
    expect(h.props.api.changeNodeIndent).not.toHaveBeenCalled();
});
it.each(["孤立", "重複"])("%sの場合に構造操作を実行しない", kind => {
    const h = setup();
    const nodes = kind === "孤立" ? [createTestNode({ id: 2, parentId: 999 })] : [createTestNode({ id: 2 }), createTestNode({ id: 2 })];
    const add = h.result.current.addRoot;
    h.rerender({ ...h.props, nodes, model: buildOutlineRows(nodes) });
    expect(h.result.current.canAddRoot).toBe(false);
    expect(h.result.current.canEdit).toBe(kind === "孤立");
    act(() => { add(); h.result.current.addChild(); h.result.current.deleteSelected(); h.result.current.beginEdit(2); });
    expect(h.props.api.insertForest).not.toHaveBeenCalled();
    expect(h.props.api.addChildNode).not.toHaveBeenCalled();
    expect(h.props.api.deleteNodeOnly).not.toHaveBeenCalled();
    if (kind === "重複")
        expect(h.result.current.draft).toBeNull();
});
it("削除失敗は選択とfocusを保持しformatter通知を出す", () => {
    const h = setup();
    jest.mocked(h.props.api.deleteNodeOnly).mockReturnValue({ ok: false, reason: "node-missing" });
    act(() => h.result.current.deleteSelected());
    expect(h.result.current.focusRequest).toBeNull();
    expect(h.props.api.selectNode).not.toHaveBeenCalled();
    expect(h.props.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
});
it("最後のノード削除でroot-addへfocusする", () => {
    const nodes = [createTestNode({ id: 2 })];
    const h = setup({ nodes, model: buildOutlineRows(nodes) });
    act(() => h.result.current.deleteSelected());
    expect(h.result.current.focusRequest?.target).toEqual({ kind: "root-add" });
});
it("編集完了とcancelのfocus要求はrevisionと連番を持つ", () => {
    const h = setup();
    act(() => { h.result.current.beginEdit(2); h.result.current.setDraftText("変更"); h.result.current.finishEdit(true); h.result.current.finishEdit(true); });
    expect(h.props.api.updateNodeLabel).toHaveBeenCalledTimes(1);
    expect(h.result.current.focusRequest).toEqual({ target: { kind: "row", nodeId: 2 }, documentRevision: 0, sequence: 1 });
    act(() => { h.result.current.beginEdit(2); h.result.current.cancelEdit(); });
    expect(h.result.current.focusRequest?.sequence).toBe(2);
    h.rerender({ ...h.props, documentRevision: 1 });
    expect(h.result.current.focusRequest).toBeNull();
});
function useIntegratedActions() {
    const api = useNodes();
    const actions = useOutlineEditorActions({ nodes: api.nodes, model: buildOutlineRows(api.nodes), selectedNodeId: api.selectedNodeId, documentRevision: api.documentRevision, enabled: true, api, expandNodes: () => { }, publishNotice: () => { } });
    return { api, actions };
}
it("実useNodesの追加は選択と空draftを同じ新IDにしラベル確定を別履歴にする", () => {
    const h = renderHook(useIntegratedActions);
    act(() => h.result.current.actions.addRoot());
    const id = h.result.current.api.selectedNodeId;
    expect(id).not.toBeNull();
    expect(h.result.current.actions.draft?.nodeId).toBe(id);
    act(() => { h.result.current.actions.setDraftText("新ラベル"); h.result.current.actions.finishEdit(false); });
    expect(h.result.current.api.nodes[0].label).toBe("新ラベル");
    act(() => h.result.current.api.undo());
    expect(h.result.current.api.nodes[0].label).toBe("");
    act(() => h.result.current.api.undo());
    expect(h.result.current.api.nodes).toEqual([]);
});
it.each(["undo", "redo"] as const)("成功%sがrevisionを進めると古いdraftを保存しない", operation => {
    const h = renderHook(useIntegratedActions);
    act(() => h.result.current.actions.addRoot());
    const id = h.result.current.api.selectedNodeId!;
    act(() => h.result.current.api.updateNodeLabel(id, "確定済み"));
    if (operation === "redo")
        act(() => h.result.current.api.undo());
    act(() => { h.result.current.actions.beginEdit(id); h.result.current.actions.setDraftText("古い入力"); });
    const finish = h.result.current.actions.finishEdit;
    const before = h.result.current.api.documentRevision;
    act(() => { expect(h.result.current.api[operation]()).toBe(true); });
    expect(h.result.current.api.documentRevision).toBe(before + 1);
    act(() => finish(false));
    expect(h.result.current.api.nodes[0].label).toBe(operation === "undo" ? "" : "確定済み");
    expect(h.result.current.actions.draft).toBeNull();
});

it.each(["undo", "redo"] as const)("空履歴の実%sはfalseを返しrevisionとdraftを保ち、その後のラベル確定は成功する", operation => {
    const h = renderHook(useIntegratedActions);
    const node = createTestNode({ id: 1, label: "保存済み" });
    act(() => h.result.current.api.replaceMap({ nodes: [node], layoutMode: "manual" }));
    expect(h.result.current.api.canUndo).toBe(false);
    expect(h.result.current.api.canRedo).toBe(false);
    act(() => {
        h.result.current.actions.beginEdit(1);
        h.result.current.actions.setDraftText("確定するdraft");
    });
    const revision = h.result.current.api.documentRevision;
    const draft = h.result.current.actions.draft;
    act(() => { expect(h.result.current.api[operation]()).toBe(false); });
    expect(h.result.current.api.documentRevision).toBe(revision);
    expect(h.result.current.actions.draft).toBe(draft);
    expect(h.result.current.api.nodes).toEqual([node]);
    act(() => h.result.current.actions.finishEdit(false));
    expect(h.result.current.actions.draft).toBeNull();
    expect(h.result.current.api.nodes).toEqual([{ ...node, label: "確定するdraft" }]);
    act(() => { expect(h.result.current.api.undo()).toBe(true); });
    expect(h.result.current.api.nodes).toEqual([node]);
    expect(h.result.current.api.canUndo).toBe(false);
});
