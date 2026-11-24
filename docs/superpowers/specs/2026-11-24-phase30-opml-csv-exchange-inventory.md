# Phase 30（068/069）: OPML・CSV/TSV 交換 操作入口インベントリ（L-061）

設計: `2026-11-24-phase30-opml-csv-exchange-design.md` §9（UI）・§11（実装順）  
関連: `2026-11-24-phase28-relations-groups-inventory.md`（関連線／グループ選択ガード）、`2026-11-23-phase25-lock-inventory.md`（locked 行）、`docs/specifications/features.md` §13（箇条書き取り込み正本）、`client/src/domain/exportScope/exportFormatAvailability.ts`（書き出し形式表）、`client/src/hooks/useOutlineImport.ts` / `client/src/components/layout/OutlineImportControl.tsx`（取り込み正本）

## L-1085（適用外 / N/A）

本 Phase に **合成名は無い**。OPML／CSV は交換フォーマット識別子のみ。UI の lossy 案内や CSV 警告文案は永続データではない。よって知見 **L-1085 は本 Phase では N/A**。

- [x] inventory 作成（列挙完了）

判定語:

| 語 | 意味 |
|----|------|
| **非表示** | `visible=false`（ヘッダー控件が `null`、マップ外で到達不可） |
| **無効** | UI `disabled`・ショートカット無視・操作を実行しない |
| **拒否** | ダイアログ／API が無操作（例: 不正ファイル・`insertForest` 失敗） |
| **無関係** | 当該条件と交差しない（文書追加・download のみ等） |
| **有効** | 条件を満たせば操作可能 |
| **確定先行** | ラベルインライン編集中は、ヘッダーボタン click による `blur` で入力を確定してからダイアログを開く（features §13.1） |

**テスト所有者**: **書き出し＝Task 3**、**取り込み＝Task 4**。いずれも本表の Task 0 代表経路（保護・競合・保護／競合両方可、関連線／グループ選択、ラベル編集中確定先行、アウトライン visible）を RED/GREEN。Task 0 自体は文書のみ。

---

## 1. 設計 §9 新入口（実装済み・Task 3/4）

| # | 入口 | visible | disabled / 拒否 | 関与 | 実装ファイル（確定） |
|---|------|---------|-------------------|------|----------------------|
| N1 | ヘッダー「取り込み」→ **OPML**（`.opml` / `.xml`） | **マップ・アウトライン**（`OutlineImportControl` と同位置・同ブロック） | 保護・競合＝**有効**（箇条書きと同型）。関連線／グループ選択＝ボタン**有効**・確定時は下記 §3.2。ラベル編集＝**確定先行** | 文書（追加・`insertNodeForest`） | `ExchangeImportControl.tsx` / `ExchangeImportDialog.tsx` / `useExchangeImport.ts`／`domain/exchange/opmlCodec.ts`／`useNodes.insertForest` |
| N2 | ヘッダー「取り込み」→ **CSV・TSV** | 同上 | 同上。区切りは拡張子既定＋ダイアログ上書き（設計 §8） | 同上 | 同上 UI／`domain/exchange/csvTsvCodec.ts`・`parseExchangeContent.ts` |
| N3 | ヘッダー書き出し群 → **OPML 書き出し** | **マップ・アウトライン**（既存 `MapPersistenceControls`／`OutlineExportControls` と同列。実装は `viewMode` を問わず描画） | `ExportScope`／`resolveExportFormatControls` 同則（空集合・選択スコープ不可）。保護・競合＝**有効**（download のみ。履歴なし） | 文書（読取・download） | `ExchangeExportControls.tsx` / `useExchangeExport.ts`／`resolveExchangeExportNodes.ts`・`closeExportSubtree.ts`／`opmlCodec.encodeOpml`・`exchangeTextDownload.ts` |
| N4 | ヘッダー書き出し群 → **CSV 書き出し** | 同上 | 同上。**opml/csv/tsv は all・visible・selection すべて形式有効**（json の visible 無効パターンをコピーしない） | 同上 | 同上／`csvTsvCodec.encodeCsv` |
| N5 | ヘッダー書き出し群 → **TSV 書き出し** | 同上 | 同上（ファイル拡張子 `.tsv`） | 同上 | 同上（delimiter `"\t"`） |

