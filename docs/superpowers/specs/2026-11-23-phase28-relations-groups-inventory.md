# Phase 28: 関連線・意味付け・グループ枠 操作入口インベントリ（L-061）

設計: `2026-11-23-phase28-relations-groups-design.md` §6（操作入口）・§10（既存操作×新選択）  
関連: `2026-11-23-phase25-lock-inventory.md`（既存入口の正本行）、`COMMAND_CATALOG`（`client/src/domain/commands/commandCatalog.ts`）、`UseNodesReturn`（`client/src/hooks/useNodes.ts`）

## L-1085（適用外 / N/A）

本 Phase に **合成名は無い**。グループ枠の空ラベル時に UI が表示するフォールバック「グループ」は **表示のみ**であり、永続データ（`MapGroup.label`）には書き込まない（設計 §5）。よって知見 **L-1085 は本 Phase では N/A**。

- [x] inventory 作成（列挙完了）

判定語（§10 既存操作ガード）:

| 語 | 意味 |
|----|------|
| **無効** | 関連線選択中／グループ選択中／相手ピッカー表示中は実行しない（UI `disabled`・ショートカット無視・API 無操作のいずれか）。設計 §10 の「ノード対象操作＝無効」に該当 |
| **無関係** | 新選択種と交差しない（文書級設定・履歴・選択切替・表示切替など）。ガード対象外 |
| **振替** | Delete キーのみ。ノード削除ではなく §6 の関連線／グループ削除へ振る（ノード API `deleteNode` 自体は無効） |

相手ピッカー表示中は設計 §10 どおり **親 inert／shortcuts 停止**。下表ではユーザー操作として到達し得る行を **無効**、到達しない内部／状態系を **無関係** とする。

---

## 1. 設計 §6 新入口

| # | 入口 | visible | disabled / 拒否 | 関与 | 実装ファイル |
|---|------|---------|------------------|------|----------------|
| N1 | コンテキスト「関連線を追加」→相手ピッカー（現在マップの他ノード一覧。主選択以外） | マップ・主選択ちょうど 1 | アウトライン／保護／競合／主選択 locked／相手 locked／重複規則 | 主選択＋相手 | `NodeContextMenu.tsx` / `mapRelationAvailability.ts`（`resolveRelationAddContextMenu`）/ `MapStage.tsx` / `MapEditor.tsx` / `RelationPartnerPickerDialog.tsx`。表示中は inert／shortcuts 停止 |
| N2 | 選択ちょうど 2→コンテキスト「関連線で結ぶ」 | マップ・選択ちょうど 2 | 同上（両端 locked・重複規則含む） | 両端 | `NodeContextMenu.tsx` / `mapRelationAvailability.ts`（`resolveRelationConnectContextMenu`）/ `MapStage.tsx` / `useNodes.addRelation` |
| N3 | 関連線クリックで選択 | マップ | — | その relation | `renderMapRelations.ts`（ヒット）/ `MapStage.tsx` / `useNodes.selectRelation`。`MapCanvasSelection` type `relation`。ノード主選択はクリア |
| N4 | 関連線の削除（Delete） | 関連線選択時 | 保護／競合／両端いずれか locked | 両端 | `useNodeKeyboardShortcuts.ts`（Delete/Backspace 振替）/ `MapStage.handleDeleteRelation` / `mapRelationAvailability.ts`（`resolveRelationDeleteAvailability`）/ `useNodes.removeRelation`。**専用コンテキストメニュー項目は無し**（設計の「メニュー」は未追加。Delete のみ） |
| N5 | 意味の編集（右パネル「関連線」節: kind ラジオ＋有向トグル） | 関連線選択時 | 同上（保護／競合／両端 locked）。更新時も重複規則で拒否 | 両端 | `RelationDetailSection.tsx` / `NodeDetailPanel.tsx` / `useNodes.updateRelation` / `relationKindLabels.ts`。パレット掲載は非目標 |
| N6 | 選択≥2→コンテキスト「グループ化」 | マップ | アウトライン／保護／競合／メンバーいずれか locked | メンバー全員 | `NodeContextMenu.tsx` / `mapGroupAvailability.ts`（`resolveGroupCreateContextMenu`）/ `MapStage.tsx` / `useNodes.addGroup` |
| N7 | コンテキスト「この枝をグループ化」（主選択の subtree・2 件以上のとき） | マップ・主選択 1・subtree≥2 | 同上 | subtree 全員 | `NodeContextMenu.tsx` / `mapGroupAvailability.ts`（`resolveBranchGroupContextMenu`）/ `MapStage.tsx` / `useNodes.addGroup` |
| N8 | グループ枠クリックで選択 | マップ | — | その group | `renderMapGroups.ts`（ヒット）/ `MapStage.tsx` / `useNodes.selectGroup`。ヒット優先: ノード > 関連線 > グループ枠 |
| N9 | グループの削除（Delete） | グループ選択時 | 保護／競合／メンバー locked | メンバー | `useNodeKeyboardShortcuts.ts` / `MapStage.handleDeleteGroup` / `mapGroupAvailability.ts`（`resolveGroupDeleteAvailability`）/ `useNodes.removeGroup`。中のノードは残す。**専用コンテキストメニュー項目は無し** |
| N10 | グループのラベル編集（パネル） | グループ選択時 | 同上 | メンバー | `GroupDetailSection.tsx` / `NodeDetailPanel.tsx` / `useNodes.updateGroupLabel`。空文字可。表示フォールバック「グループ」は UI のみ（`mapGroupGeometry.ts` の `GROUP_DISPLAY_LABEL_FALLBACK`。L-1085 N/A） |

