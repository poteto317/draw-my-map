# Phase 33（078–081）: AI 発想・整理支援 操作入口インベントリ（L-061）

作成日: 2026-11-25（Task 0）。設計: `docs/superpowers/specs/2026-11-25-phase33-ai-ideation-support-design.md` §3.0・§5・§7。  
関連: `2026-11-25-phase32-ai-assist-review-inventory.md`（`aiAssist.screen`・適用時 `blockers`・`applyAiProposals`）、`2026-11-23-phase28-relations-groups-inventory.md`（`isNodeTargetOperationBlocked`・`useNodes` ガード）、`2026-11-25-phase31-presentation-guide-inventory.md`（`presentationPlayback.screen`・列型）、`COMMAND_CATALOG`（`client/src/domain/commands/commandCatalog.ts`）、`MapEditor.tsx`（`editorShortcutsEnabled`・根 `inert`）、計画 Kind 表（`docs/superpowers/plans/2026-11-25-phase33-ai-ideation-support.md`）

- [x] inventory 作成（列挙完了）

判定語（Phase 28–32 同型）:

| 語 | 意味 |
|----|------|
| **非表示** | 右パネルで節／ボタンが出ない（関連線・グループ選択時など） |
| **無効** | `disabled`・ショートカット無視・パレット `enabled: false` |
| **拒否** | 押下／実行はあるが条件不成立で何もしない（例: 採用 0 件、二重送信） |
| **無関係** | 当該列の条件と交差しない |
| **有効** | 他条件を満たせば到達・実行可能 |
| **確定先行** | マップのラベルインライン編集中は `blur` で確定してから別 UI を開く（Phase 30 同型） |
| **停止** | AI 支援ダイアログ表示中は根 `inert`＋`editorShortcutsEnabled === false` で編集系が止まる |

**テスト所有者**: **入口可否・`applyAiStructureProposals`・stale・`rejected`（`isNodeOpBlocked`）＝Task 2（domain／hook テスト）**、**4 入口・パレット・ダイアログフロー・関連線選択中の節非表示＝Task 4（UI テスト）**。Task 0 は文書のみ。

※競合列: `persistence.conflictState === "conflict"` および `"externallyDeleted"` を含む。

---

## 0. `editorShortcutsEnabled` 積と根 `inert`（Phase 32 継承・Task 4 で 4 入口配線）

### 0.1 機械的な列挙（`client/`・2026-11-25 時点）

- `MapEditor.tsx:911-927` `editorShortcutsEnabled = shortcutsEnabled && …`。積の項は次の **16 件**: `commandPalette`・`outlineImport`・`exchangeImport`・`tourEditor`・`presentationPlayback`・`branchMove`・`branchExtract`・`labelReplace`・`nodeSplit`・`nodeMerge`（いずれも `.screen === "closed"`）、**`aiAssist.screen === "closed"`**、 `partsDialogMode === null`、`relationPartnerFromId === null`、`!crossMapDialogs.crossMapSearchOpen`、`!crossMapDialogs.brokenLinksDialogOpen`、`!persistence.isConfirmOpen`。
- `MapEditor.tsx:928` 以降 `enabled: editorShortcutsEnabled` の利用者（履歴・パレット・outline 構造操作など）。
- `MapEditor.tsx:1291` `inert={!editorShortcutsEnabled && !playingPresentation}`（根の `inert`）。AI 支援ダイアログ表示中は `editorShortcutsEnabled` が偽のため **根は `inert`**（プレゼン再生中の inert 例外は Phase 31 同型）。

AI 支援ダイアログ表示中の代表:

| 入口 | 扱い |
|------|------|
| 他ダイアログ・コマンドパレットを開くショートカット | **停止**（積に `aiAssist.screen === "closed"`） |
| Undo / Redo（ボタン・ショートカット） | **停止**（`canUndo && editorShortcutsEnabled` 等） |
| 枝移動・統合・分割・ラベル一括置換など構造／一括編集 UI | **無効**（各コントロールが `editorShortcutsEnabled` を見る） |
| マップのパン・ズーム | **無関係**（根 inert 下でもキャンバス操作の可否は既存どおり。設計は編集系停止が主眼） |

漏れ確認: Phase 32 inventory §1.3 の「表示中の扱い」に加え、本 Phase の **078–081 入口そのもの**は §1 に列挙。ダイアログ open 中に **別 AI 入口**へ行く経路は inert／停止で到達しない。

### 0.2 `CommandAvailabilityContext` 拡張（Task 4・計画）

Phase 32 の `canOpenAiBranchSummary`・`canOpenAiImportance` に加え、次の **4 件**を足す（いずれも `MapEditor` が `!nodeOpsBlockedByCanvasSelection && *Entry.enabled` で合成）:

