"use client";

import { NodeNoteSection } from "@/components/layout/NodeNoteSection";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { useNodeNoteEditing } from "@/hooks/useNodeNoteEditing";
import type { Node } from "@/types/node";

type NodeNoteEditorProps = {
  node: Pick<Node, "id" | "label" | "note">;
  selectionCount: number;
  onPreviewNote: (id: number, note: string) => boolean;
  onBeginNoteEdit: () => MapHistoryGroupLease;
};

// 選択中のノードの詳細メモの編集。NodeDetailPanel が対象の ID と documentRevision を key にして作り直す
// （古い下書きを別のノード・新しい文書へ引き継がない。L-588）
export function NodeNoteEditor({ node, selectionCount, onPreviewNote, onBeginNoteEdit }: NodeNoteEditorProps) {
  const editing = useNodeNoteEditing({
    nodeId: node.id,
    note: node.note,
    previewNote: onPreviewNote,
    beginGroup: onBeginNoteEdit,
  });
  return <NodeNoteSection targetLabel={node.label} selectionCount={selectionCount} editing={editing} />;
}
