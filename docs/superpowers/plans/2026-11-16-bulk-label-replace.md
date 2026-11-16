# 一括検索・置換（候補034）実装プラン

> **状態:** サブエージェントレビュー 2 周通過・自動承認済み。
>
> **For agentic workers:** このリポジトリでは AGENTS.md の規定により、superpowers:subagent-driven-development で実装する（インライン実行は使わない）。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヘッダーの「一括置換」ダイアログで、全ノード（または開いた時点の選択集合）のラベルを部分一致（大文字小文字・全半角を区別しない）でプレビューしてまとめて置換でき、確定全体を 1 操作で Undo / Redo できるようにする。

**Architecture:** ドメイン `planLabelReplace` / `applyLabelReplacements`（純関数。正規化後の一致位置を元のラベルへ戻す）、`useNodes.updateNodeLabels`（1 回の `applyNonStructuralChange`）、ダイアログ状態の純関数 `labelReplaceDialogState.ts`、フック `useLabelReplaceDialog`、表示 `LabelReplaceDialog` / `LabelReplaceControl`、`MapEditor` への配線の順に積む。構成は既存の `BranchMove*`（`branchMoveDialogState.ts`・`useBranchMoveDialog.ts`・`BranchMoveDialog.tsx`・`BranchMoveControl.tsx`）に倣う。

**Tech Stack:** Next.js（App Router）、React、TypeScript、Jest（jsdom）、Testing Library。

**設計書:** `docs/superpowers/specs/2026-11-16-bulk-label-replace-design.md`（以下「設計書」）

## Global Constraints

- 作業ディレクトリ: `/Users/mash/Desktop/draw-my-map/.worktrees/feat-phase17-bulk-label-replace`。テストと検証は `client` ディレクトリで実行する。
- TDD: 実装コードより先にテストを書き、失敗（RED）を確認してから実装する。
- **コミットしない。** コミットは後続の `/commit-ja` で行う（dev-flow の `/feature` の規則）。`git add` もしない。
- 対象はラベルだけ。正規表現・オプション・行ごとの除外・履歴の保持・アウトライン表示での一括置換は実装しない。
- 一致規則: 正規化は既存の `normalizeNodeSearchText`（`@/domain/search/nodeLabelSearch`。NFKC＋小文字化）。検索語は `trim` しない。置換語は入力どおりに入れる（正規化しない。`$&` などの特殊パターンも文字どおり）。
- 確定全体を 1 操作として履歴に記録する。全件がすでに同値なら履歴を増やさない。保存形式（V3）は変えない。
- 置換後のラベルが空になるノードは置換しない（警告で対象外）。置換前後が同じノードは「変更なし」で対象外・非表示。
- ヘッダーの「一括置換」ボタンは**マップ表示（`viewMode === "map"`）でだけ**出す。ダイアログが対象にする選択は `selectedNodeIds`（開いた時点で固定）。
- 画面の文言（そのまま使う）: ボタン `一括置換`、見出し `一括置換`、入力欄のラベル `検索語` / `置換語`、置換語が空のときの注記 `一致した文字を削除します。`、範囲のチェックボックス `選択中のノードだけを対象にする（N件）`、確定ボタン `N件を置換`、キャンセル `キャンセル`、状態文言 `検索語を入力してください。` / `一致するノードがありません。` / `置換できるノードがありません。` / `N件を置換します。` / `M件は置換後に空になるため対象外です。`、空になる行の警告 `置換後のラベルが空になるため置換しません。`、成功通知 `N件のノードのラベルを置換しました。`、stale `マップが更新されました。閉じてから開き直してください。`、プレビューの上限は 200 行（`replace` 行。`emptied` 行は常に表示し 200 に数えない）、超過時 `ほかにK件（一覧は先頭の200件まで表示します。確定はすべてが対象です）`。
- ダイアログは `BranchMove` と同じ作り: `role="dialog"`・`aria-modal`・`useDialogFocusTrap`・`handleDialogClickCapture`・`useReannouncedNotice`。開いている間は `editorShortcutsEnabled` を `false` にする。確定・キャンセルのボタンと「一括置換」ボタンは `preventRepeatedActivationClick` を付ける。IME は `nativeEvent.isComposing || keyCode === 229` で `Enter` を処理しない。検索語欄の `Enter` は置換語欄へフォーカスを移すだけで、確定する `Enter` は置換語欄とボタンに限る。
- テストの fixture: 一致するノードと一致しないノードを混ぜ、選択外・`emptied`・`unchanged` のノードを含める。ラベルを全ノード同じ値にしない。置換語は大文字・全角などを含め、正規化してしまう誤実装を検出できるようにする（L-168、L-170、L-616）。
- 気をつける知見: L-001 / L-002（成否を返す・空を全件扱いしない）、L-453（1 回の更新）、L-061（入口を同じ値で止める）、L-408 / L-653 / L-101（リピート・二重実行）、L-474（IME）、L-153 / L-154（ライブリージョンは常に描画）、L-554 / L-057 / L-058（ラベル・無効理由の文言）、L-036 / L-063（プレビューと確定の一致・確定 `Enter` の範囲）、L-762（外から閉じたときにフォーカスを奪わない）、L-818、L-591。
- 返答・コメント・ドキュメントは日本語。

---

### Task 1: ドメイン（一致位置の対応づけと置換の計画・適用）

**Files:**
- Create: `client/src/domain/search/nodeLabelReplace.ts`
- Test: `client/src/domain/search/__tests__/nodeLabelReplace.test.ts`（新規。`client/src/domain/search/__tests__/` が無ければ作る）

**Interfaces:**
- Produces（`@/domain/search/nodeLabelReplace`）:
  - `type LabelReplaceRequest = { query: string; replacement: string; targetIds: ReadonlySet<number> | null }`
  - `type LabelReplaceRowStatus = "replace" | "emptied" | "unchanged"`
  - `type LabelReplaceRow = { nodeId: number; before: string; after: string; matchCount: number; status: LabelReplaceRowStatus }`
  - `type LabelReplacePlan = { rows: readonly LabelReplaceRow[]; replaceCount: number; emptiedCount: number }`
  - `planLabelReplace(nodes: readonly Node[], request: LabelReplaceRequest): LabelReplacePlan`
  - `applyLabelReplacements(nodes: readonly Node[], replacements: ReadonlyMap<number, string>): Node[] | null`

- [ ] **Step 1: 失敗するテストを書く**

`client/src/domain/search/__tests__/nodeLabelReplace.test.ts`:

```typescript
import {
  applyLabelReplacements,
  planLabelReplace,
} from "@/domain/search/nodeLabelReplace";
import { createTestNode } from "@/testing/createTestNode";

function plan(labels: readonly string[], query: string, replacement: string, targetIds: ReadonlySet<number> | null = null) {
  const nodes = labels.map((label, index) => createTestNode({ id: index + 1, label }));
  return planLabelReplace(nodes, { query, replacement, targetIds });
}

describe("planLabelReplace", () => {
  it("大文字小文字と全角・半角を区別せず一致し、置換語は入力どおりに入れる", () => {
    const result = plan(["Apple", "ＡＰＰＬＥ", "banana"], "apple", "Ｏｒａｎｇｅ");

    expect(result.rows.map((row) => [row.nodeId, row.before, row.after, row.status])).toEqual([
      [1, "Apple", "Ｏｒａｎｇｅ", "replace"],
      [2, "ＡＰＰＬＥ", "Ｏｒａｎｇｅ", "replace"],
    ]);
    expect(result.replaceCount).toBe(2);
    expect(result.emptiedCount).toBe(0);
  });

  it("1 つのラベルの重ならない出現を左からすべて置換し、置換語を再び探さない", () => {
    expect(plan(["aXaXa"], "x", "-").rows[0]).toMatchObject({ after: "a-a-a", matchCount: 2 });
    expect(plan(["aXaXa"], "a", "bb").rows[0]).toMatchObject({ after: "bbXbbXbb", matchCount: 3 });
    expect(plan(["aa"], "a", "aa").rows[0]).toMatchObject({ after: "aaaa", matchCount: 2 });
  });

  it("検索語の前後の空白を削らずに使う", () => {
    expect(plan(["a  b", "a b"], "  ", " ").rows.map((row) => row.after)).toEqual(["a b"]);
    expect(plan(["x y"], " ", "").rows[0].after).toBe("xy");
  });

  it("置換語の特殊パターンを文字どおりに入れる", () => {
    expect(plan(["a"], "a", "$&$1").rows[0].after).toBe("$&$1");
  });

  it("検索語が空なら行を返さない", () => {
    expect(plan(["abc"], "", "x")).toEqual({ rows: [], replaceCount: 0, emptiedCount: 0 });
  });

  it("置換後のラベルが空になるノードは emptied にして置換対象に数えない", () => {
    const result = plan(["旧", "旧新"], "旧", "");

    expect(result.rows.map((row) => [row.before, row.after, row.status])).toEqual([
      ["旧", "", "emptied"],
      ["旧新", "新", "replace"],
    ]);
    expect(result.replaceCount).toBe(1);
    expect(result.emptiedCount).toBe(1);
  });

  it("一致しても置換前後が同じなら unchanged にして置換対象に数えない", () => {
    const result = plan(["abc"], "ABC", "abc");

    expect(result.rows).toEqual([
      { nodeId: 1, before: "abc", after: "abc", matchCount: 1, status: "unchanged" },
    ]);
    expect(result.replaceCount).toBe(0);
  });

  it("targetIds があればその集合のノードだけを調べる", () => {
    const labels = ["x1", "x2", "x3"];
    expect(plan(labels, "x", "y", new Set([2])).rows.map((row) => [row.nodeId, row.after])).toEqual([[2, "y2"]]);
  });

  it("targetIds が空集合なら全ノード扱いにせず行を返さない", () => {
    expect(plan(["x1", "x2"], "x", "y", new Set()).rows).toEqual([]);
  });

  it("targetIds の ID がどのノードにも無ければ行を返さない", () => {
    expect(plan(["x1", "x2"], "x", "y", new Set([99])).rows).toEqual([]);
  });

  describe("正規化で長さが変わる文字の位置の対応づけ", () => {
    it("合字の途中ではなく後ろの一致を、元の文字の位置で置換する", () => {
      expect(plan(["ﬁne"], "ne", "XX").rows[0].after).toBe("ﬁXX");
    });

    it("組文字の後ろの一致を、元の文字を壊さず置換する", () => {
      expect(plan(["㈱A"], "a", "X").rows[0].after).toBe("㈱X");
    });

    it("組文字全体に一致するときは元の 1 文字を置換する", () => {
      expect(plan(["㈱"], "(株)", "X").rows[0].after).toBe("X");
    });

    it("組文字の途中で切れる一致は一致として扱わない", () => {
      expect(plan(["㈱"], "(", "X").rows).toEqual([]);
      expect(plan(["ﬁ"], "f", "X").rows).toEqual([]);
    });

    it("失敗した一致の直後の位置から探し直し、後ろの正しい一致を取りこぼさない", () => {
      const row = plan(["㈱("], "(", "X").rows[0];

      expect(row.after).toBe("㈱X");
      expect(row.matchCount).toBe(1);
    });

    it("小文字化で長さが変わる文字の途中には一致しない", () => {
      expect(plan(["İ"], "i", "X").rows).toEqual([]);
    });

    it("結合文字で合成される文字の途中には一致しない", () => {
      expect(plan(["ä"], "a", "X").rows).toEqual([]);
    });
  });
});

describe("applyLabelReplacements", () => {
  const nodes = [
    createTestNode({ id: 1, label: "a" }),
    createTestNode({ id: 2, label: "b" }),
    createTestNode({ id: 3, label: "c" }),
  ];

  it("指定したノードのラベルだけを置き換え、ほかのノードは参照ごと保つ", () => {
    const result = applyLabelReplacements(nodes, new Map([[1, "x"], [2, "y"]]));

    expect(result?.map((node) => node.label)).toEqual(["x", "y", "c"]);
    expect(result?.[2]).toBe(nodes[2]);
  });

  it("すでに同じラベルのノードは参照を保つ", () => {
    const result = applyLabelReplacements(nodes, new Map([[1, "a"], [2, "y"]]));

    expect(result?.[0]).toBe(nodes[0]);
    expect(result?.[1]).toEqual({ ...nodes[1], label: "y" });
  });

  it("存在しない ID は無視する", () => {
    const result = applyLabelReplacements(nodes, new Map([[1, "x"], [99, "z"]]));

    expect(result?.map((node) => node.label)).toEqual(["x", "b", "c"]);
  });

  it.each([
    ["空の Map", new Map<number, string>()],
    ["全 ID が不在", new Map([[98, "x"], [99, "y"]])],
  ])("%sなら null を返す", (_name, replacements) => {
    expect(applyLabelReplacements(nodes, replacements)).toBeNull();
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/search/__tests__/nodeLabelReplace.test.ts`
Expected: FAIL（モジュール `@/domain/search/nodeLabelReplace` が無い）

