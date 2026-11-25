# Phase 31（072/073）: プレゼンテーションと案内 操作入口インベントリ（L-061）

設計: `2026-11-25-phase31-presentation-guide-design.md` §4（編集 UI）・§5（再生 UI）・§5.1（L-061）・§6（アウトライン）  
関連: `2026-11-23-phase28-relations-groups-inventory.md`（`useNodes`・`COMMAND_CATALOG` 列挙手順）、`2026-11-24-phase30-opml-csv-exchange-inventory.md`（取込／書き出し・`editorShortcutsEnabled` 積）、`2026-11-23-phase25-lock-inventory.md`（既存マップ操作行）、`COMMAND_CATALOG`（`client/src/domain/commands/commandCatalog.ts`）、`UseNodesReturn`（`client/src/hooks/useNodes.ts`）、`MapEditor.tsx`（`editorShortcutsEnabled`・根 `inert`）

## L-1085（適用外 / N/A）

本 Phase に **合成名は無い**。ツアー `title`・ステップ `caption` はユーザー入力の永続文字列であり、UI 専用フォールバック表示名の濫用ではない。よって知見 **L-1085 は本 Phase では N/A**。

- [x] inventory 作成（列挙完了）

判定語:

| 語 | 意味 |
|----|------|
| **非表示** | `visible=false`（控件が `null`、当該モードで到達不可） |
| **無効** | UI `disabled`・ショートカット無視・API 無操作（編集・取込・閲覧履歴・ブックマーク等を再生中に塞ぐ） |
| **拒否** | 事前条件不成立で実行しない（例: `steps.length === 0` で再生開始不可、端で前後ボタン不可） |
| **無関係** | 当該条件と交差しない（閲覧のみの選択・パン・ズーム・再生バー操作等） |
| **有効** | 条件を満たせば操作可能 |
| **確定先行** | ラベルインライン編集中はヘッダー click の `blur` で確定してから別ダイアログを開く（Phase 30 同型。再生開始前の通常モードでのみ到達） |

**テスト所有者**: **ツアー編集入口・`tourEditor` ダイアログ＝Task 3**、**再生モード・再生中ガード・前後／終了＝Task 4**。いずれも本表の代表経路（保護・競合・関連線／グループ選択・ラベル編集中・アウトライン表示）を RED/GREEN。**再生中のツアー編集不可**は Task 4 で RED/GREEN。Task 0 自体は文書のみ。

---

## 0. 画面状態と `editorShortcutsEnabled` 積（Task 3/4 で実装）

| 状態 | 識別子（仮称） | 根 `[data-map-id]` の `inert` | 編集ショートカット | パン・ズーム（マップ） | 備考 |
|------|----------------|------------------------------|--------------------|-------------------------|------|
| 通常 | `presentation.screen === "closed"` かつ `tourEditor.screen === "closed"` | `!editorShortcutsEnabled` 時のみ `inert`（既存ダイアログ同型） | `editorShortcutsEnabled` が真なら有効 | 有効 | 現行 `MapEditor.tsx` L837–852, L1186 |
| ツアー編集ダイアログ open | `tourEditor.screen === "open"` | **`inert`**（ダイアログは根の兄弟） | **停止**（積に `tourEditor.screen === "closed"` を追加） | 到達困難 | OutlineImport／ExchangeImport 同型 |
| 再生中 | `presentation.screen === "playing"` | **`inert` を付けない**（設計 §5.1・実装計画 Global Constraints） | **編集系のみ停止**（積に `presentation.screen === "closed"` を追加。履歴・構造・パレット・取込等） | **有効**（ジェスチャ。次ステップ適用で上書き可・履歴に載せない） | 左右矢印は再生専用（前後）。Escape＝終了 |

`editorShortcutsEnabled` 予定積（Task 3/4）:

```
shortcutsEnabled
&& commandPalette.screen === "closed"
&& outlineImport.screen === "closed"
&& exchangeImport.screen === "closed"
&& branchMove…（既存）
&& tourEditor.screen === "closed"          // 新規
&& presentation.screen === "closed"          // 新規（再生中は偽＝編集キー停止）
&& relationPartnerFromId === null
&& …（既存）
```

根の `inert` 予定式（Task 4）:

```
inert={!editorShortcutsEnabled && presentation.screen !== "playing"}
```

