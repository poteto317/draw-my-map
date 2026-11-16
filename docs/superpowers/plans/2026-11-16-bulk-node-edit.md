# 選択ノードの一括編集（候補010）実装プラン

> **状態:** サブエージェントレビュー 2 周通過・自動承認済み。
>
> **For agentic workers:** このリポジトリでは AGENTS.md の規定により、superpowers:subagent-driven-development で実装する（インライン実行は使わない）。Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** キャンバスで複数選択したノードの重要度を、ヘッダーの重要度ボタンからまとめて変更できるようにする（1 操作で Undo / Redo）。

**Architecture:** ドメインに複数 ID の重要度置換 `replaceNodesImportance` と選択集合の要約 `summarizeSelectionImportance` を追加し、`useNodes` の `updateNodesImportance` が `applyNonStructuralChange` を 1 回だけ呼んで 1 操作として記録する。`NodeImportanceSelector` は件数と混在を表示する必須 props を受け、`MapEditor` が表示モードに応じた対象 ID（キャンバスは選択集合、アウトラインは主選択 1 件）を渡す。

**Tech Stack:** Next.js（App Router）、React、TypeScript、Jest（jsdom）、Testing Library。

**設計書:** `docs/superpowers/specs/2026-11-16-bulk-node-edit-design.md`

## Global Constraints

- 作業ディレクトリ: `/Users/mash/Desktop/draw-my-map/.worktrees/feat-phase17-bulk-node-edit`。テストと検証は `client` ディレクトリで実行する。
- TDD: 実装コードより先にテストを書き、失敗（RED）を確認してから実装する。
- **コミットしない。** コミットは後続の `/commit-ja` で行う（dev-flow の `/feature` の規則）。
- 対象の属性は重要度のみ。色・タグ・イラストの一括編集、右クリックメニューやアウトラインからの一括編集、子孫への波及は実装しない。
- 一括変更は 1 操作として履歴に記録する。全件がすでに同値なら履歴を増やさない（`areMapStatesEqual` が保証）。
- 保存形式（V3）は変えない。
- 表示文言: `N件選択中`、混在時 `N件選択中・混在`（中黒「・」）。ボタン群の `aria-label` は 2 件以上で `重要度（N件選択中）`（全角括弧）、1 件以下で `重要度`。
- 新しい props `selectionCount: number` と `mixed: boolean` は既定値なしの必須 props（L-060）。
- テストの fixture: 選択していないノードを必ず 1 件入れて不変を確かめる。一括変更前の重要度は目標と異なる値で、ノードごとにも異なる値（例: 高と中）にする。テスト用ノードの既定値（すべて `medium`）のまま使わない（L-168, L-170, L-616）。
- 気をつける知見: L-001（成否を返す）、L-002（空を全件と扱わない）、L-453（1 回の更新関数でまとめる）、L-061（無効化の入口を一貫させる）、L-060、L-153 / L-154（ライブリージョンを常に描画・`aria-label` を件数に追従）、L-168 / L-170 / L-616（fixture）。
- 返答・コメント・ドキュメントは日本語。

---

### Task 1: ドメイン（複数 ID の重要度置換と選択の要約）

**Files:**
- Modify: `client/src/domain/nodes/nodeImportanceUpdate.ts`
- Create: `client/src/domain/nodes/selectionImportanceSummary.ts`
- Test: `client/src/domain/nodes/__tests__/nodeImportanceUpdate.test.ts`（追記）
- Test: `client/src/domain/nodes/__tests__/selectionImportanceSummary.test.ts`（新規）

**Interfaces:**
- Produces:
  - `replaceNodesImportance(nodes: readonly Node[], ids: readonly number[], importance: NodeImportance): Node[] | null`（`@/domain/nodes/nodeImportanceUpdate`）
  - `type SelectionImportanceSummary = { kind: "none" } | { kind: "uniform"; importance: NodeImportance; count: number } | { kind: "mixed"; count: number }`
  - `summarizeSelectionImportance(nodes: readonly Node[], ids: readonly number[]): SelectionImportanceSummary`（`@/domain/nodes/selectionImportanceSummary`）
- 既存の `replaceNodeImportance` は実装も挙動も変えない。

- [x] **Step 1: `replaceNodesImportance` の失敗するテストを書く**

`client/src/domain/nodes/__tests__/nodeImportanceUpdate.test.ts` の import を `import { replaceNodeImportance, replaceNodesImportance } from "@/domain/nodes/nodeImportanceUpdate";` に変え、末尾に追記する。