- [ ] **Step 3: 実装する**

`client/src/domain/search/nodeLabelReplace.ts`:

```typescript
import { normalizeNodeSearchText } from "@/domain/search/nodeLabelSearch";
import type { Node } from "@/types/node";

export type LabelReplaceRequest = {
  // 入力どおり（trim しない）。正規化後に空なら一致なし
  query: string;
  // 入力どおりラベルへ入れる（正規化しない）
  replacement: string;
  // null なら全ノード。空集合なら何も対象にしない
  targetIds: ReadonlySet<number> | null;
};

export type LabelReplaceRowStatus = "replace" | "emptied" | "unchanged";

export type LabelReplaceRow = {
  nodeId: number;
  before: string;
  after: string;
  // 位置を元のラベルへ対応づけられた出現の数（1 以上）
  matchCount: number;
  status: LabelReplaceRowStatus;
};

export type LabelReplacePlan = {
  rows: readonly LabelReplaceRow[];
  replaceCount: number;
  emptiedCount: number;
};

type ReplaceRange = { start: number; end: number };

const EMPTY_PLAN: LabelReplacePlan = { rows: [], replaceCount: 0, emptiedCount: 0 };

// コードポイントの境界（UTF-16 の位置）を小さい順に返す。0 と末尾を含む
function listCodePointBoundaries(label: string): number[] {
  const boundaries = [0];
  let index = 0;
  for (const char of label) {
    index += char.length;
    boundaries.push(index);
  }
  return boundaries;
}

// 正規化後の長さ → 元のラベルの境界。有効な境界（その手前までを正規化した文字列が、全体を正規化した文字列の
// 接頭辞になる境界）だけを入れる。結合文字や合字、小文字化で長さが変わる文字の途中の境界は有効にならない
function mapNormalizedLengthToBoundary(label: string, normalizedLabel: string): Map<number, number> {
  const lengthToBoundary = new Map<number, number>();
  for (const boundary of listCodePointBoundaries(label)) {
    const prefix = normalizeNodeSearchText(label.slice(0, boundary));
    if (!normalizedLabel.startsWith(prefix)) continue;
    if (!lengthToBoundary.has(prefix.length)) lengthToBoundary.set(prefix.length, boundary);
  }
  return lengthToBoundary;
}

// 正規化後の文字列で重ならない一致を左から探し、元のラベルの範囲へ戻す。
// 戻せない一致は一致として扱わず、直後の位置から探し直す（成功した一致は末尾から続ける）
function findReplaceRanges(label: string, normalizedQuery: string): ReplaceRange[] {
  const normalizedLabel = normalizeNodeSearchText(label);
  if (!normalizedLabel.includes(normalizedQuery)) return [];

  const lengthToBoundary = mapNormalizedLengthToBoundary(label, normalizedLabel);
  const ranges: ReplaceRange[] = [];
  let position = 0;
  for (;;) {
    const found = normalizedLabel.indexOf(normalizedQuery, position);
    if (found === -1) break;
    const foundEnd = found + normalizedQuery.length;
    const start = lengthToBoundary.get(found);
    const end = lengthToBoundary.get(foundEnd);
    if (start !== undefined && end !== undefined && start < end) {
      ranges.push({ start, end });
      position = foundEnd;
    } else {
      position = found + 1;
    }
  }
  return ranges;
}

// 後ろの範囲から置き換え、前の範囲の位置がずれないようにする。String.replace は特殊パターンを解釈するので使わない
function replaceRanges(label: string, ranges: readonly ReplaceRange[], replacement: string): string {
  let result = label;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const { start, end } = ranges[index];
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}

function resolveStatus(before: string, after: string): LabelReplaceRowStatus {
  if (after === before) return "unchanged";
  return after === "" ? "emptied" : "replace";
}

export function planLabelReplace(
  nodes: readonly Node[],
  request: LabelReplaceRequest,
): LabelReplacePlan {
  const normalizedQuery = normalizeNodeSearchText(request.query);
  if (normalizedQuery === "") return EMPTY_PLAN;

  const rows: LabelReplaceRow[] = [];
  for (const node of nodes) {
    if (request.targetIds !== null && !request.targetIds.has(node.id)) continue;
    const ranges = findReplaceRanges(node.label, normalizedQuery);
    if (ranges.length === 0) continue;

    const after = replaceRanges(node.label, ranges, request.replacement);
    rows.push({
      nodeId: node.id,
      before: node.label,
      after,
      matchCount: ranges.length,
      status: resolveStatus(node.label, after),
    });
  }

  return {
    rows,
    replaceCount: rows.filter((row) => row.status === "replace").length,
    emptiedCount: rows.filter((row) => row.status === "emptied").length,
  };
}

// 現在のノードに存在する ID だけ新しいラベルへ置き換える。1 件も存在しなければ何も変えずに null（空を全件や成功と扱わない）
export function applyLabelReplacements(
  nodes: readonly Node[],
  replacements: ReadonlyMap<number, string>,
): Node[] | null {
  if (!nodes.some((node) => replacements.has(node.id))) return null;

  return nodes.map((node) => {
    const label = replacements.get(node.id);
    return label === undefined || label === node.label ? node : { ...node, label };
  });
}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/search/__tests__/nodeLabelReplace.test.ts && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし。位置の対応づけのテストが 1 件でも失敗したら、期待値ではなく `mapNormalizedLengthToBoundary` / `findReplaceRanges` の実装を見直す（設計書 §3.1 の規則が正）。

---

### Task 2: フック `updateNodeLabels`

**Files:**
- Modify: `client/src/hooks/useNodes.ts`（import、戻り値の型、`updateNodeLabel` の直後に関数、return）
- Test: `client/src/hooks/__tests__/useNodesLabelReplace.test.ts`（新規）

**Interfaces:**
- Consumes: Task 1 の `applyLabelReplacements`
- Produces: `useNodes()` の戻り値に `updateNodeLabels: (replacements: ReadonlyMap<number, string>) => boolean`。1 件以上置換、または全件がすでに同値で `true`（履歴は不変）。空の Map・全 ID 不在で `false`。

- [ ] **Step 1: 失敗するテストを書く**

`client/src/hooks/__tests__/useNodesLabelReplace.test.ts`（初期化は `useNodesBulkImportance.test.ts` と同じ形）:

```typescript
import { act, renderHook } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";

function setup() {
  const view = renderHook(() => useNodes());
  act(() => {
    view.result.current.replaceMap({
      layoutMode: "manual",
      nodes: [
        createTestNode({ id: 1, label: "りんご" }),
        createTestNode({ id: 2, label: "みかん" }),
        createTestNode({ id: 3, label: "ぶどう" }),
      ],
    });
  });
  return view;
}

function labels(result: ReturnType<typeof setup>["result"]) {
  return result.current.nodes.map((node) => node.label);
}

