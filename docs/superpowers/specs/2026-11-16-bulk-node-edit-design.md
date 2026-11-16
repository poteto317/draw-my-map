# 選択ノードの一括編集（候補010）設計

作成日: 2026-11-16。対象: Phase 17 の候補010。前提: 候補009「複数ノード選択」（`docs/superpowers/specs/2026-11-15-multi-node-selection-design.md`）。状態: サブエージェントレビュー 2 周通過・自動承認済み（設計確定）。

## 決めたこと（ユーザー確認済み）

1. 対象の属性: **重要度のみ**。色・タグは未実装の属性のため、後続 Phase で実装するときに一括編集の対象へ広げる。イラストの一括削除は対象外。
2. 複数選択中の重要度ボタンの表示: 選択中の全ノードの重要度が同じならそのボタンを押下表示にし、混在していればどのボタンも押下表示にしない。2 件以上選択中は「N件選択中」を表示し、混在時は「混在」を併記する。
3. Undo 単位: 一括変更を **1 操作**として記録する。選択中の全ノードがすでに指定の重要度なら、履歴を増やさない。

---

## 1. 目的と境界

候補009で導入した選択集合（`selectedNodeIds`）に対して、ヘッダーの重要度ボタンを押すと、選択中の全ノードの重要度をまとめて変更できるようにする。

### 対象外（YAGNI）

- 色・タグ・イラストなど重要度以外の属性の一括編集。
- アウトライン側からの一括編集（アウトラインは単一選択のまま）。
- 右クリックメニューからの一括編集。
- 選択中ノードの子孫への波及（変更するのは選択集合のノードそのものだけ）。
- 一括削除・一括複製など、重要度以外の一括操作。

---

## 2. 既存実装と制約

- `client/src/domain/nodes/nodeImportanceUpdate.ts` の `replaceNodeImportance(nodes, id, importance)` が 1 ノード分の置換を担う。対象 ID が無ければ `null`。
- `client/src/hooks/useNodes.ts` の `updateNodeImportance(id, importance)` が `applyNonStructuralChange` 経由で 1 回の履歴コミットを行う。
- `useMapHistory` の `commit` は、現在の状態と同値の候補では履歴を変えない（`areMapStatesEqual`）。
- `client/src/components/layout/NodeImportanceSelector.tsx` は `importance: NodeImportance | null` と `disabled` を受け、押下表示を `aria-pressed` で示す。
- `client/src/components/map/MapEditor.tsx` は主選択（`selectedNode`）の重要度だけを渡し、`updateNodeImportance(selectedNode.id, …)` を呼ぶ。
- `selectedNodeIds` はノード配列順で、存在するノードだけに絞られている。表示中への整理（`pruneSelectionToVisible`）は、キャンバス表示中に限り `MapStage` 内の `useHiddenNodeInteractionReset` が描画後に行う。
- `changeViewMode` はビュー切替時に選択集合を整理しない。キャンバスで複数選択したままアウトラインへ切り替えると、`selectedNodeIds` には複数件が残る。ヘッダーの重要度ボタンはアウトライン表示でも描画される。

---

## 3. ドメイン

`nodeImportanceUpdate.ts` に複数 ID 版を追加する。

```typescript
export function replaceNodesImportance(
  nodes: readonly Node[],
  ids: readonly number[],
  importance: NodeImportance,
): Node[] | null;
```

- `ids` のうち `nodes` に存在するものだけを置換する。存在する ID が 1 件も無い（`ids` が空の場合を含む）なら `null` を返し、何も変えない（L-002: 空を「全件」と扱わない）。
- 置換対象のノードがすでに指定の重要度なら、そのノードのオブジェクトはそのまま返す（不要な再描画を避けるため）。全件同値の候補で履歴が増えないことは、参照ではなく `areMapStatesEqual` の値比較が保証する。
- 既存の `replaceNodeImportance` は単一 ID 版としてそのまま残す（実装は変えない）。

選択集合の重要度の要約を求める純関数を追加する。

```typescript
export type SelectionImportanceSummary =
  | { kind: "none" }                                   // 選択なし
  | { kind: "uniform"; importance: NodeImportance; count: number }
  | { kind: "mixed"; count: number };

export function summarizeSelectionImportance(
  nodes: readonly Node[],
  ids: readonly number[],
): SelectionImportanceSummary;
```

- `ids` のうち `nodes` に存在するノードだけを数える。0 件なら `none`。

---

## 4. フック

`useNodes` に `updateNodesImportance(ids: readonly number[], importance: NodeImportance): boolean` を追加する。

- `applyNonStructuralChange((current) => replaceNodesImportance(current, ids, importance))` を 1 回だけ呼ぶ（1 操作として記録）。
- 戻り値は `applyNonStructuralChange` の戻り値（候補を受理したか）をそのまま返す（L-001）。具体的には、1 件以上を置換した場合と、全件がすでに同値の場合（受理、履歴は不変）は `true`。`ids` が空の場合と、全 ID が不在の場合は `false`。
- 既存の `updateNodeImportance` は互換のため残す。

---

## 5. UI

### 5.1 `NodeImportanceSelector`