新操作のコマンドパレット掲載: **非目標**（設計 §10）。

---

## 2. 設計 §10 既存操作ガード

### 2.1 `useNodes` 公開面（操作メソッド）

状態プロパティ（`nodes` / `selectedNodeId` / `selectedNodeIds` / `layoutMode` / `treeDirection` / `layoutSpacing` / `documentRevision` / `canUndo` / `canRedo`）は操作ではないため列挙対象外。

| # | 操作 | 関連線選択中 | グループ選択中 | 相手ピッカー表示中 | 根拠 |
|---|------|--------------|----------------|--------------------|------|
| U1 | `addNode` | 無効 | 無効 | 無効 | ノード追加（構造） |
| U2 | `addChildNode` | 無効 | 無効 | 無効 | ノード追加（要親選択） |
| U3 | `addSiblingNode` | 無効 | 無効 | 無効 | ノード追加（要選択） |
| U4 | `selectNode` | 無関係 | 無関係 | 無効 | 選択切替（ピッカー中は shortcuts／操作停止） |
| U5 | `restoreSelection` | 無関係 | 無関係 | 無効 | 選択復元 |
| U6 | `toggleNodeSelection` | 無関係 | 無関係 | 無効 | 選択切替 |
| U7 | `selectNodeRange` | 無関係 | 無関係 | 無効 | 選択切替 |
| U8 | `setSelectionFromMarquee` | 無関係 | 無関係 | 無効 | 選択切替 |
| U9 | `clearSelection` | 無関係 | 無関係 | 無効 | 選択解除 |
| U10 | `pruneSelectionToVisible` | 無関係 | 無関係 | 無関係 | 可視同期の内部整理 |
| U11 | `updateNodeLabel` | 無効 | 無効 | 無効 | ノード属性編集 |
| U12 | `updateNodeLabels` | 無効 | 無効 | 無効 | 同上（一括） |
| U13 | `setLabelFontSize` | 無効 | 無効 | 無効 | ノード属性編集 |
| U14 | `toggleLabelBold` | 無効 | 無効 | 無効 | 同上 |
| U15 | `toggleLabelUnderline` | 無効 | 無効 | 無効 | 同上 |
| U16 | `setNodeIcon` | 無効 | 無効 | 無効 | ノード属性編集 |
| U17 | `setNodeKind` | 無効 | 無効 | 無効 | 同上 |
| U18 | `updateNodeImportance` | 無効 | 無効 | 無効 | 同上 |
| U19 | `updateNodesImportance` | 無効 | 無効 | 無効 | 同上 |
| U20 | `attachIllustration` | 無効 | 無効 | 無効 | 同上 |
| U21 | `removeIllustration` | 無効 | 無効 | 無効 | 同上 |
| U22 | `previewNodeNote` | 無効 | 無効 | 無効 | 同上 |
| U23 | `addNodeLink` / `removeNodeLink` | 無効 | 無効 | 無効 | 同上 |
| U24 | `addNodeTag` / `removeNodeTag` | 無効 | 無効 | 無効 | 同上 |
| U25 | `addNodeSource` / `removeNodeSource` | 無効 | 無効 | 無効 | 同上 |
| U26 | `addNodeMapLink` / `removeNodeMapLink` | 無効 | 無効 | 無効 | 同上 |
| U27 | `commitManualNodes` | 無効 | 無効 | 無効 | ノード座標確定（ドラッグ系） |
| U28 | `toggleNodeEditLock` | 無効 | 無効 | 無効 | ノード対象 |
| U29 | `lockNodeSubtree` / `unlockNodeSubtree` | 無効 | 無効 | 無効 | ノード対象 |
| U30 | `moveNode` | 無効 | 無効 | 無効 | ノードドラッグ |
| U31 | `connectNodes` | 無効 | 無効 | 無効 | 接続（§10 明示） |
| U32 | `duplicateSubtree` | 無効 | 無効 | 無効 | コピー系 |
| U33 | `copySubtree` | 無効 | 無効 | 無効 | コピー（§10 明示） |
| U34 | `pasteSubtree` | 無効 | 無効 | 無効 | 貼付（§10 明示） |
| U35 | `insertSubtree` | 無効 | 無効 | 無効 | 貼付／挿入系 |
| U36 | `insertForest` | 無効 | 無効 | 無効 | ノード挿入 |
| U37 | `reorderSibling` | 無効 | 無効 | 無効 | ノード構造 |
| U38 | `changeNodeIndent` | 無効 | 無効 | 無効 | インデント（§10 明示） |
| U39 | `insertParentNode` | 無効 | 無効 | 無効 | 親挿入（§10 明示） |
| U40 | `splitNode` | 無効 | 無効 | 無効 | 分割（§10 明示） |
| U41 | `mergeNodes` | 無効 | 無効 | 無効 | 統合（§10 明示） |
| U42 | `moveBranch` | 無効 | 無効 | 無効 | 枝移動（ノード対象） |
| U43 | `deleteNode` | 無効（Delete キーは §6 振替） | 無効（Delete キーは §6 振替） | 無効 | ノード削除 API。キーは N4/N9 |
| U44 | `deleteNodeOnly` | 無効 | 無効 | 無効 | ノード対象 |
| U45 | `setLayoutMode` | 無関係 | 無関係 | 無効 | 文書級設定（ピッカー中は UI 停止） |
| U46 | `setTreeDirection` | 無関係 | 無関係 | 無効 | 同上 |
| U47 | `setLayoutSpacing` | 無関係 | 無関係 | 無効 | 同上 |
| U48 | `replaceMap` | 無関係 | 無関係 | 無関係 | 文書置換（ライブラリ／読込経路） |
| U49 | `undo` / `redo` | 無関係 | 無関係 | 無効 | 履歴。ピッカー中は shortcuts 停止 |
| U50 | `beginMoveHistory` | 無関係 | 無関係 | 無関係 | 履歴リース（内部） |

