import { IllustrationPanel } from "@/components/layout/IllustrationPanel";
import { NodeNoteEditor } from "@/components/layout/NodeNoteEditor";
import { NodeNoteSection } from "@/components/layout/NodeNoteSection";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { Node } from "@/types/node";

type NodeDetailPanelProps = {
  selectedNode: Pick<Node, "id" | "label" | "note" | "illustration"> | null;
  selectionCount: number;
  documentRevision: number;
  onPreviewNote: (id: number, note: string) => boolean;
  onBeginNoteEdit: () => MapHistoryGroupLease;
  generation: IllustrationGenerationState;
  onGenerate: (nodeId: number) => void;
  onAttach: (nodeId: number, dataUrl: string) => void;
  onRemove: (nodeId: number) => void;
};

// 右のパネル。上に詳細メモ、下にイラストを縦に積み、内容が高さを超えたら縦にスクロールする
export function NodeDetailPanel({
  selectedNode,
  selectionCount,
  documentRevision,
  onPreviewNote,
  onBeginNoteEdit,
  generation,
  onGenerate,
  onAttach,
  onRemove,
}: NodeDetailPanelProps) {
  return (
    <aside
      aria-label="ノードの詳細"
      className="flex min-h-0 w-72 shrink-0 flex-col gap-6 overflow-y-auto border-l border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
    >
      {selectedNode === null ? (
        <NodeNoteSection targetLabel={null} selectionCount={selectionCount} editing={null} />
      ) : (
        <NodeNoteEditor
          key={`${selectedNode.id}:${documentRevision}`}
          node={selectedNode}
          selectionCount={selectionCount}
          onPreviewNote={onPreviewNote}
          onBeginNoteEdit={onBeginNoteEdit}
        />
      )}
      <IllustrationPanel
        selectedNode={selectedNode}
        generation={generation}
        onGenerate={onGenerate}
        onAttach={onAttach}
        onRemove={onRemove}
      />
    </aside>
  );
}
