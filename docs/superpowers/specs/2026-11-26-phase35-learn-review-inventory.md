# Phase 35（088/089）: 学習と復習 操作入口インベントリ（L-061）

作成日: 2026-11-26（Task 0）。設計: `docs/superpowers/specs/2026-11-26-phase35-learn-review-design.md` §4〜§7（特に §6 編集可否・§7.1）。  
関連: `2026-11-25-phase31-presentation-guide-inventory.md`（`presentationPlayback.screen`・`editorShortcutsEnabled` 積・列型）、`2026-11-24-phase30-opml-csv-exchange-inventory.md`（取込／書き出し・確定先行）、`2026-11-25-phase32-ai-assist-review-inventory.md`／`2026-11-25-phase33-ai-ideation-support-inventory.md`（AI 入口・`aiAssist.screen`）、`2026-11-23-phase28-relations-groups-inventory.md`（`useNodes`・選択ガード）、`COMMAND_CATALOG`（`client/src/domain/commands/commandCatalog.ts`）、`UseNodesReturn`（`client/src/hooks/useNodes.ts`）、`MapEditor.tsx`（`client/src/components/map/MapEditor.tsx` L959–978, L1351・`editorShortcutsEnabled`・根 `inert`）

## L-1085（適用外 / N/A）

本 Phase に **合成名は無い**。穴埋めプレースホルダと復習カードの `prompt`／`answer` はユーザー文書または決定的生成文字列であり、UI 専用フォールバック表示名の濫用ではない。よって知見 **L-1085 は本 Phase では N/A**。

- [x] inventory 作成（列挙完了）

判定語（Phase 28–31 同型）:

| 語 | 意味 |
|----|------|
| **非表示** | `visible=false`（控件が `null`、当該モードで到達不可） |
| **無効** | UI `disabled`・ショートカット無視・API 無操作（構造・ラベル編集・取込・AI・統合等を学習中に塞ぐ） |
| **拒否** | 事前条件不成立で実行しない（例: プレゼン中に学習開始不可、開示対象が未選択） |
| **無関係** | 当該条件と交差しない（閲覧のみの選択・パン・ズーム等） |
| **有効** | 条件を満たせば操作可能 |
| **確定先行** | ラベルインライン編集中はヘッダー click の `blur` で確定してから別 UI を開く（Phase 30 同型） |

**テスト所有者**: **学習モード・モードガード・表示・開示・リセット・プレゼン相互排他・編集ロック＝Task 2**、**復習カード生成・パネル・めくり＝Task 3**。いずれも本表の代表経路（保護・競合・関連線／グループ選択・ラベル編集中・アウトライン表示）を RED/GREEN。**Task 0 自体は文書のみ**。

※競合列: `conflictState === "conflict"` および `externallyDeleted` を含む。

---

## 0. 画面状態・相互排他・`editorShortcutsEnabled` 積（Task 2/3 で実装）

| 状態 | 識別子 | 根 `[data-map-id]` の `inert` | 編集ショートカット | パン・ズーム・折りたたみ・フォーカス | 備考 |
|------|--------|------------------------------|--------------------|---------------------------------------|------|
| 通常 | `learningActive === false` かつ `presentationPlayback.screen === "closed"`（他ダイアログ同型で `closed`） | `!editorShortcutsEnabled` 時のみ `inert`（既存） | `editorShortcutsEnabled` 真なら有効 | 有効 | 現行 `MapEditor.tsx` L1351 |
| **学習中** | `learningActive === true`（**メモリのみ・永続化しない**） | **`inert` を付けない**（設計 §4.2・Phase 31 再生中と同型） | **編集系のみ停止**（積に `!learningActive` を追加。履歴・構造・パレット・取込・ラベル編集・AI 等） | **有効**（設計 §4.2 明示） | 開示・カードパネル・学習終了は到達可 |
| プレゼン中 | `presentationPlayback.screen === "playing"` | **`inert` なし**（Phase 31 済み） | 編集系停止（積に `presentationPlayback.screen === "closed"`） | 有効 | Phase 31 inventory §0 維持 |
| 学習＋プレゼン同時 | — | **到達不可** | — | — | **相互排他**。片方稼働中は他方の開始を **拒否**（設計 §4.1・決めたこと 3） |