```typescript
describe("replaceNodesImportance", () => {
  it("指定した複数ノードだけを新しい重要度へ置き換え、選択外のノードは参照ごと保つ", () => {
    const high = createTestNode({ id: 1, importance: "high" });
    const medium = createTestNode({ id: 2, importance: "medium" });
    const untouched = createTestNode({ id: 3, importance: "medium" });

    const result = replaceNodesImportance([high, medium, untouched], [1, 2], "low");

    expect(result).toEqual([
      { ...high, importance: "low" },
      { ...medium, importance: "low" },
      untouched,
    ]);
    expect(result?.[2]).toBe(untouched);
  });

  it("すでに指定の重要度のノードは参照をそのまま返す", () => {
    const alreadyLow = createTestNode({ id: 1, importance: "low" });
    const high = createTestNode({ id: 2, importance: "high" });

    const result = replaceNodesImportance([alreadyLow, high], [1, 2], "low");

    expect(result?.[0]).toBe(alreadyLow);
    expect(result?.[1]).toEqual({ ...high, importance: "low" });
  });

  it("存在しないIDは無視し、存在するIDだけを置き換える", () => {
    const high = createTestNode({ id: 1, importance: "high" });
    const untouched = createTestNode({ id: 2, importance: "medium" });

    const result = replaceNodesImportance([high, untouched], [1, 999], "low");

    expect(result).toEqual([{ ...high, importance: "low" }, untouched]);
  });

  it.each([
    ["空配列", [] as number[]],
    ["全IDが不在", [998, 999]],
  ])("%sのときはnullを返す", (_name, ids) => {
    const nodes = [createTestNode({ id: 1, importance: "high" })];

    expect(replaceNodesImportance(nodes, ids, "low")).toBeNull();
  });
});
```

- [x] **Step 2: `summarizeSelectionImportance` の失敗するテストを書く**

`client/src/domain/nodes/__tests__/selectionImportanceSummary.test.ts` を新規作成する。

```typescript
import { summarizeSelectionImportance } from "@/domain/nodes/selectionImportanceSummary";
import { createTestNode } from "@/testing/createTestNode";

describe("summarizeSelectionImportance", () => {
  const nodes = [
    createTestNode({ id: 1, importance: "high" }),
    createTestNode({ id: 2, importance: "high" }),
    createTestNode({ id: 3, importance: "low" }),
  ];

  it("対象が空ならnoneを返す", () => {
    expect(summarizeSelectionImportance(nodes, [])).toEqual({ kind: "none" });
  });

  it("全IDが不在ならnoneを返す", () => {
    expect(summarizeSelectionImportance(nodes, [998, 999])).toEqual({ kind: "none" });
  });

  it("全件が同じ重要度ならuniformと件数を返す", () => {
    expect(summarizeSelectionImportance(nodes, [1, 2])).toEqual({
      kind: "uniform",
      importance: "high",
      count: 2,
    });
  });

  it("1件だけならその重要度のuniformを返す", () => {
    expect(summarizeSelectionImportance(nodes, [3])).toEqual({
      kind: "uniform",
      importance: "low",
      count: 1,
    });
  });

  it("重要度が混在していればmixedと件数を返す", () => {
    expect(summarizeSelectionImportance(nodes, [1, 3])).toEqual({ kind: "mixed", count: 2 });
  });

  it("不在IDは件数に数えない", () => {
    expect(summarizeSelectionImportance(nodes, [1, 2, 999])).toEqual({
      kind: "uniform",
      importance: "high",
      count: 2,
    });
  });
});
```

- [x] **Step 3: RED を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeImportanceUpdate.test.ts src/domain/nodes/__tests__/selectionImportanceSummary.test.ts`
Expected: FAIL（`replaceNodesImportance` が export されていない、`selectionImportanceSummary` モジュールが無い）

- [x] **Step 4: 実装する**

`client/src/domain/nodes/nodeImportanceUpdate.ts` の末尾に追加する（既存の `replaceNodeImportance` は変えない）。

```typescript
// 指定IDのうち存在するノードだけを置き換える。存在するIDが1件も無ければ何も変えずnullを返す
// （空の指定を「全件」や「成功」と扱わない）。すでに同じ重要度のノードは参照を保つ
export function replaceNodesImportance(
  nodes: readonly Node[],
  ids: readonly number[],
  importance: NodeImportance,
): Node[] | null {
  const targetIds = new Set(ids);
  if (!nodes.some((node) => targetIds.has(node.id))) return null;

  return nodes.map((node) => (
    targetIds.has(node.id) && node.importance !== importance
      ? { ...node, importance }
      : node
  ));
}
```

`client/src/domain/nodes/selectionImportanceSummary.ts` を新規作成する。

```typescript
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