describe("useNodes の updateNodeLabels", () => {
  it("指定したノードのラベルをまとめて変え、指定外は変えない", () => {
    const { result } = setup();

    let applied = false;
    act(() => { applied = result.current.updateNodeLabels(new Map([[1, "リンゴ"], [2, "ミカン"]])); });

    expect(applied).toBe(true);
    expect(labels(result)).toEqual(["リンゴ", "ミカン", "ぶどう"]);
  });

  it("一括置換は 1 回の Undo で全件戻り、1 回の Redo で全件やり直す", () => {
    const { result } = setup();

    act(() => { result.current.updateNodeLabels(new Map([[1, "リンゴ"], [2, "ミカン"]])); });
    act(() => { result.current.undo(); });
    expect(labels(result)).toEqual(["りんご", "みかん", "ぶどう"]);
    expect(result.current.canUndo).toBe(false);

    act(() => { result.current.redo(); });
    expect(labels(result)).toEqual(["リンゴ", "ミカン", "ぶどう"]);
  });

  it("全件がすでに同じラベルなら受理して true を返し、履歴を積まない", () => {
    const { result } = setup();
    act(() => { result.current.updateNodeLabels(new Map([[3, "ブドウ"]])); });

    let applied = false;
    act(() => { applied = result.current.updateNodeLabels(new Map([[1, "りんご"], [3, "ブドウ"]])); });

    expect(applied).toBe(true);
    act(() => { result.current.undo(); });
    // 同値の呼び出しが履歴を積んでいれば、ここでは id 3 が「ブドウ」のまま残る
    expect(labels(result)).toEqual(["りんご", "みかん", "ぶどう"]);
    expect(result.current.canUndo).toBe(false);
  });

  it.each([
    ["空の Map", new Map<number, string>()],
    ["全 ID が不在", new Map([[98, "x"], [99, "y"]])],
  ])("%sでは false を返し何も変えない", (_name, replacements) => {
    const { result } = setup();

    let applied = true;
    act(() => { applied = result.current.updateNodeLabels(replacements); });

    expect(applied).toBe(false);
    expect(labels(result)).toEqual(["りんご", "みかん", "ぶどう"]);
    expect(result.current.canUndo).toBe(false);
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodesLabelReplace.test.ts`
Expected: FAIL（`updateNodeLabels is not a function`）

- [ ] **Step 3: 実装する**

`client/src/hooks/useNodes.ts`:
- `import { applyLabelReplacements } from "@/domain/search/nodeLabelReplace";` を追加する。
- 戻り値の型の `updateNodeLabel` の行の直後に `updateNodeLabels: (replacements: ReadonlyMap<number, string>) => boolean;` を追加する（`updateNodeLabel` の型が見当たらない場合は `updateNodeImportance` の近くに置く）。
- `updateNodeLabel` の `useCallback` の直後に追加する。

```typescript
  // 複数ノードのラベルを 1 回の更新関数でまとめて変え、1 操作として履歴に記録する
  const updateNodeLabels = useCallback((replacements: ReadonlyMap<number, string>) => (
    applyNonStructuralChange((currentNodes) => applyLabelReplacements(currentNodes, replacements))
  ), [applyNonStructuralChange]);
```

- return オブジェクトの `updateNodeLabel,` の直後に `updateNodeLabels,` を追加する。

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodesLabelReplace.test.ts src/hooks/__tests__/useNodesHistory.test.ts && npm run typecheck && npm run lint`
Expected: PASS

---

### Task 3: ダイアログ状態（純関数）

**Files:**
- Create: `client/src/hooks/labelReplaceDialogState.ts`
- Test: `client/src/hooks/__tests__/labelReplaceDialogState.test.ts`（新規）

**Interfaces:**
- Produces（`@/hooks/labelReplaceDialogState`）:
  - `type LabelReplaceError = { sequence: number; message: string | null }`
  - `type LabelReplaceFocusRequest = "query" | "header" | null`
  - `type LabelReplaceDialogState = { screen: "closed" | "open"; mapId: string; openedRevision: number; query: string; replacement: string; scopeSelectedOnly: boolean; scopeIds: readonly number[]; focusRequest: LabelReplaceFocusRequest; error: LabelReplaceError }`
  - `STALE_LABEL_REPLACE_MESSAGE: string`（`マップが更新されました。閉じてから開き直してください。`）
  - `createLabelReplaceDialogState(): LabelReplaceDialogState`（閉じた状態）
  - `openLabelReplaceDialog(state, opened: { selectedIds: readonly number[]; revision: number; mapId: string }): LabelReplaceDialogState`（検索語・置換語を空にし、`scopeIds` に選択を記録、`scopeSelectedOnly` は選択が 2 件以上のとき `true`、`focusRequest: "query"`）
  - `closeLabelReplaceDialog(state): LabelReplaceDialogState`（`screen: "closed"`、`focusRequest: "header"`）
  - `dismissLabelReplaceDialog(state): LabelReplaceDialogState`（外から閉じる。`screen: "closed"`、`focusRequest: null`。フォーカスを奪わない）
  - `setLabelReplaceQuery(state, query)` / `setLabelReplaceReplacement(state, replacement)`（どちらもエラーを空にする）
  - `setLabelReplaceScopeSelectedOnly(state, value)`（`scopeIds` が空なら変えない）
  - `failLabelReplaceDialog(state, message)`、`consumeLabelReplaceFocusRequest(state)`、`staleLabelReplaceError(error)`、`isLabelReplaceDialogOpen(state, mapId): boolean`（`screen === "open" && state.mapId === mapId`）

- [ ] **Step 1: 失敗するテストを書く**

`client/src/hooks/__tests__/labelReplaceDialogState.test.ts`:

```typescript
import {
  STALE_LABEL_REPLACE_MESSAGE,
  closeLabelReplaceDialog,
  consumeLabelReplaceFocusRequest,
  createLabelReplaceDialogState,
  dismissLabelReplaceDialog,
  failLabelReplaceDialog,
  isLabelReplaceDialogOpen,
  openLabelReplaceDialog,
  setLabelReplaceQuery,
  setLabelReplaceReplacement,
  setLabelReplaceScopeSelectedOnly,
  staleLabelReplaceError,
} from "@/hooks/labelReplaceDialogState";

function opened(selectedIds: readonly number[], mapId = "a") {
  return openLabelReplaceDialog(createLabelReplaceDialogState(), { selectedIds, revision: 3, mapId });
}

describe("labelReplaceDialogState", () => {
  it("閉じた状態から開くと入力を空にし、選択集合と版を記録して検索語へフォーカスを求める", () => {
    const state = opened([4, 7]);

    expect(state).toMatchObject({
      screen: "open",
      mapId: "a",
      openedRevision: 3,
      query: "",
      replacement: "",
      scopeIds: [4, 7],
      focusRequest: "query",
    });
  });

  it.each([
    [0, false],
    [1, false],
    [2, true],
    [5, true],
  ])("選択が %i 件のとき「選択中のノードだけ」の既定は %s", (count, expected) => {
    const ids = Array.from({ length: count }, (_, index) => index + 1);

    expect(opened(ids).scopeSelectedOnly).toBe(expected);
  });

  it("開き直すと前回の入力を持ち越さない", () => {
    const dirty = setLabelReplaceReplacement(setLabelReplaceQuery(opened([1, 2]), "x"), "y");
    const reopened = openLabelReplaceDialog(closeLabelReplaceDialog(dirty), { selectedIds: [], revision: 4, mapId: "a" });

    expect(reopened).toMatchObject({ query: "", replacement: "", scopeIds: [], scopeSelectedOnly: false });
  });

  it("検索語・置換語の変更はエラーを空にして sequence を進める", () => {
    const failed = failLabelReplaceDialog(opened([]), "失敗");
    const typed = setLabelReplaceQuery(failed, "a");

    expect(failed.error.message).toBe("失敗");
    expect(typed.query).toBe("a");
    expect(typed.error).toEqual({ sequence: failed.error.sequence + 1, message: null });
  });

  it("選択が空のときは範囲を切り替えない", () => {
    const state = opened([]);

    expect(setLabelReplaceScopeSelectedOnly(state, true).scopeSelectedOnly).toBe(false);
  });

  it("選択があれば範囲を切り替えられる", () => {
    const state = opened([1]);

    expect(setLabelReplaceScopeSelectedOnly(state, true).scopeSelectedOnly).toBe(true);
    expect(setLabelReplaceScopeSelectedOnly(opened([1, 2]), false).scopeSelectedOnly).toBe(false);
  });

  it("閉じるとヘッダーへのフォーカスを求め、フォーカス要求は一度で消える", () => {
    const closed = closeLabelReplaceDialog(opened([1]));

    expect(closed).toMatchObject({ screen: "closed", focusRequest: "header" });
    expect(consumeLabelReplaceFocusRequest(closed).focusRequest).toBeNull();
    expect(consumeLabelReplaceFocusRequest(consumeLabelReplaceFocusRequest(closed)).focusRequest).toBeNull();
  });

  it("外から閉じる（dismiss）と閉じた状態になり、フォーカスは求めない", () => {
    const dismissed = dismissLabelReplaceDialog(opened([1]));

    expect(dismissed).toMatchObject({ screen: "closed", focusRequest: null });
  });

  it("開いていても mapId が違えば開いていないとみなす（外から閉じた扱い）", () => {
    const state = opened([1], "a");

    expect(isLabelReplaceDialogOpen(state, "a")).toBe(true);
    expect(isLabelReplaceDialogOpen(state, "b")).toBe(false);
    expect(isLabelReplaceDialogOpen(closeLabelReplaceDialog(state), "a")).toBe(false);
  });

  it("stale のエラーは固定の文言で、sequence を進める", () => {
    const error = staleLabelReplaceError({ sequence: 2, message: null });

    expect(error).toEqual({ sequence: 3, message: STALE_LABEL_REPLACE_MESSAGE });
    expect(STALE_LABEL_REPLACE_MESSAGE).toBe("マップが更新されました。閉じてから開き直してください。");
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/labelReplaceDialogState.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`client/src/hooks/labelReplaceDialogState.ts`:

```typescript
export type LabelReplaceError = { sequence: number; message: string | null };
export type LabelReplaceFocusRequest = "query" | "header" | null;

export type LabelReplaceDialogState = {
  screen: "closed" | "open";
  mapId: string;
  openedRevision: number;
  query: string;
  replacement: string;
  scopeSelectedOnly: boolean;
  // 開いた時点の選択集合（ノード配列順）。開いている間は変えない
  scopeIds: readonly number[];
  focusRequest: LabelReplaceFocusRequest;
  error: LabelReplaceError;
};

export const STALE_LABEL_REPLACE_MESSAGE = "マップが更新されました。閉じてから開き直してください。";

function nextError(previous: LabelReplaceError, message: string | null): LabelReplaceError {
  return { sequence: previous.sequence + 1, message };
}

export function createLabelReplaceDialogState(): LabelReplaceDialogState {
  return {
    screen: "closed",
    mapId: "",
    openedRevision: 0,
    query: "",
    replacement: "",
    scopeSelectedOnly: false,
    scopeIds: [],
    focusRequest: null,
    error: { sequence: 0, message: null },
  };
}

export function openLabelReplaceDialog(
  state: LabelReplaceDialogState,
  opened: { selectedIds: readonly number[]; revision: number; mapId: string },
): LabelReplaceDialogState {
  return {
    ...state,
    screen: "open",
    mapId: opened.mapId,
    openedRevision: opened.revision,
    query: "",
    replacement: "",
    // 1 件は単なるクリックでも起きるため、2 件以上のときだけ既定で絞る
    scopeSelectedOnly: opened.selectedIds.length >= 2,
    scopeIds: opened.selectedIds,
    focusRequest: "query",
    error: nextError(state.error, null),
  };
}

export function closeLabelReplaceDialog(state: LabelReplaceDialogState): LabelReplaceDialogState {
  return { ...state, screen: "closed", focusRequest: "header" };
}

// マップの切り替えなど外から閉じるときは、ヘッダーのボタンへフォーカスを求めない（L-762）
export function dismissLabelReplaceDialog(state: LabelReplaceDialogState): LabelReplaceDialogState {
  return { ...state, screen: "closed", focusRequest: null };
}

export function setLabelReplaceQuery(state: LabelReplaceDialogState, query: string): LabelReplaceDialogState {
  return { ...state, query, error: nextError(state.error, null) };
}

export function setLabelReplaceReplacement(
  state: LabelReplaceDialogState,
  replacement: string,
): LabelReplaceDialogState {
  return { ...state, replacement, error: nextError(state.error, null) };
}

export function setLabelReplaceScopeSelectedOnly(
  state: LabelReplaceDialogState,
  scopeSelectedOnly: boolean,
): LabelReplaceDialogState {
  if (state.scopeIds.length === 0) return state;
  return { ...state, scopeSelectedOnly, error: nextError(state.error, null) };
}

export function failLabelReplaceDialog(state: LabelReplaceDialogState, message: string): LabelReplaceDialogState {
  return { ...state, error: nextError(state.error, message) };
}

export function consumeLabelReplaceFocusRequest(state: LabelReplaceDialogState): LabelReplaceDialogState {
  return state.focusRequest === null ? state : { ...state, focusRequest: null };
}

// 開いた後に文書が変わったときに表示する誤り。状態には残さない
export function staleLabelReplaceError(error: LabelReplaceError): LabelReplaceError {
  return nextError(error, STALE_LABEL_REPLACE_MESSAGE);
}

// 別のマップへ切り替わった後に古い状態が残っていても、開いていないものとして扱う（外から閉じた扱い。フォーカスは奪わない）
export function isLabelReplaceDialogOpen(state: LabelReplaceDialogState, mapId: string): boolean {
  return state.screen === "open" && state.mapId === mapId;
}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/hooks/__tests__/labelReplaceDialogState.test.ts && npm run typecheck && npm run lint`
Expected: PASS

---

### Task 4: フック `useLabelReplaceDialog`

**Files:**
- Create: `client/src/hooks/useLabelReplaceDialog.ts`
- Test: `client/src/hooks/__tests__/useLabelReplaceDialog.test.ts`（新規）

**Interfaces:**
- Consumes: Task 1 の `planLabelReplace`・`LabelReplaceRow`、Task 3 の状態関数、`useLatestRef`（`@/hooks/useLatestRef`）、`OperationNotice`（`@/types/operationNotice`）、`Node`
- Produces（`@/hooks/useLabelReplaceDialog`）:

```typescript
export const LABEL_REPLACE_PREVIEW_LIMIT = 200;

export type UseLabelReplaceDialogOptions = {
  mapId: string;
  nodes: readonly Node[];
  selectedNodeIds: readonly number[];
  documentRevision: number;
  updateNodeLabels: (replacements: ReadonlyMap<number, string>) => boolean;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseLabelReplaceDialogReturn = {
  screen: "closed" | "open";
  query: string;
  replacement: string;
  scopeSelectedOnly: boolean;
  scopeCount: number;                       // 開いた時点の選択件数
  previewRows: readonly LabelReplaceRow[];  // 表示する行（emptied は全部、replace は先頭 200 件、unchanged は含めない）
  hiddenReplaceCount: number;               // 表示しなかった replace 行の数
  replaceCount: number;
  statusText: string;
  submitLabel: string;                      // `${replaceCount}件を置換`
  error: LabelReplaceError;
  focusRequest: LabelReplaceFocusRequest;
  canSubmit: boolean;
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  setReplacement: (replacement: string) => void;
  setScopeSelectedOnly: (value: boolean) => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};
```

- [ ] **Step 1: 失敗するテストを書く**

`client/src/hooks/__tests__/useLabelReplaceDialog.test.ts`:

```typescript
import { act, renderHook } from "@testing-library/react";
import { LABEL_REPLACE_PREVIEW_LIMIT, useLabelReplaceDialog } from "@/hooks/useLabelReplaceDialog";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

type Props = {
  mapId?: string;
  nodes?: readonly Node[];
  selectedNodeIds?: readonly number[];
  documentRevision?: number;
};

const baseNodes = [
  createTestNode({ id: 1, label: "Apple pie" }),
  createTestNode({ id: 2, label: "apple" }),
  createTestNode({ id: 3, label: "banana" }),
  createTestNode({ id: 4, label: "旧" }),
];

function setup(initial: Props = {}) {
  const updateNodeLabels = jest.fn<boolean, [ReadonlyMap<number, string>]>(() => true);
  const publishNotice = jest.fn();
  const view = renderHook(
    (props: Props) => useLabelReplaceDialog({
      mapId: props.mapId ?? "a",
      nodes: props.nodes ?? baseNodes,
      selectedNodeIds: props.selectedNodeIds ?? [],
      documentRevision: props.documentRevision ?? 0,
      updateNodeLabels,
      publishNotice,
    }),
    { initialProps: initial },
  );
  return { ...view, updateNodeLabels, publishNotice };
}

function type(view: ReturnType<typeof setup>, query: string, replacement: string) {
  act(() => { view.result.current.setQuery(query); });
  act(() => { view.result.current.setReplacement(replacement); });
}

describe("useLabelReplaceDialog", () => {
  it("開くと検索語が空で、確定できず、状態文言が検索語の入力を求める", () => {
    const view = setup();

    act(() => { view.result.current.open(); });

    expect(view.result.current.screen).toBe("open");
    expect(view.result.current.canSubmit).toBe(false);
    expect(view.result.current.statusText).toBe("検索語を入力してください。");
    expect(view.result.current.focusRequest).toBe("query");
  });

  it("ノードが 1 件も無いときは開かない", () => {
    const view = setup({ nodes: [] });

    act(() => { view.result.current.open(); });

    expect(view.result.current.screen).toBe("closed");
  });

  it("入力に応じてプレビュー・件数・確定ボタンの文言を求める", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    type(view, "APPLE", "Orange");

    expect(view.result.current.previewRows.map((row) => [row.nodeId, row.after])).toEqual([
      [1, "Orange pie"],
      [2, "Orange"],
    ]);
    expect(view.result.current.replaceCount).toBe(2);
    expect(view.result.current.statusText).toBe("2件を置換します。");
    expect(view.result.current.submitLabel).toBe("2件を置換");
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("一致が無ければ「一致するノードがありません。」で確定できない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    type(view, "zzz", "x");

    expect(view.result.current.statusText).toBe("一致するノードがありません。");
    expect(view.result.current.canSubmit).toBe(false);
  });

  it("置換後に空になるノードは対象外として数え、空になるノードしか無ければ確定できない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    type(view, "旧", "");

    expect(view.result.current.previewRows.map((row) => row.status)).toEqual(["emptied"]);
    expect(view.result.current.statusText).toBe("置換できるノードがありません。");
    expect(view.result.current.canSubmit).toBe(false);

    type(view, "a", "");
    expect(view.result.current.statusText).toBe("3件を置換します。");
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("置換前後が同じノードは一覧にも件数にも出さない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    type(view, "BANANA", "banana");

    expect(view.result.current.previewRows).toEqual([]);
    expect(view.result.current.statusText).toBe("一致するノードがありません。");
  });

  it("選択が 2 件以上なら既定で選択だけを対象にし、チェックを外すと全ノードが対象になる", () => {
    const view = setup({ selectedNodeIds: [1, 3] });
    act(() => { view.result.current.open(); });
    type(view, "a", "x");

    expect(view.result.current.scopeSelectedOnly).toBe(true);
    expect(view.result.current.scopeCount).toBe(2);
    expect(view.result.current.previewRows.map((row) => row.nodeId)).toEqual([1, 3]);

    act(() => { view.result.current.setScopeSelectedOnly(false); });
    expect(view.result.current.previewRows.map((row) => row.nodeId)).toEqual([1, 2, 3]);
  });

  it("開いた後に選択が変わっても、対象は開いた時点の選択のままにする", () => {
    const view = setup({ selectedNodeIds: [1, 2] });
    act(() => { view.result.current.open(); });
    type(view, "a", "x");

    view.rerender({ selectedNodeIds: [3, 4] });

    expect(view.result.current.previewRows.map((row) => row.nodeId)).toEqual([1, 2]);
  });

  it("確定は最新のノードから計画を作り直して updateNodeLabels を 1 回呼び、通知して閉じる", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");

    act(() => { view.result.current.submit(); });

    expect(view.updateNodeLabels).toHaveBeenCalledTimes(1);
    expect(view.updateNodeLabels.mock.calls[0][0]).toEqual(new Map([[1, "Orange pie"], [2, "Orange"]]));
    expect(view.publishNotice).toHaveBeenCalledWith({
      kind: "status",
      message: "2件のノードのラベルを置換しました。",
    });
    expect(view.result.current.screen).toBe("closed");
    expect(view.result.current.focusRequest).toBe("header");
  });

  it("確定の 2 回目は何もしない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");

    act(() => {
      view.result.current.submit();
      view.result.current.submit();
    });

    expect(view.updateNodeLabels).toHaveBeenCalledTimes(1);
    expect(view.publishNotice).toHaveBeenCalledTimes(1);
  });

  it("updateNodeLabels が false を返したら閉じず、エラーを出して通知しない", () => {
    const view = setup();
    view.updateNodeLabels.mockReturnValueOnce(false);
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");

    act(() => { view.result.current.submit(); });

    expect(view.result.current.screen).toBe("open");
    expect(view.result.current.error.message).toBe("ラベルを置換できませんでした。もう一度お試しください。");
    expect(view.publishNotice).not.toHaveBeenCalled();
  });

  it("開いた後に documentRevision が変わると stale になり、確定できずエラーを出す", () => {
    const view = setup({ documentRevision: 0 });
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");

    view.rerender({ documentRevision: 1 });

    expect(view.result.current.canSubmit).toBe(false);
    expect(view.result.current.error.message).toBe("マップが更新されました。閉じてから開き直してください。");
    act(() => { view.result.current.submit(); });
    expect(view.updateNodeLabels).not.toHaveBeenCalled();
  });

  it("mapId が変わると閉じた扱いになり、ヘッダーへのフォーカスは求めない", () => {
    const view = setup({ mapId: "a" });
    act(() => { view.result.current.open(); });

    view.rerender({ mapId: "b" });

    expect(view.result.current.screen).toBe("closed");
    expect(view.result.current.focusRequest).toBeNull();

    // 元のマップへ戻っても、古いダイアログは復活しない
    view.rerender({ mapId: "a" });
    expect(view.result.current.screen).toBe("closed");
  });

  it("replace 行が上限を超えたら先頭の上限件数だけ表示し、残りの件数を返すが、確定は全件を対象にする", () => {
    const many = Array.from({ length: LABEL_REPLACE_PREVIEW_LIMIT + 5 }, (_, index) => (
      createTestNode({ id: index + 1, label: `item${index}` })
    ));
    const view = setup({ nodes: many });
    act(() => { view.result.current.open(); });
    type(view, "item", "x");

    expect(view.result.current.previewRows).toHaveLength(LABEL_REPLACE_PREVIEW_LIMIT);
    expect(view.result.current.hiddenReplaceCount).toBe(5);
    expect(view.result.current.replaceCount).toBe(LABEL_REPLACE_PREVIEW_LIMIT + 5);

    act(() => { view.result.current.submit(); });
    expect(view.updateNodeLabels.mock.calls[0][0].size).toBe(LABEL_REPLACE_PREVIEW_LIMIT + 5);
  });

  it("emptied 行は上限の枠に数えず常に表示する", () => {
    // emptied を先頭に置く（emptied も replace と同じ枠に数える誤実装なら、replace が 1 件足りなくなって落ちる）
    const many = [
      createTestNode({ id: 9999, label: "z" }),
      ...Array.from({ length: LABEL_REPLACE_PREVIEW_LIMIT }, (_, index) => createTestNode({ id: index + 1, label: `item${index} z` })),
    ];
    const view = setup({ nodes: many });
    act(() => { view.result.current.open(); });
    type(view, "z", "");

    expect(view.result.current.previewRows.filter((row) => row.status === "emptied")).toHaveLength(1);
    expect(view.result.current.previewRows.filter((row) => row.status === "replace")).toHaveLength(LABEL_REPLACE_PREVIEW_LIMIT);
    expect(view.result.current.hiddenReplaceCount).toBe(0);
  });
});
```

注意: `useDeferredValue` はテストでは同期的に追いつく（`act` の中で更新が確定する）。もし deferred の遅れでアサートが落ちる場合は、テスト側で `act` を 1 回増やして待つのではなく、フックの実装（`pending` の扱い）が設計書どおりか確認する。

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useLabelReplaceDialog.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`client/src/hooks/useLabelReplaceDialog.ts`:

```typescript
"use client";

import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { planLabelReplace, type LabelReplaceRow } from "@/domain/search/nodeLabelReplace";
import {
  closeLabelReplaceDialog,
  consumeLabelReplaceFocusRequest,
  createLabelReplaceDialogState,
  failLabelReplaceDialog,
  isLabelReplaceDialogOpen,
  openLabelReplaceDialog,
  setLabelReplaceQuery,
  setLabelReplaceReplacement,
  setLabelReplaceScopeSelectedOnly,
  staleLabelReplaceError,
  dismissLabelReplaceDialog,
  type LabelReplaceError,
  type LabelReplaceFocusRequest,
} from "@/hooks/labelReplaceDialogState";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

export const LABEL_REPLACE_PREVIEW_LIMIT = 200;

const REPLACE_FAILED_MESSAGE = "ラベルを置換できませんでした。もう一度お試しください。";

export type UseLabelReplaceDialogOptions = {
  mapId: string;
  nodes: readonly Node[];
  selectedNodeIds: readonly number[];
  documentRevision: number;
  updateNodeLabels: (replacements: ReadonlyMap<number, string>) => boolean;
  publishNotice: (notice: OperationNotice) => void;
};

export type UseLabelReplaceDialogReturn = {
  screen: "closed" | "open";
  query: string;
  replacement: string;
  scopeSelectedOnly: boolean;
  scopeCount: number;
  previewRows: readonly LabelReplaceRow[];
  hiddenReplaceCount: number;
  replaceCount: number;
  statusText: string;
  submitLabel: string;
  error: LabelReplaceError;
  focusRequest: LabelReplaceFocusRequest;
  canSubmit: boolean;
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  setReplacement: (replacement: string) => void;
  setScopeSelectedOnly: (value: boolean) => void;
  consumeFocusRequest: () => void;
  submit: () => void;
};

const NO_ROWS: readonly LabelReplaceRow[] = [];

// emptied は常に残し、replace は先頭から上限件数まで残す。unchanged は出さない
function selectPreviewRows(rows: readonly LabelReplaceRow[]): { shown: LabelReplaceRow[]; hiddenReplaceCount: number } {
  const shown: LabelReplaceRow[] = [];
  let replaceShown = 0;
  let hiddenReplaceCount = 0;
  for (const row of rows) {
    if (row.status === "unchanged") continue;
    if (row.status === "emptied") {
      shown.push(row);
    } else if (replaceShown < LABEL_REPLACE_PREVIEW_LIMIT) {
      shown.push(row);
      replaceShown += 1;
    } else {
      hiddenReplaceCount += 1;
    }
  }
  return { shown, hiddenReplaceCount };
}

function describeStatus(query: string, shownCount: number, replaceCount: number, emptiedCount: number): string {
  if (query === "") return "検索語を入力してください。";
  if (shownCount === 0) return "一致するノードがありません。";
  if (replaceCount === 0) return "置換できるノードがありません。";
  const emptied = emptiedCount > 0 ? `${emptiedCount}件は置換後に空になるため対象外です。` : "";
  return `${replaceCount}件を置換します。${emptied}`;
}

// 開いた時点の選択集合を固定する。プレビューは最新の nodes から作り、確定の直前にも計画を作り直す
export function useLabelReplaceDialog(options: UseLabelReplaceDialogOptions): UseLabelReplaceDialogReturn {
  const [state, setState] = useState(createLabelReplaceDialogState);
  const open = isLabelReplaceDialogOpen(state, options.mapId);
  // 別のマップへ切り替わったら、閉じた状態へ戻す（フォーカスは奪わない）。元のマップへ戻っても古い入力は復活しない
  if (state.screen === "open" && !open) setState(dismissLabelReplaceDialog);
  const stale = open && state.openedRevision !== options.documentRevision;
  const deferredQuery = useDeferredValue(state.query);
  const deferredReplacement = useDeferredValue(state.replacement);
  // 遅れて追いつく最中は、古いプレビューで確定させない
  const pending = deferredQuery !== state.query || deferredReplacement !== state.replacement;
  const targetIds = useMemo(
    () => (state.scopeSelectedOnly ? new Set(state.scopeIds) : null),
    [state.scopeSelectedOnly, state.scopeIds],
  );
  const plan = useMemo(
    () => (open
      ? planLabelReplace(options.nodes, { query: deferredQuery, replacement: deferredReplacement, targetIds })
      : null),
    [open, options.nodes, deferredQuery, deferredReplacement, targetIds],
  );
  const { shown, hiddenReplaceCount } = useMemo(
    () => (plan === null ? { shown: NO_ROWS as LabelReplaceRow[], hiddenReplaceCount: 0 } : selectPreviewRows(plan.rows)),
    [plan],
  );
  const replaceCount = plan?.replaceCount ?? 0;
  const canSubmit = open && !stale && !pending && state.query !== "" && replaceCount > 0;
  // 古いハンドラを呼ばれても、最後に commit された値で再判定する
  const latest = useLatestRef({ options, state, open, stale });
  const submittedRef = useRef(false);

  const openDialog = useCallback(() => {
    const { options: current } = latest.current;
    if (current.nodes.length === 0) return;
    submittedRef.current = false;
    setState((prev) => openLabelReplaceDialog(prev, {
      selectedIds: current.selectedNodeIds,
      revision: current.documentRevision,
      mapId: current.mapId,
    }));
  }, [latest]);

  const close = useCallback(() => {
    setState(closeLabelReplaceDialog);
  }, []);

  const setQuery = useCallback((query: string) => {
    setState((prev) => setLabelReplaceQuery(prev, query));
  }, []);

  const setReplacement = useCallback((replacement: string) => {
    setState((prev) => setLabelReplaceReplacement(prev, replacement));
  }, []);

  const setScopeSelectedOnly = useCallback((value: boolean) => {
    setState((prev) => setLabelReplaceScopeSelectedOnly(prev, value));
  }, []);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeLabelReplaceFocusRequest);
  }, []);

  const submit = useCallback(() => {
    const { options: current, state: snapshot, open: isOpen, stale: isStale } = latest.current;
    // 通常は canSubmit が偽でボタンが無効なので到達しない。古いハンドラや入力直後のすき間で呼ばれても何も変えない
    if (!isOpen || isStale || submittedRef.current || snapshot.query === "") return;

    // 古いプレビューを信じず、最新のノードと現在の入力から計画を作り直す
    const fresh = planLabelReplace(current.nodes, {
      query: snapshot.query,
      replacement: snapshot.replacement,
      targetIds: snapshot.scopeSelectedOnly ? new Set(snapshot.scopeIds) : null,
    });
    const replacements = new Map<number, string>();
    for (const row of fresh.rows) {
      if (row.status === "replace") replacements.set(row.nodeId, row.after);
    }
    if (replacements.size === 0) return;

    if (!current.updateNodeLabels(replacements)) {
      setState((prev) => failLabelReplaceDialog(prev, REPLACE_FAILED_MESSAGE));
      return;
    }
    submittedRef.current = true;
    current.publishNotice({ kind: "status", message: `${replacements.size}件のノードのラベルを置換しました。` });
    close();
  }, [close, latest]);

  return {
    screen: open ? "open" : "closed",
    query: state.query,
    replacement: state.replacement,
    scopeSelectedOnly: state.scopeSelectedOnly,
    scopeCount: state.scopeIds.length,
    previewRows: shown,
    hiddenReplaceCount,
    replaceCount,
    // 計画と同じ遅延後の検索語で作る（入力直後の 1 レンダーに古い計画と新しい検索語を組み合わせない）
    statusText: describeStatus(deferredQuery, shown.length, replaceCount, plan?.emptiedCount ?? 0),
    submitLabel: `${replaceCount}件を置換`,
    error: stale ? staleLabelReplaceError(state.error) : state.error,
    // 外から閉じられた（mapId が変わった）状態ではフォーカスを求めない。通常に閉じた後の "header" は返す
    focusRequest: (open || state.screen === "closed") ? state.focusRequest : null,
    canSubmit,
    open: openDialog,
    close,
    setQuery,
    setReplacement,
    setScopeSelectedOnly,
    consumeFocusRequest,
    submit,
  };
}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useLabelReplaceDialog.test.ts && npm run typecheck && npm run lint`
Expected: PASS。`submit` の「2 回目は何もしない」は、同じ `act` の中で 2 回呼ぶため `submittedRef` で弾けること（`latest.current` は再描画前の古い値のままになりうる）を確かめる。

---

### Task 5: 表示（`LabelReplaceControl` と `LabelReplaceDialog`）

**Files:**
- Create: `client/src/components/layout/LabelReplaceControl.tsx`
- Create: `client/src/components/layout/LabelReplaceDialog.tsx`
- Test: `client/src/components/layout/__tests__/LabelReplaceControl.test.tsx`（新規）
- Test: `client/src/components/layout/__tests__/LabelReplaceDialog.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 1 の `LabelReplaceRow`、Task 3 の `LabelReplaceError`・`LabelReplaceFocusRequest`、既存の `useDialogFocusTrap`・`handleDialogClickCapture`・`useReannouncedNotice`・`preventRepeatedActivationClick`、`getNodeDisplayLabel` は使わない（`before` は空でない。`after` が空なら `（空）` と表示する）
- Produces:
  - `LabelReplaceControl`: props `{ expanded: boolean; disabled: boolean; onOpen: () => void; buttonRef: Ref<HTMLButtonElement> }`。見た目と属性は `BranchMoveControl` と同じ（`aria-haspopup="dialog"`・`aria-expanded`・`onKeyDown={preventRepeatedActivationClick}`）。ボタン名は `一括置換`。
  - `LabelReplaceDialog`: props（すべて必須）

