# Phase 7 右パネルのイラスト生成ボタン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. インライン実行（`superpowers:executing-plans`）は、このリポジトリでは使わない（`AGENTS.md`参照）。

**Goal:** 画面右にパネルを新設し、選択中のノードを表示して「イラストを生成」ボタンで生成を要求できるようにする。右クリックメニューと同じ生成の入口を共有する。

**Architecture:** 表示専用の`IllustrationPanel`（選択ノードの`id`と`label`、生成コールバックだけを受け取る）を`components/layout/`に追加する。生成の入口は新しいフック`useIllustrationGeneration`に集約し、右クリックメニューとパネルの両方がそれを呼ぶ。現時点では、フックの`generateIllustration(nodeId)`は何もしない（後続の「AIでイラストを生成」で置き換える1か所になる）。`page.tsx`は、キャンバスとパネルを横に並べるレイアウトと配線だけを担う。

**Tech Stack:** TypeScript 5、React 19、Next.js 16、Jest 30、Testing Library、Tailwind CSS 4

## Global Constraints

- 範囲はROADMAP Phase 7の2項目目「右パネルにイラスト生成ボタンを配置」のみ。画像生成API、イラストの保存・表示・再生成・削除は含めない。
- ボタンの文言は「イラストを生成」（右クリックメニューの項目と同じ）とする。
- ノード未選択のときはボタンを無効化し、「ノードを選択してください」と表示する。
- 選択中のノードは、`Node.label`を表示する。ラベルが空の場合は、キャンバス・画像エクスポートと同じフォールバック`FALLBACK_NODE_LABEL`（「新しいノード」）で表示する。
- パネルはキャンバスの右に固定幅（`w-60`、240px）で常時表示する。キャンバスは残りの幅を使う。
- 右クリックメニューの既存の挙動（`onGenerateIllustration`の通知）は変えない。
- `Node`型、永続化形式、Storageキー、`MapStage`の公開propsは変更しない。
- 新しい外部依存を追加しない。
- 実装コードより先に対応テストを追加し、REDを確認する。
- `client`変更後は`client`ディレクトリで`npm run verify`を実行する。
- UI文言・コメント・テスト名は日本語、識別子は英語。
- `ROADMAP.md`は、実装完了後（最後のタスク）に、実装済み項目だけを更新する。

## File Structure

- Create: `client/src/components/layout/IllustrationPanel.tsx` — 右パネルの表示（選択ノード、生成ボタン）
- Create: `client/src/components/layout/__tests__/IllustrationPanel.test.tsx`
- Create: `client/src/hooks/useIllustrationGeneration.ts` — 生成の入口（現在は何もしない）
- Create: `client/src/hooks/__tests__/useIllustrationGeneration.test.ts`
- Modify: `client/src/app/page.tsx` — レイアウト（キャンバス＋パネル）と配線、既存のプレースホルダーを撤去
- Modify: `client/src/app/__tests__/page.test.tsx` — パネルの配線テスト
- Modify: `ROADMAP.md`

---

### Task 1: IllustrationPanel コンポーネント

**Files:**
- Create: `client/src/components/layout/IllustrationPanel.tsx`
- Test: `client/src/components/layout/__tests__/IllustrationPanel.test.tsx`

**Interfaces:**
- Produces: `IllustrationPanel({ selectedNode, onGenerate }: { selectedNode: Pick<Node, "id" | "label"> | null; onGenerate: (nodeId: number) => void })`
  - `<aside aria-label="イラスト">`（landmark `complementary`）、見出し`イラスト`（`h2`）。
  - 選択ノードがあれば、`対象ノード`の見出し的ラベルとノードの`label`（空なら「（ラベルなし）」）を表示し、ボタン「イラストを生成」は有効。クリックで`onGenerate(selectedNode.id)`を1回呼ぶ。
  - 選択ノードが`null`なら、「ノードを選択してください」を表示し、ボタンは無効。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IllustrationPanel } from "@/components/layout/IllustrationPanel";