（再生中は `editorShortcutsEnabled === false` でも **inert にしない**。パン・ズーム・再生バーを操作可能にする。）

再生の snapshot 適用: `viewNavigation.applyView(snapshot)` の **第2引数なし**（`recordNavigation` しない）。表示ブックマーク適用（`MapEditor.tsx` L1313–1316）は対比として **第2引数あり**。

---

## 1. 設計 §4・§5・§6 新入口（未実装・Task 3/4）

| # | 入口 | visible | disabled / 拒否 | 関与 | 実装ファイル（予定） |
|---|------|---------|-------------------|------|----------------------|
| N1 | ヘッダー「**ツアー**」（編集ダイアログを開く） | **マップ・アウトライン**（設計 §6・表示系コントロール付近） | **保護**＝無効。**競合**＝無効（`isDocumentBlocked` 同型）。**再生中**＝無効（Task 4）。`steps` 未定義でも開ける（空下書き可） | 文書（`tour` 編集） | `TourEditorControl.tsx`／`TourEditorDialog.tsx`／`useMapTourEditor`（仮） |
| N2 | ツアー編集ダイアログ内操作（作成・削除・タイトル・ステップ追加／並べ替え／削除・キャプション・「今の表示を上書き」） | `tourEditor.screen === "open"` | 保護／競合＝無効。**再生中**＝到達不可（N1 無効）。0 件ステップの下書きは UI 上可・保存時 `tour` 欠落（設計 §3.1） | 文書・Undo 各 1 回 | 同上／`useNodes` または専用 hook（Task 2） |
| N3 | 「**プレゼン開始**」 | **マップ・アウトライン**（N1 と同ブロック推奨） | **`tour` なしまたは `steps.length === 0`**＝無効。**保護**＝**有効**（編集は不可・再生は可）。**競合**＝無効。**再生中**＝拒否（二重開始） | 閲覧（メモリ再生状態＋snapshot 適用） | `PresentationStartControl.tsx`／`usePresentationPlayback`（Task 4） |
| N4 | 再生バー「戻る」「次へ」「終了」・ステップ表示 **1 / N** | 再生中（マップ上。根 `inert` 外でも可） | 先頭で戻る・末尾で次へ＝**拒否**（ボタン disabled） | 閲覧のみ（Undo 対象外） | `PresentationPlaybackBar.tsx`／`usePresentationPlayback` |
| N5 | 再生中キャプション表示（073） | 再生中・当該ステップに正規化後キャプションあり | 空・欠落＝**非表示** | 表示のみ | 再生バーまたはオーバーレイ |
| N6 | 再生中キー **← / →**（前後） | `presentation.screen === "playing"` のみ | 端＝無視（N4 同型） | 閲覧 | `usePresentationPlayback`／`MapEditor` キー束 |
| N7 | 再生中 **Escape**（終了） | 再生中 | — | 開始直前表示へ復元 | 同上 |

新操作のコマンドパレット掲載: **非目標**（N1–N7 はパレット行を追加しない）。

### 1.1 新入口×条件（代表経路・Task 3/4）

| # | 入口 | アウトライン | 保護 | 競合※ | 関連線選択 | グループ選択 | ラベル編集（マップ） | ラベル編集（アウトライン） | 再生中 | 備考 |
|---|------|--------------|------|--------|------------|--------------|----------------------|---------------------------|--------|------|
| N1 | ツアー編集を開く | 有効 | **無効** | 無効 | 有効（開いた後は inert） | 有効 | 確定先行 | 行操作停止（`shortcutsEnabled` 連動） | **無効** | Task 3: 保護・ダイアログ inert／積 |
| N2 | ダイアログ内編集 | ダイアログ内 | 無効 | 無効 | 到達不可（inert） | 到達不可 | 到達不可 | 到達不可 | **到達不可** | Task 3 |
| N3 | プレゼン開始 | 有効 | **有効** | 無効 | 有効 | 有効 | 無関係 | 無関係 | **拒否** | Task 4: steps0 無効・保護中再生可 |
| N4–N7 | 再生操作 | 再生 UI はマップ中心（アウトラインでも N3 は visible） | **有効** | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | **有効**（N4–N7 のみ） | Task 4 |

※競合: `conflictState === "conflict"` および `externallyDeleted` を含む。

---

## 2. 予定 API（Task 2/4・`useNodes` 拡張または隣接 hook）

