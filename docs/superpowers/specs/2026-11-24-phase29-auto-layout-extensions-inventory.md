# Phase 29: 自動配置の拡張 操作入口インベントリ（L-061）

設計: `2026-11-24-phase29-auto-layout-extensions-design.md` §6（操作入口）・§7（既存操作×新状態）  
関連: `2026-11-23-phase28-relations-groups-inventory.md`（Task0 同型の列挙手順）、`2026-11-23-phase25-lock-inventory.md`（既存入口の正本行）、`COMMAND_CATALOG`（`client/src/domain/commands/commandCatalog.ts`）、`UseNodesReturn`（`client/src/hooks/useNodes.ts`）、`UseNodeLayoutStateReturn`（`client/src/hooks/useNodeLayoutState.ts`）

## L-1085（適用外 / N/A）

本 Phase に **合成名は無い**（設計 §11・Global Constraints）。`layoutStyle` / `branchLayouts` / `layoutPinned` はいずれも単一識別子であり、UI フォールバック表示名の永続化も無い。よって知見 **L-1085 は本 Phase では N/A**。

- [x] inventory 作成（列挙完了）

判定語:

| 語 | 意味 |
|----|------|
| **非表示** | `visible=false`（ヘッダー控件が `null`、コンテキスト項目非表示、マップ外で到達不可） |
| **無効** | UI `disabled`・ショートカット無視・操作を実行しない（設計 §6／§7 のガード） |
| **拒否** | API が `{ ok: false, reason }` 等で無操作（例: locked → `setNodeLayoutPinned`） |
| **無関係** | 当該条件と交差しない（ガード対象外）。文書級既存設定・履歴・選択切替・表示切替など |
| **有効** | 条件を満たせば操作可能 |
| **保持のみ** | 値は文書に残るが配置計算・UI 操作には使わない／変更不可 |

**テスト所有者（後続 Task）**: Task 2＝ピン入口＋ピンドラッグ、Task 3＝枝方向入口、Task 4＝様式入口。いずれも本表の代表経路（アウトライン／保護／競合／関連線選択／グループ選択／locked）で disabled／拒否を RED/GREEN。Task 0 自体は文書のみ。

---

## 1. 設計 §6 新入口

| # | 入口 | visible | disabled / 拒否 | 関与 | 実装ファイル（確定） |
|---|------|---------|------------------|------|----------------------|
| N1 | ヘッダー「レイアウト様式」直交／放射 | マップ | アウトライン＝非表示／保護／競合／関連線選択／グループ選択／**manual 時 disabled（値保持）** | 文書 | `client/src/components/layout/LayoutStyleControl.tsx` / `MapHeaderLayoutControls.tsx` / `hooks/useMapHeaderLayoutControls.ts` / `useNodes.setLayoutStyle` / `domain/map/mapLayoutStyleAvailability.ts` |
| N2 | ヘッダー既存「ツリー方向」lr/tb | マップ | アウトライン＝非表示／保護／競合／関連線選択／グループ選択／**manual 時 disabled（値保持・既存）**／**radial 中 disabled（値保持）**（非表示にしない） | 文書 | `client/src/components/layout/TreeDirectionControl.tsx` / `useNodes.setTreeDirection`（radial 中 disabled） |
| N3 | ヘッダー「配置間隔」 | マップ（orthogonal・radial とも） | アウトライン＝非表示／保護／競合／関連線選択／グループ選択／**manual 時 disabled（値保持・TreeDirectionControl 同型）**。radial 中は **有効** | 文書 | `client/src/components/layout/LayoutSpacingControl.tsx` / `useNodes.setLayoutSpacing` |
| N4 | コンテキスト「この枝の配置方向」→ lr/rl/tb/bt／「文書の既定に戻す」 | マップ・orthogonal・主選択ちょうど 1 | アウトライン／保護／競合／関連線選択／グループ選択／主選択 **locked（UI disabled かつ API 拒否・N5 同型）**／**radial（UI disabled）** | 主選択ノード | `client/src/components/map/NodeContextMenu.tsx` / `domain/map/mapBranchLayoutAvailability.ts` / `useNodes.setBranchLayout` |
| N5 | コンテキスト／詳細パネル「位置を固定」「固定を解除」 | マップ・主選択ちょうど 1（複数選択時は主選択のみ Phase29） | アウトライン／保護／競合／関連線選択／グループ選択／主選択 **locked** | 主選択 | `NodeContextMenu.tsx` / `components/layout/NodeDetailPanel.tsx` / `domain/map/mapLayoutPinnedAvailability.ts` / `useNodes.setNodeLayoutPinned`。L-1061: locked はピン操作拒否 |
| N6 | auto 中のピンノードドラッグ（座標移動） | マップ・auto・対象が `layoutPinned` | **locked**／保護／競合／関連線選択／グループ選択。非ピンは既存並べ替えのまま | そのノード | `components/map/pixi/stageInteractions.ts` / `MapStage.tsx` / `useNodes.movePinnedNode` / `finalizePinnedNodeMove`（ドロップ後リレイアウト 1 Undo） |