| フィールド（仮称） | パレット id |
|-------------------|-------------|
| `canOpenAiChildCandidates` | `edit.open-ai-child-candidates` |
| `canOpenAiClassifyReorder` | `edit.open-ai-classify-reorder` |
| `canOpenAiDuplicates` | `edit.open-ai-duplicates` |
| `canOpenAiMissingPerspectives` | `edit.open-ai-missing-perspectives` |

保護・競合・外部削除は `resolveCommandAvailability` の `MUTATING_IDS` と `resolveGlobalBlockers` で既存理由（Phase 32 同型）。

---

## 1. 新 AI 入口 N1–N4（設計 §6・Kind 表）

入口の `AiAssistKind` と POST・パレット id・提案 kind は計画 Kind 表どおり混同しない。

| # | 候補 | ラベル（案） | `AiAssistKind` | POST | パレット id | 提案 `AiProposal.kind` |
|---|------|--------------|----------------|------|-------------|-------------------------|
| N1 | 078 | 子の候補を提案… | `child-candidates` | `/api/ai-assist/child-candidates` | `edit.open-ai-child-candidates` | `add-child` |
| N2 | 079 | 分類・並べ替えを提案… | `classify-reorder` | `/api/ai-assist/classify-reorder` | `edit.open-ai-classify-reorder` | `reparent` / `reorder-siblings` |
| N3 | 080 | 重複・類似を検出… | `duplicates` | `/api/ai-assist/duplicates` | `edit.open-ai-duplicates` | `merge-pair` |
| N4 | 081 | 不足観点を提案… | `missing-perspectives` | `/api/ai-assist/missing-perspectives` | `edit.open-ai-missing-perspectives` | `add-child` / `add-sibling` |

**visible**: マップ表示・アウトライン表示のいずれでも右パネル「AI支援」にボタンを出す（Phase 32 の要約・重要度と同ブロック。`NodeDetailPanel` → `AiAssistSection` 拡張・Task 4）。  
**共通前提**（`resolveAiAssistEntryAvailability` 拡張・Task 1）: AI 未設定、保護、競合、外部削除、**選択ちょうど 1 件でない**、再生中、**`nodeOpsBlockedByCanvasSelection`（関連線／グループ選択）**、根ノード欠落。  
課題別の追加条件は設計 §3.2（078/081: 根ロック不可・子孫 0 可／079: 枝内ノード 2 以上／080: 枝内非ロック 2 以上）。

### 1.1 新入口×条件（代表経路・設計 §3.0 列）

| # | 入口 | アウトライン表示 | 保護 | 競合※ | 関連線選択 | グループ選択 | ラベル編集（マップ） | ラベル編集（アウトライン） | 再生中 | 備考・テスト所有者 |
|---|------|------------------|------|--------|------------|--------------|----------------------|---------------------------|--------|-------------------|
| N1 | 子の候補（078） | **有効** | 無効 | 無効 | **非表示**（節ごと隠す） | **非表示** | 確定先行 | 行編集は `editorShortcutsEnabled` 停止と無関係（入口はパネル） | 無効 | 課題条件: 根ロック不可。UI＝Task 4、可否＝Task 2 |
| N2 | 分類・並べ替え（079） | **有効** | 無効 | 無効 | **非表示** | **非表示** | 確定先行 | 同上 | 無効 | 枝内ノード&lt;2 で無効。Task 2 / Task 4 |
| N3 | 重複・類似（080） | **有効** | 無効 | 無効 | **非表示** | **非表示** | 確定先行 | 同上 | 無効 | 非ロック&lt;2 で無効。Task 2 / Task 4 |
| N4 | 不足観点（081） | **有効** | 無効 | 無効 | **非表示** | **非表示** | 確定先行 | 同上 | 無効 | N1 同型の課題ガード。Task 2 / Task 4 |

パレット行 P1–P4 は N1–N4 と **同じ id・同じ可否合成**（`CommandAvailabilityContext`＋`resolveCommandAvailability`）。アウトライン表示中も **有効**（Phase 32 importance と同型。`resolveCommandAvailability.test.ts` に追随・Task 4）。

ダイアログ open 後（`aiAssist.screen !== "closed"`）: N1–N4 は **到達不可**（根 `inert`・ショートカット停止）。Task 4 で Phase 32 同型の inert テストを 4 kind に拡張。

---

## 2. 適用（構造提案）と `isNodeOpBlocked` → `rejected`（Task 2）

