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
/** アウトライン UI（Toolbar / Editor）が使う入口。パレット Core は含まない */
export type OutlineEditorUiActions = {
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
/** パレット用: enabled ガード迂回（構造・重複チェックは残す） */
export type OutlineEditorCoreActions = {
    /** パレット可否用。enabled を畳み込まず allNodeIds 基準の構造可否だけを返す */
    structureCanMoveUp: boolean;
    structureCanMoveDown: boolean;
    structureCanIndent: boolean;
    structureCanOutdent: boolean;
    structureCanDelete: boolean;
    beginEditCore: (id: number) => void;
    addRootCore: () => void;
    addChildCore: () => void;
    addSiblingCore: () => void;
    moveCore: (direction: SiblingReorderDirection) => void;
    changeIndentCore: (direction: NodeIndentDirection) => void;
    deleteSelectedCore: () => void;
};
export type OutlineEditorActions = OutlineEditorUiActions & OutlineEditorCoreActions;
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
    // パレット open 中は enabled=false なので、可否は構造条件だけを別公開する
    const structureOk = !model.duplicateIds && !model.invalidStructure;
    const selected = selectedNodeId !== null && model.allNodeIds.has(selectedNodeId);
    const structureCanDelete = structureOk && canDeleteNodeOnly(nodes, selectedNodeId, model.allNodeIds);
    const canDelete = structural && structureCanDelete;
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
    /** enabled 非依存。重複・不正構造だけ拒否（パレット Core 用） */
    function mayEditIgnoringEnabled(id: number) {
        const current = latest.current.options;
        return !current.model.duplicateIds && current.model.allNodeIds.has(id);
    }
    function mayChangeStructureIgnoringEnabled() {
        const current = latest.current.options;
        return !current.model.invalidStructure && !current.model.duplicateIds;
    }
    function startAdded(id: number, retainWhileDisabled = false) {
        latest.current.label.begin(id, "", retainWhileDisabled ? { retainWhileDisabled: true } : undefined);
    }
    function addRelated(kind: "child" | "sibling", ignoreEnabled: boolean) {
        const current = latest.current.options;
        const canStructure = ignoreEnabled ? mayChangeStructureIgnoringEnabled() : mayChangeStructure();
        const canEditSelected = current.selectedNodeId !== null && (
            ignoreEnabled
                ? mayEditIgnoringEnabled(current.selectedNodeId)
                : mayEdit(current.selectedNodeId)
        );
        if (!canStructure || current.selectedNodeId === null || !canEditSelected)
            return;
        const id = kind === "child" ? current.api.addChildNode(current.selectedNodeId) : current.api.addSiblingNode(current.selectedNodeId);
        if (id === null)
            current.publishNotice({ kind: "error", message: formatOutlineInsertFailure("placement-failed") });
        else
            startAdded(id, ignoreEnabled);
    }
    function runAddRoot(ignoreEnabled: boolean) {
        if (!(ignoreEnabled ? mayChangeStructureIgnoringEnabled() : mayChangeStructure()))
            return;
        const current = latest.current.options;
        const result = current.api.insertForest([{ label: "", parentIndex: null }], { kind: "root" });
        if (result.ok)
            startAdded(result.rootId, ignoreEnabled);
        else
            current.publishNotice({ kind: "error", message: formatOutlineInsertFailure(result.reason) });
    }
    function runBeginEdit(id: number, ignoreEnabled: boolean) {
        if (!(ignoreEnabled ? mayEditIgnoringEnabled(id) : mayEdit(id)))
            return;
        latest.current.options.api.selectNode(id);
        latest.current.label.begin(id, undefined, ignoreEnabled ? { retainWhileDisabled: true } : undefined);
    }
    function runMove(direction: SiblingReorderDirection, ignoreEnabled: boolean) {
        const current = latest.current;
        const canStructure = ignoreEnabled ? mayChangeStructureIgnoringEnabled() : mayChangeStructure();
        if (canStructure && (direction === "up" ? current.reorder.canMoveUp : current.reorder.canMoveDown))
            current.reorder.moveSelected(direction);
    }
    function runChangeIndent(direction: NodeIndentDirection, ignoreEnabled: boolean) {
        const current = latest.current;
        const canStructure = ignoreEnabled ? mayChangeStructureIgnoringEnabled() : mayChangeStructure();
        if (canStructure && (direction === "indent" ? current.indent.canIndent : current.indent.canOutdent))
            current.indent.changeSelected(direction);
    }
    function runDeleteSelected(ignoreEnabled: boolean) {
        const current = latest.current.options;
        const canStructure = ignoreEnabled ? mayChangeStructureIgnoringEnabled() : mayChangeStructure();
        const id = current.selectedNodeId;
        if (!canStructure || id === null || !canDeleteNodeOnly(current.nodes, id, current.model.allNodeIds))
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
    }
    return {
        draft: label.draft,
        focusRequest: enabled && focusRequest?.documentRevision === documentRevision ? focusRequest : null,
        canAddRoot: structural, canAddRelated: structural && selected, canEdit: editable && selected,
        canMoveUp: structural && reorder.canMoveUp, canMoveDown: structural && reorder.canMoveDown,
        canIndent: structural && indent.canIndent, canOutdent: structural && indent.canOutdent, canDelete,
        select(id) { if (mayEdit(id))
            latest.current.options.api.selectNode(id); },
        beginEdit(id) { runBeginEdit(id, false); },
        setDraftText: label.setText,
        finishEdit(restoreFocus) { const id = latest.current.label.commit(); if (restoreFocus && id !== null)
            requestFocus({ kind: "row", nodeId: id }); },
        cancelEdit() { const id = latest.current.label.cancel(); if (id !== null && mayEdit(id))
            requestFocus({ kind: "row", nodeId: id }); },
        invalidateDraft: label.invalidate,
        addRoot() { runAddRoot(false); },
        addChild() { addRelated("child", false); },
        addSibling() { addRelated("sibling", false); },
        move(direction) { runMove(direction, false); },
        changeIndent(direction) { runChangeIndent(direction, false); },
        deleteSelected() { runDeleteSelected(false); },
        structureCanMoveUp: structureOk && reorder.canMoveUp,
        structureCanMoveDown: structureOk && reorder.canMoveDown,
        structureCanIndent: structureOk && indent.canIndent,
        structureCanOutdent: structureOk && indent.canOutdent,
        structureCanDelete,
        beginEditCore(id) { runBeginEdit(id, true); },
        addRootCore() { runAddRoot(true); },
        addChildCore() { addRelated("child", true); },
        addSiblingCore() { addRelated("sibling", true); },
        moveCore(direction) { runMove(direction, true); },
        changeIndentCore(direction) { runChangeIndent(direction, true); },
        deleteSelectedCore() { runDeleteSelected(true); },
    };
}