| # | 操作 | 保護 | 競合 | 再生中 | 根拠 |
|---|------|------|------|--------|------|
| A1 | ツアー作成／タイトル更新／削除 | 無効 | 無効 | **無効** | 文書変更（§3.1） |
| A2 | ステップ追加（現在表示を snapshot 化） | 無効 | 無効 | **無効** | 文書変更 |
| A3 | ステップ並べ替え／削除／キャプション更新／snapshot 上書き | 無効 | 無効 | **無効** | 文書変更・Undo 1 回 |
| A4 | `presentation.start`（先頭ステップ適用） | **有効** | 無効 | 拒否 | 閲覧・`recordNavigation: false` |
| A5 | `presentation.step`（前／次） | **有効** | 無効 | 有効（端除く） | 同上 |
| A6 | `presentation.end`（開始前表示復元） | **有効** | 無効 | 有効 | 同上 |

---

## 3. 既存 UI 入口×再生中（設計 §5.1 代表・Task 4）

| # | 入口 | 現行実装 | 再生中 | 根拠 |
|---|------|----------|--------|------|
| E1 | 閲覧「戻る」「進む」 | `BranchNavigationControls`／`MapViewHistoryControls` `onTravel`（`viewNavigation.travel`） | **無効** | 設計 §5.1・ブックマークと同列 |
| E1b | 枝に集中／集中表示を終了 | `BranchNavigationControls` `onToggleFocus` | **無効** | C5/C6・§5.1（表示ナビ停止） |
| E1c | 枝を一括展開 | `BranchNavigationControls` `onSetSubtreeCollapsed(false)` | **無効** | C7 同型 |
| E1d | 枝を一括折りたたみ | `BranchNavigationControls` `onSetSubtreeCollapsed(true)` | **無効** | C8 同型 |
| E1e | 全体に合わせる（集中中は表示中の枝に合わせる） | `BranchNavigationControls` `onFitAll` | **無効** | C3 同型 |
| E1f | 選択に合わせる | `BranchNavigationControls` `onFitSelection` | **無効** | C4 同型 |
| E1g | パンくずナビゲーション | `BranchNavigationControls`／`NodeBreadcrumb` `onNavigate` | **無効** | 閲覧履歴と同列（§5.1） |
| E2 | 表示ブックマーク（保存・適用・削除） | `MapViewBookmarkControls` `disabled={…\|\| !editorShortcutsEnabled}`（L1310） | **無効** | 設計 §5.1。積で停止＋明示 disabled 推奨 |
| E3 | 箇条書き取込 | Phase 30 **R1** | **無効** | 構造変更・取込 |
| E4 | OPML／CSV 取込 | Phase 30 **N1–N2** | **無効** | 同上 |
| E5 | JSON 読み込み（全文置換） | Phase 30 **X3** | **無効** | 構造変更 |
| E6 | 各種書き出し（JSON/PNG/OPML…） | Phase 30 **X2–X5, N3–N5** | **有効**（download のみ） | 設計は「塞ぐ」対象外。保護・競合どおり download 可 |
| E7 | アウトライン行ラベル編集・構造操作 | `outlineActions` `enabled: editorShortcutsEnabled && viewMode === "outline"`（L881–883） | **無効** | 設計 §6 |
| E8 | マップ・ラベルインライン編集 | `MapStage`／`NodeLabelEditor` | **無効** | §5.1 |
| E9 | ヘッダー構造操作群（複製・枝移動・置換・分割・統合・並べ替え・インデント・親挿入・削除） | `MapEditor` operationControls | **無効** | §5.1 |
| E10 | コマンドパレット | `commandPalette`＋`editorShortcutsEnabled` | **無効** | 積で停止（既存 L-061） |
| E11 | 右パネル属性編集（ノード／関連線／グループ） | `NodeDetailPanel` 各節 | **無効** | §5.1 |
| E12 | コンテキストメニュー（ノード構造・関連線・グループ） | Phase 28 **N1–N10** 相当 | **無効** | §5.1 |
| E13 | ノード／枝 DnD・ピンドラッグ | Phase 25 **P1,P6**・Phase 29 **N6** | **無効** | 構造・座標変更 |
| E14 | 履歴 Undo／Redo（文書） | `useMapHistoryShortcuts` `enabled: editorShortcutsEnabled` | **無効** | 再生ページ送りは Undo 対象外（設計 §3.3） |