`learningActive` と `presentationPlayback.screen` の関係（設計 §6 行「プレゼン中／学習中」と整合）:

| 操作 | 通常 | 学習中 | プレゼン中 |
|------|------|--------|------------|
| 学習開始 | 可 | **終了のみ**（トグル） | **拒否** |
| プレゼン開始 | 可（steps あり） | **拒否** | 拒否（二重開始） |

`editorShortcutsEnabled` 予定積（Task 2・Phase 33 継承）:

```
shortcutsEnabled
&& commandPalette.screen === "closed"
&& …（既存: outlineImport, exchangeImport, tourEditor, presentationPlayback,
     branchMove, branchExtract, labelReplace, nodeSplit, nodeMerge,
     aiAssist, partsDialogMode, relationPartner, crossMap, persistence 等）
&& !learningActive                           // 新規（学習中は偽＝編集キー停止）
```

根の `inert` 予定式（Task 2）:

```
inert={!editorShortcutsEnabled && !playingPresentation && !learningActive}
```

（学習中は `editorShortcutsEnabled === false` でも **inert にしない**。パン・ズーム・折りたたみ・フォーカスを操作可能にする。Phase 31 の `playingPresentation` 例外と同型。）

学習専用ショートカット（`editorShortcutsEnabled` の外または積を経由しない経路・Task 2 で固定）:

| キー | 学習中 | 備考 |
|------|--------|------|
| **Enter** | 開示（主選択 1 件・未開示） | 設計 §4.3 |
| **Space** | カード表裏（パネルフォーカス時） | 設計 §5.2・Undo なし |
| ← / →（パネル） | 前後カード | Undo なし |

---

## 0.1 設計 §6 編集可否（正本・行単位突合）

| 状態 | 学習開始 | 開示・カードめくり | 進捗リセット・カード生成 | 構造編集 |
|------|----------|-------------------|-------------------------|----------|
| 通常 | 可 | — | 不可（学習開始前） | 可 |
| 学習中 | 終了のみ | 可 | 可（**非保護**） | **不可** |
| プレゼン中 | **不可** | — | — | 既存どおり不可 |
| 保護 | **可** | **可** | **不可** | **不可** |

本 inventory の「学習中」列は、上表の **構造編集＝不可** と **開示・めくり＝可** を既存入口（Phase 28–33）へ展開したもの。保護時のリセット・生成不可は §1・§2 の learn 専用行で表す。

---

## 1. 設計 §7 新入口（未実装・Task 2/3）

| # | 入口 | コマンド ID（`commandCatalog` 追加） | visible | disabled / 拒否 | 関与 | 実装ファイル（予定） |
|---|------|--------------------------------------|---------|-------------------|------|----------------------|
| L1 | ツールバー **学習** トグル（開始／終了） | `learn-start` / `learn-end` | **マップ・アウトライン**（Phase 31 ツアー／プレゼンと同ブロック推奨） | **プレゼン再生中**＝開始 **拒否**。**競合**＝無効。保護＝**開始可** | メモリ（`learningActive`） | `LearnModeControl.tsx`／`useMapLearnMode` |
| L2 | パレット「学習を開始／終了」 | 同上（トグルと同じハンドラ） | パレット | L1 と同型 | メモリ | `commandCatalog`・`resolveCommandAvailability` |
| L3 | **進捗をリセット**（確認ダイアログ） | `learn-reset-progress` | 学習中のみ（ツールバーまたは学習バー） | **保護**＝無効。**学習外**＝無効。キャンセル＝無操作 | 文書（`revealedNodeIds` 空・1 Undo） | `useMapLearnActions`／`useNodes` |
| L4 | **復習カードを生成** | `learn-generate-cards` | 学習中のみ | **学習外・保護**＝無効。生成 0 件＝**拒否**（文書不変・L-001） | 文書（`cards` 全置換・1 Undo） | `mapReviewCards.ts`／`useMapLearnActions` |
| L5 | **復習カード** パネルを開く | `learn-open-cards` | 学習中のみ（二次ボタン） | 学習外＝無効。0 件でも開ける（空状態） | 閲覧（パネル `screen` メモリ） | `LearnReviewCardsPanel.tsx` |
| L6 | カード **表裏**・**前後** | （専用コマンド ID なし・パネル内 UI） | `learn-open-cards` 後 | 端で前後＝**拒否** | 閲覧（Undo なし） | `LearnReviewCardsPanel`／`useMapLearnMode` |
| L7 | **ラベル開示**（クリック・Enter） | （専用 ID なし・選択＋学習中） | 学習中 | 未選択・複数選択・既開示・学習外＝**拒否**（no-op） | 文書（1 Undo） | `mapLearnMode.ts`／`useNodes` |
| L8 | 学習バー（終了・リセット・カード導線） | L1/L3/L4/L5 と統合 | 学習中 | §6・L3/L4 と同型 | 混合 | `MapEditor` 学習バー領域 |