設計 §10 の「切取」: 専用 `cut` API／`onCut` ハンドラはコード上 **未実装**。コピー＋削除の組合せとして扱う場合も両方が無効のため、切取経路は実質到達しない。ギャップとして §4 に記録。

### 2.2 Phase 25 inventory 各行

出典: `2026-11-23-phase25-lock-inventory.md`

| # | 入口（Phase25 行） | 関連線選択中 | グループ選択中 | 相手ピッカー表示中 | 根拠 |
|---|--------------------|--------------|----------------|--------------------|------|
| P1 | ノードドラッグ | 無効 | 無効 | 無効 | ノード対象 |
| P2 | ラベルインライン編集 | 無効 | 無効 | 無効 | ノード属性編集 |
| P3 | 削除・Backspace | 振替→N4（ノード削除としては無効） | 振替→N9（ノード削除としては無効） | 無効 | §10 Delete 振替 |
| P4 | 分割・統合・親挿入 | 無効 | 無効 | 無効 | §10 明示 |
| P5 | 重要度・属性パネル更新 | 無効 | 無効 | 無効 | ノード属性編集 |
| P6 | 兄弟 DnD（auto） | 無効 | 無効 | 無効 | ノード構造 |
| P7 | クリップボード貼り付け上書き | 無効 | 無効 | 無効 | 貼付（§10 明示） |
| P8 | 整列・等間隔 048 | 無効 | 無効 | 無効 | ノード選択前提 |
| P9 | ラベル書式変更 | 無効 | 無効 | 無効 | ノード属性編集 |
| P10 | 見た目（icon/kind・illustration） | 無効 | 無効 | 無効 | ノード属性編集 |
| P11 | 枝切り出し（別マップ化） | 無効 | 無効 | 無効 | 枝切り出し（§10 明示） |

