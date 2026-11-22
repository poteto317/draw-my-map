# Phase 25: 編集ロック操作インベントリ（L-061 固定版）

設計: `2026-11-23-phase25-layout-edit-protection-design.md` §050 操作入口インベントリ

| 入口 | 拒否条件 | 実装ファイル（Task 7） |
|------|----------|-------------------------|
| ノードドラッグ | 対象 ID のいずれか locked | `client/src/domain/nodes/nodeTree.ts`（`moveNodeSubtree`）、`client/src/hooks/useNodes.ts`（`moveNode`）、`client/src/components/map/MapEditor.tsx`（`onMoveNode` → `useMapStageInteractions.ts`） |
| ラベルインライン編集 | 対象 locked | `client/src/hooks/useNodes.ts`（`updateNodeLabel` / `updateNodeLabels`）、`client/src/domain/nodes/nodeLabelUpdate.ts` |
| 削除・Backspace | 選択集合に locked 含む | `client/src/hooks/useNodes.ts`（`deleteNode`）、`client/src/domain/nodes/nodeOnlyDeletion.ts`、`client/src/hooks/useNodeOnlyDeletionAction.ts` |
| 分割・統合・親挿入 | 関与ノードに locked | `client/src/domain/nodes/nodeSplit.ts`、`client/src/domain/nodes/nodeMerge.ts`、`client/src/domain/nodes/nodeParentInsertion.ts`、`client/src/hooks/useNodes.ts` |
| 重要度・属性パネル更新 | 対象 locked | `client/src/domain/nodes/nodeImportanceUpdate.ts`、`client/src/domain/nodes/nodeNote.ts`、`client/src/domain/nodes/nodeLink.ts`、`client/src/domain/nodes/nodeTag.ts`、`client/src/domain/nodes/nodeSource.ts`、`client/src/domain/nodes/nodeMapLink.ts`、`client/src/domain/nodes/nodeIllustrationUpdate.ts`、`client/src/hooks/useNodes.ts` |
| 兄弟 DnD（auto） | 移動対象 locked | `client/src/domain/nodes/nodeSiblingOrder.ts`、`client/src/hooks/useNodes.ts`（`reorderSibling`） |
| クリップボード貼り付け上書き | クリップボード規則 | `client/src/domain/nodes/nodeSubtreeInsertion.ts`（`assertSubtreeClipboardInsertion`）、`client/src/hooks/useNodes.ts`（`pasteSubtree` / `duplicateSubtree`） |
| 整列・等間隔 048 | 選択に locked 含む | `client/src/domain/nodes/selectionAlign.ts`、`client/src/domain/nodes/selectionDistribute.ts`、`client/src/domain/nodes/selectionLayoutShared.ts`、`client/src/hooks/useSelectionLayoutActions.ts` |

共通ヘルパー: `client/src/domain/nodes/nodeEditLock.ts`（`assertNodesEditable`、`lockSubtree`、`unlockSubtree`、`toggleNodeLock`）

統合テスト: `client/src/components/map/__tests__/MapEditor.editLock.integration.test.tsx`