---

## 4. `useNodes` 公開操作×条件（Phase 28 §2.1 拡張）

状態プロパティは Phase 28 同型のため列挙対象外。列の意味は §1.1・Phase 28 §2.1 に加え **再生中**＝`presentation.screen === "playing"`。※競合は `conflictState === "conflict"` および `externallyDeleted` を含む。

| # | 操作 | 保護 | 競合※ | 関連線選択 | グループ選択 | ラベル編集（マップ） | ラベル編集（アウトライン） | アウトライン | 再生中 | 根拠 |
|---|------|------|--------|------------|--------------|----------------------|---------------------------|--------------|--------|------|
| U1 | `addNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ノード追加 |
| U2 | `addChildNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ノード追加 |
| U3 | `addSiblingNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ノード追加 |
| U4 | `selectNode` | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 選択のみ（編集ショートカット停止） |
| U5 | `selectRelation` | 無関係 | 無関係 | 無関係 | 無効 | 無関係 | 無関係 | 無関係 | 無効 | パネル編集経路を塞ぐ |
| U6 | `selectGroup` | 無関係 | 無関係 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無効 | 同上 |
| U7 | `restoreSelection` | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 選択復元 |
| U8 | `toggleNodeSelection` | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 選択切替 |
| U9 | `selectNodeRange` | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 選択切替 |
| U10 | `setSelectionFromMarquee` | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 選択切替 |
| U11 | `clearSelection` | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 選択解除 |
| U12 | `clearNonNodeSelection` | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 非ノード選択クリア |
| U13 | `pruneSelectionToVisible` | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 内部整理 |
| U14 | `addRelation` / `removeRelation` / `updateRelation` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 構造・属性 |
| U15 | `addGroup` / `removeGroup` / `updateGroupLabel` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 同上 |
| U16 | `updateNodeLabel` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ノード属性 |
| U17 | `updateNodeLabels` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 一括ラベル |
| U18 | `setLabelFontSize` / `toggleLabelBold` / `toggleLabelUnderline` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 書式 |
| U19 | `setNodeIcon` / `setNodeKind` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 属性 |
| U20 | `updateNodeImportance` / `updateNodesImportance` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 属性 |
| U21 | `attachIllustration` / `removeIllustration` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 属性 |
| U22 | `previewNodeNote` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 詳細メモ |
| U23 | `addNodeLink` / `removeNodeLink` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | リンク |
| U24 | `addNodeTag` / `removeNodeTag` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | タグ |
| U25 | `addNodeSource` / `removeNodeSource` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 出典 |
| U26 | `addNodeMapLink` / `removeNodeMapLink` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | マップ間リンク |
| U27 | `commitManualNodes` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 座標確定 |
| U28 | `toggleNodeEditLock` / `lockNodeSubtree` / `unlockNodeSubtree` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ロック |
| U29 | `moveNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ドラッグ |
| U30 | `connectNodes` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 接続 |
| U31 | `duplicateSubtree` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 複製 |
| U32 | `copySubtree` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | クリップボード |
| U33 | `pasteSubtree` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 貼付 |
| U34 | `insertSubtree` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 挿入 |
| U35 | `insertForest` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 取込系 |
| U36 | `reorderSibling` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 構造 |
| U37 | `changeNodeIndent` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | インデント |
| U38 | `insertParentNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 親挿入 |
| U39 | `splitNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 分割 |
| U40 | `mergeNodes` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 統合 |
| U41 | `moveBranch` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 枝移動 |
| U42 | `deleteNode` / `deleteNodeOnly` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 削除 |
| U43 | `setLayoutMode` / `setTreeDirection` / `setLayoutSpacing` | 無効 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無効 | 文書級レイアウト |
| U44 | `setLayoutStyle` / `setNodeLayoutPinned` / `setBranchLayout` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | Phase 29 拡張 |
| U45 | `movePinnedNode` / `finalizePinnedNodeMove` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ピンドラッグ |
| U46 | `replaceMap` | 無効 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無効 | 全文置換 |
| U47 | `undo` / `redo` | 無効 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無効 | 文書履歴（再生操作は載せない） |
| U48 | `beginMoveHistory` | 無効 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 内部リース |