### 2.3 コマンドパレット項目（`COMMAND_CATALOG`）

パレットへの関連線／グループ新操作掲載は **非目標**。既存項目のみ。

| # | id | ラベル | 関連線選択中 | グループ選択中 | 相手ピッカー表示中 | 根拠 |
|---|----|--------|--------------|----------------|--------------------|------|
| C1 | `view.map` | マップ表示へ切替 | 無関係 | 無関係 | 無効 | 表示切替 |
| C2 | `view.outline` | アウトライン表示へ切替 | 無関係 | 無関係 | 無効 | 表示切替 |
| C3 | `view.fit-all` | 全体に合わせる | 無関係 | 無関係 | 無効 | ビューポート |
| C4 | `view.fit-selection` | 選択に合わせる | 無効 | 無効 | 無効 | ノード選択前提（`canFitSelection`） |
| C5 | `view.focus-branch` | 枝に集中 | 無効 | 無効 | 無効 | ノード枝対象 |
| C6 | `view.focus-clear` | 集中表示を終了 | 無関係 | 無関係 | 無効 | 表示状態の解除 |
| C7 | `view.expand-subtree` | 枝を一括展開 | 無効 | 無効 | 無効 | ノード枝対象 |
| C8 | `view.collapse-subtree` | 枝を一括折りたたみ | 無効 | 無効 | 無効 | ノード枝対象 |
| C9 | `edit.undo` | 元に戻す | 無関係 | 無関係 | 無効 | 履歴 |
| C10 | `edit.redo` | やり直す | 無関係 | 無関係 | 無効 | 履歴 |
| C11 | `edit.duplicate-branch` | 枝を複製 | 無効 | 無効 | 無効 | パレットのノード操作（§10） |
| C12 | `edit.delete-node-only` | ノードだけ削除 | 無効 | 無効 | 無効 | 同上 |
| C13 | `edit.insert-parent` | 親を挿入 | 無効 | 無効 | 無効 | 同上 |
| C14 | `edit.move-sibling-up` | 兄弟を上へ | 無効 | 無効 | 無効 | 同上 |
| C15 | `edit.move-sibling-down` | 兄弟を下へ | 無効 | 無効 | 無効 | 同上 |
| C16 | `edit.indent` | 階層を下げる | 無効 | 無効 | 無効 | 同上 |
| C17 | `edit.outdent` | 階層を上げる | 無効 | 無効 | 無効 | 同上 |
| C18 | `edit.open-label-replace` | ラベルを一括置換… | 無効 | 無効 | 無効 | ノード属性編集 |
| C19 | `edit.open-branch-move` | 枝を別マップへ移動… | 無効 | 無効 | 無効 | ノード枝対象 |
| C20 | `edit.open-node-split` | ノードを分割… | 無効 | 無効 | 無効 | 分割（§10） |
| C21 | `edit.open-node-merge` | ノードを統合… | 無効 | 無効 | 無効 | 統合（§10） |
| C22 | `edit.register-part` | 選択を部品に登録… | 無効 | 無効 | 無効 | ノード選択前提 |
| C23 | `edit.insert-part` | 部品を挿入… | 無効 | 無効 | 無効 | ノード挿入系 |
| C24 | `edit.delete-part` | 部品を削除… | 無関係 | 無関係 | 無効 | 部品ライブラリ meta（現在選択のノード操作ではない） |
| C25 | `search.focus-in-map` | マップ内検索へフォーカス | 無関係 | 無関係 | 無効 | 検索 UI |
| C26 | `search.open-cross-map` | 全マップ検索… | 無関係 | 無関係 | 無効 | 検索 UI |
| C27 | `outline.add-root` | ルート追加 | 無関係 | 無関係 | 無効 | アウトライン専用（modeMismatch）。マップ上の新選択とは交差しない |
| C28 | `outline.add-child` | 子を追加 | 無関係 | 無関係 | 無効 | 同上 |
| C29 | `outline.add-sibling` | 兄弟を末尾に追加 | 無関係 | 無関係 | 無効 | 同上 |
| C30 | `outline.begin-edit` | ラベル編集 | 無関係 | 無関係 | 無効 | 同上 |