新操作のコマンドパレット掲載: **非目標**（N1–N6 いずれもパレット行を追加しない）。

### 1.1 条件マトリクス（アウトライン／保護／競合／関連線選択／グループ選択／locked／manual／radial）

| # | 入口 | アウトライン | 保護 | 競合※ | 関連線選択 | グループ選択 | locked（主選択／対象） | manual | radial |
|---|------|--------------|------|--------|------------|--------------|------------------------|--------|--------|
| N1 | 様式 | 非表示 | 無効 | 無効 | 無効 | 無効 | 無関係（文書級） | 無効（値保持） | 有効（切替可） |
| N2 | ツリー方向 | 非表示 | 無効 | 無効 | 無効 | 無効 | 無関係（文書級） | 無効（値保持） | 無効（値保持・表示は維持） |
| N3 | 配置間隔 | 非表示 | 無効 | 無効 | 無効 | 無効 | 無関係（文書級） | 無効（値保持） | 有効 |
| N4 | 枝方向 | 非表示 | 無効 | 無効 | 無効 | 無効 | UI disabled かつ API 拒否（N5 同型） | 配列のみ更新可・座標不変（UI 有効時。即時再配置なし） | 無効（値保持・UI disabled） |
| N5 | ピン付与／解除 | 非表示 | 無効 | 無効 | 無効 | 無効 | UI disabled かつ API 拒否（L-1061） | 付与／解除は可・即時再配置なし | 付与／解除可（auto なら即時再配置） |
| N6 | ピンドラッグ | 到達不可 | 拒否 | 拒否 | 無効 | 無効 | 拒否 | 到達不可（auto 専用） | ピン座標移動＋ドロップ後再配置可 |

※競合: `conflictState === "conflict"` および `externallyDeleted` を含む（既存 `isDocumentBlocked` 同型）。  
関連線／グループ選択: 設計 §7 どおり本 Phase 入口（N1–N6）はいずれも **無効**（文書級の N2/N3 も例外にしない）。

即時再配置（設計 §7）:

| 変更 | auto + 配置に効く様式 | それ以外 |
|------|----------------------|----------|
| `layoutStyle` 切替 | 即再配置（1 Undo） | manual は UI disabled のため操作なし |
| `branchLayouts` 設定／既定に戻す | auto かつ orthogonal なら即再配置（1 Undo） | radial／manual では API が配列のみ更新可でも、**UI が disabled のときは入口無効**（radial の枝方向など）。UI 有効時（manual 等）は配列のみ・即時再配置なし |
| `layoutPinned` 付与／解除 | auto なら即再配置（1 Undo） | manual は属性のみ |
| ピンドラッグ＋ドロップ後リレイアウト | ジェスチャ全体で 1 Undo | — |

---

## 2. 既存操作×新状態（設計 §7）

### 2.1 プラン列挙の既存レイアウト操作

