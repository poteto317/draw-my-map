# ノードの分割・統合（候補035）実装プラン

> **状態:** サブエージェントレビュー 2 周通過・自動承認済み。
>
> **For agentic workers:** このリポジトリでは AGENTS.md の規定により、superpowers:subagent-driven-development で実装する（インライン実行は使わない）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヘッダーの「ノードを分割」で、主選択の 1 ノードのラベルを区切り文字で分け（最初の断片は元のノードに残り、残りは元のノードの直後の兄弟になる）、「ノードを統合」で、選択中の同じ親の兄弟を主選択へ 1 つにまとめられるようにする。どちらもダイアログで区切り文字を選び、結果をプレビューで確認してから確定し、確定全体を 1 操作で Undo / Redo できる。

**Architecture:** 重要度の序列の共有（`importanceRank` を `nodeImportance.ts` へ移し、`maxNodeImportance` を足す）と区切り文字の定数（`nodeSeparator.ts`）、分割のドメイン（`nodeSplit.ts` / `nodeSplitMessages.ts`）、統合のドメイン（`nodeMerge.ts` / `nodeMergeMessages.ts`）、`useNodes.splitNode` / `mergeNodes`（`applyTreeChangeWithOutcome`。最新の状態から計画を作り直して `expected` と照合）、分割・統合で共有する部品（`nodeSeparatorDialogState.ts` の状態遷移、`NodeSeparatorField.tsx`、`useHeaderFocusReturn`、一括置換から移す共有の文言と整形 `dialogPreviewText.ts`）、分割の UI（`useNodeSplitDialog` / `NodeSplitDialog` / `NodeSplitControl`）、統合の UI（`useNodeMergeDialog` / `NodeMergeDialog` / `NodeMergeControl`）、`MapEditor` への配線の順に積む。ダイアログの作りは既存の `BranchMove*` / `LabelReplace*`（状態遷移の純関数 `…DialogState.ts`、フック `use…Dialog.ts`、表示 `…Dialog.tsx`、ヘッダーのボタン `…Control.tsx`）に倣う。

**Tech Stack:** Next.js（App Router）、React、TypeScript、Jest（jsdom）、Testing Library。

**設計書:** `docs/superpowers/specs/2026-11-17-node-split-merge-design.md`（以下「設計書」）

## Global Constraints

- 作業ディレクトリ: `/Users/mash/Desktop/draw-my-map/.worktrees/feat-phase17-node-split-merge`。テストと検証は `client` ディレクトリで実行する。
- TDD: 実装コードより先にテストを書き、失敗（RED）を確認してから実装する。
- **コミットしない。** コミットは後続の `/commit-ja` で行う（dev-flow の `/feature` の規則）。`git add` もしない。
- 対象外（YAGNI。実装しない）: 正規表現・改行・複数の区切り文字の同時指定・断片ごとの編集、断片を子として置くなど配置の切り替え、親が違うノード同士・祖先と子孫の統合、統合時のラベルの個別編集、分割・統合へのキーボードショートカット・右クリックメニュー、アウトライン表示での分割・統合、分割・統合で作る・消すノードの選択の復元。保存形式（V3）は変えない。新しい保存項目・新しい通知枠は足さない（成功の通知は既存の `publishTreeEditNotice`）。
- 区切り文字: プリセットは `{ id, label, value }` の順に `ja-comma`（`、`）/ `comma`（`,`）/ `slash`（`/`）/ `middle-dot`（`・`）/ `space`（`半角スペース`、値は半角スペース 1 文字）、続けて `custom`（表示名 `その他`。文字列を入力）。一致は**完全一致の文字列**で、正規化しない（全角・半角を区別する）。分割の既定は `、`、統合の既定は半角スペース。ダイアログを開くたびに既定へ戻す（前回の入力は持ち越さない）。分割は区切り文字が空なら分割できない。統合の区切り文字は空文字でもよい（区切りなしで連結）。
- 分割の規則: 断片は前後の空白を `trim()` で削り、空になった断片は捨てる。断片が 2 件未満なら分割できない。断片の上限は 200 件（`MAX_SPLIT_FRAGMENTS`。201 件以上は不可）。区切りが空文字のときは 1 文字ずつに分けず、ラベル全体を trim した 1 件（trim して空なら 0 件）。最初の断片は元のノードに残り（ラベルだけ更新。子・座標・大きさ・重要度・イラストはそのまま）、2 件目以降は元のノードの直後の兄弟として断片の順に配列へ差し込む。新しいノードは `createSiblingNode` と同じ規則で座標を決め（x は元のノードと同じ、y は直前までに作った断片を含む同じ親の兄弟の最も下の下端 + `SIBLING_VERTICAL_GAP`）、重要度は元のノードと同じ、大きさは既定、イラストを持たない。配置モードは引数に取らない（自動配置の再レイアウトは `applyTreeChange` に任せる）。ほかのノードは同じオブジェクトのまま、相対順も変えない。
- 分割の検査の順（`planNodeSplit`）: 対象なし `node-missing` → 非表示 `node-hidden` → 座標が有限でない・幅高が 0 以下のノードがある `placement-failed` → 森として不正 `invalid-structure` → 区切り文字が空 `separator-empty` → 断片が 2 件未満 `not-splittable` → 201 件以上 `too-many-fragments`。`splitNode`（ドメイン）は計画が通ったあと、`newNodeIds` の件数が断片数 − 1 と違う・既存の ID と重なる・自分の中で重なる・有限でないときに `id-conflict`。
- 統合の規則: 並びは配列順（`ids` の順序に依存しない）。ラベルは配列順に集め、空文字を除いて区切り文字で連結する（前後の空白は削らない）。重要度は選択中で最も高いもの（序列は `nodeImportance.ts` の `importanceRank` に 1 つだけ持つ）。イラストは主選択のものを残し（`primary`。高さも主選択のまま）、無ければ吸収されるノードのうち配列順で最初のものを引き継ぎ（`absorbed`。残すノードの高さを `ILLUSTRATED_NODE_HEIGHT` にする）、持つものが無ければ `none`（`illustration` のキーを持たない）。位置・大きさ・`id`・`parentId` は主選択のまま。吸収されるノードの直下の子（折りたたみ・解像度で隠れた子を含む）は、残すノードの直下の子のうち配列順で最後のものの直後（子が無ければ残すノードの直後）に、吸収されるノードの配列順・各ノード内の元の相対順で差し込む。子孫は動かさず、子の座標も変えない。自動配置（`mode === "auto"`）で、統合前の先頭のルート（配列順で最初の `parentId === null`）が吸収され、統合後の先頭のルートが別のノードになるときだけ、新しい先頭のルートへ旧先頭の座標（x, y）を写す。ほかのノードは同じオブジェクトのまま、相対順も変えない。
- 統合の検査の順（`planNodeMerge`）: 重複を除いた `ids` が 2 件未満 `too-few-nodes` → 配列に無い ID がある `node-missing` → 表示されていない ID がある `node-hidden` → `primaryId` が `null` または `ids` に含まれない `primary-missing` → 座標が有限でない・幅高が 0 以下のノードがある `placement-failed` → 森として不正 `invalid-structure` → 親が揃わない `different-parents`（祖先と子孫の選択もここで拒否される）。
- `useNodes`: `applyTreeChangeWithOutcome` で**最新の状態から**計画を作り直し、`expected`（確認の時点の計画）と `isSameNodeSplitPlan` / `isSameNodeMergePlan` で比べて、違えば何も変えず `plan-changed`。再計画の失敗はその `reason` を返す。1 回の確定を 1 回の `applyTreeChange` にする（L-453）。失敗は何も変えず履歴も積まない。分割の採番は計画が通ったあとに `nextAvailableIds` で 1 回（断片数 − 1 個。計画の失敗では採番が進まない。自動配置の失敗では欠番が出てよい）。分割は選択を変えず、統合は成功したら `selectOnly(survivorId)`。構造編集なので `documentRevision` は上げない。可視集合は `useNodes` が持たず、引数で受け取る。
- 画面の文言（そのまま使う。設計書の文言どおりで、「N 件」「N件」の空白の有無も設計書に合わせる。`N`・`M`・`K` は件数）:
  - ヘッダーのボタン `ノードを分割` / `ノードを統合`。並びは一括置換の右に「ノードを分割」「ノードを統合」の順、その右に既存の「上へ」「下へ」。無効の理由（`title` と `aria-describedby` の説明）: 分割は `分割できるノードが選択されていません。`、統合は `2 つ以上のノードを選択してください。`
  - ダイアログの見出し `ノードを分割` / `ノードを統合`。区切り文字のプルダウンのラベル `区切り文字`、選択肢 `、` `,` `/` `・` `半角スペース` `その他`、「その他」の入力欄のラベル `その他の区切り文字`。確定 `分割する` / `統合する`、`キャンセル`。
  - 分割: 対象の表示 `分割するノード: <ラベル>`、断片の一覧（番号付き。`aria-label="分割後の断片"`）の注記は 1 件目 `元のノードに残る`、2 件目以降 `新しい兄弟として追加`、状態文言 `N件に分割します（M件を追加）`、成功通知 `ノードを N 件に分割しました。`（N = 追加した件数 + 1）。
  - 統合: 状態文言 `N件を1件に統合します`、プレビューの項目 `統合後のラベル` / `重要度`（`高` `中` `低`）/ `イラスト`（`主選択のイラストを残す` / `『○○』のイラストを引き継ぐ` / `イラストなし`）/ `付け替える子`（`N件`）、警告 `N件のイラストは統合で失われます`（1 件以上のときだけ）、一覧 `統合されて消えるノード`（最大 200 行。超過は `ほかに K 件`。確定の対象には含める）、成功通知 `N 件のノードを 1 件に統合しました。`（N = 吸収した件数 + 1）。
  - 失敗の文言（`kind: "error"`）: 対象なし・非表示・不正 → 分割 `分割できるノードが選択されていません。` / 統合 `統合できるノードが見つかりません。`、`区切り文字を入力してください。`、`区切り文字で 2 つ以上に分けられません。`、`分割できるのは 200 件までです。`、`2 つ以上のノードを選択してください。`、`主選択のノードがありません。`、`同じ親の兄弟のノードだけを統合できます。`、`分割の内容が変わりました。もう一度確認してください。` / `統合の内容が変わりました。もう一度確認してください。`（`plan-changed`）、配置不能・新しい ID が使えない → `ノードを分割できませんでした。` / `ノードを統合できませんでした。`。
  - stale `マップが更新されました。閉じてから開き直してください。`（一括置換と同じ文言を共有）。プレビューの空文字は `（空）`、空白だけは `（空白のみ）`。
  - 設計書に文言の指定が無く、このプランで決めたもの: ダイアログの説明文、確定ボタンの `分割する` / `統合する`、`分割するノード:`、統合のプレビューの項目名（`統合後のラベル` `重要度` `イラスト` `付け替える子`）、「その他」の入力欄のラベル `その他の区切り文字`。
- ダイアログは `BranchMove` / `LabelReplace` と同じ作り: `role="dialog"`・`aria-modal`・`aria-labelledby` / `aria-describedby`・`useDialogFocusTrap`・`handleDialogClickCapture`（`onMouseClick` で `dialogMouseClickedAtRef.current = Date.now()`）・`useReannouncedNotice`。ダイアログをルートの外に描画する。開くと区切り文字のプルダウンへフォーカスし、閉じるとヘッダーのボタン（無効なら「JSON書き出し」）へ戻す（`useHeaderFocusReturn`）。外から閉じられた（`mapId` の変化）ときはフォーカスを奪わない（L-762）。`Escape` で閉じ（IME 変換中は処理しない）、「その他」の入力欄の `Enter` は IME 変換中でなく・リピートでなく・確定できるときだけ確定する。プルダウンの `Enter` では確定しない。ヘッダーの 2 つのボタンと確定・キャンセルのボタンに `preventRepeatedActivationClick` を付ける。状態文言は `aria-live="polite"` の領域に常に描画し、エラーは `role="alert"` の領域に常に描画する。区切り文字の入力欄には可視のラベルを付ける（L-554）。
- プレビューの表示: 断片・連結後のラベル・消えるノードのラベルは `whitespace-pre-wrap break-words [overflow-wrap:anywhere]` で描き、前後の空白を畳まない。一覧は `max-h-60 shrink-0 overflow-y-auto`、ダイアログ全体は `max-h-full overflow-y-auto`（L-821、L-409）。プレビューは `useDeferredValue` で遅らせない（入力直後の古いプレビューを確定できる隙間と `pending` の管理が要らなくなる）。プレビューは最新の `nodes` から `useMemo` で求め、開いた時点の対象（分割は主選択、統合は選択集合と主選択）は固定する。`documentRevision` が開いた時点と違えば stale で、確定できない。確定は `submit` の先頭で最後に commit された値から `canSubmit` を再判定し、確定を押した同じ処理での 2 回目は呼ばない（`submittedRef`。L-653、L-101）。確定が失敗したらダイアログを閉じず、`reason` の文言を `role="alert"` に出す。
- ボタンは**マップ表示（`viewMode === "map"`）でだけ**出す（一括置換と同じ）。「ノードを分割」は `canSplitNode`（主選択が存在し可視）が偽のとき無効、「ノードを統合」は選択が 2 件未満のとき無効（親が違うなどの理由は、開いたあとのプレビューで示す）。ダイアログが開いている間は `editorShortcutsEnabled` を `false` にする（積に `nodeSplit.screen === "closed"` と `nodeMerge.screen === "closed"` を足す。ルートの `inert`・履歴ショートカット・ビュー切替・`outlineActions` の有効条件はすべてこの値から決まる。保存確認（`persistence.isConfirmOpen`）が出ている間は、積の `!persistence.isConfirmOpen` でルートが `inert` になりボタンを押せないので、同時には開かない。新しいコードは足さない。L-061）。
- 一括置換から共有へ移すもの（挙動と文言は変えない。既存のテストは import を直し、移した `formatLabelReplacePreviewLabel` のテストを `dialogPreviewText.test.ts` へ移すだけで、期待値は変えない）: `STALE_LABEL_REPLACE_MESSAGE` → `STALE_DIALOG_MESSAGE`、`formatLabelReplacePreviewLabel` → `formatPreviewLabel`（どちらも `@/hooks/dialogPreviewText`）。`MapEditor` にある枝の移動・一括置換の `useLayoutEffect` による同形のフォーカス戻しは書き換えない（新しい 2 つのダイアログだけが `useHeaderFocusReturn` を使う）。
- テストの fixture: 分割できるラベルとできないラベル、子を持つノード・隠れた子・ルート・イラスト付き・重要度が混在する兄弟を混ぜ、ラベルを全ノード同じ値にしない（L-168、L-170、L-616）。設計書 §7 の項目をテスト名に対応させる。
- 気をつける知見: L-001 / L-002（成否と失敗理由を返す・空を成功にしない）、L-453（1 回の更新）、L-036 / L-063（プレビューと確定を食い違わせない・最新から作り直す）、L-457 / L-472 / L-460（フラット配列の差し込み位置・隠れたノードを含む全体の配列を基準にする）、L-062、L-432（採番は検査のあとに 1 回）、L-821 / L-409、L-061、L-408 / L-653 / L-101 / L-474（リピート・ダブルクリック・IME・二重実行）、L-057 / L-058 / L-554、L-762、L-818、L-591、L-048。
- 返答・コメント・ドキュメントは日本語。

---

### Task 1: 重要度の序列の共有と区切り文字の定数

**Files:**
- Modify: `client/src/domain/nodes/nodeImportance.ts`（`importanceRank` を export、`maxNodeImportance` を追加）
- Modify: `client/src/domain/nodes/nodeResolution.ts`（ローカルの `importanceRank` を消し、`nodeImportance.ts` から import）
- Create: `client/src/domain/nodes/nodeSeparator.ts`
- Test: `client/src/domain/nodes/__tests__/nodeImportance.test.ts`（新規）
- Test: `client/src/domain/nodes/__tests__/nodeSeparator.test.ts`（新規）
- Regression: `client/src/domain/nodes/__tests__/nodeResolution.test.ts`（変更しない。挙動が変わらないことを確かめる）

**Interfaces:**
- Produces（`@/domain/nodes/nodeImportance`）:
  - `importanceRank: Record<NodeImportance, number>`（`high` 2、`medium` 1、`low` 0）
  - `maxNodeImportance(values: readonly NodeImportance[]): NodeImportance`（最も高いもの。空なら `DEFAULT_NODE_IMPORTANCE`）
- Produces（`@/domain/nodes/nodeSeparator`）:
  - `type NodeSeparatorPreset = { id: string; label: string; value: string }`
  - `NODE_SEPARATOR_PRESETS: readonly NodeSeparatorPreset[]`
  - `NODE_SEPARATOR_CUSTOM_ID = "custom"`、`NODE_SEPARATOR_CUSTOM_LABEL = "その他"`
  - `SPLIT_DEFAULT_SEPARATOR = "、"`、`MERGE_DEFAULT_SEPARATOR = " "`
  - `findSeparatorPresetId(separator: string): string`（完全一致するプリセットの id、無ければ `"custom"`）
  - `resolveSeparator(presetId: string, customSeparator: string): string`（`custom` は入力欄の文字列、プリセットはその値、知らない id は空文字）

- [ ] **Step 1: 失敗するテストを書く**

`client/src/domain/nodes/__tests__/nodeImportance.test.ts`:

```typescript
import {
  DEFAULT_NODE_IMPORTANCE,
  importanceRank,
  maxNodeImportance,
} from "@/domain/nodes/nodeImportance";
import type { NodeImportance } from "@/types/nodeImportance";

describe("importanceRank", () => {
  it("重要度の序列を high 2・medium 1・low 0 に固定する（解像度フィルターと統合が同じ表を使う）", () => {
    expect(importanceRank).toEqual({ high: 2, medium: 1, low: 0 });
  });
});

describe("maxNodeImportance", () => {
  it.each<[NodeImportance[], NodeImportance]>([
    [["low", "medium", "high"], "high"],
    [["high", "medium"], "high"],
    [["medium", "low"], "medium"],
    [["low", "low"], "low"],
    [["low"], "low"],
  ])("%j のうち最も高い重要度は %s", (values, expected) => {
    expect(maxNodeImportance(values)).toBe(expected);
  });

  it("空の配列は既定の重要度を返す", () => {
    expect(maxNodeImportance([])).toBe(DEFAULT_NODE_IMPORTANCE);
  });
});
```

`client/src/domain/nodes/__tests__/nodeSeparator.test.ts`:

```typescript
import {
  MERGE_DEFAULT_SEPARATOR,
  NODE_SEPARATOR_CUSTOM_ID,
  NODE_SEPARATOR_PRESETS,
  SPLIT_DEFAULT_SEPARATOR,
  findSeparatorPresetId,
  resolveSeparator,
} from "@/domain/nodes/nodeSeparator";

describe("NODE_SEPARATOR_PRESETS", () => {
  it("、 / , / / / ・ / 半角スペースの順に並ぶ", () => {
    expect(NODE_SEPARATOR_PRESETS).toEqual([
      { id: "ja-comma", label: "、", value: "、" },
      { id: "comma", label: ",", value: "," },
      { id: "slash", label: "/", value: "/" },
      { id: "middle-dot", label: "・", value: "・" },
      { id: "space", label: "半角スペース", value: " " },
    ]);
  });

  it("id は重ならず、「その他」の id とも重ならない", () => {
    const ids = NODE_SEPARATOR_PRESETS.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(NODE_SEPARATOR_CUSTOM_ID);
  });

  it("分割の既定は「、」、統合の既定は半角スペースで、どちらもプリセットにある", () => {
    expect(SPLIT_DEFAULT_SEPARATOR).toBe("、");
    expect(MERGE_DEFAULT_SEPARATOR).toBe(" ");
    expect(NODE_SEPARATOR_PRESETS.map((preset) => preset.value)).toEqual(
      expect.arrayContaining([SPLIT_DEFAULT_SEPARATOR, MERGE_DEFAULT_SEPARATOR]),
    );
  });
});

describe("findSeparatorPresetId", () => {
  it.each([
    ["、", "ja-comma"],
    [",", "comma"],
    ["/", "slash"],
    ["・", "middle-dot"],
    [" ", "space"],
  ])("%j はプリセット %s", (separator, id) => {
    expect(findSeparatorPresetId(separator)).toBe(id);
  });

  it.each([
    ["空文字", ""],
    ["複数文字", "、、"],
    ["全角の読点とは別の全角コンマ", "，"],
    ["全角スペース", "　"],
  ])("%s はプリセットに一致せず「その他」（正規化しない）", (_name, separator) => {
    expect(findSeparatorPresetId(separator)).toBe(NODE_SEPARATOR_CUSTOM_ID);
  });
});

describe("resolveSeparator", () => {
  it("プリセットの id はその値を返し、入力欄の文字列は使わない", () => {
    expect(resolveSeparator("space", "ignored")).toBe(" ");
    expect(resolveSeparator("slash", "")).toBe("/");
  });

  it("「その他」は入力欄の文字列をそのまま返す（空のままなら空文字）", () => {
    expect(resolveSeparator(NODE_SEPARATOR_CUSTOM_ID, " -> ")).toBe(" -> ");
    expect(resolveSeparator(NODE_SEPARATOR_CUSTOM_ID, "")).toBe("");
  });

  it("知らない id は空文字を返す", () => {
    expect(resolveSeparator("unknown", "x")).toBe("");
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeImportance.test.ts src/domain/nodes/__tests__/nodeSeparator.test.ts`
Expected: FAIL（`importanceRank` / `maxNodeImportance` が無い、モジュール `@/domain/nodes/nodeSeparator` が無い）

- [ ] **Step 3: 実装する**

`client/src/domain/nodes/nodeImportance.ts`（全体を置き換える）:

```typescript
import type { NodeImportance } from "@/types/nodeImportance";

export const DEFAULT_NODE_IMPORTANCE: NodeImportance = "medium";

// 重要度の序列（大きいほど重要）。解像度フィルターの表示判定と、統合で選ぶ「最も高い重要度」が同じ表を使う
export const importanceRank: Record<NodeImportance, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

// 最も高い重要度を返す。空のときは既定の重要度（呼び出し側は 1 件以上を渡す）
export function maxNodeImportance(values: readonly NodeImportance[]): NodeImportance {
  let highest: NodeImportance | null = null;
  for (const value of values) {
    if (highest === null || importanceRank[value] > importanceRank[highest]) highest = value;
  }
  return highest ?? DEFAULT_NODE_IMPORTANCE;
}
```

`client/src/domain/nodes/nodeResolution.ts`（ローカルの表を消し、共有の表を使う。ほかは変えない）:

```diff
--- a/client/src/domain/nodes/nodeResolution.ts
+++ b/client/src/domain/nodes/nodeResolution.ts
@@ -1,11 +1,6 @@
+import { importanceRank } from "@/domain/nodes/nodeImportance";
 import type { NodeImportance } from "@/types/nodeImportance";
 import type { ResolutionLevel } from "@/types/nodeResolution";
-
-const importanceRank: Record<NodeImportance, number> = {
-  high: 2,
-  medium: 1,
-  low: 0,
-};
 
 const minimumVisibleRank: Record<ResolutionLevel, number> = {
   high: 2,
```

`client/src/domain/nodes/nodeSeparator.ts`:

```typescript
export type NodeSeparatorPreset = { id: string; label: string; value: string };

// 分割・統合のダイアログが共有する区切り文字の選択肢（プルダウンの並び順）。一致は完全一致の文字列で、正規化しない
export const NODE_SEPARATOR_PRESETS: readonly NodeSeparatorPreset[] = [
  { id: "ja-comma", label: "、", value: "、" },
  { id: "comma", label: ",", value: "," },
  { id: "slash", label: "/", value: "/" },
  { id: "middle-dot", label: "・", value: "・" },
  { id: "space", label: "半角スペース", value: " " },
];

// 「その他」（文字列を入力する）を表すプリセットの id と表示名
export const NODE_SEPARATOR_CUSTOM_ID = "custom";
export const NODE_SEPARATOR_CUSTOM_LABEL = "その他";

export const SPLIT_DEFAULT_SEPARATOR = "、";
export const MERGE_DEFAULT_SEPARATOR = " ";

// 区切り文字に完全一致するプリセットの id。無ければ「その他」
export function findSeparatorPresetId(separator: string): string {
  return NODE_SEPARATOR_PRESETS.find((preset) => preset.value === separator)?.id ?? NODE_SEPARATOR_CUSTOM_ID;
}

// 選ばれたプリセットと入力欄から区切り文字を決める。知らない id は空文字（分割では「区切り文字が空」で失敗する）
export function resolveSeparator(presetId: string, customSeparator: string): string {
  if (presetId === NODE_SEPARATOR_CUSTOM_ID) return customSeparator;
  return NODE_SEPARATOR_PRESETS.find((preset) => preset.id === presetId)?.value ?? "";
}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeImportance.test.ts src/domain/nodes/__tests__/nodeSeparator.test.ts src/domain/nodes/__tests__/nodeResolution.test.ts && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし。`nodeResolution.test.ts` が 1 件でも落ちたら、期待値ではなく `nodeResolution.ts` の import の差し替えを見直す（序列の値は変えない）。

---

### Task 2: 分割のドメイン

**Files:**
- Create: `client/src/domain/nodes/nodeGeometryValidation.ts`（分割・統合が共有する座標・大きさの検査）
- Create: `client/src/domain/nodes/nodeSplit.ts`
- Create: `client/src/domain/nodes/nodeSplitMessages.ts`
- Test: `client/src/domain/nodes/__tests__/nodeGeometryValidation.test.ts`（新規）
- Test: `client/src/domain/nodes/__tests__/nodeSplit.test.ts`（新規）
- Test: `client/src/domain/nodes/__tests__/nodeSplitMessages.test.ts`（新規）

**Interfaces:**
- Consumes: `createSiblingNode`（`@/domain/nodes/nodePlacement`）、`indexNodeForest`（`@/domain/nodes/nodeLayoutForest`）
- Produces（`@/domain/nodes/nodeGeometryValidation`）: `hasInvalidNodeGeometry(nodes: readonly Node[]): boolean`（座標が有限でない・幅高が 0 以下のノードが 1 件でもあれば真）
- Produces（`@/domain/nodes/nodeSplit`）:
  - `MAX_SPLIT_FRAGMENTS = 200`
  - `type NodeSplitFailureReason = "node-missing" | "node-hidden" | "invalid-structure" | "separator-empty" | "not-splittable" | "too-many-fragments" | "id-conflict" | "placement-failed" | "plan-changed"`
  - `type NodeSplitPlan = { ok: true; nodeId: number; fragments: string[] } | { ok: false; reason: NodeSplitFailureReason }`
  - `type NodeSplitResult = { ok: true; nodes: Node[]; insertedIds: number[] } | { ok: false; reason: NodeSplitFailureReason }`
  - `type SplitNodeResult = { ok: true; insertedIds: number[] } | { ok: false; reason: NodeSplitFailureReason }`（`useNodes.splitNode` の戻り値）
  - `splitLabelFragments(label: string, separator: string): string[]`
  - `canSplitNode(nodes: readonly Node[], nodeId: number | null, visibleNodeIds: ReadonlySet<number>): boolean`
  - `planNodeSplit(nodes: readonly Node[], nodeId: number, separator: string, visibleNodeIds: ReadonlySet<number>): NodeSplitPlan`
  - `isSameNodeSplitPlan(a: NodeSplitPlan, b: NodeSplitPlan): boolean`（両方成功で、対象と断片の配列が同じときだけ真）
  - `splitNode(nodes: readonly Node[], nodeId: number, separator: string, newNodeIds: readonly number[], visibleNodeIds: ReadonlySet<number>): NodeSplitResult`
- Produces（`@/domain/nodes/nodeSplitMessages`）: `formatNodeSplitFailureNotice(reason: NodeSplitFailureReason): OperationNotice`

- [ ] **Step 1: 失敗するテストを書く**

`client/src/domain/nodes/__tests__/nodeGeometryValidation.test.ts`:

```typescript
import { hasInvalidNodeGeometry } from "@/domain/nodes/nodeGeometryValidation";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

describe("hasInvalidNodeGeometry", () => {
  it("座標が有限で幅高が正のノードだけなら偽（空の配列も偽）", () => {
    expect(hasInvalidNodeGeometry([createTestNode({ id: 1 }), createTestNode({ id: 2, x: -50, y: 1e6 })])).toBe(false);
    expect(hasInvalidNodeGeometry([])).toBe(false);
  });

  it.each<[string, Partial<Node>]>([
    ["x が NaN", { x: Number.NaN }],
    ["y が Infinity", { y: Number.POSITIVE_INFINITY }],
    ["width が -Infinity", { width: Number.NEGATIVE_INFINITY }],
    ["height が NaN", { height: Number.NaN }],
    ["width が 0", { width: 0 }],
    ["height が負", { height: -1 }],
  ])("1 件でも %s なら真", (_name, overrides) => {
    expect(hasInvalidNodeGeometry([createTestNode({ id: 1 }), createTestNode({ id: 2, ...overrides })])).toBe(true);
  });
});
```

`client/src/domain/nodes/__tests__/nodeSplit.test.ts`:

```typescript
import {
  MAX_SPLIT_FRAGMENTS,
  canSplitNode,
  isSameNodeSplitPlan,
  planNodeSplit,
  splitLabelFragments,
  splitNode,
  type NodeSplitPlan,
} from "@/domain/nodes/nodeSplit";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, label: string, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label, x: id * 10, y: id * 20, ...overrides });
}

function visibleOf(nodes: readonly Node[]): Set<number> {
  return new Set(nodes.map((item) => item.id));
}

describe("splitLabelFragments", () => {
  it("区切り文字でラベルを分ける", () => {
    expect(splitLabelFragments("りんご、みかん、ぶどう", "、")).toEqual(["りんご", "みかん", "ぶどう"]);
  });

  it("断片の前後の空白（全角スペース・タブを含む）を削る", () => {
    expect(splitLabelFragments(" a , b\t,　c　", ",")).toEqual(["a", "b", "c"]);
  });

  it("空になった断片を捨てる（区切りが連続・先頭・末尾にあるときと、空白だけの断片）", () => {
    expect(splitLabelFragments("a,,b, ,c", ",")).toEqual(["a", "b", "c"]);
    expect(splitLabelFragments(",,a,,,b,,", ",")).toEqual(["a", "b"]);
    expect(splitLabelFragments("、、", "、")).toEqual([]);
    expect(splitLabelFragments("", "、")).toEqual([]);
  });

  it("区切りが無ければ全体を 1 件で返す", () => {
    expect(splitLabelFragments("りんごみかん", "、")).toEqual(["りんごみかん"]);
  });

  it("複数文字の区切りも、そのままの文字列で分ける", () => {
    expect(splitLabelFragments("a -> b -> c", " -> ")).toEqual(["a", "b", "c"]);
    expect(splitLabelFragments("a - b", " -> ")).toEqual(["a - b"]);
  });

  it("区切りが空文字のときは 1 文字ずつに分けず、ラベル全体を trim した 1 件を返す（空白だけなら 0 件）", () => {
    expect(splitLabelFragments("  abc  ", "")).toEqual(["abc"]);
    expect(splitLabelFragments("a b", "")).toEqual(["a b"]);
    expect(splitLabelFragments("   ", "")).toEqual([]);
    expect(splitLabelFragments("", "")).toEqual([]);
  });

  it("全角・半角を区別し、正規化しない（全角のコンマは半角のコンマの境目にならない）", () => {
    expect(splitLabelFragments("a，b,c", ",")).toEqual(["a，b", "c"]);
    expect(splitLabelFragments("a,b，c", "，")).toEqual(["a,b", "c"]);
    expect(splitLabelFragments("ＡＢ,ab", "ab")).toEqual(["ＡＢ,"]);
  });
});

describe("canSplitNode", () => {
  const nodes = [node(1, null, "a"), node(2, 1, "b")];

  it("対象が存在し、表示されているときだけ真", () => {
    expect(canSplitNode(nodes, 2, new Set([1, 2]))).toBe(true);
    expect(canSplitNode(nodes, 2, new Set([1]))).toBe(false);
    expect(canSplitNode(nodes, 99, new Set([1, 2, 99]))).toBe(false);
    expect(canSplitNode(nodes, null, new Set([1, 2]))).toBe(false);
  });
});

describe("planNodeSplit", () => {
  const nodes = [
    node(1, null, "計画"),
    node(2, 1, "りんご、みかん、ぶどう"),
    node(3, 1, "バナナ"),
  ];

  it("成功すると対象の ID と断片の配列を返し、配列は変えない", () => {
    const frozen = Object.freeze(nodes.map((item) => Object.freeze({ ...item })));

    expect(planNodeSplit(frozen, 2, "、", visibleOf(frozen))).toEqual({
      ok: true,
      nodeId: 2,
      fragments: ["りんご", "みかん", "ぶどう"],
    });
  });

  it("200 件までは分割でき、201 件以上は too-many-fragments", () => {
    const labelOf = (count: number) => Array.from({ length: count }, (_, index) => `項目${index}`).join("、");
    const at = (count: number) => planNodeSplit([node(1, null, labelOf(count))], 1, "、", new Set([1]));

    expect(MAX_SPLIT_FRAGMENTS).toBe(200);
    expect(at(MAX_SPLIT_FRAGMENTS)).toMatchObject({ ok: true });
    expect(at(MAX_SPLIT_FRAGMENTS + 1)).toEqual({ ok: false, reason: "too-many-fragments" });
  });

  describe("各 reason と、検査の順序", () => {
    it("対象が配列に無ければ node-missing（表示されていない集合でも node-hidden より先）", () => {
      expect(planNodeSplit(nodes, 99, "、", new Set())).toEqual({ ok: false, reason: "node-missing" });
    });

    it("対象が表示されていなければ node-hidden（座標の不正・区切り文字の空より先）", () => {
      const broken = [node(1, null, "a、b", { width: 0 })];

      expect(planNodeSplit(broken, 1, "", new Set())).toEqual({ ok: false, reason: "node-hidden" });
    });

    it("座標が有限でない・幅高が 0 以下のノードがあれば placement-failed（構造の不正より先）", () => {
      const broken = [node(1, null, "a、b", { x: Number.NaN }), node(1, null, "重複")];

      expect(planNodeSplit(broken, 1, "", new Set([1]))).toEqual({ ok: false, reason: "placement-failed" });
    });

    it("森として不正（ID の重複・親が無い・循環）なら invalid-structure（区切り文字の空より先）", () => {
      expect(planNodeSplit([node(1, null, "a、b"), node(1, null, "c")], 1, "", new Set([1])))
        .toEqual({ ok: false, reason: "invalid-structure" });
      expect(planNodeSplit([node(1, 9, "a、b")], 1, "、", new Set([1])))
        .toEqual({ ok: false, reason: "invalid-structure" });
      expect(planNodeSplit([node(1, 2, "a、b"), node(2, 1, "c")], 1, "、", new Set([1, 2])))
        .toEqual({ ok: false, reason: "invalid-structure" });
    });

    it("区切り文字が空なら separator-empty（断片が 1 件でもそちらが先）", () => {
      expect(planNodeSplit([node(1, null, "abc")], 1, "", new Set([1])))
        .toEqual({ ok: false, reason: "separator-empty" });
    });

    it("断片が 2 件未満（区切りが無い・断片がすべて空）なら not-splittable", () => {
      expect(planNodeSplit([node(1, null, "abc")], 1, "、", new Set([1])))
        .toEqual({ ok: false, reason: "not-splittable" });
      expect(planNodeSplit([node(1, null, "、、")], 1, "、", new Set([1])))
        .toEqual({ ok: false, reason: "not-splittable" });
      expect(planNodeSplit([node(1, null, "a、")], 1, "、", new Set([1])))
        .toEqual({ ok: false, reason: "not-splittable" });
    });
  });
});

describe("isSameNodeSplitPlan", () => {
  const plan = (nodeId: number, fragments: string[]): NodeSplitPlan => ({ ok: true, nodeId, fragments });

  it("対象と断片の配列が同じときだけ真", () => {
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(2, ["a", "b"]))).toBe(true);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(2, ["a", "c"]))).toBe(false);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(2, ["b", "a"]))).toBe(false);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(2, ["a", "b", "c"]))).toBe(false);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), plan(3, ["a", "b"]))).toBe(false);
  });

  it("どちらかが失敗した計画なら、同じ失敗でも偽", () => {
    const failed: NodeSplitPlan = { ok: false, reason: "not-splittable" };

    expect(isSameNodeSplitPlan(failed, failed)).toBe(false);
    expect(isSameNodeSplitPlan(plan(2, ["a", "b"]), failed)).toBe(false);
  });
});

describe("splitNode", () => {
  const illustration = createJpegDataUrl(100, 100);
  // ルートの兄弟（1・2・3）の間で、2 を分割する。2 は子 5 を持ち、重要度 high・イラスト付き（大きさも既定でない）
  const rootNodes = [
    node(1, null, "計画", { x: 0, y: 0 }),
    node(2, null, "りんご、みかん、ぶどう", { x: 50, y: 100, width: 140, height: 108, importance: "high", illustration }),
    node(5, 2, "りんごの子", { x: 250, y: 100 }),
    node(3, null, "バナナ", { x: 0, y: 300 }),
  ];

  function success(nodes: readonly Node[], nodeId: number, newNodeIds: readonly number[], separator = "、") {
    const result = splitNode(nodes, nodeId, separator, newNodeIds, visibleOf(nodes));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    return result;
  }

  it("元のノードは最初の断片を残し、子・座標・大きさ・重要度・イラストを変えない", () => {
    const { nodes } = success(rootNodes, 2, [101, 102]);

    expect(nodes.find((item) => item.id === 2)).toEqual({ ...rootNodes[1], label: "りんご" });
    expect(nodes.find((item) => item.id === 5)).toBe(rootNodes[2]);
  });

  it("2 件目以降の断片は元のノードの直後の兄弟として、断片の順に差し込む", () => {
    const { nodes, insertedIds } = success(rootNodes, 2, [101, 102]);

    expect(nodes.map((item) => item.id)).toEqual([1, 2, 101, 102, 5, 3]);
    expect(insertedIds).toEqual([101, 102]);
    expect(nodes.map((item) => item.label)).toEqual(["計画", "りんご", "みかん", "ぶどう", "りんごの子", "バナナ"]);
  });

  it("新しいノードの座標は兄弟追加と同じ規則で、x は元のノードと同じ・y は直前までの兄弟の最も下の下端の下", () => {
    const { nodes } = success(rootNodes, 2, [101, 102]);

    // ルートの兄弟（1・2・3）の最も下の下端は 3 の 360。1 件目は 360 + 40、2 件目は 1 件目の下端 460 + 40
    expect(nodes.find((item) => item.id === 101)).toMatchObject({ parentId: null, x: 50, y: 400 });
    expect(nodes.find((item) => item.id === 102)).toMatchObject({ parentId: null, x: 50, y: 500 });
  });

  it("新しいノードは重要度が元と同じで、大きさは既定、イラストを持たない", () => {
    const { nodes } = success(rootNodes, 2, [101, 102]);

    for (const id of [101, 102]) {
      const created = nodes.find((item) => item.id === id)!;
      expect(created).toMatchObject({ width: 100, height: 60, importance: "high" });
      expect("illustration" in created).toBe(false);
    }
  });

  it("表示されていない（隠れた）兄弟も含めた全体の配列を基準に座標を決める（L-460）", () => {
    // 最も下の兄弟 3（下端 360）と、2 の子 5 を、表示されていないことにする
    const visible = new Set([1, 2]);

    const result = splitNode(rootNodes, 2, "、", [101, 102], visible);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 見えている兄弟（1 と 2。2 の下端は 208）だけを基準にすると 248 になる。隠れた 3 の下端 360 の下から積む
    expect(result.nodes.find((item) => item.id === 101)).toMatchObject({ y: 400 });
    expect(result.nodes.find((item) => item.id === 102)).toMatchObject({ y: 500 });
    expect(result.nodes.map((item) => item.id)).toEqual([1, 2, 101, 102, 5, 3]);
  });

  it("子ノードの分割では、同じ親の兄弟だけを基準に座標を決める", () => {
    const nodes = [
      node(1, null, "根", { x: 0, y: 0 }),
      node(2, 1, "A、B", { x: 200, y: 0 }),
      node(3, 1, "下の兄弟", { x: 200, y: 200 }),
      node(4, null, "遠くの別の根", { x: 0, y: 900 }),
    ];

    const result = success(nodes, 2, [9]);

    expect(result.nodes.map((item) => item.id)).toEqual([1, 2, 9, 3, 4]);
    expect(result.nodes.find((item) => item.id === 9)).toMatchObject({ parentId: 1, x: 200, y: 300, label: "B" });
  });

  it("ほかのノードは同じオブジェクトのまま、相対順を変えない。元の配列は変えない", () => {
    const frozen = Object.freeze(rootNodes.map((item) => Object.freeze({ ...item })));

    const { nodes } = success(frozen, 2, [101, 102]);

    const others = nodes.filter((item) => ![2, 101, 102].includes(item.id));
    const originalOthers = [frozen[0], frozen[2], frozen[3]];
    expect(others).toHaveLength(originalOthers.length);
    others.forEach((item, index) => expect(item).toBe(originalOthers[index]));
  });

  it("区切り文字で分けた結果は、前後の空白と空の断片を除いたラベルになる", () => {
    const nodes = [node(1, null, " a ,, b ,c ")];

    const { nodes: next } = success(nodes, 1, [11, 12], ",");

    expect(next.map((item) => item.label)).toEqual(["a", "b", "c"]);
  });

  describe("失敗では配列を返さない", () => {
    it.each([
      ["新しい ID が少ない", [101]],
      ["新しい ID が多い", [101, 102, 103]],
      ["既存の ID と重なる", [1, 102]],
      ["新しい ID どうしが重なる", [101, 101]],
      ["有限でない ID を含む", [101, Number.NaN]],
    ])("%sと id-conflict", (_name, newNodeIds) => {
      expect(splitNode(rootNodes, 2, "、", newNodeIds, visibleOf(rootNodes)))
        .toEqual({ ok: false, reason: "id-conflict" });
    });

    it("計画の失敗は、その reason をそのまま返す（ID の検査より先）", () => {
      expect(splitNode(rootNodes, 2, "", [], visibleOf(rootNodes))).toEqual({ ok: false, reason: "separator-empty" });
      expect(splitNode(rootNodes, 3, "、", [101], visibleOf(rootNodes))).toEqual({ ok: false, reason: "not-splittable" });
      expect(splitNode(rootNodes, 2, "、", [101, 102], new Set([1, 3]))).toEqual({ ok: false, reason: "node-hidden" });
      expect(splitNode(rootNodes, 99, "、", [101, 102], visibleOf(rootNodes))).toEqual({ ok: false, reason: "node-missing" });
    });
  });
});
```

`client/src/domain/nodes/__tests__/nodeSplitMessages.test.ts`:

```typescript
import type { NodeSplitFailureReason } from "@/domain/nodes/nodeSplit";
import { formatNodeSplitFailureNotice } from "@/domain/nodes/nodeSplitMessages";

describe("formatNodeSplitFailureNotice", () => {
  const cases: [NodeSplitFailureReason, string][] = [
    ["node-missing", "分割できるノードが選択されていません。"],
    ["node-hidden", "分割できるノードが選択されていません。"],
    ["invalid-structure", "分割できるノードが選択されていません。"],
    ["separator-empty", "区切り文字を入力してください。"],
    ["not-splittable", "区切り文字で 2 つ以上に分けられません。"],
    ["too-many-fragments", "分割できるのは 200 件までです。"],
    ["plan-changed", "分割の内容が変わりました。もう一度確認してください。"],
    ["id-conflict", "ノードを分割できませんでした。"],
    ["placement-failed", "ノードを分割できませんでした。"],
  ];

  it.each(cases)("%s はエラーの通知「%s」にする", (reason, message) => {
    expect(formatNodeSplitFailureNotice(reason)).toEqual({ kind: "error", message });
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeGeometryValidation.test.ts src/domain/nodes/__tests__/nodeSplit.test.ts src/domain/nodes/__tests__/nodeSplitMessages.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`client/src/domain/nodes/nodeGeometryValidation.ts`:

```typescript
import type { Node } from "@/types/node";

// 座標が有限でない・幅高が 0 以下のノードがあるか。配置不能（placement-failed）と構造不正（invalid-structure）を
// 分類するため、森の検証（indexNodeForest）より先に呼ぶ
export function hasInvalidNodeGeometry(nodes: readonly Node[]): boolean {
  return nodes.some((node) => (
    !Number.isFinite(node.x) || !Number.isFinite(node.y) ||
    !Number.isFinite(node.width) || !Number.isFinite(node.height) ||
    node.width <= 0 || node.height <= 0
  ));
}
```

`client/src/domain/nodes/nodeSplit.ts`:

```typescript
import { hasInvalidNodeGeometry } from "@/domain/nodes/nodeGeometryValidation";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { createSiblingNode } from "@/domain/nodes/nodePlacement";
import type { Node } from "@/types/node";

export const MAX_SPLIT_FRAGMENTS = 200;

export type NodeSplitFailureReason =
  | "node-missing"
  | "node-hidden"
  | "invalid-structure"
  | "separator-empty"
  | "not-splittable"
  | "too-many-fragments"
  | "id-conflict"
  | "placement-failed"
  // 確定時の再計画が、プレビューで見せた計画と違う（useNodes.splitNode が返す）
  | "plan-changed";

export type NodeSplitPlan =
  | { ok: true; nodeId: number; fragments: string[] }
  | { ok: false; reason: NodeSplitFailureReason };

export type NodeSplitResult =
  | { ok: true; nodes: Node[]; insertedIds: number[] }
  | { ok: false; reason: NodeSplitFailureReason };

// useNodes.splitNode の戻り値
export type SplitNodeResult =
  | { ok: true; insertedIds: number[] }
  | { ok: false; reason: NodeSplitFailureReason };

// ラベルを区切り、前後の空白を削って空の断片を捨てる（件数の上限は検査しない）。一致は完全一致で正規化しない。
// 区切りが空文字のときは 1 文字ずつに分けず、ラベル全体を trim した 1 件（trim して空なら 0 件）を返す
export function splitLabelFragments(label: string, separator: string): string[] {
  if (separator === "") {
    const whole = label.trim();
    return whole === "" ? [] : [whole];
  }
  return label.split(separator).map((fragment) => fragment.trim()).filter((fragment) => fragment !== "");
}

// ボタンの有効判定。断片の数は区切り文字しだいなので含めない
export function canSplitNode(
  nodes: readonly Node[],
  nodeId: number | null,
  visibleNodeIds: ReadonlySet<number>,
): boolean {
  return nodeId !== null && visibleNodeIds.has(nodeId) && nodes.some((node) => node.id === nodeId);
}

// 対象の存在・可視・構造・区切り文字・断片数を、この順に検査する（配列は変えない）
export function planNodeSplit(
  nodes: readonly Node[],
  nodeId: number,
  separator: string,
  visibleNodeIds: ReadonlySet<number>,
): NodeSplitPlan {
  const target = nodes.find((node) => node.id === nodeId);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  if (!visibleNodeIds.has(nodeId)) return { ok: false, reason: "node-hidden" };
  // 配置不能と構造不正を分類するため、座標・大きさだけを森の検証より先に調べる
  if (hasInvalidNodeGeometry(nodes)) return { ok: false, reason: "placement-failed" };
  if (indexNodeForest(nodes) === null) return { ok: false, reason: "invalid-structure" };
  if (separator === "") return { ok: false, reason: "separator-empty" };

  const fragments = splitLabelFragments(target.label, separator);
  if (fragments.length < 2) return { ok: false, reason: "not-splittable" };
  if (fragments.length > MAX_SPLIT_FRAGMENTS) return { ok: false, reason: "too-many-fragments" };
  return { ok: true, nodeId, fragments };
}

// 確定時の再計画とプレビューの計画が同じか。失敗した計画は同じとみなさない
export function isSameNodeSplitPlan(a: NodeSplitPlan, b: NodeSplitPlan): boolean {
  if (!a.ok || !b.ok) return false;
  return a.nodeId === b.nodeId
    && a.fragments.length === b.fragments.length
    && a.fragments.every((fragment, index) => fragment === b.fragments[index]);
}

function hasUsableNewIds(
  nodes: readonly Node[],
  newNodeIds: readonly number[],
  expectedCount: number,
): boolean {
  if (newNodeIds.length !== expectedCount) return false;
  if (new Set(newNodeIds).size !== newNodeIds.length) return false;
  const existingIds = new Set(nodes.map((node) => node.id));
  return newNodeIds.every((id) => Number.isFinite(id) && !existingIds.has(id));
}

// 最初の断片は元のノードに残し（ラベルだけ更新）、残りは元のノードの直後の兄弟として断片順に差し込む。
// 自動配置の全体の再レイアウトは applyTreeChange に任せる（先頭のルートは変わらないので座標の引き継ぎも要らない）
export function splitNode(
  nodes: readonly Node[],
  nodeId: number,
  separator: string,
  newNodeIds: readonly number[],
  visibleNodeIds: ReadonlySet<number>,
): NodeSplitResult {
  const plan = planNodeSplit(nodes, nodeId, separator, visibleNodeIds);
  if (!plan.ok) return plan;
  const source = nodes.find((node) => node.id === nodeId);
  if (source === undefined) return { ok: false, reason: "node-missing" };
  const { fragments } = plan;
  if (!hasUsableNewIds(nodes, newNodeIds, fragments.length - 1)) return { ok: false, reason: "id-conflict" };

  // 座標は createSiblingNode と同じ規則で、直前までに作った断片を含む配列を基準に決める
  const basis: Node[] = nodes.map((node) => (node.id === nodeId ? { ...node, label: fragments[0] } : node));
  const inserted: Node[] = [];
  for (let index = 1; index < fragments.length; index += 1) {
    const created = createSiblingNode(basis, nodeId, newNodeIds[index - 1]);
    if (created === null) return { ok: false, reason: "placement-failed" };
    const fragmentNode: Node = { ...created, label: fragments[index], importance: source.importance };
    basis.push(fragmentNode);
    inserted.push(fragmentNode);
  }

  const next: Node[] = [];
  for (const node of nodes) {
    if (node.id === nodeId) next.push({ ...node, label: fragments[0] }, ...inserted);
    else next.push(node);
  }
  return { ok: true, nodes: next, insertedIds: inserted.map((node) => node.id) };
}
```

`client/src/domain/nodes/nodeSplitMessages.ts`:

```typescript
import { MAX_SPLIT_FRAGMENTS, type NodeSplitFailureReason } from "@/domain/nodes/nodeSplit";
import type { OperationNotice } from "@/types/operationNotice";

// 分割が失敗した理由を、利用者向けの通知にする。ダイアログの状態文言とエラー表示も同じ文言を使う
export function formatNodeSplitFailureNotice(reason: NodeSplitFailureReason): OperationNotice {
  switch (reason) {
    case "node-missing":
    case "node-hidden":
    case "invalid-structure":
      return { kind: "error", message: "分割できるノードが選択されていません。" };
    case "separator-empty":
      return { kind: "error", message: "区切り文字を入力してください。" };
    case "not-splittable":
      return { kind: "error", message: "区切り文字で 2 つ以上に分けられません。" };
    case "too-many-fragments":
      return { kind: "error", message: `分割できるのは ${MAX_SPLIT_FRAGMENTS} 件までです。` };
    case "plan-changed":
      return { kind: "error", message: "分割の内容が変わりました。もう一度確認してください。" };
    case "id-conflict":
    case "placement-failed":
      return { kind: "error", message: "ノードを分割できませんでした。" };
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeGeometryValidation.test.ts src/domain/nodes/__tests__/nodeSplit.test.ts src/domain/nodes/__tests__/nodeSplitMessages.test.ts && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし。座標のテストが落ちたら、期待値ではなく `splitNode` の座標の決め方（`createSiblingNode` を、直前までに作った断片を含む配列に対して呼ぶこと）を見直す（設計書 §3.2 が正）。

---

### Task 3: 統合のドメイン

**Files:**
- Create: `client/src/domain/nodes/nodeMerge.ts`
- Create: `client/src/domain/nodes/nodeMergeMessages.ts`
- Test: `client/src/domain/nodes/__tests__/nodeMerge.test.ts`（新規）
- Test: `client/src/domain/nodes/__tests__/nodeMergeMessages.test.ts`（新規）

**Interfaces:**
- Consumes: Task 1 の `maxNodeImportance`、Task 2 の `hasInvalidNodeGeometry`、`indexNodeForest`（`@/domain/nodes/nodeLayoutForest`）、`ILLUSTRATED_NODE_HEIGHT`（`@/config/shapes`）
- Produces（`@/domain/nodes/nodeMerge`）:
  - `type NodeMergeFailureReason = "too-few-nodes" | "node-missing" | "node-hidden" | "primary-missing" | "different-parents" | "invalid-structure" | "placement-failed" | "plan-changed"`
  - `type NodeMergePlan = { ok: true; survivorId: number; absorbedIds: number[]; label: string; importance: NodeImportance; illustration: string | undefined; illustrationFrom: "primary" | "absorbed" | "none"; illustrationSourceId: number | null; discardedIllustrationCount: number; movedChildCount: number } | { ok: false; reason: NodeMergeFailureReason }`
  - `type NodeMergeResult = { ok: true; nodes: Node[]; survivorId: number; absorbedIds: number[] } | { ok: false; reason: NodeMergeFailureReason }`
  - `type MergeNodesResult = { ok: true; survivorId: number; absorbedCount: number } | { ok: false; reason: NodeMergeFailureReason }`（`useNodes.mergeNodes` の戻り値）
  - `planNodeMerge(nodes: readonly Node[], ids: readonly number[], primaryId: number | null, joiner: string, visibleNodeIds: ReadonlySet<number>): NodeMergePlan`
  - `isSameNodeMergePlan(a: NodeMergePlan, b: NodeMergePlan): boolean`（両方成功で、`survivorId`・`absorbedIds` の順・`label`・`illustrationSourceId` が同じときだけ真）
  - `mergeNodes(nodes: readonly Node[], ids: readonly number[], primaryId: number | null, joiner: string, visibleNodeIds: ReadonlySet<number>, mode: NodeLayoutMode): NodeMergeResult`
- Produces（`@/domain/nodes/nodeMergeMessages`）: `formatNodeMergeFailureNotice(reason: NodeMergeFailureReason): OperationNotice`

- [ ] **Step 1: 失敗するテストを書く**

`client/src/domain/nodes/__tests__/nodeMerge.test.ts`:

```typescript
import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import { createNodeCollapseIndex, deriveNodeCollapse } from "@/domain/nodes/nodeCollapse";
import {
  isSameNodeMergePlan,
  mergeNodes,
  planNodeMerge,
  type NodeMergePlan,
} from "@/domain/nodes/nodeMerge";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

function node(id: number, parentId: number | null, label: string, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label, x: id * 10, y: id * 20, ...overrides });
}

function visibleOf(nodes: readonly Node[]): Set<number> {
  return new Set(nodes.map((item) => item.id));
}

function ids(nodes: readonly Node[]): number[] {
  return nodes.map((item) => item.id);
}

function byId(nodes: readonly Node[], id: number): Node {
  return nodes.find((item) => item.id === id)!;
}

function merged(
  nodes: readonly Node[],
  selectedIds: readonly number[],
  primaryId: number | null,
  joiner = " ",
  mode: NodeLayoutMode = "manual",
  visible: ReadonlySet<number> = visibleOf(nodes),
) {
  const result = mergeNodes(nodes, selectedIds, primaryId, joiner, visible, mode);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function okPlan(nodes: readonly Node[], selectedIds: readonly number[], primaryId: number | null, joiner = " ") {
  const plan = planNodeMerge(nodes, selectedIds, primaryId, joiner, visibleOf(nodes));
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(plan.reason);
  return plan;
}

// 計画 1: 親 1 の下の兄弟 2（低）・3（高）・4（中）・8（選択しない）と、その子・孫。
// 配列は子孫を親の直後にまとめず、兄弟の間にも子を置く
const family = [
  node(1, null, "計画", { x: 0, y: 0 }),
  node(2, 1, "りんご", { importance: "low", x: 200, y: 0 }),
  node(3, 1, "リンゴ", { importance: "high", x: 200, y: 100 }),
  node(4, 1, "apple", { importance: "medium", x: 200, y: 200 }),
  node(8, 1, "バナナ", { x: 200, y: 300 }),
  node(5, 2, "りんごの子", { x: 400, y: 0 }),
  node(6, 3, "リンゴの子1", { x: 400, y: 100 }),
  node(7, 3, "リンゴの子2", { x: 400, y: 160 }),
  node(9, 5, "りんごの孫", { x: 600, y: 0 }),
];

describe("planNodeMerge", () => {
  it("主選択を残し、吸収されるノードを配列順に並べ、ラベル・重要度・付け替える子の件数を計画する", () => {
    expect(okPlan(family, [2, 3, 4], 3)).toEqual({
      ok: true,
      survivorId: 3,
      absorbedIds: [2, 4],
      label: "りんご リンゴ apple",
      importance: "high",
      illustration: undefined,
      illustrationFrom: "none",
      illustrationSourceId: null,
      discardedIllustrationCount: 0,
      movedChildCount: 1,
    });
  });

  it("並びは配列順で、ids の順序を変えても同じ計画になる", () => {
    const expected = okPlan(family, [2, 3, 4], 3);

    expect(okPlan(family, [4, 3, 2], 3)).toEqual(expected);
    expect(okPlan(family, [3, 4, 2, 3], 3)).toEqual(expected);
  });

  describe("ラベルの連結", () => {
    it("区切り文字で連結する（主選択が先頭でなくても、配列上の位置に入る）", () => {
      expect(okPlan(family, [2, 3, 4], 4, "・").label).toBe("りんご・リンゴ・apple");
    });

    it("区切り文字が空なら区切りなしで連結する", () => {
      expect(okPlan(family, [2, 3], 2, "").label).toBe("りんごリンゴ");
    });

    it("空文字のラベルを除き、前後の空白は削らない（空白だけが違う結果を作れる）", () => {
      const nodes = [
        node(1, null, "A "),
        node(2, null, ""),
        node(3, null, " B"),
      ];

      expect(okPlan(nodes, [1, 2, 3], 1, "").label).toBe("A  B");
      expect(okPlan(nodes, [1, 2, 3], 1, "|").label).toBe("A | B");
    });

    it("すべてのラベルが空なら空のラベルになる", () => {
      expect(okPlan([node(1, null, ""), node(2, null, "")], [1, 2], 1).label).toBe("");
    });
  });

  it("重要度は選択中で最も高いもの（選択外のノードは含めない）", () => {
    expect(okPlan(family, [2, 4], 2).importance).toBe("medium");
    expect(okPlan(family, [2, 8], 2).importance).toBe("medium");
    expect(okPlan(family, [2, 3], 2).importance).toBe("high");
    expect(okPlan([node(1, null, "a", { importance: "low" }), node(2, null, "b", { importance: "low" })], [1, 2], 1).importance)
      .toBe("low");
  });

  describe("イラストの優先順位", () => {
    const illustrationA = createJpegDataUrl(100, 100);
    const illustrationB = createJpegDataUrl(120, 120);
    const illustrated = (id: number, dataUrl: string) => node(id, 1, `ノード${id}`, { illustration: dataUrl, height: ILLUSTRATED_NODE_HEIGHT });
    const siblings = [node(1, null, "親"), node(2, 1, "持たない"), illustrated(3, illustrationA), illustrated(4, illustrationB)];

    it("主選択が持っていればそれを残す（吸収される側の 1 件が失われる）", () => {
      const plan = okPlan(siblings, [2, 3, 4], 4);

      expect(plan).toMatchObject({
        illustrationFrom: "primary",
        illustration: illustrationB,
        illustrationSourceId: null,
        discardedIllustrationCount: 1,
      });
    });

    it("主選択が持たなければ、吸収されるノードのうち配列順で最初に持つものを引き継ぐ", () => {
      const plan = okPlan(siblings, [4, 3, 2], 2);

      expect(plan).toMatchObject({
        illustrationFrom: "absorbed",
        illustration: illustrationA,
        illustrationSourceId: 3,
        discardedIllustrationCount: 1,
      });
    });

    it("持つものが無ければ none で、失われるイラストも無い", () => {
      const plan = okPlan(family, [2, 3], 2);

      expect(plan).toMatchObject({ illustrationFrom: "none", illustration: undefined, illustrationSourceId: null, discardedIllustrationCount: 0 });
    });

    it("吸収される側の 1 件だけが持つときは、引き継ぐので失われない", () => {
      expect(okPlan(siblings, [2, 3], 2)).toMatchObject({ illustrationFrom: "absorbed", discardedIllustrationCount: 0 });
    });
  });

  it("付け替える子の件数は、吸収されるノードの直下の子の数で、孫は数えない", () => {
    expect(okPlan(family, [2, 3], 3).movedChildCount).toBe(1);
    expect(okPlan(family, [2, 3], 2).movedChildCount).toBe(2);
    expect(okPlan(family, [2, 3, 4], 2).movedChildCount).toBe(2);
    expect(okPlan(family, [4, 8], 4).movedChildCount).toBe(0);
  });

  it("付け替える子の件数は、折りたたみ・解像度で隠れた子も数える（表示されている集合に絞らない。L-460）", () => {
    // 2 の子 5 と、5 の子 9 を、表示されていないことにする（選択した 2・3 は表示されている）
    const visible = new Set([1, 2, 3, 4, 6, 7, 8]);

    expect(okPlan(family, [2, 3], 3).movedChildCount).toBe(1);
    const plan = planNodeMerge(family, [2, 3], 3, " ", visible);
    expect(plan.ok && plan.movedChildCount).toBe(1);
  });

  it("配列を変えない", () => {
    const frozen = Object.freeze(family.map((item) => Object.freeze({ ...item })));

    expect(planNodeMerge(frozen, [2, 3], 3, " ", visibleOf(frozen)).ok).toBe(true);
  });

  describe("各 reason と、検査の順序", () => {
    const failure = (
      nodes: readonly Node[],
      selectedIds: readonly number[],
      primaryId: number | null,
      visible: ReadonlySet<number> = visibleOf(nodes),
    ) => planNodeMerge(nodes, selectedIds, primaryId, " ", visible);

    it("重複を除いて 2 件未満なら too-few-nodes（存在しない ID でもそちらが先）", () => {
      expect(failure(family, [], null)).toEqual({ ok: false, reason: "too-few-nodes" });
      expect(failure(family, [2], 2)).toEqual({ ok: false, reason: "too-few-nodes" });
      expect(failure(family, [2, 2, 2], 2)).toEqual({ ok: false, reason: "too-few-nodes" });
      expect(failure(family, [99], 99)).toEqual({ ok: false, reason: "too-few-nodes" });
    });

    it("1 つでも配列に無い ID があれば node-missing（非表示の判定より先）", () => {
      expect(failure(family, [2, 99], 2, new Set())).toEqual({ ok: false, reason: "node-missing" });
    });

    it("1 つでも表示されていなければ node-hidden（主選択の判定より先）", () => {
      expect(failure(family, [2, 3], null, new Set([1, 2]))).toEqual({ ok: false, reason: "node-hidden" });
    });

    it("主選択が null または選択に含まれなければ primary-missing（座標の不正より先）", () => {
      const broken = [node(1, null, "a", { width: 0 }), node(2, null, "b")];

      expect(failure(broken, [1, 2], null)).toEqual({ ok: false, reason: "primary-missing" });
      expect(failure(family, [2, 3], 4)).toEqual({ ok: false, reason: "primary-missing" });
    });

    it("座標が有限でない・幅高が 0 以下のノードがあれば placement-failed（構造の不正より先）", () => {
      const broken = [node(1, null, "a", { x: Number.NaN }), node(2, null, "b"), node(2, null, "重複")];

      expect(failure(broken, [1, 2], 1)).toEqual({ ok: false, reason: "placement-failed" });
    });

    it("森として不正（ID の重複・親が無い・循環）なら invalid-structure（親の不一致より先）", () => {
      expect(failure([node(1, null, "a"), node(2, 99, "b")], [1, 2], 1)).toEqual({ ok: false, reason: "invalid-structure" });
      expect(failure([node(1, null, "a"), node(1, null, "b"), node(2, null, "c")], [1, 2], 1)).toEqual({ ok: false, reason: "invalid-structure" });
      expect(failure([node(1, 2, "a"), node(2, 1, "b")], [1, 2], 1)).toEqual({ ok: false, reason: "invalid-structure" });
    });

    it("親が揃わなければ different-parents（別の親の子・ルートと子・祖先と子孫・孫と子）", () => {
      expect(failure(family, [5, 6], 5)).toEqual({ ok: false, reason: "different-parents" });
      expect(failure(family, [1, 2], 1)).toEqual({ ok: false, reason: "different-parents" });
      expect(failure(family, [2, 5], 2)).toEqual({ ok: false, reason: "different-parents" });
      expect(failure(family, [2, 9], 2)).toEqual({ ok: false, reason: "different-parents" });
    });
  });
});

describe("isSameNodeMergePlan", () => {
  const base = okPlan(family, [2, 3, 4], 3);

  it("残すノード・吸収されるノードの順・ラベル・イラストの引き継ぎ元が同じなら真", () => {
    expect(isSameNodeMergePlan(base, okPlan(family, [4, 2, 3], 3))).toBe(true);
  });

  it.each([
    ["残すノードが違う", okPlan(family, [2, 3, 4], 2)],
    ["吸収されるノードが違う", okPlan(family, [2, 3], 3)],
    ["区切り文字でラベルが違う", okPlan(family, [2, 3, 4], 3, "-")],
  ])("%sなら偽", (_name, other) => {
    expect(isSameNodeMergePlan(base, other)).toBe(false);
  });

  it("イラストの引き継ぎ元が違えば偽", () => {
    const withIllustration = family.map((item) => (item.id === 4 ? { ...item, illustration: createJpegDataUrl(100, 100) } : item));

    expect(isSameNodeMergePlan(base, okPlan(withIllustration, [2, 3, 4], 3))).toBe(false);
  });

  it("吸収されるノードの順が違えば偽", () => {
    const reordered: NodeMergePlan = { ...base, absorbedIds: [4, 2] };

    expect(isSameNodeMergePlan(base, reordered)).toBe(false);
  });

  it("どちらかが失敗した計画なら、同じ失敗でも偽", () => {
    const failedPlan: NodeMergePlan = { ok: false, reason: "different-parents" };

    expect(isSameNodeMergePlan(failedPlan, failedPlan)).toBe(false);
    expect(isSameNodeMergePlan(base, failedPlan)).toBe(false);
  });
});

describe("mergeNodes", () => {
  it("主選択が残り、吸収されるノードは配列から消え、残すノードのラベル・重要度だけが変わる", () => {
    const result = merged(family, [2, 3, 4], 3);

    expect(result.survivorId).toBe(3);
    expect(result.absorbedIds).toEqual([2, 4]);
    expect(ids(result.nodes)).not.toContain(2);
    expect(ids(result.nodes)).not.toContain(4);
    // 位置・大きさ・id・parentId は主選択のまま
    expect(byId(result.nodes, 3)).toEqual({ ...byId(family, 3), label: "りんご リンゴ apple", importance: "high" });
  });

  it("吸収されるノードの子を、残すノードの直下の子の最後のものの直後へ付け替える（座標は変えない）", () => {
    const result = merged(family, [2, 3, 4], 3);

    // 残すノード 3 の子 6・7 の後ろへ、2 の子 5 が入る。5 の孫 9 は動かない
    expect(ids(result.nodes)).toEqual([1, 3, 8, 6, 7, 5, 9]);
    expect(byId(result.nodes, 5)).toEqual({ ...byId(family, 5), parentId: 3 });
    expect(byId(result.nodes, 9)).toBe(byId(family, 9));
    expect(result.nodes.filter((item) => item.parentId === 3).map((item) => item.id)).toEqual([6, 7, 5]);
  });

  describe("隠れた（表示されていない）子を含めて、全体の配列を基準に付け替える（L-460）", () => {
    it("吸収されるノードの隠れた子も付け替え、隠れた孫は動かさない", () => {
      // 2 の子 5 と、5 の子 9 を、表示されていないことにする
      const visible = new Set([1, 2, 3, 4, 6, 7, 8]);

      const result = merged(family, [2, 3], 3, " ", "manual", visible);

      expect(ids(result.nodes)).toEqual([1, 3, 4, 8, 6, 7, 5, 9]);
      expect(byId(result.nodes, 5)).toEqual({ ...byId(family, 5), parentId: 3 });
      expect(byId(result.nodes, 9)).toBe(byId(family, 9));
    });

    it("残すノードの最後の子が隠れていても、その子の直後へ差し込む", () => {
      // 3 の子 6・7 のうち、最後の 7 を表示されていないことにする（見えている子だけを基準にすると、6 の直後になる）
      const visible = new Set([1, 2, 3, 4, 5, 6, 8, 9]);

      const result = merged(family, [2, 3], 3, " ", "manual", visible);

      expect(ids(result.nodes)).toEqual([1, 3, 4, 8, 6, 7, 5, 9]);
      expect(result.nodes.filter((item) => item.parentId === 3).map((item) => item.id)).toEqual([6, 7, 5]);
    });
  });

  it("子孫が間にあっても、残すノードの直下の子の最後のものの直後へ差し込む", () => {
    // 残すノード 2 の子は 4（直後に孫 8）と 5（直後に孫 9）。吸収される 3 の子 6・7 は配列の後ろにある
    const nodes = [
      node(1, null, "親"),
      node(2, 1, "残す"),
      node(4, 2, "子 1"),
      node(8, 4, "子 1 の孫"),
      node(5, 2, "子 2"),
      node(9, 5, "子 2 の孫"),
      node(3, 1, "吸収"),
      node(6, 3, "付け替え 1"),
      node(7, 3, "付け替え 2"),
      node(10, null, "別の根"),
    ];

    const result = merged(nodes, [2, 3], 2);

    expect(ids(result.nodes)).toEqual([1, 2, 4, 8, 5, 6, 7, 9, 10]);
    expect(result.nodes.filter((item) => item.parentId === 2).map((item) => item.id)).toEqual([4, 5, 6, 7]);
  });

  it("残すノードに子が無ければ、残すノードの直後へ、吸収されるノードの配列順・各ノード内の元の順で付け替える", () => {
    // 吸収される 3・4 の子は、配列で吸収されるノードより前にもある（20）
    const nodes = [
      node(1, null, "親"),
      node(2, 1, "残す"),
      node(3, 1, "吸収 1"),
      node(4, 1, "吸収 2"),
      node(20, 4, "吸収 2 の子"),
      node(21, 3, "吸収 1 の子 a"),
      node(22, 3, "吸収 1 の子 b"),
    ];

    const result = merged(nodes, [4, 3, 2], 2);

    expect(ids(result.nodes)).toEqual([1, 2, 21, 22, 20]);
    expect(result.nodes.slice(2).every((item) => item.parentId === 2)).toBe(true);
  });

  it("残すノードの子が配列で残すノードより前にあるときは、その最後の子の直後へ差し込む", () => {
    const nodes = [
      node(1, null, "親"),
      node(4, 2, "残すノードの子"),
      node(2, 1, "残す"),
      node(3, 1, "吸収"),
      node(5, 3, "吸収の子"),
    ];

    expect(ids(merged(nodes, [2, 3], 2).nodes)).toEqual([1, 4, 5, 2]);
  });

  it("ルート同士（親が null）も統合でき、吸収されるルートの子は残すルートの子になる", () => {
    const nodes = [
      node(1, null, "根 A", { x: 10, y: 20 }),
      node(2, null, "根 B", { x: 30, y: 40 }),
      node(3, 1, "A の子"),
      node(4, 2, "B の子"),
    ];

    const result = merged(nodes, [1, 2], 1);

    expect(ids(result.nodes)).toEqual([1, 3, 4]);
    expect(result.nodes.map((item) => item.parentId)).toEqual([null, 1, 1]);
  });

  describe("自動配置での先頭のルートの座標の引き継ぎ", () => {
    const roots = [
      node(1, null, "根 A", { x: 10, y: 20 }),
      node(2, null, "根 B", { x: 30, y: 40 }),
      node(3, null, "根 C", { x: 50, y: 60 }),
      node(4, 2, "B の子", { x: 70, y: 80 }),
    ];

    it("先頭のルートが吸収され、統合後の先頭のルートが別のノードになるとき、旧先頭の座標を新しい先頭へ写す", () => {
      const result = merged(roots, [1, 2], 2, " ", "auto");

      expect(byId(result.nodes, 2)).toMatchObject({ x: 10, y: 20, label: "根 A 根 B" });
    });

    it("新しい先頭のルートは、残すノードでなくてもよい（吸収されるのが先頭で、残すのが 3 のとき、新しい先頭は 2）", () => {
      const result = merged(roots, [1, 3], 3, " ", "auto");

      expect(ids(result.nodes)).toEqual([2, 3, 4]);
      expect(byId(result.nodes, 2)).toMatchObject({ x: 10, y: 20 });
      expect(byId(result.nodes, 3)).toMatchObject({ x: 50, y: 60 });
    });

    it("手動配置では座標を引き継がない", () => {
      const result = merged(roots, [1, 2], 2, " ", "manual");

      expect(byId(result.nodes, 2)).toMatchObject({ x: 30, y: 40 });
    });

    it("残すノードが先頭のルートのとき、先頭のルートが吸収されないときは座標を変えない", () => {
      expect(byId(merged(roots, [1, 2], 1, " ", "auto").nodes, 1)).toMatchObject({ x: 10, y: 20 });
      expect(byId(merged(roots, [2, 3], 3, " ", "auto").nodes, 3)).toMatchObject({ x: 50, y: 60 });
      expect(byId(merged(roots, [2, 3], 2, " ", "auto").nodes, 2)).toMatchObject({ x: 30, y: 40 });
    });

    it("兄弟の統合（ルートでない）では座標を引き継がない", () => {
      const result = merged(family, [2, 3], 3, " ", "auto");

      expect(byId(result.nodes, 3)).toMatchObject({ x: 200, y: 100 });
      expect(byId(result.nodes, 1)).toMatchObject({ x: 0, y: 0 });
    });
  });

  describe("イラストと高さ", () => {
    const illustrationA = createJpegDataUrl(100, 100);
    const illustrationB = createJpegDataUrl(120, 120);
    const nodes = [
      node(1, null, "親"),
      node(2, 1, "持たない", { width: 140 }),
      node(3, 1, "A", { illustration: illustrationA, height: ILLUSTRATED_NODE_HEIGHT }),
      node(4, 1, "B", { illustration: illustrationB, height: ILLUSTRATED_NODE_HEIGHT }),
    ];

    it("主選択が持っていれば、そのイラストと高さのまま残る", () => {
      const survivor = byId(merged(nodes, [2, 3, 4], 4).nodes, 4);

      expect(survivor).toMatchObject({ illustration: illustrationB, height: ILLUSTRATED_NODE_HEIGHT });
    });

    it("主選択が持たなければ、配列順で最初の吸収されるノードのイラストを引き継ぎ、高さをイラスト付きの高さにする", () => {
      const survivor = byId(merged(nodes, [2, 3, 4], 2).nodes, 2);

      expect(survivor).toMatchObject({
        illustration: illustrationA,
        height: ILLUSTRATED_NODE_HEIGHT,
        width: 140,
        x: 20,
        y: 40,
      });
    });

    it("持つものが無ければ illustration のキーを持たず、高さも変えない", () => {
      const plain = [node(1, null, "親"), node(2, 1, "a"), node(3, 1, "b")];

      const survivor = byId(merged(plain, [2, 3], 2).nodes, 2);

      expect("illustration" in survivor).toBe(false);
      expect(survivor.height).toBe(60);
    });
  });

  it("ほかのノードは同じオブジェクトのまま相対順を変えず、元の配列は変えない", () => {
    const frozen = Object.freeze(family.map((item) => Object.freeze({ ...item })));

    const result = merged(frozen, [2, 3, 4], 3);

    const untouchedIds = [1, 8, 6, 7, 9];
    for (const id of untouchedIds) expect(byId(result.nodes, id)).toBe(byId(frozen, id));
    expect(ids(result.nodes).filter((id) => untouchedIds.includes(id))).toEqual([1, 8, 6, 7, 9]);
  });

  it("計画の失敗は、その reason をそのまま返す（兄弟でない選択・祖先と子孫の選択を拒否する）", () => {
    expect(mergeNodes(family, [2, 5], 2, " ", visibleOf(family), "manual")).toEqual({ ok: false, reason: "different-parents" });
    expect(mergeNodes(family, [1, 2], 1, " ", visibleOf(family), "manual")).toEqual({ ok: false, reason: "different-parents" });
    expect(mergeNodes(family, [2], 2, " ", visibleOf(family), "manual")).toEqual({ ok: false, reason: "too-few-nodes" });
    expect(mergeNodes(family, [2, 3], 2, " ", new Set([1, 2]), "manual")).toEqual({ ok: false, reason: "node-hidden" });
  });

  describe("折りたたみ状態の違う親へ子を付け替えたときの見え方", () => {
    const tree = [
      node(1, null, "根"),
      node(2, 1, "A"),
      node(3, 1, "B"),
      node(5, 2, "A の子"),
      node(6, 3, "B の子"),
    ];

    function visibleAfterMerge(collapsed: readonly number[], primaryId: number) {
      const result = merged(tree, [2, 3], primaryId);
      const index = createNodeCollapseIndex(result.nodes)!;
      return deriveNodeCollapse(index, new Set(collapsed)).visibleNodeIds;
    }

    it("閉じていた A を吸収し、開いている B を残すと、A の子が見えるようになる", () => {
      const before = deriveNodeCollapse(createNodeCollapseIndex(tree)!, new Set([2])).visibleNodeIds;
      expect(before.has(5)).toBe(false);

      expect(visibleAfterMerge([2], 3).has(5)).toBe(true);
    });

    it("開いていた A を吸収し、閉じている B を残すと、A の子が見えなくなる", () => {
      const before = deriveNodeCollapse(createNodeCollapseIndex(tree)!, new Set([3])).visibleNodeIds;
      expect(before.has(5)).toBe(true);

      expect(visibleAfterMerge([3], 3).has(5)).toBe(false);
    });
  });
});
```

`client/src/domain/nodes/__tests__/nodeMergeMessages.test.ts`:

```typescript
import type { NodeMergeFailureReason } from "@/domain/nodes/nodeMerge";
import { formatNodeMergeFailureNotice } from "@/domain/nodes/nodeMergeMessages";

describe("formatNodeMergeFailureNotice", () => {
  const cases: [NodeMergeFailureReason, string][] = [
    ["node-missing", "統合できるノードが見つかりません。"],
    ["node-hidden", "統合できるノードが見つかりません。"],
    ["invalid-structure", "統合できるノードが見つかりません。"],
    ["too-few-nodes", "2 つ以上のノードを選択してください。"],
    ["primary-missing", "主選択のノードがありません。"],
    ["different-parents", "同じ親の兄弟のノードだけを統合できます。"],
    ["plan-changed", "統合の内容が変わりました。もう一度確認してください。"],
    ["placement-failed", "ノードを統合できませんでした。"],
  ];

  it.each(cases)("%s はエラーの通知「%s」にする", (reason, message) => {
    expect(formatNodeMergeFailureNotice(reason)).toEqual({ kind: "error", message });
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeMerge.test.ts src/domain/nodes/__tests__/nodeMergeMessages.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`client/src/domain/nodes/nodeMerge.ts`:

```typescript
import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import { hasInvalidNodeGeometry } from "@/domain/nodes/nodeGeometryValidation";
import { maxNodeImportance } from "@/domain/nodes/nodeImportance";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type NodeMergeFailureReason =
  | "too-few-nodes"
  | "node-missing"
  | "node-hidden"
  | "primary-missing"
  | "different-parents"
  | "invalid-structure"
  | "placement-failed"
  // 確定時の再計画が、プレビューで見せた計画と違う（useNodes.mergeNodes が返す）
  | "plan-changed";

export type NodeMergePlan =
  | {
    ok: true;
    survivorId: number;
    // 配列順
    absorbedIds: number[];
    label: string;
    importance: NodeImportance;
    illustration: string | undefined;
    illustrationFrom: "primary" | "absorbed" | "none";
    // illustrationFrom が "absorbed" のときだけ、引き継ぐ元のノードの ID
    illustrationSourceId: number | null;
    // 統合で失われるイラストの件数（引き継ぐ 1 件を除く）
    discardedIllustrationCount: number;
    // 吸収されるノードの直下の子で、残すノードへ付け替えるものの件数
    movedChildCount: number;
  }
  | { ok: false; reason: NodeMergeFailureReason };

export type NodeMergeResult =
  | { ok: true; nodes: Node[]; survivorId: number; absorbedIds: number[] }
  | { ok: false; reason: NodeMergeFailureReason };

// useNodes.mergeNodes の戻り値
export type MergeNodesResult =
  | { ok: true; survivorId: number; absorbedCount: number }
  | { ok: false; reason: NodeMergeFailureReason };

function failed(reason: NodeMergeFailureReason): { ok: false; reason: NodeMergeFailureReason } {
  return { ok: false, reason };
}

// 対象の個数・存在・可視・主選択・構造・親の一致を、この順に検査して統合の計画を作る（配列は変えない）。
// 並びは配列順で、ids の順序には依存しない
export function planNodeMerge(
  nodes: readonly Node[],
  ids: readonly number[],
  primaryId: number | null,
  joiner: string,
  visibleNodeIds: ReadonlySet<number>,
): NodeMergePlan {
  const idSet = new Set(ids);
  if (idSet.size < 2) return failed("too-few-nodes");
  const existingIds = new Set(nodes.map((node) => node.id));
  for (const id of idSet) {
    if (!existingIds.has(id)) return failed("node-missing");
  }
  for (const id of idSet) {
    if (!visibleNodeIds.has(id)) return failed("node-hidden");
  }
  if (primaryId === null || !idSet.has(primaryId)) return failed("primary-missing");
  if (hasInvalidNodeGeometry(nodes)) return failed("placement-failed");
  if (indexNodeForest(nodes) === null) return failed("invalid-structure");

  const selected = nodes.filter((node) => idSet.has(node.id));
  const survivor = selected.find((node) => node.id === primaryId);
  if (survivor === undefined) return failed("primary-missing");
  if (selected.some((node) => node.parentId !== survivor.parentId)) return failed("different-parents");

  const absorbed = selected.filter((node) => node.id !== primaryId);
  const absorbedIdSet = new Set(absorbed.map((node) => node.id));
  const sourceOfAbsorbedIllustration = absorbed.find((node) => node.illustration !== undefined);
  const illustrationCount = selected.filter((node) => node.illustration !== undefined).length;

  let illustrationFrom: "primary" | "absorbed" | "none" = "none";
  let illustration: string | undefined;
  let illustrationSourceId: number | null = null;
  if (survivor.illustration !== undefined) {
    illustrationFrom = "primary";
    illustration = survivor.illustration;
  } else if (sourceOfAbsorbedIllustration !== undefined) {
    illustrationFrom = "absorbed";
    illustration = sourceOfAbsorbedIllustration.illustration;
    illustrationSourceId = sourceOfAbsorbedIllustration.id;
  }

  return {
    ok: true,
    survivorId: survivor.id,
    absorbedIds: absorbed.map((node) => node.id),
    // 空文字のラベルを除いて連結する。前後の空白は削らない
    label: selected.map((node) => node.label).filter((label) => label !== "").join(joiner),
    importance: maxNodeImportance(selected.map((node) => node.importance)),
    illustration,
    illustrationFrom,
    illustrationSourceId,
    discardedIllustrationCount: Math.max(0, illustrationCount - 1),
    movedChildCount: nodes.filter((node) => node.parentId !== null && absorbedIdSet.has(node.parentId)).length,
  };
}

// 確定時の再計画とプレビューの計画が同じか（残すノード・吸収されるノードの順・ラベル・イラストの引き継ぎ元で比べる）。
// 失敗した計画は同じとみなさない
export function isSameNodeMergePlan(a: NodeMergePlan, b: NodeMergePlan): boolean {
  if (!a.ok || !b.ok) return false;
  return a.survivorId === b.survivorId
    && a.label === b.label
    && a.illustrationSourceId === b.illustrationSourceId
    && a.absorbedIds.length === b.absorbedIds.length
    && a.absorbedIds.every((id, index) => id === b.absorbedIds[index]);
}

// 残すノードの属性を計画どおりに更新する。位置と大きさは変えない（イラストを引き継ぐときだけ、
// attachIllustration と同じ規則で高さをイラスト付きの高さにする）
function applyPlanToSurvivor(survivor: Node, plan: Extract<NodeMergePlan, { ok: true }>): Node {
  const updated: Node = { ...survivor, label: plan.label, importance: plan.importance };
  if (plan.illustrationFrom !== "absorbed" || plan.illustration === undefined) return updated;
  return { ...updated, illustration: plan.illustration, height: ILLUSTRATED_NODE_HEIGHT };
}

// 主選択を残し、ほかを配列から消す。吸収されるノードの直下の子は、残すノードの直下の子のうち配列順で最後のものの
// 直後（子が無ければ残すノードの直後）へ、吸収されるノードの配列順・各ノード内の元の相対順で付け替える。
// 子孫は動かさず、座標も変えない（自動配置の再レイアウトは applyTreeChange に任せる）
export function mergeNodes(
  nodes: readonly Node[],
  ids: readonly number[],
  primaryId: number | null,
  joiner: string,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): NodeMergeResult {
  const plan = planNodeMerge(nodes, ids, primaryId, joiner, visibleNodeIds);
  if (!plan.ok) return plan;
  const survivor = nodes.find((node) => node.id === plan.survivorId);
  if (survivor === undefined) return failed("primary-missing");

  const absorbedIdSet = new Set(plan.absorbedIds);
  const movedChildren: Node[] = [];
  for (const absorbedId of plan.absorbedIds) {
    for (const node of nodes) {
      if (node.parentId === absorbedId) movedChildren.push({ ...node, parentId: plan.survivorId });
    }
  }
  const movedChildIds = new Set(movedChildren.map((node) => node.id));

  const remaining = nodes
    .filter((node) => !absorbedIdSet.has(node.id) && !movedChildIds.has(node.id))
    .map((node) => (node.id === plan.survivorId ? applyPlanToSurvivor(survivor, plan) : node));
  let anchorIndex = remaining.findIndex((node) => node.id === plan.survivorId);
  remaining.forEach((node, index) => {
    if (node.parentId === plan.survivorId) anchorIndex = index;
  });
  const next = [...remaining.slice(0, anchorIndex + 1), ...movedChildren, ...remaining.slice(anchorIndex + 1)];

  if (mode === "auto") {
    // 先頭のルート（自動配置の列の基準）が吸収されて別のノードに変わるときだけ、旧先頭の座標を新しい先頭へ写す
    const previousRoot = nodes.find((node) => node.parentId === null);
    const nextRootIndex = next.findIndex((node) => node.parentId === null);
    if (previousRoot !== undefined && nextRootIndex !== -1 && next[nextRootIndex].id !== previousRoot.id) {
      next[nextRootIndex] = { ...next[nextRootIndex], x: previousRoot.x, y: previousRoot.y };
    }
  }
  return { ok: true, nodes: next, survivorId: plan.survivorId, absorbedIds: plan.absorbedIds };
}
```

`client/src/domain/nodes/nodeMergeMessages.ts`:

```typescript
import type { NodeMergeFailureReason } from "@/domain/nodes/nodeMerge";
import type { OperationNotice } from "@/types/operationNotice";

// 統合が失敗した理由を、利用者向けの通知にする。ダイアログの状態文言とエラー表示も同じ文言を使う
export function formatNodeMergeFailureNotice(reason: NodeMergeFailureReason): OperationNotice {
  switch (reason) {
    case "node-missing":
    case "node-hidden":
    case "invalid-structure":
      return { kind: "error", message: "統合できるノードが見つかりません。" };
    case "too-few-nodes":
      return { kind: "error", message: "2 つ以上のノードを選択してください。" };
    case "primary-missing":
      return { kind: "error", message: "主選択のノードがありません。" };
    case "different-parents":
      return { kind: "error", message: "同じ親の兄弟のノードだけを統合できます。" };
    case "plan-changed":
      return { kind: "error", message: "統合の内容が変わりました。もう一度確認してください。" };
    case "placement-failed":
      return { kind: "error", message: "ノードを統合できませんでした。" };
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeMerge.test.ts src/domain/nodes/__tests__/nodeMergeMessages.test.ts && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし。子の差し込み位置のテストが落ちたら、期待値ではなく `mergeNodes` の差し込み位置（`remaining` から吸収されるノードと付け替える子を除いた配列で、残すノードの直下の子の最後の直後）を見直す（設計書 §3.3、L-457 / L-472 が正）。

---

### Task 4: フック `useNodes.splitNode` / `mergeNodes`

**Files:**
- Modify: `client/src/hooks/useNodes.ts`（import、戻り値の型、`insertParentNode` の後ろに関数、return）
- Test: `client/src/hooks/__tests__/useNodesSplitMerge.test.ts`（新規）

**Interfaces:**
- Consumes: Task 2 の `planNodeSplit`・`isSameNodeSplitPlan`・`splitNode`（`computeNodeSplit` として import）・`NodeSplitPlan`・`SplitNodeResult`、Task 3 の `planNodeMerge`・`isSameNodeMergePlan`・`mergeNodes`（`computeNodeMerge` として import）・`NodeMergePlan`・`MergeNodesResult`、既存の `applyTreeChangeWithOutcome`・`nodeIdAllocator.nextAvailableIds`
- Produces: `useNodes()` の戻り値に
  - `splitNode: (nodeId: number, separator: string, visibleNodeIds: ReadonlySet<number>, expected: NodeSplitPlan) => SplitNodeResult`
  - `mergeNodes: (ids: readonly number[], primaryId: number | null, joiner: string, visibleNodeIds: ReadonlySet<number>, expected: NodeMergePlan) => MergeNodesResult`

- [ ] **Step 1: 失敗するテストを書く**

`client/src/hooks/__tests__/useNodesSplitMerge.test.ts`（`useNodesParentInsertion.test.ts` と同じく `layoutNodeForest` を `jest.fn` で包み、自動配置の失敗を作る。採番のテストは `Date.now` を固定し、何回目の採番かを ID から読む。統合の成功のテストは、2・3・4 を選択し、統合の対象外の 4 も選択に含めた状態で `mergeNodes([2, 3], 3, …)` を呼び、成功後の `selectedNodeIds` が `[3]` だけで 4 が外れていることを期待する。`useNodes.mergeNodes` の `selectOnly` を消すと、このテストが落ちる）:

```typescript
import { act, renderHook } from "@testing-library/react";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { mergeNodes as computeNodeMerge, planNodeMerge, type MergeNodesResult } from "@/domain/nodes/nodeMerge";
import { planNodeSplit, splitNode as computeNodeSplit, type SplitNodeResult } from "@/domain/nodes/nodeSplit";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

jest.mock("@/domain/nodes/nodeAutoLayout", () => {
  const actual = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
    "@/domain/nodes/nodeAutoLayout",
  );
  return {
    ...actual,
    layoutNodeForest: jest.fn(actual.layoutNodeForest),
  };
});

type Hook = ReturnType<typeof useNodes>;

function node(id: number, parentId: number | null, label: string, x: number, y: number, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label, x, y, ...overrides });
}

// 1: 計画（根）、2: 分割できるラベル（重要度 high）、3: 下の兄弟、4: 2 の子
function splitMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      node(1, null, "計画", 0, 0),
      node(2, 1, "りんご、みかん、ぶどう", 220, 0, { importance: "high" }),
      node(3, 1, "下の兄弟", 220, 200),
      node(4, 2, "りんごの子", 440, 0),
    ],
  };
}

// 1: 根、2: りんご（低）、3: リンゴ（高）、4: バナナ、5: 2 の子
function mergeMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      node(1, null, "根", 0, 0),
      node(2, 1, "りんご", 220, 0, { importance: "low" }),
      node(3, 1, "リンゴ", 220, 100, { importance: "high" }),
      node(4, 1, "バナナ", 220, 200),
      node(5, 2, "りんごの子", 440, 0),
    ],
  };
}

const ALL = new Set([1, 2, 3, 4, 5]);

function renderNodes(initial: NodeMapState) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  jest.mocked(layoutNodeForest).mockClear();
  return view;
}

function ids(nodes: readonly Node[]): number[] {
  return nodes.map((item) => item.id);
}

function split(
  current: () => Hook,
  nodeId: number,
  separator: string,
  visible: ReadonlySet<number> = ALL,
): SplitNodeResult {
  let outcome!: SplitNodeResult;
  act(() => {
    outcome = current().splitNode(nodeId, separator, visible, planNodeSplit(current().nodes, nodeId, separator, visible));
  });
  return outcome;
}

function merge(
  current: () => Hook,
  selectedIds: readonly number[],
  primaryId: number | null,
  joiner = " ",
  visible: ReadonlySet<number> = ALL,
): MergeNodesResult {
  let outcome!: MergeNodesResult;
  act(() => {
    outcome = current().mergeNodes(
      selectedIds,
      primaryId,
      joiner,
      visible,
      planNodeMerge(current().nodes, selectedIds, primaryId, joiner, visible),
    );
  });
  return outcome;
}

afterEach(() => {
  jest.mocked(layoutNodeForest).mockClear();
});

describe("useNodes の splitNode", () => {
  it("手動配置で断片を元のノードの直後の兄弟にし、選択と documentRevision を変えない", () => {
    const { result } = renderNodes(splitMap());
    act(() => result.current.selectNode(3));
    const revision = result.current.documentRevision;

    const outcome = split(() => result.current, 2, "、");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const [first, second] = outcome.insertedIds;
    expect(ids(result.current.nodes)).toEqual([1, 2, first, second, 3, 4]);
    expect(result.current.nodes.map((item) => item.label)).toEqual(["計画", "りんご", "みかん", "ぶどう", "下の兄弟", "りんごの子"]);
    // 同じ親 1 の兄弟（2 と 3）の最も下の下端 260 の下へ、断片の順に積む
    expect(result.current.nodes.find((item) => item.id === first)).toMatchObject({
      parentId: 1, x: 220, y: 300, importance: "high", width: 100, height: 60,
    });
    expect(result.current.nodes.find((item) => item.id === second)).toMatchObject({ parentId: 1, x: 220, y: 400 });
    expect(result.current.selectedNodeId).toBe(3);
    expect(result.current.documentRevision).toBe(revision);
  });

  it("表示されていない兄弟も含めた全体の配列を基準に座標を決める（L-460）", () => {
    const { result } = renderNodes(splitMap());

    // 最も下の兄弟 3（下端 260）と 2 の子 4 を、表示されていないことにする
    const outcome = split(() => result.current, 2, "、", new Set([1, 2]));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const [first, second] = outcome.insertedIds;
    expect(result.current.nodes.find((item) => item.id === first)).toMatchObject({ y: 300 });
    expect(result.current.nodes.find((item) => item.id === second)).toMatchObject({ y: 400 });
  });

  it("1 回の Undo で戻り、Redo で分割後に戻る", () => {
    const { result } = renderNodes(splitMap());
    split(() => result.current, 2, "、");
    const splitNodes = result.current.nodes;

    let undone = false;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(result.current.nodes).toEqual(splitMap().nodes);
    expect(result.current.canUndo).toBe(false);

    act(() => { result.current.redo(); });
    expect(result.current.nodes).toEqual(splitNodes);
  });

  it("自動配置では全体を再レイアウトする", () => {
    const { result } = renderNodes(splitMap("auto"));
    const before = result.current.nodes;

    const outcome = split(() => result.current, 2, "、");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const candidate = computeNodeSplit(before, 2, "、", outcome.insertedIds, ALL);
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;
    expect(result.current.nodes).toEqual(layoutNodeForest(candidate.nodes));
  });

  describe("失敗では何も変えず、履歴も積まない", () => {
    it.each<[string, NodeMapState, number, string, ReadonlySet<number>, SplitNodeResult]>([
      ["対象が無い", splitMap(), 99, "、", ALL, { ok: false, reason: "node-missing" }],
      ["対象が表示されていない", splitMap(), 2, "、", new Set([1, 3, 4]), { ok: false, reason: "node-hidden" }],
      ["区切り文字が空", splitMap(), 2, "", ALL, { ok: false, reason: "separator-empty" }],
      ["2 つ以上に分けられない", splitMap(), 3, "、", ALL, { ok: false, reason: "not-splittable" }],
      [
        "構造が不正",
        { layoutMode: "manual", nodes: [node(1, 99, "a、b", 0, 0)] },
        1,
        "、",
        new Set([1]),
        { ok: false, reason: "invalid-structure" },
      ],
    ])("%s", (_name, map, nodeId, separator, visible, expected) => {
      const { result } = renderNodes(map);
      act(() => result.current.selectNode(1));
      const before = result.current;

      // 計画が失敗するときの expected は、失敗の計画をそのまま渡す（フックは再計画の失敗を返す）
      let outcome!: SplitNodeResult;
      act(() => {
        outcome = result.current.splitNode(nodeId, separator, visible, planNodeSplit(before.nodes, nodeId, separator, visible));
      });

      expect(outcome).toEqual(expected);
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.selectedNodeId).toBe(1);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.documentRevision).toBe(before.documentRevision);
    });

    it("確認の時点の計画と最新の計画が違えば plan-changed（対象のラベルが確認の後に変わった場合）", () => {
      const { result } = renderNodes(splitMap());
      const shown = planNodeSplit(result.current.nodes, 2, "、", ALL);
      act(() => result.current.updateNodeLabel(2, "りんご、みかん"));
      const before = result.current;

      let outcome!: SplitNodeResult;
      act(() => { outcome = result.current.splitNode(2, "、", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("確認の時点の計画が失敗した計画なら plan-changed", () => {
      const { result } = renderNodes(splitMap());
      const before = result.current;

      let outcome!: SplitNodeResult;
      act(() => {
        outcome = result.current.splitNode(2, "、", ALL, { ok: false, reason: "not-splittable" });
      });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("自動配置の失敗は placement-failed", () => {
      const { result } = renderNodes(splitMap("auto"));
      const before = result.current;
      jest.mocked(layoutNodeForest).mockImplementationOnce(() => null);

      const outcome = split(() => result.current, 2, "、");

      expect(outcome).toEqual({ ok: false, reason: "placement-failed" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(before.canUndo);
    });
  });

  describe("採番", () => {
    let dateNow: jest.SpyInstance<number, []>;

    beforeEach(() => {
      // 採番は Date.now を基準にした単調増加。固定すると、何回目の採番かが ID から分かる
      dateNow = jest.spyOn(Date, "now").mockReturnValue(5000);
    });

    afterEach(() => {
      dateNow.mockRestore();
    });

    it("計画の失敗では採番が進まない", () => {
      const { result } = renderNodes(splitMap());

      expect(split(() => result.current, 2, "")).toEqual({ ok: false, reason: "separator-empty" });
      expect(split(() => result.current, 3, "、")).toEqual({ ok: false, reason: "not-splittable" });
      const outcome = split(() => result.current, 2, "、");

      expect(outcome).toEqual({ ok: true, insertedIds: [5000, 5001] });
    });

    it("計画が通った後の自動配置の失敗では採番だけが進み、欠番が出る", () => {
      const { result } = renderNodes(splitMap("auto"));
      jest.mocked(layoutNodeForest).mockImplementationOnce(() => null);

      expect(split(() => result.current, 2, "、")).toEqual({ ok: false, reason: "placement-failed" });
      const outcome = split(() => result.current, 2, "、");

      expect(outcome).toEqual({ ok: true, insertedIds: [5002, 5003] });
    });

    it("Undo で消えたノードの ID も、続けて分割するときに再利用しない", () => {
      const { result } = renderNodes(splitMap());
      expect(split(() => result.current, 2, "、")).toEqual({ ok: true, insertedIds: [5000, 5001] });
      act(() => { result.current.undo(); });

      expect(split(() => result.current, 2, "、")).toEqual({ ok: true, insertedIds: [5002, 5003] });
    });
  });
});

describe("useNodes の mergeNodes", () => {
  it("手動配置で主選択を残し、子を付け替え、選択を残したノードだけにする（統合の対象外で選択に残っていたノードも外す）。documentRevision は変えない", () => {
    const { result } = renderNodes(mergeMap());
    // 2・3・4 を選択している。統合の対象は 2・3 だけで、4 は統合の対象外のまま選択に残っている
    act(() => {
      result.current.selectNode(2);
      result.current.toggleNodeSelection(3);
      result.current.toggleNodeSelection(4);
    });
    expect(result.current.selectedNodeIds).toEqual([2, 3, 4]);
    expect(result.current.selectedNodeId).toBe(4);
    const revision = result.current.documentRevision;

    const outcome = merge(() => result.current, [2, 3], 3);

    expect(outcome).toEqual({ ok: true, survivorId: 3, absorbedCount: 1 });
    expect(ids(result.current.nodes)).toEqual([1, 3, 5, 4]);
    expect(result.current.nodes.find((item) => item.id === 3)).toMatchObject({
      label: "りんご リンゴ", importance: "high", x: 220, y: 100,
    });
    expect(result.current.nodes.find((item) => item.id === 5)).toMatchObject({ parentId: 3, x: 440, y: 0 });
    expect(result.current.selectedNodeId).toBe(3);
    expect(result.current.selectedNodeIds).toEqual([3]);
    expect(result.current.documentRevision).toBe(revision);
  });

  it("表示されていない子も付け替える（L-460）", () => {
    const { result } = renderNodes(mergeMap());

    // 2 の子 5 を、表示されていないことにする
    const outcome = merge(() => result.current, [2, 3], 3, " ", new Set([1, 2, 3, 4]));

    expect(outcome).toEqual({ ok: true, survivorId: 3, absorbedCount: 1 });
    expect(ids(result.current.nodes)).toEqual([1, 3, 5, 4]);
    expect(result.current.nodes.find((item) => item.id === 5)).toMatchObject({ parentId: 3 });
  });

  it("1 回の Undo で戻り（選択は既存どおり解除される）、Redo で統合後に戻る", () => {
    const { result } = renderNodes(mergeMap());
    merge(() => result.current, [2, 3], 3);
    const mergedNodes = result.current.nodes;

    let undone = false;
    act(() => { undone = result.current.undo(); });
    expect(undone).toBe(true);
    expect(result.current.nodes).toEqual(mergeMap().nodes);
    expect(result.current.selectedNodeId).toBeNull();
    expect(result.current.canUndo).toBe(false);

    act(() => { result.current.redo(); });
    expect(result.current.nodes).toEqual(mergedNodes);
  });

  it("自動配置では、先頭のルートの座標の引き継ぎの後に全体を再レイアウトする", () => {
    const { result } = renderNodes({
      layoutMode: "auto",
      nodes: [node(1, null, "根 A", 30, 40), node(2, null, "根 B", 300, 400), node(3, 2, "B の子", 500, 500)],
    });
    const before = result.current.nodes;
    const visible = new Set([1, 2, 3]);

    const outcome = merge(() => result.current, [1, 2], 2, " ", visible);

    expect(outcome.ok).toBe(true);
    const candidate = computeNodeMerge(before, [1, 2], 2, " ", visible, "auto");
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;
    expect(result.current.nodes).toEqual(layoutNodeForest(candidate.nodes));
    expect(result.current.nodes[0]).toMatchObject({ id: 2, x: 30, y: 40 });
  });

  describe("失敗では何も変えず、選択も履歴も変えない", () => {
    it.each<[string, readonly number[], number | null, ReadonlySet<number>, MergeNodesResult]>([
      ["選択が 1 件", [2], 2, ALL, { ok: false, reason: "too-few-nodes" }],
      ["対象が無い", [2, 99], 2, ALL, { ok: false, reason: "node-missing" }],
      ["対象が表示されていない", [2, 3], 3, new Set([1, 2, 4, 5]), { ok: false, reason: "node-hidden" }],
      ["主選択が選択に含まれない", [2, 3], 4, ALL, { ok: false, reason: "primary-missing" }],
      ["主選択が無い", [2, 3], null, ALL, { ok: false, reason: "primary-missing" }],
      ["親が違う", [2, 5], 2, ALL, { ok: false, reason: "different-parents" }],
    ])("%s", (_name, selectedIds, primaryId, visible, expected) => {
      const { result } = renderNodes(mergeMap());
      act(() => result.current.selectNode(4));
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => {
        outcome = result.current.mergeNodes(
          selectedIds,
          primaryId,
          " ",
          visible,
          planNodeMerge(before.nodes, selectedIds, primaryId, " ", visible),
        );
      });

      expect(outcome).toEqual(expected);
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.selectedNodeId).toBe(4);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.documentRevision).toBe(before.documentRevision);
    });

    it("確認の時点の計画と最新の計画が違えば plan-changed（確認の後にラベルが変わった場合）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, " ", ALL);
      act(() => result.current.updateNodeLabel(2, "ミカン"));
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("区切り文字だけが確認の時点と違うときも plan-changed（ラベルが違う）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, "・", ALL);
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });

    it("自動配置の失敗は placement-failed で、選択も変えない", () => {
      const { result } = renderNodes(mergeMap("auto"));
      act(() => result.current.selectNode(4));
      const before = result.current;
      jest.mocked(layoutNodeForest).mockImplementationOnce(() => null);

      const outcome = merge(() => result.current, [2, 3], 3);

      expect(outcome).toEqual({ ok: false, reason: "placement-failed" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.selectedNodeId).toBe(4);
      expect(result.current.canUndo).toBe(before.canUndo);
    });
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodesSplitMerge.test.ts`
Expected: FAIL（`splitNode is not a function` / `mergeNodes is not a function`）

- [ ] **Step 3: 実装する**

`client/src/hooks/useNodes.ts`（差分。ほかは変えない。`computeNodeSplit` / `computeNodeMerge` は、フックの `splitNode` / `mergeNodes` と名前が重ならないよう、既存の `computeParentInsertion` と同じ別名で import する）:

```diff
--- a/client/src/hooks/useNodes.ts
+++ b/client/src/hooks/useNodes.ts
@@ -44,6 +44,20 @@
 import { applyTreeChangeWithOutcome } from "@/hooks/treeChangeOutcome";
 import { insertParentNode as computeParentInsertion, type InsertParentNodeResult } from "@/domain/nodes/nodeParentInsertion";
 import { replaceNodeImportance, replaceNodesImportance } from "@/domain/nodes/nodeImportanceUpdate";
+import {
+  isSameNodeMergePlan,
+  mergeNodes as computeNodeMerge,
+  planNodeMerge,
+  type MergeNodesResult,
+  type NodeMergePlan,
+} from "@/domain/nodes/nodeMerge";
+import {
+  isSameNodeSplitPlan,
+  planNodeSplit,
+  splitNode as computeNodeSplit,
+  type NodeSplitPlan,
+  type SplitNodeResult,
+} from "@/domain/nodes/nodeSplit";
 import { replaceNodeLabels } from "@/domain/nodes/nodeLabelUpdate";
 import { clearNodeIllustration, replaceNodeIllustration } from "@/domain/nodes/nodeIllustrationUpdate";
 import {
@@ -125,6 +139,23 @@
     nodeId: number,
     visibleNodeIds: ReadonlySet<number>,
   ) => InsertParentNodeResult;
+  // 最新の状態から計画を作り直し、expected（確認の時点の計画）と違えば何も変えず plan-changed を返す。
+  // 成功時は applyTreeChange を1回だけ呼び、選択と documentRevision は変えない。新しい ID は計画が通った後に採番する
+  splitNode: (
+    nodeId: number,
+    separator: string,
+    visibleNodeIds: ReadonlySet<number>,
+    expected: NodeSplitPlan,
+  ) => SplitNodeResult;
+  // 最新の状態から計画を作り直し、expected と違えば何も変えず plan-changed を返す。
+  // 成功時は applyTreeChange を1回だけ呼び、残したノードだけを選択する。documentRevision は変えない
+  mergeNodes: (
+    ids: readonly number[],
+    primaryId: number | null,
+    joiner: string,
+    visibleNodeIds: ReadonlySet<number>,
+    expected: NodeMergePlan,
+  ) => MergeNodesResult;
   moveBranch: (rootId: number, parentId: number | null) => MoveBranchResult;
   deleteNode: (id: number) => void;
   deleteNodeOnly: (nodeId: number, visibleNodeIds: ReadonlySet<number>) => DeleteNodeOnlyResult;
@@ -418,6 +449,51 @@
     if (settled.ok) setSelection(selectOnly(settled.insertedId));
     return settled;
   }, [nodeIdAllocator, applyTreeChange]);
+
+  // 計画は描画時の配列ではなく、確定時点の最新の配列から作り直す。新しい ID は計画が通った後にまとめて 1 回採番し、
+  // 自動配置の失敗などで確定しなかった ID は欠番のままにする（allocator を巻き戻さない）。
+  // 分割は編集中の折りたたみや通知を保つため、選択と documentRevision を変えない
+  const splitNode = useCallback((
+    nodeId: number,
+    separator: string,
+    visibleNodeIds: ReadonlySet<number>,
+    expected: NodeSplitPlan,
+  ): SplitNodeResult => (
+    applyTreeChangeWithOutcome<SplitNodeResult>(applyTreeChange, (currentNodes) => {
+      const fresh = planNodeSplit(currentNodes, nodeId, separator, visibleNodeIds);
+      if (!fresh.ok) return { nodes: null, outcome: fresh };
+      if (!isSameNodeSplitPlan(fresh, expected)) return { nodes: null, outcome: { ok: false, reason: "plan-changed" } };
+
+      const newNodeIds = nodeIdAllocator.nextAvailableIds(currentNodes, fresh.fragments.length - 1);
+      const split = computeNodeSplit(currentNodes, nodeId, separator, newNodeIds, visibleNodeIds);
+      if (!split.ok) return { nodes: null, outcome: split };
+      return { nodes: split.nodes, outcome: { ok: true, insertedIds: split.insertedIds } };
+    })
+  ), [nodeIdAllocator, applyTreeChange]);
+
+  // 統合は成功したら、残したノードだけを選択する。選択に残った吸収されるノードの ID は、ここで置き換わる
+  const mergeNodes = useCallback((
+    ids: readonly number[],
+    primaryId: number | null,
+    joiner: string,
+    visibleNodeIds: ReadonlySet<number>,
+    expected: NodeMergePlan,
+  ): MergeNodesResult => {
+    const settled = applyTreeChangeWithOutcome<MergeNodesResult>(applyTreeChange, (currentNodes, mode) => {
+      const fresh = planNodeMerge(currentNodes, ids, primaryId, joiner, visibleNodeIds);
+      if (!fresh.ok) return { nodes: null, outcome: fresh };
+      if (!isSameNodeMergePlan(fresh, expected)) return { nodes: null, outcome: { ok: false, reason: "plan-changed" } };
+
+      const merged = computeNodeMerge(currentNodes, ids, primaryId, joiner, visibleNodeIds, mode);
+      if (!merged.ok) return { nodes: null, outcome: merged };
+      return {
+        nodes: merged.nodes,
+        outcome: { ok: true, survivorId: merged.survivorId, absorbedCount: merged.absorbedIds.length },
+      };
+    });
+    if (settled.ok) setSelection(selectOnly(settled.survivorId));
+    return settled;
+  }, [applyTreeChange]);
 
   const moveBranch = useCallback((rootId: number, parentId: number | null): MoveBranchResult => {
     const settled = applyTreeChangeWithOutcome<MoveBranchResult>(applyTreeChange, (currentNodes, mode) => {
@@ -491,6 +567,8 @@
     reorderSibling,
     changeNodeIndent,
     insertParentNode,
+    splitNode,
+    mergeNodes,
     moveBranch,
     deleteNode,
     deleteNodeOnly,
```

- [ ] **Step 4: GREEN と回帰を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodesSplitMerge.test.ts src/hooks/__tests__/useNodes.test.ts src/hooks/__tests__/useNodesParentInsertion.test.ts src/hooks/__tests__/useNodesOnlyDeletion.test.ts src/hooks/__tests__/useNodesHistory.test.ts src/hooks/__tests__/useNodesAutoLayout.test.ts && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし。`useNodes` の既存の関数（`insertParentNode` など）は変えていないので、既存のテストは変更なしで通る。

---

### Task 5: 共通部品（共有の文言と整形、ダイアログの状態遷移、区切り文字の入力、フォーカスの戻し）

**Files:**
- Create: `client/src/hooks/dialogPreviewText.ts`（`STALE_DIALOG_MESSAGE`・`formatPreviewLabel`。一括置換から移す）
- Modify: `client/src/hooks/labelReplaceDialogState.ts`、`client/src/hooks/labelReplacePreview.ts`、`client/src/components/layout/LabelReplaceDialog.tsx`（共有の置き場所への import へ直す。挙動は変えない）
- Modify（import の修正と、移した関数のテストの削除だけ）: `client/src/hooks/__tests__/labelReplaceDialogState.test.ts`、`client/src/hooks/__tests__/labelReplacePreview.test.ts`
- Create: `client/src/hooks/nodeSeparatorDialogState.ts`
- Create: `client/src/components/layout/NodeSeparatorField.tsx`
- Create: `client/src/hooks/useHeaderFocusReturn.ts`
- Test: `client/src/hooks/__tests__/dialogPreviewText.test.ts`、`client/src/hooks/__tests__/nodeSeparatorDialogState.test.ts`、`client/src/hooks/__tests__/useHeaderFocusReturn.test.tsx`、`client/src/components/layout/__tests__/NodeSeparatorField.test.tsx`（すべて新規）

**Interfaces:**
- Consumes: Task 1 の `NODE_SEPARATOR_PRESETS`・`NODE_SEPARATOR_CUSTOM_ID`・`NODE_SEPARATOR_CUSTOM_LABEL`・`SPLIT_DEFAULT_SEPARATOR`・`findSeparatorPresetId`・`resolveSeparator`
- Produces（`@/hooks/dialogPreviewText`）: `STALE_DIALOG_MESSAGE`（`マップが更新されました。閉じてから開き直してください。`）、`formatPreviewLabel(label: string): string`（空は `（空）`、空白だけは `（空白のみ）`、それ以外は入力どおり）
- Produces（`@/hooks/nodeSeparatorDialogState`）:
  - `type NodeSeparatorTarget = { kind: "split"; nodeId: number } | { kind: "merge"; ids: readonly number[]; primaryId: number | null }`
  - `type NodeSeparatorError = { sequence: number; message: string | null }`、`type NodeSeparatorFocusRequest = "separator" | "header" | null`
  - `type NodeSeparatorDialogState = { screen: "closed" | "open"; mapId: string; openedRevision: number; target: NodeSeparatorTarget | null; separatorPreset: string; customSeparator: string; focusRequest: NodeSeparatorFocusRequest; error: NodeSeparatorError }`
  - `createNodeSeparatorDialogState()`、`openNodeSeparatorDialog(state, { target, defaultSeparator, revision, mapId })`、`closeNodeSeparatorDialog(state)`（`focusRequest: "header"`）、`dismissNodeSeparatorDialog(state)`（外から閉じる。`focusRequest: null`）、`setNodeSeparatorPreset(state, presetId)`（知らない id は無視）、`setNodeSeparatorCustom(state, value)`、`failNodeSeparatorDialog(state, message)`、`consumeNodeSeparatorFocusRequest(state)`、`currentNodeSeparator(state): string`、`staleNodeSeparatorError(error): NodeSeparatorError`、`isNodeSeparatorDialogOpen(state, mapId): boolean`
- Produces（`@/components/layout/NodeSeparatorField`）: `NodeSeparatorField`。props `{ preset: string; customSeparator: string; selectRef: Ref<HTMLSelectElement>; onPresetChange: (presetId: string) => void; onCustomSeparatorChange: (value: string) => void; onCustomEnter: () => void }`
- Produces（`@/hooks/useHeaderFocusReturn`）: `useHeaderFocusReturn({ focusRequest: string | null; consumeFocusRequest: () => void; buttonRef: RefObject<HTMLButtonElement | null>; fallbackRef: RefObject<HTMLButtonElement | null> }): void`

- [ ] **Step 1: 失敗するテストを書く**

`client/src/hooks/__tests__/dialogPreviewText.test.ts`（一括置換から移す 2 つの挙動を、移し先で固定する）:

```typescript
import { STALE_DIALOG_MESSAGE, formatPreviewLabel } from "@/hooks/dialogPreviewText";

describe("STALE_DIALOG_MESSAGE", () => {
  it("マップが更新されたことと開き直しを促す固定の文言", () => {
    expect(STALE_DIALOG_MESSAGE).toBe("マップが更新されました。閉じてから開き直してください。");
  });
});

describe("formatPreviewLabel", () => {
  it("空文字は（空）、空白だけは（空白のみ）にし、それ以外は入力どおり返す", () => {
    expect(formatPreviewLabel("")).toBe("（空）");
    expect(formatPreviewLabel("  ")).toBe("（空白のみ）");
    expect(formatPreviewLabel(" 　\t")).toBe("（空白のみ）");
    expect(formatPreviewLabel(" a ")).toBe(" a ");
    expect(formatPreviewLabel("a  b")).toBe("a  b");
  });
});
```

`client/src/hooks/__tests__/nodeSeparatorDialogState.test.ts`:

```typescript
import { MERGE_DEFAULT_SEPARATOR, SPLIT_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
import {
  closeNodeSeparatorDialog,
  consumeNodeSeparatorFocusRequest,
  createNodeSeparatorDialogState,
  currentNodeSeparator,
  dismissNodeSeparatorDialog,
  failNodeSeparatorDialog,
  isNodeSeparatorDialogOpen,
  openNodeSeparatorDialog,
  setNodeSeparatorCustom,
  setNodeSeparatorPreset,
  staleNodeSeparatorError,
  type NodeSeparatorTarget,
} from "@/hooks/nodeSeparatorDialogState";

const splitTarget: NodeSeparatorTarget = { kind: "split", nodeId: 4 };
const mergeTarget: NodeSeparatorTarget = { kind: "merge", ids: [2, 5, 7], primaryId: 5 };

function openedSplit(mapId = "a") {
  return openNodeSeparatorDialog(createNodeSeparatorDialogState(), {
    target: splitTarget,
    defaultSeparator: SPLIT_DEFAULT_SEPARATOR,
    revision: 3,
    mapId,
  });
}

function openedMerge(mapId = "a") {
  return openNodeSeparatorDialog(createNodeSeparatorDialogState(), {
    target: mergeTarget,
    defaultSeparator: MERGE_DEFAULT_SEPARATOR,
    revision: 3,
    mapId,
  });
}

describe("nodeSeparatorDialogState", () => {
  it("分割で開くと、対象のノードと版を記録し、区切り文字を「、」にして、区切り文字へフォーカスを求める", () => {
    const state = openedSplit();

    expect(state).toMatchObject({
      screen: "open",
      mapId: "a",
      openedRevision: 3,
      target: { kind: "split", nodeId: 4 },
      separatorPreset: "ja-comma",
      focusRequest: "separator",
    });
    expect(currentNodeSeparator(state)).toBe("、");
  });

  it("統合で開くと、選択集合と主選択を記録し、区切り文字を半角スペースにする", () => {
    const state = openedMerge();

    expect(state.target).toEqual({ kind: "merge", ids: [2, 5, 7], primaryId: 5 });
    expect(state.separatorPreset).toBe("space");
    expect(currentNodeSeparator(state)).toBe(" ");
  });

  it("既定値がプリセットに無ければ「その他」にして、入力欄へその値を入れる", () => {
    const state = openNodeSeparatorDialog(createNodeSeparatorDialogState(), {
      target: splitTarget,
      defaultSeparator: "→",
      revision: 0,
      mapId: "a",
    });

    expect(state).toMatchObject({ separatorPreset: "custom", customSeparator: "→" });
    expect(currentNodeSeparator(state)).toBe("→");
  });

  it("開き直すと、前回のプリセットも「その他」の入力も持ち越さず既定値へ戻す", () => {
    const dirty = setNodeSeparatorCustom(setNodeSeparatorPreset(openedSplit(), "custom"), " | ");
    const reopened = openNodeSeparatorDialog(closeNodeSeparatorDialog(dirty), {
      target: splitTarget,
      defaultSeparator: SPLIT_DEFAULT_SEPARATOR,
      revision: 4,
      mapId: "a",
    });

    expect(reopened).toMatchObject({ separatorPreset: "ja-comma", customSeparator: "", openedRevision: 4 });
  });

  it("プリセットを選ぶと区切り文字が変わり、「その他」では入力欄の文字列になる（空のままなら空文字）", () => {
    const slash = setNodeSeparatorPreset(openedSplit(), "slash");
    expect(currentNodeSeparator(slash)).toBe("/");

    const custom = setNodeSeparatorPreset(slash, "custom");
    expect(currentNodeSeparator(custom)).toBe("");
    expect(currentNodeSeparator(setNodeSeparatorCustom(custom, " -> "))).toBe(" -> ");
  });

  it("知らないプリセットの id は無視して、状態をそのまま返す", () => {
    const state = openedSplit();

    expect(setNodeSeparatorPreset(state, "unknown")).toBe(state);
  });

  it("入力の変更はエラーを空にして sequence を進める", () => {
    const failed = failNodeSeparatorDialog(openedSplit(), "失敗");
    const changed = setNodeSeparatorPreset(failed, "comma");

    expect(failed.error.message).toBe("失敗");
    expect(changed.error).toEqual({ sequence: failed.error.sequence + 1, message: null });
    expect(setNodeSeparatorCustom(failed, "x").error).toEqual({ sequence: failed.error.sequence + 1, message: null });
  });

  it("閉じるとヘッダーへのフォーカスを求め、フォーカス要求は一度で消える", () => {
    const closed = closeNodeSeparatorDialog(openedSplit());

    expect(closed).toMatchObject({ screen: "closed", focusRequest: "header" });
    expect(consumeNodeSeparatorFocusRequest(closed).focusRequest).toBeNull();
    expect(consumeNodeSeparatorFocusRequest(consumeNodeSeparatorFocusRequest(closed)).focusRequest).toBeNull();
  });

  it("外から閉じる（dismiss）と閉じた状態になり、フォーカスは求めない", () => {
    expect(dismissNodeSeparatorDialog(openedMerge())).toMatchObject({ screen: "closed", focusRequest: null });
  });

  it("開いていても mapId が違えば開いていないとみなす（外から閉じた扱い）", () => {
    const state = openedSplit("a");

    expect(isNodeSeparatorDialogOpen(state, "a")).toBe(true);
    expect(isNodeSeparatorDialogOpen(state, "b")).toBe(false);
    expect(isNodeSeparatorDialogOpen(closeNodeSeparatorDialog(state), "a")).toBe(false);
  });

  it("stale のエラーは共有の固定の文言で、sequence を進める", () => {
    expect(staleNodeSeparatorError({ sequence: 2, message: null })).toEqual({
      sequence: 3,
      message: STALE_DIALOG_MESSAGE,
    });
  });
});
```

`client/src/hooks/__tests__/useHeaderFocusReturn.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useHeaderFocusReturn } from "@/hooks/useHeaderFocusReturn";

type HarnessProps = {
  focusRequest: string | null;
  buttonDisabled?: boolean;
  hasButton?: boolean;
  onConsume: () => void;
};

function Harness({ focusRequest, buttonDisabled = false, hasButton = true, onConsume }: HarnessProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fallbackRef = useRef<HTMLButtonElement>(null);
  useHeaderFocusReturn({ focusRequest, consumeFocusRequest: onConsume, buttonRef, fallbackRef });
  return (
    <>
      {hasButton && <button ref={buttonRef} disabled={buttonDisabled}>対象のボタン</button>}
      <button ref={fallbackRef}>戻り先のボタン</button>
    </>
  );
}

describe("useHeaderFocusReturn", () => {
  it("header の要求でヘッダーのボタンへフォーカスし、要求を消費する", () => {
    const onConsume = jest.fn();

    render(<Harness focusRequest="header" onConsume={onConsume} />);

    expect(screen.getByRole("button", { name: "対象のボタン" })).toHaveFocus();
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it("ボタンが無効なら、常に押せる戻り先のボタンへフォーカスする", () => {
    const onConsume = jest.fn();

    render(<Harness focusRequest="header" buttonDisabled onConsume={onConsume} />);

    expect(screen.getByRole("button", { name: "戻り先のボタン" })).toHaveFocus();
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it("ボタンが描画されていなければ、戻り先のボタンへフォーカスする", () => {
    render(<Harness focusRequest="header" hasButton={false} onConsume={jest.fn()} />);

    expect(screen.getByRole("button", { name: "戻り先のボタン" })).toHaveFocus();
  });

  it.each([null, "separator"])("要求が %s のときは、フォーカスを動かさず、要求も消費しない", (focusRequest) => {
    const onConsume = jest.fn();

    render(<Harness focusRequest={focusRequest} onConsume={onConsume} />);

    expect(document.body).toHaveFocus();
    expect(onConsume).not.toHaveBeenCalled();
  });

  it("要求が header に変わった描画でフォーカスする", () => {
    const onConsume = jest.fn();
    const { rerender } = render(<Harness focusRequest={null} onConsume={onConsume} />);

    rerender(<Harness focusRequest="header" onConsume={onConsume} />);

    expect(screen.getByRole("button", { name: "対象のボタン" })).toHaveFocus();
  });
});
```

`client/src/components/layout/__tests__/NodeSeparatorField.test.tsx`:

```typescript
import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeSeparatorField } from "@/components/layout/NodeSeparatorField";

type Props = Parameters<typeof NodeSeparatorField>[0];

function renderField(overrides: Partial<Props> = {}) {
  const props: Props = {
    preset: "ja-comma",
    customSeparator: "",
    selectRef: createRef<HTMLSelectElement>(),
    onPresetChange: jest.fn(),
    onCustomSeparatorChange: jest.fn(),
    onCustomEnter: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeSeparatorField {...props} />) };
}

describe("NodeSeparatorField", () => {
  it("可視のラベルつきのプルダウンに、プリセットと「その他」を順に並べる", () => {
    renderField();

    const select = screen.getByLabelText("区切り文字");
    expect(select).toHaveValue("ja-comma");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "、", ",", "/", "・", "半角スペース", "その他",
    ]);
  });

  it("選択中のプリセットを反映し、選択を通知する", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderField({ preset: "space" });
    expect(screen.getByLabelText("区切り文字")).toHaveValue("space");

    await user.selectOptions(screen.getByLabelText("区切り文字"), "slash");
    expect(props.onPresetChange).toHaveBeenCalledWith("slash");

    rerender(<NodeSeparatorField {...props} preset="custom" />);
    expect(screen.getByLabelText("区切り文字")).toHaveValue("custom");
  });

  it("selectRef をプルダウンへ渡す", () => {
    const selectRef = createRef<HTMLSelectElement>();

    renderField({ selectRef });

    expect(selectRef.current).toBe(screen.getByLabelText("区切り文字"));
  });

  it("「その他」の入力欄は、「その他」を選んだときだけ可視のラベルつきで出る", () => {
    const { props, rerender } = renderField({ preset: "comma" });
    expect(screen.queryByLabelText("その他の区切り文字")).toBeNull();

    rerender(<NodeSeparatorField {...props} preset="custom" customSeparator=" -> " />);
    expect(screen.getByLabelText("その他の区切り文字")).toHaveValue(" -> ");
  });

  it("「その他」の入力の変更を通知する（前後の空白もそのまま）", () => {
    const { props } = renderField({ preset: "custom" });

    fireEvent.change(screen.getByLabelText("その他の区切り文字"), { target: { value: " | " } });

    expect(props.onCustomSeparatorChange).toHaveBeenCalledWith(" | ");
  });

  describe("「その他」の入力欄の Enter", () => {
    it("IME 変換中でもリピートでもない Enter で onCustomEnter を呼び、既定動作を止める", () => {
      const { props } = renderField({ preset: "custom" });

      const notPrevented = fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });

      expect(props.onCustomEnter).toHaveBeenCalledTimes(1);
      expect(notPrevented).toBe(false);
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
      ["リピート", { repeat: true }],
    ])("%sのときは呼ばない", (_name, init) => {
      const { props } = renderField({ preset: "custom" });

      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter", ...init });

      expect(props.onCustomEnter).not.toHaveBeenCalled();
    });

    it("Enter 以外のキーでは呼ばない", () => {
      const { props } = renderField({ preset: "custom" });

      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "a" });

      expect(props.onCustomEnter).not.toHaveBeenCalled();
    });
  });

  it("プルダウンの Enter では onCustomEnter を呼ばない（プルダウンでは確定しない）", () => {
    const { props } = renderField({ preset: "custom" });

    fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Enter" });

    expect(props.onCustomEnter).not.toHaveBeenCalled();
  });
});
```

既存のテストの import を、移し先へ直す（期待値は変えない。`formatLabelReplacePreviewLabel` のテストは、`dialogPreviewText.test.ts` へ移したので削除する）:

```diff
--- a/client/src/hooks/__tests__/labelReplaceDialogState.test.ts
+++ b/client/src/hooks/__tests__/labelReplaceDialogState.test.ts
@@ -1,5 +1,5 @@
+import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
 import {
-  STALE_LABEL_REPLACE_MESSAGE,
   closeLabelReplaceDialog,
   consumeLabelReplaceFocusRequest,
   createLabelReplaceDialogState,
@@ -110,8 +110,8 @@
   it("stale のエラーは固定の文言で、sequence を進める", () => {
     const error = staleLabelReplaceError({ sequence: 2, message: null });
 
-    expect(error).toEqual({ sequence: 3, message: STALE_LABEL_REPLACE_MESSAGE });
-    expect(STALE_LABEL_REPLACE_MESSAGE).toBe("マップが更新されました。閉じてから開き直してください。");
+    expect(error).toEqual({ sequence: 3, message: STALE_DIALOG_MESSAGE });
+    expect(STALE_DIALOG_MESSAGE).toBe("マップが更新されました。閉じてから開き直してください。");
   });
 
   it("範囲が「選択のみ」なら開いた時点の選択集合、そうでなければ全ノード（null）を対象にする", () => {
```

```diff
--- a/client/src/hooks/__tests__/labelReplacePreview.test.ts
+++ b/client/src/hooks/__tests__/labelReplacePreview.test.ts
@@ -1,7 +1,6 @@
-import { STALE_LABEL_REPLACE_MESSAGE } from "@/hooks/labelReplaceDialogState";
+import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
 import {
   describeLabelReplaceStatus,
-  formatLabelReplacePreviewLabel,
   LABEL_REPLACE_PREVIEW_LIMIT,
   selectLabelReplacePreviewRows,
 } from "@/hooks/labelReplacePreview";
@@ -44,7 +43,7 @@
 
 describe("describeLabelReplaceStatus", () => {
   it("stale のときは、ほかの状態より先に更新を促す文言を返す", () => {
-    expect(describeLabelReplaceStatus({ stale: true, query: "a", matchedRowCount: 1, replaceCount: 1, emptiedCount: 0 })).toBe(STALE_LABEL_REPLACE_MESSAGE);
+    expect(describeLabelReplaceStatus({ stale: true, query: "a", matchedRowCount: 1, replaceCount: 1, emptiedCount: 0 })).toBe(STALE_DIALOG_MESSAGE);
   });
 
   it("検索語が空なら入力を求める", () => {
@@ -64,13 +63,3 @@
     expect(describeLabelReplaceStatus({ stale: false, query: "a", matchedRowCount: 3, replaceCount: 2, emptiedCount: 1 })).toBe("2件を置換します。1件は置換後に空になるため対象外です。");
   });
 });
-
-describe("formatLabelReplacePreviewLabel", () => {
-  it("空文字は（空）、空白だけは（空白のみ）にし、それ以外は入力どおり返す", () => {
-    expect(formatLabelReplacePreviewLabel("")).toBe("（空）");
-    expect(formatLabelReplacePreviewLabel("  ")).toBe("（空白のみ）");
-    expect(formatLabelReplacePreviewLabel(" \u3000\t")).toBe("（空白のみ）");
-    expect(formatLabelReplacePreviewLabel(" a ")).toBe(" a ");
-    expect(formatLabelReplacePreviewLabel("a  b")).toBe("a  b");
-  });
-});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/dialogPreviewText.test.ts src/hooks/__tests__/nodeSeparatorDialogState.test.ts src/hooks/__tests__/useHeaderFocusReturn.test.tsx src/components/layout/__tests__/NodeSeparatorField.test.tsx src/hooks/__tests__/labelReplaceDialogState.test.ts src/hooks/__tests__/labelReplacePreview.test.ts`
Expected: FAIL（モジュールが無い。`labelReplace*` の 2 つのテストも `@/hooks/dialogPreviewText` が無くて落ちる）

- [ ] **Step 3: 共有の文言と整形を移す**

`client/src/hooks/dialogPreviewText.ts`:

```typescript
// 一括置換・ノードの分割・ノードの統合のダイアログが共有する表示用の文言と整形

// 開いた後にマップが更新されたときの誤りの文言
export const STALE_DIALOG_MESSAGE = "マップが更新されました。閉じてから開き直してください。";

// プレビューに出すラベル。空文字や空白だけのラベルは空欄に見えるので、代わりの表示にする
export function formatPreviewLabel(label: string): string {
  if (label === "") return "（空）";
  if (label.trim() === "") return "（空白のみ）";
  return label;
}
```

一括置換側を、共有の置き場所を使うように直す（文言・戻り値・挙動は変えない。`STALE_LABEL_REPLACE_MESSAGE` と `formatLabelReplacePreviewLabel` は、ほかに使う箇所が無いことを `grep -rn "STALE_LABEL_REPLACE_MESSAGE\|formatLabelReplacePreviewLabel" client/src` で確かめてから消す）:

```diff
--- a/client/src/hooks/labelReplaceDialogState.ts
+++ b/client/src/hooks/labelReplaceDialogState.ts
@@ -1,3 +1,5 @@
+import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
+
 export type LabelReplaceError = { sequence: number; message: string | null };
 export type LabelReplaceFocusRequest = "query" | "header" | null;
 
@@ -13,8 +15,6 @@
   focusRequest: LabelReplaceFocusRequest;
   error: LabelReplaceError;
 };
-
-export const STALE_LABEL_REPLACE_MESSAGE = "マップが更新されました。閉じてから開き直してください。";
 
 function nextError(previous: LabelReplaceError, message: string | null): LabelReplaceError {
   return { sequence: previous.sequence + 1, message };
@@ -101,7 +101,7 @@
 
 // 開いた後に文書が変わったときに表示する誤り。状態には残さない
 export function staleLabelReplaceError(error: LabelReplaceError): LabelReplaceError {
-  return nextError(error, STALE_LABEL_REPLACE_MESSAGE);
+  return nextError(error, STALE_DIALOG_MESSAGE);
 }
 
 // 別のマップへ切り替わった後に古い状態が残っていても、開いていないものとして扱う（外から閉じた扱い。フォーカスは奪わない）
```

```diff
--- a/client/src/hooks/labelReplacePreview.ts
+++ b/client/src/hooks/labelReplacePreview.ts
@@ -1,5 +1,5 @@
 import type { LabelReplaceRow } from "@/domain/search/nodeLabelReplace";
-import { STALE_LABEL_REPLACE_MESSAGE } from "@/hooks/labelReplaceDialogState";
+import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
 
 export const LABEL_REPLACE_PREVIEW_LIMIT = 200;
 
@@ -24,13 +24,6 @@
   return { shown, hiddenReplaceCount };
 }
 
-// プレビューに出すラベル。空文字や空白だけのラベルは空欄に見えるので、代わりの表示にする
-export function formatLabelReplacePreviewLabel(label: string): string {
-  if (label === "") return "（空）";
-  if (label.trim() === "") return "（空白のみ）";
-  return label;
-}
-
 export type LabelReplaceStatusInput = {
   stale: boolean;
   query: string;
@@ -47,7 +40,7 @@
   replaceCount,
   emptiedCount,
 }: LabelReplaceStatusInput): string {
-  if (stale) return STALE_LABEL_REPLACE_MESSAGE;
+  if (stale) return STALE_DIALOG_MESSAGE;
   if (query === "") return "検索語を入力してください。";
   if (matchedRowCount === 0) return "一致するノードがありません。";
   if (replaceCount === 0) return "置換できるノードがありません。";
```

```diff
--- a/client/src/components/layout/LabelReplaceDialog.tsx
+++ b/client/src/components/layout/LabelReplaceDialog.tsx
@@ -8,7 +8,7 @@
 import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
 import type { LabelReplaceRow } from "@/domain/search/nodeLabelReplace";
 import type { LabelReplaceError, LabelReplaceFocusRequest } from "@/hooks/labelReplaceDialogState";
-import { formatLabelReplacePreviewLabel } from "@/hooks/labelReplacePreview";
+import { formatPreviewLabel } from "@/hooks/dialogPreviewText";
 
 type LabelReplaceDialogProps = {
   query: string;
@@ -147,9 +147,9 @@
             {previewRows.map((row) => (
               <li key={row.nodeId} className="flex flex-col gap-0.5 rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                 <span className="flex min-w-0 items-start gap-2">
-                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{formatLabelReplacePreviewLabel(row.before)}</span>
+                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{formatPreviewLabel(row.before)}</span>
                   <span aria-hidden="true" className="shrink-0">→</span>
-                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{formatLabelReplacePreviewLabel(row.after)}</span>
+                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{formatPreviewLabel(row.after)}</span>
                 </span>
                 {row.status === "emptied" && (
                   <span className="text-amber-700 dark:text-amber-300">置換後のラベルが空になるため置換しません。</span>
```

- [ ] **Step 4: ダイアログの状態遷移・区切り文字の入力・フォーカスの戻しを実装する**

`client/src/hooks/nodeSeparatorDialogState.ts`:

```typescript
import {
  NODE_SEPARATOR_CUSTOM_ID,
  NODE_SEPARATOR_PRESETS,
  SPLIT_DEFAULT_SEPARATOR,
  findSeparatorPresetId,
  resolveSeparator,
} from "@/domain/nodes/nodeSeparator";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";

// 分割は開いた時点の主選択の 1 ノード、統合は開いた時点の選択集合（配列順）と主選択
export type NodeSeparatorTarget =
  | { kind: "split"; nodeId: number }
  | { kind: "merge"; ids: readonly number[]; primaryId: number | null };

export type NodeSeparatorError = { sequence: number; message: string | null };
export type NodeSeparatorFocusRequest = "separator" | "header" | null;

export type NodeSeparatorDialogState = {
  screen: "closed" | "open";
  mapId: string;
  openedRevision: number;
  target: NodeSeparatorTarget | null;
  // プリセットの id、または NODE_SEPARATOR_CUSTOM_ID
  separatorPreset: string;
  customSeparator: string;
  focusRequest: NodeSeparatorFocusRequest;
  error: NodeSeparatorError;
};

function nextError(previous: NodeSeparatorError, message: string | null): NodeSeparatorError {
  return { sequence: previous.sequence + 1, message };
}

export function createNodeSeparatorDialogState(): NodeSeparatorDialogState {
  return {
    screen: "closed",
    mapId: "",
    openedRevision: 0,
    target: null,
    separatorPreset: findSeparatorPresetId(SPLIT_DEFAULT_SEPARATOR),
    customSeparator: "",
    focusRequest: null,
    error: { sequence: 0, message: null },
  };
}

// 開くたびに区切り文字を既定値へ戻す（前回の入力は持ち越さない）。既定値がプリセットに無ければ「その他」の入力にする
export function openNodeSeparatorDialog(
  state: NodeSeparatorDialogState,
  opened: { target: NodeSeparatorTarget; defaultSeparator: string; revision: number; mapId: string },
): NodeSeparatorDialogState {
  const separatorPreset = findSeparatorPresetId(opened.defaultSeparator);
  return {
    ...state,
    screen: "open",
    mapId: opened.mapId,
    openedRevision: opened.revision,
    target: opened.target,
    separatorPreset,
    customSeparator: separatorPreset === NODE_SEPARATOR_CUSTOM_ID ? opened.defaultSeparator : "",
    focusRequest: "separator",
    error: nextError(state.error, null),
  };
}

export function closeNodeSeparatorDialog(state: NodeSeparatorDialogState): NodeSeparatorDialogState {
  return { ...state, screen: "closed", focusRequest: "header" };
}

// マップの切り替えなど外から閉じるときは、ヘッダーのボタンへフォーカスを求めない（L-762）
export function dismissNodeSeparatorDialog(state: NodeSeparatorDialogState): NodeSeparatorDialogState {
  return { ...state, screen: "closed", focusRequest: null };
}

// 知らない id は無視する
export function setNodeSeparatorPreset(state: NodeSeparatorDialogState, presetId: string): NodeSeparatorDialogState {
  const known = presetId === NODE_SEPARATOR_CUSTOM_ID || NODE_SEPARATOR_PRESETS.some((preset) => preset.id === presetId);
  if (!known) return state;
  return { ...state, separatorPreset: presetId, error: nextError(state.error, null) };
}

export function setNodeSeparatorCustom(state: NodeSeparatorDialogState, customSeparator: string): NodeSeparatorDialogState {
  return { ...state, customSeparator, error: nextError(state.error, null) };
}

export function failNodeSeparatorDialog(state: NodeSeparatorDialogState, message: string): NodeSeparatorDialogState {
  return { ...state, error: nextError(state.error, message) };
}

export function consumeNodeSeparatorFocusRequest(state: NodeSeparatorDialogState): NodeSeparatorDialogState {
  return state.focusRequest === null ? state : { ...state, focusRequest: null };
}

// 現在の入力が表す区切り文字（プレビューと確定で同じ値を使う）
export function currentNodeSeparator(state: NodeSeparatorDialogState): string {
  return resolveSeparator(state.separatorPreset, state.customSeparator);
}

// 開いた後に文書が変わったときに表示する誤り。状態には残さない
export function staleNodeSeparatorError(error: NodeSeparatorError): NodeSeparatorError {
  return nextError(error, STALE_DIALOG_MESSAGE);
}

// 別のマップへ切り替わった後に古い状態が残っていても、開いていないものとして扱う（外から閉じた扱い。フォーカスは奪わない）
export function isNodeSeparatorDialogOpen(state: NodeSeparatorDialogState, mapId: string): boolean {
  return state.screen === "open" && state.mapId === mapId;
}
```

`client/src/components/layout/NodeSeparatorField.tsx`:

```typescript
"use client";

import { useId } from "react";
import type { KeyboardEvent, Ref } from "react";
import {
  NODE_SEPARATOR_CUSTOM_ID,
  NODE_SEPARATOR_CUSTOM_LABEL,
  NODE_SEPARATOR_PRESETS,
} from "@/domain/nodes/nodeSeparator";

type NodeSeparatorFieldProps = {
  // プリセットの id、または NODE_SEPARATOR_CUSTOM_ID
  preset: string;
  customSeparator: string;
  selectRef: Ref<HTMLSelectElement>;
  onPresetChange: (presetId: string) => void;
  onCustomSeparatorChange: (value: string) => void;
  // 「その他」の入力欄で、IME 変換中でもリピートでもない Enter を押したとき。確定できるかは呼び出し側が判定する
  onCustomEnter: () => void;
};

const fieldClassName = "w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900";

// 分割・統合のダイアログが共有する区切り文字の入力（プルダウン + 「その他」の入力。どちらも可視のラベルつき）
export function NodeSeparatorField({
  preset,
  customSeparator,
  selectRef,
  onPresetChange,
  onCustomSeparatorChange,
  onCustomEnter,
}: NodeSeparatorFieldProps) {
  const selectId = useId();
  const customId = useId();

  // プルダウンの Enter では確定しない（プレビューを見る前の確定を避ける）。確定は「その他」の入力欄とボタンに限る
  const handleCustomKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (!event.repeat) onCustomEnter();
  };

  return (
    <>
      <label htmlFor={selectId} className="text-sm">区切り文字</label>
      <select
        id={selectId}
        ref={selectRef}
        className={fieldClassName}
        value={preset}
        onChange={(event) => onPresetChange(event.target.value)}
      >
        {NODE_SEPARATOR_PRESETS.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
        <option value={NODE_SEPARATOR_CUSTOM_ID}>{NODE_SEPARATOR_CUSTOM_LABEL}</option>
      </select>
      {preset === NODE_SEPARATOR_CUSTOM_ID && (
        <>
          <label htmlFor={customId} className="text-sm">その他の区切り文字</label>
          <input
            id={customId}
            type="text"
            className={fieldClassName}
            value={customSeparator}
            onChange={(event) => onCustomSeparatorChange(event.target.value)}
            onKeyDown={handleCustomKeyDown}
          />
        </>
      )}
    </>
  );
}
```

`client/src/hooks/useHeaderFocusReturn.ts`:

```typescript
"use client";

import { useLayoutEffect, type RefObject } from "react";

type UseHeaderFocusReturnOptions = {
  // "header" のとき、ヘッダーのボタンへフォーカスを戻す。ほかの値・null では何もしない
  focusRequest: string | null;
  consumeFocusRequest: () => void;
  // ダイアログを開いたヘッダーのボタン
  buttonRef: RefObject<HTMLButtonElement | null>;
  // ボタンが無効・存在しないときの戻り先（常に押せるボタン）
  fallbackRef: RefObject<HTMLButtonElement | null>;
};

// ダイアログを閉じた描画の後に、ヘッダーのボタンへフォーカスを戻す（閉じる描画で根の inert が外れた後に当てる。L-155）。
// 確定でボタンが無効になったとき（統合の成功後など）は、常に押せるボタンへ送る
export function useHeaderFocusReturn({
  focusRequest,
  consumeFocusRequest,
  buttonRef,
  fallbackRef,
}: UseHeaderFocusReturnOptions): void {
  useLayoutEffect(() => {
    if (focusRequest !== "header") return;
    const button = buttonRef.current;
    const target = button === null || button.disabled ? fallbackRef.current : button;
    target?.focus();
    consumeFocusRequest();
  }, [focusRequest, consumeFocusRequest, buttonRef, fallbackRef]);
}
```

- [ ] **Step 5: GREEN と回帰を確認する**

Run: `cd client && npx jest src/hooks/__tests__/dialogPreviewText.test.ts src/hooks/__tests__/nodeSeparatorDialogState.test.ts src/hooks/__tests__/useHeaderFocusReturn.test.tsx src/components/layout/__tests__/NodeSeparatorField.test.tsx src/hooks/__tests__/labelReplaceDialogState.test.ts src/hooks/__tests__/labelReplacePreview.test.ts src/hooks/__tests__/useLabelReplaceDialog.test.ts src/components/layout/__tests__/LabelReplaceDialog.test.tsx src/app/__tests__/pageLabelReplace.test.tsx && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし。一括置換のテストが 1 件でも落ちたら、期待値を変えず、共有へ移した文言・整形が元と同じ値かを見直す。

---

### Task 6: 分割の UI（`useNodeSplitDialog`・`NodeSplitDialog`・`NodeSplitControl`・`MapEditor` の配線）

**Files:**
- Create: `client/src/hooks/nodeSeparatorPreview.ts`（この Task では分割の状態文言 `describeNodeSplitStatus` だけ。Task 7 で統合の関数を足す）
- Create: `client/src/hooks/useNodeSplitDialog.ts`
- Create: `client/src/components/layout/NodeSplitControl.tsx`
- Create: `client/src/components/layout/NodeSplitDialog.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`（配線だけ。ロジックは足さない）
- Test: `client/src/hooks/__tests__/nodeSeparatorPreview.test.ts`、`client/src/hooks/__tests__/useNodeSplitDialog.test.ts`、`client/src/components/layout/__tests__/NodeSplitControl.test.tsx`、`client/src/components/layout/__tests__/NodeSplitDialog.test.tsx`、`client/src/app/__tests__/pageNodeSplit.test.tsx`（すべて新規）

**Interfaces:**
- Consumes: Task 2 の `canSplitNode`・`planNodeSplit`・`NodeSplitPlan`・`SplitNodeResult`・`formatNodeSplitFailureNotice`、Task 1 の `SPLIT_DEFAULT_SEPARATOR`、Task 4 の `useNodes().splitNode`、Task 5 の `nodeSeparatorDialogState` の関数と型・`NodeSeparatorField`・`useHeaderFocusReturn`・`STALE_DIALOG_MESSAGE`・`formatPreviewLabel`、既存の `useLatestRef`（`@/hooks/useLatestRef`）・`useDialogFocusTrap`・`handleDialogClickCapture`・`useReannouncedNotice`・`preventRepeatedActivationClick`・`OperationNotice`（`@/types/operationNotice`）
- Produces（`@/hooks/nodeSeparatorPreview`）: `describeNodeSplitStatus(stale: boolean, plan: NodeSplitPlan | null): string`（stale は共有の文言、計画なしは空文字、失敗は `formatNodeSplitFailureNotice` の文言、成功は `N件に分割します（M件を追加）`）
- Produces（`@/hooks/useNodeSplitDialog`）:

```typescript
export type UseNodeSplitDialogOptions = {
  mapId: string;
  nodes: readonly Node[];
  selectedNodeId: number | null;
  visibleNodeIds: ReadonlySet<number>;
  documentRevision: number;
  splitNode: (nodeId: number, separator: string, visibleNodeIds: ReadonlySet<number>, expected: NodeSplitPlan) => SplitNodeResult;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseNodeSplitDialogReturn = {
  screen: "closed" | "open";
  canOpen: boolean;                  // canSplitNode（主選択が存在し可視）
  disabledReason: string;            // 分割できるノードが選択されていません。
  targetLabel: string;               // 開いた時点の主選択の、最新のラベル
  separatorPreset: string;
  customSeparator: string;
  fragments: readonly string[];      // 成功の計画の断片。失敗の計画なら空
  statusText: string;
  error: NodeSeparatorError;
  focusRequest: NodeSeparatorFocusRequest;
  canSubmit: boolean;                // 開いていて、計画が成功し、stale でない
  open: () => void;
  close: () => void;
  setSeparatorPreset: (presetId: string) => void;
  setCustomSeparator: (value: string) => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};
```

- Produces（`@/components/layout/NodeSplitControl`）: `NodeSplitControl`。props `{ expanded: boolean; disabled: boolean; disabledReason: string; onOpen: () => void; buttonRef: Ref<HTMLButtonElement> }`。ボタン名 `ノードを分割`、`aria-haspopup="dialog"`・`aria-expanded`・`onKeyDown={preventRepeatedActivationClick}`、無効のときは `title` と `aria-describedby`（`sr-only` の説明）で理由を示す。
- Produces（`@/components/layout/NodeSplitDialog`）: `NodeSplitDialog`。props（すべて必須）`{ targetLabel: string; separatorPreset: string; customSeparator: string; fragments: readonly string[]; statusText: string; error: NodeSeparatorError; canSubmit: boolean; focusRequest: NodeSeparatorFocusRequest; onFocusRequestApplied: () => void; onSeparatorPresetChange: (presetId: string) => void; onCustomSeparatorChange: (value: string) => void; onCancel: () => void; onSubmit: () => void; onMouseClick: () => void }`

- [ ] **Step 1: 失敗するテストを書く（状態文言・フック）**

`client/src/hooks/__tests__/nodeSeparatorPreview.test.ts`（この Task では分割だけ。Task 7 で統合の describe を足した全体に置き換える）:

```typescript
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
import { describeNodeSplitStatus } from "@/hooks/nodeSeparatorPreview";

describe("describeNodeSplitStatus", () => {
  it("stale のときは、計画より先に更新を促す文言を返す", () => {
    expect(describeNodeSplitStatus(true, { ok: true, nodeId: 1, fragments: ["a", "b"] })).toBe(STALE_DIALOG_MESSAGE);
    expect(describeNodeSplitStatus(true, null)).toBe(STALE_DIALOG_MESSAGE);
  });

  it("計画が無ければ空文字", () => {
    expect(describeNodeSplitStatus(false, null)).toBe("");
  });

  it("成功の計画は、分割後の件数と追加する件数を返す", () => {
    expect(describeNodeSplitStatus(false, { ok: true, nodeId: 1, fragments: ["a", "b", "c"] })).toBe("3件に分割します（2件を追加）");
    expect(describeNodeSplitStatus(false, { ok: true, nodeId: 1, fragments: ["a", "b"] })).toBe("2件に分割します（1件を追加）");
  });

  it("失敗の計画は、その reason の文言を返す", () => {
    expect(describeNodeSplitStatus(false, { ok: false, reason: "separator-empty" })).toBe("区切り文字を入力してください。");
    expect(describeNodeSplitStatus(false, { ok: false, reason: "not-splittable" })).toBe("区切り文字で 2 つ以上に分けられません。");
    expect(describeNodeSplitStatus(false, { ok: false, reason: "too-many-fragments" })).toBe("分割できるのは 200 件までです。");
    expect(describeNodeSplitStatus(false, { ok: false, reason: "node-missing" })).toBe("分割できるノードが選択されていません。");
  });
});
```

`client/src/hooks/__tests__/useNodeSplitDialog.test.ts`:

```typescript
import { act, renderHook } from "@testing-library/react";
import { planNodeSplit, type NodeSplitPlan, type SplitNodeResult } from "@/domain/nodes/nodeSplit";
import { useNodeSplitDialog } from "@/hooks/useNodeSplitDialog";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

type Props = {
  mapId?: string;
  nodes?: readonly Node[];
  selectedNodeId?: number | null;
  visibleNodeIds?: ReadonlySet<number>;
  documentRevision?: number;
};

// 1: 分割できる、2: 区切りが無い、3: 非表示（表示の集合に入れない）、4: 空のラベル
const baseNodes = [
  createTestNode({ id: 1, label: "りんご、みかん、ぶどう" }),
  createTestNode({ id: 2, label: "バナナ" }),
  createTestNode({ id: 3, label: "いちご、もも" }),
  createTestNode({ id: 4, label: "" }),
];
const baseVisible: ReadonlySet<number> = new Set([1, 2, 4]);

function setup(initial: Props = {}) {
  const splitNode = jest.fn<SplitNodeResult, [number, string, ReadonlySet<number>, NodeSplitPlan]>(
    () => ({ ok: true, insertedIds: [11, 12] }),
  );
  const publishNotice = jest.fn();
  const view = renderHook(
    (props: Props) => useNodeSplitDialog({
      mapId: props.mapId ?? "a",
      nodes: props.nodes ?? baseNodes,
      selectedNodeId: props.selectedNodeId === undefined ? 1 : props.selectedNodeId,
      visibleNodeIds: props.visibleNodeIds ?? baseVisible,
      documentRevision: props.documentRevision ?? 0,
      splitNode,
      publishNotice,
    }),
    { initialProps: initial },
  );
  return { ...view, splitNode, publishNotice };
}

describe("useNodeSplitDialog", () => {
  it("開くと、主選択のラベルを既定の区切り文字「、」で分けたプレビューが出て、確定できる", () => {
    const view = setup();

    act(() => { view.result.current.open(); });

    expect(view.result.current).toMatchObject({
      screen: "open",
      targetLabel: "りんご、みかん、ぶどう",
      separatorPreset: "ja-comma",
      fragments: ["りんご", "みかん", "ぶどう"],
      statusText: "3件に分割します（2件を追加）",
      canSubmit: true,
      focusRequest: "separator",
    });
  });

  describe("ボタンの有効判定と開く条件", () => {
    it.each([
      ["主選択が無い", { selectedNodeId: null }],
      ["主選択が表示されていない", { selectedNodeId: 3 }],
      ["主選択が配列に無い", { selectedNodeId: 99 }],
    ])("%sときは canOpen が偽で、開かない", (_name, props) => {
      const view = setup(props);

      act(() => { view.result.current.open(); });

      expect(view.result.current.canOpen).toBe(false);
      expect(view.result.current.screen).toBe("closed");
      expect(view.result.current.disabledReason).toBe("分割できるノードが選択されていません。");
    });

    it("主選択のラベルが分けられなくても、canOpen は真（断片数は区切り文字しだい）で、開いたあとに理由を示す", () => {
      const view = setup({ selectedNodeId: 2 });

      act(() => { view.result.current.open(); });

      expect(view.result.current.canOpen).toBe(true);
      expect(view.result.current.screen).toBe("open");
      expect(view.result.current.fragments).toEqual([]);
      expect(view.result.current.statusText).toBe("区切り文字で 2 つ以上に分けられません。");
      expect(view.result.current.canSubmit).toBe(false);
    });
  });

  it("区切り文字を替えると、プレビューと状態文言が即時に変わる", () => {
    const view = setup({ nodes: [createTestNode({ id: 1, label: "a/b・c/d" })], visibleNodeIds: new Set([1]) });
    act(() => { view.result.current.open(); });
    expect(view.result.current.statusText).toBe("区切り文字で 2 つ以上に分けられません。");

    act(() => { view.result.current.setSeparatorPreset("slash"); });
    expect(view.result.current.fragments).toEqual(["a", "b・c", "d"]);
    expect(view.result.current.statusText).toBe("3件に分割します（2件を追加）");

    act(() => { view.result.current.setSeparatorPreset("middle-dot"); });
    expect(view.result.current.fragments).toEqual(["a/b", "c/d"]);
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("「その他」は入力した文字列で分け、空のままなら区切り文字を求めて確定できない", () => {
    const view = setup({ nodes: [createTestNode({ id: 1, label: "a->b->c" })], visibleNodeIds: new Set([1]) });
    act(() => { view.result.current.open(); });

    act(() => { view.result.current.setSeparatorPreset("custom"); });
    expect(view.result.current.statusText).toBe("区切り文字を入力してください。");
    expect(view.result.current.canSubmit).toBe(false);

    act(() => { view.result.current.setCustomSeparator("->"); });
    expect(view.result.current.fragments).toEqual(["a", "b", "c"]);
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("断片が 200 件を超えるときは、件数の上限を示して確定できない", () => {
    const label = Array.from({ length: 201 }, (_, index) => `項目${index}`).join("、");
    const view = setup({ nodes: [createTestNode({ id: 1, label })], visibleNodeIds: new Set([1]) });

    act(() => { view.result.current.open(); });

    expect(view.result.current.statusText).toBe("分割できるのは 200 件までです。");
    expect(view.result.current.canSubmit).toBe(false);
  });

  it("開き直すと、前回の区切り文字を持ち越さず既定に戻る", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    act(() => { view.result.current.setSeparatorPreset("custom"); });
    act(() => { view.result.current.setCustomSeparator("x"); });
    act(() => { view.result.current.close(); });

    act(() => { view.result.current.open(); });

    expect(view.result.current).toMatchObject({ separatorPreset: "ja-comma", customSeparator: "" });
  });

  it("開いた後に主選択が変わっても、対象は開いた時点の主選択のままにする", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    view.rerender({ selectedNodeId: 2 });

    expect(view.result.current.targetLabel).toBe("りんご、みかん、ぶどう");
    expect(view.result.current.fragments).toHaveLength(3);
  });

  it("確定は、開いた後に主選択が変わっても、開いた時点の主選択を対象にして splitNode を呼ぶ", () => {
    const view = setup({ selectedNodeId: 1 });
    act(() => { view.result.current.open(); });

    view.rerender({ selectedNodeId: 2 });
    act(() => { view.result.current.submit(); });

    expect(view.splitNode).toHaveBeenCalledTimes(1);
    const [nodeId, , , expected] = view.splitNode.mock.calls[0];
    expect(nodeId).toBe(1);
    expect(expected).toEqual(planNodeSplit(baseNodes, 1, "、", baseVisible));
  });

  it("プレビューは最新の nodes から作る（開いた後にラベルが変わると、断片も変わる）", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    view.rerender({ nodes: [createTestNode({ id: 1, label: "もも、いちご" }), ...baseNodes.slice(1)] });

    expect(view.result.current.fragments).toEqual(["もも", "いちご"]);
  });

  describe("確定", () => {
    it("splitNode を 1 回、現在のプレビューの計画を expected として呼び、通知して閉じる", () => {
      const view = setup();
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.splitNode).toHaveBeenCalledTimes(1);
      const [nodeId, separator, visibleNodeIds, expected] = view.splitNode.mock.calls[0];
      expect(nodeId).toBe(1);
      expect(separator).toBe("、");
      expect(visibleNodeIds).toBe(baseVisible);
      expect(expected).toEqual(planNodeSplit(baseNodes, 1, "、", baseVisible));
      expect(view.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "ノードを 3 件に分割しました。" });
      expect(view.result.current.screen).toBe("closed");
      expect(view.result.current.focusRequest).toBe("header");
    });

    it("成功の通知の件数は、元のノードと追加した断片の合計", () => {
      const view = setup();
      view.splitNode.mockReturnValueOnce({ ok: true, insertedIds: [11, 12, 13, 14] });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "ノードを 5 件に分割しました。" });
    });

    it("同じ処理での 2 回目の確定は何もしない", () => {
      const view = setup();
      act(() => { view.result.current.open(); });

      act(() => {
        view.result.current.submit();
        view.result.current.submit();
      });

      expect(view.splitNode).toHaveBeenCalledTimes(1);
      expect(view.publishNotice).toHaveBeenCalledTimes(1);
    });

    it("計画が失敗しているとき（確定できないとき）は splitNode を呼ばない", () => {
      const view = setup({ selectedNodeId: 2 });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.splitNode).not.toHaveBeenCalled();
    });

    it("開いていないときは splitNode を呼ばない", () => {
      const view = setup();

      act(() => { view.result.current.submit(); });

      expect(view.splitNode).not.toHaveBeenCalled();
    });

    it("splitNode が失敗したら閉じず、その reason の文言をエラーに出して通知しない。直したあとにもう一度確定できる", () => {
      const view = setup();
      view.splitNode.mockReturnValueOnce({ ok: false, reason: "plan-changed" });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.result.current.screen).toBe("open");
      expect(view.result.current.error.message).toBe("分割の内容が変わりました。もう一度確認してください。");
      expect(view.publishNotice).not.toHaveBeenCalled();

      act(() => { view.result.current.submit(); });
      expect(view.splitNode).toHaveBeenCalledTimes(2);
      expect(view.result.current.screen).toBe("closed");
    });

    it.each([
      ["placement-failed", "ノードを分割できませんでした。"],
      ["id-conflict", "ノードを分割できませんでした。"],
    ] as const)("%s の失敗は「%s」を出す", (reason, message) => {
      const view = setup();
      view.splitNode.mockReturnValueOnce({ ok: false, reason });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.result.current.error.message).toBe(message);
    });
  });

  it("開いた後に documentRevision が変わると stale になり、確定できず、状態文言とエラーが更新を促す", () => {
    const view = setup({ documentRevision: 0 });
    act(() => { view.result.current.open(); });

    view.rerender({ documentRevision: 1 });

    expect(view.result.current.canSubmit).toBe(false);
    expect(view.result.current.statusText).toBe("マップが更新されました。閉じてから開き直してください。");
    expect(view.result.current.error.message).toBe("マップが更新されました。閉じてから開き直してください。");
    act(() => { view.result.current.submit(); });
    expect(view.splitNode).not.toHaveBeenCalled();
  });

  it("mapId が変わると閉じた扱いになり、ヘッダーへのフォーカスは求めない（元のマップへ戻っても復活しない）", () => {
    const view = setup({ mapId: "a" });
    act(() => { view.result.current.open(); });

    view.rerender({ mapId: "b" });
    expect(view.result.current.screen).toBe("closed");
    expect(view.result.current.focusRequest).toBeNull();

    view.rerender({ mapId: "a" });
    expect(view.result.current.screen).toBe("closed");
  });

  it("フォーカス要求は consumeFocusRequest で消える", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    expect(view.result.current.focusRequest).toBe("separator");

    act(() => { view.result.current.consumeFocusRequest(); });

    expect(view.result.current.focusRequest).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗するテストを書く（Control・Dialog）**

`client/src/components/layout/__tests__/NodeSplitControl.test.tsx`:

```typescript
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeSplitControl } from "@/components/layout/NodeSplitControl";

const REASON = "分割できるノードが選択されていません。";

type Props = Parameters<typeof NodeSplitControl>[0];

function renderControl(overrides: Partial<Props> = {}) {
  const props: Props = {
    expanded: false,
    disabled: false,
    disabledReason: REASON,
    onOpen: jest.fn(),
    buttonRef: createRef(),
    ...overrides,
  };
  return { props, ...render(<NodeSplitControl {...props} />) };
}

describe("NodeSplitControl", () => {
  it("ダイアログを開くボタンとして名前・aria 属性を持つ", () => {
    renderControl();

    const button = screen.getByRole("button", { name: "ノードを分割" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("expanded のとき aria-expanded が true になる", () => {
    renderControl({ expanded: true });

    expect(screen.getByRole("button", { name: "ノードを分割" })).toHaveAttribute("aria-expanded", "true");
  });

  it("クリックで onOpen を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderControl();

    await user.click(screen.getByRole("button", { name: "ノードを分割" }));

    expect(props.onOpen).toHaveBeenCalledTimes(1);
  });

  it("有効のときは、理由の説明も title も付けない", () => {
    renderControl();

    const button = screen.getByRole("button", { name: "ノードを分割" });
    expect(button).not.toHaveAttribute("title");
    expect(button).not.toHaveAccessibleDescription();
  });

  it("無効のときは押せず、理由を title と説明（aria-describedby）で示す", async () => {
    const user = userEvent.setup();
    const { props } = renderControl({ disabled: true });

    const button = screen.getByRole("button", { name: "ノードを分割" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", REASON);
    expect(button).toHaveAccessibleDescription(REASON);

    await user.click(button);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("押し続けたリピートの Enter・Space では既定動作を止める（開いた直後のダイアログへ click が届かない）", () => {
    renderControl();
    const button = screen.getByRole("button", { name: "ノードを分割" });

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
  });

  it("buttonRef をボタンへ渡す", () => {
    const buttonRef = createRef<HTMLButtonElement>();

    renderControl({ buttonRef });

    expect(buttonRef.current).toBe(screen.getByRole("button", { name: "ノードを分割" }));
  });
});
```

`client/src/components/layout/__tests__/NodeSplitDialog.test.tsx`:

```typescript
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeSplitDialog } from "@/components/layout/NodeSplitDialog";

type Props = ComponentProps<typeof NodeSplitDialog>;

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    targetLabel: "りんご、みかん、ぶどう",
    separatorPreset: "ja-comma",
    customSeparator: "",
    fragments: [],
    statusText: "区切り文字で 2 つ以上に分けられません。",
    error: { sequence: 0, message: null },
    canSubmit: false,
    focusRequest: null,
    onFocusRequestApplied: jest.fn(),
    onSeparatorPresetChange: jest.fn(),
    onCustomSeparatorChange: jest.fn(),
    onCancel: jest.fn(),
    onSubmit: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeSplitDialog {...props} />) };
}

describe("NodeSplitDialog", () => {
  it("名前付きのモーダルダイアログとして、区切り文字の入力を可視のラベルつきで出す", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "ノードを分割" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(/最初の断片は元のノードに残り/);
    expect(within(dialog).getByLabelText("区切り文字")).toHaveValue("ja-comma");
  });

  it("ダイアログ全体が縦にスクロールでき、画面が低くても確定ボタンへ届く（L-409）", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveClass("max-h-full", "overflow-y-auto");
  });

  it("focusRequest が separator なら区切り文字のプルダウンへフォーカスし、要求の消費を通知する", () => {
    const { props } = renderDialog({ focusRequest: "separator" });

    expect(screen.getByLabelText("区切り文字")).toHaveFocus();
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("分割するノードのラベルを出し、空のラベルは「（空）」にする", () => {
    const { rerender, props } = renderDialog();
    expect(screen.getByText("りんご、みかん、ぶどう")).toBeInTheDocument();

    rerender(<NodeSplitDialog {...props} targetLabel="" />);
    expect(screen.getByText("（空）")).toBeInTheDocument();
  });

  it("プルダウンの選択と「その他」の入力を通知する", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog();

    await user.selectOptions(screen.getByLabelText("区切り文字"), "slash");
    expect(props.onSeparatorPresetChange).toHaveBeenCalledWith("slash");

    rerender(<NodeSplitDialog {...props} separatorPreset="custom" />);
    fireEvent.change(screen.getByLabelText("その他の区切り文字"), { target: { value: "->" } });
    expect(props.onCustomSeparatorChange).toHaveBeenCalledWith("->");
  });

  it("状態文言を常設のライブリージョンに出し、中身だけを替える", () => {
    const { rerender, props } = renderDialog({ statusText: "区切り文字を入力してください。" });
    const region = screen.getByText("区切り文字を入力してください。");
    expect(region).toHaveAttribute("aria-live", "polite");

    rerender(<NodeSplitDialog {...props} statusText="3件に分割します（2件を追加）" />);
    expect(screen.getByText("3件に分割します（2件を追加）")).toBe(region);
  });

  describe("断片の一覧", () => {
    it("番号付きの一覧に、1 件目は「元のノードに残る」、2 件目以降は「新しい兄弟として追加」と注記する", () => {
      renderDialog({ fragments: ["りんご", "みかん", "ぶどう"] });

      const list = screen.getByRole("list", { name: "分割後の断片" });
      expect(list.tagName).toBe("OL");
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent("りんご元のノードに残る");
      expect(items[1]).toHaveTextContent("みかん新しい兄弟として追加");
      expect(items[2]).toHaveTextContent("ぶどう新しい兄弟として追加");
    });

    it("分割できないとき（断片が無い）は一覧を出さない", () => {
      renderDialog({ fragments: [] });

      expect(screen.queryByRole("list")).toBeNull();
    });

    it("断片の前後の空白を畳まず、折り返して全文を出す（L-821）。一覧は低い画面でも潰れない（L-409）", () => {
      renderDialog({ fragments: ["a  b", "c"] });

      const list = screen.getByRole("list", { name: "分割後の断片" });
      expect(list).toHaveClass("max-h-60", "shrink-0", "overflow-y-auto");
      const text = within(list).getAllByRole("listitem")[0].firstElementChild!;
      expect(text.textContent).toBe("a  b");
      expect(text).toHaveClass("whitespace-pre-wrap", "break-words");
    });
  });

  describe("確定とキャンセル", () => {
    it("確定ボタン「分割する」は canSubmit が偽なら無効で、真なら押して onSubmit を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props, rerender } = renderDialog({ canSubmit: false });
      expect(screen.getByRole("button", { name: "分割する" })).toBeDisabled();

      rerender(<NodeSplitDialog {...props} canSubmit />);
      await user.click(screen.getByRole("button", { name: "分割する" }));
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("キャンセルボタンで onCancel を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it("確定・キャンセルのボタンはリピートの Enter・Space の既定動作を止める", () => {
      renderDialog({ canSubmit: true });

      for (const name of ["分割する", "キャンセル"]) {
        const button = screen.getByRole("button", { name });
        expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
        expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
      }
    });

    it("ダブルクリックの 2 回目のクリックは握りつぶし、マウスのクリックを親へ通知する", () => {
      const { props } = renderDialog({ canSubmit: true });
      const button = screen.getByRole("button", { name: "分割する" });

      fireEvent.click(button, { detail: 1 });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
      expect(props.onMouseClick).toHaveBeenCalledTimes(1);

      fireEvent.click(button, { detail: 2 });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("キーボード・支援技術のクリック（detail 0）では確定でき、マウスのクリックとしては通知しない", () => {
      const { props } = renderDialog({ canSubmit: true });

      fireEvent.click(screen.getByRole("button", { name: "分割する" }), { detail: 0 });

      expect(props.onSubmit).toHaveBeenCalledTimes(1);
      expect(props.onMouseClick).not.toHaveBeenCalled();
    });
  });

  describe("キー操作", () => {
    it("プルダウンで Escape を押すと onCancel を呼ぶ", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Escape" });

      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it("IME 変換中（isComposing）の Escape では閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Escape", isComposing: true });

      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it("IME 変換中（keyCode が 229）の Escape では閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Escape", keyCode: 229 });

      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it("プルダウンの Enter では確定しない", () => {
      const { props } = renderDialog({ canSubmit: true });

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Enter" });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it("「その他」の入力欄の Enter は、確定できるときだけ onSubmit を呼ぶ", () => {
      const { props, rerender } = renderDialog({ separatorPreset: "custom", canSubmit: false });
      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });
      expect(props.onSubmit).not.toHaveBeenCalled();

      rerender(<NodeSplitDialog {...props} canSubmit />);
      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
      ["リピート", { repeat: true }],
    ])("「その他」の入力欄の Enter は %s のとき確定しない", (_name, init) => {
      const { props } = renderDialog({ separatorPreset: "custom", canSubmit: true });

      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter", ...init });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });
  });

  it("エラーを role=alert に出す（再読み上げのため次のフレームで入る）", async () => {
    renderDialog({ error: { sequence: 1, message: "ノードを分割できませんでした。" } });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ノードを分割できませんでした。"));
  });

  it("エラーが無いときも role=alert の領域を常に描画する", () => {
    renderDialog();

    expect(screen.getByRole("alert")).toHaveTextContent("");
  });
});
```

- [ ] **Step 3: 失敗するページ統合テストを書く**

`client/src/app/__tests__/pageNodeSplit.test.tsx`。`jest.mock` 群・`beforeEach` は `pageLabelReplace.test.tsx` の先頭に倣い、下のコードに全文を含める。手動配置の座標は、ルート 1・3・4 の兄弟の最も下の下端（4 の 600 + 60 = 660）の下に 40 空けた 700、次の断片は 700 + 60 + 40 = 800（キャンバス上の並びが配列順とずれる）。`onMouseClick` の配線は、`Date.now` を固定し、確定ボタンの 1 回目のクリック（`detail: 1`）の後、500ms 以内（10_699）の空きキャンバスの押下・dblclick で選択が解除されず・ノードが増えず、500ms 後（10_700）に解除されることで確かめる（`pageBranchMove.test.tsx`・`pageOutlineImportKeyboard.test.tsx` の先例）。`MapEditor` の `NodeSplitDialog` の `onMouseClick` を空にすると、このテストが落ちる。`visibleNodeIds` の配線は、解像度フィルター（高のみ）で主選択が隠れて「ノードを分割」が無効になるテストと、ダイアログを開いたまま同じ操作で対象を隠すと状態文言が理由を示して確定できなくなるテストで確かめる（前者は `MapStage` が選択を整理するので、`visibleNodeIds` に全ノードを渡す誤配線では落ちない。後者が落ちる。後者は、実 UI では根が `inert` で押せない操作を jsdom の合成クリックで行う）:

```typescript
import { act, fireEvent, screen } from "@testing-library/react";
import {
  dialog,
  exportedMap,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  stageContainer,
  undoButton,
  v3Json,
} from "@/app/testing/pageTestHelpers";
import {
  mockStage,
  mockStageHandlers,
  pointer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から useMapLibrary・MapEditor・
// ヘッダー・ダイアログ・通知領域までは本物を通す
jest.mock("pixi.js", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createPagePixiModuleMock()
));

jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return { ...actual, generateIllustrationThumbnail: jest.fn() };
});

const mockDownloadMapJson = jest.fn();
jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return {
    ...actual,
    downloadMapJson: (json: string, mapName: string) => mockDownloadMapJson(json, mapName),
  };
});

jest.mock("@/services/imageExport/mapTextMeasurement", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createMapTextMeasurementModuleMock()
));

const mockDownloadMapImage = jest.fn();
jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: (blob: Blob, fileName: string) => mockDownloadMapImage(blob, fileName),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => jest.restoreAllMocks());

// 1: 分割できるラベル（読点）、2: 1 の子、3: 分割できるラベル（スラッシュ）、4: 分割できないラベル。1・3・4 はルート
function seed() {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "分割テスト",
      json: v3Json([
        { id: 1, label: "りんご、みかん、ぶどう", x: 100, y: 100, importance: "high" },
        { id: 2, parentId: 1, label: "りんごの子", x: 300, y: 100 },
        { id: 3, label: "dog/cat/bird", x: 100, y: 400 },
        { id: 4, label: "単一", x: 100, y: 600 },
      ]),
    },
  ], { currentMapId: "a" });
}

const NODE_COUNT = 4;

function openDialog() {
  fireEvent.click(headerButton("ノードを分割"));
}

function nodesOf() {
  return exportedMap(mockDownloadMapJson).nodes;
}

function labelsOf(): string[] {
  return nodesOf().map((node) => node.label);
}

const ORIGINAL_LABELS = ["りんご、みかん、ぶどう", "りんごの子", "dog/cat/bird", "単一"];

// 空きキャンバスを押す。mousedown の既定の動作（フォーカスの移動）が許されるなら true を返す
function pressBlankCanvas() {
  act(() => {
    mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
  return fireEvent.mouseDown(stageContainer());
}

describe("ノードの分割", () => {
  it("主選択を分割すると、最初の断片が元のノードに残り、残りが直後の兄弟として断片の順に入る。通知が出る", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);

    openDialog();
    expect(dialog().getByText("3件に分割します（2件を追加）")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(labelsOf()).toEqual(["りんご", "みかん", "ぶどう", "りんごの子", "dog/cat/bird", "単一"]);
    const [original, second, third, child] = nodesOf();
    expect(original).toMatchObject({ id: 1, parentId: null, x: 100, y: 100, importance: "high" });
    expect(child).toMatchObject({ id: 2, parentId: 1 });
    // 手動配置では、断片は同じ親の兄弟の最も下の下端（4 の 660）の下へ積む。キャンバス上の並びは配列順と一致しない
    expect(second).toMatchObject({ parentId: null, x: 100, y: 700, importance: "high", width: 100, height: 60 });
    expect(third).toMatchObject({ parentId: null, x: 100, y: 800, importance: "high" });
    expect(screen.getByText("ノードを 3 件に分割しました。")).toBeInTheDocument();
  });

  it("確定全体を 1 回の Undo で戻し、1 回の Redo でやり直せる", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }));
    const splitLabels = labelsOf();

    fireEvent.click(undoButton());
    expect(labelsOf()).toEqual(ORIGINAL_LABELS);

    fireEvent.click(redoButton());
    expect(labelsOf()).toEqual(splitLabels);
  });

  it("確定後もフォーカスは「ノードを分割」へ戻り、選択は変わらないのでボタンは有効のまま", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();

    fireEvent.click(dialog().getByRole("button", { name: "分割する" }), { detail: 1 });

    const button = headerButton("ノードを分割");
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("区切り文字をプルダウンで替えると、プレビューと確定ボタンの有効が変わる", async () => {
    seed();
    await renderPage();
    selectNode(2, NODE_COUNT);

    openDialog();
    expect(dialog().getByText("区切り文字で 2 つ以上に分けられません。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "分割する" })).toBeDisabled();

    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "slash" } });
    expect(dialog().getByText("3件に分割します（2件を追加）")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }));

    expect(labelsOf().slice(2, 5)).toEqual(["dog", "cat", "bird"]);
  });

  it("「その他」は空のままだと区切り文字を求めて確定できず、入力後に入力欄の Enter で確定できる", async () => {
    seed();
    await renderPage();
    selectNode(2, NODE_COUNT);
    openDialog();

    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "custom" } });
    expect(dialog().getByText("区切り文字を入力してください。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "分割する" })).toBeDisabled();

    fireEvent.change(dialog().getByLabelText("その他の区切り文字"), { target: { value: "/" } });
    fireEvent.keyDown(dialog().getByLabelText("その他の区切り文字"), { key: "Enter" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(labelsOf().slice(2, 5)).toEqual(["dog", "cat", "bird"]);
  });

  it("分割できないラベルは、理由を文言で示して確定できない（キャンセルでラベルを変えずに閉じ、フォーカスが戻る）", async () => {
    seed();
    await renderPage();
    selectNode(3, NODE_COUNT);

    openDialog();
    expect(dialog().getByText("区切り文字で 2 つ以上に分けられません。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "分割する" })).toBeDisabled();
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(headerButton("ノードを分割")).toHaveFocus();
    expect(labelsOf()).toEqual(ORIGINAL_LABELS);
  });

  it("ダイアログが開いている間は、履歴ショートカットが働かず、編集画面の根が inert になる（開く前は同じ操作で Undo される）", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }));
    const splitLabels = labelsOf();

    // 前提: ダイアログを開く前なら、同じ操作で戻る
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(labelsOf()).toEqual(ORIGINAL_LABELS);
    fireEvent.click(redoButton());
    expect(labelsOf()).toEqual(splitLabels);

    selectNode(0, NODE_COUNT + 2);
    openDialog();
    expect(document.querySelector("[data-map-id]")).toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Delete" });

    expect(labelsOf()).toEqual(splitLabels);
  });

  it("ダイアログが開いている間は、表示の切り替え（マップ・アウトライン）も働かない（L-061）", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(headerButton("ノードを分割")).toBeInTheDocument();
  });

  it("「分割する」の 1 回目のクリックで閉じた後、キャンバスへ届いた 500ms 以内の押下・dblclick は効かず、500ms を過ぎると選択を解除する", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();

    // 開いた時刻と区別できるよう、時刻をずらしてから押す（確定のクリックが時刻を記録したことを確かめる）
    now.mockReturnValue(10_200);
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }), { detail: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    now.mockReturnValue(10_699);
    const allowsFocusMove = pressBlankCanvas();
    fireEvent.doubleClick(stageContainer(), { detail: 2, clientX: 600, clientY: 450 });

    expect(allowsFocusMove).toBe(false);
    expect(headerButton("ノードを分割")).toBeEnabled();
    expect(headerButton("ノードを分割")).toHaveFocus();
    // 分割後の 6 件のまま（dblclick で新しいノードを足さない）
    expect(nodesOf()).toHaveLength(NODE_COUNT + 2);

    now.mockReturnValue(10_700);
    expect(pressBlankCanvas()).toBe(true);
    expect(headerButton("ノードを分割")).toBeDisabled();
  });

  it("解像度フィルター（高のみ）で主選択が隠れると、選択が整理されて「ノードを分割」が無効になる", async () => {
    seed();
    await renderPage();
    selectNode(2, NODE_COUNT);
    expect(headerButton("ノードを分割")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));

    expect(headerButton("ノードを分割")).toBeDisabled();
  });

  // ダイアログを開いている間は根が inert で、実 UI では表示の切り替えを押せない。ここは、MapEditor から分割のフックへ渡す
  // visibleNodeIds の配線（対象が隠れたら node-hidden になること）を、jsdom の合成クリックで確かめる。
  // 上のテストだけでは、MapStage が選択を整理するので、visibleNodeIds に全ノードを渡す誤配線を検出できない
  it("ダイアログを開いたまま表示（解像度フィルター）が変わって対象が隠れると、状態文言が理由を示し、確定できない", async () => {
    seed();
    await renderPage();
    selectNode(2, NODE_COUNT);
    openDialog();
    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "slash" } });
    expect(dialog().getByRole("button", { name: "分割する" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));

    expect(dialog().getByText("分割できるノードが選択されていません。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "分割する" })).toBeDisabled();
  });

  it("選択が無いとき、またはアウトライン表示では、ボタンが無効・出ない（マップ表示へ戻すと出る）", async () => {
    seed();
    await renderPage();

    const button = headerButton("ノードを分割");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "分割できるノードが選択されていません。");
    selectNode(0, NODE_COUNT);
    expect(headerButton("ノードを分割")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.queryByRole("button", { name: "ノードを分割" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "マップ" }));
    });
    expect(screen.getByRole("button", { name: "ノードを分割" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/nodeSeparatorPreview.test.ts src/hooks/__tests__/useNodeSplitDialog.test.ts src/components/layout/__tests__/NodeSplitControl.test.tsx src/components/layout/__tests__/NodeSplitDialog.test.tsx src/app/__tests__/pageNodeSplit.test.tsx`
Expected: FAIL（モジュールが無い。ページテストは「ノードを分割」ボタンが無い）

- [ ] **Step 5: 実装する（状態文言・フック）**

`client/src/hooks/nodeSeparatorPreview.ts`:

```typescript
import type { NodeSplitPlan } from "@/domain/nodes/nodeSplit";
import { formatNodeSplitFailureNotice } from "@/domain/nodes/nodeSplitMessages";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";

// 分割ダイアログの状態文言（常設のライブリージョンに出す）。stale を最優先し、失敗の計画はその reason の文言にする
export function describeNodeSplitStatus(stale: boolean, plan: NodeSplitPlan | null): string {
  if (stale) return STALE_DIALOG_MESSAGE;
  if (plan === null) return "";
  if (!plan.ok) return formatNodeSplitFailureNotice(plan.reason).message;
  return `${plan.fragments.length}件に分割します（${plan.fragments.length - 1}件を追加）`;
}
```

`client/src/hooks/useNodeSplitDialog.ts`:

```typescript
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { SPLIT_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import { canSplitNode, planNodeSplit, type NodeSplitPlan, type SplitNodeResult } from "@/domain/nodes/nodeSplit";
import { formatNodeSplitFailureNotice } from "@/domain/nodes/nodeSplitMessages";
import {
  closeNodeSeparatorDialog,
  consumeNodeSeparatorFocusRequest,
  createNodeSeparatorDialogState,
  currentNodeSeparator,
  dismissNodeSeparatorDialog,
  failNodeSeparatorDialog,
  isNodeSeparatorDialogOpen,
  openNodeSeparatorDialog,
  setNodeSeparatorCustom,
  setNodeSeparatorPreset,
  staleNodeSeparatorError,
  type NodeSeparatorError,
  type NodeSeparatorFocusRequest,
} from "@/hooks/nodeSeparatorDialogState";
import { describeNodeSplitStatus } from "@/hooks/nodeSeparatorPreview";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

const NO_FRAGMENTS: readonly string[] = [];

export type UseNodeSplitDialogOptions = {
  mapId: string;
  nodes: readonly Node[];
  selectedNodeId: number | null;
  visibleNodeIds: ReadonlySet<number>;
  documentRevision: number;
  splitNode: (
    nodeId: number,
    separator: string,
    visibleNodeIds: ReadonlySet<number>,
    expected: NodeSplitPlan,
  ) => SplitNodeResult;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseNodeSplitDialogReturn = {
  screen: "closed" | "open";
  // 「ノードを分割」ボタンの有効判定（対象が存在し可視。断片数は区切り文字しだいなので含めない）
  canOpen: boolean;
  disabledReason: string;
  targetLabel: string;
  separatorPreset: string;
  customSeparator: string;
  fragments: readonly string[];
  statusText: string;
  error: NodeSeparatorError;
  focusRequest: NodeSeparatorFocusRequest;
  canSubmit: boolean;
  open: () => void;
  close: () => void;
  setSeparatorPreset: (presetId: string) => void;
  setCustomSeparator: (value: string) => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};

// 開いた時点の主選択を固定する。プレビューは最新の nodes から作り、確定は現在のプレビューの計画を expected として渡す
// （フックが最新の状態から再計画して照合する）。入力は即時に反映し、useDeferredValue で遅らせない（古いプレビューを確定できる隙間を作らない）
export function useNodeSplitDialog(options: UseNodeSplitDialogOptions): UseNodeSplitDialogReturn {
  const [state, setState] = useState(createNodeSeparatorDialogState);
  const open = isNodeSeparatorDialogOpen(state, options.mapId);
  // 別のマップへ切り替わったら、閉じた状態へ戻す（フォーカスは奪わない）。元のマップへ戻っても古い入力は復活しない
  if (state.screen === "open" && !open) setState(dismissNodeSeparatorDialog);
  const stale = open && state.openedRevision !== options.documentRevision;
  const target = open && state.target?.kind === "split" ? state.target : null;
  const separator = currentNodeSeparator(state);
  const plan = useMemo(
    () => (target === null ? null : planNodeSplit(options.nodes, target.nodeId, separator, options.visibleNodeIds)),
    [target, options.nodes, options.visibleNodeIds, separator],
  );
  const canSubmit = plan !== null && plan.ok && !stale;
  // 古いハンドラを呼ばれても、最後に commit された値で再判定する
  const latest = useLatestRef({ options, state, plan, canSubmit, separator });
  const submittedRef = useRef(false);

  const openDialog = useCallback(() => {
    const { options: current } = latest.current;
    const nodeId = current.selectedNodeId;
    if (nodeId === null || !canSplitNode(current.nodes, nodeId, current.visibleNodeIds)) return;
    submittedRef.current = false;
    setState((prev) => openNodeSeparatorDialog(prev, {
      target: { kind: "split", nodeId },
      defaultSeparator: SPLIT_DEFAULT_SEPARATOR,
      revision: current.documentRevision,
      mapId: current.mapId,
    }));
  }, [latest]);

  const close = useCallback(() => {
    setState(closeNodeSeparatorDialog);
  }, []);

  const setSeparatorPreset = useCallback((presetId: string) => {
    setState((prev) => setNodeSeparatorPreset(prev, presetId));
  }, []);

  const setCustomSeparator = useCallback((value: string) => {
    setState((prev) => setNodeSeparatorCustom(prev, value));
  }, []);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeNodeSeparatorFocusRequest);
  }, []);

  const submit = useCallback(() => {
    const { options: current, state: snapshot, plan: shownPlan, canSubmit: valid, separator: shownSeparator } = latest.current;
    // 通常は canSubmit が偽でボタンが無効なので到達しない。古いハンドラや、確定を押した同じ処理での 2 回目の呼び出しでも
    // 何も変えない（stale・開いていない・計画の失敗は canSubmit に含まれる）
    if (!valid || submittedRef.current || shownPlan === null || snapshot.target?.kind !== "split") return;

    const result = current.splitNode(snapshot.target.nodeId, shownSeparator, current.visibleNodeIds, shownPlan);
    if (!result.ok) {
      setState((prev) => failNodeSeparatorDialog(prev, formatNodeSplitFailureNotice(result.reason).message));
      return;
    }
    submittedRef.current = true;
    current.publishNotice({ kind: "status", message: `ノードを ${result.insertedIds.length + 1} 件に分割しました。` });
    close();
  }, [close, latest]);

  const targetNode = target === null ? undefined : options.nodes.find((node) => node.id === target.nodeId);
  return {
    screen: open ? "open" : "closed",
    canOpen: canSplitNode(options.nodes, options.selectedNodeId, options.visibleNodeIds),
    disabledReason: formatNodeSplitFailureNotice("node-missing").message,
    targetLabel: targetNode?.label ?? "",
    separatorPreset: state.separatorPreset,
    customSeparator: state.customSeparator,
    fragments: plan !== null && plan.ok ? plan.fragments : NO_FRAGMENTS,
    statusText: describeNodeSplitStatus(stale, plan),
    error: stale ? staleNodeSeparatorError(state.error) : state.error,
    // 外から閉じられた（mapId が変わった）ときは dismissNodeSeparatorDialog が null にしている
    focusRequest: state.focusRequest,
    canSubmit,
    open: openDialog,
    close,
    setSeparatorPreset,
    setCustomSeparator,
    consumeFocusRequest,
    submit,
  };
}
```

- [ ] **Step 6: 実装する（Control・Dialog）**

`client/src/components/layout/NodeSplitControl.tsx`:

```typescript
import { useId, type Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

type NodeSplitControlProps = {
  expanded: boolean;
  disabled: boolean;
  // 無効のときに、title と aria-describedby の説明で示す理由
  disabledReason: string;
  onOpen: () => void;
  buttonRef: Ref<HTMLButtonElement>;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeSplitControl({ expanded, disabled, disabledReason, onOpen, buttonRef }: NodeSplitControlProps) {
  const reasonId = useId();

  // 押し続けた Enter・Space の click 合成が、開いた直後のダイアログへ届かないようにする
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-describedby={disabled ? reasonId : undefined}
        title={disabled ? disabledReason : undefined}
        disabled={disabled}
        onClick={onOpen}
        onKeyDown={preventRepeatedActivationClick}
      >
        ノードを分割
      </button>
      {disabled && <span id={reasonId} className="sr-only">{disabledReason}</span>}
    </>
  );
}
```

`client/src/components/layout/NodeSplitDialog.tsx`:

```typescript
"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { NodeSeparatorField } from "@/components/layout/NodeSeparatorField";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import { formatPreviewLabel } from "@/hooks/dialogPreviewText";
import type { NodeSeparatorError, NodeSeparatorFocusRequest } from "@/hooks/nodeSeparatorDialogState";

type NodeSplitDialogProps = {
  targetLabel: string;
  separatorPreset: string;
  customSeparator: string;
  // 分割後の断片。分割できないときは空
  fragments: readonly string[];
  statusText: string;
  error: NodeSeparatorError;
  canSubmit: boolean;
  focusRequest: NodeSeparatorFocusRequest;
  onFocusRequestApplied: () => void;
  onSeparatorPresetChange: (presetId: string) => void;
  onCustomSeparatorChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMouseClick: () => void;
};

// 前後の空白を畳まず、長いラベルも折り返して全文を見せる（L-821）
const labelClassName = "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

export function NodeSplitDialog({
  targetLabel,
  separatorPreset,
  customSeparator,
  fragments,
  statusText,
  error,
  canSubmit,
  focusRequest,
  onFocusRequestApplied,
  onSeparatorPresetChange,
  onCustomSeparatorChange,
  onCancel,
  onSubmit,
  onMouseClick,
}: NodeSplitDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });
  const shownError = useReannouncedNotice(error.sequence, error);

  useLayoutEffect(() => {
    if (focusRequest !== "separator") return;
    selectRef.current?.focus();
    onFocusRequestApplied();
  }, [focusRequest, onFocusRequestApplied]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold">ノードを分割</h2>
        <p id={descriptionId} className="text-sm">
          選択中のノードのラベルを区切り文字で分けます。最初の断片は元のノードに残り、残りは元のノードの直後の兄弟ノードとして追加されます。
        </p>
        <p className="text-sm">
          分割するノード:{" "}
          <span className={labelClassName}>{formatPreviewLabel(targetLabel)}</span>
        </p>
        <NodeSeparatorField
          preset={separatorPreset}
          customSeparator={customSeparator}
          selectRef={selectRef}
          onPresetChange={onSeparatorPresetChange}
          onCustomSeparatorChange={onCustomSeparatorChange}
          onCustomEnter={() => {
            if (canSubmit) onSubmit();
          }}
        />
        {/* ライブリージョンは常に描画し、中身だけを替える */}
        <p aria-live="polite" className="text-sm font-medium">{statusText}</p>
        {fragments.length > 0 && (
          <ol aria-label="分割後の断片" className="flex max-h-60 shrink-0 list-decimal flex-col gap-1 overflow-y-auto pl-6 text-sm">
            {fragments.map((fragment, index) => (
              <li key={index} className="rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                <span className={labelClassName}>{formatPreviewLabel(fragment)}</span>
                <span className="ml-2 text-zinc-600 dark:text-zinc-400">
                  {index === 0 ? "元のノードに残る" : "新しい兄弟として追加"}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">{shownError?.message ?? ""}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            onKeyDown={preventRepeatedActivationClick}
            className="rounded border px-3 py-2 text-sm"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            onKeyDown={preventRepeatedActivationClick}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            分割する
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `MapEditor.tsx` に配線する**

`client/src/components/map/MapEditor.tsx`（差分。`MapEditor` にこれ以上のロジックを足さない。ヘッダーのボタンは `viewMode === "map"` のブロックの中の `LabelReplaceControl` の直後、ダイアログは `LabelReplaceDialog` の描画の直後で根の `inert` の外。`dialogMouseClickedAtRef` は既存のダイアログと同じ ref を使う）:

```diff
--- a/client/src/components/map/MapEditor.tsx
+++ b/client/src/components/map/MapEditor.tsx
@@ -12,9 +12,13 @@
 import { BranchMoveDialog } from "@/components/layout/BranchMoveDialog";
 import { LabelReplaceControl } from "@/components/layout/LabelReplaceControl";
 import { LabelReplaceDialog } from "@/components/layout/LabelReplaceDialog";
+import { NodeSplitControl } from "@/components/layout/NodeSplitControl";
+import { NodeSplitDialog } from "@/components/layout/NodeSplitDialog";
 import type { BranchMoveMapTarget } from "@/hooks/branchMoveDialogState";
 import { useBranchMoveDialog } from "@/hooks/useBranchMoveDialog";
+import { useHeaderFocusReturn } from "@/hooks/useHeaderFocusReturn";
 import { useLabelReplaceDialog } from "@/hooks/useLabelReplaceDialog";
+import { useNodeSplitDialog } from "@/hooks/useNodeSplitDialog";
 import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
 import { useNodes } from "@/hooks/useNodes";
 import { AppHeader } from "@/components/layout/AppHeader";
@@ -131,6 +135,7 @@
     insertParentNode,
     moveBranch,
     updateNodeLabels,
+    splitNode,
     deleteNode,
     deleteNodeOnly,
     setLayoutMode,
@@ -298,6 +303,23 @@
     (button?.disabled ? exportButtonRef.current : button)?.focus();
     consumeLabelReplaceFocusRequest();
   }, [labelReplaceFocusRequest, consumeLabelReplaceFocusRequest, exportButtonRef]);
+  const nodeSplit = useNodeSplitDialog({
+    mapId,
+    nodes,
+    selectedNodeId,
+    visibleNodeIds: displayState.visibleNodeIds,
+    documentRevision,
+    splitNode,
+    publishNotice: publishTreeEditNotice,
+  });
+  const nodeSplitButtonRef = useRef<HTMLButtonElement>(null);
+  // 確定でボタンが無効になったときは、常に押せる「JSON書き出し」へ送る
+  useHeaderFocusReturn({
+    focusRequest: nodeSplit.focusRequest,
+    consumeFocusRequest: nodeSplit.consumeFocusRequest,
+    buttonRef: nodeSplitButtonRef,
+    fallbackRef: exportButtonRef,
+  });
   const { moveSelected: moveSelectedSibling } = siblingReorder;
   const moveSelectedSiblingUp = useCallback(() => moveSelectedSibling("up"), [moveSelectedSibling]);
   const moveSelectedSiblingDown = useCallback(() => moveSelectedSibling("down"), [moveSelectedSibling]);
@@ -312,6 +334,7 @@
     && outlineImport.screen === "closed"
     && branchMove.screen === "closed"
     && labelReplace.screen === "closed"
+    && nodeSplit.screen === "closed"
     && !persistence.isConfirmOpen;
   useMapHistoryShortcuts({ undo, redo, enabled: editorShortcutsEnabled });
   const outlineModel = useMemo(() => buildOutlineRows(nodes), [nodes]);
@@ -434,6 +457,13 @@
                     onOpen={labelReplace.open}
                     buttonRef={labelReplaceButtonRef}
                   />
+                  <NodeSplitControl
+                    expanded={nodeSplit.screen !== "closed"}
+                    disabled={!nodeSplit.canOpen}
+                    disabledReason={nodeSplit.disabledReason}
+                    onOpen={nodeSplit.open}
+                    buttonRef={nodeSplitButtonRef}
+                  />
                   <NodeSiblingOrderControl
                     canMoveUp={siblingReorder.canMoveUp}
                     canMoveDown={siblingReorder.canMoveDown}
@@ -592,6 +622,26 @@
           }}
         />
       )}
+      {nodeSplit.screen === "open" && (
+        <NodeSplitDialog
+          targetLabel={nodeSplit.targetLabel}
+          separatorPreset={nodeSplit.separatorPreset}
+          customSeparator={nodeSplit.customSeparator}
+          fragments={nodeSplit.fragments}
+          statusText={nodeSplit.statusText}
+          error={nodeSplit.error}
+          canSubmit={nodeSplit.canSubmit}
+          focusRequest={nodeSplit.focusRequest}
+          onFocusRequestApplied={nodeSplit.consumeFocusRequest}
+          onSeparatorPresetChange={nodeSplit.setSeparatorPreset}
+          onCustomSeparatorChange={nodeSplit.setCustomSeparator}
+          onCancel={nodeSplit.close}
+          onSubmit={nodeSplit.submit}
+          onMouseClick={() => {
+            dialogMouseClickedAtRef.current = Date.now();
+          }}
+        />
+      )}
       {/* data-map-id を付けず、根の inert の外に置く */}
       {outlineImport.screen !== "closed" && (
         <OutlineImportDialog
```

- [ ] **Step 8: GREEN と回帰を確認する**

Run: `cd client && npx jest src/hooks/__tests__/nodeSeparatorPreview.test.ts src/hooks/__tests__/useNodeSplitDialog.test.ts src/components/layout/__tests__/NodeSplitControl.test.tsx src/components/layout/__tests__/NodeSplitDialog.test.tsx src/app/__tests__/pageNodeSplit.test.tsx src/app/__tests__/pageLabelReplace.test.tsx src/app/__tests__/pageBranchMove.test.tsx src/app/__tests__/pageParentInsertion.test.tsx src/app/__tests__/page.test.tsx && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし。ページテストの「ダイアログが開いている間は…働かない」が落ちたら、`editorShortcutsEnabled` の積に `nodeSplit.screen === "closed"` が入っているかを見直す。

---

### Task 7: 統合の UI（`useNodeMergeDialog`・`NodeMergeDialog`・`NodeMergeControl`・`MapEditor` の配線）

**Files:**
- Modify: `client/src/hooks/nodeSeparatorPreview.ts`（統合の `describeNodeMergeStatus`・`buildNodeMergePreview`・`NODE_MERGE_PREVIEW_LIMIT`・`NodeMergePreview` を足す。分割の関数は変えない）
- Create: `client/src/hooks/useNodeMergeDialog.ts`
- Create: `client/src/components/layout/NodeMergeControl.tsx`
- Create: `client/src/components/layout/NodeMergeDialog.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`（配線だけ）
- Test: `client/src/hooks/__tests__/nodeSeparatorPreview.test.ts`（Task 6 のものに統合の describe を足した全体で置き換える）
- Test: `client/src/hooks/__tests__/useNodeMergeDialog.test.ts`、`client/src/components/layout/__tests__/NodeMergeControl.test.tsx`、`client/src/components/layout/__tests__/NodeMergeDialog.test.tsx`、`client/src/app/__tests__/pageNodeMerge.test.tsx`（すべて新規）

**Interfaces:**
- Consumes: Task 3 の `planNodeMerge`・`NodeMergePlan`・`MergeNodesResult`・`formatNodeMergeFailureNotice`、Task 1 の `MERGE_DEFAULT_SEPARATOR`、Task 4 の `useNodes().mergeNodes`、Task 5 の `nodeSeparatorDialogState` の関数と型・`NodeSeparatorField`・`useHeaderFocusReturn`・`STALE_DIALOG_MESSAGE`・`formatPreviewLabel`、Task 6 の `nodeSeparatorPreview.ts`、既存の `useLatestRef` ほか Task 6 と同じ
- Produces（`@/hooks/nodeSeparatorPreview` に追加）:
  - `NODE_MERGE_PREVIEW_LIMIT = 200`
  - `type NodeMergePreview = { label: string; importanceLabel: string; illustrationText: string; movedChildCount: number; discardedIllustrationCount: number; absorbedLabels: readonly string[]; hiddenAbsorbedCount: number }`（`absorbedLabels` は配列順で先頭から 200 件まで。整形前のラベル）
  - `describeNodeMergeStatus(stale: boolean, plan: NodeMergePlan | null): string`（stale は共有の文言、計画なしは空文字、失敗は `formatNodeMergeFailureNotice` の文言、成功は `N件を1件に統合します`。N = 吸収する件数 + 1）
  - `buildNodeMergePreview(nodes: readonly Node[], plan: NodeMergePlan): NodeMergePreview | null`（失敗の計画は `null`）
- Produces（`@/hooks/useNodeMergeDialog`）:

```typescript
export type UseNodeMergeDialogOptions = {
  mapId: string;
  nodes: readonly Node[];
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  visibleNodeIds: ReadonlySet<number>;
  documentRevision: number;
  mergeNodes: (ids: readonly number[], primaryId: number | null, joiner: string, visibleNodeIds: ReadonlySet<number>, expected: NodeMergePlan) => MergeNodesResult;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseNodeMergeDialogReturn = {
  screen: "closed" | "open";
  canOpen: boolean;                  // 選択が 2 件以上
  disabledReason: string;            // 2 つ以上のノードを選択してください。
  separatorPreset: string;
  customSeparator: string;
  preview: NodeMergePreview | null;  // 計画が失敗しているときは null
  statusText: string;
  error: NodeSeparatorError;
  focusRequest: NodeSeparatorFocusRequest;
  canSubmit: boolean;
  open: () => void;
  close: () => void;
  setSeparatorPreset: (presetId: string) => void;
  setCustomSeparator: (value: string) => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};
```

- Produces（`@/components/layout/NodeMergeControl`）: `NodeMergeControl`。props `{ expanded: boolean; disabled: boolean; disabledReason: string; onOpen: () => void; buttonRef: Ref<HTMLButtonElement> }`。`aria-haspopup="dialog"`・`aria-expanded`・`onKeyDown={preventRepeatedActivationClick}`、無効のときは `title` と `aria-describedby`（`sr-only` の説明）で理由を示す。ボタン名 `ノードを統合`。
- Produces（`@/components/layout/NodeMergeDialog`）: `NodeMergeDialog`。props（すべて必須）`{ preview: NodeMergePreview | null; separatorPreset: string; customSeparator: string; statusText: string; error: NodeSeparatorError; canSubmit: boolean; focusRequest: NodeSeparatorFocusRequest; onFocusRequestApplied: () => void; onSeparatorPresetChange: (presetId: string) => void; onCustomSeparatorChange: (value: string) => void; onCancel: () => void; onSubmit: () => void; onMouseClick: () => void }`

- [ ] **Step 1: 失敗するテストを書く（状態文言・プレビューの組み立て・フック）**

`client/src/hooks/__tests__/nodeSeparatorPreview.test.ts`（Task 6 の内容に、統合の `describeNodeMergeStatus`・`buildNodeMergePreview` の describe を足した全体）:

```typescript
import { planNodeMerge, type NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
import {
  NODE_MERGE_PREVIEW_LIMIT,
  buildNodeMergePreview,
  describeNodeMergeStatus,
  describeNodeSplitStatus,
} from "@/hooks/nodeSeparatorPreview";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";

function node(id: number, label: string, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId: null, label, ...overrides });
}

function okPlan(nodes: readonly Node[], ids: readonly number[], primaryId: number, joiner = " "): NodeMergePlan {
  return planNodeMerge(nodes, ids, primaryId, joiner, new Set(nodes.map((item) => item.id)));
}

describe("describeNodeSplitStatus", () => {
  it("stale のときは、計画より先に更新を促す文言を返す", () => {
    expect(describeNodeSplitStatus(true, { ok: true, nodeId: 1, fragments: ["a", "b"] })).toBe(STALE_DIALOG_MESSAGE);
    expect(describeNodeSplitStatus(true, null)).toBe(STALE_DIALOG_MESSAGE);
  });

  it("計画が無ければ空文字", () => {
    expect(describeNodeSplitStatus(false, null)).toBe("");
  });

  it("成功の計画は、分割後の件数と追加する件数を返す", () => {
    expect(describeNodeSplitStatus(false, { ok: true, nodeId: 1, fragments: ["a", "b", "c"] })).toBe("3件に分割します（2件を追加）");
    expect(describeNodeSplitStatus(false, { ok: true, nodeId: 1, fragments: ["a", "b"] })).toBe("2件に分割します（1件を追加）");
  });

  it("失敗の計画は、その reason の文言を返す", () => {
    expect(describeNodeSplitStatus(false, { ok: false, reason: "separator-empty" })).toBe("区切り文字を入力してください。");
    expect(describeNodeSplitStatus(false, { ok: false, reason: "not-splittable" })).toBe("区切り文字で 2 つ以上に分けられません。");
    expect(describeNodeSplitStatus(false, { ok: false, reason: "too-many-fragments" })).toBe("分割できるのは 200 件までです。");
    expect(describeNodeSplitStatus(false, { ok: false, reason: "node-missing" })).toBe("分割できるノードが選択されていません。");
  });
});

describe("describeNodeMergeStatus", () => {
  const nodes = [node(1, "a"), node(2, "b"), node(3, "c")];

  it("stale のときは、計画より先に更新を促す文言を返す", () => {
    expect(describeNodeMergeStatus(true, okPlan(nodes, [1, 2], 1))).toBe(STALE_DIALOG_MESSAGE);
    expect(describeNodeMergeStatus(true, null)).toBe(STALE_DIALOG_MESSAGE);
  });

  it("計画が無ければ空文字", () => {
    expect(describeNodeMergeStatus(false, null)).toBe("");
  });

  it("成功の計画は、統合するノードの総数を「N件を1件に統合します」で返す", () => {
    expect(describeNodeMergeStatus(false, okPlan(nodes, [1, 2], 1))).toBe("2件を1件に統合します");
    expect(describeNodeMergeStatus(false, okPlan(nodes, [1, 2, 3], 2))).toBe("3件を1件に統合します");
  });

  it("失敗の計画は、その reason の文言を返す", () => {
    expect(describeNodeMergeStatus(false, { ok: false, reason: "too-few-nodes" })).toBe("2 つ以上のノードを選択してください。");
    expect(describeNodeMergeStatus(false, { ok: false, reason: "different-parents" })).toBe("同じ親の兄弟のノードだけを統合できます。");
    expect(describeNodeMergeStatus(false, { ok: false, reason: "primary-missing" })).toBe("主選択のノードがありません。");
  });
});

describe("buildNodeMergePreview", () => {
  it("失敗の計画は null", () => {
    expect(buildNodeMergePreview([], { ok: false, reason: "too-few-nodes" })).toBeNull();
  });

  it("統合後のラベル・重要度の表示・付け替える子の件数・消えるノードのラベルを配列順にまとめる", () => {
    const nodes = [
      node(1, "親"),
      node(2, "りんご", { parentId: 1, importance: "low" }),
      node(3, "リンゴ", { parentId: 1, importance: "high" }),
      node(4, "りんごの子", { parentId: 2 }),
    ];

    expect(buildNodeMergePreview(nodes, okPlan(nodes, [2, 3], 3))).toEqual({
      label: "りんご リンゴ",
      importanceLabel: "高",
      illustrationText: "イラストなし",
      movedChildCount: 1,
      discardedIllustrationCount: 0,
      absorbedLabels: ["りんご"],
      hiddenAbsorbedCount: 0,
    });
  });

  it.each([
    ["low", "低"],
    ["medium", "中"],
    ["high", "高"],
  ] as const)("重要度 %s は「%s」と表示する", (importance, expected) => {
    const nodes = [node(1, "a", { importance }), node(2, "b", { importance })];

    expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.importanceLabel).toBe(expected);
  });

  describe("イラストの扱い", () => {
    const illustration = createJpegDataUrl(100, 100);

    it("主選択が持っていれば「主選択のイラストを残す」", () => {
      const nodes = [node(1, "a", { illustration }), node(2, "b")];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.illustrationText).toBe("主選択のイラストを残す");
    });

    it("吸収されるノードから引き継ぐときは、元のノードのラベルを『』で囲んで示す", () => {
      const nodes = [node(1, "a"), node(2, "引き継ぐ元", { illustration })];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.illustrationText).toBe("『引き継ぐ元』のイラストを引き継ぐ");
    });

    it("引き継ぐ元のラベルが空なら「（空）」、空白だけなら「（空白のみ）」と示す", () => {
      const empty = [node(1, "a"), node(2, "", { illustration })];
      const blank = [node(1, "a"), node(2, "  ", { illustration })];

      expect(buildNodeMergePreview(empty, okPlan(empty, [1, 2], 1))?.illustrationText).toBe("『（空）』のイラストを引き継ぐ");
      expect(buildNodeMergePreview(blank, okPlan(blank, [1, 2], 1))?.illustrationText).toBe("『（空白のみ）』のイラストを引き継ぐ");
    });

    it("失われるイラストの件数を持つ", () => {
      const nodes = [node(1, "a", { illustration }), node(2, "b", { illustration }), node(3, "c", { illustration })];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2, 3], 1))?.discardedIllustrationCount).toBe(2);
    });
  });

  it("消えるノードのラベルは先頭の 200 件までで、超えた分は件数だけを持つ（確定の対象は計画が全件持つ）", () => {
    const nodes = Array.from({ length: NODE_MERGE_PREVIEW_LIMIT + 51 }, (_, index) => node(index + 1, `項目${index + 1}`));
    const plan = okPlan(nodes, nodes.map((item) => item.id), 1);

    const preview = buildNodeMergePreview(nodes, plan);

    expect(NODE_MERGE_PREVIEW_LIMIT).toBe(200);
    expect(plan.ok && plan.absorbedIds).toHaveLength(NODE_MERGE_PREVIEW_LIMIT + 50);
    expect(preview?.absorbedLabels).toHaveLength(NODE_MERGE_PREVIEW_LIMIT);
    expect(preview?.absorbedLabels[0]).toBe("項目2");
    expect(preview?.hiddenAbsorbedCount).toBe(50);
  });

  it("ちょうど 200 件なら超過は 0", () => {
    const nodes = Array.from({ length: NODE_MERGE_PREVIEW_LIMIT + 1 }, (_, index) => node(index + 1, `項目${index + 1}`));

    const preview = buildNodeMergePreview(nodes, okPlan(nodes, nodes.map((item) => item.id), 1));

    expect(preview?.absorbedLabels).toHaveLength(NODE_MERGE_PREVIEW_LIMIT);
    expect(preview?.hiddenAbsorbedCount).toBe(0);
  });
});
```

`client/src/hooks/__tests__/useNodeMergeDialog.test.ts`:

```typescript
import { act, renderHook } from "@testing-library/react";
import { planNodeMerge, type MergeNodesResult, type NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { NODE_MERGE_PREVIEW_LIMIT } from "@/hooks/nodeSeparatorPreview";
import { useNodeMergeDialog } from "@/hooks/useNodeMergeDialog";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";

type Props = {
  mapId?: string;
  nodes?: readonly Node[];
  selectedNodeId?: number | null;
  selectedNodeIds?: readonly number[];
  visibleNodeIds?: ReadonlySet<number>;
  documentRevision?: number;
};

// 1: 親、2: りんご（低）、3: リンゴ（高）、4: バナナ（中）、5: 2 の子、6: 別の根
const illustration = createJpegDataUrl(100, 100);
const baseNodes = [
  createTestNode({ id: 1, parentId: null, label: "親" }),
  createTestNode({ id: 2, parentId: 1, label: "りんご", importance: "low" }),
  createTestNode({ id: 3, parentId: 1, label: "リンゴ", importance: "high", illustration }),
  createTestNode({ id: 4, parentId: 1, label: "バナナ" }),
  createTestNode({ id: 5, parentId: 2, label: "りんごの子" }),
  createTestNode({ id: 6, parentId: null, label: "別の根" }),
];
const baseVisible: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6]);

function setup(initial: Props = {}) {
  const mergeNodes = jest.fn<MergeNodesResult, [readonly number[], number | null, string, ReadonlySet<number>, NodeMergePlan]>(
    () => ({ ok: true, survivorId: 3, absorbedCount: 1 }),
  );
  const publishNotice = jest.fn();
  const view = renderHook(
    (props: Props) => useNodeMergeDialog({
      mapId: props.mapId ?? "a",
      nodes: props.nodes ?? baseNodes,
      selectedNodeId: props.selectedNodeId === undefined ? 3 : props.selectedNodeId,
      selectedNodeIds: props.selectedNodeIds ?? [2, 3],
      visibleNodeIds: props.visibleNodeIds ?? baseVisible,
      documentRevision: props.documentRevision ?? 0,
      mergeNodes,
      publishNotice,
    }),
    { initialProps: initial },
  );
  return { ...view, mergeNodes, publishNotice };
}

describe("useNodeMergeDialog", () => {
  it("開くと、既定の区切り文字（半角スペース）で連結した結果のプレビューが出て、確定できる", () => {
    const view = setup();

    act(() => { view.result.current.open(); });

    expect(view.result.current).toMatchObject({
      screen: "open",
      separatorPreset: "space",
      statusText: "2件を1件に統合します",
      canSubmit: true,
      focusRequest: "separator",
    });
    expect(view.result.current.preview).toEqual({
      label: "りんご リンゴ",
      importanceLabel: "高",
      illustrationText: "主選択のイラストを残す",
      movedChildCount: 1,
      discardedIllustrationCount: 0,
      absorbedLabels: ["りんご"],
      hiddenAbsorbedCount: 0,
    });
  });

  describe("ボタンの有効判定と開く条件", () => {
    it.each([[[]], [[2]]])("選択が %j のとき（2 件未満）は canOpen が偽で、開かず、理由を返す", (selectedNodeIds) => {
      const view = setup({ selectedNodeIds });

      act(() => { view.result.current.open(); });

      expect(view.result.current.canOpen).toBe(false);
      expect(view.result.current.screen).toBe("closed");
      expect(view.result.current.disabledReason).toBe("2 つ以上のノードを選択してください。");
    });

    it("選択が 2 件以上なら canOpen は真で、親が違うなどの理由は開いたあとのプレビューで示す", () => {
      const view = setup({ selectedNodeIds: [2, 6], selectedNodeId: 6 });

      act(() => { view.result.current.open(); });

      expect(view.result.current.canOpen).toBe(true);
      expect(view.result.current.screen).toBe("open");
      expect(view.result.current.preview).toBeNull();
      expect(view.result.current.statusText).toBe("同じ親の兄弟のノードだけを統合できます。");
      expect(view.result.current.canSubmit).toBe(false);
    });
  });

  it("主選択が選択に含まれないときは、理由を示して確定できない", () => {
    const view = setup({ selectedNodeId: null });

    act(() => { view.result.current.open(); });

    expect(view.result.current.statusText).toBe("主選択のノードがありません。");
    expect(view.result.current.canSubmit).toBe(false);
  });

  it("区切り文字を替えると、連結後のラベルが即時に変わる（区切りなし・その他の入力を含む）", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    act(() => { view.result.current.setSeparatorPreset("middle-dot"); });
    expect(view.result.current.preview?.label).toBe("りんご・リンゴ");

    act(() => { view.result.current.setSeparatorPreset("custom"); });
    expect(view.result.current.preview?.label).toBe("りんごリンゴ");
    expect(view.result.current.canSubmit).toBe(true);

    act(() => { view.result.current.setCustomSeparator(" + "); });
    expect(view.result.current.preview?.label).toBe("りんご + リンゴ");
  });

  it("開き直すと、前回の区切り文字を持ち越さず既定に戻る", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    act(() => { view.result.current.setSeparatorPreset("custom"); });
    act(() => { view.result.current.setCustomSeparator("x"); });
    act(() => { view.result.current.close(); });

    act(() => { view.result.current.open(); });

    expect(view.result.current).toMatchObject({ separatorPreset: "space", customSeparator: "" });
  });

  it("開いた後に選択が変わっても、対象は開いた時点の選択集合と主選択のままにする", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    view.rerender({ selectedNodeIds: [4, 6], selectedNodeId: 6 });

    expect(view.result.current.preview?.label).toBe("りんご リンゴ");
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("確定は、開いた後に選択が変わっても、開いた時点の選択集合と主選択を対象にして mergeNodes を呼ぶ", () => {
    const view = setup({ selectedNodeIds: [2, 3], selectedNodeId: 3 });
    act(() => { view.result.current.open(); });

    view.rerender({ selectedNodeIds: [4, 6], selectedNodeId: 6 });
    act(() => { view.result.current.submit(); });

    expect(view.mergeNodes).toHaveBeenCalledTimes(1);
    const [ids, primaryId, , , expected] = view.mergeNodes.mock.calls[0];
    expect(ids).toEqual([2, 3]);
    expect(primaryId).toBe(3);
    expect(expected).toEqual(planNodeMerge(baseNodes, [2, 3], 3, " ", baseVisible));
  });

  it("プレビューは最新の nodes から作る（開いた後にラベルが変わると、連結後のラベルも変わる）", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    view.rerender({ nodes: baseNodes.map((item) => (item.id === 2 ? { ...item, label: "ミカン" } : item)) });

    expect(view.result.current.preview?.label).toBe("ミカン リンゴ");
  });

  it("消えるノードの一覧は先頭の 200 件までで、超えた件数を返す。確定の対象は全件（計画が全件持つ）", () => {
    const many = [
      createTestNode({ id: 1, parentId: null, label: "親" }),
      ...Array.from({ length: NODE_MERGE_PREVIEW_LIMIT + 50 }, (_, index) => (
        createTestNode({ id: index + 2, parentId: 1, label: `項目${index + 2}` })
      )),
    ];
    const ids = many.slice(1).map((item) => item.id);
    const view = setup({
      nodes: many,
      selectedNodeIds: ids,
      selectedNodeId: ids[0],
      visibleNodeIds: new Set(many.map((item) => item.id)),
    });
    act(() => { view.result.current.open(); });

    expect(view.result.current.preview?.absorbedLabels).toHaveLength(NODE_MERGE_PREVIEW_LIMIT);
    expect(view.result.current.preview?.hiddenAbsorbedCount).toBe(49);
    expect(view.result.current.statusText).toBe("250件を1件に統合します");

    act(() => { view.result.current.submit(); });
    const expected = view.mergeNodes.mock.calls[0][4];
    expect(expected.ok && expected.absorbedIds).toHaveLength(NODE_MERGE_PREVIEW_LIMIT + 49);
  });

  describe("確定", () => {
    it("mergeNodes を 1 回、現在のプレビューの計画を expected として呼び、通知して閉じる", () => {
      const view = setup();
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.mergeNodes).toHaveBeenCalledTimes(1);
      const [ids, primaryId, joiner, visibleNodeIds, expected] = view.mergeNodes.mock.calls[0];
      expect(ids).toEqual([2, 3]);
      expect(primaryId).toBe(3);
      expect(joiner).toBe(" ");
      expect(visibleNodeIds).toBe(baseVisible);
      expect(expected).toEqual(planNodeMerge(baseNodes, [2, 3], 3, " ", baseVisible));
      expect(view.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "2 件のノードを 1 件に統合しました。" });
      expect(view.result.current.screen).toBe("closed");
      expect(view.result.current.focusRequest).toBe("header");
    });

    it("成功の通知の件数は、残したノードと吸収した数の合計", () => {
      const view = setup({ selectedNodeIds: [2, 3, 4] });
      view.mergeNodes.mockReturnValueOnce({ ok: true, survivorId: 3, absorbedCount: 2 });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "3 件のノードを 1 件に統合しました。" });
    });

    it("同じ処理での 2 回目の確定は何もしない", () => {
      const view = setup();
      act(() => { view.result.current.open(); });

      act(() => {
        view.result.current.submit();
        view.result.current.submit();
      });

      expect(view.mergeNodes).toHaveBeenCalledTimes(1);
      expect(view.publishNotice).toHaveBeenCalledTimes(1);
    });

    it("計画が失敗しているとき・開いていないときは mergeNodes を呼ばない", () => {
      const failing = setup({ selectedNodeIds: [2, 6], selectedNodeId: 6 });
      act(() => { failing.result.current.open(); });
      act(() => { failing.result.current.submit(); });
      expect(failing.mergeNodes).not.toHaveBeenCalled();

      const closed = setup();
      act(() => { closed.result.current.submit(); });
      expect(closed.mergeNodes).not.toHaveBeenCalled();
    });

    it("mergeNodes が失敗したら閉じず、その reason の文言をエラーに出して通知しない。もう一度確定できる", () => {
      const view = setup();
      view.mergeNodes.mockReturnValueOnce({ ok: false, reason: "plan-changed" });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.result.current.screen).toBe("open");
      expect(view.result.current.error.message).toBe("統合の内容が変わりました。もう一度確認してください。");
      expect(view.publishNotice).not.toHaveBeenCalled();

      act(() => { view.result.current.submit(); });
      expect(view.mergeNodes).toHaveBeenCalledTimes(2);
      expect(view.result.current.screen).toBe("closed");
    });

    it("placement-failed の失敗は「ノードを統合できませんでした。」を出す", () => {
      const view = setup();
      view.mergeNodes.mockReturnValueOnce({ ok: false, reason: "placement-failed" });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.result.current.error.message).toBe("ノードを統合できませんでした。");
    });
  });

  it("開いた後に documentRevision が変わると stale になり、確定できず、状態文言とエラーが更新を促す", () => {
    const view = setup({ documentRevision: 0 });
    act(() => { view.result.current.open(); });

    view.rerender({ documentRevision: 1 });

    expect(view.result.current.canSubmit).toBe(false);
    expect(view.result.current.statusText).toBe("マップが更新されました。閉じてから開き直してください。");
    expect(view.result.current.error.message).toBe("マップが更新されました。閉じてから開き直してください。");
    act(() => { view.result.current.submit(); });
    expect(view.mergeNodes).not.toHaveBeenCalled();
  });

  it("mapId が変わると閉じた扱いになり、ヘッダーへのフォーカスは求めない（元のマップへ戻っても復活しない）", () => {
    const view = setup({ mapId: "a" });
    act(() => { view.result.current.open(); });

    view.rerender({ mapId: "b" });
    expect(view.result.current.screen).toBe("closed");
    expect(view.result.current.focusRequest).toBeNull();

    view.rerender({ mapId: "a" });
    expect(view.result.current.screen).toBe("closed");
  });

  it("フォーカス要求は consumeFocusRequest で消える", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    expect(view.result.current.focusRequest).toBe("separator");

    act(() => { view.result.current.consumeFocusRequest(); });

    expect(view.result.current.focusRequest).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗するテストを書く（Control・Dialog）**

`client/src/components/layout/__tests__/NodeMergeControl.test.tsx`:

```typescript
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeMergeControl } from "@/components/layout/NodeMergeControl";

const REASON = "2 つ以上のノードを選択してください。";

type Props = Parameters<typeof NodeMergeControl>[0];

function renderControl(overrides: Partial<Props> = {}) {
  const props: Props = {
    expanded: false,
    disabled: false,
    disabledReason: REASON,
    onOpen: jest.fn(),
    buttonRef: createRef(),
    ...overrides,
  };
  return { props, ...render(<NodeMergeControl {...props} />) };
}

describe("NodeMergeControl", () => {
  it("ダイアログを開くボタンとして名前・aria 属性を持つ", () => {
    renderControl();

    const button = screen.getByRole("button", { name: "ノードを統合" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("expanded のとき aria-expanded が true になる", () => {
    renderControl({ expanded: true });

    expect(screen.getByRole("button", { name: "ノードを統合" })).toHaveAttribute("aria-expanded", "true");
  });

  it("クリックで onOpen を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderControl();

    await user.click(screen.getByRole("button", { name: "ノードを統合" }));

    expect(props.onOpen).toHaveBeenCalledTimes(1);
  });

  it("有効のときは、理由の説明も title も付けない", () => {
    renderControl();

    const button = screen.getByRole("button", { name: "ノードを統合" });
    expect(button).not.toHaveAttribute("title");
    expect(button).not.toHaveAccessibleDescription();
  });

  it("無効のときは押せず、理由を title と説明（aria-describedby）で示す", async () => {
    const user = userEvent.setup();
    const { props } = renderControl({ disabled: true });

    const button = screen.getByRole("button", { name: "ノードを統合" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", REASON);
    expect(button).toHaveAccessibleDescription(REASON);

    await user.click(button);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("押し続けたリピートの Enter・Space では既定動作を止める（開いた直後のダイアログへ click が届かない）", () => {
    renderControl();
    const button = screen.getByRole("button", { name: "ノードを統合" });

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
  });

  it("buttonRef をボタンへ渡す", () => {
    const buttonRef = createRef<HTMLButtonElement>();

    renderControl({ buttonRef });

    expect(buttonRef.current).toBe(screen.getByRole("button", { name: "ノードを統合" }));
  });
});
```

`client/src/components/layout/__tests__/NodeMergeDialog.test.tsx`:

```typescript
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeMergeDialog } from "@/components/layout/NodeMergeDialog";
import type { NodeMergePreview } from "@/hooks/nodeSeparatorPreview";

type Props = ComponentProps<typeof NodeMergeDialog>;

function preview(overrides: Partial<NodeMergePreview> = {}): NodeMergePreview {
  return {
    label: "りんご リンゴ",
    importanceLabel: "高",
    illustrationText: "イラストなし",
    movedChildCount: 0,
    discardedIllustrationCount: 0,
    absorbedLabels: ["りんご"],
    hiddenAbsorbedCount: 0,
    ...overrides,
  };
}

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    preview: preview(),
    separatorPreset: "space",
    customSeparator: "",
    statusText: "2件を1件に統合します",
    error: { sequence: 0, message: null },
    canSubmit: true,
    focusRequest: null,
    onFocusRequestApplied: jest.fn(),
    onSeparatorPresetChange: jest.fn(),
    onCustomSeparatorChange: jest.fn(),
    onCancel: jest.fn(),
    onSubmit: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeMergeDialog {...props} />) };
}

describe("NodeMergeDialog", () => {
  it("名前付きのモーダルダイアログとして、区切り文字の入力を可視のラベルつきで出す", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "ノードを統合" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(/主選択のノードへ 1 つにまとめます/);
    expect(within(dialog).getByLabelText("区切り文字")).toHaveValue("space");
    expect(dialog).toHaveClass("max-h-full", "overflow-y-auto");
  });

  it("focusRequest が separator なら区切り文字のプルダウンへフォーカスし、要求の消費を通知する", () => {
    const { props } = renderDialog({ focusRequest: "separator" });

    expect(screen.getByLabelText("区切り文字")).toHaveFocus();
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("プルダウンの選択と「その他」の入力を通知する", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog();

    await user.selectOptions(screen.getByLabelText("区切り文字"), "ja-comma");
    expect(props.onSeparatorPresetChange).toHaveBeenCalledWith("ja-comma");

    rerender(<NodeMergeDialog {...props} separatorPreset="custom" />);
    fireEvent.change(screen.getByLabelText("その他の区切り文字"), { target: { value: " | " } });
    expect(props.onCustomSeparatorChange).toHaveBeenCalledWith(" | ");
  });

  it("状態文言を常設のライブリージョンに出し、中身だけを替える", () => {
    const { rerender, props } = renderDialog({ statusText: "2件を1件に統合します" });
    const region = screen.getByText("2件を1件に統合します");
    expect(region).toHaveAttribute("aria-live", "polite");

    rerender(<NodeMergeDialog {...props} statusText="同じ親の兄弟のノードだけを統合できます。" preview={null} />);
    expect(screen.getByText("同じ親の兄弟のノードだけを統合できます。")).toBe(region);
  });

  describe("プレビュー", () => {
    it("統合後のラベル・重要度・イラストの扱い・付け替える子の件数を出す", () => {
      renderDialog({
        preview: preview({ label: "りんご リンゴ", importanceLabel: "高", illustrationText: "主選択のイラストを残す", movedChildCount: 2 }),
      });

      expect(screen.getByText("統合後のラベル").nextElementSibling).toHaveTextContent("りんご リンゴ");
      expect(screen.getByText("重要度").nextElementSibling).toHaveTextContent("高");
      expect(screen.getByText("イラスト").nextElementSibling).toHaveTextContent("主選択のイラストを残す");
      expect(screen.getByText("付け替える子").nextElementSibling).toHaveTextContent("2件");
    });

    it("統合後のラベルは前後の空白を畳まず、折り返して全文を出す。空白だけが違う結果を見分けられる（L-821）", () => {
      const { rerender, props } = renderDialog({ preview: preview({ label: "A  B" }) });
      const label = screen.getByText("統合後のラベル").nextElementSibling!;
      expect(label.textContent).toBe("A  B");
      expect(label).toHaveClass("whitespace-pre-wrap", "break-words");

      rerender(<NodeMergeDialog {...props} preview={preview({ label: "A B" })} />);
      expect(screen.getByText("統合後のラベル").nextElementSibling!.textContent).toBe("A B");
    });

    it("統合後のラベルが空なら「（空）」、空白だけなら「（空白のみ）」と出す", () => {
      const { rerender, props } = renderDialog({ preview: preview({ label: "" }) });
      expect(screen.getByText("統合後のラベル").nextElementSibling).toHaveTextContent("（空）");

      rerender(<NodeMergeDialog {...props} preview={preview({ label: "  " })} />);
      expect(screen.getByText("統合後のラベル").nextElementSibling).toHaveTextContent("（空白のみ）");
    });

    it("失われるイラストが 1 件以上なら警告を出し、0 件のときは出さない", () => {
      const { rerender, props } = renderDialog({ preview: preview({ discardedIllustrationCount: 2 }) });
      expect(screen.getByText("2件のイラストは統合で失われます")).toBeInTheDocument();

      rerender(<NodeMergeDialog {...props} preview={preview({ discardedIllustrationCount: 0 })} />);
      expect(screen.queryByText(/イラストは統合で失われます/)).toBeNull();
    });

    it("統合されて消えるノードのラベルを一覧にし、空・空白だけのラベルは代わりの表示にする", () => {
      renderDialog({ preview: preview({ absorbedLabels: ["りんご", "", " "] }) });

      const list = screen.getByRole("list", { name: "統合されて消えるノード" });
      const items = within(list).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual(["りんご", "（空）", "（空白のみ）"]);
      expect(list).toHaveClass("max-h-60", "shrink-0", "overflow-y-auto");
    });

    it("一覧の行は前後の空白を畳まず、折り返して全文を出す", () => {
      renderDialog({ preview: preview({ absorbedLabels: ["a  b"] }) });

      const item = screen.getByRole("list", { name: "統合されて消えるノード" }).firstElementChild!;
      expect(item.firstElementChild!.textContent).toBe("a  b");
      expect(item.firstElementChild).toHaveClass("whitespace-pre-wrap", "break-words");
    });

    it("一覧は 200 行までで、超えた分は「ほかに K 件」を出す（200 行ちょうどなら出さない）", () => {
      const labels = Array.from({ length: 200 }, (_, index) => `項目${index}`);
      const { rerender, props } = renderDialog({ preview: preview({ absorbedLabels: labels, hiddenAbsorbedCount: 0 }) });
      expect(within(screen.getByRole("list", { name: "統合されて消えるノード" })).getAllByRole("listitem")).toHaveLength(200);
      expect(screen.queryByText(/^ほかに/)).toBeNull();

      rerender(<NodeMergeDialog {...props} preview={preview({ absorbedLabels: labels, hiddenAbsorbedCount: 50 })} />);
      expect(within(screen.getByRole("list", { name: "統合されて消えるノード" })).getAllByRole("listitem")).toHaveLength(200);
      expect(screen.getByText("ほかに 50 件")).toBeInTheDocument();
    });

    it("統合できないとき（プレビューが null）は、プレビューを一切出さない", () => {
      renderDialog({ preview: null, canSubmit: false, statusText: "2 つ以上のノードを選択してください。" });

      expect(screen.queryByRole("list")).toBeNull();
      expect(screen.queryByText("統合後のラベル")).toBeNull();
      expect(screen.getByText("2 つ以上のノードを選択してください。")).toBeInTheDocument();
    });
  });

  describe("確定とキャンセル", () => {
    it("確定ボタン「統合する」は canSubmit が偽なら無効で、真なら押して onSubmit を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props, rerender } = renderDialog({ canSubmit: false });
      expect(screen.getByRole("button", { name: "統合する" })).toBeDisabled();

      rerender(<NodeMergeDialog {...props} canSubmit />);
      await user.click(screen.getByRole("button", { name: "統合する" }));
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("キャンセルボタンで onCancel を呼ぶ", async () => {
      const user = userEvent.setup();
      const { props } = renderDialog();

      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it("確定・キャンセルのボタンはリピートの Enter・Space の既定動作を止める", () => {
      renderDialog();

      for (const name of ["統合する", "キャンセル"]) {
        const button = screen.getByRole("button", { name });
        expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
        expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
      }
    });

    it("ダブルクリックの 2 回目のクリックは握りつぶし、マウスのクリックを親へ通知する", () => {
      const { props } = renderDialog();
      const button = screen.getByRole("button", { name: "統合する" });

      fireEvent.click(button, { detail: 1 });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
      expect(props.onMouseClick).toHaveBeenCalledTimes(1);

      fireEvent.click(button, { detail: 2 });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("キーボード・支援技術のクリック（detail 0）では確定でき、マウスのクリックとしては通知しない", () => {
      const { props } = renderDialog();

      fireEvent.click(screen.getByRole("button", { name: "統合する" }), { detail: 0 });

      expect(props.onSubmit).toHaveBeenCalledTimes(1);
      expect(props.onMouseClick).not.toHaveBeenCalled();
    });
  });

  describe("キー操作", () => {
    it("プルダウンで Escape を押すと onCancel を呼ぶ", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Escape" });

      expect(props.onCancel).toHaveBeenCalledTimes(1);
    });

    it("IME 変換中（isComposing）の Escape では閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Escape", isComposing: true });

      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it("IME 変換中（keyCode が 229）の Escape では閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Escape", keyCode: 229 });

      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it("プルダウンの Enter では確定しない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Enter" });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it("「その他」の入力欄の Enter は、確定できるときだけ onSubmit を呼ぶ", () => {
      const { props, rerender } = renderDialog({ separatorPreset: "custom", canSubmit: false });
      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });
      expect(props.onSubmit).not.toHaveBeenCalled();

      rerender(<NodeMergeDialog {...props} canSubmit />);
      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
      ["リピート", { repeat: true }],
    ])("「その他」の入力欄の Enter は %s のとき確定しない", (_name, init) => {
      const { props } = renderDialog({ separatorPreset: "custom" });

      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter", ...init });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });
  });

  it("エラーを role=alert に出す（再読み上げのため次のフレームで入る）", async () => {
    renderDialog({ error: { sequence: 1, message: "統合の内容が変わりました。もう一度確認してください。" } });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("統合の内容が変わりました。もう一度確認してください。"));
  });

  it("エラーが無いときも role=alert の領域を常に描画する", () => {
    renderDialog();

    expect(screen.getByRole("alert")).toHaveTextContent("");
  });
});
```

- [ ] **Step 3: 失敗するページ統合テストを書く**

`client/src/app/__tests__/pageNodeMerge.test.tsx`。`jest.mock` 群・`beforeEach` は `pageNodeSplit.test.tsx` の先頭に倣い、下のコードに全文を含める。複数選択は `Cmd`/`Ctrl`+クリック（`ctrlKey`）のトグルで、押したノードが主選択になる。統合後の配列は、2 を消し、2 の子 5 を残す 3 の子 6 の直後へ付け替えた `[1, 3, 4, 6, 5, 7]`（4 は 6 より前にある兄弟）。`onMouseClick` の配線は、分割と同じく `Date.now` を固定した 500ms の時間窓のテストで確かめる（統合後は残したノードだけが選択されるので、解除されたかは「ノードを分割」の有効・無効で見る）。`MapEditor` の `NodeMergeDialog` の `onMouseClick` を空にすると、このテストが落ちる:

```typescript
import { act, fireEvent, screen } from "@testing-library/react";
import {
  dialog,
  exportedMap,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  stageContainer,
  undoButton,
  v3Json,
} from "@/app/testing/pageTestHelpers";
import {
  mockNodePointerHandlers,
  mockStage,
  mockStageHandlers,
  pointer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から useMapLibrary・MapEditor・
// ヘッダー・ダイアログ・通知領域までは本物を通す
jest.mock("pixi.js", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createPagePixiModuleMock()
));

jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return { ...actual, generateIllustrationThumbnail: jest.fn() };
});

const mockDownloadMapJson = jest.fn();
jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return {
    ...actual,
    downloadMapJson: (json: string, mapName: string) => mockDownloadMapJson(json, mapName),
  };
});

jest.mock("@/services/imageExport/mapTextMeasurement", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createMapTextMeasurementModuleMock()
));

const mockDownloadMapImage = jest.fn();
jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: (blob: Blob, fileName: string) => mockDownloadMapImage(blob, fileName),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => jest.restoreAllMocks());

// 1: 親（ルート）、2: りんご（低）、3: リンゴ（高）、4: バナナ、2 の子 5・3 の子 6、7: 別の根。2・3・4 は 1 の子で兄弟
function seed() {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "統合テスト",
      json: v3Json([
        { id: 1, label: "プロジェクト", x: 100, y: 100 },
        { id: 2, parentId: 1, label: "りんご", x: 300, y: 100, importance: "low" },
        { id: 3, parentId: 1, label: "リンゴ", x: 300, y: 300, importance: "high" },
        { id: 4, parentId: 1, label: "バナナ", x: 300, y: 500 },
        { id: 5, parentId: 2, label: "りんごの子", x: 500, y: 100 },
        { id: 6, parentId: 3, label: "リンゴの子", x: 500, y: 300 },
        { id: 7, label: "別の根", x: 100, y: 700 },
      ]),
    },
  ], { currentMapId: "a" });
}

const NODE_COUNT = 7;
const ORIGINAL_IDS = [1, 2, 3, 4, 5, 6, 7];
// 統合後: 2 が消え、2 の子 5 は、残す 3 の直下の子のうち配列順で最後の 6 の直後へ付け替わる
const MERGED_IDS = [1, 3, 4, 6, 5, 7];

// selectNode と同じ手順で、Cmd/Ctrl を押しながらノードを押して選択へ加える（index は 0 始まり）。押したノードが主選択になる
function toggleSelectNode(index: number, nodeCount: number) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(0, 0, { ctrlKey: true }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}

// 2（りんご）を選んでから 3（リンゴ）を足す。選択は [2, 3]、主選択は 3
function selectAppleAndApple() {
  selectNode(1, NODE_COUNT);
  toggleSelectNode(2, NODE_COUNT);
}

function openDialog() {
  fireEvent.click(headerButton("ノードを統合"));
}

// 空きキャンバスを押す。mousedown の既定の動作（フォーカスの移動）が許されるなら true を返す
function pressBlankCanvas() {
  act(() => {
    mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
  return fireEvent.mouseDown(stageContainer());
}

function nodesOf() {
  return exportedMap(mockDownloadMapJson).nodes;
}

function idsOf(): number[] {
  return nodesOf().map((node) => node.id);
}

describe("ノードの統合", () => {
  it("複数選択を統合すると、主選択が残り、ラベルが連結され、重要度は最も高いものになり、子が付け替えられる", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();

    openDialog();
    expect(dialog().getByText("2件を1件に統合します")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(idsOf()).toEqual(MERGED_IDS);
    const nodes = nodesOf();
    expect(nodes[1]).toMatchObject({ id: 3, parentId: 1, label: "りんご リンゴ", importance: "high", x: 300, y: 300 });
    expect(nodes[4]).toMatchObject({ id: 5, parentId: 3, x: 500, y: 100 });
    expect(screen.getByText("2 件のノードを 1 件に統合しました。")).toBeInTheDocument();
  });

  it("確定全体を 1 回の Undo で戻し、1 回の Redo でやり直せる", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    fireEvent.click(undoButton());
    expect(idsOf()).toEqual(ORIGINAL_IDS);
    expect(nodesOf()[1]).toMatchObject({ id: 2, label: "りんご", importance: "low" });
    expect(nodesOf()[4]).toMatchObject({ id: 5, parentId: 2 });

    fireEvent.click(redoButton());
    expect(idsOf()).toEqual(MERGED_IDS);
  });

  it("確定後は選択が残したノードだけになり、ボタンが無効になるので、フォーカスは常に押せる「JSON書き出し」へ移る", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();

    fireEvent.click(dialog().getByRole("button", { name: "統合する" }), { detail: 1 });

    expect(headerButton("ノードを統合")).toBeDisabled();
    expect(screen.getByRole("button", { name: "JSON書き出し" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("区切り文字を替えると、プレビューの連結後のラベルが変わり、「その他」を空にすると区切りなしで連結する", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();
    expect(dialog().getByText("統合後のラベル").nextElementSibling).toHaveTextContent("りんご リンゴ");

    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "middle-dot" } });
    expect(dialog().getByText("統合後のラベル").nextElementSibling).toHaveTextContent("りんご・リンゴ");

    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "custom" } });
    fireEvent.keyDown(dialog().getByLabelText("その他の区切り文字"), { key: "Enter" });

    expect(nodesOf().find((node) => node.id === 3)?.label).toBe("りんごリンゴ");
  });

  it("プレビューに、重要度・付け替える子の件数・統合されて消えるノードを出す", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();

    openDialog();

    expect(dialog().getByText("重要度").nextElementSibling).toHaveTextContent("高");
    expect(dialog().getByText("イラスト").nextElementSibling).toHaveTextContent("イラストなし");
    expect(dialog().getByText("付け替える子").nextElementSibling).toHaveTextContent("1件");
    expect(dialog().getByRole("list", { name: "統合されて消えるノード" })).toHaveTextContent("りんご");
  });

  it("親が違うノードを選んでいるときは、理由を文言で示して確定できない（キャンセルで閉じ、フォーカスが戻る）", async () => {
    seed();
    await renderPage();
    selectNode(1, NODE_COUNT);
    toggleSelectNode(6, NODE_COUNT);

    openDialog();
    expect(dialog().getByText("同じ親の兄弟のノードだけを統合できます。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "統合する" })).toBeDisabled();
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(headerButton("ノードを統合")).toHaveFocus();
    expect(idsOf()).toEqual(ORIGINAL_IDS);
  });

  it("選択が 1 件以下のときはボタンが無効で、理由を title で示す。2 件になると有効になる", async () => {
    seed();
    await renderPage();

    expect(headerButton("ノードを統合")).toBeDisabled();
    selectNode(1, NODE_COUNT);
    const button = headerButton("ノードを統合");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "2 つ以上のノードを選択してください。");

    toggleSelectNode(2, NODE_COUNT);
    expect(headerButton("ノードを統合")).toBeEnabled();
  });

  it("ダイアログが開いている間は、履歴ショートカットが働かず、編集画面の根が inert になる（開く前は同じ操作で Undo される）", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));
    const mergedIds = idsOf();

    // 前提: ダイアログを開く前なら、同じ操作で戻る
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(idsOf()).toEqual(ORIGINAL_IDS);
    fireEvent.click(redoButton());
    expect(idsOf()).toEqual(mergedIds);

    // 統合し直せるよう、元に戻してから複数選択して開く
    fireEvent.click(undoButton());
    selectAppleAndApple();
    openDialog();
    expect(document.querySelector("[data-map-id]")).toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(idsOf()).toEqual(ORIGINAL_IDS);
  });

  it("ダイアログが開いている間は、表示の切り替え（マップ・アウトライン）も働かない（L-061）", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(headerButton("ノードを統合")).toBeInTheDocument();
  });

  it("「統合する」の 1 回目のクリックで閉じた後、キャンバスへ届いた 500ms 以内の押下・dblclick は効かず、500ms を過ぎると選択を解除する", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();

    // 開いた時刻と区別できるよう、時刻をずらしてから押す（確定のクリックが時刻を記録したことを確かめる）
    now.mockReturnValue(10_200);
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }), { detail: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    now.mockReturnValue(10_699);
    const allowsFocusMove = pressBlankCanvas();
    fireEvent.doubleClick(stageContainer(), { detail: 2, clientX: 600, clientY: 450 });

    // 統合後は残したノード 1 件だけが選択されている。500ms 以内の押下では解除されず、dblclick でノードも増えない
    expect(allowsFocusMove).toBe(false);
    expect(headerButton("ノードを分割")).toBeEnabled();
    expect(idsOf()).toEqual(MERGED_IDS);

    now.mockReturnValue(10_700);
    expect(pressBlankCanvas()).toBe(true);
    expect(headerButton("ノードを分割")).toBeDisabled();
  });

  it("アウトライン表示では「ノードを統合」ボタンが出ず、マップ表示へ戻すと出る", async () => {
    seed();
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.queryByRole("button", { name: "ノードを統合" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "マップ" }));
    });
    expect(screen.getByRole("button", { name: "ノードを統合" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/nodeSeparatorPreview.test.ts src/hooks/__tests__/useNodeMergeDialog.test.ts src/components/layout/__tests__/NodeMergeControl.test.tsx src/components/layout/__tests__/NodeMergeDialog.test.tsx src/app/__tests__/pageNodeMerge.test.tsx`
Expected: FAIL（`describeNodeMergeStatus` などが無い、モジュールが無い。ページテストは「ノードを統合」ボタンが無い）

- [ ] **Step 5: 実装する（状態文言とプレビューの組み立て・フック）**

`client/src/hooks/nodeSeparatorPreview.ts`（Task 6 の内容に、統合の定数・型・関数を足した全体で置き換える。分割の `describeNodeSplitStatus` は変えない）:

```typescript
import type { NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { formatNodeMergeFailureNotice } from "@/domain/nodes/nodeMergeMessages";
import type { NodeSplitPlan } from "@/domain/nodes/nodeSplit";
import { formatNodeSplitFailureNotice } from "@/domain/nodes/nodeSplitMessages";
import { STALE_DIALOG_MESSAGE, formatPreviewLabel } from "@/hooks/dialogPreviewText";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

// 統合のプレビューに並べる「統合されて消えるノード」の最大行数。超えた分は件数だけ示し、確定の対象には含める
export const NODE_MERGE_PREVIEW_LIMIT = 200;

const IMPORTANCE_LABELS: Record<NodeImportance, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export type NodeMergePreview = {
  // 統合後のラベル（整形前。表示側で formatPreviewLabel を通す）
  label: string;
  importanceLabel: string;
  illustrationText: string;
  movedChildCount: number;
  discardedIllustrationCount: number;
  // 統合されて消えるノードのラベル（配列順で先頭から NODE_MERGE_PREVIEW_LIMIT 件まで。整形前）
  absorbedLabels: readonly string[];
  hiddenAbsorbedCount: number;
};

// 分割ダイアログの状態文言（常設のライブリージョンに出す）。stale を最優先し、失敗の計画はその reason の文言にする
export function describeNodeSplitStatus(stale: boolean, plan: NodeSplitPlan | null): string {
  if (stale) return STALE_DIALOG_MESSAGE;
  if (plan === null) return "";
  if (!plan.ok) return formatNodeSplitFailureNotice(plan.reason).message;
  return `${plan.fragments.length}件に分割します（${plan.fragments.length - 1}件を追加）`;
}

// 統合ダイアログの状態文言。stale を最優先し、失敗の計画はその reason の文言にする
export function describeNodeMergeStatus(stale: boolean, plan: NodeMergePlan | null): string {
  if (stale) return STALE_DIALOG_MESSAGE;
  if (plan === null) return "";
  if (!plan.ok) return formatNodeMergeFailureNotice(plan.reason).message;
  return `${plan.absorbedIds.length + 1}件を1件に統合します`;
}

function describeIllustration(plan: Extract<NodeMergePlan, { ok: true }>, labelById: ReadonlyMap<number, string>): string {
  if (plan.illustrationFrom === "primary") return "主選択のイラストを残す";
  if (plan.illustrationFrom === "none") return "イラストなし";
  const sourceLabel = plan.illustrationSourceId === null ? "" : labelById.get(plan.illustrationSourceId) ?? "";
  return `『${formatPreviewLabel(sourceLabel)}』のイラストを引き継ぐ`;
}

// 統合の計画をプレビューの表示用にまとめる。失敗の計画（見せるものが無い）は null
export function buildNodeMergePreview(nodes: readonly Node[], plan: NodeMergePlan): NodeMergePreview | null {
  if (!plan.ok) return null;
  const labelById = new Map(nodes.map((node) => [node.id, node.label]));
  const absorbedLabels = plan.absorbedIds.map((id) => labelById.get(id) ?? "");
  return {
    label: plan.label,
    importanceLabel: IMPORTANCE_LABELS[plan.importance],
    illustrationText: describeIllustration(plan, labelById),
    movedChildCount: plan.movedChildCount,
    discardedIllustrationCount: plan.discardedIllustrationCount,
    absorbedLabels: absorbedLabels.slice(0, NODE_MERGE_PREVIEW_LIMIT),
    hiddenAbsorbedCount: Math.max(0, absorbedLabels.length - NODE_MERGE_PREVIEW_LIMIT),
  };
}
```

`client/src/hooks/useNodeMergeDialog.ts`:

```typescript
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { planNodeMerge, type MergeNodesResult, type NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { formatNodeMergeFailureNotice } from "@/domain/nodes/nodeMergeMessages";
import { MERGE_DEFAULT_SEPARATOR } from "@/domain/nodes/nodeSeparator";
import {
  closeNodeSeparatorDialog,
  consumeNodeSeparatorFocusRequest,
  createNodeSeparatorDialogState,
  currentNodeSeparator,
  dismissNodeSeparatorDialog,
  failNodeSeparatorDialog,
  isNodeSeparatorDialogOpen,
  openNodeSeparatorDialog,
  setNodeSeparatorCustom,
  setNodeSeparatorPreset,
  staleNodeSeparatorError,
  type NodeSeparatorError,
  type NodeSeparatorFocusRequest,
} from "@/hooks/nodeSeparatorDialogState";
import { buildNodeMergePreview, describeNodeMergeStatus, type NodeMergePreview } from "@/hooks/nodeSeparatorPreview";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

export type UseNodeMergeDialogOptions = {
  mapId: string;
  nodes: readonly Node[];
  selectedNodeId: number | null;
  selectedNodeIds: readonly number[];
  visibleNodeIds: ReadonlySet<number>;
  documentRevision: number;
  mergeNodes: (
    ids: readonly number[],
    primaryId: number | null,
    joiner: string,
    visibleNodeIds: ReadonlySet<number>,
    expected: NodeMergePlan,
  ) => MergeNodesResult;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseNodeMergeDialogReturn = {
  screen: "closed" | "open";
  // 「ノードを統合」ボタンの有効判定（選択が 2 件以上。親が違うなどの理由は、開いたあとのプレビューで示す）
  canOpen: boolean;
  disabledReason: string;
  separatorPreset: string;
  customSeparator: string;
  // 計画が失敗しているときは null
  preview: NodeMergePreview | null;
  statusText: string;
  error: NodeSeparatorError;
  focusRequest: NodeSeparatorFocusRequest;
  canSubmit: boolean;
  open: () => void;
  close: () => void;
  setSeparatorPreset: (presetId: string) => void;
  setCustomSeparator: (value: string) => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};

// 開いた時点の選択集合と主選択を固定する。プレビューは最新の nodes から作り、確定は現在のプレビューの計画を expected として渡す
// （フックが最新の状態から再計画して照合する）。入力は即時に反映し、useDeferredValue で遅らせない（古いプレビューを確定できる隙間を作らない）
export function useNodeMergeDialog(options: UseNodeMergeDialogOptions): UseNodeMergeDialogReturn {
  const [state, setState] = useState(createNodeSeparatorDialogState);
  const open = isNodeSeparatorDialogOpen(state, options.mapId);
  // 別のマップへ切り替わったら、閉じた状態へ戻す（フォーカスは奪わない）。元のマップへ戻っても古い入力は復活しない
  if (state.screen === "open" && !open) setState(dismissNodeSeparatorDialog);
  const stale = open && state.openedRevision !== options.documentRevision;
  const target = open && state.target?.kind === "merge" ? state.target : null;
  const joiner = currentNodeSeparator(state);
  const plan = useMemo(
    () => (target === null
      ? null
      : planNodeMerge(options.nodes, target.ids, target.primaryId, joiner, options.visibleNodeIds)),
    [target, options.nodes, options.visibleNodeIds, joiner],
  );
  const preview = useMemo(
    () => (plan === null ? null : buildNodeMergePreview(options.nodes, plan)),
    [plan, options.nodes],
  );
  const canSubmit = plan !== null && plan.ok && !stale;
  // 古いハンドラを呼ばれても、最後に commit された値で再判定する
  const latest = useLatestRef({ options, state, plan, canSubmit, joiner });
  const submittedRef = useRef(false);

  const openDialog = useCallback(() => {
    const { options: current } = latest.current;
    if (current.selectedNodeIds.length < 2) return;
    submittedRef.current = false;
    setState((prev) => openNodeSeparatorDialog(prev, {
      target: { kind: "merge", ids: current.selectedNodeIds, primaryId: current.selectedNodeId },
      defaultSeparator: MERGE_DEFAULT_SEPARATOR,
      revision: current.documentRevision,
      mapId: current.mapId,
    }));
  }, [latest]);

  const close = useCallback(() => {
    setState(closeNodeSeparatorDialog);
  }, []);

  const setSeparatorPreset = useCallback((presetId: string) => {
    setState((prev) => setNodeSeparatorPreset(prev, presetId));
  }, []);

  const setCustomSeparator = useCallback((value: string) => {
    setState((prev) => setNodeSeparatorCustom(prev, value));
  }, []);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeNodeSeparatorFocusRequest);
  }, []);

  const submit = useCallback(() => {
    const { options: current, state: snapshot, plan: shownPlan, canSubmit: valid, joiner: shownJoiner } = latest.current;
    // 通常は canSubmit が偽でボタンが無効なので到達しない。古いハンドラや、確定を押した同じ処理での 2 回目の呼び出しでも
    // 何も変えない（stale・開いていない・計画の失敗は canSubmit に含まれる）
    if (!valid || submittedRef.current || shownPlan === null || snapshot.target?.kind !== "merge") return;

    const result = current.mergeNodes(
      snapshot.target.ids,
      snapshot.target.primaryId,
      shownJoiner,
      current.visibleNodeIds,
      shownPlan,
    );
    if (!result.ok) {
      setState((prev) => failNodeSeparatorDialog(prev, formatNodeMergeFailureNotice(result.reason).message));
      return;
    }
    submittedRef.current = true;
    current.publishNotice({ kind: "status", message: `${result.absorbedCount + 1} 件のノードを 1 件に統合しました。` });
    close();
  }, [close, latest]);

  return {
    screen: open ? "open" : "closed",
    canOpen: options.selectedNodeIds.length >= 2,
    disabledReason: formatNodeMergeFailureNotice("too-few-nodes").message,
    separatorPreset: state.separatorPreset,
    customSeparator: state.customSeparator,
    preview,
    statusText: describeNodeMergeStatus(stale, plan),
    error: stale ? staleNodeSeparatorError(state.error) : state.error,
    // 外から閉じられた（mapId が変わった）ときは dismissNodeSeparatorDialog が null にしている
    focusRequest: state.focusRequest,
    canSubmit,
    open: openDialog,
    close,
    setSeparatorPreset,
    setCustomSeparator,
    consumeFocusRequest,
    submit,
  };
}
```

- [ ] **Step 6: 実装する（Control・Dialog）**

`client/src/components/layout/NodeMergeControl.tsx`:

```typescript
import { useId, type Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

type NodeMergeControlProps = {
  expanded: boolean;
  disabled: boolean;
  // 無効のときに、title と aria-describedby の説明で示す理由
  disabledReason: string;
  onOpen: () => void;
  buttonRef: Ref<HTMLButtonElement>;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeMergeControl({ expanded, disabled, disabledReason, onOpen, buttonRef }: NodeMergeControlProps) {
  const reasonId = useId();

  // 押し続けた Enter・Space の click 合成が、開いた直後のダイアログへ届かないようにする
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-describedby={disabled ? reasonId : undefined}
        title={disabled ? disabledReason : undefined}
        disabled={disabled}
        onClick={onOpen}
        onKeyDown={preventRepeatedActivationClick}
      >
        ノードを統合
      </button>
      {disabled && <span id={reasonId} className="sr-only">{disabledReason}</span>}
    </>
  );
}
```

`client/src/components/layout/NodeMergeDialog.tsx`:

```typescript
"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { NodeSeparatorField } from "@/components/layout/NodeSeparatorField";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import { formatPreviewLabel } from "@/hooks/dialogPreviewText";
import type { NodeSeparatorError, NodeSeparatorFocusRequest } from "@/hooks/nodeSeparatorDialogState";
import type { NodeMergePreview } from "@/hooks/nodeSeparatorPreview";

type NodeMergeDialogProps = {
  // 統合できないとき（計画の失敗）は null
  preview: NodeMergePreview | null;
  separatorPreset: string;
  customSeparator: string;
  statusText: string;
  error: NodeSeparatorError;
  canSubmit: boolean;
  focusRequest: NodeSeparatorFocusRequest;
  onFocusRequestApplied: () => void;
  onSeparatorPresetChange: (presetId: string) => void;
  onCustomSeparatorChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMouseClick: () => void;
};

// 前後の空白を畳まず、長いラベルも折り返して全文を見せる（L-821）
const labelClassName = "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

export function NodeMergeDialog({
  preview,
  separatorPreset,
  customSeparator,
  statusText,
  error,
  canSubmit,
  focusRequest,
  onFocusRequestApplied,
  onSeparatorPresetChange,
  onCustomSeparatorChange,
  onCancel,
  onSubmit,
  onMouseClick,
}: NodeMergeDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const absorbedHeadingId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });
  const shownError = useReannouncedNotice(error.sequence, error);

  useLayoutEffect(() => {
    if (focusRequest !== "separator") return;
    selectRef.current?.focus();
    onFocusRequestApplied();
  }, [focusRequest, onFocusRequestApplied]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold">ノードを統合</h2>
        <p id={descriptionId} className="text-sm">
          選択中の同じ親の兄弟ノードを、主選択のノードへ 1 つにまとめます。ほかのノードは消え、その子は主選択のノードの子の末尾へ付け替えられます。
        </p>
        <NodeSeparatorField
          preset={separatorPreset}
          customSeparator={customSeparator}
          selectRef={selectRef}
          onPresetChange={onSeparatorPresetChange}
          onCustomSeparatorChange={onCustomSeparatorChange}
          onCustomEnter={() => {
            if (canSubmit) onSubmit();
          }}
        />
        {/* ライブリージョンは常に描画し、中身だけを替える */}
        <p aria-live="polite" className="text-sm font-medium">{statusText}</p>
        {preview !== null && (
          <>
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="font-medium">統合後のラベル</dt>
                <dd className={labelClassName}>{formatPreviewLabel(preview.label)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium">重要度</dt>
                <dd>{preview.importanceLabel}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium">イラスト</dt>
                <dd className={labelClassName}>{preview.illustrationText}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium">付け替える子</dt>
                <dd>{`${preview.movedChildCount}件`}</dd>
              </div>
            </dl>
            {preview.discardedIllustrationCount > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {`${preview.discardedIllustrationCount}件のイラストは統合で失われます`}
              </p>
            )}
            <p id={absorbedHeadingId} className="text-sm font-medium">統合されて消えるノード</p>
            <ul aria-labelledby={absorbedHeadingId} className="flex max-h-60 shrink-0 flex-col gap-1 overflow-y-auto text-sm">
              {preview.absorbedLabels.map((label, index) => (
                <li key={index} className="rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                  <span className={labelClassName}>{formatPreviewLabel(label)}</span>
                </li>
              ))}
            </ul>
            {preview.hiddenAbsorbedCount > 0 && (
              <p className="text-sm">{`ほかに ${preview.hiddenAbsorbedCount} 件`}</p>
            )}
          </>
        )}
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">{shownError?.message ?? ""}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            onKeyDown={preventRepeatedActivationClick}
            className="rounded border px-3 py-2 text-sm"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            onKeyDown={preventRepeatedActivationClick}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            統合する
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `MapEditor.tsx` に配線する**

`client/src/components/map/MapEditor.tsx`（Task 6 の配線に続く差分。ヘッダーのボタンは `NodeSplitControl` の直後。統合の成功後は選択が 1 件になってボタンが無効になるので、`useHeaderFocusReturn` の `fallbackRef` の `exportButtonRef`（「JSON書き出し」）へフォーカスが移る）:

```diff
--- a/client/src/components/map/MapEditor.tsx
+++ b/client/src/components/map/MapEditor.tsx
@@ -12,12 +12,15 @@
 import { BranchMoveDialog } from "@/components/layout/BranchMoveDialog";
 import { LabelReplaceControl } from "@/components/layout/LabelReplaceControl";
 import { LabelReplaceDialog } from "@/components/layout/LabelReplaceDialog";
+import { NodeMergeControl } from "@/components/layout/NodeMergeControl";
+import { NodeMergeDialog } from "@/components/layout/NodeMergeDialog";
 import { NodeSplitControl } from "@/components/layout/NodeSplitControl";
 import { NodeSplitDialog } from "@/components/layout/NodeSplitDialog";
 import type { BranchMoveMapTarget } from "@/hooks/branchMoveDialogState";
 import { useBranchMoveDialog } from "@/hooks/useBranchMoveDialog";
 import { useHeaderFocusReturn } from "@/hooks/useHeaderFocusReturn";
 import { useLabelReplaceDialog } from "@/hooks/useLabelReplaceDialog";
+import { useNodeMergeDialog } from "@/hooks/useNodeMergeDialog";
 import { useNodeSplitDialog } from "@/hooks/useNodeSplitDialog";
 import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
 import { useNodes } from "@/hooks/useNodes";
@@ -136,6 +139,7 @@
     moveBranch,
     updateNodeLabels,
     splitNode,
+    mergeNodes,
     deleteNode,
     deleteNodeOnly,
     setLayoutMode,
@@ -320,6 +324,24 @@
     buttonRef: nodeSplitButtonRef,
     fallbackRef: exportButtonRef,
   });
+  const nodeMerge = useNodeMergeDialog({
+    mapId,
+    nodes,
+    selectedNodeId,
+    selectedNodeIds,
+    visibleNodeIds: displayState.visibleNodeIds,
+    documentRevision,
+    mergeNodes,
+    publishNotice: publishTreeEditNotice,
+  });
+  const nodeMergeButtonRef = useRef<HTMLButtonElement>(null);
+  // 成功すると選択が 1 件になり、ボタンが無効になるので、常に押せる「JSON書き出し」へ送る
+  useHeaderFocusReturn({
+    focusRequest: nodeMerge.focusRequest,
+    consumeFocusRequest: nodeMerge.consumeFocusRequest,
+    buttonRef: nodeMergeButtonRef,
+    fallbackRef: exportButtonRef,
+  });
   const { moveSelected: moveSelectedSibling } = siblingReorder;
   const moveSelectedSiblingUp = useCallback(() => moveSelectedSibling("up"), [moveSelectedSibling]);
   const moveSelectedSiblingDown = useCallback(() => moveSelectedSibling("down"), [moveSelectedSibling]);
@@ -335,6 +357,7 @@
     && branchMove.screen === "closed"
     && labelReplace.screen === "closed"
     && nodeSplit.screen === "closed"
+    && nodeMerge.screen === "closed"
     && !persistence.isConfirmOpen;
   useMapHistoryShortcuts({ undo, redo, enabled: editorShortcutsEnabled });
   const outlineModel = useMemo(() => buildOutlineRows(nodes), [nodes]);
@@ -464,6 +487,13 @@
                     onOpen={nodeSplit.open}
                     buttonRef={nodeSplitButtonRef}
                   />
+                  <NodeMergeControl
+                    expanded={nodeMerge.screen !== "closed"}
+                    disabled={!nodeMerge.canOpen}
+                    disabledReason={nodeMerge.disabledReason}
+                    onOpen={nodeMerge.open}
+                    buttonRef={nodeMergeButtonRef}
+                  />
                   <NodeSiblingOrderControl
                     canMoveUp={siblingReorder.canMoveUp}
                     canMoveDown={siblingReorder.canMoveDown}
@@ -642,6 +672,25 @@
           }}
         />
       )}
+      {nodeMerge.screen === "open" && (
+        <NodeMergeDialog
+          preview={nodeMerge.preview}
+          separatorPreset={nodeMerge.separatorPreset}
+          customSeparator={nodeMerge.customSeparator}
+          statusText={nodeMerge.statusText}
+          error={nodeMerge.error}
+          canSubmit={nodeMerge.canSubmit}
+          focusRequest={nodeMerge.focusRequest}
+          onFocusRequestApplied={nodeMerge.consumeFocusRequest}
+          onSeparatorPresetChange={nodeMerge.setSeparatorPreset}
+          onCustomSeparatorChange={nodeMerge.setCustomSeparator}
+          onCancel={nodeMerge.close}
+          onSubmit={nodeMerge.submit}
+          onMouseClick={() => {
+            dialogMouseClickedAtRef.current = Date.now();
+          }}
+        />
+      )}
       {/* data-map-id を付けず、根の inert の外に置く */}
       {outlineImport.screen !== "closed" && (
         <OutlineImportDialog
```

- [ ] **Step 8: GREEN と全体の回帰を確認する**

Run: `cd client && npx jest src/hooks/__tests__/nodeSeparatorPreview.test.ts src/hooks/__tests__/useNodeMergeDialog.test.ts src/components/layout/__tests__/NodeMergeControl.test.tsx src/components/layout/__tests__/NodeMergeDialog.test.tsx src/app/__tests__/pageNodeMerge.test.tsx src/app/__tests__/pageNodeSplit.test.tsx src/app/__tests__/pageLabelReplace.test.tsx src/app/__tests__/pageBranchMove.test.tsx src/app/__tests__/pageBulkImportance.test.tsx src/app/__tests__/page.test.tsx && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし。続けて `cd client && npx jest` で全体を流し、既存のテストが落ちていないことを確かめる（落ちたら、期待値を変えず、配線の差分を見直す）。

---

### Task 8: ドキュメント・ROADMAP の更新と全体検証

**Files:**
- Modify: `docs/specifications/features.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: Task 1〜7 の挙動と、Global Constraints の文言。設計書 §9（`grep` で全箇所を洗い出す。L-591）。

- [ ] **Step 1: `features.md` を更新する**

次の `grep` で全箇所を確かめてから更新する（行番号は目安で、ずれている可能性がある）。
`grep -n "一括置換\|22 章\|Phase 17\|上へ\|右隣\|の前\|重要度だけ\|選択集合全体\|枝の構造の変更の通知\|AppHeader:" docs/specifications/features.md`

- 冒頭（3 行目付近）の対象機能一覧に「ノードの分割・統合」を加える。目次（31 行目付近の `22. 一括置換` の次）に `23. [ノードの分割・統合](#23-ノードの分割統合)` を足す。
- Phase 一覧の Phase 17 の行（63 行目付近）の括弧と本文に、ノードの分割・統合（ヘッダーの「ノードを分割」「ノードを統合」ダイアログ、区切り文字を選んでプレビューで確認、確定は 1 操作で Undo / Redo、マップ表示でのみ操作。23 章）を追記する。
- ヘッダー構成の図（71 行目付近の `AppHeader: [...]`）の `[一括置換]` の次に `[ノードを分割] [ノードを統合]` を足し、その右に `[上へ|下へ]` が続く並びにする。
- 位置の記述を、新しい並び（一括置換の右に「ノードを分割」「ノードを統合」、その右に「上へ」「下へ」）に直す。`grep -n "一括置換.*\(右隣\|の前\|前）\)\|上へ.*\(右隣\|の前\)" docs/specifications/features.md` のように、「右隣」だけでなく「前」「の前」も対象にして洗い出す。少なくとも次の 3 か所: (a) 91 行目付近の「兄弟の順序」と、1400 行目付近の操作の表の「上へ」「下へ」の位置（「一括置換の右隣」と書いている 2 か所）を「ノードを統合の右隣」に直す。(b) 22.1 節の表（2156 行目付近）の「ヘッダーの「一括置換」（`LabelReplaceControl.tsx`。「枝を移動」の右隣、「上へ」「下へ」の前）」を、「…「枝を移動」の右隣、「ノードを分割」の前）」に直す（一括置換自体の位置は「枝を移動」の右隣のまま）。ヘッダーのボタンの表（940 行目付近の「一括置換」の行）の次に、「ノードを分割」「ノードを統合」の行を足す（23 章。マップ表示でだけ表示し、分割は主選択が無い・非表示のとき、統合は選択が 2 件未満のとき無効。`aria-haspopup="dialog"` と `aria-expanded`、Enter・Space の押し続けでは開かない）。
- 新しい章「23. ノードの分割・統合」を、22 章（一括置換）の直後（`## 22.` の末尾の `### 22.9` の後ろ、`---` や次の節の前）へ、次の Markdown をそのまま追加する（22 章と同じ小節の並びで、失敗文言の表・操作の流れ・制限の本文を含む。実装した文言と食い違っていないか、追加後に `grep` で Global Constraints の文言と突き合わせる）:

````markdown
## 23. ノードの分割・統合

Phase 17・候補035。ヘッダーの「ノードを分割」「ノードを統合」ボタンで開くダイアログで、1 つのノードに複数の項目を詰めた長いラベルを項目ごとのノードに分けたり、重複・類似した項目を 1 つにまとめたりして、構造を整えます。どちらも区切り文字を選び、結果を**プレビュー**で確認してから確定します。確定全体は 1 操作の Undo / Redo です。保存形式（V3）は変えず、新しい保存項目もありません。

### 23.1 操作と表示

| 入口 | 操作 | 使えるとき |
| :--- | :--- | :--- |
| ヘッダーの「ノードを分割」（`NodeSplitControl.tsx`。「一括置換」の右隣） | 「ノードを分割」ダイアログを開く（対象は主選択の 1 ノード。複数選択でも主選択だけ） | **マップ表示（`viewMode === "map"`）でだけ表示**する。主選択が無い・表示されていないときは `disabled` |
| ヘッダーの「ノードを統合」（`NodeMergeControl.tsx`。「ノードを分割」の右隣、「上へ」「下へ」の前） | 「ノードを統合」ダイアログを開く（対象は開いた時点の選択集合と主選択） | **マップ表示でだけ表示**する。選択が 2 件未満のときは `disabled` |

- 2 つのボタンは `aria-haspopup="dialog"` と、ダイアログを開いている間だけ `true` の `aria-expanded` を持ちます。押し続けた `Enter`・`Space` は `preventRepeatedActivationClick` で止め、開いた直後のダイアログへ届かないようにします。
- 無効のときは理由を `title` と、`aria-describedby` で結ぶ `sr-only` の説明で示します。分割は「分割できるノードが選択されていません。」、統合は「2 つ以上のノードを選択してください。」です。統合で親が違うなどの理由は、ダイアログを開いたあとのプレビューの状態文言で示します（23.5 節）。
- アウトライン表示ではどちらのボタンも出しません。アウトライン表示は単一選択で、キャンバスで残った見えない複数選択を、見えないまま変えないためです。
- ダイアログ（分割は `NodeSplitDialog.tsx`、統合は `NodeMergeDialog.tsx`）は `role="dialog"`・`aria-modal="true"`・見出しと説明の `aria-labelledby` / `aria-describedby`・`tabIndex={-1}` を付け、`useDialogFocusTrap` でフォーカスを閉じ込め、`handleDialogClickCapture` でダブルクリックの2回目以降（`detail > 1`）を握りつぶし、`useReannouncedNotice` でエラーを読み上げ直します。ダイアログは `MapEditor` の根の `inert` の外に描きます。
- 分割の構成: 見出し「ノードを分割」、説明（「選択中のノードのラベルを区切り文字で分けます。最初の断片は元のノードに残り、残りは元のノードの直後の兄弟ノードとして追加されます。」）、「分割するノード: <ラベル>」、区切り文字の入力（23.2 節）、常設のライブリージョンの状態文言、断片の一覧（番号付き。`aria-label="分割後の断片"`）、エラー（`role="alert"`）、「キャンセル」と「分割する」のボタン。
- 統合の構成: 見出し「ノードを統合」、説明（「選択中の同じ親の兄弟ノードを、主選択のノードへ 1 つにまとめます。ほかのノードは消え、その子は主選択のノードの子の末尾へ付け替えられます。」）、区切り文字の入力、常設のライブリージョンの状態文言、プレビュー（「統合後のラベル」「重要度」「イラスト」「付け替える子」、失われるイラストの警告、「統合されて消えるノード」の一覧）、エラー（`role="alert"`）、「キャンセル」と「統合する」のボタン。
- 開くと区切り文字のプルダウンへフォーカスします。区切り文字は毎回の既定に戻し、前回の入力は保持しません。

### 23.2 区切り文字

- 区切り文字は、プルダウン「区切り文字」の選択肢（`、` / `,` / `/` / `・` / `半角スペース`）と「その他」から選びます。「その他」を選ぶと、可視のラベル「その他の区切り文字」を付けた入力欄が現れ、任意の文字列（複数文字も可）を入力できます。
- 既定は、分割が `、`、統合が半角スペースです。
- 一致は**完全一致の文字列**で、正規化しません（全角・半角を区別します。例: `,` は `，` の境目になりません）。ノード検索（9 章）や一括置換（22 章）の「全角・半角を区別しない」一致とは別です。分割は書かれた文字をそのまま境目にするためです。
- 分割では区切り文字が空（「その他」で入力が空のまま）だと分割できません。統合では空でもよく、区切りなしで連結します。
- 複数の区切り文字の同時指定、正規表現、改行での分割はできません。

### 23.3 分割の規則

- 対象は開いた時点の**主選択の 1 ノード**です。ラベルを区切り文字で分け、各断片の前後の空白（全角スペース・タブを含む）を `trim()` で削り、**空になった断片は捨てます**。断片が 2 件未満なら分割できません。断片の上限は **200 件**です（201 件以上は分割できません）。区切りが空のときは 1 文字ずつに分けず、ラベル全体を `trim` した 1 件として数えます（この場合は「区切り文字を入力してください。」になります）。
- **最初の断片は元のノードに残り**ます。ラベルだけを更新し、子・座標・大きさ・重要度・イラストは変えません。
- 残りの断片は、**元のノードの直後の兄弟**として、断片の順に配列へ差し込みます。ほかのノードは同じオブジェクトのまま、相対順も変えません。兄弟の順序は配列順が正本なので、元のノードの子の位置は変わりません。
- 新しい断片のノードは、既存の兄弟追加と同じ規則で座標を決めます。x は元のノードと同じ、y は直前までに作った断片を含む同じ親の兄弟の最も下の下端の下（`SIBLING_VERTICAL_GAP` = 40）です。重要度は元のノードと同じ、大きさは既定（100 × 60）、イラストは持ちません。
- 手動配置では、断片の y が兄弟の最も下の下端の下になるため、**キャンバス上で上から見た並びが、配列順（兄弟順）と一致しない**ことがあります（例: 兄弟の最も下が y=660 のとき、直後の兄弟になる断片は y=700、次は y=800）。兄弟順は「上へ」「下へ」（14 章）で整えられます。自動配置では全体を再レイアウトするので、座標は配置の結果になります。
- 分割しても選択は変わりません（主選択のまま）。

### 23.4 統合の規則

- 対象は、開いた時点の選択集合（2 件以上）のうち、**すべて同じ親の兄弟**であるものです（親が `null` のルート同士も統合できます）。**主選択**が残り、ほかのノードは配列から消えます。親が違うノード、祖先と子孫の組み合わせは統合できません。
- 並びは**配列順**で、選択した順序には依存しません。
- **ラベル**: 配列順にラベルを集め、空文字のラベルを除いて、区切り文字で連結します（主選択のラベルも同じ規則で、配列上の位置に入ります）。前後の空白は削りません。
- **重要度**: 選択中で最も高いもの（高 > 中 > 低）です。
- **イラスト**: 主選択が持っていればそれを残します（高さも主選択のまま）。持っていなければ、吸収されるノードのうち配列順で最初に持つものを引き継ぎ、残すノードの高さをイラスト付きの高さ（`ILLUSTRATED_NODE_HEIGHT`）にします（イラストの設定と同じ規則）。どれも持たなければ、イラストなしです。引き継ぐ 1 件以外のイラストは統合で失われます。
- **位置と大きさ**は主選択のままです（イラストを引き継ぐときの高さを除く）。
- **子の付け替え**: 吸収されるノードの直下の子（折りたたみ・解像度で隠れた子も含む）を、残すノードの直下の子のうち配列順で最後のものの直後（子が無ければ残すノードの直後）へ付け替えます。付け替える順は、吸収されるノードの配列順、各ノード内の元の相対順です。孫以下の子孫は動かしません。付け替えた子の座標は変えません（手動配置では位置が変わらず、辺だけが残すノードへつながります。自動配置では全体を再レイアウトします）。兄弟だけを対象にするため、循環は起きません。
- **自動配置でルート同士を統合したとき**: 統合前の先頭のルート（配列順で最初の親なしのノード）が吸収され、統合後の先頭のルートが別のノードになるときだけ、新しい先頭のルートへ旧先頭の座標（x, y）を写します（自動配置の列の基準を保つため。「ノードだけ削除」と同じ規則です）。手動配置では写しません。
- 統合の後、選択は**残したノードだけ**になります（このため「ノードを統合」は無効になり、フォーカスは「JSON書き出し」へ戻ります。23.8 節）。
- **折りたたみ・解像度フィルターとの関係**: 折りたたみの集合は変えません（消えたノードの ID は既存の整理で外れます）。付け替えた子の見え方は、残すノードの折りたたみ状態と解像度に従います（吸収されたノードが閉じていて残すノードが開いていれば、子は見えるようになります。逆もあります）。

### 23.5 プレビューと状態文言

- プレビューは**最新の `nodes`** から計画を `useMemo` で求め、区切り文字の入力を即時に反映します（`useDeferredValue` で遅らせないため、入力直後の古いプレビューを確定できる隙間がありません）。対象（分割は主選択、統合は選択集合と主選択）は、開いた時点で固定し、開いている間は選択が変わっても追従しません。
- 分割のプレビュー: 断片の一覧は番号付きで、1 件目に「元のノードに残る」、2 件目以降に「新しい兄弟として追加」を添えます。
- 統合のプレビュー: 「統合後のラベル」、「重要度」（高・中・低）、「イラスト」（「主選択のイラストを残す」「『○○』のイラストを引き継ぐ」「イラストなし」）、「付け替える子」（N件）、失われるイラストが 1 件以上のときだけ警告「N件のイラストは統合で失われます」、「統合されて消えるノード」の一覧（配列順で最大 200 行。超過は「ほかに K 件」を表示し、確定の対象には含めます）を出します。
- 断片・統合後のラベル・消えるノードのラベルは、前後の空白と連続する空白を畳まず、折り返して全文を表示します（`whitespace-pre-wrap`・`break-words`・`[overflow-wrap:anywhere]`）。空文字は「（空）」、空白だけは「（空白のみ）」と表示します。一覧は高さ `max-h-60`（15rem）の内側でスクロールし、画面が低くても潰れません（`shrink-0`）。ダイアログ全体も縦にスクロールし、確定ボタンへ届きます。
- 状態文言は `aria-live="polite"` の領域に常に描画し、中身だけを替えます。確定ボタンは、計画が成功し、stale でないときだけ有効です。

| 状態 | 状態文言 | 確定ボタン |
| :--- | :--- | :--- |
| 分割: 成功（N 件に分かれる） | N件に分割します（M件を追加）（M = N − 1） | 有効（「分割する」） |
| 統合: 成功（N 件を統合する） | N件を1件に統合します | 有効（「統合する」） |
| 計画が失敗している | 23.7 節の表の文言 | 無効 |
| 開いた後に文書が変わった（stale） | マップが更新されました。閉じてから開き直してください。（`role="alert"` のエラーにも同じ文言。一括置換と共有） | 無効 |

### 23.6 確定

1. 確定は `useNodes.splitNode` / `mergeNodes` を **1 回だけ**呼びます。現在のプレビューの計画を `expected` として渡し、フックが**最新の状態から計画を作り直して** `expected` と照合します（分割は断片の配列、統合は残すノード・吸収されるノードの順・ラベル・イラストの引き継ぎ元で比べます）。違えば何も変えず `plan-changed` を返します。再計画そのものが失敗したときは、その失敗の理由を返します。
2. `applyTreeChangeWithOutcome` で 1 回の構造変更として確定するので、**確定全体が 1 操作の Undo / Redo** になります。構造編集なので `documentRevision` は上げません（Undo / Redo とマップの入れ替えだけが上げます）。自動配置では全体を再レイアウトし、失敗したときは何も変えず `placement-failed` を返します。
3. 分割の新しい ID は、計画が通ったあとに `nextAvailableIds` で 1 回だけ（断片数 − 1 個）採番します。計画が失敗したときは採番しません。計画が通ったあとの自動配置の失敗では採番だけが進み、欠番が出ます（既存の「親の挿入」と同じ）。Undo で消えたノードの ID も再利用しません。
4. 成功すると、ダイアログを閉じ、通知を枝の構造の変更の通知の枠（`publishTreeEditNotice`）へ `status` で出し、ヘッダーのボタンへフォーカスを戻します。通知は分割が「ノードを N 件に分割しました。」（N = 追加した件数 + 1）、統合が「N 件のノードを 1 件に統合しました。」（N = 吸収した件数 + 1）です。新しい通知の枠は増えません（11.4 節の枠を共有し、`documentRevision` が変わると隠れます）。
5. 失敗したときは、ダイアログを閉じず、23.7 節の文言を `role="alert"` に表示します。直したあとに、もう一度確定できます。
6. 確定した同じ処理で閉じるので、確定を押し続けたり素早く押し直したりしても、2 回目は `splitNode` / `mergeNodes` を呼びません（`submit` が最新の `screen` と確定の可否を再判定し、確定済みを示す `submittedRef`（開くたびに戻します）でも防ぎます）。
7. **stale**: ダイアログを開いている間は編集画面の根が `inert` で、Undo / Redo や JSON 読み込みは押せません。外部からの文書の入れ替えで開いた後に `documentRevision` が変わったときの防御的な処理として、状態文言とエラーに「マップが更新されました。閉じてから開き直してください。」を出し、確定できなくします。マップの切り替えでは、ダイアログは開いていないものとして閉じ、ヘッダーのボタンへフォーカスを奪いません。
8. Undo 1 回で元の構造・ラベル・イラストに戻り、Redo 1 回でやり直します。成功した Undo / Redo ではノードの選択が解除されます（8 章）。

### 23.7 失敗の文言

失敗の理由（`reason`）ごとの文言です（`nodeSplitMessages.ts` / `nodeMergeMessages.ts` の `format…FailureNotice`。どれも `kind: "error"`）。計画の失敗は状態文言に、確定の失敗はエラー（`role="alert"`）に、同じ文言を出します。

| 理由 | 分割 | 統合 |
| :--- | :--- | :--- |
| 対象なし・非表示・構造が不正（`node-missing`・`node-hidden`・`invalid-structure`） | 分割できるノードが選択されていません。 | 統合できるノードが見つかりません。 |
| 区切り文字が空（`separator-empty`） | 区切り文字を入力してください。 | — |
| 断片が 2 件未満（`not-splittable`） | 区切り文字で 2 つ以上に分けられません。 | — |
| 断片が多すぎる（`too-many-fragments`） | 分割できるのは 200 件までです。 | — |
| 選択が 2 件未満（`too-few-nodes`） | — | 2 つ以上のノードを選択してください。 |
| 主選択なし（`primary-missing`） | — | 主選択のノードがありません。 |
| 親が違う（`different-parents`） | — | 同じ親の兄弟のノードだけを統合できます。 |
| 計画が変わった（`plan-changed`） | 分割の内容が変わりました。もう一度確認してください。 | 統合の内容が変わりました。もう一度確認してください。 |
| 配置不能・新しい ID が使えない（`placement-failed`・`id-conflict`） | ノードを分割できませんでした。 | ノードを統合できませんでした。（`id-conflict` は無い） |

### 23.8 キーボードとフォーカス

- 「その他の区切り文字」の入力欄の `Enter` は、日本語 IME の変換中（`nativeEvent.isComposing` または `keyCode === 229`）でなく、押し続け（`event.repeat`）でなく、確定できるときだけ確定します。区切り文字のプルダウンの `Enter` では確定しません（プレビューを見る前の確定を避けるため）。
- ダイアログの `Escape` は、IME の変換中には処理せず、押し続けでも繰り返しません。
- 「分割する」「統合する」と「キャンセル」のボタンは、押し続けた `Enter`・`Space` を `preventRepeatedActivationClick` で止めます。
- `Escape` と「キャンセル」はデータを変えずに閉じ、ヘッダーの開いたボタンへフォーカスを戻します。確定でボタンが無効になったとき（統合の成功後は選択が 1 件になる）は、常に押せる「JSON書き出し」へ移します（`useHeaderFocusReturn`）。マップの切り替えなど外から閉じられたときは、フォーカスを奪いません。
- ダイアログの中で `Tab` を巡回します（無効なボタンを除く）。ダイアログ外へ出たフォーカスは戻します。

### 23.9 ダイアログ表示中のショートカット

2 つのダイアログを開いている間は `editorShortcutsEnabled` が `false` になり、`MapEditor` の根の `inert`、`useMapHistoryShortcuts`、`MapStage` のショートカット（ノードの追加・削除、`F`、`Alt` 系の操作、コピー・貼り付け、コンテキストメニューを閉じる操作）、表示の切り替え（マップ・アウトライン）、アウトライン表示のキー操作をまとめて止めます。マップのダイアログ・箇条書きからの追加のダイアログ・枝の移動のダイアログ・一括置換のダイアログと同じ入口です（11 章、12.7 節）。保存確認（複数タブの競合）が出ている間は、根が `inert` でボタンを押せないので、同時には開きません。閉じた直後のダブルクリックでノードを作ったり選択を解除したりしないよう、ダイアログ上のマウスのクリックの時刻を `dialogMouseClickedAtRef` へ記録します（500ms 以内の空きキャンバスの押下・dblclick は無視します）。

### 23.10 保存と既存機能との関係

| 機能 | 挙動 |
| :--- | :--- |
| 保存・JSON・画像 | 既存のフィールドだけを使い、保存形式（V3）は変わりません。保存は既存の自動保存の経路で行われます。 |
| Undo / Redo | 確定全体が 1 操作。Undo で元の構造・ラベル・イラストに戻ります。選択は既存どおり Undo で解除されます。 |
| 自動配置 | 全体を再レイアウトします。失敗したときは何も変えず「ノードを分割できませんでした。」「ノードを統合できませんでした。」を出します。 |
| 手動配置 | 新しい断片のノードだけ座標を決めます。統合で付け替えた子の座標は変えません。 |
| 折りたたみ・解像度フィルター | 隠れた子も付け替えます。付け替えた子の見え方は、残すノードの状態に従います（23.4 節）。 |
| イラスト生成 | 生成中のノードが統合で消えた・ラベルが変わった場合は、既存の失効の仕組みに従います（新しい処理は足しません）。 |
| 選択 | 分割は変えません。統合は残したノードだけを選択します。 |
| ノード検索・一括置換 | 変えません。`nodes` の変化で索引は既存どおり再計算されます。 |
| 複数タブの競合検出・保護モード | 既存の保存経路に従います。 |
| マップ切替・JSON 読込 | ダイアログが開いていれば閉じます（`mapId` と `documentRevision`）。 |

### 23.11 既知の制限・検証範囲と対象外

- **既知の制限（手動配置の見た目）**: 手動配置の分割では、断片は兄弟の最も下の下端の下に積まれ、他のノードや枝と重なることがあります。配置は手動で整えます。兄弟順（配列順）と見た目の y 順は一致しません（23.3 節）。
- **既知の制限（統合後の座標）**: 手動配置で付け替えた子は、元の位置のまま残すノードへつながるため、辺が長くなったり、残すノードの既存の子と重なったりすることがあります。
- **既知の制限（往復）**: 分割してから統合しても、元のラベルには戻りません（断片の前後の空白と空の断片が除かれ、区切り文字も変わりうるため）。元に戻すには Undo を使います。
- **既知の制限（イラスト）**: 統合では、引き継ぐ 1 件以外のイラストが失われます。プレビューの警告で確認できます。
- **既知の制限（上限）**: 分割は 200 件まで、統合のプレビューの一覧は 200 行までです（確定の対象は全件）。分割の上限は、プレビューを全件描いても重くならない件数と、断片ごとの座標計算が兄弟数に比例して増える（全体で件数の 2 乗）ことへの歯止めです。
- **検証範囲**: Jest（jsdom）で、ドメイン（`nodeSplit.test.ts`、`nodeSplitMessages.test.ts`、`nodeMerge.test.ts`、`nodeMergeMessages.test.ts`、`nodeSeparator.test.ts`、`nodeImportance.test.ts`、`nodeGeometryValidation.test.ts`）、`useNodes.splitNode` / `mergeNodes`（`useNodesSplitMerge.test.ts`）、ダイアログの状態（`nodeSeparatorDialogState.test.ts`）、状態文言とプレビューの組み立て（`nodeSeparatorPreview.test.ts`）、フック（`useNodeSplitDialog.test.ts`、`useNodeMergeDialog.test.ts`、`useHeaderFocusReturn.test.tsx`）、コンポーネント（`NodeSeparatorField.test.tsx`、`NodeSplitControl.test.tsx`、`NodeSplitDialog.test.tsx`、`NodeMergeControl.test.tsx`、`NodeMergeDialog.test.tsx`）、ページ統合（`pageNodeSplit.test.tsx`、`pageNodeMerge.test.tsx`）を検証します。実ブラウザでの確認手順は [browser-test-cases.md の AE 節](../testing/browser-test-cases.md#ae-ノードの分割統合phase-17候補035) を参照してください（実 IME の `Enter`・`Escape`、スクリーンリーダー、低い画面での表示、手動配置の座標は自動テストでは確かめません）。
- **対象外（YAGNI）**: 正規表現・改行・複数の区切り文字の同時指定・断片ごとの編集、断片を子として置くなど配置の切り替え、親が違うノード同士・祖先と子孫の統合、統合時のラベルの個別編集、分割・統合へのキーボードショートカット・右クリックメニュー、アウトライン表示での分割・統合、分割・統合で作る・消すノードの選択の復元。
````

- 履歴の単位の表（770 行目付近の「ラベルの一括置換」の行の次）に、「ノードの分割」「ノードの統合」の行を足す（23 章。確定全体を 1 操作）。
- 「重要度だけは選択集合全体に作用、そのほかは主選択だけ」の記述（251 行目付近、858 行目付近、924 行目付近の 3 か所）に、「ノードを統合」も選択集合全体を使い、「ノードを分割」は主選択だけを使うことを加える。
- 「枝の移動・一括置換のダイアログを開いている間は…」の列挙（887、1510、1529、1677、1678、1698、1845、1866 行目付近の 8 か所）に、「ノードの分割のダイアログ・ノードの統合のダイアログ（23 章）」を足す。
- 元に戻した直後に破棄する通知の列挙（782 行目付近）、枝の構造の変更の通知の系統の列挙（953、1019、1033 行目付近）に、「ノードの分割・統合の成功」を加える。

- [ ] **Step 2: `architecture/overview.md` を更新する**

まず `grep -n "BranchMove\|LabelReplace\|labelReplace\|nodeImportance\|nodeResolution\|useNodes\|repeatedEnterClick\|dialogClickCapture\|editorShortcutsEnabled\|全 [0-9]* ファイル\|([0-9]* ファイル)" docs/architecture/overview.md` で、新機能が影響する既存の記述をすべて洗い出して確かめる。少なくとも次を見る: `components/layout/` の一覧と件数（全 58 ファイル）、`hooks/` の一覧と件数（全 47 ファイル）、`domain/nodes/` の件数（44 ファイル）、`domain/` の構成サブパッケージの合計（「構成サブパッケージ（全 88 ファイル）」。278 行目付近）、`dialogClickCapture.ts` の利用者の列挙、`repeatedEnterClick.ts` の利用者の列挙、`nodeImportance.ts`・`nodeResolution.ts` の説明（重要度の序列を `nodeImportance.ts` へ移したこと）、`useNodes.ts` の説明、`MapEditor.tsx` の説明、一括置換の流れの節に倣う責務分担の節。`README.md` と `client/README.md` は、直近の候補でも更新していないため、更新しない。

新しいファイルを、各一覧の並び順の規則に合わせて追記し、件数を `ls` で数えた実際の数に直す（既存の数え方に合わせる。`__tests__` は除く）。`domain/` の「構成サブパッケージ（全 88 ファイル）」の合計も、`find client/src/domain -type f -not -path '*/__tests__/*' | wc -l` と、サブパッケージごとの `find client/src/domain/<名前> -maxdepth 1 -type f | wc -l` で数え直して更新する。記載済みの個別の件数が現状とずれている箇所は、この変更と無関係でもその場で実数に合わせる（このプランの作成時点で、`domain/mapLibrary/` は記載 9 に対して実数 11、記載が無い `domain/platform/`（1 ファイル: `isApplePlatform.ts`）と `domain/selection/`（1 ファイル: `nodeSelection.ts`）があり、この時点の実数の合計は 93 で、今回の追加 6 件を足すと 99 になる）。一覧に無いサブパッケージは、ファイルを読んで 1 項目ずつ足し、合計と一覧の内訳が一致するようにする。`components/outline/`・`components/map/pixi/`・`services/`・`types/` など、この変更で増減しないサブパッケージの合計は、数え直して食い違いがあるときだけ直す。
- `domain/nodes/`: `nodeSeparator.ts`、`nodeSplit.ts`、`nodeSplitMessages.ts`、`nodeMerge.ts`、`nodeMergeMessages.ts`、`nodeGeometryValidation.ts`（現在の件数 44 → 50 の見込み）
- `hooks/`: `dialogPreviewText.ts`、`nodeSeparatorDialogState.ts`、`nodeSeparatorPreview.ts`、`useNodeSplitDialog.ts`、`useNodeMergeDialog.ts`、`useHeaderFocusReturn.ts`（47 → 53 の見込み）
- `components/layout/`: `NodeSeparatorField.tsx`、`NodeSplitControl.tsx`、`NodeSplitDialog.tsx`、`NodeMergeControl.tsx`、`NodeMergeDialog.tsx`（58 → 63 の見込み）

`useNodes.ts` の説明に `splitNode` / `mergeNodes`（最新の状態から計画を作り直して `expected` と照合、`plan-changed`、採番の規則、統合後の選択）を、`MapEditor.tsx` の説明に分割・統合のダイアログの配線（`editorShortcutsEnabled` の積、`useHeaderFocusReturn`）を、`nodeImportance.ts` の説明に `importanceRank` の移動と `maxNodeImportance` を、`nodeResolution.ts` の説明に序列を `nodeImportance.ts` から使うことを追記する。一括置換の流れの節の次に「ノードの分割・統合の流れ」の節（責務の分担、開く、プレビュー、確定、外から閉じる、フォーカス）を足す。`labelReplaceDialogState.ts`・`labelReplacePreview.ts`・`LabelReplaceDialog.tsx` の説明にある stale の文言・プレビューの整形の置き場所の記述を、`dialogPreviewText.ts` へ移したことに合わせて直す。

- [ ] **Step 3: `browser-test-cases.md` に AE 節を追加する**

`## AD.` 節の後、`## 結果の集計` の前に、次の Markdown をそのまま追加する（AD 節と同じ書式で、AE-01〜AE-16 のすべてに前提・手順・期待・結果を書いたもの。AE-04・AE-09・AE-13 は具体の座標・件数を付けている。座標と件数は、このプランの実装で確かめた値）:

````markdown
## AE. ノードの分割・統合（Phase 17・候補035）

**2026-11-17 時点で AE-01〜AE-16 の実ブラウザ確認はすべて未実施です。** 自動テスト（Jest / jsdom）と `npm run verify` の成功を実ブラウザ確認済みとは扱いません。複数選択は `Cmd`/`Ctrl`+クリックで行います（AB 節）。ヘッダーの「ノードを分割」「ノードを統合」はマップ表示でだけ出ます。座標と配列順は、ヘッダーの「JSON書き出し」で書き出した JSON の `x`・`y` と、`nodes` の並びで確かめます。前提を JSON で作るときは、JSON をファイルに保存し、ヘッダーの「JSON読み込み」で読み込みます（読み込み直後の座標は JSON のままです）。

### AE-01 分割で、最初の断片が元のノードに残り（子・重要度・イラストを保つ）、残りが直後の兄弟になる【高】
- 前提: 手動配置。ルートのノード「りんご、みかん、ぶどう」（重要度「高」、H-04 の画像を設定済みでイラスト付き。生成は追加で行わない）と、その子「りんごの子」、別のルート「バナナ」がある。
- 手順: (1) 「りんご、みかん、ぶどう」をクリックして選択する。(2) ヘッダーの「ノードを分割」を押す。(3) プレビューを見る。(4) 「分割する」を押す。(5) 「JSON書き出し」で書き出して `nodes` を見る。
- 期待: (3) 区切り文字は「、」で、状態文言は「3件に分割します（2件を追加）」。断片の一覧は番号付きで、「りんご」に「元のノードに残る」、「みかん」「ぶどう」に「新しい兄弟として追加」が付く。(4) ダイアログが閉じ、通知「ノードを 3 件に分割しました。」が出て、フォーカスが「ノードを分割」へ戻る。「りんご」は元のノードのまま、ラベルだけが変わり、位置・大きさ・重要度「高」・イラスト・子「りんごの子」が変わらない。選択も「りんご」のまま。(5) `nodes` の並びが「りんご」「みかん」「ぶどう」「りんごの子」「バナナ」（「みかん」「ぶどう」が「りんご」の直後）で、「みかん」「ぶどう」は親なし（ルート）・重要度「高」・大きさ 100 × 60・`illustration` なし。
- 結果: -（未実施）

### AE-02 区切り文字（プリセットと「その他」）を替えるとプレビューが即時に変わり、プレビューと確定結果が一致する【高】
- 前提: 手動配置。ルートのノード「A、B,C/D・E F」がある（読点・コンマ・スラッシュ・中黒・半角スペースを 1 つずつ含む）。
- 手順: (1) そのノードを選択して「ノードを分割」を開く。(2) 区切り文字のプルダウンを「、」「,」「/」「・」「半角スペース」の順に選び、そのつど状態文言と断片の一覧を見る。(3) 「その他」を選び、入力欄に `,C` を入れる。(4) 入力欄を空にする。(5) 「その他」の入力を `/` に替え、「分割する」を押す。(6) キャンバスのラベルを見る。
- 期待: (2) 「、」は「A」「B,C/D・E F」の 2 件、「,」は「A、B」「C/D・E F」の 2 件、「/」は「A、B,C」「D・E F」の 2 件、「・」は「A、B,C/D」「E F」の 2 件、「半角スペース」は「A、B,C/D・E」「F」の 2 件で、どれも状態文言が「2件に分割します（1件を追加）」。選ぶたびに一覧が即時に変わる。(3) 「その他」を選ぶと「その他の区切り文字」の入力欄が現れ、`,C` では「A、B」「/D・E F」の 2 件になる。(4) 状態文言が「区切り文字を入力してください。」になり、「分割する」が無効。(5)(6) 「A、B,C」「D・E F」の 2 つのノードになり、プレビューの断片と一致する。全角のコンマ（`，`）や全角スペースは区切りにならない（正規化しない）。
- 結果: -（未実施）

### AE-03 分割できない場合の理由の文言と、確定ボタンの無効【高】
- 前提: 手動配置。ラベルが「単一」のノード、「、、」のノード、`項目1、項目2、…、項目200` の 200 件を「、」でつないだ 1 つのノードがある。200 件のラベルは、開発者ツールのコンソールで ``copy(Array.from({ length: 200 }, (_, i) => `項目${i + 1}`).join("、"))`` を実行して作り、ラベルへ貼り付ける。
- 手順: (1) 何も選択していない状態で、「ノードを分割」の状態（無効か）と、ホバー・フォーカス時の説明を見る。(2) 「単一」を選択して「ノードを分割」を開き、状態文言と「分割する」を見る。(3) 「その他」を選び、入力欄を空にして状態文言を見る。(4) 「キャンセル」で閉じる。(5) 「、、」を選択して開く。(6) 閉じて、200 件のノードを選択して開く。(7) 閉じて、その末尾に「、項目201」を足したラベルへ編集してから、もう一度開く。
- 期待: (1) 「ノードを分割」は無効で、理由「分割できるノードが選択されていません。」が `title` とスクリーンリーダー用の説明にある。(2) 状態文言は「区切り文字で 2 つ以上に分けられません。」で、「分割する」は無効、断片の一覧は出ない。(3) 「区切り文字を入力してください。」。(5) 断片がすべて空になるので「区切り文字で 2 つ以上に分けられません。」。(6) 「200件に分割します（199件を追加）」で、「分割する」が有効（上限ちょうどは分割できる）。(7) 201 件になるので「分割できるのは 200 件までです。」で、「分割する」は無効。どの場合も、ノードは変わらない。
- 結果: -（未実施）

### AE-04 手動配置で分割したときの断片の y と配列順のずれ【中】★
- 前提: 手動配置。次の JSON を保存して読み込む（ルートが 3 つ。「単一」の下端は y=600+60=660）。
  ```json
  {"version":3,"layoutMode":"manual","nodes":[
    {"id":1,"parentId":null,"x":100,"y":100,"width":100,"height":60,"label":"りんご、みかん、ぶどう","importance":"medium"},
    {"id":2,"parentId":null,"x":100,"y":400,"width":100,"height":60,"label":"バナナ","importance":"medium"},
    {"id":3,"parentId":null,"x":100,"y":600,"width":100,"height":60,"label":"単一","importance":"medium"}]}
  ```
- 手順: (1) 「りんご、みかん、ぶどう」を選択して「ノードを分割」を開き、「分割する」を押す。(2) キャンバス上のノードの上下の並びを見る。(3) 「JSON書き出し」で書き出して、`nodes` の並びと `x`・`y` を見る。(4) 「みかん」を選択して「上へ」「下へ」の有効・無効を見る。
- 期待: (2) 上から「りんご」（y=100）「バナナ」（y=400）「単一」（y=600）「みかん」「ぶどう」の順に見える（断片は「単一」の下に出る）。(3) `nodes` の並びは「りんご」「みかん」「ぶどう」「バナナ」「単一」で、「みかん」は x=100・y=700（兄弟の最も下の下端 660 + 40）、「ぶどう」は x=100・y=800（700 + 60 + 40）。つまり配列順（兄弟順）と画面上の y の順が一致しない。「りんご」は x=100・y=100 のまま。(4) 「みかん」は兄弟順で「りんご」の次なので、「上へ」は有効、「下へ」も有効（次に「ぶどう」がある）。
- 結果: -（未実施）

### AE-05 自動配置で分割すると、全体が再レイアウトされる【中】
- 前提: 次の JSON を保存して読み込む（自動配置。親「計画」の下に子が 2 つ）。
  ```json
  {"version":3,"layoutMode":"auto","nodes":[
    {"id":1,"parentId":null,"x":200,"y":150,"width":100,"height":60,"label":"計画","importance":"medium"},
    {"id":2,"parentId":1,"x":420,"y":100,"width":100,"height":60,"label":"りんご、みかん、ぶどう","importance":"medium"},
    {"id":3,"parentId":1,"x":420,"y":200,"width":100,"height":60,"label":"バナナ","importance":"medium"}]}
  ```
- 手順: (1) 「りんご、みかん、ぶどう」を選択して「ノードを分割」を開き、「分割する」を押す。(2) 「JSON書き出し」で書き出して座標を見る。(3) 「元に戻す」を 1 回押す。
- 期待: (1) 「計画」の子が「りんご」「みかん」「ぶどう」「バナナ」の 4 つになり、重ならずに縦に並ぶ。(2) 「計画」は x=200・y=150 のまま。子は x=420 で、「りんご」y=0、「みかん」y=100、「ぶどう」y=200、「バナナ」y=300（断片の座標は再レイアウトで決まる）。(3) 1 回で元の「りんご、みかん、ぶどう」「バナナ」の 2 つ（y=100、y=200）に戻る。
- 結果: -（未実施）

### AE-06 統合の基本（ラベルの連結・重要度は最も高いもの・子の末尾への付け替え・子孫は動かない）【高】
- 前提: 手動配置。次の JSON を保存して読み込む（「プロジェクト」の下に兄弟「りんご」（重要度「低」）「リンゴ」（「高」）「バナナ」があり、「りんご」に子、「リンゴ」に子がある。ほかに別のルート「別の根」）。
  ```json
  {"version":3,"layoutMode":"manual","nodes":[
    {"id":1,"parentId":null,"x":100,"y":100,"width":100,"height":60,"label":"プロジェクト","importance":"medium"},
    {"id":2,"parentId":1,"x":300,"y":100,"width":100,"height":60,"label":"りんご","importance":"low"},
    {"id":3,"parentId":1,"x":300,"y":300,"width":100,"height":60,"label":"リンゴ","importance":"high"},
    {"id":4,"parentId":1,"x":300,"y":500,"width":100,"height":60,"label":"バナナ","importance":"medium"},
    {"id":5,"parentId":2,"x":500,"y":100,"width":100,"height":60,"label":"りんごの子","importance":"medium"},
    {"id":6,"parentId":3,"x":500,"y":300,"width":100,"height":60,"label":"リンゴの子","importance":"medium"},
    {"id":7,"parentId":null,"x":100,"y":700,"width":100,"height":60,"label":"別の根","importance":"medium"}]}
  ```
- 手順: (1) 「りんご」を選択し、`Cmd`/`Ctrl`+クリックで「リンゴ」を加える（主選択は最後に押した「リンゴ」）。(2) 「ノードを統合」を押してプレビューを見る。(3) 区切り文字を「・」に替えて統合後のラベルを見て、半角スペースに戻す。(4) 「統合する」を押す。(5) 「JSON書き出し」で `nodes` を見る。
- 期待: (2) 状態文言は「2件を1件に統合します」。統合後のラベル「りんご リンゴ」、重要度「高」、イラスト「イラストなし」、付け替える子「1件」、「統合されて消えるノード」の一覧は「りんご」だけ。(3) 「りんご・リンゴ」になる。(4) ダイアログが閉じ、通知「2 件のノードを 1 件に統合しました。」が出る。「りんご」が消え、「リンゴ」が残る。(5) `nodes` の並びは id 1, 3, 4, 6, 5, 7 の順。id 3 は label「りんご リンゴ」・重要度 high・x=300・y=300（主選択の位置のまま）。id 5（りんごの子）は parentId が 3 に変わり、x=500・y=100（座標は変わらず、辺だけが「リンゴ」へつながる）で、「リンゴの子」（id 6）の直後にある。選択は「リンゴ」だけになる。
- 結果: -（未実施）

### AE-07 統合のイラスト（主選択 → 吸収側の最初 → なし。引き継ぎ時の高さ。失われるイラストの警告は 1 件以上のときだけ）【高】
- 前提: 手動配置。同じ親の兄弟「A」（イラストなし）、「B」（イラスト付き）、「C」（イラスト付き）がある。H-04 の画像を B と C の両方に設定する（生成は追加で行わない。イラスト付きのノードの高さは 108）。
- 手順: (1) 「A」「B」「C」を選択し、主選択を「A」にして「ノードを統合」を開く。(2) プレビューのイラストの扱いと警告を見る。「統合する」を押し、JSON で「A」の `illustration` と `height` を見る。(3) 「元に戻す」で戻す。(4) 主選択を「C」にして同じ 3 つを選び、開いて、イラストの扱いと警告を見る。「統合する」を押す。(5) 「元に戻す」で戻す。(6) 「A」と「B」だけを選び、主選択を「A」にして開き、イラストの扱いと警告を見る。
- 期待: (2) イラストは「『B』のイラストを引き継ぐ」（配列順で最初にイラストを持つ吸収されるノード）、警告「1件のイラストは統合で失われます」（C のイラスト）。統合後、「A」は B のイラストを持ち、`height` が 108（イラスト付きの高さ）になり、幅・位置は変わらない。(4) 「主選択のイラストを残す」、警告「1件のイラストは統合で失われます」（B のイラスト）。統合後、「C」のイラスト・高さ 108 のまま。(6) 「『B』のイラストを引き継ぐ」で、失われるイラストが 0 件なので警告は出ない。
- 結果: -（未実施）

### AE-08 統合の拒否（選択が 1 件・親が違う・祖先と子孫・ルートと子）【高】
- 前提: AE-06 の JSON を読み込んだ状態（手動配置）。
- 手順: (1) 何も選択せず、「ノードを統合」の状態を見る。(2) 「りんご」だけを選択して、状態を見る。(3) 「りんご」と「別の根」を選択して「ノードを統合」を開き、状態文言と「統合する」を見る。(4) 閉じて、「プロジェクト」と「りんご」（祖先と子孫）を選択して開く。(5) 閉じて、「りんごの子」と「リンゴの子」（親が違う孫どうし）を選択して開く。(6) 閉じて、「りんご」と「りんごの子」（親と子）を選択して開く。
- 期待: (1)(2) 「ノードを統合」は無効で、理由「2 つ以上のノードを選択してください。」が `title` とスクリーンリーダー用の説明にある。(3)〜(6) ダイアログは開き、状態文言は「同じ親の兄弟のノードだけを統合できます。」、プレビュー（統合後のラベルなど）は出ず、「統合する」は無効。どの場合も、閉じたあとノードは変わらない。
- 結果: -（未実施）

### AE-09 自動配置でルート同士を統合し、先頭のルートが吸収されたときの座標の引き継ぎ【中】
- 前提: 次の JSON を保存して読み込む（自動配置。ルートが A・B・C の 3 つで、B に子がある）。
  ```json
  {"version":3,"layoutMode":"auto","nodes":[
    {"id":1,"parentId":null,"x":200,"y":150,"width":100,"height":60,"label":"A","importance":"medium"},
    {"id":2,"parentId":null,"x":200,"y":250,"width":100,"height":60,"label":"B","importance":"medium"},
    {"id":3,"parentId":null,"x":200,"y":350,"width":100,"height":60,"label":"C","importance":"medium"},
    {"id":4,"parentId":2,"x":400,"y":250,"width":100,"height":60,"label":"Bの子","importance":"medium"}]}
  ```
- 手順: (1) 「A」を選択し、`Cmd`/`Ctrl`+クリックで「B」を加える（主選択は「B」）。(2) 「ノードを統合」を開き、「統合する」を押す。(3) 「JSON書き出し」で書き出して座標を見る。(4) 同じ JSON を「JSON読み込み」で読み込み直し、ヘッダーで「手動配置」へ切り替えて、同じ選択（主選択は「B」）で統合し、座標を見る。(5) もう一度、同じ JSON を読み込み直し（自動配置のまま）、「B」を選択して `Cmd`/`Ctrl`+クリックで「A」を加え（主選択は「A」）、統合して座標を見る。
- 期待: (3) 先頭のルート「A」が吸収されたので、新しい先頭のルート「B」（ラベル「A B」）が「A」の座標 x=200・y=150 になる。「C」は x=200・y=290、「Bの子」は親「B」の右、x=420・y=150（自動配置の再レイアウトの結果）。(4) 手動配置では座標を引き継がず、「B」は x=200・y=250 のまま、「C」は x=200・y=350、「Bの子」は x=400・y=250 のまま。(5) 主選択の「A」が先頭のルートのまま残るので、「A」（ラベル「A B」）は x=200・y=150 で、座標の引き継ぎは起きない（「B」の子は「A」の子になる）。
- 結果: -（未実施）

### AE-10 分割・統合の確定を Undo 1 回で戻し、Redo 1 回でやり直す。確定後の選択とフォーカス【高】
- 前提: AE-04 の JSON（分割）と AE-06 の JSON（統合）を、それぞれ読み込んだ状態を用意する。
- 手順: (1) AE-04 の状態で「りんご、みかん、ぶどう」を分割し、「元に戻す」を 1 回、「やり直す」を 1 回押す。(2) AE-06 の状態で「りんご」「リンゴ」を統合し、確定直後の選択と、フォーカスのある要素を見る。(3) 「元に戻す」を 1 回、「やり直す」を 1 回押す。
- 期待: (1) Undo 1 回で 3 件に戻り（「りんご、みかん、ぶどう」「バナナ」「単一」、座標も元どおり）、Redo 1 回で分割後に戻る。(2) 統合後は選択が「リンゴ」だけになり、「ノードを統合」が無効になるため、フォーカスは「JSON書き出し」へ移る（分割の確定後は「ノードを分割」へ戻り、選択は変わらない）。(3) Undo 1 回で「りんご」「リンゴ」の 2 つ（ラベル・重要度・子の親・座標も元どおり）に戻り、Redo 1 回で統合後に戻る。Undo / Redo の後は選択が解除される。
- 結果: -（未実施）

### AE-11 日本語 IME の変換中の `Enter`・`Escape`（「その他」の入力欄とプルダウン。実 IME）★【高】
- 前提: 日本語 IME が使える。分割できるノード（例:「りんご・みかん」）を選択している。
- 手順: (1) 「ノードを分割」を開き、「その他」を選ぶ。(2) 「その他の区切り文字」に IME で「・」を未確定のまま入力し、変換中に `Enter` を押す。(3) 変換中に `Escape` を押す。(4) 変換を確定した後に `Enter` を押す。(5) 区切り文字のプルダウンにフォーカスして `Enter` を押す。(6) 統合のダイアログでも (2)〜(4) を行う。
- 期待: (2) 変換中の `Enter` は変換の確定だけで、分割も統合も確定しない。(3) 変換中の `Escape` はダイアログを閉じない。(4) 変換の確定後、確定できる状態なら `Enter` で確定する（確定できない状態なら何も起きない）。(5) プルダウンの `Enter` では確定しない。(6) 統合でも同じ。
- 結果: -（未実施）

### AE-12 二重実行・再オープンと、閉じた直後 500ms のキャンバスへの押下・dblclick【中】
- 前提: 分割できるノード（AE-04 の「りんご、みかん、ぶどう」）と、統合できる 2 つ以上の兄弟（AE-06）がある。
- 手順:
  - 開く側: (1) キーボードで「ノードを分割」にフォーカスし、`Enter` を押し続ける（開いたら離す）。(2) 同じことを「ノードを統合」で行う。(3) 「ノードを分割」をダブルクリックする。
  - ダイアログの中: (4) 開いたダイアログで「分割する」をダブルクリックする。(5) 「統合する」を `Enter` の押し続けで押す。(6) 「キャンセル」をダブルクリックする。
  - 閉じた後の戻り先: (7) 「分割する」をマウスで 1 回押して閉じた直後（500ms 以内）に、空きキャンバスをクリックする。(8) 同じく閉じた直後に、空きキャンバスをダブルクリックする。(9) 閉じてから 500ms 以上たって、空きキャンバスをクリックする。(10) 戻り先の「ノードを分割」に届いた `Enter` の押し続けを確かめる。(11) 統合でも (7)〜(9) を行う。
- 期待: (1)〜(3) 押し続けても、開いた直後のダイアログが確定・キャンセルされない。ダブルクリックでもダイアログは 1 つだけ開く。(4)〜(6) 確定は 1 回だけで、通知は 1 つ、Undo 1 回で戻る。「キャンセル」のダブルクリックの 2 回目が、閉じた後の画面へ届かない。(7) 選択が解除されず、「ノードを分割」が有効のまま、フォーカスも戻り先に残る（統合では、確定後に選択された「リンゴ」が解除されない）。(8) ノードが増えない（編集も始まらない）。(9) 通常の空白クリックとして選択が解除される。(10) 再び開かない。(11) 統合も同じ。
- 結果: -（未実施）

### AE-13 低い画面で、断片の一覧・消えるノードの一覧が潰れず、ダイアログ全体をスクロールして確定ボタンへ届く【低】
- 前提: 分割は AE-03 の 200 件のノード。統合は、次のコンソールのスクリプトで JSON を作り、ファイル（例: `ae13.json`）に保存して読み込む（親 1 つの下に 250 件の兄弟がある）。
  ```js
  copy(JSON.stringify({ version: 3, layoutMode: "manual", nodes: [
    { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "親", importance: "medium" },
    ...Array.from({ length: 250 }, (_, i) => ({
      id: i + 2, parentId: 1, x: 200 + (i % 10) * 120, y: Math.floor(i / 10) * 100,
      width: 100, height: 60, label: `項目${i + 1}`, importance: "medium",
    })),
  ] }))
  ```
- 手順: (1) ブラウザウィンドウ（または開発者ツールのビューポート）の高さを 400px 程度まで下げる。(2) 200 件のノードで「ノードを分割」を開く。(3) 断片の一覧の高さを見て、ダイアログ内をスクロールし、「分割する」まで届くか確かめる。(4) 閉じる。ズームアウトして、`Alt`+ドラッグで 250 件の兄弟すべてを囲んで選択し、「ノードを統合」を開く。(5) 「統合されて消えるノード」の一覧の行数と、末尾の表示を見る。ダイアログ内をスクロールして「統合する」まで届くか確かめる。(6) 高さを戻す。
- 期待: (2) 状態文言は「200件に分割します（199件を追加）」。(3) 一覧は 0px まで潰れず、行が読める高さを保つ。ダイアログ全体が縦にスクロールして、一覧と「分割する」の両方に届く。(5) 状態文言は「250件を1件に統合します」で、一覧は 200 行（先頭の兄弟から、主選択を除く配列順）、その下に「ほかに 49 件」が出る。高さを戻すと一覧は最大 15rem に収まり、超える分は一覧の内側でスクロールする。「統合する」を押すと、250 件が 1 件になる（一覧に出ていない分も含む）。
- 結果: -（未実施）

### AE-14 折りたたみ・解像度フィルターで隠れた子も付け替えられ、残すノードの状態に従って見え方が変わる【中】
- 前提: 手動配置。次の JSON を保存して読み込む（親「根」の下に兄弟「A」「B」があり、「A」に子「A の子」、「B」に子「B の子」がある）。
  ```json
  {"version":3,"layoutMode":"manual","nodes":[
    {"id":1,"parentId":null,"x":100,"y":100,"width":100,"height":60,"label":"根","importance":"medium"},
    {"id":2,"parentId":1,"x":300,"y":100,"width":100,"height":60,"label":"A","importance":"medium"},
    {"id":3,"parentId":1,"x":300,"y":300,"width":100,"height":60,"label":"B","importance":"medium"},
    {"id":5,"parentId":2,"x":500,"y":100,"width":100,"height":60,"label":"Aの子","importance":"medium"},
    {"id":6,"parentId":3,"x":500,"y":300,"width":100,"height":60,"label":"Bの子","importance":"medium"}]}
  ```
- 手順: (1) 「A」を選択して「枝を折りたたむ」を押す（「Aの子」が隠れる）。(2) 「A」「B」を選択し（主選択は「B」）、「ノードを統合」で統合する。(3) 「Aの子」が見えるか確かめ、「JSON書き出し」で「Aの子」の `parentId` を見る。(4) 「元に戻す」で戻す。(5) 「B」を選択して「枝を折りたたむ」を押し（「Bの子」が隠れる）、「A」「B」を選択して主選択を「B」にして統合する。(6) 「Aの子」「Bの子」が見えるか確かめる。(7) 「元に戻す」で戻し、「Aの子」の重要度を「低」にして、解像度フィルターを「高のみ」にする（「Aの子」が隠れる）。「A」「B」（主選択は「B」）を統合し、「JSON書き出し」で「Aの子」の `parentId` を見る。
- 期待: (3) 閉じていた「A」を吸収し、開いている「B」を残したので、「Aの子」が見えるようになる。`parentId` は 3（「B」）。(5)(6) 開いていた「A」を吸収し、閉じている「B」を残したので、「Aの子」「Bの子」はどちらも隠れ、「B」に隠れた子の件数（2）が出る。(7) 解像度フィルターで隠れている「Aの子」も付け替えられ、`parentId` が 3（「B」）になる。フィルターは「高のみ」のままで、折りたたみ・表示レベルの状態は統合で変わらない。
- 結果: -（未実施）

### AE-15 アウトライン表示ではボタンが出ない。ダイアログ表示中は履歴ショートカット・ビュー切替が働かない【低】
- 前提: AE-06 の状態（手動配置）。
- 手順: (1) ヘッダーの「アウトライン」へ切り替える。(2) 「マップ」へ戻す。(3) 「りんご」「リンゴ」を選択して「ノードを統合」を開く。(4) ダイアログの背面で、`Ctrl`/`Cmd`+`Z`、`Delete`、ヘッダーの「アウトライン」を操作しようとする。(5) 「キャンセル」で閉じる。(6) 「ノードを分割」でも (3)〜(5) を行う。(7) 別のマップへ切り替える操作を、ダイアログを開いたまま行おうとする。
- 期待: (1) アウトライン表示では「ノードを分割」「ノードを統合」が出ない。(2) マップへ戻すと再び出る。(4) 背面は `inert` で押せず、ショートカットも働かない（Undo もノードの削除も起きず、表示も切り替わらない）。(5) 閉じると、フォーカスが開いたボタンへ戻る。(7) 背面が `inert` で、マップの切り替えは押せない。
- 結果: -（未実施）

### AE-16 スクリーンリーダーで状態文言・無効の理由・エラーが読み上げられる★【低】
- 前提: スクリーンリーダー（VoiceOver など）を使える。
- 手順: (1) 選択なしの「ノードを分割」、選択 1 件の「ノードを統合」にフォーカスし、読み上げを聞く。(2) ダイアログを開き、見出し・説明・区切り文字のプルダウン・「その他の区切り文字」の入力欄の読み上げを聞く。(3) 区切り文字を替えながら、状態文言の変化の読み上げを聞く。(4) 統合のプレビュー（統合後のラベル・重要度・イラスト・付け替える子・警告・一覧）を読み上げで確かめる。
- 期待: (1) 無効のボタンの理由（「分割できるノードが選択されていません。」「2 つ以上のノードを選択してください。」）が説明として読まれる。(2) ダイアログは見出し「ノードを分割」「ノードを統合」の名前で、説明つきで読まれ、プルダウンと入力欄は可視のラベル「区切り文字」「その他の区切り文字」の名前で読まれる。(3) 状態文言（「N件に分割します（M件を追加）」「N件を1件に統合します」、失敗の理由など）の変化が `aria-live="polite"` で読み上げられる。エラーの欄は `role="alert"` の領域として常に存在する。(4) 一覧は「統合されて消えるノード」「分割後の断片」の名前のリストとして読まれ、警告「N件のイラストは統合で失われます」も読まれる。
- 備考: 確定の失敗（`plan-changed` など）と stale の表示は、ダイアログを開いている間は編集画面の根が `inert` で、Undo や JSON 読み込みを押せず実 UI では起こしにくいため、Jest で確認済み（実ブラウザの手順には含めない）。
- 結果: -（未実施）
````

「結果の集計」の表の AD 行の次に、次の AE 行を足す（列は AD 行と同じ並び: ブラウザ・実施日・実施者・○・×・△・-・備考）:

```markdown
| 未実施 | 2026-11-17 |  | 0 | 0 | 0 | 16 | Phase 17 AE-01〜AE-16（AE 節。ノードの分割・統合）。実ブラウザの観測は未実施。Jest / jsdom の結果と区別する |
```

イラストを使う AE-01・AE-07 は、H-04 の画像を使い回し、生成は追加で行わない（「イラスト生成の実施回数の目安」の表は変えない）。

- [ ] **Step 4: `ROADMAP.md` を更新する**

- `最終更新:` を `2026-11-17` にする。
- Phase 17 の `- [ ] **ノードの分割・統合**（候補035）` を `- [x]` にする。見出しの `## Phase 17: 複数選択と一括編集（進行中）` を、Phase 14〜16 と同じ表記の `（✅ 完了）` にする。
- 「現在地」の Phase 17 の段落を更新する: 「進行中」を「が完了」に直し、候補009・010・034・035 が完了、候補035 の要約（ヘッダーの「ノードを分割」「ノードを統合」ダイアログ、区切り文字のプリセットと「その他」、分割は主選択の最初の断片を元のノードに残し残りを直後の兄弟にする、統合は同じ親の兄弟を主選択へまとめラベルを連結・重要度は最も高いもの・イラストを引き継ぎ・子を末尾へ付け替える、プレビューで確認、確定は 1 操作の Undo / Redo、マップ表示のみ）、Jest（jsdom）の自動テストと `npm run verify` で確認済み、実ブラウザ確認（`docs/testing/browser-test-cases.md` の AB 節・AC 節・AD 節・AE 節）は未実施、次の未完了項目は Phase 18 の先頭「詳細メモ」（候補011）。

- [ ] **Step 5: 全体検証**

Run: `cd client && npm run verify`
Expected: tailwind:scan・lint・typecheck・test・build がすべて成功

---

## 自己レビューの結果

- 設計書との対応: 「決めたこと」1（分割の配置）→ Task 2、2・4（統合の対象・属性）→ Task 3、3（操作・プレビュー・1 操作の Undo）→ Task 4・6・7。「推奨案の具体化」の区切り文字 → Task 1、分割の規則 → Task 2、統合の区切り → Task 3、マップ表示でだけボタン・通知枠の共有 → Task 6・7、選択の扱い → Task 4。§1（対象外）→ Global Constraints、§2 → Task 2〜4 の先例の踏襲、§3.1 → Task 1、§3.2 → Task 2、§3.3 → Task 3、§3.4 → Task 2・3（`*Messages.ts`）、§4 → Task 4、§5.1 → Task 5、§5.2 → Task 6・7（プレビュー・確定）、§5.3 → Task 5・6・7（表示・操作・ヘッダーのボタン・入口の洗い出し）、§6 → Task 3（折りたたみ）・Task 4（Undo / Redo・自動配置・選択）・Task 6・7（マップ切替）、§7（テスト方針）→ 各 Task のテスト、§8（知見）→ Global Constraints、§9 → Task 8。
- §7 の項目とテストの対応: `splitLabelFragments` → `nodeSplit.test.ts`、`planNodeSplit` / `splitNode`（各 reason と順序、元のノードの保持、座標、新しいノードの属性、ほかのノードの不変、ルート、`newNodeIds` の不整合）→ `nodeSplit.test.ts`、自動配置の再レイアウト → `useNodesSplitMerge.test.ts`、`planNodeMerge` / `mergeNodes`（先頭のルートの座標、`maxNodeImportance`、`illustrationFrom` の 3 通りと高さ、折りたたみ状態の違う親、各 reason、配列順、ラベルの連結、子の付け替えと差し込み位置、ルート同士、兄弟でない・祖先と子孫の拒否）→ `nodeMerge.test.ts` と `nodeImportance.test.ts`、`useNodes`（1 回の Undo、失敗で履歴を積まない、採番、選択、`placement-failed`、`plan-changed`）→ `useNodesSplitMerge.test.ts`、ダイアログ状態 → `nodeSeparatorDialogState.test.ts`、コンポーネント（プレビュー、無効の理由、IME の `isComposing` と `keyCode 229` の別のテスト、リピート、ダブルクリック、確定の 2 回目、プルダウンの `Enter`、可視のラベル、200 行上限、空白だけが違う結果、代替表示、失われるイラストの警告）→ `NodeSplitDialog.test.tsx` / `NodeMergeDialog.test.tsx` / `NodeSeparatorField.test.tsx` / `useNodeSplitDialog.test.ts` / `useNodeMergeDialog.test.ts`、ページ統合 → `pageNodeSplit.test.tsx` / `pageNodeMerge.test.tsx`、手動確認（低い画面、手動配置の y と配列順のずれ）→ Task 8 の AE-04・AE-13。
- 隠れたノードを含む全体の配列を基準にする回帰ガード（L-460）: 可視集合を実際に絞って渡すテストを、ドメイン（`nodeSplit.test.ts`・`nodeMerge.test.ts`）と `useNodes`（`useNodesSplitMerge.test.ts`）に置いた。次の 4 つのミューテーションで、それぞれ意図したテストが落ちることを確認済み: `mergeNodes` の付け替える子を `visibleNodeIds` で絞る、`planNodeMerge` の `movedChildCount` を可視で絞る、差し込み位置の算出を可視の子だけで行う、`splitNode` の `basis` を可視ノードだけにする。
- 確定の対象が開いた時点で固定されていること: `useNodeSplitDialog.test.ts`・`useNodeMergeDialog.test.ts` に、開く → `rerender` で選択を変える → `submit` → `splitNode` / `mergeNodes` が開いた時点の `nodeId` / `ids` / `primaryId` で呼ばれるテストを置いた。`submit` の対象を現在の選択に替えるミューテーションで、それぞれ落ちることを確認済み。
- 専用テストを置かない配線: `MapEditor` から各フックへ渡す、分割の `documentRevision`・統合の `mapId`・`useHeaderFocusReturn` の `fallbackRef` は、ルートの `inert` と選択の整理で実 UI から到達しにくく、実害が小さいため、到達しにくいので専用テストを置かない（フック単体のテストで、stale と `mapId` の扱いは固定している）。
- 型と名前の一貫性: `NodeSplitPlan` / `NodeMergePlan`、`SplitNodeResult` / `MergeNodesResult`、`planNodeSplit` / `planNodeMerge`、`isSameNodeSplitPlan` / `isSameNodeMergePlan`、`splitNode`（ドメインは `newNodeIds` 付き、`useNodes` は `expected` 付き）/ `mergeNodes`、`NodeSeparatorDialogState`、`NodeSeparatorTarget`（`kind: "split" | "merge"`）、`separatorPreset` / `customSeparator`、`focusRequest: "separator" | "header" | null`、`STALE_DIALOG_MESSAGE` / `formatPreviewLabel`、`NODE_MERGE_PREVIEW_LIMIT`、`useNodeSplitDialog` / `useNodeMergeDialog` の戻り値（`canOpen`・`disabledReason`・`statusText`・`canSubmit`・`open`・`close`・`setSeparatorPreset`・`setCustomSeparator`・`consumeFocusRequest`・`submit`）を、全タスクで同じ名前で使う。reason の名前（`plan-changed` など）も全タスクで揃えた。
- 設計書からの具体化・判断:
  - 設計書の `NodeMergePlan` の型の記述は `isSameNodeMergePlan` の宣言が途中に挟まって崩れているため、成功と失敗の判別共用体として書いた。
  - 共有の置き場所は `hooks/dialogPreviewText.ts`（`STALE_DIALOG_MESSAGE`・`formatPreviewLabel`）とし、名前から `LabelReplace` を外した。元の名前（`STALE_LABEL_REPLACE_MESSAGE`・`formatLabelReplacePreviewLabel`）は残さず、既存の呼び出し元とテストの import だけを直す。
  - 座標・大きさの検査（`hasInvalidNodeGeometry`）は、分割・統合の 2 か所で同じ検査を使うため `nodeGeometryValidation.ts` に切り出した。既存の `deleteNodeOnly` の同形の検査は、このブランチの範囲外として触れない。
  - 統合の再計画が失敗したとき（`useNodes.mergeNodes`）は、`plan-changed` ではなくその失敗の `reason`（`node-missing` など）を返す。`plan-changed` は、再計画が成功して `expected` と違うときだけ。分割も同じ。
  - 失敗した計画は `isSameNode…Plan` で常に偽（確認の時点の計画が失敗していたら `plan-changed`）。
  - 分割・統合のプレビューの状態文言は、設計書 §5.2 に従い、`reason` の文言（stale は共有の文言）をそのまま使う。
  - `nodeSeparatorPreview.ts`（状態文言とプレビューの組み立ての純関数）を、設計書のファイル一覧に足した。フックに文言の分岐を溜めず、`labelReplacePreview.ts` と同じ責務分割にするため。
  - `onMouseClick` の配線（閉じた直後 500ms の押下・dblclick の抑止）は、分割・統合それぞれのページテストで確かめる。`MapEditor` の `onMouseClick` を空にするミューテーションで落ちることを確認済み。
  - 統合後の選択は、統合の対象外のノードも選択していた状態から `[残したノードだけ]` になることをフックのテストで固定する（`selectOnly` を消すミューテーションで落ちることを確認済み）。
  - ダイアログの枠（オーバーレイ・見出し・確定とキャンセル）は、設計書のファイル構成どおり `NodeSplitDialog` と `NodeMergeDialog` に持たせ、共通の枠の部品は作らなかった（共有するのは区切り文字の入力 `NodeSeparatorField` だけ）。