- 新しい props `selectionCount: number` と `mixed: boolean` を追加する。どちらも既定値なしの必須 props とする（渡し忘れを型で検出するため。L-060）。
- `importance` が非 `null` のとき、そのボタンを `aria-pressed="true"` にする（現状どおり）。混在時は `importance={null}` を渡し、どれも押下表示にしない。
- ボタン群の右に `aria-live="polite"` の `span` を**常に描画**する。`selectionCount >= 2` のとき中身を `N件選択中` とし、`mixed` が `true` なら `N件選択中・混在` とする。`selectionCount < 2` のときは中身を空にする。
- ボタン群の `aria-label` は、2 件以上選択中なら `重要度（N件選択中）` とし、重要度が混在するときは `重要度（N件選択中・混在）` とする（混在はどのボタンも押下表示にならず、フォーカス時に伝わらないため）。1 件以下では従来どおり `重要度`。

### 5.2 `MapEditor`

- 一括編集の対象 ID（`importanceTargetIds`）を次のように決める。
  - キャンバス表示（`viewMode === "map"`）: `selectedNodeIds`。
  - アウトライン表示（`viewMode === "outline"`）: 主選択 `selectedNodeId` の 1 件（無ければ空）。アウトラインは単一選択のため、キャンバスで残った複数選択を、見えていない状態で一括変更しない。
- `summarizeSelectionImportance(nodes, importanceTargetIds)` を求める。
  - `none`: `importance={null}`、`disabled=true`、`selectionCount=0`、`mixed=false`。
  - `uniform`: `importance` にその値、`disabled=false`、`selectionCount=count`、`mixed=false`。
  - `mixed`: `importance={null}`、`disabled=false`、`selectionCount=count`、`mixed=true`。
- `onChange` で `updateNodesImportance(importanceTargetIds, importance)` を呼ぶ。1 件選択時も同じ経路を通す（単一選択は集合が 1 件の特殊形）。

### 5.3 解像度フィルターとの関係

- 重要度を下げた結果、解像度フィルターで非表示になるノードは、既存の `pruneSelectionToVisible` によって選択集合から外れる（単一選択時の既存挙動と同じ）。追加の処理はしない。

---

## 6. 既存機能との接続

- Undo / Redo: 一括変更全体が 1 操作。Undo で全ノードの重要度が元に戻る。選択集合は Undo で復元しない（候補009 の規則どおり `markDocumentRestored` で解除される）。
- 保存形式: 変更なし（V3 の `importance` をそのまま保存）。
- アウトライン表示中: ヘッダーの重要度ボタンは主選択 1 件だけを対象にする（§5.2）。選択集合そのものは変えないため、キャンバスへ戻ると複数選択と一括編集が再び有効になる。

---

## 7. テスト方針

- ドメイン: `replaceNodesImportance` の複数置換・存在しない ID の無視・全 ID 不在や空配列で `null`・同値ノードの参照維持。`summarizeSelectionImportance` の `none` / `uniform` / `mixed` と不在 ID の除外。
- フック: `updateNodesImportance` が 1 回の Undo で全件戻ること。事前に 1 回別の変更をしてから全件同値で呼び、Undo 1 回で事前の変更より前まで戻る（全件同値では履歴が積まれない）こと。戻り値（置換・全件同値で `true`、空配列・全 ID 不在で `false`）。
- コンポーネント: `NodeImportanceSelector` の件数表示・混在表示・`aria-label`・1 件以下で `span` が空であること。
- ページ統合: キャンバスで 2 件を `Cmd`/`Ctrl` 選択 → 重要度「低」で両方が変わり、Undo 1 回で両方戻ること。混在時に押下表示なし。キャンバスで 2 件選択したままアウトラインへ切り替えて重要度を変えると、主選択だけが変わること。
- fixture の条件（L-168, L-170, L-616）:
  - ドメインと統合のテストには、選択していない 3 件目のノードを必ず入れ、その重要度（とドメインでは参照）が変わらないことを確かめる。
  - 一括変更のテストでは、変更前の重要度を目標と異なる値にし、さらにノードごとに異なる値（例: 高と中）にする。テスト用ノードの既定値（すべて `medium`）のまま使わない。
  - 混在表示のテストでは、事前に重要度の異なる 2 件を用意する。
- 仕様書: `docs/specifications/features.md` の重要度と複数選択の節に一括編集を追記。`docs/testing/browser-test-cases.md` に手動確認の節（AC 節）を追加。

---

## 8. 知見（実装時に気をつける ID）

- L-001: 一括更新の成否を呼び出し元へ返す。
- L-002: 空の ID 配列を「全件」や「成功」と扱わない。
- L-453: 一括変更を独立した複数回の更新呼び出しに分けず、1 回の更新関数で行う（古い状態からの上書きと履歴の分割を防ぐ）。
- L-061: 「未選択なら無効」の入口を選択集合の要約で一貫させる。
- L-168: テスト名と fixture（件数・混在/均一）を一致させる。
- L-060: 新しい props を必須にし、渡し忘れを型で検出する。
- L-170 / L-616: 対象外ノードの不変と、偶然同値にならない fixture（§7）。
- L-153 / L-154: ライブリージョンを常に描画し、`aria-label` を件数に追従させる。

---

## 9. ドキュメント更新

- `docs/specifications/features.md`: 重要度編集の節、3.3 節（複数選択）の「主選択のみ」の一覧、Phase 17 の機能表、末尾付近の機能一覧表のうち「重要度は主選択だけ」「一括編集は候補010」と書いた箇所をすべて更新する。
- `docs/architecture/overview.md`: ファイル一覧（`domain/nodes/` の件数と `selectionImportanceSummary.ts`、`replaceNodesImportance`）、`NodeImportanceSelector`、`useNodes`、`MapEditor` の説明。
- `docs/testing/browser-test-cases.md`: AC 節を追加。
- `ROADMAP.md`: 候補010 の完了と現在地。