describe("IllustrationPanel", () => {
  it("補足領域として名前付きで表示し、見出しを持つ", () => {
    render(<IllustrationPanel selectedNode={null} onGenerate={jest.fn()} />);

    expect(screen.getByRole("complementary", { name: "イラスト" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "イラスト" })).toBeInTheDocument();
  });

  it("ノード未選択のときは案内を表示し、生成ボタンを無効にする", () => {
    render(<IllustrationPanel selectedNode={null} onGenerate={jest.fn()} />);

    expect(screen.getByText("ノードを選択してください")).toBeVisible();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
  });

  it("選択中のノードのラベルを表示し、生成ボタンを有効にする", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 3, label: "企画の背景" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByText("企画の背景")).toBeVisible();
    expect(screen.queryByText("ノードを選択してください")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("ラベルが空のノードでは「（ラベルなし）」を表示する", () => {
    render(
      <IllustrationPanel selectedNode={{ id: 4, label: "" }} onGenerate={jest.fn()} />,
    );

    expect(screen.getByText("（ラベルなし）")).toBeVisible();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("生成ボタンのクリックで、選択中のノードIDを1回通知する", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(
      <IllustrationPanel selectedNode={{ id: 7, label: "目標" }} onGenerate={onGenerate} />,
    );

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledWith(7);
  });

  it("無効なボタンのクリックでは通知しない", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(<IllustrationPanel selectedNode={null} onGenerate={onGenerate} />);

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("長いラベルは全文をtitleで確認できる", () => {
    const label = "とても長いラベルのノード".repeat(10);
    render(<IllustrationPanel selectedNode={{ id: 1, label }} onGenerate={jest.fn()} />);

    expect(screen.getByText(label)).toHaveAttribute("title", label);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/layout/__tests__/IllustrationPanel.test.tsx`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

```tsx
import type { Node } from "@/types/node";

type IllustrationPanelProps = {
  selectedNode: Pick<Node, "id" | "label"> | null;
  onGenerate: (nodeId: number) => void;
};

export function IllustrationPanel({ selectedNode, onGenerate }: IllustrationPanelProps) {
  const label = selectedNode === null
    ? null
    : selectedNode.label === "" ? "（ラベルなし）" : selectedNode.label;

  return (
    <aside
      aria-label="イラスト"
      className="flex w-60 shrink-0 flex-col gap-3 border-l border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
    >
      <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">イラスト</h2>
      {selectedNode === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">対象ノード</span>
          <p
            className="line-clamp-3 break-words text-sm text-zinc-800 dark:text-zinc-100"
            title={selectedNode.label}
          >
            {label}
          </p>
        </div>
      )}
      <button
        type="button"
        disabled={selectedNode === null}
        onClick={() => {
          if (selectedNode !== null) onGenerate(selectedNode.id);
        }}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
      >
        イラストを生成
      </button>
    </aside>
  );
}
```

注意: ラベルが空のとき`title`は空文字になる。テスト「長いラベルは全文をtitleで確認できる」は、空でないラベルだけを対象にする。

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/components/layout/__tests__/IllustrationPanel.test.tsx && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/layout/IllustrationPanel.tsx client/src/components/layout/__tests__/IllustrationPanel.test.tsx
git commit -m "feat(layout): イラスト生成の右パネルを追加"
```

（コミットメッセージの末尾に、リポジトリで指定された`Co-Authored-By`の行を付ける。）

---

### Task 2: 生成の入口のフックと page への配線

**Files:**
- Create: `client/src/hooks/useIllustrationGeneration.ts`
- Test: `client/src/hooks/__tests__/useIllustrationGeneration.test.ts`
- Modify: `client/src/app/page.tsx`
- Modify test: `client/src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `IllustrationPanel`（Task 1）、`MapStage`の`onGenerateIllustration?: (nodeId: number) => void`（既存）
- Produces: `useIllustrationGeneration(): { generateIllustration: (nodeId: number) => void }`。戻り値の`generateIllustration`は、レンダーをまたいで同一の関数（`useCallback`）。現時点では何も起こさない。

- [ ] **Step 1: 失敗するテストを書く（フック）**

```ts
import { renderHook } from "@testing-library/react";
import { useIllustrationGeneration } from "@/hooks/useIllustrationGeneration";

describe("useIllustrationGeneration", () => {
  it("ノードIDを渡して呼んでも例外を投げない", () => {
    const { result } = renderHook(() => useIllustrationGeneration());

    expect(() => result.current.generateIllustration(1)).not.toThrow();
  });

  it("再レンダーしても同じ関数を返す", () => {
    const { result, rerender } = renderHook(() => useIllustrationGeneration());
    const first = result.current.generateIllustration;

    rerender();

    expect(result.current.generateIllustration).toBe(first);
  });
});
```

- [ ] **Step 2: 失敗するテストを書く（page）**

`page.test.tsx`の先頭付近（既存の`jest.mock`群の隣）に、フックのモックを追加する。

```tsx
const mockGenerateIllustration = jest.fn();

jest.mock("@/hooks/useIllustrationGeneration", () => ({
  useIllustrationGeneration: () => ({ generateIllustration: mockGenerateIllustration }),
}));
```

既存の`MapStage`モックの引数に`onGenerateIllustration`を追加し（型は`onGenerateIllustration?: (nodeId: number) => void`）、モックの`<div data-testid="map-stage">`の中に次のボタンを追加する。

```tsx
      <button type="button" onClick={() => onGenerateIllustration?.(nodes[0]?.id ?? -1)}>
        テスト用メニュー生成
      </button>
```

`beforeEach`に`mockGenerateIllustration.mockClear();`を追加し、`describe("Home", ...)`内に次を追加する。

```tsx
  describe("イラスト生成パネルの配線", () => {
    it("ノード未選択のときは案内を表示し、生成ボタンを無効にする", () => {
      render(<Home />);

      expect(screen.getByRole("complementary", { name: "イラスト" })).toBeInTheDocument();
      expect(screen.getByText("ノードを選択してください")).toBeVisible();
      expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
    });

    it("ノードを選択すると、ラベルを表示し、生成ボタンを有効にする", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));

      expect(screen.getByText("（ラベルなし）")).toBeVisible();
      expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
    });

    it("パネルの生成ボタンで、選択中のノードIDを生成の入口へ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      const selectedId = mockMapStageProps!.nodes[0].id;

      await user.click(screen.getByRole("button", { name: "イラストを生成" }));

      expect(mockGenerateIllustration).toHaveBeenCalledTimes(1);
      expect(mockGenerateIllustration).toHaveBeenCalledWith(selectedId);
    });

    it("右クリックメニューからの要求も、同じ生成の入口へ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      const nodeId = mockMapStageProps!.nodes[0].id;

      await user.click(screen.getByRole("button", { name: "テスト用メニュー生成" }));

      expect(mockGenerateIllustration).toHaveBeenCalledWith(nodeId);
    });

    it("選択を解除すると、パネルは案内に戻る", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      act(() => mockMapStageProps!.onSelectNode(null));

      expect(screen.getByText("ノードを選択してください")).toBeVisible();
      expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
    });

    it("キャンバスとパネルを横に並べて表示する", () => {
      render(<Home />);

      const main = screen.getByRole("main");
      expect(main).toHaveClass("flex");
      expect(main).toContainElement(screen.getByTestId("map-stage"));
      expect(main).toContainElement(screen.getByRole("complementary", { name: "イラスト" }));
    });
  });