| # | 入口 | 保護 | 競合※ | 関連線選択 | グループ選択 | ラベル編集 | 再生中 | アウトライン | 挙動 | 根拠 |
|---|------|------|--------|------------|--------------|------------|--------|--------------|------|------|
| A1 | AI ダイアログ「採用して適用」（078–081・構造系） | 確定時再チェックで適用しない※ | 同上 | 確定時 `isNodeOpBlocked` で **`rejected`** | 同上 | 無関係 | 確定時再チェック | 無関係 | `useAiAssistDialog.apply` → `applyAiStructureProposals`（Task 2）。ドメイン成功後 `applyStateChange` が `isNodeOpBlocked()` で **false** → `{ ok: false, reason: "rejected" }`（Phase 32 `applyAiProposals`・`useNodes.ts:679-690` 同型。構造版は `applyStateChange`・`useNodes.ts:479-481`） | 設計 §3.5・§5.1；hook `aiApplyBlockedMessage`（保護／競合／外部削除／再生）は Phase 32 継承 |

※`applyNonStructuralChange` / `applyStateChange` は保護・競合を理由に拒否しないため、**入口と確定の両方**で `blockers` を見る（Phase 32 inventory §1.3・`useAiAssistDialog.ts:219-225`）。

**テスト所有者**: stale・順序適用・`placement-failed`・**`rejected`（関連線選択のまま適用）**＝Task 2（`aiStructureProposal`／`useNodes` テスト）。UI の失敗表示・1 Undo＝Task 4（`MapEditorAiAssist` 系を拡張）。

---

## 3. 既存 AI 入口（Phase 32・本 PR で維持）

| # | 入口 | パレット id | 本 Phase での変更 |
|---|------|-------------|-------------------|
| S1 | 枝要約 | `edit.open-ai-branch-summary` | 挙動維持。`editorShortcutsEnabled` 積は既に `aiAssist.screen` を含む |
| S2 | 重要度提案 | `edit.open-ai-importance` | 同上 |

078–081 と **同じダイアログ状態**を共有する（設計 §5: kind 分岐のみ。screen 積は増やさない）。

---

## 4. AI ダイアログ表示中×既存構造編集（交差・Task 4 代表）

`aiAssist.screen !== "closed"` のとき **editorShortcutsEnabled === false** により、Phase 32 と同型で次が **無効／停止**:

| 代表入口 | 保護 | 競合※ | 関連線 | グループ | ラベル編集 | 再生中 | アウトライン |
|----------|------|--------|--------|----------|------------|--------|--------------|
| 枝移動・切り出し・ラベル一括・分割・統合・部品・関連線相手ピッカー・パレット構造系 | 到達困難（inert） | 到達困難 | 到達困難 | 到達困難 | 到達困難 | 入口自体は再生で無効済み | outline `enabled: editorShortcutsEnabled && viewMode==="outline"` で **停止** |

適用確定（A1）はダイアログ内のため inert の外（ダイアログ UI）で実行。表示中に関連線へ切り替えた場合は A1 の **`rejected`** 経路（Task 2）。

---

## 5. 候補 082–084 — **明示的に未実装（本 PR 対象外）**

設計・計画 Global Constraints: **082–084 の入口・API・UI を足さない**。2026-11-25 時点のコードベース確認:

| 候補 | 想定機能 | `client/` の有無 | `server/` ai-assist ルート | パレット id | `AiAssistKind` |
|------|----------|------------------|---------------------------|-------------|----------------|
| 082 | 文章・議事録からの構造化 | **無し** | **無し** | **無し** | **無し** |
| 083 | イラスト画風統一 | **無し**（既存 `IllustrationPanel` は別機能） | **無し** | **無し** | **無し** |
| 084 | 根拠付き Q&A | **無し** | **無し** | **無し** | **無し** |

`ROADMAP.md` の 082–084 は **未チェックのまま**。Task 4 の検証観点（設計 §8）: **これらの入口が無いこと**を UI テストで確認。

---

## 6. 検証（Task 0）

- 本ファイル作成・計画 Task 0 チェック完了。
- 実装後: Task 5 で `cd client && npm run verify`。Task 4 で 082–084 不在・4 パレット id・inert・関連線選択中の節非表示を RED/GREEN。

## 7. ギャップ・実装メモ（Task 5 時点）

1. **N1–N4・P1–P4・4 POST**: 実装済み（Task 1–4）。入口可否の正本は `resolveAiAssistEntryAvailability` と設計 §3.2。
2. **`applyAiStructureProposals`**: 実装済み（`aiStructureProposal.ts`・`useNodes`）。`rejected` は `applyStateChange` 経由の `isNodeOpBlocked`（関連線選択など）に依存。
3. **`AiAssistKind`**: 6 種（`branch-summary`・`importance`・`child-candidates`・`classify-reorder`・`duplicates`・`missing-perspectives`。`aiAssistEntryAvailability.ts`）。
4. **082–084**: 入口・API なし（ROADMAP 未完了のまま）。