（関連線／グループ選択中の Phase 28 判定は **再生中を含む他条件と積**。「再生中」列は編集系 API を原則 **無効**、選択系は **無関係**。保護・競合時の編集不可は Phase 28–30 inventory 同型。）

---

## 5. コマンドパレット（`COMMAND_CATALOG`）×条件

パレット新操作（ツアー／再生）は **非目標**。既存項目のみ。再生中は `editorShortcutsEnabled === false` のため **編集・表示ナビ系は原則無効**（`view.map` / `view.outline` も同積で **無効**。C3–C8・E1b–E1g と対応）。

| # | id | ラベル | 保護 | 競合※ | 関連線選択 | グループ選択 | ラベル編集（マップ） | ラベル編集（アウトライン） | アウトライン | 再生中 | 根拠 |
|---|-----|--------|------|--------|------------|--------------|----------------------|---------------------------|--------------|--------|------|
| C1 | `view.map` | マップ表示へ切替 | 有効 | 無効 | 無関係 | 無関係 | 確定先行 | 確定先行 | 有効 | 無効 | `changeViewMode` は `editorShortcutsEnabled` 積で停止（Phase 22 同型。E7 でアウトライン行編集も停止） |
| C2 | `view.outline` | アウトライン表示へ切替 | 有効 | 無効 | 無関係 | 無関係 | 確定先行 | 確定先行 | 有効 | 無効 | 同上（再生中はビュー切替ショートカット／パレット実行とも停止） |
| C3 | `view.fit-all` | 全体に合わせる | 有効 | 無効 | 無関係 | 無関係 | 無効 | 無効 | 無関係 | 無効 | ショートカット停止 |
| C4 | `view.fit-selection` | 選択に合わせる | 有効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 同上 |
| C5 | `view.focus-branch` | 枝に集中 | 有効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 同上 |
| C6 | `view.focus-clear` | 集中表示を終了 | 有効 | 無効 | 無関係 | 無関係 | 無効 | 無効 | 無関係 | 無効 | 同上 |
| C7 | `view.expand-subtree` | 枝を一括展開 | 有効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 表示状態変更（履歴方針は Task 4 で固定） |
| C8 | `view.collapse-subtree` | 枝を一括折りたたみ | 有効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 同上 |
| C9 | `edit.undo` | 元に戻す | 無効 | 無効 | 無関係 | 無関係 | 無効 | 無効 | 無関係 | 無効 | 文書履歴 |
| C10 | `edit.redo` | やり直す | 無効 | 無効 | 無関係 | 無関係 | 無効 | 無効 | 無関係 | 無効 | 同上 |
| C11 | `edit.duplicate-branch` | 枝を複製 | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 編集 |
| C12 | `edit.delete-node-only` | ノードだけ削除 | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 編集 |
| C13 | `edit.insert-parent` | 親を挿入 | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 編集 |
| C14 | `edit.move-sibling-up` | 兄弟を上へ | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 編集 |
| C15 | `edit.move-sibling-down` | 兄弟を下へ | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 編集 |
| C16 | `edit.indent` | 階層を下げる | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 編集 |
| C17 | `edit.outdent` | 階層を上げる | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | 編集 |
| C18 | `edit.open-label-replace` | ラベルを一括置換… | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ダイアログ |
| C19 | `edit.open-branch-move` | 枝を別マップへ移動… | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ダイアログ |
| C20 | `edit.open-node-split` | ノードを分割… | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ダイアログ |
| C21 | `edit.open-node-merge` | ノードを統合… | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ダイアログ |
| C22 | `edit.register-part` | 選択を部品に登録… | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ダイアログ |
| C23 | `edit.insert-part` | 部品を挿入… | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | 無効 | ダイアログ |
| C24 | `edit.delete-part` | 部品を削除… | 無効 | 無効 | 無関係 | 無関係 | 無効 | 無効 | 無関係 | 無効 | ダイアログ |
| C25 | `search.focus-in-map` | マップ内検索へフォーカス | 有効 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無効 | UI フォーカス（編集停滞防止） |
| C26 | `search.open-cross-map` | 全マップ検索… | 有効 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無効 | ダイアログ |
| C27 | `outline.add-root` | ルート追加 | 有効 | 無効 | 無関係 | 無関係 | 無効 | 無効 | 有効 | 無効 | アウトライン構造 |
| C28 | `outline.add-child` | 子を追加 | 有効 | 無効 | 無関係 | 無関係 | 無効 | 無効 | 有効 | 無効 | 同上 |
| C29 | `outline.add-sibling` | 兄弟を末尾に追加 | 有効 | 無効 | 無関係 | 無関係 | 無効 | 無効 | 有効 | 無効 | 同上 |
| C30 | `outline.begin-edit` | ラベル編集 | 有効 | 無効 | 無関係 | 無関係 | 無効 | 無効 | 有効 | 無効 | 同上 |
---

