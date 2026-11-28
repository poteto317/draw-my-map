# ノードラベル高さ自動フィット — 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. このリポジトリではインライン実行禁止（AGENTS.md）。コミットしない。

**Goal:** 幅固定のままラベル内容に高さをフィットさせ、上限超過は行単位省略で矩形内に収める。

**Architecture:** domain 純関数で計測・省略・fit（確定＝shrink可／hydrate＝grow-only）。更新経路で label+height(+layout) を原子適用。表示文字列は永続せず都度導出。pixi は都度導出結果を描く。

**Tech Stack:** 既存 Node / useNodes / layout / Pixi Text

**設計:** `docs/superpowers/specs/2026-11-28-node-label-auto-height-design.md`

## Global Constraints

- 幅不変。bold/underline は fit しない
- 本文上限 224。イラスト無しノード高上限 240。イラスト有り上限 = 224+16+ILLUSTRATION_AREA_HEIGHT（=296）。下限 RECT_HEIGHT / ILLUSTRATED_NODE_HEIGHT
- 省略は行単位。codePoints 単独切断禁止。**表示文字列は Node に保存しない（都度導出）**
- 計測: **Canvas 2D / 既存 export と同系の measureText 近似を domain 内の純関数で**（Pixi import 禁止）。Pixi との 1 行差はパディングで吸収
- L-001: label+height(+auto layout) は **1 適用で全体成功|全体不変**。`updateNodeLabel` 系は成功を `boolean` で返す（失敗時 false、nodes 不変）
- auto 再配置: **height 変化かつ auto のとき** `applyTreeChange` / `layoutNodeForest` を同じ更新トランザクション内で呼ぶ（`relayoutAfterPinnedMove` 禁止）。失敗ならラベルも戻す
- L-467: 計測は純関数。updater は適用のみ。render 中 setState 禁止（Task0/1 に契約テスト）
- TDD。`npm run verify`。ROADMAP 現在地 + features

## File Map

| 領域 | ファイル |
|------|----------|
| domain | Create `nodeLabelLayout.ts` + tests（measure / ellipsize / `fitNodeHeightToLabel` / `fitNodesHeightToLabels`） |
| label/font | `nodeLabelUpdate.ts`, fontSize → fit `commit` 後返す |
| illustration | `attachIllustration` / `removeIllustration`（既に `applyTreeChange`）→ fit 後、必要なら同じ tree 経路で layout |
| hooks | `useNodes.ts` — label/font は boolean。auto+height変化は `applyTreeChange`/`layoutNodeForest` と原子化 |
| hydrate | 文書読込後 `fitNodesHeightToLabels(..., "growOnly")`（履歴なし） |
| 生成後 fit | `insertForest`、outline/OPML/CSV import、AI 構造適用の完了点 |
| collab | remote 適用後 `growOnly` |
| pixi | `renderMapNodes` — 都度 `ellipsizeWrappedLabel` |
| docs | features.md, ROADMAP |

---

### Task 0: domain

**Interfaces:**
```ts
type FitMode = "commit" | "growOnly";

function measureWrappedLabelBodyHeight(input: {
  text: string;
  fontSize: number;
  contentWidth: number; // node.width - horizontal padding
}): number;

/** 既存 `getNodeDisplayLabel(label)` を使う（新名を増やさない） */
function ellipsizeWrappedLabel(input: {
  text: string;
  fontSize: number;
  contentWidth: number;
  maxContentHeight: number;
}): string;

function fitNodeHeightToLabel(node: Node, mode: FitMode): Node;
function fitNodesHeightToLabels(nodes: readonly Node[], mode: FitMode): Node[];
```

- [x] RED: 短/長/上限+…/commit縮小/growOnlyは縮小しない/イラスト下限と上限296/空は getNodeDisplayLabel/codePoints単独でない/純関数（Pixi非import）契約
- [x] GREEN。コミットしない

---

### Task 1: 更新経路 + 原子性 + 入口網羅

**Interfaces:**
- `updateNodeLabel` / `updateNodeLabels` / `setLabelFontSize`: fit `commit` 後、height 変化かつ auto なら **`applyTreeChange`+`layoutNodeForest`** 成功時のみ commit。戻り **`boolean`**
- `attachIllustration` / `removeIllustration`: 既存 tree 経路のまま fit `commit`（必要なら同経路で layout）
- hydrate / collab remote: `fitNodesHeightToLabels(..., "growOnly")`、編集 Undo に載せない
- forest / outline import / OPML・CSV / AI 構造: 生成後 `commit` fit
- bold/underline: fit 呼ばない RED
- 呼出元: `useNodeEditing` / `useOutlineLabelDraft` は false で draft を確定成功にしない

**RED 必須:**
1. updateNodeLabel 長文増高・短文縮小
2. 一括置換で複数 fit
3. fontSize 変更で fit、bold/underline で height 不変
4. layout 失敗モック → label/height 不変・false
5. 手動時 x,y 不変・下方向のみ
6. 編集 Undo 1 エントリに label+height
7. hydrate growOnly
8. forest または import 1 本 + AI 構造 1 本（OPML/CSV は同ヘルパ経由なら代表1＋ヘルパ単体で可）
9. collab remote 適用後 growOnly の単体または配線契約 1 本
10. L-467: updater が measure をインライン副作用していない
11. `useNodeEditing` / outline draft が false のとき編集状態を成功クリアしない

- [x] RED→GREEN。コミットしない

---

### Task 2: pixi

- 都度 ellipsize。矩形内。永続フィールドを読まない
- [x] RED→GREEN

---

### Task 3: docs + verify

- features / ROADMAP / verify / checkbox
- [x] 

## 完了条件

- [x] Task 0–3、verify、設計受け入れカバー
