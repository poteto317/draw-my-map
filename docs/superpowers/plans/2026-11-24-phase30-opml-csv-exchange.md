# Phase 30（068/069）: OPML・CSV/TSV 交換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/phase30-external-formats`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** OPML 入出力（068）と CSV/TSV 入出力（069）を、既存 ExportScope・アウトライン取り込みと同型の入口で実装する。

**Architecture:** domain に純 codec（OPML／CSV）。書き出しは祖先閉包＋download（`normalizeExportForestParents` 不使用）。取り込みは拡張 `ForestItem` → `insertNodeForest`。UI はヘッダー取り込み／書き出し。

**Tech Stack:** React, TypeScript, Jest, ブラウザ File／Blob download

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-24-phase30-opml-csv-exchange-design.md`
- V3 スキーマ不変。ノード任意属性を増やさない（L-825）。交換列は既存属性のみ
- L-061: 入口は OutlineImport／既存書き出しと同型（保護・競合でも取込可、アウトラインでも取込 visible）。関連線／グループ選択・ラベル編集中は OutlineImport と同則
- 書き出しの表示中／選択は **祖先閉包**（OPML・CSV 共通）。閉包後の parentId は集合内祖先を指す
- TDD。コミットしない。日本語 UI。`cd client && npm run verify`
- 知見: L-061, L-203, L-825（L-1085 N/A）
- ROADMAP は 068/069 のみ完了。067/070/071 は #56/#57/#58 のまま未完了

---

### Task 0: L-061 inventory

**Files:** Create `docs/superpowers/specs/2026-11-24-phase30-opml-csv-exchange-inventory.md`

- 設計 §9 新入口＋ OutlineImport／Export ガードを機械列挙（関連線／グループ選択・ラベル編集中を含む）。
- L-1085 N/A を冒頭に明記。
- テスト所有者: export＝Task3、import＝Task4（Task0 列挙の代表経路を GREEN）。

- [x] inventory 作成

---

### Task 1: ForestItem / insertNodeForest 拡張

**Files:**
- Modify: `client/src/domain/nodes/nodeForestInsertion.ts`（＋既存テスト）
- Modify: outline import 呼び出しは従来どおり label のみ（振る舞い不変）

**Interfaces:**
```ts
type ForestItem = {
  label: string;
  parentIndex: number | null;
  importance?: NodeImportance;
  note?: string;
  tags?: readonly string[];
};
// insertNodeForest: 任意フィールドを新規 Node に載せる。欠落時は DEFAULT importance・属性なし
```

- [x] RED/GREEN: 任意フィールド付き挿入で note/tags/importance が載る
- [x] RED/GREEN: 従来 items（label+parentIndex のみ）は従来どおり

---

### Task 2: OPML / CSV codec（純関数）

**Files:**
- Create: `client/src/domain/exchange/opmlCodec.ts`, `csvTsvCodec.ts`（＋テスト）
- Create: 祖先閉包＋親子保持ヘルパ（`normalizeExportForestParents` は使わない）

**Interfaces:**
```ts
closeExportSubtree(allNodes, targetIds): readonly Node[]; // 祖先閉包。各 parentId は結果集合内（または null）
encodeOpml(closedNodes): string; // text + optional _note attr
decodeOpml(xml: string): { ok: true; items: ForestItem[] } | { ok: false; reason: string };
encodeCsv(closedNodes, delimiter: "," | "\t"): string; // 固定ヘッダ列。tags は ";" 区切り
decodeCsv(text, delimiter): { ok: true; items: ForestItem[]; warnings: string[] } | { ok: false; reason };
// decode はファイル id を ForestItem に載せない（parentIndex のみ）。importance 不明→medium + warning
// tags 列は ";" 区切り（カンマ区切りにしない）。往復でタグ配列が復元される
```

- [x] RED/GREEN: OPML text/_note 往復、未知属性無視
- [x] RED/GREEN: CSV 固定列・importance 不明→medium＋warning・未知列無視・クォート・tags `;` 往復
- [x] RED/GREEN: 祖先閉包後 parentId が集合内。normalizeExportForestParents すると落ちる例を含む
- [x] RED/GREEN: decode 結果にファイル id フィールドが無く parentIndex で親子が付く
---

### Task 3: 書き出し UI・配線

**Files:**
- Modify: ExportScope／形式表、ヘッダー書き出し、download
- `ENABLED_FORMATS`（または同等）: **opml / csv / tsv は all・visible・selection すべて有効**（json の visible 無効をコピーしない）。空選択は既存同則

**Interfaces:**
```ts
// 合成順: resolveExportNodes(scope) → 得た ID 集合で closeExportSubtree → encode* → download
// （選択スコープは既存どおり主選択の部分木を resolve したうえで、その ID の祖先を閉包する）
// OPML/CSV のみこの閉包経路。JSON/MD は既存 exportDocumentNodes（normalizeExportForestParents）を維持し変えない
// 履歴に載せない
```

- [x] RED/GREEN: 全件／表示中／選択が効く。選択＝resolve 部分木＋祖先閉包（子孫欠落なし）。空選択は既存同則
- [x] RED/GREEN: OPML/CSV は閉包経路、JSON/MD は既存 normalize 経路のまま（回帰しない）
- [x] RED/GREEN: 保護中も書き出し可
- [x] RED/GREEN: Task0 代表経路（書き出し入口）
---

### Task 4: 取り込み UI・配線

**Files:**
- Create: 取込ダイアログ（ファイル→プレビュー→確定）、ヘッダー「取り込み」
- hooks: insertForest 経由。追加先＝新ルート／主選択の子。auto なら再配置。1 Undo
- 区切り: 拡張子既定（`.tsv`→タブ、`.csv`→カンマ）＋ダイアログ上書き
- プレビューに OPML lossy 案内（tags 等は落ちる）と CSV warnings

**Interfaces:**
```ts
// 不正／空ファイルはダイアログ拒否、マップ非変更
// 挿入後ノード ID は新規採番（ファイル id を再利用しない）
```

- [x] RED/GREEN: OPML/CSV 取込成功・Undo・auto 再配置・追加先2種
- [x] RED/GREEN: 不正／空でマップ非変更
- [x] RED/GREEN: 区切り既定＋上書き
- [x] RED/GREEN: lossy 案内文言、挿入後 ID ≠ ファイル id
- [x] RED/GREEN: Task0 代表経路（保護・競合可、アウトライン visible、関連線／グループ、ラベル編集中）

---

### Task 5: docs・ROADMAP・verify

**Files:** features / data-model / overview / api、inventory パス、`ROADMAP.md`（068/069 のみ `[x]`、067/070/071 未完了、現在地に #56–58 言及可）、`npm run verify`

- [x] L-203 同期
- [x] verify 成功

## プランレビュー後の記録

- feature-plan 第1周 Blocking: ENABLED_FORMATS・閉包親子・取込契約・区切り・lossy UI・L-061代表・id採番 — 反映。
- feature-plan 第2周 Blocking: resolve→閉包の合成順・OPML/CSV と JSON/MD 経路分離・tags `;` — 反映。
