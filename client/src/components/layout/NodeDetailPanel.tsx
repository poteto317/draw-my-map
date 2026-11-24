import { IllustrationPanel } from "@/components/layout/IllustrationPanel";
import { NodeAppearanceSection } from "@/components/layout/NodeAppearanceSection";
import { NodeBacklinksSection } from "@/components/layout/NodeBacklinksSection";
import { NodeLinksSection } from "@/components/layout/NodeLinksSection";
import { NodeMapLinksSection } from "@/components/layout/NodeMapLinksSection";
import { NodeNoteEditor } from "@/components/layout/NodeNoteEditor";
import { NodeNoteSection } from "@/components/layout/NodeNoteSection";
import { NodeSourcesSection } from "@/components/layout/NodeSourcesSection";
import { NodeTagsSection } from "@/components/layout/NodeTagsSection";
import { GroupDetailSection } from "@/components/layout/GroupDetailSection";
import { RelationDetailSection } from "@/components/layout/RelationDetailSection";
import type { EditorViewMode } from "@/components/layout/EditorViewModeControl";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { AddNodeLinkOutcome } from "@/domain/nodes/nodeLink";
import type { AddNodeMapLinkOutcome, NodeMapLink } from "@/domain/nodes/nodeMapLink";
import type { AddNodeSourceOutcome, NodeSourceInput } from "@/domain/nodes/nodeSource";
import type { AddNodeTagOutcome } from "@/domain/nodes/nodeTag";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { MapGroup } from "@/types/mapGroup";
import type { MapRelation, RelationKind } from "@/types/mapRelation";
import type { Node } from "@/types/node";
import type { NodeKind } from "@/types/nodeKind";

type NodeDetailPanelProps = {
  selectedNode: Pick<
    Node,
    "id" | "label" | "note" | "tags" | "links" | "sources" | "mapLinks" | "illustration" | "icon" | "kind" | "locked"
  > | null;
  /** 関連線選択時。ノード節と同時には出さない想定（選択が排他） */
  selectedRelation?: Pick<MapRelation, "id" | "kind" | "directed"> | null;
  relationEditDisabled?: boolean;
  /** グループ選択時。ノード節と同時には出さない想定（選択が排他） */
  selectedGroup?: Pick<MapGroup, "id" | "label"> | null;
  groupEditDisabled?: boolean;
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
  onUpdateRelationKind?: (relationId: number, kind: RelationKind) => void;
  onUpdateRelationDirected?: (relationId: number, directed: boolean) => void;
  onUpdateGroupLabel?: (groupId: number, label: string) => void;
  generation: IllustrationGenerationState;
  onGenerate: (nodeId: number) => void;
  onAttach: (nodeId: number, dataUrl: string) => void;
  onRemove: (nodeId: number) => void;
};

// 右のパネル。関連線／グループ選択時はその節だけ、それ以外はノードの詳細メモ〜イラストを縦に積み、内容が高さを超えたら縦にスクロールする
export function NodeDetailPanel({
  selectedNode,
  selectedRelation = null,
  relationEditDisabled = false,
  selectedGroup = null,
  groupEditDisabled = false,
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
  onUpdateRelationKind,
  onUpdateRelationDirected,
  onUpdateGroupLabel,
  generation,
  onGenerate,
  onAttach,
  onRemove,
}: NodeDetailPanelProps) {
  // 関連線／グループ節と同条件でノード節を抑止（アウトラインでは残ってもノード UI を出す）
  const relationVisible = selectedRelation !== null && viewMode === "map";
  const groupVisible = selectedGroup !== null && viewMode === "map";
  const nonNodeDetailVisible = relationVisible || groupVisible;
  // 見た目節: 主選択ちょうど1・マップ・非保護（L-061）。関連線／グループ表示中は出さない
  const appearanceVisible =
    viewMode === "map"
    && storageMode !== "protected"
    && selectionCount === 1
    && selectedNode !== null
    && !nonNodeDetailVisible;
  // 関連線／グループも同じパネルに載せるため、ノード専用の名前にしない
  const panelAriaLabel = relationVisible
    ? "関連線の詳細"
    : groupVisible
      ? "グループの詳細"
      : "ノードの詳細";

  return (
    <aside
      aria-label={panelAriaLabel}
      className="flex min-h-0 w-72 shrink-0 flex-col gap-6 overflow-y-auto border-l border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
    >
      <RelationDetailSection
        key={selectedRelation === null ? "relation:none" : `relation:${selectedRelation.id}`}
        visible={relationVisible}
        disabled={relationEditDisabled}
        kind={selectedRelation?.kind ?? "related"}
        directed={selectedRelation?.directed ?? false}
        onKindChange={(kind) => {
          if (selectedRelation !== null) onUpdateRelationKind?.(selectedRelation.id, kind);
        }}
        onDirectedChange={(directed) => {
          if (selectedRelation !== null) onUpdateRelationDirected?.(selectedRelation.id, directed);
        }}
      />
      <GroupDetailSection
        key={selectedGroup === null ? "group:none" : `group:${selectedGroup.id}`}
        visible={groupVisible}
        disabled={groupEditDisabled}
        label={selectedGroup?.label ?? ""}
        onLabelChange={(nextLabel) => {
          if (selectedGroup !== null) onUpdateGroupLabel?.(selectedGroup.id, nextLabel);
        }}
      />
      {nonNodeDetailVisible ? null : selectedNode === null ? (
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
      {nonNodeDetailVisible ? null : (
        <>
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
        </>
      )}
    </aside>
  );
}
