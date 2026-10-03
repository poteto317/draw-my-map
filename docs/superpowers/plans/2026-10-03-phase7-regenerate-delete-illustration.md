# イラストの再生成・削除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ノードに紐付けたイラストを、右パネルの「設定済みのイラストを削除」で削除でき、すでにイラストがあるノードでは、生成の操作が「イラストを再生成」と表示される（右パネルのボタンと右クリックメニュー）。

**Architecture:** 再生成の仕組み（生成、プレビュー、「ノードに設定」で置き換え）は、前の項目で、すでに動く。この計画で足すのは、(1) ラベルを「再生成」に切り替える表示の規則、(2) 削除の操作（`illustration` の項目を外し、高さを元の 60 に戻す。自動レイアウトのときは再配置される）、(3) 右パネルの削除ボタン、だけである。削除は、ノードの `illustration` を外す純粋関数 `clearNodeIllustration` で行い、`useNodes.removeIllustration` から呼ぶ。保存形式は変えない（イラストが無いノードは、従来どおり、項目を持たない）。

**Tech Stack:** Next.js 16 / React 19（React Compiler）/ TypeScript / Jest（jsdom）

## Global Constraints

- 作業は通常のブランチ `phase7-regenerate-delete-illustration` で行う。**git worktree は使わない**。
- 実装は必ずサブエージェント駆動（AGENTS.md）。実装者とレビュアーは別のエージェント。サブエージェントを呼ぶときは必ずモデルを指定する。
- コミットは、実装者が **ファイルを1つずつ指定して** 行う（`git add -A` / `git add .` / `git commit -a` は禁止）。
- コミットメッセージは日本語の Conventional Commits。空行のあと、最後に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` を付ける（`git interpret-trailers --parse` で確認する）。
- `client/.env.local` と秘密情報は、読まない・出力しない。実際の Cloudflare API は、この計画では呼ばない（再生成の手動確認だけ、利用者が行う）。
- 各タスクは、先に失敗するテストを書く（TDD）。ユニットテストは `client/src/**/__tests__/` に置く。
- React Compiler の lint ルールを守る（描画中に ref を読まない。effect の中で同期的に setState しない）。
- 既存のテストの期待値は変更しない。ただし、コンポーネントに必須の props を足す場合に、既存テストの props へ追加することは許す。
- 検証は `client` で `npm run verify`。
- 最後のタスクで ROADMAP.md を更新し、同じブランチでコミットする。
- **ノードの高さの規則（この計画で、あいまいだった点を決める）**: アプリが作る、ノードの高さは2つだけ。イラストなし = `RECT_HEIGHT`（60）、イラストあり = `ILLUSTRATED_NODE_HEIGHT`（116）。イラストを設定するときは 116 に、削除するときは 60 に、固定する。保存データの読み込みは、イラストがあるノードの高さを `max(高さ, 116)` に補正し、イラストがないノードの高さには触れない（今のまま）。
- 範囲外: 右クリックメニューへの「設定済みのイラストを削除」の追加（メニューの大きさが定数で、項目を増やすと、配置の計算とテストが広がるため）、削除の取り消し（undo）、削除の確認ダイアログ、テクスチャの解放（runtime の破棄またはアンマウントまで残す既存の方針）。

## 設計の決定（確認したい点の、推奨の既定値）

1. **再生成の操作**: 新しい仕組みは作らない。すでにイラストがあるノードでは、パネルの生成ボタンと右クリックメニューの項目のラベルが「イラストを再生成」になる。生成後は、これまでどおり、プレビューを確認して「ノードに設定」で置き換える（気に入らなければ、置き換えない）。
2. **削除の操作**: 右パネルに「設定済みのイラストを削除」ボタン（設定済みのイラストがあるノードを選択しているときだけ）。押すとすぐ削除する（確認なし）。誤って消しても、「イラストを再生成」で作り直せる（無料枠を約 173 Neurons 使う）。確認ダイアログや undo が必要なら、別の項目にする。
3. **削除後のノード**: `illustration` の項目を外し、高さを 60 に戻す。自動レイアウトのときは、縮んだ分、兄弟ノードが再配置される。手動レイアウトでは、再配置されない（隙間ができるだけ）。
4. **右クリックメニュー**: 項目は「イラストを生成／再生成」の1つのまま（ラベルだけが変わる）。削除は、パネルだけ。
5. **削除中・生成中**: 削除は、生成中でも、できる（生成の結果は、これまでどおり、ノードの識別子とテキストで照合され、削除の影響を受けない）。

## File Structure

新規:
- `client/src/domain/illustration/illustrationActionLabel.ts` — 生成の操作のラベル（生成／再生成）を決める純粋関数。

変更:
- `client/src/domain/nodes/nodeIllustrationUpdate.ts` — `clearNodeIllustration` を追加。
- `client/src/hooks/useNodes.ts` — `removeIllustration` を追加。
- `client/src/components/layout/illustrationPanelView.ts` — `generateLabel` と `canRemove` を追加。
- `client/src/components/layout/IllustrationPanel.tsx` — 削除ボタンと、生成ボタンのラベル。
- `client/src/app/page.tsx` — `removeIllustration` の配線。
- `client/src/components/map/NodeContextMenu.tsx`、`MapStage.tsx` — 右クリックメニューのラベル。
- `ROADMAP.md`、`client/README.md`

---

### Task 1: ドメイン（削除の純粋関数と、ラベルの規則）

**Files:**
- Modify: `client/src/domain/nodes/nodeIllustrationUpdate.ts`
- Create: `client/src/domain/illustration/illustrationActionLabel.ts`
- Test: `client/src/domain/nodes/__tests__/nodeIllustrationUpdate.test.ts`、`client/src/domain/illustration/__tests__/illustrationActionLabel.test.ts`

**Interfaces:**
- Produces:
  - `clearNodeIllustration(nodes: readonly Node[], id: number): Node[] | null` — 対象のノードが無い、または、イラストが無いときは `null`。それ以外は、対象のノードから `illustration` を外し、高さを `RECT_HEIGHT` にした新しい配列。
  - `getIllustrationActionLabel(hasIllustration: boolean): string` — `true` なら `"イラストを再生成"`、`false` なら `"イラストを生成"`。

- [ ] **Step 1: 失敗するテストを書く**

`nodeIllustrationUpdate.test.ts` に追加（ファイル先頭の import と、既存のヘルパー（`node(id)`、`URL1` など）に合わせる）:

```ts
describe("clearNodeIllustration", () => {
  it("対象のノードから illustration を外し、高さを RECT_HEIGHT に戻す", () => {
    const withImage = replaceNodeIllustration([node(1), node(2)], 2, URL1)!;
    const result = clearNodeIllustration(withImage, 2)!;
    expect(result[1]).toEqual(node(2));
    expect("illustration" in result[1]).toBe(false);
    expect(result[0]).toEqual(node(1));
  });

  it("他のノードと、入力の配列を変更しない", () => {
    const withImage = replaceNodeIllustration([node(1), node(2)], 2, URL1)!;
    const snapshot = JSON.parse(JSON.stringify(withImage));
    const result = clearNodeIllustration(withImage, 2)!;
    expect(withImage).toEqual(snapshot);
    expect(result[0]).toBe(withImage[0]);
  });

  it("対象のノードが無いとき、またはイラストが無いときは null", () => {
    expect(clearNodeIllustration([node(1)], 9)).toBeNull();
    expect(clearNodeIllustration([node(1)], 1)).toBeNull();
  });

  it("削除したあとにもう一度設定すると、元の状態に戻る（往復）", () => {
    const withImage = replaceNodeIllustration([node(1)], 1, URL1)!;
    const cleared = clearNodeIllustration(withImage, 1)!;
    expect(replaceNodeIllustration(cleared, 1, URL1)).toEqual(withImage);
  });
});
```

`illustrationActionLabel.test.ts`:

```ts
import { getIllustrationActionLabel } from "@/domain/illustration/illustrationActionLabel";

