import { useLayoutEffect, useRef, useState } from "react";
import type { useNodes } from "@/hooks/useNodes";
import { useOutlineLabelDraft, type OutlineLabelDraft } from "@/hooks/useOutlineLabelDraft";
import { useSiblingReorderAction } from "@/hooks/useSiblingReorderAction";
import { useNodeIndentAction } from "@/hooks/useNodeIndentAction";
import { canDeleteNodeOnly } from "@/domain/nodes/nodeOnlyDeletion";
import { formatNodeOnlyDeletionFailureNotice } from "@/domain/nodes/nodeOnlyDeletionMessages";
import { formatOutlineInsertFailure } from "@/domain/outline/outlineMessages";
import type { OutlineRows } from "@/domain/outline/outlineRows";
import type { SiblingReorderDirection } from "@/domain/nodes/nodeSiblingOrder";
import type { NodeIndentDirection } from "@/domain/nodes/nodeIndent";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";
type NodesApi = ReturnType<typeof useNodes>;
export type OutlineFocusRequest = {
    target: {
        kind: "row";
        nodeId: number;
    } | {
        kind: "root-add";
    };
    documentRevision: number;
    sequence: number;
};
export type UseOutlineEditorActionsOptions = {
    nodes: readonly Node[];
    selectedNodeId: number | null;
    documentRevision: number;
    enabled: boolean;
    model: OutlineRows;
    api: Pick<NodesApi, "selectNode" | "updateNodeLabel" | "insertForest" | "addChildNode" | "addSiblingNode" | "reorderSibling" | "changeNodeIndent" | "deleteNodeOnly">;
    expandNodes: (ids: readonly number[]) => void;
    publishNotice: (notice: OperationNotice) => void;
};
export type OutlineEditorActions = {
    draft: OutlineLabelDraft | null;
    focusRequest: OutlineFocusRequest | null;
    canAddRoot: boolean;
    canAddRelated: boolean;
    canEdit: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    canIndent: boolean;
    canOutdent: boolean;
    canDelete: boolean;
    select: (id: number) => void;
    beginEdit: (id: number) => void;
    setDraftText: (text: string) => void;
    finishEdit: (restoreFocus: boolean) => void;
    cancelEdit: () => void;
    invalidateDraft: () => void;
    addRoot: () => void;
    addChild: () => void;
    addSibling: () => void;
    move: (direction: SiblingReorderDirection) => void;
    changeIndent: (direction: NodeIndentDirection) => void;
    deleteSelected: () => void;
};
export function useOutlineEditorActions(options: UseOutlineEditorActionsOptions): OutlineEditorActions {
    const { nodes, selectedNodeId, documentRevision, enabled, model, api, expandNodes, publishNotice } = options;
    const label = useOutlineLabelDraft({ nodes, documentRevision, enabled, duplicateIds: model.duplicateIds, updateNodeLabel: api.updateNodeLabel, publishNotice });
    const reorder = useSiblingReorderAction({ nodes, selectedNodeId, visibleNodeIds: model.allNodeIds, reorderSibling: api.reorderSibling, publishNotice });
    const indent = useNodeIndentAction({ nodes, selectedNodeId, visibleNodeIds: model.allNodeIds, changeNodeIndent: api.changeNodeIndent, expandNodes, publishNotice });
    const [focusRequest, setFocusRequest] = useState<OutlineFocusRequest | null>(null);
    const sequence = useRef(0);
    const latest = useRef({ options, label, reorder, indent });
    useLayoutEffect(() => { latest.current = { options, label, reorder, indent }; });
    const editable = enabled && !model.duplicateIds;
    const structural = editable && !model.invalidStructure;
    const selected = selectedNodeId !== null && model.allNodeIds.has(selectedNodeId);
    const canDelete = structural && canDeleteNodeOnly(nodes, selectedNodeId, model.allNodeIds);
    function requestFocus(target: OutlineFocusRequest["target"]) {
        setFocusRequest({ target, documentRevision: latest.current.options.documentRevision, sequence: ++sequence.current });
    }
    function mayEdit(id: number) {
        const current = latest.current.options;
        return current.enabled && !current.model.duplicateIds && current.model.allNodeIds.has(id);
    }
    function mayChangeStructure() {
        const current = latest.current.options;
        return current.enabled && !current.model.invalidStructure && !current.model.duplicateIds;
    }
    function startAdded(id: number) {
        latest.current.label.begin(id, "");
    }
    function addRelated(kind: "child" | "sibling") {
        const current = latest.current.options;
        if (!mayChangeStructure() || current.selectedNodeId === null || !mayEdit(current.selectedNodeId))
            return;
        const id = kind === "child" ? current.api.addChildNode(current.selectedNodeId) : current.api.addSiblingNode(current.selectedNodeId);
        if (id === null)
            current.publishNotice({ kind: "error", message: formatOutlineInsertFailure("placement-failed") });
        else
            startAdded(id);
    }
    return {
        draft: label.draft,
        focusRequest: enabled && focusRequest?.documentRevision === documentRevision ? focusRequest : null,
        canAddRoot: structural, canAddRelated: structural && selected, canEdit: editable && selected,
        canMoveUp: structural && reorder.canMoveUp, canMoveDown: structural && reorder.canMoveDown,
        canIndent: structural && indent.canIndent, canOutdent: structural && indent.canOutdent, canDelete,
        select(id) { if (mayEdit(id))
            latest.current.options.api.selectNode(id); },
        beginEdit(id) { if (mayEdit(id)) {
            latest.current.options.api.selectNode(id);
            latest.current.label.begin(id);
        } },
        setDraftText: label.setText,
        finishEdit(restoreFocus) { const id = latest.current.label.commit(); if (restoreFocus && id !== null)
            requestFocus({ kind: "row", nodeId: id }); },
        cancelEdit() { const id = latest.current.label.cancel(); if (id !== null && mayEdit(id))
            requestFocus({ kind: "row", nodeId: id }); },
        invalidateDraft: label.invalidate,
        addRoot() {
            if (!mayChangeStructure())
                return;
            const current = latest.current.options;
            const result = current.api.insertForest([{ label: "", parentIndex: null }], { kind: "root" });
            if (result.ok)
                startAdded(result.rootId);
            else
                current.publishNotice({ kind: "error", message: formatOutlineInsertFailure(result.reason) });
        },
        addChild() { addRelated("child"); },
        addSibling() { addRelated("sibling"); },
        move(direction) {
            const current = latest.current;
            if (mayChangeStructure() && (direction === "up" ? current.reorder.canMoveUp : current.reorder.canMoveDown))
                current.reorder.moveSelected(direction);
        },
        changeIndent(direction) {
            const current = latest.current;
            if (mayChangeStructure() && (direction === "indent" ? current.indent.canIndent : current.indent.canOutdent))
                current.indent.changeSelected(direction);
        },
        deleteSelected() {
            const current = latest.current.options;
            const id = current.selectedNodeId;
            if (!mayChangeStructure() || id === null || !canDeleteNodeOnly(current.nodes, id, current.model.allNodeIds))
                return;
            const result = current.api.deleteNodeOnly(id, current.model.allNodeIds);
            if (!result.ok) {
                current.publishNotice(formatNodeOnlyDeletionFailureNotice(result.reason));
                return;
            }
            latest.current.label.invalidate();
            current.publishNotice({ kind: "status", message: "ノードだけ削除しました。子孫は残っています。" });
            const first = current.model.rows.find((row) => row.nodeId !== id);
            requestFocus(first ? { kind: "row", nodeId: first.nodeId } : { kind: "root-add" });
        },
    };
}