コマンドパレット掲載: **非必須**（設計 §9）。

### 1.1 新入口×条件（代表経路・Task 3/4）

| # | 入口 | アウトライン | 保護 | 競合※ | 関連線選択 | グループ選択 | ラベル編集（マップ） | ラベル編集（アウトライン） | 備考 |
|---|------|--------------|------|--------|------------|--------------|----------------------|---------------------------|------|
| N1 | OPML 取込 | 有効 | 有効 | 有効 | 有効（§3.2） | 有効（§3.2） | 確定先行 | 行操作停止（`shortcutsEnabled` 連動。§3.3） | 不正／空＝ダイアログ拒否、マップ非変更 |
| N2 | CSV/TSV 取込 | 有効 | 有効 | 有効 | 有効（§3.2） | 有効（§3.2） | 確定先行 | 同上 | 同上 |
| N3 | OPML 書き出し | 有効 | 有効 | 有効 | 有効※ | 有効※ | 無関係 | 無関係 | ※選択スコープは §4。表示中／選択は `closeExportSubtree`（祖先閉包）（Task 3） |
| N4 | CSV 書き出し | 有効 | 有効 | 有効 | 有効※ | 有効※ | 無関係 | 無関係 | 表示中／選択は `closeExportSubtree`（祖先閉包）（Task 3） |
| N5 | TSV 書き出し | 有効 | 有効 | 有効 | 有効※ | 有効※ | 無関係 | 無関係 | 同上 |

※競合: `conflictState === "conflict"` および `externallyDeleted` を含む。

---

## 2. 正本: 箇条書き取り込み（OutlineImport）

設計 §9 は OPML／CSV の取込を **OutlineImport と同型** とする。現行実装の列挙。

| # | 入口 | visible | disabled / 拒否 | 関与 | 実装ファイル（確定） |
|---|------|---------|-------------------|------|----------------------|
| R1 | ヘッダー「**箇条書きから追加**」 | マップ・アウトライン（`viewMode` 非依存、`operationControls` 内） | **無 disabled**（保護・競合・選択状態によらず押下可）。ダイアログ表示中は根 `inert`（§3.1） | 文書追加 | `OutlineImportControl.tsx` → `useOutlineImport.open` → `OutlineImportDialog.tsx` |
| R2 | ダイアログ「プレビュー」→確定 `submit` | ダイアログ open 中 | 解析失敗＝拒否（入力画面のまま）。挿入失敗＝プレビューに alert。親欠落＝`parent-missing`（開時 revision ずれ・子指定で候補無効） | `insertForest` → `insertNodeForest` | `useOutlineImport.ts`／`nodeForestInsertion.ts` |
| R3 | 確定成功 | — | — | 1 Undo・操作通知・テキストクリア（成功時） | `useOutlineImport.submit`／`useNodes.insertForest` |

### 2.1 OutlineImport×条件（Task 4 が OPML/CSV に複製）

| 条件 | ヘッダーボタン R1 | 確定 R2（ルート追加） | 確定 R2（主選択の子） |
|------|-------------------|------------------------|------------------------|
| アウトライン | 有効 | 有効 | 主選択 1 件なら候補可（`selectedNodeId`） |
| 保護 | 有効 | 有効 | 有効 |
| 競合 | 有効 | 有効 | 有効 |
| 関連線選択 | 有効 | **拒否**（§3.2・`placement-failed`） | 不可（ノード選択クリア済み） |
| グループ選択 | 有効 | **拒否**（§3.2） | 不可 |
| マップ・ラベル編集中 | 確定先行のうえ有効 | 有効 | 有効 |
| 相手ピッカー表示中 | 根 `inert` でヘッダー到達困難 | — | — |