| # | 操作 | アウトライン | 保護／競合 | 関連線／グループ選択 | locked | manual | radial | ピン関与 |
|---|------|--------------|------------|----------------------|--------|--------|--------|----------|
| E1 | 兄弟並べ替え（auto DnD / `reorderSibling`） | マップ外 | 無効 | 無効 | 移動対象 locked で拒否（Phase25） | 到達不可（auto） | 既存どおり構造操作 | **非ピン**のみ。ピン対象は N6（座標ドラッグ）へ分岐 |
| E2 | manual 移動（`commitManualNodes` / `applyManualMove` / `moveNode`） | マップ外 | 無効 | 無効 | 対象 locked で拒否 | 有効（既存） | 様式に依存せず manual 座標 | auto+ピンの座標移動は N6（manual 相当・子孫非追従） |
| E3 | `setTreeDirection`（N2） | 非表示 | 無効 | 無効 | 無関係（文書級） | 無効（値保持） | 無効（値保持）・配置に使わない | 無関係 |
| E4 | `setLayoutSpacing`（N3） | 非表示 | 無効 | 無効 | 無関係（文書級） | 無効（値保持） | 有効（半径／弦に効く） | 無関係 |

アウトライン切替: 既存どおり非ノード選択クリア。文書級レイアウト UI（N1–N3）はアウトラインでは非表示（`useMapHeaderLayoutControls` が `viewMode !== "map"` で `null`）。

### 2.2 `useNodes` 公開面（操作メソッド）

状態プロパティ（`nodes` / `selectedNodeId` / `selectedNodeIds` / `canvasSelection` / `layoutMode` / `treeDirection` / `layoutSpacing` / `relations` / `groups` / `documentRevision` / `canUndo` / `canRedo`）は操作ではないため列挙対象外。

列の意味は Phase 28 同型（関連線／グループ選択中のノード対象ガード）＋本 Phase 予定 API。manual／radial／locked の詳細は §1.1・§2.1。