パレットへの learn コマンド掲載: **あり**（設計 決めたこと 3・コマンドパレットとツールバーのトグル）。

### 1.1 新入口×条件（代表経路・Task 2/3）

| # | 入口 | アウトライン | 保護 | 競合※ | 関連線選択 | グループ選択 | ラベル編集（マップ） | ラベル編集（アウトライン） | プレゼン中 | 備考・テスト所有者 |
|---|------|--------------|------|--------|------------|--------------|----------------------|---------------------------|------------|-------------------|
| L1–L2 | 学習開始／終了 | **有効** | **開始可** | 無効 | **有効** | **有効** | 無関係 | 無関係 | 開始**拒否** | Task 2: 相互排他 |
| L3 | 進捗リセット | 有効（学習中 UI） | **無効** | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 到達不可 | Task 2: 確認後 1 Undo |
| L4 | カード生成 | 同上 | **無効** | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 到達不可 | Task 3: 0 件拒否 |
| L5–L6 | カードパネル | 同上 | **閲覧可** | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 到達不可 | Task 3: Space・前後 |
| L7 | 開示 | 有効（アウトラインも穴埋め表示） | **有効** | 無効 | **拒否**（非ノード主選択） | **拒否** | 無効（ラベル編集は学習中不可） | 無効 | 到達不可 | Task 2: Enter・notice |
| L8 | 学習バー | マップ中心（アウトラインでも L1 visible） | L1–L4 と整合 | 同上 | 同上 | 同上 | 無関係 | 無関係 | L1 拒否 | Task 2 |

---

## 2. 予定 API（Task 2/3・`useMapLearnMode` / `useMapLearnActions` / `useNodes` 拡張）

| # | 操作 | 保護 | 競合 | 学習中 | プレゼン中 | 根拠 |
|---|------|------|------|--------|------------|------|
| A1 | `learn.start`（`learningActive` 真） | **有効** | 無効 | 拒否（既に学習中） | **拒否** | メモリ（§3.3 Undo 対象外） |
| A2 | `learn.end` | 有効 | 無効 | **有効** | 到達不可 | メモリ |
| A3 | `revealNode` / 開示 | **有効** | 無効 | **有効**（条件付き） | 無効 | 文書・L-001 |
| A4 | `resetLearnProgress` | **無効** | 無効 | **有効** | 無効 | 文書・確認 |
| A5 | `generateReviewCards` → `cards` 置換 | **無効** | 無効 | **有効** | 無効 | 文書・0 件は失敗 |
| A6 | カードめくり・前後 | **有効** | 無効 | **有効** | 無効 | 閲覧 |

`mapLearnGuards.ts`（Task 2）で **操作ごとにガードをコピーせず** 先頭で共通判定（L-061）。`assertNodesEditable`／`presentationPlayback`／`learningActive`／保護を設計 §6・§7.2 と揃える。

---

## 3. 既存 UI 入口×学習中（設計 §5・§4.2 代表・Task 2）

Phase 31 inventory §3（再生中）を **学習中** 列で置換。プレゼン専用 UI は学習中は原則到達不可または相互排他。

