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
};
type Options = {
    nodes: readonly Node[];
    documentRevision: number;
    enabled: boolean;
    duplicateIds: boolean;
    updateNodeLabel: NodesApi["updateNodeLabel"];
    publishNotice: (notice: OperationNotice) => void;
};
const STALE_DRAFT: OperationNotice = {
    kind: "warning", message: "マップが変更されたため、編集中の内容を破棄しました。",
};
function isValid(draft: OutlineLabelDraft, options: Options): boolean {
    return options.enabled && !options.duplicateIds
        && draft.documentRevision === options.documentRevision
        && options.nodes.some((node) => node.id === draft.nodeId && node.label === draft.originalLabel);
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
        if (active.current && !isValid(active.current, current)) {
            // 外部の正本変更で入力を同期失効させ、後着blurによる書き戻しを防ぐ。
            // eslint-disable-next-line react-hooks/set-state-in-effect
            clear();
            if (current.enabled && !current.duplicateIds)
                current.publishNotice(STALE_DRAFT);
        }
    }, [nodes, documentRevision, enabled, duplicateIds, clear]);
    useLayoutEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; active.current = null; };
    }, []);
    const begin = useCallback((nodeId: number, initialLabel?: string) => {
        const current = latest.current;
        if (!mounted.current || !current.enabled || current.duplicateIds)
            return;
        const node = current.nodes.find((candidate) => candidate.id === nodeId);
        if (!node && initialLabel === undefined)
            return;
        const next = { nodeId, documentRevision: current.documentRevision, originalLabel: node?.label ?? initialLabel!, text: node?.label ?? initialLabel! };
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
        if (pending.text !== pending.originalLabel)
            current.updateNodeLabel(pending.nodeId, pending.text);
        return pending.nodeId;
    }, [clear]);
    const cancel = useCallback((): number | null => {
        const id = active.current?.nodeId ?? null;
        clear();
        return id;
    }, [clear]);
    return { draft, begin, setText, commit, cancel, invalidate: clear };
}