---

## 3. 行数サマリ

| 区分 | 行数 |
|------|------|
| §6 新入口（N1–N10） | **10** |
| §10 `useNodes` 公開操作（U1–U50） | **50**（ガード対象） |
| §10 Phase25 inventory 行（P1–P11） | **11** |
| §10 コマンドパレット（C1–C30） | **30** |
| 新入口合計 | 10 |
| 既存操作ガード合計 | **91** |

---

## 4. コードから解消できなかったギャップ

1. **切取（cut）**: 設計 §10 は「切取」を無効対象に含むが、`client/` に専用 cut API／`onCut` は無い。コピー（`copySubtree`）と削除の組合せとして列挙上は両方無効で足りる。専用入口が後から追加された場合は本表へ行を足す。
2. **関連線／グループ削除のコンテキストメニュー**: 設計 §6 は「Delete / メニュー」とあるが、実装は **Delete/Backspace のみ**（`useNodeKeyboardShortcuts`）。専用メニュー項目は追加していない（N4/N9）。

---

## 5. 共通メモ

- 選択型は計画 Interfaces の `MapCanvasSelection`（`nodes` | `relation` | `group`）。定義: `client/src/types/mapCanvasSelection.ts`。
- locked 関与は L-1061（関連線は両端、グループはメンバー）。
- パレット新操作は非目標。入口はコンテキスト＋パネル＋ Delete 振替。
- 統合テストで代表経路を固定する対象: U31–U41・U33–U34・P11・C11–C21 など §10 明示のノード操作が関連線／グループ選択中に無効であること、ピッカー中 inert。

## 6. 型コメント・docs 同期（Task 5 / L-203）

| 箇所 | 状態 |
|------|------|
| `client/src/types/mapRelation.ts` / `mapGroup.ts` / `mapCanvasSelection.ts` / `nodeMapState.ts` | 済 |
| `docs/specifications/data-model.md`（`NodeMapState`・`MapRelation`・`MapGroup`・正規化／GC） | 済 |
| `docs/specifications/features.md`（Phase 28・33 章） | 済 |
| `docs/architecture/overview.md`（`domain/map`・描画・流れ） | 済 |
| `docs/specifications/api.md`（16 章 `useNodes` 関連線／グループ API） | 済 |
| `ROADMAP.md`（061–063 完了・Phase 28 完了・現在地・最終更新 2026-11-24） | 済 |
| 本 inventory 実装ファイル列（N1–N10） | 済 |
