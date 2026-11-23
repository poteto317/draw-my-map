# ノードラベルの文字サイズ・太字・下線 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/node-label-text-style`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** ノードラベルに離散サイズ（12/14/18/24）・太字・下線を付け、キャンバス／アウトライン／書き出し／インライン編集に反映し、ヘッダーから変更できるようにする（カード #53）。

**Architecture:** V3 任意属性 `labelFontSize` / `labelBold` / `labelUnderline`（L-825）。解決ヘルパで欠落＝標準。Pixi Text の fontSize/fontWeight＋Graphics 下線。UI はヘッダー `LabelTextStyleControl`。locked は `assertNodesEditable`。

**Tech Stack:** React, PixiJS, Jest, TypeScript, localStorage V3

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-23-node-label-text-style-design.md`
- 許可サイズ: `12 | 14 | 18 | 24`。欠落／不正＝14（キー削除）。encode 時 14 はキー省略必須
- `labelBold` / `labelUnderline`: `true` のみ永続化。それ以外はキー削除
- policy: いずれも `split: original-only`, `merge: survivor-else-first`, `parentInsert: none`
- 検索結果・コマンドパレットはプレーン文字列（書式非適用）
- 下線描画: Graphics 水平線のみ（Pixi Text underline に頼らない）
- Node id: `number`。TDD。`/feature` 中はコミットしない。日本語 UI
- 知見: L-825, L-203, L-061, L-836, L-1061
- 検証: `cd client && npm run verify`

---

### Task 0: 書式変更の操作入口インベントリ（L-061）

**Files:**
- Modify: `docs/superpowers/specs/2026-11-23-phase25-lock-inventory.md` — 「ラベル書式変更」行を追加（実装パスは Task 4 後に埋める）
- Create: `docs/superpowers/specs/2026-11-23-label-text-style-inventory.md` — 設計の入口表＋実装ファイル列
- Modify: `client/src/components/map/__tests__/MapEditor.editLock.integration.test.tsx` — ラベル書式の locked 無操作（Undo 不変）ケースを骨格追加（RED）。GREEN は Task 2/4

**Interfaces:**
- 入口: `LabelTextStyleControl` / `useNodes` setters /（任意）コマンドパレット
- 拒否: 主選択≠1・アウトライン・保護モード・対象 locked

- [x] インベントリ md が設計表と同期
- [x] Phase25 lock-inventory に「ラベル書式変更」行がある
- [x] RED: editLock 統合テストに書式変更 locked 拒否の骨格

---

### Task 1: 型・永続化・policy（L-825 / L-836）

**Files:**
- Modify: `client/src/types/node.ts` — `labelFontSize?`, `labelBold?`, `labelUnderline?` とコメント（見直し箇所列挙）
- Create: `client/src/domain/nodes/labelTextStyle.ts` — 定数・型・`resolve*`・`projectLabelTextStyle`（ランタイム正規化の正本）+ test
- Create: `client/src/domain/persistence/mapDocumentNodeLabelTextStyle.ts` — `normalize*` のみ + test（encode 投影は `projectLabelTextStyle` を呼ぶ薄いラッパ可。project ロジックの二重実装は禁止）
- Modify: `mapDocumentNode.ts`（decode 呼出）, `mapDocumentNodeProjection.ts`（`...projectLabelTextStyle(node)`）
- Modify: `nodeAttributePolicy.ts` + `__tests__/nodeAttributePolicy.test.ts`（SAMPLE / DIFFERENT）
- Modify: `mapConflict.ts`, `mapHistory.ts`（areNodesEqual に3キー）
- Modify: `client/src/domain/nodes/__tests__/subtreeClipboardCodec.test.ts`（または既存の属性往復テスト）— 3 キー必須

**Interfaces:**
```ts
export const LABEL_FONT_SIZES = [12, 14, 18, 24] as const;
export type LabelFontSize = (typeof LABEL_FONT_SIZES)[number];
export const DEFAULT_LABEL_FONT_SIZE: LabelFontSize = 14;

export function resolveLabelFontSize(node: Pick<Node, "labelFontSize">): LabelFontSize;
export function resolveLabelBold(node: Pick<Node, "labelBold">): boolean;
export function resolveLabelUnderline(node: Pick<Node, "labelUnderline">): boolean;

/** 正本。14 / 非 bold / 非 underline はキー省略 */
export function projectLabelTextStyle(node: Pick<Node, "labelFontSize" | "labelBold" | "labelUnderline">): {
  labelFontSize?: LabelFontSize;
  labelBold?: true;
  labelUnderline?: true;
};

