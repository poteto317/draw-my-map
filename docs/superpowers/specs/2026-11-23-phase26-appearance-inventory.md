# Phase 26: 見た目（icon / kind / illustration アップロード）操作入口インベントリ（L-061）

設計: `2026-11-23-phase26-visual-attachments-design.md` §操作入口インベントリ（L-061）  
関連: `2026-11-23-phase25-lock-inventory.md`（「見た目（icon/kind・UI 新入口）」行。domain illustration は同ファイル「重要度・属性パネル更新」行）

| 入口 | 拒否／無効条件 | 実装ファイル |
|------|----------------|--------------|
| `IllustrationPanel` 添付・削除・生成 | 主選択≠1、locked、保護モード | `client/src/components/layout/IllustrationPanel.tsx`（「画像を添付」+ `accept=image/*` + 上書き確認。`disabled` は `NodeDetailPanel` が locked・保護モード・主選択≠1 のとき渡す）。domain 更新は phase25「重要度・属性パネル更新」 |
| `NodeAppearanceSection` icon / kind | 主選択≠1、locked、保護モード | `client/src/components/layout/NodeAppearanceSection.tsx`、`client/src/components/layout/NodeDetailPanel.tsx`（表示条件・配線）、`client/src/components/map/MapEditor.tsx`（`setNodeIcon` / `setNodeKind` 接続） |
| `useNodes` の `setNodeIcon` / `setNodeKind` | 対象 locked → 無操作（Undo 不変） | `client/src/hooks/useNodes.ts`、`client/src/domain/nodes/nodeAppearanceUpdate.ts` |

共通ガード: `assertNodesEditable`（`client/src/domain/nodes/nodeEditLock.ts`）

統合テスト: `client/src/components/map/__tests__/MapEditor.editLock.integration.test.tsx`（Task 3 GREEN）

## 型コメント・docs 同期（Task 5 / L-203）

| 箇所 | 状態 |
|------|------|
| `client/src/types/node.ts`（icon / kind コメント・見直しリスト） | 済 |
| `client/src/domain/nodes/nodeAttributePolicy.ts`（OptionalNodeKey 列挙） | 済 |
| `client/src/domain/history/mapHistory.ts` / `mapConflict.ts`（`areNodesEqual`） | 済 |
| `docs/specifications/features.md`・`data-model.md`・`docs/architecture/overview.md`・`docs/specifications/api.md` | 済 |
| `ROADMAP.md`（051/052/055 完了・074 残・Phase 26 進行中） | 済 |