---

## 3. ダイアログ・挿入ガード（新取込＝OutlineImport 同則）

### 3.1 `editorShortcutsEnabled` 積（`MapEditor.tsx`）

`shortcutsEnabled && commandPalette.screen === "closed" && outlineImport.screen === "closed" && exchangeImport.screen === "closed" && branchMove… && !persistence.isConfirmOpen` 等。  
取込ダイアログ open 中: `editorShortcutsEnabled === false` → 根 `[data-map-id]` に **`inert`**、履歴ショートカット停止。ダイアログは根の兄弟（`inert` 外）。

**Task 4 で追加する OPML/CSV ダイアログ**も同積に `exchangeImport.screen === "closed"` を足すこと（N1/N2）。`screen` 型は OutlineImport 同型（`closed` / `input` / `preview`）。仮置き識別子: hook `useExchangeImport`、控件 `ExchangeImportControl`（実装時に確定可）。パレット連鎖中の誤爆防止（L-061）。

### 3.2 関連線／グループ選択中の挿入

- `useNodes.selectRelation` / `selectGroup` は **ノード選択をクリア**（`useNodes.ts` L524–532）。
- `isNodeOpBlocked()` ＝非ノード選択中は真。`insertForest` は `applyTreeChange` 経由のため **ブロック時は `null` → `{ ok: false, reason: "placement-failed" }`**（`useNodes.ts` L418–420, L920–947）。
- ヘッダー取込ボタンは **無効にしない**（設計 §9・features §13）。OPML/CSV も R1 と同じ。

### 3.3 ラベル編集中（マップ）

- ヘッダー控件 click 時: 編集入力の **`blur` により確定**してから `onOpen`（features §13.1、実装はブラウザフォーカス移動）。
- 関連線／グループへ選択変更した場合のみ **明示 `cancelEditing()`**（`MapStage.tsx` L349–357）。取込ボタン経路では確定先行。
- アウトライン行ラベル編集は別 UI（`OutlineEditor`）。R1／N1/N2 は `shortcutsEnabled` 連動で行操作停止（`MapEditorOutline.test.tsx`）。

---

## 4. 正本: 既存書き出し（Export）

新形式 N3–N5 は **同じ `ExportScopeControl`＋形式ボタン群**に載せる。

| # | 入口 | visible | disabled / 拒否 | 関与 | 実装ファイル（確定） |
|---|------|---------|-------------------|------|----------------------|
| X1 | `ExportScopeControl`（全件／表示中／選択） | マップ・アウトライン | 選択スコープは `canUseSelectionScope`（主選択ちょうど 1）。不一致時は effect で `all` にフォールバック | スコープ | `ExportScopeControl.tsx`／`resolveSelectionTargetIds.ts` |
| X2 | JSON 書き出し | 同上 | `resolveExportFormatControls`：`visible` で json **無効**；空集合（all 以外）で **無効** | download | `MapPersistenceControls.tsx` |
| X3 | JSON 読み込み | 同上 | **無 disabled**（保護・競合でも可。全文置換） | 文書置換 | 同上 `onImport` |
| X4 | PNG / SVG | 同上 | `visible` で svg 無効；選択スコープで svg 無効；空集合で無効；PNG 書き出し中は wait | download | `MapImageExportControls.tsx` |
| X5 | Markdown / 箇条書き | 同上 | `visible`・選択で bullets 無効など（`ENABLED_FORMATS`） | download | `OutlineExportControls.tsx` |

### 4.1 書き出し×条件（Task 3 代表）

| 条件 | X2–X5（形式ボタン） | 備考 |
|------|----------------------|------|
| 保護 | **有効** | download のみ |
| 競合 | **有効** | 同上 |
| 関連線／グループ選択 | **有効**（スコープ「選択」は主選択なし→自動 `all`） | `selectedNodeId === null` |
| ラベル編集 | **有効** | 無関係 |
| 履歴 | **無関係** | 設計: 書き出しは Undo に載せない |