| # | 入口 | 現行実装 | 学習中 | 根拠 |
|---|------|----------|--------|------|
| E1 | 閲覧「戻る」「進む」 | `BranchNavigationControls`／`viewNavigation.travel` | **有効** | §4.2 表示ナビ可（再生中は Phase 31 で無効と差分） |
| E1b–E1g | 枝集中・展開・折畳・fit・パンくず | 同上 | **有効** | §4.2 |
| E2 | 表示ブックマーク | `MapViewBookmarkControls` | **無効** | `editorShortcutsEnabled` 積（編集系停止。設計の明示リスト外） |
| E3 | 箇条書き取込 | Phase 30 **R1** | **無効** | 構造変更・取込（Global Constraints） |
| E4 | OPML／CSV 取込 | Phase 30 **N1–N2** | **無効** | 同上 |
| E5 | JSON 読み込み（全文置換） | Phase 30 **X3** | **無効** | 構造変更 |
| E6 | 各種書き出し | Phase 30 書き出し群 | **有効**（download のみ） | 再生中と同型 |
| E7 | アウトライン行ラベル編集・構造操作 | `outlineActions` `enabled: editorShortcutsEnabled` | **無効** | 構造・ラベル編集ロック |
| E8 | マップ・ラベルインライン編集 | `MapStage`／`NodeLabelEditor` | **無効** | §5 構造編集にラベル編集含む |
| E9 | ヘッダー構造操作群 | `MapEditor` operationControls | **無効** | §5 |
| E10 | コマンドパレット | `commandPalette`＋積 | 編集系 **無効**（learn コマンドは **有効**） | L-061 |
| E11 | 右パネル属性編集 | `NodeDetailPanel` | **無効** | 属性・構造 |
| E12 | コンテキストメニュー（構造・関連線・グループ） | Phase 28 | **無効** | §5 |
| E13 | ノード／枝 DnD・ピンドラッグ | Phase 25／29 | **無効** | 構造・座標 |
| E14 | 履歴 Undo／Redo（文書） | `useMapHistoryShortcuts` | **有効** | 開示・リセット・生成は 1 Undo（§3.3） |
| P31-N1 | ツアー編集を開く | Phase 31 **N1** | **無効** | 学習中は編集ダイアログ不要 |
| P31-N3 | プレゼン開始 | Phase 31 **N3** | **拒否** | 相互排他 |
| P31-N4–N7 | 再生バー・再生キー | Phase 31 | **到達不可**（学習中に再生開始不可） | §4.1 |
| AI-N | 右パネル AI 支援（Phase 32–33 **S1–S2, N1–N4**） | `AiAssistSection` | **無効** | 設計 決めたこと 5・AI 適用塞ぐ |
| AI-A | AI 採用適用 | `applyAiStructureProposals` 等 | **無効** | 同上（入口到達前に無効） |

---

## 4. `useNodes` 公開操作×条件（Phase 31 §4 拡張・**学習中**列追加）

状態プロパティは Phase 28 同型のため列挙対象外。列の意味は Phase 31 §4 に加え **学習中**＝`learningActive === true`。※競合は Phase 28 同型。