| # | 操作 | 関連線選択中 | グループ選択中 | 根拠 |
|---|------|--------------|----------------|------|
| U1 | `addNode` | 無効 | 無効 | ノード追加（構造） |
| U2 | `addChildNode` | 無効 | 無効 | ノード追加 |
| U3 | `addSiblingNode` | 無効 | 無効 | ノード追加 |
| U4 | `selectNode` | 無関係 | 無関係 | 選択切替 |
| U5 | `selectRelation` | 無関係 | 無関係 | 選択切替 |
| U6 | `selectGroup` | 無関係 | 無関係 | 選択切替 |
| U7 | `restoreSelection` | 無関係 | 無関係 | 選択復元 |
| U8 | `toggleNodeSelection` | 無関係 | 無関係 | 選択切替 |
| U9 | `selectNodeRange` | 無関係 | 無関係 | 選択切替 |
| U10 | `setSelectionFromMarquee` | 無関係 | 無関係 | 選択切替 |
| U11 | `clearSelection` | 無関係 | 無関係 | 選択解除 |
| U12 | `clearNonNodeSelection` | 無関係 | 無関係 | 非ノード選択クリア（アウトライン切替等） |
| U13 | `pruneSelectionToVisible` | 無関係 | 無関係 | 可視同期の内部整理 |
| U14 | `addRelation` / `removeRelation` / `updateRelation` | 無関係※ | 無効 | 関連線 API（※選択中の自操作は可） |
| U15 | `addGroup` / `removeGroup` / `updateGroupLabel` | 無効 | 無関係※ | グループ API（※選択中の自操作は可） |
| U16 | `updateNodeLabel` / `updateNodeLabels` | 無効 | 無効 | ノード属性 |
| U17 | `setLabelFontSize` / `toggleLabelBold` / `toggleLabelUnderline` | 無効 | 無効 | ノード属性 |
| U18 | `setNodeIcon` / `setNodeKind` | 無効 | 無効 | ノード属性 |
| U19 | `updateNodeImportance` / `updateNodesImportance` | 無効 | 無効 | ノード属性 |
| U20 | `attachIllustration` / `removeIllustration` | 無効 | 無効 | ノード属性 |
| U21 | `previewNodeNote` | 無効 | 無効 | ノード属性 |
| U22 | `addNodeLink` / `removeNodeLink` | 無効 | 無効 | ノード属性 |
| U23 | `addNodeTag` / `removeNodeTag` | 無効 | 無効 | ノード属性 |
| U24 | `addNodeSource` / `removeNodeSource` | 無効 | 無効 | ノード属性 |
| U25 | `addNodeMapLink` / `removeNodeMapLink` | 無効 | 無効 | ノード属性 |
| U26 | `commitManualNodes` | 無効 | 無効 | 座標確定（E2） |
| U27 | `toggleNodeEditLock` / `lockNodeSubtree` / `unlockNodeSubtree` | 無効 | 無効 | ノード対象 |
| U28 | `moveNode` | 無効 | 無効 | ノードドラッグ（E2／N6） |
| U29 | `connectNodes` | 無効 | 無効 | 接続 |
| U30 | `duplicateSubtree` / `copySubtree` / `pasteSubtree` | 無効 | 無効 | コピー系 |
| U31 | `insertSubtree` / `insertForest` | 無効 | 無効 | 挿入系 |
| U32 | `reorderSibling` | 無効 | 無効 | 並べ替え（E1） |
| U33 | `changeNodeIndent` | 無効 | 無効 | インデント |
| U34 | `insertParentNode` | 無効 | 無効 | 親挿入 |
| U35 | `splitNode` / `mergeNodes` | 無効 | 無効 | 分割・統合 |
| U36 | `moveBranch` | 無効 | 無効 | 枝移動 |
| U37 | `deleteNode` / `deleteNodeOnly` | 無効 | 無効 | 削除（Delete 振替は Phase28 N4/N9） |
| U38 | `setLayoutMode` | 無関係 | 無関係 | 文書級（既存） |
| U39 | `setTreeDirection` | **無効** | **無効** | 文書級（N2／E3）。設計 §7・N1 と同型 |
| U40 | `setLayoutSpacing` | **無効** | **無効** | 文書級（N3／E4）。設計 §7・N1 と同型 |
| U41 | `setLayoutStyle`（予定・Task4） | **無効** | **無効** | 本 Phase 新入口 N1（§7） |
| U42 | `setBranchLayout`（予定・Task3） | **無効** | **無効** | 本 Phase 新入口 N4 |
| U43 | `setNodeLayoutPinned`（予定・Task2） | **無効** | **無効** | 本 Phase 新入口 N5。locked は拒否 |
| U44 | `replaceMap` | 無関係 | 無関係 | 文書置換 |
| U45 | `undo` / `redo` | 無関係 | 無関係 | 履歴 |
| U46 | `beginMoveHistory` | 無関係 | 無関係 | 履歴リース（内部） |

### 2.3 layout hooks 公開面（`useNodeLayoutState`）

| # | 操作 | 関連線選択中 | グループ選択中 | manual | radial | 根拠 |
|---|------|--------------|----------------|--------|--------|------|
| L1 | `applyNonStructuralChange` / `applyNonStructuralPreview` | 無効※ | 無効※ | 受理 | 受理 | ノード属性系の下位。※呼び出し元 useNodes が選択ガード |
| L2 | `applyManualMove` | 無効※ | 無効※ | 受理 | 受理（manual 時） | auto では false（既存）。ピン auto ドラッグは別経路（N6） |
| L3 | `applyTreeChange` / `applyStateChange` | 無効※ | 無効※ | 座標は手動のまま | `layoutStyle` 分岐（Task4） | auto なら `layoutNodeForest` |
| L4 | `setLayoutMode` | 無関係 | 無関係 | — | — | 文書級 |
| L5 | `setTreeDirection` | **無効** | **無効** | 値のみ（UI disabled） | 値保持・配置非使用（UI disabled・非表示にしない） | N2 |
| L6 | `setLayoutSpacing` | **無効** | **無効** | 値のみ（UI disabled） | 有効 | N3 |
| L7 | `setLayoutStyle`（予定） | **無効** | **無効** | UI disabled | 切替可 | N1。hooks または useNodes 経由 |
| L8 | `replaceLayoutState` | 無関係 | 無関係 | 無関係 | 無関係 | 文書置換 |
| L9 | `undo` / `redo` / `beginMoveHistory` | 無関係 | 無関係 | 無関係 | 無関係 | 履歴 |
| L10 | `getCurrentState` | 無関係 | 無関係 | 無関係 | 無関係 | 読取のみ |