export type SelectionImportanceSummary =
  | { kind: "none" }
  | { kind: "uniform"; importance: NodeImportance; count: number }
  | { kind: "mixed"; count: number };

// 対象IDのうち存在するノードだけで、重要度が揃っているかと件数を求める
export function summarizeSelectionImportance(
  nodes: readonly Node[],
  ids: readonly number[],
): SelectionImportanceSummary {
  const targetIds = new Set(ids);
  const importances = nodes
    .filter((node) => targetIds.has(node.id))
    .map((node) => node.importance);
  if (importances.length === 0) return { kind: "none" };

  const [first] = importances;
  return importances.every((importance) => importance === first)
    ? { kind: "uniform", importance: first, count: importances.length }
    : { kind: "mixed", count: importances.length };
}
```

- [x] **Step 5: GREEN を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeImportanceUpdate.test.ts src/domain/nodes/__tests__/selectionImportanceSummary.test.ts`
Expected: PASS

---

### Task 2: フック `updateNodesImportance`

**Files:**
- Modify: `client/src/hooks/useNodes.ts`（import、戻り値の型 `UseNodesResult` 相当の型定義、`updateNodeImportance` の直後に関数を追加、return に追加）
- Test: `client/src/hooks/__tests__/useNodesBulkImportance.test.ts`（新規）

**Interfaces:**
- Consumes: Task 1 の `replaceNodesImportance`
- Produces: `useNodes()` の戻り値に `updateNodesImportance: (ids: readonly number[], importance: NodeImportance) => boolean`
  - 1 件以上置換 → `true`。全件すでに同値 → `true`（履歴は不変）。空配列・全 ID 不在 → `false`。

- [x] **Step 1: 失敗するテストを書く**

`client/src/hooks/__tests__/useNodesBulkImportance.test.ts` を新規作成する。初期化は `useNodesHistory.test.ts` と同じく `renderHook(() => useNodes())` と `replaceMap` を使う。

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
        createTestNode({ id: 1, importance: "high" }),
        createTestNode({ id: 2, importance: "medium" }),
        createTestNode({ id: 3, importance: "medium" }),
      ],
    });
  });
  return view;
}

function importances(result: ReturnType<typeof setup>["result"]) {
  return result.current.nodes.map((node) => node.importance);
}

describe("useNodes の updateNodesImportance", () => {
  it("指定した複数ノードの重要度をまとめて変え、選択外は変えない", () => {
    const { result } = setup();

    let applied = false;
    act(() => { applied = result.current.updateNodesImportance([1, 2], "low"); });

    expect(applied).toBe(true);
    expect(importances(result)).toEqual(["low", "low", "medium"]);
  });

  it("一括変更は1回のUndoで全件戻り、1回のRedoで全件やり直す", () => {
    const { result } = setup();

    act(() => { result.current.updateNodesImportance([1, 2], "low"); });
    act(() => { result.current.undo(); });
    expect(importances(result)).toEqual(["high", "medium", "medium"]);
    expect(result.current.canUndo).toBe(false);

    act(() => { result.current.redo(); });
    expect(importances(result)).toEqual(["low", "low", "medium"]);
  });

  it("全件がすでに同値なら受理してtrueを返し、履歴を積まない", () => {
    const { result } = setup();
    act(() => { result.current.updateNodesImportance([3], "high"); });

    let applied = false;
    act(() => { applied = result.current.updateNodesImportance([1, 3], "high"); });

    expect(applied).toBe(true);
    act(() => { result.current.undo(); });
    // 同値の呼び出しが履歴を積んでいれば、ここでは id 3 が high のまま残る
    expect(importances(result)).toEqual(["high", "medium", "medium"]);
    expect(result.current.canUndo).toBe(false);
  });

  it.each([
    ["空配列", [] as number[]],
    ["全IDが不在", [998, 999]],
  ])("%sではfalseを返し何も変えない", (_name, ids) => {
    const { result } = setup();

    let applied = true;
    act(() => { applied = result.current.updateNodesImportance(ids, "low"); });

    expect(applied).toBe(false);
    expect(importances(result)).toEqual(["high", "medium", "medium"]);
    expect(result.current.canUndo).toBe(false);
  });
});
```

注意: `replaceMap` 直後に `canUndo` が `false` であることを前提にしている。前提が成り立たない場合は、既存の `useNodesHistory.test.ts` の初期化方法に合わせて直し、その旨を報告する。

- [x] **Step 2: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodesBulkImportance.test.ts`
Expected: FAIL（`updateNodesImportance is not a function`）