```

- [ ] **Step 3: 失敗確認**

Run: `cd client && npx jest src/hooks/__tests__/useIllustrationGeneration.test.ts src/app/__tests__/page.test.tsx`
Expected: FAIL（フックが存在しない、パネルが無い）

- [ ] **Step 4: 実装**

`client/src/hooks/useIllustrationGeneration.ts`:

```ts
import { useCallback } from "react";

// イラスト生成の入口。画像生成APIとの連携は、Phase 7の後続項目で、この関数を置き換えて実装する。
export function useIllustrationGeneration() {
  const generateIllustration = useCallback((nodeId: number) => {
    void nodeId;
  }, []);

  return { generateIllustration };
}
```

`client/src/app/page.tsx`:
1. `import { useCallback, useState } from "react";`を`import { useState } from "react";`へ戻す（`useCallback`が他で使われていなければ）。
2. `IllustrationPanel`と`useIllustrationGeneration`をimportする。
3. 既存のプレースホルダー（`handleGenerateIllustration`の`useCallback`とそのコメント）を削除し、`const { generateIllustration } = useIllustrationGeneration();`に置き換える。
4. `<main>`を次のとおり変更する。

```tsx
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1">
          <MapStage
            /* 既存のprops（onGenerateIllustrationを除く） */
            onGenerateIllustration={generateIllustration}
            resetRevision={resetRevision}
          />
        </div>
        <IllustrationPanel selectedNode={selectedNode} onGenerate={generateIllustration} />
      </main>