```typescript
type LabelReplaceDialogProps = {
  query: string;
  replacement: string;
  scopeSelectedOnly: boolean;
  scopeCount: number;
  previewRows: readonly LabelReplaceRow[];
  hiddenReplaceCount: number;
  previewLimit: number;
  statusText: string;
  submitLabel: string;
  error: LabelReplaceError;
  canSubmit: boolean;
  focusRequest: LabelReplaceFocusRequest;
  onFocusRequestApplied: () => void;
  onQueryChange: (query: string) => void;
  onReplacementChange: (replacement: string) => void;
  onScopeSelectedOnlyChange: (value: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMouseClick: () => void;
};
```

- [ ] **Step 1: 失敗するテストを書く（Control）**

`client/src/components/layout/__tests__/LabelReplaceControl.test.tsx`:

```typescript
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelReplaceControl } from "@/components/layout/LabelReplaceControl";

describe("LabelReplaceControl", () => {
  it("ダイアログを開くボタンとして名前・aria 属性を持つ", () => {
    render(<LabelReplaceControl expanded={false} disabled={false} onOpen={jest.fn()} buttonRef={createRef()} />);

    const button = screen.getByRole("button", { name: "一括置換" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("expanded のとき aria-expanded が true になる", () => {
    render(<LabelReplaceControl expanded disabled={false} onOpen={jest.fn()} buttonRef={createRef()} />);

    expect(screen.getByRole("button", { name: "一括置換" })).toHaveAttribute("aria-expanded", "true");
  });

  it("クリックで onOpen を呼び、disabled のときは押せない", async () => {
    const onOpen = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <LabelReplaceControl expanded={false} disabled={false} onOpen={onOpen} buttonRef={createRef()} />,
    );

    await user.click(screen.getByRole("button", { name: "一括置換" }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    rerender(<LabelReplaceControl expanded={false} disabled onOpen={onOpen} buttonRef={createRef()} />);
    expect(screen.getByRole("button", { name: "一括置換" })).toBeDisabled();
  });

  it("押し続けたリピートの Enter・Space では既定動作を止める（開いた直後のダイアログへ click が届かない）", () => {
    render(<LabelReplaceControl expanded={false} disabled={false} onOpen={jest.fn()} buttonRef={createRef()} />);
    const button = screen.getByRole("button", { name: "一括置換" });

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗するテストを書く（Dialog）**

`client/src/components/layout/__tests__/LabelReplaceDialog.test.tsx`（`BranchMoveDialog.test.tsx` の書き方に倣い、まず同ファイルを読んでフォーカストラップ・`act` の扱いを合わせる）:

```typescript
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { LabelReplaceDialog } from "@/components/layout/LabelReplaceDialog";
import type { LabelReplaceRow } from "@/domain/search/nodeLabelReplace";

