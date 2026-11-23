# Phase 26 前半: アイコン・任意画像・ノード種別 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/phase26-visual-attachments`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** ノードに絵文字アイコン・種別色バーを付け、既存 illustration へ画像ファイルを添付できるようにする（Phase 26 の 051/052/055。074 は対象外）。

**Architecture:** V3 任意属性 `icon` / `kind`（L-825）。illustration は既存キー＋アップロード UI。Pixi で icon Text と左端色バー。右パネル `NodeAppearanceSection`。locked は `assertNodesEditable`。

**Tech Stack:** React, PixiJS, Jest, TypeScript, localStorage V3

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-23-phase26-visual-attachments-design.md`
- icon: 書記素1・CP1–16・`\p{Extended_Pictographic}` 必須。それ以外キー削除。表示約 16px・ラベル左
- kind: `question|conclusion|evidence|idea`。左端 **4px** 色バー。色は CSS 変数（青/緑/橙/紫）。**glow なし**
- 検索一覧・コマンドパレットは **種別・icon を出さない**（プレーン）
- illustration アップロードは既存サムネイル・**文字列 `.length`** 上限。新属性なし
- 074 ファイル添付は実装しない
- Node id: `number`。TDD。`/feature` 中はコミットしない。日本語 UI
- 知見: L-825, L-203, L-061, L-836, L-133, L-1061
- 検証: `cd client && npm run verify`

---

### Task 0: L-061 インベントリ

**Files:**
- Create: `docs/superpowers/specs/2026-11-23-phase26-appearance-inventory.md`
- Modify: `docs/superpowers/specs/2026-11-23-phase25-lock-inventory.md` — 見た目行追加
- Modify: `client/src/components/map/__tests__/MapEditor.editLock.integration.test.tsx` — icon/kind locked 骨格（RED）。GREEN は **Task 3**（setter 接続後）

- [x] インベントリ同期（主選択≠1・locked・保護モード）
- [x] RED: locked で見た目変更が無操作の骨格

---

### Task 1: 型・永続化・policy（L-825）

**Files:**
- Modify: `client/src/types/node.ts` — `icon?`, `kind?` + 見直しコメント
- Create: `client/src/types/nodeKind.ts` — **型と色トークンのみ** `NodeKind`, `NODE_KIND_BAR_CSS_VARS`
- Create: `client/src/domain/nodes/nodeIcon.ts` — 受理判定・`projectNodeIcon(node)` 正本 + test
- Create: `client/src/domain/nodes/nodeKindUpdate.ts` — normalize ヘルパ名・衝突回避（ファイル名 `nodeKindUpdate.ts`。型は `types/nodeKind.ts`）+ test
- Create: `client/src/domain/nodes/nodeAppearanceUpdate.ts` — `updateNodeIcon` / `updateNodeKind` → `Node[] | null` + `applyProjected*` + test
- Create: `client/src/domain/persistence/mapDocumentNodeIcon.ts` — `normalizeMapDocumentNodeIcon(raw,index,version): MapDocumentResult<…>`。project は domain 呼出のみ
- Create: `client/src/domain/persistence/mapDocumentNodeKind.ts` — 同上
- Modify: `mapDocumentNode.ts`, `mapDocumentNodeProjection.ts`（`...projectNodeIcon(node)`, `...projectNodeKind(node)`）
- Modify: `nodeAttributePolicy.ts` + SAMPLE/DIFFERENT
- Modify: **`nodeMerge.ts`**（survivor-else-first で icon/kind を写す。手書き漏れ防止）
- Modify: `mapConflict.ts`, `mapHistory.ts`, subtreeClipboardCodec 往復

**Interfaces:**
```ts
export type NodeKind = "question" | "conclusion" | "evidence" | "idea";
export function projectNodeIcon(node: Pick<Node, "icon">): { icon?: string };
export function projectNodeKind(node: Pick<Node, "kind">): { kind?: NodeKind };
export function normalizeMapDocumentNodeIcon(...): MapDocumentResult<string | undefined>;
export function normalizeMapDocumentNodeKind(...): MapDocumentResult<NodeKind | undefined>;
export function updateNodeIcon(nodes, id, icon: string | undefined): Node[] | null;
export function updateNodeKind(nodes, id, kind: NodeKind | undefined): Node[] | null;
```

- [x] RED/GREEN: ラテン1書記素・書記素2+・CP17超 → 拒否／decode キー削除
- [x] RED/GREEN: Extended_Pictographic 1 書記素は受理
- [x] RED/GREEN: kind 許可外削除、encode 欠落キー省略
- [x] RED/GREEN: policy SAMPLE/DIFFERENT、**merge で icon/kind が survivor 規則**、clipboard、履歴 equal

---

### Task 2: 描画・アウトライン・書き出し

**Files:**
- Modify: `renderMapNodes.ts` — icon（約16px）+ kind バー 4px（CSS 変数色、glow なし）
- Modify: `OutlineEditor.tsx` — icon・kind バー
- Modify: `mapSvgNodes.ts` — SVG に icon 文字とバー
- Modify: PNG 経路（SVG ラスタなら SVG 側で足りることをテストで固定。足りなければ measurement / export を修正）
- Test: export / render ヘルパ。**検索 UI は変更しない**（プレーンのまま残ることを確認するテストまたは「非変更」チェック）

- [x] RED/GREEN: canvas・outline・**SVG/PNG** に icon/kind
- [x] 検索一覧に kind/icon が増えていない

---

### Task 3: UI（見た目節）と useNodes

**Files:**
- Create: `NodeAppearanceSection.tsx` + test
- Modify: `NodeDetailPanel.tsx` — 節名「見た目」。表示条件: 主選択ちょうど1・マップ・非保護
- Modify: `useNodes.ts` — `setNodeIcon` / `setNodeKind`
- Modify: `MapEditor.editLock.integration.test.tsx` — Task 0 を GREEN
- Modify: inventory 実装パス確定

**Interfaces:**
```tsx
type NodeAppearanceSectionProps = {
  visible: boolean;
  disabled: boolean; // locked 等
  icon: string | undefined;
  kind: NodeKind | undefined;
  onIconChange: (icon: string | undefined) => void; // undefined=クリア
  onKindChange: (kind: NodeKind | undefined) => void;
  iconError?: string | null; // 受理条件外の入力エラー。反映しない
};
// ラベル: なし / 疑問 / 結論 / 根拠 / アイデア
```

- [x] RED/GREEN: 表示条件、locked disabled、クリアでキー削除、不正入力はエラー表示のみ
- [x] RED/GREEN: 各変更 1 Undo、editLock GREEN

---

### Task 4: illustration ファイルアップロード（052）

**Files:**
- Modify: `IllustrationPanel.tsx` — 「画像を添付」+ `accept="image/*"` + 上書き確認（キャンセルで非変更）
- 既存 `attachIllustration` / thumbnail 再利用
- Test: File mock、length 超過拒否（既存上限）、locked 無効

- [x] RED/GREEN: 添付成功、上書き確認キャンセルで不変、length 超過拒否、AI 生成・削除退行なし

---

### Task 5: 仕様・ROADMAP・verify

**Files:**
- Modify: `features.md`, `data-model.md`, `overview.md`, `api.md` ほか `icon`/`kind`/`OptionalNodeKey`/`areNodesEqual` で grep した全列挙
- 型コメントの見直し箇所列挙・inventory パス
- Modify: `ROADMAP.md` — 051/052/055 `[x]`、074 残、Phase 見出し「進行中」、現在地
- `cd client && npm run verify`

- [x] L-203: docs・型コメント・inventory 同期
  - 型コメント見直し: `client/src/types/node.ts`（icon/kind 済）、`nodeAttributePolicy.ts` OptionalNodeKey 列挙、`mapHistory.ts` / `mapConflict.ts` の `areNodesEqual`
  - inventory: `2026-11-23-phase26-appearance-inventory.md`・`2026-11-23-phase25-lock-inventory.md`
  - docs: `features.md` / `data-model.md` / `overview.md` / `api.md` / `ROADMAP.md`
- [x] verify 成功

---

## 実装後のメモ

- コミットは `/commit-ja`。本プラン中はコミットしない。
- カード #31: 前半完了・マージ後は Done とし、solution に「074 は ROADMAP 残・次 feature」と書く。