```

`selectedNode`は既存の`const selectedNode = nodes.find(...) ?? null;`をそのまま使う（`Node`は`Pick<Node, "id" | "label">`に代入できる）。

- [ ] **Step 5: 成功確認**

Run: `cd client && npx jest src/hooks/__tests__/useIllustrationGeneration.test.ts src/app/__tests__/page.test.tsx src/components/layout && npm run lint && npm run typecheck`
Expected: PASS（`page.test.tsx`の既存テストも、変更なしで通る）

- [ ] **Step 6: 全体検証**

Run: `cd client && npm run verify`
Expected: すべて成功

- [ ] **Step 7: Commit**

```bash
git add client/src/hooks/useIllustrationGeneration.ts client/src/hooks/__tests__/useIllustrationGeneration.test.ts client/src/app/page.tsx client/src/app/__tests__/page.test.tsx
git commit -m "feat(app): 右パネルを配置し、イラスト生成の入口を共有する"
```

---

### Task 3: ROADMAP更新

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: 更新**

- 「最終更新」を実施日（2026-10-02）にする。
- 「現在地」の最終行（`次の未完了項目は…`）を、次の内容へ書き換える。plain/体言止めの文体（「〜できる。」）に合わせる。
  - Phase 7の2項目目（右パネルのボタン）が完了したこと。
  - 右クリックメニューと右パネルのボタンは、同じ生成の入口（`useIllustrationGeneration`）を呼ぶが、その中身は未実装であること。
  - 次の未完了項目は、Phase 7の「ノードのテキストをもとに AI（画像生成 API）でイラストを生成」であること。
- Phase 7の`- [ ] 右パネルにイラスト生成ボタンを配置`を`- [x]`へ変更する。

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): Phase 7右パネルのボタン完了を反映"
```

---

## Self-Review

- **Spec coverage:** ROADMAP 2項目目「右パネルにイラスト生成ボタンを配置」は、Task 1（パネルとボタン）とTask 2（配置と配線）で実装し、Task 3で反映する。
- **Placeholder scan:** `useIllustrationGeneration`の空実装は意図的で、後続項目で置き換える1か所として、コメントとROADMAPに明記する。
- **Type consistency:** `IllustrationPanel`の`selectedNode: Pick<Node, "id" | "label"> | null`は、Task 1で定義し、Task 2で`selectedNode`（`Node | null`）を渡す。`onGenerate`と`MapStage`の`onGenerateIllustration`は、どちらも`(nodeId: number) => void`で、同じ`generateIllustration`を渡す。
- **既知のリスク:** パネルの追加でキャンバスの幅が240px狭くなる。PixiJSは`resizeTo: container`で初期化時とウィンドウのリサイズ時に追従するため、パネルは固定幅（開閉しない）とし、追加のリサイズ処理は不要。狭い画面（例: 幅 640px 未満）では、キャンバスが狭くなる。小画面向けの折りたたみは、本計画に含めない（必要になった時点で別の項目として扱う）。

## 実装後の変更

- 実画面の確認で、空ラベルの表示がキャンバス・画像エクスポート（「新しいノード」）と食い違っていたため、共通定数`FALLBACK_NODE_LABEL`（`client/src/config/nodeLabel.ts`）に統一した。