**Task 3 差分（設計）**: OPML/CSV/TSV は `normalizeExportForestParents` ではなく **`closeExportSubtree`（祖先閉包）** → encode。JSON/MD は現行 `exportDocumentNodes` 経路を維持。

### 4.2 `ENABLED_FORMATS` 現行（`exportFormatAvailability.ts`）

| scope | png | svg | markdown | json | bullets | opml | csv | tsv |
|-------|-----|-----|----------|------|---------|------|-----|-----|
| all | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| visible | ○ | ○ | ○ | × | × | ○ | ○ | ○ |
| selection | ○ | × | ○ | ○ | × | ○ | ○ | ○ |

`exportFormatAvailability.ts` の `ENABLED_FORMATS` に反映済み（第2周 Blocking）。

---

## 5. 既存操作×取込／書き出し入口（Phase 28 抜粋）

`insertForest`（Phase 28 正本 **U36**）のガードを取込代表に固定。

| # | 操作／API | 関連線選択 | グループ選択 | 根拠 |
|---|-----------|------------|--------------|------|
| G1 | `insertForest`（箇条書き・**予定 OPML/CSV**） | **拒否**（ボタンは可） | **拒否** | `applyTreeChange`＋`isNodeOpBlocked` |
| G2 | JSON `importJsonFile`（全文置換） | 無関係 | 無関係 | 非ノード選択ガード外 |
| G3 | 各種 export ハンドラ | 無関係 | 無関係 | 読取 only |

---

## 6. 行数サマリ

| 区分 | 行数 |
|------|------|
| §9 新入口（N1–N5） | **5** |
| 新入口条件マトリクス（§1.1） | **5** |
| OutlineImport 正本（R1–R3） | **3** |
| OutlineImport 条件（§2.1） | **1** 表（7 条件） |
| 既存書き出し（X1–X5） | **5** |
| 書き出し条件（§4.1） | **1** 表 |
| 抜粋ガード（G1–G3） | **3** |
| **新入口合計** | **5** |
| **正本・ガード合計（R+X+G）** | **11**（R:3 + X:5 + G:3）。§3 はガード記述節（表行なし） |

---

## 7. 実装前ギャップ（解消済み）

1. **N1–N5**: Task 2–4 で UI／codec 実装済み。取込は `ExchangeImportControl`（OPML・CSV/TSV の 2 ボタン）＋`ExchangeImportDialog`。
2. **関連線／グループ中のルート追加失敗**: OutlineImport 同型で **意図的**（ボタン無効化はしない）。
3. **書き出し visible**: マップ・アウトラインで N3–N5 を表示（設計 §9 同期済み）。

---

## 8. 型コメント・docs 同期（Task 5 / L-203）

| 箇所 | 状態 |
|------|------|
| `features.md` §35、exchange API §18 | **済**（Task 5） |
| `data-model.md` `ForestItem` 任意項目 | **済**（Task 5） |
| `overview.md` exchange 節 | **済**（Task 5） |
| `exportFormatAvailability.ts` に opml/csv/tsv | **済**（Task 3） |
| 本 inventory 実装ファイル列 | N/R/X: コード確定 |
| 仕様からの辿り | 設計 §9 → 本ファイル → `features.md` §35 |

---

## 9. Task 3/4 統合テスト代表経路（チェックリスト）

**Task 3（export）**

- [x] 保護モードで OPML/CSV/TSV download 可
- [x] 競合中も書き出し可
- [x] 選択スコープ＋祖先閉包（子孫欠落なし）
- [x] 空選択は既存同則（形式 disabled）
- [x] アウトライン表示で書き出しボタン visible

**Task 4（import）**

- [x] 保護・競合で取込ボタン enabled・ダイアログ開ける
- [x] アウトラインで visible
- [x] ラベル編集中: 確定後にダイアログ
- [x] 関連線／グループ選択: ボタン enabled・ルート確定の挙動は OutlineImport 同型
- [x] 不正ファイルでマップ非変更
- [x] 成功 1 Undo