| # | 操作 | 保護 | 競合※ | 関連線 | グループ | ラベル（マップ） | ラベル（AO） | アウトライン | 学習中 | 根拠 |
|---|------|------|--------|--------|----------|------------------|--------------|--------------|--------|------|
| U1 | `addNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 構造 |
| U2 | `addChildNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 同上 |
| U3 | `addSiblingNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 同上 |
| U4–U13 | 選択系 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | **無関係** | §4.2 選択可 |
| U14 | `addRelation` / `removeRelation` / `updateRelation` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 構造・属性 |
| U15 | `addGroup` / `removeGroup` / `updateGroupLabel` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 同上 |
| U16 | `updateNodeLabel` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | ラベル編集 |
| U17 | `updateNodeLabels` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 一括ラベル |
| U18 | ラベル書式 | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 書式 |
| U19–U21 | icon/kind・illustration | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 属性 |
| U22–U26 | メモ・リンク・タグ等 | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 属性 |
| U27 | `commitManualNodes` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 座標 |
| U28–U29 | ロック・`moveNode` | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 構造 |
| U30–U42 | 接続・複製・貼付・並べ替え・削除・`mergeNodes` 等 | 無効 | 無効 | 無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 構造・統合含む |
| U43–U45 | レイアウト・ピンドラッグ | 無効 | 無効 | 無関係〜無効 | 無効 | 無効 | 無効 | 無関係 | **無効** | 文書級／座標 |
| U46 | `replaceMap` | 無効 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | **無効** | 全文置換 |
| U47 | `undo` / `redo` | 無効 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | **有効** | learn 文書操作の巻き戻し |
| U48 | `beginMoveHistory` | 無効 | 無効 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | **無関係** | 内部 |

（学習専用の開示・リセット・生成は §2 A3–A5。`useNodes` 経由で `applyStateChange` 1 回・L-453。）

---

## 5. コマンドパレット（`COMMAND_CATALOG`）×学習中

### 5.1 新規 learn 行（Task 2）

| # | id | ラベル（案） | 保護 | 競合※ | 学習中 | プレゼン中 | 根拠 |
|---|-----|--------------|------|--------|--------|------------|------|
| N-L1 | `learn-start` | 学習を開始 | **有効** | 無効 | 拒否（トグルで終了は `learn-end`） | **拒否** | §7 |
| N-L2 | `learn-end` | 学習を終了 | 有効 | 無効 | **有効** | 到達不可 | 同上 |
| N-L3 | `learn-reset-progress` | 学習の進捗をリセット… | **無効** | 無効 | **有効**（確認） | 到達不可 | §4.3 |
| N-L4 | `learn-generate-cards` | 復習カードを生成 | **無効** | 無効 | **有効** | 到達不可 | §5 |
| N-L5 | `learn-open-cards` | 復習カードを開く | 有効 | 無効 | **有効** | 到達不可 | §5.2 |

### 5.2 既存項目（Phase 31 §5・C1–C30）×学習中

学習中は `editorShortcutsEnabled === false` のため編集・取込系は原則 **無効**。表示ナビ（C1–C8）と検索フォーカス（C25–C26）は §4.2 に合わせ **有効**（ビュー切替・fit 含む）。Undo／Redo（C9–C10）は **有効**。

| # | id | 学習中 | 根拠 |
|---|-----|--------|------|
| C1–C2 | `view.map` / `view.outline` | **有効** | 表示モード切替可 |
| C3–C8 | fit・focus・expand/collapse | **有効** | §4.2 |
| C9–C10 | undo / redo | **有効** | §3.3 |
| C11–C24 | 構造・ダイアログ編集 | **無効** | 編集ロック |
| C25–C26 | 検索フォーカス | **有効** | 閲覧 UI |
| C27–C30 | アウトライン構造・ラベル編集 | **無効** | E7 |

### 5.3 AI パレット（Phase 33 追加 6 件）×学習中

| id | 学習中 |
|----|--------|
| `edit.open-ai-branch-summary` | **無効** |
| `edit.open-ai-importance` | **無効** |
| `edit.open-ai-child-candidates` | **無効** |
| `edit.open-ai-classify-reorder` | **無効** |
| `edit.open-ai-duplicates` | **無効** |
| `edit.open-ai-missing-perspectives` | **無効** |

右パネルボタンも同じ合成（`resolveAiAssistEntryAvailability` に **学習中** ブロッカー追加・Task 2）。

---

## 6. Phase 25 inventory 抜粋×学習中

| # | 入口（Phase25） | 学習中 | 根拠 |
|---|-----------------|--------|------|
| P1 | ノードドラッグ | **無効** | E13 |
| P2 | ラベルインライン編集 | **無効** | E8 |
| P3 | 削除・Backspace | **無効** | 編集ショートカット停止 |
| P4 | 分割・統合・親挿入 | **無効** | E9・`mergeNodes` |
| P5 | 属性パネル更新 | **無効** | E11 |
| P6 | 兄弟 DnD | **無効** | E13 |
| P7 | クリップボード貼付 | **無効** | U33 |
| P8 | 整列・等間隔 | **無効** | 構造操作 |
| P9–P10 | 書式・見た目 | **無効** | U18–U21 |
| P11 | 枝切り出し | **無効** | 文書分岐 |

---

## 7. 行数サマリ

| 区分 | 行数 |
|------|------|
| §1 新入口（L1–L8） | **8** |
| §1.1 新入口条件マトリクス | **8** |
| §2 予定 API（A1–A6） | **6** |
| §3 既存 UI×学習中（E・P31・AI） | **23** |
| §4 `useNodes`（U1–U48 要約行） | **18**（集約表。フル 48 操作は Phase 31 §4 と同じ操作集合） |
| §5 learn 新規（N-L1–N-L5） | **5** |
| §5.2–5.3 既存パレット | **36**（C1–C30 方針＋AI 6） |
| §6 Phase25 抜粋 | **11** |
| **新入口合計** | **8** |
| **学習ガード合計（概算・E+U+C+P+A+AI）** | **≥120** |

---

## 8. 実装後メモ（Task 4 時点）

1. **`learningActive` / `learn`**: `useMapLearnMode`（メモリ）と `NodeMapState.learn`（永続化）を分離。学習終了で `learningActive` のみ偽にし、開示済み ID とカードは文書に残る。
2. **相互排他**: `presentationPlayback.screen === "playing"` と学習開始・プレゼン開始を相互拒否（`mapLearnGuards`）。
3. **`editorShortcutsEnabled`**: `MapEditor` が `!learningActive` を積み、学習中は構造編集・ラベル・取込・AI を停止（再生中の `inert` 例外は Phase 31 同型）。
4. **カード 0 件**: `generateLearnReviewCards` が `no-cards` で `applyStateChange` を呼ばない（L-001）。
5. **§3.2**: 新規・別名保存・テンプレ・枝切り出し先は `omitLearnFromMapDocument` / `mapDocumentOptionsForNewMap` で `learn` なし。

---

## 9. Task 2/3 統合テスト代表経路（チェックリスト）

**Task 2（学習モード・088）**

- [x] L1–L2 マップ・アウトラインで visible
- [x] プレゼン中は学習開始 **拒否**、学習中はプレゼン開始 **拒否**
- [x] `learningActive` で根 **inert なし**・パン・ズーム可
- [x] `editorShortcutsEnabled` 積に `!learningActive`・構造・ラベル・取込・AI **無効**
- [x] 学習中のみ Pixi／アウトライン穴埋め、学習外は実ラベル（`revealedNodeIds` のみでは穴埋めしない）
- [x] L7 開示 1 Undo・Enter・保護でリセット不可・notice（L-166）
- [x] E3–E5・E7–E13・U1–U42・C11–C30・AI 全件 **無効**
- [x] E1–E1g・C1–C8 **有効**（再生中 inventory との差分）
- [x] U47／C9–C10 **有効**（開示・リセットの Undo）

**Task 3（復習カード・089）**

- [x] L4 決定性・50 上限・501 スキップ
- [x] 0 件生成は文書不変・Undo 増えず・notice（L-001）
- [x] L5–L6 パネル・Space・前後（Undo なし）
- [x] 保護で L4 無効・L5–L6 閲覧可

---

## 10. 型コメント・docs 同期（Task 4 / L-203）

| 箇所 | 状態 |
|------|------|
| `features.md` 学習・復習節 | **済**（Task 4） |
| `data-model.md` `NodeMapState.learn` | **済**（Task 4） |
| `overview.md` Phase 35 節 | **済**（Task 4） |
| `nodeMapState.ts` 型コメント | **済**（Task 1） |
| `browser-test-cases.md` 手動観点 | **済**（Task 4・AN 節） |
| 本 inventory §8–§9 | **済**（Task 4） |
| `api.md` 学習クライアント API | **済**（Task 4・21 章） |
| 仕様からの辿り | 設計 §7.1 → 本ファイル → L-203 同期先 |