type Props = ComponentProps<typeof LabelReplaceDialog>;

function row(nodeId: number, before: string, after: string, status: LabelReplaceRow["status"] = "replace"): LabelReplaceRow {
  return { nodeId, before, after, matchCount: 1, status };
}

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    query: "",
    replacement: "",
    scopeSelectedOnly: false,
    scopeCount: 0,
    previewRows: [],
    hiddenReplaceCount: 0,
    previewLimit: 200,
    statusText: "検索語を入力してください。",
    submitLabel: "0件を置換",
    error: { sequence: 0, message: null },
    canSubmit: false,
    focusRequest: null,
    onFocusRequestApplied: jest.fn(),
    onQueryChange: jest.fn(),
    onReplacementChange: jest.fn(),
    onScopeSelectedOnlyChange: jest.fn(),
    onCancel: jest.fn(),
    onSubmit: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<LabelReplaceDialog {...props} />) };
}

describe("LabelReplaceDialog", () => {
  it("名前付きのモーダルダイアログとして、検索語・置換語の入力欄を可視のラベルつきで出す", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "一括置換" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByLabelText("検索語")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("置換語")).toBeInTheDocument();
  });

  it("focusRequest が query なら検索語へフォーカスし、要求の消費を通知する", () => {
    const { props } = renderDialog({ focusRequest: "query" });

    expect(screen.getByLabelText("検索語")).toHaveFocus();
    expect(props.onFocusRequestApplied).toHaveBeenCalledTimes(1);
  });

  it("入力の変更を通知する", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.type(screen.getByLabelText("検索語"), "a");
    await user.type(screen.getByLabelText("置換語"), "b");

    expect(props.onQueryChange).toHaveBeenCalledWith("a");
    expect(props.onReplacementChange).toHaveBeenCalledWith("b");
  });

  it("状態文言を常設のライブリージョンに出す", () => {
    const { rerender, props } = renderDialog({ statusText: "検索語を入力してください。" });
    const region = screen.getByText("検索語を入力してください。");
    expect(region).toHaveAttribute("aria-live", "polite");

    rerender(<LabelReplaceDialog {...props} statusText="2件を置換します。" />);
    expect(screen.getByText("2件を置換します。")).toBe(region);
  });

  it("置換語が空のときだけ「一致した文字を削除します。」を出す", () => {
    const { rerender, props } = renderDialog({ replacement: "" });
    expect(screen.getByText("一致した文字を削除します。")).toBeInTheDocument();

    rerender(<LabelReplaceDialog {...props} replacement="x" />);
    expect(screen.queryByText("一致した文字を削除します。")).toBeNull();
  });

  it("範囲のチェックボックスは件数をラベルに含み、選択が 0 件なら無効", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog({ scopeCount: 0 });
    expect(screen.getByRole("checkbox", { name: "選択中のノードだけを対象にする（0件）" })).toBeDisabled();

    rerender(<LabelReplaceDialog {...props} scopeCount={3} scopeSelectedOnly />);
    const checkbox = screen.getByRole("checkbox", { name: "選択中のノードだけを対象にする（3件）" });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(props.onScopeSelectedOnlyChange).toHaveBeenCalledWith(false);
  });

  it("プレビューに置換前後を出し、空になる行には警告を出す", () => {
    renderDialog({
      previewRows: [row(1, "Apple", "Orange"), row(2, "旧", "", "emptied")],
    });

    const list = screen.getByRole("list", { name: "置換のプレビュー" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Apple");
    expect(items[0]).toHaveTextContent("Orange");
    expect(items[1]).toHaveTextContent("旧");
    expect(items[1]).toHaveTextContent("（空）");
    expect(items[1]).toHaveTextContent("置換後のラベルが空になるため置換しません。");
  });

  it("上限を超えた replace 行があれば件数と注記を出す", () => {
    renderDialog({ hiddenReplaceCount: 5, previewLimit: 200 });

    expect(screen.getByText("ほかに5件（一覧は先頭の200件まで表示します。確定はすべてが対象です）")).toBeInTheDocument();
  });

  it("確定ボタンは submitLabel を出し、canSubmit が偽なら無効で、押すと onSubmit を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderDialog({ submitLabel: "0件を置換", canSubmit: false });
    expect(screen.getByRole("button", { name: "0件を置換" })).toBeDisabled();

    rerender(<LabelReplaceDialog {...props} submitLabel="3件を置換" canSubmit />);
    await user.click(screen.getByRole("button", { name: "3件を置換" }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("キャンセルボタンで onCancel を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it.each(["検索語", "置換語"])("%sの欄で Escape を押すと onCancel を呼ぶ", (label) => {
    const { props } = renderDialog();

    fireEvent.keyDown(screen.getByLabelText(label), { key: "Escape" });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  describe.each(["検索語", "置換語"])("%sの欄の IME 変換中の Escape", (label) => {
    it("isComposing が真のときは閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText(label), { key: "Escape", isComposing: true });

      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it("keyCode が 229 のときは閉じない", () => {
      const { props } = renderDialog();

      fireEvent.keyDown(screen.getByLabelText(label), { key: "Escape", keyCode: 229 });

      expect(props.onCancel).not.toHaveBeenCalled();
    });
  });

  describe("検索語欄の Enter", () => {
    it("置換語欄へフォーカスを移すだけで、確定しない", () => {
      const { props } = renderDialog({ canSubmit: true });

      fireEvent.keyDown(screen.getByLabelText("検索語"), { key: "Enter" });

      expect(screen.getByLabelText("置換語")).toHaveFocus();
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
    ])("IME 変換中（%s）は何もしない", (_name, init) => {
      const { props } = renderDialog({ canSubmit: true });
      screen.getByLabelText("検索語").focus();

      fireEvent.keyDown(screen.getByLabelText("検索語"), { key: "Enter", ...init });

      expect(screen.getByLabelText("検索語")).toHaveFocus();
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it("リピートの Enter ではフォーカスを移さない", () => {
      renderDialog();
      screen.getByLabelText("検索語").focus();

      fireEvent.keyDown(screen.getByLabelText("検索語"), { key: "Enter", repeat: true });

      expect(screen.getByLabelText("検索語")).toHaveFocus();
    });
  });

  describe("置換語欄の Enter", () => {
    it("確定できるときだけ onSubmit を呼ぶ", () => {
      const { props, rerender } = renderDialog({ canSubmit: false });
      fireEvent.keyDown(screen.getByLabelText("置換語"), { key: "Enter" });
      expect(props.onSubmit).not.toHaveBeenCalled();

      rerender(<LabelReplaceDialog {...props} canSubmit />);
      fireEvent.keyDown(screen.getByLabelText("置換語"), { key: "Enter" });
      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
      ["リピート", { repeat: true }],
    ])("%sのときは確定しない", (_name, init) => {
      const { props } = renderDialog({ canSubmit: true });

      fireEvent.keyDown(screen.getByLabelText("置換語"), { key: "Enter", ...init });

      expect(props.onSubmit).not.toHaveBeenCalled();
    });
  });

  it("確定・キャンセルのボタンはリピートの Enter・Space の既定動作を止める", () => {
    renderDialog({ canSubmit: true, submitLabel: "1件を置換" });

    for (const name of ["1件を置換", "キャンセル"]) {
      const button = screen.getByRole("button", { name });
      expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
      expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    }
  });

  it("ダブルクリックの 2 回目のクリックは握りつぶし、マウスのクリックを親へ通知する", () => {
    const { props } = renderDialog({ canSubmit: true, submitLabel: "1件を置換" });
    const button = screen.getByRole("button", { name: "1件を置換" });

    fireEvent.click(button, { detail: 1 });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onMouseClick).toHaveBeenCalledTimes(1);

    fireEvent.click(button, { detail: 2 });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("キーボード・支援技術のクリック（detail 0）では確定でき、マウスのクリックとしては通知しない", () => {
    const { props } = renderDialog({ canSubmit: true, submitLabel: "1件を置換" });

    fireEvent.click(screen.getByRole("button", { name: "1件を置換" }), { detail: 0 });

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onMouseClick).not.toHaveBeenCalled();
  });

  it("エラーを role=alert に出す（再読み上げのため次のフレームで入る）", async () => {
    renderDialog({ error: { sequence: 1, message: "ラベルを置換できませんでした。もう一度お試しください。" } });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ラベルを置換できませんでした。もう一度お試しください。"));
  });
});
```

- [ ] **Step 3: RED を確認する**

Run: `cd client && npx jest src/components/layout/__tests__/LabelReplaceControl.test.tsx src/components/layout/__tests__/LabelReplaceDialog.test.tsx`
Expected: FAIL（モジュールが無い）

- [ ] **Step 4: 実装する（Control）**

`client/src/components/layout/LabelReplaceControl.tsx`（`BranchMoveControl.tsx` と同じ構成）:

```typescript
import type { Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

type LabelReplaceControlProps = {
  expanded: boolean;
  disabled: boolean;
  onOpen: () => void;
  buttonRef: Ref<HTMLButtonElement>;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function LabelReplaceControl({ expanded, disabled, onOpen, buttonRef }: LabelReplaceControlProps) {
  // 押し続けた Enter・Space の click 合成が、開いた直後のダイアログへ届かないようにする
  return (
    <button
      ref={buttonRef}
      type="button"
      className={buttonClassName}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onOpen}
      onKeyDown={preventRepeatedActivationClick}
    >
      一括置換
    </button>
  );
}
```

- [ ] **Step 5: 実装する（Dialog）**

`client/src/components/layout/LabelReplaceDialog.tsx`:

```typescript
"use client";

import { useId, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import type { LabelReplaceRow } from "@/domain/search/nodeLabelReplace";
import type { LabelReplaceError, LabelReplaceFocusRequest } from "@/hooks/labelReplaceDialogState";

type LabelReplaceDialogProps = {
  query: string;
  replacement: string;
  scopeSelectedOnly: boolean;
  scopeCount: number;
  previewRows: readonly LabelReplaceRow[];
  hiddenReplaceCount: number;
  previewLimit: number;
  statusText: string;
  submitLabel: string;
  error: LabelReplaceError;
  canSubmit: boolean;
  focusRequest: LabelReplaceFocusRequest;
  onFocusRequestApplied: () => void;
  onQueryChange: (query: string) => void;
  onReplacementChange: (replacement: string) => void;
  onScopeSelectedOnlyChange: (value: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
  onMouseClick: () => void;
};

const inputClassName = "w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900";

function isComposing(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

export function LabelReplaceDialog({
  query,
  replacement,
  scopeSelectedOnly,
  scopeCount,
  previewRows,
  hiddenReplaceCount,
  previewLimit,
  statusText,
  submitLabel,
  error,
  canSubmit,
  focusRequest,
  onFocusRequestApplied,
  onQueryChange,
  onReplacementChange,
  onScopeSelectedOnlyChange,
  onCancel,
  onSubmit,
  onMouseClick,
}: LabelReplaceDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const queryId = useId();
  const replacementId = useId();
  const deleteNoteId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onCancel });
  const shownError = useReannouncedNotice(error.sequence, error);

  useLayoutEffect(() => {
    if (focusRequest !== "query") return;
    queryRef.current?.focus();
    onFocusRequestApplied();
  }, [focusRequest, onFocusRequestApplied]);

  // 検索語の Enter は置換語へ進むだけ。確定は置換語の欄とボタンに限る（プレビューを見る前の確定を避ける）
  const handleQueryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposing(event)) return;
    event.preventDefault();
    if (!event.repeat) replacementRef.current?.focus();
  };

  const handleReplacementKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isComposing(event)) return;
    event.preventDefault();
    if (!event.repeat && canSubmit) onSubmit();
  };

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
        <h2 id={headingId} className="text-lg font-semibold">一括置換</h2>
        <p id={descriptionId} className="text-sm">
          ノードのラベルに含まれる文字列をまとめて置き換えます。大文字小文字と全角・半角は区別しません。
        </p>
        <label htmlFor={queryId} className="text-sm">検索語</label>
        <input
          id={queryId}
          ref={queryRef}
          type="text"
          className={inputClassName}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleQueryKeyDown}
        />
        <label htmlFor={replacementId} className="text-sm">置換語</label>
        <input
          id={replacementId}
          ref={replacementRef}
          type="text"
          className={inputClassName}
          value={replacement}
          aria-describedby={replacement === "" ? deleteNoteId : undefined}
          onChange={(event) => onReplacementChange(event.target.value)}
          onKeyDown={handleReplacementKeyDown}
        />
        {replacement === "" && <p id={deleteNoteId} className="text-sm">一致した文字を削除します。</p>}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={scopeSelectedOnly}
            disabled={scopeCount === 0}
            onChange={(event) => onScopeSelectedOnlyChange(event.target.checked)}
          />
          選択中のノードだけを対象にする（{scopeCount}件）
        </label>
        {/* ライブリージョンは常に描画し、中身だけを替える */}
        <p aria-live="polite" className="text-sm font-medium">{statusText}</p>
        {previewRows.length > 0 && (
          <ul aria-label="置換のプレビュー" className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
            {previewRows.map((row) => (
              <li key={row.nodeId} className="flex flex-col gap-0.5 rounded bg-zinc-50 p-2 dark:bg-zinc-900">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{row.before}</span>
                  <span aria-hidden="true">→</span>
                  <span className="truncate">{row.after === "" ? "（空）" : row.after}</span>
                </span>
                {row.status === "emptied" && (
                  <span className="text-amber-700 dark:text-amber-300">置換後のラベルが空になるため置換しません。</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {hiddenReplaceCount > 0 && (
          <p className="text-sm">
            {`ほかに${hiddenReplaceCount}件（一覧は先頭の${previewLimit}件まで表示します。確定はすべてが対象です）`}
          </p>
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
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: GREEN を確認する**

Run: `cd client && npx jest src/components/layout/__tests__/LabelReplaceControl.test.tsx src/components/layout/__tests__/LabelReplaceDialog.test.tsx && npm run typecheck && npm run lint`
Expected: PASS。`useDialogFocusTrap` の Escape が IME 変換中を無視することを、テストで確かめる（既存の `useDialogFocusTrap.test.tsx` も参照）。落ちる場合は期待値を変えず、`LabelReplaceDialog` の配線（`onEscape`）を見直す。

---

### Task 6: `MapEditor` への配線とページ統合テスト

**Files:**
- Modify: `client/src/components/map/MapEditor.tsx`
- Test: `client/src/app/__tests__/pageLabelReplace.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 2 の `updateNodeLabels`、Task 4 の `useLabelReplaceDialog`・`LABEL_REPLACE_PREVIEW_LIMIT`、Task 5 の `LabelReplaceControl`・`LabelReplaceDialog`、`MapEditor` の既存の値（`mapId`、`nodes`、`selectedNodeIds`、`documentRevision`、`publishTreeEditNotice`、`dialogMouseClickedAtRef`、`editorShortcutsEnabled`）

- [ ] **Step 1: 失敗するページ統合テストを書く**

`client/src/app/__tests__/pageLabelReplace.test.tsx`。先頭の `jest.mock` 群・`beforeEach`・`seedMapLibrary` の使い方は `client/src/app/__tests__/pageBranchMove.test.tsx` の先頭（`pixi.js`・`illustrationGeneration`・`mapJsonDownload`・`mapTextMeasurement`・`mapImageDownload`・`mapPngRasterizer` のモックと、`resetMapStageTestRuntime`・`window.localStorage.clear()`）をそのまま写す。

```typescript
import { act, fireEvent, screen } from "@testing-library/react";
import {
  dialog,
  exportedMap,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  undoButton,
  v3Json,
} from "@/app/testing/pageTestHelpers";
import {
  mockNodePointerHandlers,
  mockStageHandlers,
  pointer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// （pageBranchMove.test.tsx と同じ jest.mock 群をここに置く）

const mockDownloadMapJson = jest.fn();

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => jest.restoreAllMocks());

// 1: Apple pie（一致）、2: apple（一致）、3: banana（不一致）、4: 旧（置換後に空になる）、5: ＡＰＰＬＥ（全角で一致）
function seed() {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "置換テスト",
      json: v3Json([
        { id: 1, label: "Apple pie", x: 100, y: 100 },
        { id: 2, label: "apple", x: 300, y: 100 },
        { id: 3, label: "banana", x: 500, y: 100 },
        { id: 4, label: "旧", x: 100, y: 300 },
        { id: 5, label: "ＡＰＰＬＥ", x: 300, y: 300 },
      ]),
    },
  ], { currentMapId: "a" });
}

function openDialog() {
  fireEvent.click(headerButton("一括置換"));
}

// selectNode と同じ手順で、Shift を押しながらノードを押して範囲に加える（index は 0 始まり）
function shiftSelectNode(index: number, nodeCount: number) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(0, 0, { shiftKey: true }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}

function typeInto(label: string, value: string) {
  fireEvent.change(dialog().getByLabelText(label), { target: { value } });
}

function labelsOf(): string[] {
  return exportedMap(mockDownloadMapJson).nodes.map((node) => node.label);
}

describe("一括置換", () => {
  it("全ノードを対象に、検索語・置換語を入れて確定すると一致したラベルがまとまって変わる", async () => {
    seed();
    await renderPage();

    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    expect(dialog().getByText("3件を置換します。")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "3件を置換" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);
    expect(screen.getByText("3件のノードのラベルを置換しました。")).toBeInTheDocument();
  });

  it("確定全体を 1 回の Undo で戻し、1 回の Redo でやり直せる", async () => {
    seed();
    await renderPage();
    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    fireEvent.click(dialog().getByRole("button", { name: "3件を置換" }));

    fireEvent.click(undoButton());
    expect(labelsOf()).toEqual(["Apple pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);

    fireEvent.click(redoButton());
    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);
  });

  it("「選択中のノードだけ」にすると、開いた時点で選んだノード以外は変わらない", async () => {
    seed();
    await renderPage();
    selectNode(0, 5);

    openDialog();
    fireEvent.click(dialog().getByRole("checkbox", { name: "選択中のノードだけを対象にする（1件）" }));
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    expect(dialog().getByText("1件を置換します。")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "1件を置換" }));

    expect(labelsOf()).toEqual(["Orange pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);
  });

  it("置換後に空になるノードは置換せず、警告を出す", async () => {
    seed();
    await renderPage();
    openDialog();

    typeInto("検索語", "旧");
    typeInto("置換語", "");

    expect(dialog().getByText("置換後のラベルが空になるため置換しません。")).toBeInTheDocument();
    expect(dialog().getByText("置換できるノードがありません。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "0件を置換" })).toBeDisabled();
  });

  it("検索語が空のあいだは確定できず、理由を文言で示す", async () => {
    seed();
    await renderPage();
    openDialog();

    expect(dialog().getByText("検索語を入力してください。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "0件を置換" })).toBeDisabled();
  });

  it("キャンセルでラベルを変えずに閉じ、ヘッダーのボタンへフォーカスを戻す", async () => {
    seed();
    await renderPage();
    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");

    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(headerButton("一括置換")).toHaveFocus();
    expect(labelsOf()).toEqual(["Apple pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);
  });

  it("ダイアログが開いている間は、履歴ショートカットが働かない（開く前は同じ操作で Undo される）", async () => {
    seed();
    await renderPage();
    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    fireEvent.click(dialog().getByRole("button", { name: "3件を置換" }));
    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);

    // 前提: ダイアログを開く前なら、同じ操作で全件が戻る（pageBranchMove.test.tsx と同じく window へ送る）
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(labelsOf()).toEqual(["Apple pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);
    fireEvent.click(redoButton());
    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);

    openDialog();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);
  });

  it("複数選択 → アウトライン → マップへ戻ると、範囲の既定（2 件以上で「選択のみ」）が再び入る", async () => {
    seed();
    await renderPage();
    selectNode(0, 5);
    shiftSelectNode(1, 5);

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    fireEvent.click(screen.getByRole("button", { name: "マップ" }));
    openDialog();

    expect(dialog().getByRole("checkbox", { name: "選択中のノードだけを対象にする（2件）" })).toBeChecked();
  });

  it("押し続けた Enter・Space がヘッダーのボタンへ届いても既定動作を止める（確定後に戻ったフォーカス先でダイアログが開き直さない）", async () => {
    seed();
    await renderPage();
    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    fireEvent.click(dialog().getByRole("button", { name: "3件を置換" }), { detail: 1 });

    const button = headerButton("一括置換");
    expect(button).toHaveFocus();
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("アウトライン表示では「一括置換」ボタンが出ず、マップ表示へ戻すと出る", async () => {
    seed();
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.queryByRole("button", { name: "一括置換" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "マップ" }));
    expect(screen.getByRole("button", { name: "一括置換" })).toBeInTheDocument();
  });

  it("ノードが 1 件も無いマップでは「一括置換」ボタンが無効", async () => {
    seedMapLibrary(window.localStorage, [{ id: "a", name: "空", json: v3Json([]) }], { currentMapId: "a" });
    await renderPage();

    expect(headerButton("一括置換")).toBeDisabled();
  });
});
```

注意:
- 「ダイアログが開いている間はショートカットが働かない」の検証キー（`ctrlKey: true` の `z`）は、既存の履歴ショートカットのテスト（`useMapHistoryShortcuts` のテストや `pageBranchMove.test.tsx` の同種の確認）に合わせて直してよい。「開く前は同じ操作で Undo される」ことを先に確かめる形（開く前に効く → 開いている間は効かない）にする。
- 「アウトライン」「マップ」「元に戻す」「やり直す」のボタン名は既存 UI のもの（`pageBulkImportance.test.tsx` と同じ）。
- 通知の文言の確認 `getByText("3件のノードのラベルを置換しました。")` が複数領域に出て失敗する場合は、`getAllByText` に変えず、通知枠（`data-testid="operation-notices"`）の中で探す。

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/app/__tests__/pageLabelReplace.test.tsx`
Expected: FAIL（「一括置換」ボタンが無い）。この時点で他のページテスト用のモックの不足があれば、`pageBranchMove.test.tsx` を参考に直す。

- [ ] **Step 3: 実装する（`MapEditor.tsx`）**

- import を追加する: `LabelReplaceControl`、`LabelReplaceDialog`（`@/components/layout/...`）、`useLabelReplaceDialog`・`LABEL_REPLACE_PREVIEW_LIMIT`（`@/hooks/useLabelReplaceDialog`）。
- `useNodes()` の分割代入に `updateNodeLabels` を追加する。
- `branchMove` を作っている `useBranchMoveDialog({...})` の直後に追加する。

```typescript
  const labelReplace = useLabelReplaceDialog({
    mapId,
    nodes,
    selectedNodeIds,
    documentRevision,
    updateNodeLabels,
    publishNotice: publishTreeEditNotice,
  });
  const labelReplaceButtonRef = useRef<HTMLButtonElement>(null);
  const { focusRequest: labelReplaceFocusRequest, consumeFocusRequest: consumeLabelReplaceFocusRequest } = labelReplace;
```

- `branchMoveFocusRequest === "header"` でボタンへフォーカスを戻している既存の effect（`branchMoveFocusRequest` を使う `useLayoutEffect` / `useEffect`）を読み、**同じ形**で `labelReplaceFocusRequest === "header"` のとき `labelReplaceButtonRef.current` へフォーカスして `consumeLabelReplaceFocusRequest()` を呼ぶ effect を追加する（ボタンが無効・存在しない場合の扱いも既存と同じにする）。
- `editorShortcutsEnabled` の条件に `&& labelReplace.screen === "closed"` を追加する（`branchMove.screen === "closed"` の行の直後）。
- ヘッダーの `viewMode === "map"` のブロックの中で、`BranchMoveControl` の直後に追加する。

```tsx
                  <LabelReplaceControl
                    expanded={labelReplace.screen !== "closed"}
                    disabled={nodes.length === 0}
                    onOpen={labelReplace.open}
                    buttonRef={labelReplaceButtonRef}
                  />
```

- `BranchMoveDialog` の描画ブロックの直後（根の `inert` の外）に追加する。

```tsx
      {labelReplace.screen === "open" && (
        <LabelReplaceDialog
          query={labelReplace.query}
          replacement={labelReplace.replacement}
          scopeSelectedOnly={labelReplace.scopeSelectedOnly}
          scopeCount={labelReplace.scopeCount}
          previewRows={labelReplace.previewRows}
          hiddenReplaceCount={labelReplace.hiddenReplaceCount}
          previewLimit={LABEL_REPLACE_PREVIEW_LIMIT}
          statusText={labelReplace.statusText}
          submitLabel={labelReplace.submitLabel}
          error={labelReplace.error}
          canSubmit={labelReplace.canSubmit}
          focusRequest={labelReplace.focusRequest}
          onFocusRequestApplied={labelReplace.consumeFocusRequest}
          onQueryChange={labelReplace.setQuery}
          onReplacementChange={labelReplace.setReplacement}
          onScopeSelectedOnlyChange={labelReplace.setScopeSelectedOnly}
          onCancel={labelReplace.close}
          onSubmit={labelReplace.submit}
          onMouseClick={() => {
            dialogMouseClickedAtRef.current = Date.now();
          }}
        />
      )}
```

`MapEditor.tsx` にこれ以上のロジックを足さない（状態・計算はフックに置いた）。`dialogMouseClickedAtRef` は `BranchMoveDialog` の `onMouseClick` が使っている ref と同じものを使う。

- [ ] **Step 4: GREEN と回帰を確認する**

Run: `cd client && npx jest src/app/__tests__/pageLabelReplace.test.tsx src/app/__tests__/pageBranchMove.test.tsx src/app/__tests__/pageBulkImportance.test.tsx src/app/__tests__/page.test.tsx && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし

---

### Task 7: ドキュメント・ROADMAP の更新と全体検証

**Files:**
- Modify: `docs/specifications/features.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: Task 1〜6 の挙動と、Global Constraints の文言。設計書 §9。

- [ ] **Step 1: `features.md` を更新する**

`grep -n "候補010\|一括編集\|Phase 17\|BranchMove\|枝を移動\|へ渡し" docs/specifications/features.md` で全箇所を確かめてから、次を更新する（行番号はずれている可能性がある）。
- 冒頭（3 行目付近）の対象機能一覧に「一括置換」を加える。
- Phase 一覧の Phase 17 の行に、一括置換（ヘッダーの「一括置換」ダイアログ、全ノードまたは開いた時点の選択集合、部分一致で大文字小文字と全角・半角を区別しない、プレビュー、空になるノードは対象外、1 操作での Undo / Redo）を追記する。
- ヘッダー構成の図（`AppHeader: [...]` の行）に `[一括置換]` を「枝を移動」の隣へ追加する。
- 新しい章「一括置換」を、既存の章の並びに合わせて追加する（次の章番号を使い、目次にも追加）。次を書く: 対象と範囲（全ノード・選択のみ・開いた時点で固定）、一致規則（NFKC＋小文字化、検索語の前後の空白を削らない、置換語は入力どおり、重ならない出現をすべて左から、正規化で長さが変わる文字の位置の対応づけと、対応づけられない一致を置換しないこと）、プレビュー（行の表示、`emptied` の警告、`unchanged` を出さない、`replace` は 200 行まで、状態文言と無効の理由）、確定（計画の作り直し、1 操作の Undo / Redo、成功通知、stale）、キー操作（検索語欄の `Enter` は置換語へ、置換語欄の `Enter` とボタンで確定、IME・リピート、`Escape`）、ダイアログ表示中のショートカット停止、マップ表示でだけボタンが出ること、保存形式が変わらないこと。
- 「ダイアログ表示中は…を止める」の既存の記述（`BranchMove` やアウトライン取り込みを列挙している箇所）があれば、一括置換を加える。成功通知を共有する通知枠（枝の構造変更の通知）の説明に「ラベルの一括置換の成功」を加える。

- [ ] **Step 2: `architecture/overview.md` を更新する**

まず `grep -n "BranchMove\|branchMove\|枝を移動" docs/architecture/overview.md docs/specifications/features.md` で、新機能が影響する既存の記述をすべて洗い出して確かめる。少なくとも次を見る: AppHeader のボタン一覧、`preventRepeatedActivationClick` の利用者一覧、`editorShortcutsEnabled` の式とダイアログの配線の説明、通知枠の受け渡し先の一覧と数（`features.md` の「…へ渡し」の数）、`components/layout/`・`hooks/`・`domain/search/` のファイル数、枝の移動の章に倣う責務分担の節の要否。`README.md` と `client/README.md` は、直近の候補009・010 で更新していないため、更新しない。

新しいファイル（`domain/search/nodeLabelReplace.ts`、`hooks/labelReplaceDialogState.ts`、`hooks/useLabelReplaceDialog.ts`、`components/layout/LabelReplaceControl.tsx`、`components/layout/LabelReplaceDialog.tsx`）を、各一覧の並び順の規則に合わせて追記し、`domain/search/`・`hooks/`・`components/layout/` のファイル数の記述を実際の数に直す（`ls` で数え、既存の数え方に合わせる）。`useNodes.ts` の説明に `updateNodeLabels` を、`MapEditor.tsx` の説明に一括置換ダイアログの配線を追記する。

- [ ] **Step 3: `browser-test-cases.md` に AD 節を追加する**

`## AC.` 節の後、`## 結果の集計` の前に、AC 節と同じ書式（見出し・前提・手順・期待・結果 `-（未実施）`・【高/中/低】）で `## AD. 一括置換（Phase 17・候補034）` を追加する。最低限のケース:
- AD-01 全ノードを対象に置換し、全角・半角と大文字小文字の違いが同じ語として置換される【高】
- AD-02 プレビューの置換前後と件数が確定結果と一致する【高】
- AD-03 「選択中のノードだけ」で、選択外が変わらない【高】
- AD-04 置換後に空になるノードの警告と、置換されないこと【高】
- AD-05 確定を Undo 1 回で全件戻し、Redo 1 回でやり直す【高】
- AD-06 日本語 IME の変換中の `Enter`・`Escape` でダイアログが確定・閉じない（実 IME）【高】★
- AD-07 `Enter` の押し続けと、ボタンのダブルクリックで二重に置換・再オープンしない【中】
- AD-08 折りたたみ・解像度フィルターで隠れたノードも置換される【中】
- AD-09 アウトライン表示ではボタンが出ない【低】
- AD-10 スクリーンリーダーで状態文言（件数・理由）が読み上げられる【低】★
- AD-11 検索語・置換語が非常に長いラベルでも入力が固まらない【低】
「結果の集計」の表に AD 行を、AC 行と同じ形で追加する（実ブラウザは未実施と一貫して書く）。

- [ ] **Step 4: `ROADMAP.md` を更新する**

- `最終更新:` を `2026-11-16` にする（すでに同じ日付なら変更不要）。
- Phase 17 の `- [ ] **一括検索・置換**（候補034）` を `- [x]` にする。
- 「現在地」の Phase 17 の段落を更新する: 候補009・010・034 が完了、候補034 の要約（ヘッダーの「一括置換」ダイアログ、部分一致で大文字小文字と全角・半角を区別しない、全ノードまたは開いた時点の選択、プレビュー、空になるノードは対象外、1 操作の Undo / Redo、マップ表示のみ）、Jest（jsdom）と `npm run verify` で確認済み、実ブラウザ確認（AB・AC・AD 節）は未実施、次の未完了項目は候補035「ノードの分割・統合」。

- [ ] **Step 5: 全体検証**

Run: `cd client && npm run verify`
Expected: tailwind:scan・lint・typecheck・test・build がすべて成功

---

## 自己レビューの結果

- 設計書との対応: §3 → Task 1、§4 → Task 2、§5.1 → Task 3、§5.2・§5.3 → Task 4・5、配線・§6 → Task 6、§9 → Task 7。§7 のテスト方針は各 Task のテストと Global Constraints の fixture 規則に配置した。
- 型と名前の一貫性: `planLabelReplace`、`applyLabelReplacements`、`LabelReplaceRow`、`updateNodeLabels`、`useLabelReplaceDialog`、`LABEL_REPLACE_PREVIEW_LIMIT`、`previewRows`、`hiddenReplaceCount`、`submitLabel`、`statusText` を全タスクで同じ名前で使う。
- 設計書からの具体化: `LabelReplaceRow` は `matchCount` を持つが画面には出さない。`replace` 行が 0 件で `emptied` だけのときの状態文言（`置換できるノードがありません。`）を、設計書の無効理由の文言に加えた。