## 6. Phase 25 inventory 抜粋×再生中

| # | 入口（Phase25） | 再生中 | 根拠 |
|---|-----------------|--------|------|
| P1 | ノードドラッグ | 無効 | E13 |
| P2 | ラベルインライン編集 | 無効 | E8 |
| P3 | 削除・Backspace | 無効 | 編集ショートカット停止（関連線振替も到達しない） |
| P4 | 分割・統合・親挿入 | 無効 | E9 |
| P5 | 重要度・属性パネル更新 | 無効 | E11 |
| P6 | 兄弟 DnD（auto） | 無効 | E13 |
| P7 | クリップボード貼り付け上書き | 無効 | U33 |
| P8 | 整列・等間隔 | 無効 | ノード選択前提の構造操作 |
| P9 | ラベル書式変更 | 無効 | U18 |
| P10 | 見た目（icon/kind・illustration） | 無効 | U19–U21 |
| P11 | 枝切り出し（別マップ化） | 無効 | 文書分岐 |

---

## 7. 行数サマリ

| 区分 | 行数 |
|------|------|
| §1 新入口（N1–N7） | **7** |
| §1.1 新入口条件マトリクス | **7** |
| §2 予定 API（A1–A6） | **6** |
| §3 既存 UI×再生中（E1–E1g, E2–E14） | **19** |
| §4 `useNodes`（U1–U48） | **48** |
| §5 コマンドパレット（C1–C30） | **30** |
| §6 Phase25 抜粋（P1–P11） | **11** |
| **新入口合計** | **7** |
| **再生ガード合計（E+U+C+P+A）** | **124** |

---

## 8. 実装後メモ（Task 5 時点）

1. **N1–N7, A1–A6**: `TourEditorControl` / `TourEditorDialog` / `PresentationStartControl` / `PresentationPlaybackBar`・`useMapTourEditor` / `usePresentationPlayback` 実装済み。
2. **`presentation.screen` / `tourEditor.screen`**: `MapEditor.tsx` に積・再生中 `inert` 例外を反映済み。
3. **書き出し**: 再生中も download **有効**（設計 §5.1 の「塞ぐ」リスト外）。
4. **切取（cut）**: Phase 28 §4 ギャップ同型。専用 API 無し。再生中も到達しない。

---

## 9. Task 3/4 統合テスト代表経路（チェックリスト）

**Task 3（ツアー編集）**

- [x] マップ・アウトラインで N1 visible
- [x] 保護・競合で N1/N2 無効
- [x] `tourEditor` open で根 inert・積・履歴ショートカット停止
- [x] ダイアログ内編集が Undo 1 回（A1–A3 は Task 2 と接続）

**Task 4（再生）**

- [x] steps0 で N3 無効・保護中 N3 有効
- [x] 開始で先頭 snapshot・`applyView` 第2引数なし
- [x] 再生中 E1–E1g・E2–E5・E7–E14・U1–U47（編集系）・C1–C30 が無効（C1/C2 の `changeViewMode` 含む）
- [x] **再生中 N1 無効**（ツアー編集不可）
- [x] 再生中パン可・根 **inert なし**
- [x] N4–N7・A4–A6・左右矢印・Escape
- [x] 終了で開始前表示復元・再生 Undo 非対象

---

## 10. 型コメント・docs 同期（Task 5 / L-203）

| 箇所 | 状態 |
|------|------|
| `features.md` §36、tour API §19 | **済**（Task 5） |
| `data-model.md` `NodeMapState.tour` / `MapTour` | **済**（Task 5） |
| `overview.md` Phase 31 節 | **済**（Task 5） |
| `nodeMapState.ts` 型コメント | **済**（Task 5） |
| 本 inventory §8–§9 | **済**（Task 5） |
| 仕様からの辿り | 設計 §5.1 → 本ファイル → `features.md` §36 |