export function normalizeMapDocumentNodeLabelFontSize(raw, index, version): MapDocumentResult<LabelFontSize | undefined>;
export function normalizeMapDocumentNodeLabelBold(raw, index, version): MapDocumentResult<true | undefined>;
export function normalizeMapDocumentNodeLabelUnderline(raw, index, version): MapDocumentResult<true | undefined>;
```

- [x] RED/GREEN: 許可外・非整数・`true`以外 → キー削除、文書は ok
- [x] RED/GREEN: encode 往復で 14 → キー無し、12/18/24 と bold/underline true が残る
- [x] RED/GREEN: policy SAMPLE/DIFFERENT、履歴・競合 equal
- [x] RED/GREEN: subtreeClipboardCodec（または同等）に 3 キー往復

---

### Task 2: ドメイン更新（locked 拒否）

**Files:**
- Create: `client/src/domain/nodes/nodeLabelTextStyleUpdate.ts` + test
- Modify: `client/src/hooks/useNodes.ts` — `setLabelFontSize` / `toggleLabelBold` / `toggleLabelUnderline`
- Modify: `MapEditor.editLock.integration.test.tsx` — Task 0 骨格を GREEN（locked で Undo スタック不変）

**Interfaces:**
```ts
// NodeChange 相当: null = 無操作（applyNonStructuralChange が commit しない）
export function updateNodeLabelFontSize(nodes, id, size: LabelFontSize): Node[] | null;
export function toggleNodeLabelBold(nodes, id): Node[] | null;
export function toggleNodeLabelUnderline(nodes, id): Node[] | null;
// locked・対象不在・値不変 → null。成功時は projectLabelTextStyle でキー正規化
// useNodes: applyNonStructuralChange で 1 Undo
```

- [x] RED/GREEN: サイズ変更・トグル・14へ戻すとキー削除・locked/`null`
- [x] RED/GREEN: サイズ・太字・下線それぞれ 1 Undo / Redo 往復
- [x] RED/GREEN: editLock 統合テストで書式変更が locked 時無操作

---

### Task 3: 描画・編集オーバーレイ・書き出し・アウトライン

**Files:**
- Modify: `client/src/components/map/pixi/renderMapNodes.ts` — fontSize/fontWeight、underline Graphics
- Modify: `client/src/components/map/nodeLabelEditorLayout.ts` — fontSize/weight/decoration を node から
- Modify: インライン編集を組み立てる呼び出し側（editor の style 適用箇所）
- Modify: `client/src/domain/imageExport/mapExportText.ts` — 固定 14 を resolve に
- Modify: `client/src/services/imageExport/mapTextMeasurement.ts` — ノード別 fontSize（と太字）で計測・折り返し・行高
- Modify: `client/src/domain/imageExport/mapSvgNodes.ts` — font-size / font-weight / text-decoration
- Modify: `client/src/components/outline/OutlineEditor.tsx` — ラベル行に fontSize/weight/underline スタイル
- Test: 各ヘルパ／既存 export・render・OutlineEditor テストを拡張

**Interfaces:**
- `createNodeLabelText(node, …)` が `resolveLabelFontSize` / Bold を使う
- underline: ラベル Text bounds 直下に Graphics 線（線幅 1〜2px、色はラベル色）
- HTML input: `fontSize` / `fontWeight` / `textDecoration: underline|none`
- 計測・SVG・PNG 経路すべてが同一 resolve を使う
- 検索 UI は変更しない

- [x] RED/GREEN: サイズ・太字・下線が layout/export/measurement ヘルパに出る
- [x] RED/GREEN: OutlineEditor 行スタイル（空ラベルフォールバック含む）
- [x] RED/GREEN: 空ラベルフォールバックにも書式適用（キャンバス／書き出し）

---

### Task 4: UI（ヘッダー）と配線

**Files:**
- Create: `client/src/components/layout/LabelTextStyleControl.tsx` + test
- Modify: `MapHeaderLayoutControls.tsx` または `AppHeader` / `MapEditor` — LockControls 近傍に装着
- Modify: Task 0 インベントリの実装パスを確定
- （任意・時間があれば）コマンドパレット登録。スキップ可。スキップ時はインベントリに「未実装」と書く

**Interfaces:**
```tsx
type LabelTextStyleControlProps = {
  visible: boolean; // マップ表示 && 主選択===1 && !outline && !protect
  disabled: boolean; // locked など
  fontSize: LabelFontSize;
  bold: boolean;
  underline: boolean;
  onFontSizeChange: (size: LabelFontSize) => void;
  onToggleBold: () => void;
  onToggleUnderline: () => void;
};
// セレクト: 小/標準/大/特大 → 12/14/18/24。L-214: visible が false になったら開状態を閉じる
```

- [x] RED/GREEN: 非表示条件、locked で disabled、変更が hook を呼ぶ
- [x] インベントリのパスが実在

---

### Task 5: 仕様・ROADMAP・検証

**Files:**
- Modify: `docs/specifications/features.md` — Node スニペット・任意属性一覧に 3 キーと UI
- Modify: `docs/specifications/data-model.md` — 任意属性列挙・V3 表
- Modify: `docs/architecture/overview.md` および `OptionalNodeKey` / 任意属性が列挙されている docs（grep で洗い出し）を同期
- Modify: `ROADMAP.md` — 「現在地」に #53 完了の一行（チェックボックス項目はロードマップ外なので新 Phase は作らない）
- 最終: `cd client && npm run verify`

- [x] L-203: features / data-model / overview 等 / inventory / 型コメントが同期
- [x] `npm run verify` 成功

---

## 実装後のメモ

- コミットは `/commit-ja`（責務分割）。本プラン中はコミットしない。
- マージ後の ROADMAP「最終更新」日付は実装日に合わせる。