### 2.4 Phase 25 inventory 各行

出典: `2026-11-23-phase25-lock-inventory.md`

| # | 入口（Phase25 行） | 関連線選択中 | グループ選択中 | Phase29 追記 |
|---|--------------------|--------------|----------------|--------------|
| P1 | ノードドラッグ | 無効 | 無効 | auto+非ピン＝並べ替え（E1）。auto+ピン＝N6。manual＝E2。locked 拒否 |
| P2 | ラベルインライン編集 | 無効 | 無効 | 無関係（配置拡張と非交差） |
| P3 | 削除・Backspace | 振替（Phase28） | 振替（Phase28） | 無関係 |
| P4 | 分割・統合・親挿入 | 無効 | 無効 | `layoutPinned` は policy（Task1）。入口ガードは既存 |
| P5 | 重要度・属性パネル更新 | 無効 | 無効 | ピン UI（N5）は別節。属性パネル全体は選択ガードどおり無効 |
| P6 | 兄弟 DnD（auto） | 無効 | 無効 | E1／ピン分岐 N6 |
| P7 | クリップボード貼り付け上書き | 無効 | 無効 | `layoutPinned` 値コピー・`branchLayouts` remap（Task1） |
| P8 | 整列・等間隔 048 | 無効 | 無効 | manual 選択レイアウト。ピン属性とは独立 |
| P9 | ラベル書式変更 | 無効 | 無効 | 無関係 |
| P10 | 見た目（icon/kind・illustration） | 無効 | 無効 | 無関係 |
| P11 | 枝切り出し（別マップ化） | 無効 | 無効 | `branchLayouts` prune／remap（Task1） |

### 2.5 コマンドパレット項目（`COMMAND_CATALOG`）

パレットへの様式／枝方向／ピン掲載は **非目標**。既存項目のみ。列は Phase 28 同型。

| # | id | ラベル | 関連線選択中 | グループ選択中 | 根拠 |
|---|----|--------|--------------|----------------|------|
| C1 | `view.map` | マップ表示へ切替 | 無関係 | 無関係 | 表示切替 |
| C2 | `view.outline` | アウトライン表示へ切替 | 無関係 | 無関係 | 表示切替（切替後 N1–N6 非表示） |
| C3 | `view.fit-all` | 全体に合わせる | 無関係 | 無関係 | ビューポート |
| C4 | `view.fit-selection` | 選択に合わせる | 無効 | 無効 | ノード選択前提 |
| C5 | `view.focus-branch` | 枝に集中 | 無効 | 無効 | ノード枝対象 |
| C6 | `view.focus-clear` | 集中表示を終了 | 無関係 | 無関係 | 表示状態の解除 |
| C7 | `view.expand-subtree` | 枝を一括展開 | 無効 | 無効 | ノード枝対象 |
| C8 | `view.collapse-subtree` | 枝を一括折りたたみ | 無効 | 無効 | ノード枝対象 |
| C9 | `edit.undo` | 元に戻す | 無関係 | 無関係 | 履歴 |
| C10 | `edit.redo` | やり直す | 無関係 | 無関係 | 履歴 |
| C11 | `edit.duplicate-branch` | 枝を複製 | 無効 | 無効 | ノード操作 |
| C12 | `edit.delete-node-only` | ノードだけ削除 | 無効 | 無効 | 同上 |
| C13 | `edit.insert-parent` | 親を挿入 | 無効 | 無効 | 同上 |
| C14 | `edit.move-sibling-up` | 兄弟を上へ | 無効 | 無効 | 同上（E1 系） |
| C15 | `edit.move-sibling-down` | 兄弟を下へ | 無効 | 無効 | 同上 |
| C16 | `edit.indent` | 階層を下げる | 無効 | 無効 | 同上 |
| C17 | `edit.outdent` | 階層を上げる | 無効 | 無効 | 同上 |
| C18 | `edit.open-label-replace` | ラベルを一括置換… | 無効 | 無効 | ノード属性 |
| C19 | `edit.open-branch-move` | 枝を別マップへ移動… | 無効 | 無効 | ノード枝 |
| C20 | `edit.open-node-split` | ノードを分割… | 無効 | 無効 | 分割 |
| C21 | `edit.open-node-merge` | ノードを統合… | 無効 | 無効 | 統合 |
| C22 | `edit.register-part` | 選択を部品に登録… | 無効 | 無効 | ノード選択前提 |
| C23 | `edit.insert-part` | 部品を挿入… | 無効 | 無効 | ノード挿入系 |
| C24 | `edit.delete-part` | 部品を削除… | 無関係 | 無関係 | 部品ライブラリ meta |
| C25 | `search.focus-in-map` | マップ内検索へフォーカス | 無関係 | 無関係 | 検索 UI |
| C26 | `search.open-cross-map` | 全マップ検索… | 無関係 | 無関係 | 検索 UI |
| C27 | `outline.add-root` | ルート追加 | 無関係 | 無関係 | アウトライン専用 |
| C28 | `outline.add-child` | 子を追加 | 無関係 | 無関係 | 同上 |
| C29 | `outline.add-sibling` | 兄弟を末尾に追加 | 無関係 | 無関係 | 同上 |
| C30 | `outline.begin-edit` | ラベル編集 | 無関係 | 無関係 | 同上 |