- [x] **Step 3: 実装する**

`client/src/hooks/useNodes.ts`:
- import を `import { replaceNodeImportance, replaceNodesImportance } from "@/domain/nodes/nodeImportanceUpdate";` に変える。
- 戻り値の型の `updateNodeImportance` の行の直後に追加する。

```typescript
  updateNodesImportance: (ids: readonly number[], importance: NodeImportance) => boolean;
```

- `updateNodeImportance` の `useCallback` の直後に追加する。

```typescript
  // 選択集合の重要度を1回の更新関数でまとめて変え、1操作として履歴に記録する
  const updateNodesImportance = useCallback((ids: readonly number[], importance: NodeImportance) => (
    applyNonStructuralChange((currentNodes) => (
      replaceNodesImportance(currentNodes, ids, importance)
    ))
  ), [applyNonStructuralChange]);
```

- return オブジェクトの `updateNodeImportance,` の直後に `updateNodesImportance,` を追加する。

- [x] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodesBulkImportance.test.ts src/hooks/__tests__/useNodesHistory.test.ts`
Expected: PASS

---

### Task 3: `NodeImportanceSelector` の件数・混在表示

**Files:**
- Modify: `client/src/components/layout/NodeImportanceSelector.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`（型エラーを解消する最小の受け渡しのみ。Task 4 で本配線する）
- Test: `client/src/components/layout/__tests__/NodeImportanceSelector.test.tsx`（既存の render に新 props を追加し、新しいテストを追記）

**Interfaces:**
- Produces: `NodeImportanceSelectorProps = { importance: NodeImportance | null; disabled: boolean; selectionCount: number; mixed: boolean; onChange: (importance: NodeImportance) => void }`
  - `aria-live="polite"` の `span`（`data-testid` は付けない。テストは `getByText` / コンテナ照会で行う）を常に描画し、`selectionCount >= 2` のとき `N件選択中`（`mixed` なら `N件選択中・混在`）、それ以外は空。
  - `role="group"` の `aria-label` は `selectionCount >= 2` で `重要度（N件選択中）`、それ以外は `重要度`。

- [x] **Step 1: 既存テストに新 props を足し、失敗するテストを追記する**

既存の 4 つ程度の `render(<NodeImportanceSelector ... />)` すべてに `selectionCount={1}` と `mixed={false}` を追加する（未選択の無効化テストだけは `selectionCount={0}`）。そのうえで末尾の `describe` 内に追記する。

```typescript
  it("2件以上選択中は件数をライブリージョンに表示し、グループ名に件数を含める", () => {
    render(
      <NodeImportanceSelector
        importance="high"
        disabled={false}
        selectionCount={3}
        mixed={false}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "重要度（3件選択中）" })).toBeInTheDocument();
    expect(screen.getByText("3件選択中")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "重要度 高" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("混在時はどのボタンも押下表示にせず、混在を併記する", () => {
    render(
      <NodeImportanceSelector
        importance={null}
        disabled={false}
        selectionCount={2}
        mixed
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByText("2件選択中・混在")).toBeVisible();
    ["重要度 高", "重要度 中", "重要度 低"].forEach((name) => {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(button).toBeEnabled();
    });
  });

  it.each([0, 1])("選択%i件ではライブリージョンを空のまま描画し、グループ名は重要度のまま", (count) => {
    const { container } = render(
      <NodeImportanceSelector
        importance={count === 1 ? "medium" : null}
        disabled={count === 0}
        selectionCount={count}
        mixed={false}
        onChange={jest.fn()}
      />,
    );

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toBeEmptyDOMElement();
    expect(screen.getByRole("group", { name: "重要度" })).toBeInTheDocument();
  });

  it("件数が変わってもライブリージョンの要素を作り直さず、中身だけを替える", () => {
    const props = { importance: "medium", disabled: false, mixed: false, onChange: jest.fn() } as const;
    const { container, rerender } = render(<NodeImportanceSelector {...props} selectionCount={1} />);
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeEmptyDOMElement();

    rerender(<NodeImportanceSelector {...props} selectionCount={2} />);
    expect(container.querySelector('[aria-live="polite"]')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent("2件選択中");

    rerender(<NodeImportanceSelector {...props} selectionCount={1} />);
    expect(container.querySelector('[aria-live="polite"]')).toBe(liveRegion);
    expect(liveRegion).toBeEmptyDOMElement();
  });

  it("混在時にボタンを押すとその重要度でonChangeを呼ぶ", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <NodeImportanceSelector
        importance={null}
        disabled={false}
        selectionCount={2}
        mixed
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重要度 低" }));

    expect(onChange).toHaveBeenCalledWith("low");
  });
```

- [x] **Step 2: RED を確認する**

Run: `cd client && npx jest src/components/layout/__tests__/NodeImportanceSelector.test.tsx`
Expected: FAIL（件数のテキストとライブリージョンが無い、グループ名が一致しない）

- [x] **Step 3: 実装する**

`client/src/components/layout/NodeImportanceSelector.tsx` の props 型とコンポーネントを次のとおりにする（`importanceOptions` とクラス名の定数は変えない）。

```typescript
type NodeImportanceSelectorProps = {
  importance: NodeImportance | null;
  disabled: boolean;
  // 一括編集の対象件数。2件以上で件数を表示する
  selectionCount: number;
  // 対象の重要度が揃っていないとき true
  mixed: boolean;
  onChange: (importance: NodeImportance) => void;
};
```

```tsx
export function NodeImportanceSelector({
  importance,
  disabled,
  selectionCount,
  mixed,
  onChange,
}: NodeImportanceSelectorProps) {
  const isMultiple = selectionCount >= 2;
  const countText = isMultiple
    ? `${selectionCount}件選択中${mixed ? "・混在" : ""}`
    : "";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">重要度</span>
      <div
        className="flex overflow-hidden rounded-md"
        role="group"
        aria-label={isMultiple ? `重要度（${selectionCount}件選択中）` : "重要度"}
      >
        {importanceOptions.map(({ importance: optionImportance, label }) => {
          const selected = importance === optionImportance;

          return (
            <button
              key={optionImportance}
              type="button"
              aria-label={`重要度 ${label}`}
              aria-pressed={selected}
              disabled={disabled}
              className={`${baseButtonClassName} ${selected ? selectedButtonClassName : idleButtonClassName}`}
              onClick={() => onChange(optionImportance)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {/* 件数の変化を読み上げるため、ライブリージョンは常に描画して中身だけを替える */}
      <span className="text-xs text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {countText}
      </span>
    </div>
  );
}
```

`client/src/components/map/MapEditor.tsx` の `<NodeImportanceSelector` に、型を通すためだけの暫定値 `selectionCount={selectedNode === null ? 0 : 1}` と `mixed={false}` を追加する（Task 4 で置き換える）。

- [x] **Step 4: GREEN と型チェックを確認する**

Run: `cd client && npx jest src/components/layout/__tests__/NodeImportanceSelector.test.tsx && npm run typecheck`
Expected: PASS、型エラーなし

---

### Task 4: `MapEditor` の配線とページ統合テスト

**Files:**
- Modify: `client/src/components/map/MapEditor.tsx`（`useNodes` の分割代入に `updateNodesImportance` を追加、対象 ID と要約の算出、`NodeImportanceSelector` への受け渡し）
- Test: `client/src/app/__tests__/pageBulkImportance.test.tsx`（新規）

**Interfaces:**
- Consumes: Task 1 の `summarizeSelectionImportance`、Task 2 の `updateNodesImportance`、Task 3 の `NodeImportanceSelector` の props、既存の `selectedNodeIds`・`selectedNodeId`・`viewMode`（`MapEditor.tsx` の `useState<EditorViewMode>("map")`）。

- [x] **Step 1: 失敗するページ統合テストを書く**

`client/src/app/__tests__/pageBulkImportance.test.tsx` を新規作成する。`MapStage` のモックは `page.test.tsx` の書き方に倣い、トグル用の `onToggleNodeSelection` を受けるボタンを足す。

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import type { Node } from "@/types/node";

let mockNodes: Node[] = [];

jest.mock("@/hooks/useIllustrationGeneration", () => ({
  useIllustrationGeneration: () => ({
    generation: { status: "idle" },
    generateIllustration: jest.fn(),
    dismissGeneration: jest.fn(),
  }),
}));

jest.mock("@/hooks/useMapImageExport", () => ({
  useMapImageExport: () => ({
    exportPng: jest.fn(),
    exportSvg: jest.fn(),
    isExportingPng: false,
    notice: null,
  }),
}));

jest.mock("@/components/map/MapStage", () => ({
  MapStage: ({
    nodes,
    onDoubleClick,
    onSelectNode,
    onToggleNodeSelection,
  }: {
    nodes: Node[];
    onDoubleClick: (x: number, y: number) => void;
    onSelectNode: (id: number | null) => void;
    onToggleNodeSelection: (id: number) => void;
  }) => {
    mockNodes = nodes;
    return (
      <div data-testid="map-stage">
        <button type="button" onClick={() => onDoubleClick(10, 20)}>テスト用ノード追加</button>
        {nodes.map((node, index) => (
          <span key={node.id}>
            <button type="button" onClick={() => onSelectNode(node.id)}>
              {`テスト用選択${index + 1}`}
            </button>
            <button type="button" onClick={() => onToggleNodeSelection(node.id)}>
              {`テスト用トグル${index + 1}`}
            </button>
          </span>
        ))}
      </div>
    );
  },
}));

function importances() {
  return mockNodes.map((node) => node.importance);
}

// 3件を作り、1件目を高・2件目を中・3件目を中にする（3件目は選択しない対照）
async function setupThreeNodes(user: ReturnType<typeof userEvent.setup>) {
  render(<Home />);
  for (let i = 0; i < 3; i += 1) {
    await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
  }
  await user.click(screen.getByRole("button", { name: "テスト用選択1" }));
  await user.click(screen.getByRole("button", { name: "重要度 高" }));
  expect(importances()).toEqual(["high", "medium", "medium"]);
}

describe("選択ノードの重要度の一括編集", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockNodes = [];
  });

  it("2件選択中に重要度を押すと両方が変わり、選択外は変わらない。Undo 1回で両方戻る", async () => {
    const user = userEvent.setup();
    await setupThreeNodes(user);

    await user.click(screen.getByRole("button", { name: "テスト用選択1" }));
    await user.click(screen.getByRole("button", { name: "テスト用トグル2" }));
    await user.click(screen.getByRole("button", { name: "重要度 低" }));

    expect(importances()).toEqual(["low", "low", "medium"]);

    await user.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(importances()).toEqual(["high", "medium", "medium"]);
  });

  it("重要度が混在する2件の選択ではどのボタンも押下表示にせず、件数と混在を表示する", async () => {
    const user = userEvent.setup();
    await setupThreeNodes(user);

    await user.click(screen.getByRole("button", { name: "テスト用選択1" }));
    await user.click(screen.getByRole("button", { name: "テスト用トグル2" }));

    expect(screen.getByText("2件選択中・混在")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "重要度（2件選択中）" })).toBeInTheDocument();
    ["重要度 高", "重要度 中", "重要度 低"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("同じ重要度の2件の選択ではその重要度を押下表示にする", async () => {
    const user = userEvent.setup();
    await setupThreeNodes(user);

    // 既定値（中）のまま比べないよう、2件目と3件目を1件ずつ「低」にしてから選ぶ
    await user.click(screen.getByRole("button", { name: "テスト用選択2" }));
    await user.click(screen.getByRole("button", { name: "重要度 低" }));
    await user.click(screen.getByRole("button", { name: "テスト用選択3" }));
    await user.click(screen.getByRole("button", { name: "重要度 低" }));
    expect(importances()).toEqual(["high", "low", "low"]);

    await user.click(screen.getByRole("button", { name: "テスト用選択2" }));
    await user.click(screen.getByRole("button", { name: "テスト用トグル3" }));

    expect(screen.getByText("2件選択中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重要度 低" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "重要度 高" })).toHaveAttribute("aria-pressed", "false");
  });

  it("2件選択したままアウトラインへ切り替えると、重要度の変更は主選択だけに作用する", async () => {
    const user = userEvent.setup();
    await setupThreeNodes(user);

    // 1件目を選び、2件目をトグルで追加する（主選択は2件目）
    await user.click(screen.getByRole("button", { name: "テスト用選択1" }));
    await user.click(screen.getByRole("button", { name: "テスト用トグル2" }));
    await user.click(screen.getByRole("button", { name: "アウトライン" }));

    expect(screen.getByRole("group", { name: "重要度" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重要度 低" }));
    await user.click(screen.getByRole("button", { name: "マップ" }));

    expect(importances()).toEqual(["high", "low", "medium"]);
  });
});
```

注意:
- 「元に戻す」「アウトライン」「マップ」のボタン名は既存 UI（`MapHistoryControls`・`EditorViewModeControl`）の実際の accessible name に合わせる。違えば既存のテスト（`pageTestHelpers.tsx` の `undoButton()` など）を見て直す。
- アウトライン表示中は `MapStage` がアンマウントされ、`mockNodes` は最後にキャンバスで描画された値のまま残る。そのためアウトラインで変更した後に「マップ」へ戻してから `importances()` を読む。
- 他のページテストが必要とするモック（`@/services/...` など）が無いと起動しない場合は、`page.test.tsx` の `jest.mock` を参考に最小限だけ足す。

- [x] **Step 2: RED を確認する**

Run: `cd client && npx jest src/app/__tests__/pageBulkImportance.test.tsx`
Expected: 1〜3件目が FAIL（1件目は主選択の2件目だけが変わる、2・3件目は件数の表示が無い）。4件目（アウトラインでは主選択だけ）は、アウトラインで選択集合全体を変えてしまう退行を防ぐテストのため、実装前から PASS する。

- [x] **Step 3: 実装する**

`client/src/components/map/MapEditor.tsx`:
- import に `import { summarizeSelectionImportance } from "@/domain/nodes/selectionImportanceSummary";` を追加する。
- `useNodes()` の分割代入の `updateNodeImportance,` を `updateNodesImportance,` に置き換える（`updateNodeImportance` を他で使っていなければ削除。使っていれば両方残す）。
- `const selectedNode = ...` の直後（`viewMode` の `useState` より後になるよう、必要なら `viewMode` 宣言の後）に追加する。

```typescript
  // 一括編集の対象。アウトラインは単一選択のため、キャンバスで残った複数選択を見えないまま変えない
  const importanceTargetIds = useMemo<readonly number[]>(() => {
    if (viewMode === "map") return selectedNodeIds;
    return selectedNodeId === null ? [] : [selectedNodeId];
  }, [viewMode, selectedNodeIds, selectedNodeId]);
  const importanceSummary = summarizeSelectionImportance(nodes, importanceTargetIds);
```

（`useMemo` が未 import なら `react` の import に追加する。`selectedNodeId` は `useNodes()` の分割代入にある既存の値を使う。）

- `<NodeImportanceSelector ... />` を次に置き換える。

```tsx
            <NodeImportanceSelector
              importance={importanceSummary.kind === "uniform" ? importanceSummary.importance : null}
              disabled={importanceSummary.kind === "none"}
              selectionCount={importanceSummary.kind === "none" ? 0 : importanceSummary.count}
              mixed={importanceSummary.kind === "mixed"}
              onChange={(importance) => {
                updateNodesImportance(importanceTargetIds, importance);
              }}
            />
```

- [x] **Step 4: GREEN と既存の回帰を確認する**

Run: `cd client && npx jest src/app/__tests__/pageBulkImportance.test.tsx src/app/__tests__/page.test.tsx src/app/__tests__/pageBranchMove.test.tsx && npm run typecheck && npm run lint`
Expected: PASS、型エラー・lint エラーなし

---

### Task 5: ドキュメントと ROADMAP の更新、全体検証

**Files:**
- Modify: `docs/specifications/features.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: Task 1〜4 の挙動（文言 `N件選択中` / `N件選択中・混在`、アウトラインは主選択のみ、1 操作の Undo、全件同値で履歴を積まない）。

- [x] **Step 1: `features.md` を更新する**

次の箇所の「重要度は主選択だけ」「一括編集は候補010（未実装）」という記述を、実装に合わせて直す。

- 62 行付近の Phase 17 の行: 機能名に「選択ノードの一括編集（重要度）」を加え、「一括編集は候補010で未実装」を「ヘッダーの重要度ボタンで選択中の全ノードの重要度を一括変更（1 操作で Undo / Redo。アウトライン表示中は主選択のみ）」に変える。
- 250 行付近（3.3 節の主選択の一覧）: 「重要度」を主選択だけの一覧から外し、「複数選択中でも一括編集はしません（候補010）」を「ヘッダーの『重要度』だけは選択集合全体に作用します（下記『重要度の一括編集』）」に変える。
- 3.3 節の末尾に「重要度の一括編集（候補010）」の小項目を追加し、次を書く: 対象（キャンバスは選択集合、アウトライン表示中は主選択 1 件）、押下表示（全件同じ値ならそのボタン、混在なら押下なし）、件数表示（2 件以上で `N件選択中`、混在時 `N件選択中・混在`、`aria-live="polite"`、グループ名 `重要度（N件選択中）`）、履歴（1 操作、全件同値なら積まない）、解像度フィルターで隠れたノードは既存どおり選択から外れること、保存形式は不変。
- 重要度タグの編集を説明している節（`grep -n "重要度" docs/specifications/features.md` で探す）に、複数選択時は一括変更になることを 1 文で追記し、3.3 節を参照させる。
- 846 行付近: 「（3.3 節。一括編集は候補010）」を「（3.3 節。重要度だけは選択集合全体へ一括で作用する）」に変える。
- 758 行付近（履歴の表の「重要度の変更」の行）: 一括変更も 1 操作であり、全件がすでに同値なら履歴を積まないことを追記する。
- 912 行付近（「ヘッダーの重要度・折りたたみ…は主選択に連動」）: 重要度を主選択連動の列挙から外し、選択集合に作用することを書く。
- 923 行付近（重要度セレクターの説明「選択中ノードの重要度を変更する」）: 「選択中の全ノード（アウトライン表示中は主選択）の重要度を変更する」に変える。
- 949 行付近（`NodeImportanceSelector.tsx` の `aria-label="重要度"` の説明）: 2 件以上で `重要度（N件選択中）` になること、常に描画する `aria-live="polite"` の件数表示があることを追記する。
- 行番号はずれている可能性がある。`grep -n "重要度" docs/specifications/features.md` で全箇所を確かめ、主選択だけ・一括編集なしと読める記述が残っていないことを確認する。

- [x] **Step 2: `browser-test-cases.md` に AC 節を追加する**

`### AB-07` の後、`## 結果の集計` の前に、AB 節と同じ書式（見出しの付け方・重要度の【高】などの表記・手順と期待結果の書き方）で AC 節「選択ノードの一括編集（候補010）」を追加する。最低限次のケースを入れる。

- AC-01 2 件を `Cmd`/`Ctrl` で選び、重要度「低」で両方変わり、選択外は変わらない【高】
- AC-02 重要度が混在する選択で押下表示が無く `N件選択中・混在` が出る【高】
- AC-03 一括変更を Undo 1 回で全件戻し、Redo 1 回でやり直す【高】
- AC-04 アウトラインへ切り替えると主選択だけが変わる【中】
- AC-05 重要度を下げて解像度フィルターで隠れたノードが選択から外れ、件数表示が減る【中】
- AC-06 スクリーンリーダーで件数の変化が読み上げられる【低】

結果の集計の表に AC 節の行がある形式なら、同じ形で AC 節の行も足す。

既存の AB-05「主選択だけの既存操作」（2160 行付近）の手順 (2) から「重要度」を外し、期待結果に「重要度だけは選択集合全体に作用する（AC 節）」と注記する。

- [x] **Step 3: `ROADMAP.md` を更新する**

- `最終更新: 2026-11-15` を `最終更新: 2026-11-16` にする。
- Phase 17 の `- [x] **選択ノードの一括編集**（候補010）` を `- [x]` にし、行末に「（実装済みの属性である重要度に対応。色・タグは後続Phaseで追加時に対応）」を書き添える。
- 「現在地」の Phase 17 の段落を更新する: 候補009 と候補010 が完了、候補010 の要約（ヘッダーの重要度ボタンで選択集合の重要度を一括変更、混在表示と件数、1 操作の Undo、アウトラインは主選択のみ）、Jest（jsdom）と `npm run verify` で確認済み、実ブラウザ確認（AC 節）は未実施、次の未完了項目は候補034「一括検索・置換」。

- [x] **Step 4: 全体検証**

Run: `cd client && npm run verify`
Expected: tailwind:scan・lint・typecheck・test・build がすべて成功

---

## 自己レビューの結果

- 設計書との対応: §3 → Task 1、§4 → Task 2、§5.1 → Task 3、§5.2・§6 → Task 4、§7 の fixture 条件 → 各 Task のテスト、§9 → Task 5。§5.3 は追加処理なし（AC-05 で手動確認）。
- 型と名前の一貫性: `replaceNodesImportance`、`summarizeSelectionImportance`、`SelectionImportanceSummary`、`updateNodesImportance`、`selectionCount`、`mixed`、`importanceTargetIds` を全タスクで同じ名前で使う。

## 実装状況

Task 1〜5 は完了し、`npm run verify` は成功した。実ブラウザでの確認（`docs/testing/browser-test-cases.md` の AC 節）は未実施。