describe("getIllustrationActionLabel", () => {
  it("イラストが無いときは「イラストを生成」", () => {
    expect(getIllustrationActionLabel(false)).toBe("イラストを生成");
  });

  it("イラストがあるときは「イラストを再生成」", () => {
    expect(getIllustrationActionLabel(true)).toBe("イラストを再生成");
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run（`client` で）: `npx jest src/domain/nodes/__tests__/nodeIllustrationUpdate.test.ts src/domain/illustration/__tests__/illustrationActionLabel.test.ts`
Expected: FAIL（`clearNodeIllustration` と `getIllustrationActionLabel` が無い）

- [ ] **Step 3: 実装する**

`nodeIllustrationUpdate.ts` に追加（`RECT_HEIGHT` を `@/config/shapes` の import に足す）:

```ts
// イラストを外し、高さをイラストなしのノードの高さ（RECT_HEIGHT）に戻す。
// 設定時（ILLUSTRATED_NODE_HEIGHT に固定）と対になる。
export function clearNodeIllustration(
  nodes: readonly Node[],
  id: number,
): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined || target.illustration === undefined) return null;

  return nodes.map((node) => {
    if (node.id !== id) return node;
    const { illustration: removed, ...rest } = node;
    void removed;
    return { ...rest, height: RECT_HEIGHT };
  });
}
```
（`void removed;` は、未使用変数の lint を避けるための書き方。リポジトリの lint 設定に合わせて、より自然な形（例: `ignoreRestSiblings` が有効ならそのまま分割代入だけ）に直してよい。）

`illustrationActionLabel.ts`:

```ts
// すでにイラストがあるノードでは、生成の操作は「再生成」（結果は、プレビューを確認してから置き換える）
export function getIllustrationActionLabel(hasIllustration: boolean): string {
  return hasIllustration ? "イラストを再生成" : "イラストを生成";
}
```

- [ ] **Step 4: 成功を確認する**

Run: Step 2 と同じコマンド → PASS。続けて `npx tsc --noEmit` と `npm run lint`。

- [ ] **Step 5: コミット**

```bash
git add client/src/domain/nodes/nodeIllustrationUpdate.ts client/src/domain/illustration/illustrationActionLabel.ts client/src/domain/nodes/__tests__/nodeIllustrationUpdate.test.ts client/src/domain/illustration/__tests__/illustrationActionLabel.test.ts
git commit -m "feat(illustration): ノードのイラストを外す関数と、再生成のラベルの規則を追加"
```

---

### Task 2: useNodes・パネル・配線（削除ボタンと再生成のラベル）

**Files:**
- Modify: `client/src/hooks/useNodes.ts`、`client/src/components/layout/illustrationPanelView.ts`、`client/src/components/layout/IllustrationPanel.tsx`、`client/src/app/page.tsx`
- Test: `client/src/hooks/__tests__/useNodes.test.ts`、`client/src/components/layout/__tests__/illustrationPanelView.test.ts`、`client/src/components/layout/__tests__/IllustrationPanel.test.tsx`、`client/src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `clearNodeIllustration`、`getIllustrationActionLabel`（Task 1）
- Produces:
  - `useNodes().removeIllustration: (id: number) => boolean`
  - `IllustrationPanelView` に `generateLabel: string`（選択ノードにイラストがあれば「イラストを再生成」、それ以外は「イラストを生成」）と `canRemove: boolean`（選択ノードにイラストがあるとき `true`）を追加
  - `IllustrationPanel` の props に `onRemove: (nodeId: number) => void`（必須）

- [ ] **Step 1: 失敗するテストを書く**

`useNodes.test.ts`（既存の `renderHook` / `act` の書き方に合わせる）:

```ts
it("removeIllustration は、イラストを外して、高さを元に戻す", () => {
  const { result } = renderHook(() => useNodes());
  let id!: number;
  act(() => { id = result.current.addNode(100, 100); });
  act(() => { result.current.attachIllustration(id, "data:image/jpeg;base64,AAAA"); });
  let removed = false;
  act(() => { removed = result.current.removeIllustration(id); });
  expect(removed).toBe(true);
  expect(result.current.nodes[0].height).toBe(RECT_HEIGHT);
  expect("illustration" in result.current.nodes[0]).toBe(false);
});

it("イラストが無いノード、存在しないノードには、false を返す", () => {
  const { result } = renderHook(() => useNodes());
  let id!: number;
  act(() => { id = result.current.addNode(100, 100); });
  let removed = true;
  act(() => { removed = result.current.removeIllustration(id); });
  expect(removed).toBe(false);
  act(() => { removed = result.current.removeIllustration(99); });
  expect(removed).toBe(false);
});

it("自動レイアウトのとき、削除で縮んだ分、兄弟ノードが上へ再配置される", () => {
  const { result } = renderHook(() => useNodes());
  act(() => { result.current.setLayoutMode("auto"); });
  let rootId!: number; let a!: number; let b!: number;
  act(() => { rootId = result.current.addNode(0, 0); });
  act(() => { a = result.current.addChildNode(rootId)!; });
  act(() => { b = result.current.addSiblingNode(a)!; });
  act(() => { result.current.attachIllustration(a, "data:image/jpeg;base64,AAAA"); });
  const yWith = result.current.nodes.find((n) => n.id === b)!.y;
  act(() => { result.current.removeIllustration(a); });
  expect(result.current.nodes.find((n) => n.id === b)!.y).toBeLessThan(yWith);
});
```

`illustrationPanelView.test.ts`（既存のテストの書き方に合わせる）:

```ts
const IMAGE = "data:image/jpeg;base64,AAAA";

it("イラストが無いノードでは、generateLabel は「イラストを生成」、canRemove は false", () => {
  const view = getIllustrationPanelView({ id: 1, label: "a" }, { status: "idle" });
  expect(view.generateLabel).toBe("イラストを生成");
  expect(view.canRemove).toBe(false);
});

it("イラストがあるノードでは、generateLabel は「イラストを再生成」、canRemove は true", () => {
  const view = getIllustrationPanelView({ id: 1, label: "a", illustration: IMAGE }, { status: "idle" });
  expect(view.generateLabel).toBe("イラストを再生成");
  expect(view.canRemove).toBe(true);
});

it("ノードが未選択のときは、「イラストを生成」で、canRemove は false", () => {
  const view = getIllustrationPanelView(null, { status: "idle" });
  expect(view.generateLabel).toBe("イラストを生成");
  expect(view.canRemove).toBe(false);
});

it("生成のプレビュー中でも、ノードにイラストがあれば canRemove は true、ラベルは「再生成」", () => {
  const view = getIllustrationPanelView(
    { id: 1, label: "a", illustration: IMAGE },
    { status: "succeeded", nodeId: 1, label: "a", dataUrl: "data:image/jpeg;base64,BBBB" },
  );
  expect(view.image).toEqual({ kind: "preview", dataUrl: "data:image/jpeg;base64,BBBB" });
  expect(view.canRemove).toBe(true);
  expect(view.generateLabel).toBe("イラストを再生成");
});
```

`IllustrationPanel.test.tsx`（既存の全ての `render(<IllustrationPanel ...>)` の props に `onRemove={jest.fn()}` を足す。期待値は変えない。そのうえで追加）:

```tsx
it("設定済みのイラストがあるとき、「設定済みのイラストを削除」で、ノードの ID を渡す", async () => {
  const onRemove = jest.fn();
  render(<IllustrationPanel
    selectedNode={{ id: 5, label: "予算", illustration: "data:image/jpeg;base64,AAAA" }}
    generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={onRemove} />);
  await userEvent.click(screen.getByRole("button", { name: "設定済みのイラストを削除" }));
  expect(onRemove).toHaveBeenCalledWith(5);
});

it("イラストが無いとき、未選択のときは、「設定済みのイラストを削除」を出さない", () => {
  const { rerender } = render(<IllustrationPanel selectedNode={{ id: 1, label: "a" }}
    generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
  expect(screen.queryByRole("button", { name: "設定済みのイラストを削除" })).toBeNull();
  rerender(<IllustrationPanel selectedNode={null}
    generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
  expect(screen.queryByRole("button", { name: "設定済みのイラストを削除" })).toBeNull();
});

it("イラストがあるノードでは、生成ボタンが「イラストを再生成」になり、押すと生成を呼ぶ", async () => {
  const onGenerate = jest.fn();
  render(<IllustrationPanel
    selectedNode={{ id: 5, label: "予算", illustration: "data:image/jpeg;base64,AAAA" }}
    generation={{ status: "idle" }} onGenerate={onGenerate} onAttach={jest.fn()} onRemove={jest.fn()} />);
  expect(screen.queryByRole("button", { name: "イラストを生成" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "イラストを再生成" }));
  expect(onGenerate).toHaveBeenCalledWith(5);
});

it("生成中は、ボタンが「生成中…」で無効になる（再生成でも同じ）", () => {
  render(<IllustrationPanel
    selectedNode={{ id: 5, label: "予算", illustration: "data:image/jpeg;base64,AAAA" }}
    generation={{ status: "generating", nodeId: 5, label: "予算" }} onGenerate={jest.fn()} onAttach={jest.fn()} onRemove={jest.fn()} />);
  expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();
});
```

`page.test.tsx`: 既存の配線のテスト（`useIllustrationGeneration` をモックして、「ノードに設定」で `attachIllustration` が働く、のテスト）の流れに、「設定したあと、パネルの『設定済みのイラストを削除』を押すと、パネルの『設定済みのイラスト』が消え、生成ボタンが『イラストを生成』に戻る」を1件追加する。

- [ ] **Step 2: 失敗を確認する**

Run: `npx jest src/hooks src/components/layout src/app`
Expected: FAIL

- [ ] **Step 3: 実装する**

`useNodes.ts`: 戻り値の型に `removeIllustration: (id: number) => boolean;` を足し、`attachIllustration` の近くに追加して、return に含める:

```ts
  const removeIllustration = useCallback((id: number) => (
    applyTreeChange((currentNodes) => clearNodeIllustration(currentNodes, id))
  ), [applyTreeChange]);
```
（`import { clearNodeIllustration, replaceNodeIllustration } from "@/domain/nodes/nodeIllustrationUpdate";`）

`illustrationPanelView.ts`: 型 `IllustrationPanelView` に、次を足す。

```ts
  // 生成ボタンのラベル。すでにイラストがあるノードでは「再生成」
  generateLabel: string;
  // 「設定済みのイラストを削除」を出すか（選択ノードにイラストがあるとき）
  canRemove: boolean;
```
関数の戻り値に、次を足す（`import { getIllustrationActionLabel } from "@/domain/illustration/illustrationActionLabel";`）:

```ts
  const hasIllustration = selectedNode?.illustration !== undefined;
  // ...return の中:
    generateLabel: getIllustrationActionLabel(hasIllustration),
    canRemove: hasIllustration,
```

`IllustrationPanel.tsx`: props に `onRemove: (nodeId: number) => void;` を足す。設定済みのイラストの表示のブロックの中（`IllustrationImage` の下）に、削除ボタンを足す。プレビュー（`preview`）のときにも「設定済み」を出さない既存の判定は、変えない。**削除ボタンは、プレビューを表示中でも出す必要があるので、`view.canRemove` で、設定済みの表示とは独立した位置に置く**:

```tsx
      {selectedNode !== null && view.canRemove && (
        <button
          type="button"
          onClick={() => onRemove(selectedNode.id)}
          className="rounded-md border border-red-600 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:border-red-400 dark:text-red-400 dark:hover:bg-zinc-700"
        >
          設定済みのイラストを削除
        </button>
      )}
```
生成ボタンのラベルを `{view.isGenerating ? "生成中…" : view.generateLabel}` にする。

`page.tsx`: `useNodes()` の分割代入に `removeIllustration` を足し、パネルに `onRemove={removeIllustration}` を渡す（戻り値の真偽は使わない。`removeIllustration` は `(id) => boolean` で、`onRemove: (nodeId) => void` に代入できる）。

- [ ] **Step 4: 成功を確認する**

Run: `npx jest src/hooks src/components/layout src/app` と `npx tsc --noEmit` と `npm run lint`
Expected: PASS

- [ ] **Step 5: コミット**（変更ファイルを1つずつ指定。メッセージ例: `feat(illustration): パネルからノードのイラストを削除でき、生成の操作を再生成に切り替える`）

---

### Task 3: 右クリックメニューのラベル

**Files:**
- Modify: `client/src/components/map/NodeContextMenu.tsx`、`client/src/components/map/MapStage.tsx`
- Test: `client/src/components/map/__tests__/NodeContextMenu.test.tsx`、`client/src/components/map/__tests__/MapStageContextMenu.test.tsx`

**Interfaces:**
- Consumes: `getIllustrationActionLabel`（Task 1）
- Produces: `NodeContextMenu` の props に `hasIllustration: boolean`（必須）。項目のラベルは `getIllustrationActionLabel(hasIllustration)`。

- [ ] **Step 1: 失敗するテストを書く**

`NodeContextMenu.test.tsx`: 既存の `render(<NodeContextMenu ... />)` の props に `hasIllustration={false}` を足す（期待値は変えない）。追加:

```tsx
it("イラストがあるノードでは、項目が「イラストを再生成」になり、クリックで同じコールバックを呼ぶ", async () => {
  const onGenerateIllustration = jest.fn();
  render(<NodeContextMenu position={{ x: 0, y: 0 }} hasIllustration onGenerateIllustration={onGenerateIllustration} />);
  expect(screen.queryByRole("menuitem", { name: "イラストを生成" })).toBeNull();
  await userEvent.click(screen.getByRole("menuitem", { name: "イラストを再生成" }));
  expect(onGenerateIllustration).toHaveBeenCalledTimes(1);
});
```

`MapStageContextMenu.test.tsx`: 既存のテストの `render(<MapStage ...>)` の組み立て方に合わせて、「`illustration` を持つノードを右クリックすると、メニューの項目が『イラストを再生成』になる」「持たないノードでは『イラストを生成』のまま」を追加する（既存のテストにある、ノードの作り方と右クリックの発火のヘルパーを使う。ノードには `illustration: "data:image/jpeg;base64,AAAA"` と `height: 116` を持たせる）。

- [ ] **Step 2: 失敗を確認する**

Run: `npx jest src/components/map/__tests__/NodeContextMenu.test.tsx src/components/map/__tests__/MapStageContextMenu.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装する**

`NodeContextMenu.tsx`: props に `hasIllustration: boolean` を足し、項目の文言を `{getIllustrationActionLabel(hasIllustration)}` にする（`import { getIllustrationActionLabel } from "@/domain/illustration/illustrationActionLabel";`）。メニューの大きさ（`NODE_CONTEXT_MENU_SIZE`、幅 176）に「イラストを再生成」が収まることを、実画面（Task 4 の手動確認）で確認する。

`MapStage.tsx`: メニューの描画の直前に、対象ノードを求めて渡す:

```tsx
  const menuNode = menu === null ? undefined : nodes.find((node) => node.id === menu.nodeId);
  // ...
        <NodeContextMenu
          position={menu.position}
          hasIllustration={menuNode?.illustration !== undefined}
          onGenerateIllustration={...既存のまま}
        />
```

- [ ] **Step 4: 成功を確認する**

Run: `npx jest src/components/map` と `npx tsc --noEmit` と `npm run lint`
Expected: PASS

- [ ] **Step 5: コミット**（メッセージ例: `feat(map): イラストがあるノードの右クリックメニューを「イラストを再生成」にする`）

---

### Task 4: ドキュメント、ROADMAP、全体の検証

**Files:**
- Modify: `ROADMAP.md`、`client/README.md`

- [ ] **Step 1: README を更新する**

`client/README.md` のイラスト生成の節に、次を追記する（実装した事実だけ）: すでにイラストがあるノードでは、生成の操作が「イラストを再生成」になり、プレビューを確認して「ノードに設定」で置き換える／右パネルの「設定済みのイラストを削除」で、イラストを外せる（ノードの高さは元に戻る。削除の取り消しと確認はない）。

- [ ] **Step 2: 全体の検証**

Run（`client` で）: `npm run verify`
Expected: すべて成功。スイート数とテスト数を記録する。

- [ ] **Step 3: ROADMAP を更新する**

`ROADMAP.md`:
- Phase 7 の「イラストの再生成・削除」を `[x]` にする（Phase 7 の全項目が完了）。
- 見出し「Phase 7: AI イラスト生成」が、完了を示す表記（他の Phase の見出し（`✅ 完了`）の書式に合わせる）になる。
- 「現在地」の Phase 7 の行を、完了の記述に書き換える（再生成・削除まで実装済み、次の未完了項目は、ROADMAP の次の Phase。ROADMAP に未完了の項目が他に無ければ、その旨）。
- 「最終更新」の日付を、実装を終えた日にする。

- [ ] **Step 4: コミット**

```bash
git add ROADMAP.md client/README.md
git commit -m "docs(roadmap): イラストの再生成・削除を完了にし、READMEに使い方を追記"
```

- [ ] **Step 5: 手動確認の手順（利用者が行う。実装者は行わない）**

`cd client && npm run dev` で起動して確認する。
1. イラストを設定したノードを選択する。パネルのボタンが「イラストを再生成」になり、「設定済みのイラストを削除」が出る。
2. 右クリックメニューの項目が「イラストを再生成」になり、メニューの枠に文字が収まる。イラストが無いノードでは「イラストを生成」。
3. 「イラストを再生成」を押す → プレビューが出る → 「ノードに設定」で、イラストが置き換わる（無料枠を約 173 Neurons 使う）。
4. 「設定済みのイラストを削除」を押す。イラストが消え、ノードの高さが元に戻り、パネルのボタンが「イラストを生成」に戻る。
5. 削除したあと、再読み込みしても、イラストが戻らない（localStorage に保存されている）。JSON をエクスポートして、そのノードに `illustration` が無い。
6. 自動レイアウトでは、削除で縮んだ分、兄弟ノードが上に再配置される。
7. 生成中でも、別のノードの設定済みのイラストを削除できる。

---

## Self-Review

- **要件との対応**: 再生成（ラベルの切り替え、Task 1・2・3。仕組みは既存）、削除（純粋関数 Task 1、状態 Task 2、パネルの操作 Task 2）、ROADMAP（Task 4）。
- **型の一致**: `clearNodeIllustration`、`getIllustrationActionLabel`（Task 1）→ `removeIllustration`、`generateLabel`、`canRemove`、`onRemove`（Task 2）→ `hasIllustration`（Task 3）。名前は全タスクで同じ。
- **高さの規則**: 設定時は 116、削除時は 60 に固定し、読み込み時は `max(高さ, 116)`（イラストあり）／そのまま（イラストなし）。往復のテスト（設定→削除→設定）で、一貫性を確認する。
- **既存の挙動を変えない点**: 生成、プレビュー、「ノードに設定」、保存形式、エクスポートは、変えない。イラストが無いノードの JSON の形は、従来と同じ。
- **既知の制限（PR にも書く）**: 削除の取り消しと確認がない。右クリックメニューからは、削除できない（パネルのみ）。手動レイアウトでは、削除で縮んだ分の隙間は、再配置されない。削除したイラストのテクスチャは、runtime の破棄またはアンマウントまで残る（既存の方針）。
- 実装後の変更: 最終レビューで、プレビュー表示中に削除ボタンが見えているプレビューを消すように読めるため、文言を「設定済みのイラストを削除」に変更。
