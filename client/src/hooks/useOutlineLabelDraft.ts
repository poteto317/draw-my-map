import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { useNodes } from "@/hooks/useNodes";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";
type NodesApi = ReturnType<typeof useNodes>;
export type OutlineLabelDraft = {
    nodeId: number;
    documentRevision: number;
    originalLabel: string;
    text: string;
    /**
     * パレット Core 開始時。enabled が偽でも draft を保持する（スケジューラ詳細に依存しない）。
     * enabled が真に戻ったら通常の可否判定へ戻す。
     */
    retainWhileDisabled?: boolean;
};
type Options = {
    nodes: readonly Node[];
    documentRevision: number;
    enabled: boolean;
    duplicateIds: boolean;
    updateNodeLabel: NodesApi["updateNodeLabel"];
    publishNotice: (notice: OperationNotice) => void;
};
export type BeginOutlineLabelDraftOptions = {
    retainWhileDisabled?: boolean;
};
const STALE_DRAFT: OperationNotice = {
    kind: "warning", message: "マップが変更されたため、編集中の内容を破棄しました。",
};
function isDataValid(draft: OutlineLabelDraft, options: Options): boolean {
    return !options.duplicateIds
        && draft.documentRevision === options.documentRevision
        && options.nodes.some((node) => node.id === draft.nodeId && node.label === draft.originalLabel);
}
function isValid(draft: OutlineLabelDraft, options: Options): boolean {
    const enabledOk = options.enabled || draft.retainWhileDisabled === true;
    return enabledOk && isDataValid(draft, options);
}
export function useOutlineLabelDraft(options: Options) {
    const [draft, setDraft] = useState<OutlineLabelDraft | null>(null);
    const active = useRef<OutlineLabelDraft | null>(null);
    const latest = useRef(options);
    const mounted = useRef(true);
    const clear = useCallback(() => {
        active.current = null;
        if (mounted.current)
            setDraft(null);
    }, []);
    useLayoutEffect(() => { latest.current = options; });
    const { nodes, documentRevision, enabled, duplicateIds } = options;
    useLayoutEffect(() => {
        const current = latest.current;
        let pending = active.current;
        if (!pending)
            return;
        if (current.enabled && pending.retainWhileDisabled) {
            pending = {
                nodeId: pending.nodeId,
                documentRevision: pending.documentRevision,
                originalLabel: pending.originalLabel,
                text: pending.text,
            };
            active.current = pending;
            setDraft(pending);
        }
        if (!isValid(pending, current)) {
            // 外部の正本変更で入力を同期失効させ、後着blurによる書き戻しを防ぐ。
            clear();
            if (current.enabled && !current.duplicateIds)
                current.publishNotice(STALE_DRAFT);
        }
    }, [nodes, documentRevision, enabled, duplicateIds, clear]);
    useLayoutEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; active.current = null; };
    }, []);
    // enabled は UI 入口（beginEdit）側で見る。パレット Core は retainWhileDisabled で明示する。
    const begin = useCallback((nodeId: number, initialLabel?: string, beginOptions?: BeginOutlineLabelDraftOptions) => {
        const current = latest.current;
        if (!mounted.current || current.duplicateIds)
            return;
        const node = current.nodes.find((candidate) => candidate.id === nodeId);
        if (!node && initialLabel === undefined)
            return;
        const next: OutlineLabelDraft = {
            nodeId,
            documentRevision: current.documentRevision,
            originalLabel: node?.label ?? initialLabel!,
            text: node?.label ?? initialLabel!,
            ...(beginOptions?.retainWhileDisabled ? { retainWhileDisabled: true } : {}),
        };
        active.current = next;
        setDraft(next);
    }, []);
    const setText = useCallback((text: string) => {
        if (!active.current || !mounted.current)
            return;
        const next = { ...active.current, text };
        active.current = next;
        setDraft(next);
    }, []);
    const commit = useCallback((): number | null => {
        const pending = active.current;
        if (!pending || !mounted.current)
            return null;
        const current = latest.current;
        clear(); // API呼び出しより先に消費し、同じイベント列のblurを無効にする。
        if (!isValid(pending, current)) {
            if (current.enabled && !current.duplicateIds)
                current.publishNotice(STALE_DRAFT);
            return null;
        }
        if (pending.text !== pending.originalLabel) {
            if (!current.updateNodeLabel(pending.nodeId, pending.text)) {
                // 失敗時は draft を戻し、確定成功にしない（L-001）
                active.current = pending;
                if (mounted.current)
                    setDraft(pending);
                return null;
            }
        }
        return pending.nodeId;
    }, [clear]);
    const cancel = useCallback((): number | null => {
        const id = active.current?.nodeId ?? null;
        clear();
        return id;
    }, [clear]);
    return { draft, begin, setText, commit, cancel, invalidate: clear };
}
