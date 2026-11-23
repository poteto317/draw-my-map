# ラベル書式変更の操作入口インベントリ（L-061）

設計: `2026-11-23-node-label-text-style-design.md` §書式変更の操作入口インベントリ  
関連: `2026-11-23-phase25-lock-inventory.md`（「ラベル書式変更」行）

| 入口 | 拒否／無効条件 | 実装ファイル |
|------|----------------|--------------|
| `LabelTextStyleControl`（ヘッダー） | 主選択≠1、アウトライン、保護モード、対象 locked | `client/src/components/layout/LabelTextStyleControl.tsx`（`MapHeaderLayoutControls.tsx` / `useMapHeaderLayoutControls.ts` / `MapEditor.tsx` で配線） |
| `useNodes` の `setLabelFontSize` / `toggleLabelBold` / `toggleLabelUnderline` | 対象 locked → 無操作（Undo 不変） | `client/src/hooks/useNodes.ts`、`client/src/domain/nodes/nodeLabelTextStyleUpdate.ts` |
| コマンドパレット（任意） | — | **未実装**（スキップ。時間があれば `useNodes` と同じ locked 拒否で登録する） |

共通ガード: `assertNodesEditable`（`client/src/domain/nodes/nodeEditLock.ts`）

統合テスト: `client/src/components/map/__tests__/MapEditor.editLock.integration.test.tsx`