---

## 3. 行数サマリ

| 区分 | 行数 |
|------|------|
| §6 新入口（N1–N6） | **6** |
| 条件マトリクス（N×8 軸） | **6** 行 |
| 既存レイアウト操作（E1–E4） | **4** |
| `useNodes` 公開操作（U1–U46） | **46** |
| layout hooks（L1–L10） | **10** |
| Phase25 inventory 行（P1–P11） | **11** |
| コマンドパレット（C1–C30） | **30** |
| 新入口合計 | 6 |
| 既存操作ガード合計（E+U+L+P+C） | **101** |

---

## 4. 実装後ギャップ

実装完了時点で、§1 の設計どおり（manual 時の間隔 disabled・保護／競合でのヘッダー無効・ピンドラッグは `movePinnedNode` / `finalizePinnedNodeMove`）に揃えている。残ギャップなし。

（関連線／グループ選択中の文書級入口は設計 §7 で **無効**。N2/N3 も N1/N4–N6 と同型。）

---

## 5. 共通メモ

- locked と `layoutPinned` は別（設計 §5）。L-1061: locked はピン操作・ピンドラッグ拒否。N4（枝方向）も主選択 locked 時は **UI disabled かつ API 拒否（N5 同型）**。
- radial 中: `treeDirection` は **マップ上で表示したまま disabled（値保持）**（orthogonal 専用の非表示にしない）。`branchLayouts` も UI disabled／配置非使用。`layoutSpacing` は有効。
- manual 中: `layoutStyle` / `treeDirection` / `layoutSpacing` は disabled（値保持）。枝方向・ピン属性は UI 有効時に配列／属性のみ更新可（即時再配置なし）。**API が配列更新可でも UI が disabled のときは入口無効**（radial の枝方向など）。
- 関連線／グループ選択: N1–N6・E3/E4・U39/U40・L5/L6 はいずれも **無効**（設計 §7）。
- 統合テストで代表経路を固定する対象: N1–N6 がアウトライン非表示・保護／競合／関連線／グループで無効、locked で N4/N5/N6 が UI disabled かつ／または API 拒否、manual で N1 disabled、radial で N2/N4 disabled（値保持）。

## 6. 型コメント・docs 同期（Task 5 / L-203）

| 箇所 | 状態 |
|------|------|
| `setNodeLayoutPinned` / `setBranchLayout` / `setLayoutStyle` の api.md（§17） | 同期済み |
| `features.md`（§34） / `data-model.md` / `overview.md` | 同期済み |
| `ROADMAP.md`（064–066・Phase29 完了・現在地） | 同期済み |
| 本 inventory 実装ファイル列（N1–N6） | パス確定済み |
| 仕様からの辿り | `features.md` §34・`api.md` §17・`overview.md`（Phase 29 流れ）から本ファイルへリンク |
