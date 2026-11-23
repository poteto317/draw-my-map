import { IllustrationPanel } from "@/components/layout/IllustrationPanel";
import { NodeAppearanceSection } from "@/components/layout/NodeAppearanceSection";
import { NodeBacklinksSection } from "@/components/layout/NodeBacklinksSection";
import { NodeLinksSection } from "@/components/layout/NodeLinksSection";
import { NodeMapLinksSection } from "@/components/layout/NodeMapLinksSection";
import { NodeNoteEditor } from "@/components/layout/NodeNoteEditor";
import { NodeNoteSection } from "@/components/layout/NodeNoteSection";
import { NodeSourcesSection } from "@/components/layout/NodeSourcesSection";
import { NodeTagsSection } from "@/components/layout/NodeTagsSection";
import type { EditorViewMode } from "@/components/layout/EditorViewModeControl";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { AddNodeLinkOutcome } from "@/domain/nodes/nodeLink";
import type { AddNodeMapLinkOutcome, NodeMapLink } from "@/domain/nodes/nodeMapLink";
import type { AddNodeSourceOutcome, NodeSourceInput } from "@/domain/nodes/nodeSource";
import type { AddNodeTagOutcome } from "@/domain/nodes/nodeTag";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { Node } from "@/types/node";
import type { NodeKind } from "@/types/nodeKind";

type NodeDetailPanelProps = {
  selectedNode: Pick<
    Node,
    "id" | "label" | "note" | "tags" | "links" | "sources" | "mapLinks" | "illustration" | "icon" | "kind" | "locked"
  > | null;
  selectionCount: number;
  documentRevision: number;
  viewMode: EditorViewMode;
  currentMapId: string;
  maps: readonly MapIndexEntry[];
  corpus: CrossMapCorpus;
  storageMode: "persistent" | "protected";
  onPreviewNote: (id: number, note: string) => boolean;
  onBeginNoteEdit: () => MapHistoryGroupLease;
  onAddTag: (id: number, input: string) => AddNodeTagOutcome;
  onRemoveTag: (id: number, tag: string) => boolean;
  onAddLink: (id: number, input: string) => AddNodeLinkOutcome;
  onRemoveLink: (id: number, url: string) => boolean;
  onAddSource: (id: number, input: NodeSourceInput) => AddNodeSourceOutcome;
  onRemoveSource: (id: number, index: number) => boolean;
  onAddMapLink: (
    nodeId: number,
    input: { targetMapId: string; targetNodeId?: number },
  ) => AddNodeMapLinkOutcome;
  onRemoveMapLink: (nodeId: number, target: NodeMapLink) => boolean;
  onNavigateToMapTarget: (targetMapId: string, targetNodeId?: number) => void;
  onSetNodeIcon: (id: number, icon: string | undefined) => boolean;
  onSetNodeKind: (id: number, kind: NodeKind | undefined) => boolean;
  generation: IllustrationGenerationState;
  onGenerate: (nodeId: number) => void;
  onAttach: (nodeId: number, dataUrl: string) => void;
  onRemove: (nodeId: number) => void;
};

// 右のパネル。上から詳細メモ、見た目、タグ、リンク、出典、マップ間リンク、被リンク、イラストを縦に積み、内容が高さを超えたら縦にスクロールする
export function NodeDetailPanel({
  selectedNode,
  selectionCount,
  documentRevision,
  viewMode,
  currentMapId,
  maps,
  corpus,
  storageMode,
  onPreviewNote,
  onBeginNoteEdit,
  onAddTag,
  onRemoveTag,
  onAddLink,
  onRemoveLink,
  onAddSource,
  onRemoveSource,
  onAddMapLink,
  onRemoveMapLink,
  onNavigateToMapTarget,
  onSetNodeIcon,
  onSetNodeKind,
  generation,
  onGenerate,
  onAttach,
  onRemove,
}: NodeDetailPanelProps) {
  // 見た目節: 主選択ちょうど1・マップ・非保護（L-061）
  const appearanceVisible =
    viewMode === "map"
    && storageMode !== "protected"
    && selectionCount === 1
    && selectedNode !== null;

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
      <NodeAppearanceSection
        key={selectedNode === null ? "appearance:none" : `appearance:${selectedNode.id}`}
        visible={appearanceVisible}
        disabled={selectedNode?.locked === true}
        icon={selectedNode?.icon}
        kind={selectedNode?.kind}
        onIconChange={(icon) => {
          if (selectedNode !== null) onSetNodeIcon(selectedNode.id, icon);
        }}
        onKindChange={(kind) => {
          if (selectedNode !== null) onSetNodeKind(selectedNode.id, kind);
        }}
      />
      {/* タグ・リンク・出典・マップ間リンクの節の key はノードの ID だけ（兄弟の NodeNoteEditor や互いと重ならないよう接頭辞を付ける）。
          documentRevision では作り直さず、節の中で下書きとエラーだけを消す（作り直すとリンク・削除ボタンのフォーカスが
          body へ落ちる。L-155・L-397・L-588） */}
      <NodeTagsSection
        key={selectedNode === null ? "tags:none" : `tags:${selectedNode.id}`}
        node={selectedNode}
        documentRevision={documentRevision}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
      />
      <NodeLinksSection
        key={selectedNode === null ? "links:none" : `links:${selectedNode.id}`}
        node={selectedNode}
        documentRevision={documentRevision}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
      />
      <NodeSourcesSection
        key={selectedNode === null ? "sources:none" : `sources:${selectedNode.id}`}
        node={selectedNode}
        documentRevision={documentRevision}
        onAddSource={onAddSource}
        onRemoveSource={onRemoveSource}
      />
      <NodeMapLinksSection
        key={selectedNode === null ? "mapLinks:none" : `mapLinks:${selectedNode.id}`}
        selectedNode={selectedNode}
        documentRevision={documentRevision}
        currentMapId={currentMapId}
        maps={maps}
        corpus={corpus}
        storageMode={storageMode}
        onAddMapLink={onAddMapLink}
        onRemoveMapLink={onRemoveMapLink}
        onNavigateToMapTarget={onNavigateToMapTarget}
      />
      <NodeBacklinksSection
        selectedNodeId={selectedNode?.id ?? null}
        currentMapId={currentMapId}
        corpus={corpus}
        storageMode={storageMode}
        onNavigateToMapTarget={onNavigateToMapTarget}
      />
      <IllustrationPanel
        selectedNode={selectedNode}
        generation={generation}
        onGenerate={onGenerate}
        onAttach={onAttach}
        onRemove={onRemove}
        disabled={
          selectedNode?.locked === true
          || storageMode === "protected"
          || selectionCount !== 1
        }
      />
    </aside>
  );
}
