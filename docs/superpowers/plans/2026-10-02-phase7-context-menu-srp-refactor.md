# Phase 7 コンテキストメニュー 単一責任リファクタリング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `origin/main`からの変更箇所（右クリックコンテキストメニュー）を、単一責任の単位へ分割し、分割した単位ごとにユニットテストを拡充する。外部から見える挙動は変えない。

**Architecture:** DOM上の判定（メニュー内か、文字入力欄か）、状態の失効判定、メニューを閉じるグローバルリスナー、右クリックの意図判定（無視／抑止／閉じる／選択／開く）をそれぞれ独立したモジュールに切り出す。`MapStage`はDOMイベントを純粋な判定関数へ渡し、結果に応じてコールバックを呼ぶだけにする。

**Tech Stack:** TypeScript 5、React 19、Next.js 16、Jest 30、Testing Library、Tailwind CSS 4

## Global Constraints

- **コミットしない。** 本リファクタリングでは`git commit`を実行しない（ユーザー指示）。作業ツリーに変更を残す。ステージング（`git add`）も実装者は行わない。
- 外部から見える挙動を変えない。既存テストは、移動する場合を除き、期待値を変更せずに通ること。
- 実装コードより先に新規モジュールの対応テストを追加し、REDを確認する（純粋なファイル移動・テスト分割は除く）。
- 新しい外部依存を追加しない。`Node`型、永続化形式、Storageキー、`page.tsx`は変更しない。
- メニューの対象は表示中ノードのみ、右クリックしたノードは選択、空白の右クリックは標準メニュー抑止と閉じる、編集中・文字入力欄上は標準メニューを妨げない、という既存仕様を維持する。
- 各タスク完了時と最後に、`client`ディレクトリで`npm run verify`（最後のみ必須。タスク中は該当テスト・`npm run lint`・`npm run typecheck`）を実行する。

## 洗い出し結果（対象: `origin/main...HEAD`のソース変更）

対象ファイル: `NodeContextMenu.tsx`、`useNodeContextMenu.ts`、`nodeContextMenuTarget.ts`、`nodeContextMenuLayout.ts`、`MapStage.tsx`、`MapStage.test.tsx`、`page.tsx`。

| # | 場所 | 複数の責任 | 対応 |
|---|------|-----------|------|
| 1 | `MapStage.tsx` `handleContextMenu` | イベント対象のDOM判定、ジェスチャ中判定、ヒットテスト、選択、メニュー表示可否の方針、クランプ、`preventDefault`が1関数に混在 | Task 3・4: 純粋関数`resolveMapContextMenuAction`へ意図判定を分離。MapStageは結果に従って副作用を呼ぶだけにする |
| 2 | `MapStage.tsx` | 可視ノードの絞り込み`nodes.filter(visible)`がdouble-clickと右クリックで重複 | Task 4: `visibleNodes`のmemoを1つ作り共有 |
| 3 | `MapStage.tsx`・`useNodeContextMenu.ts` | メニュー内判定の`'[role="menu"]'`セレクタが2か所に重複し、汎用すぎる。文字入力欄判定もインライン | Task 1: `nodeContextMenuDom.ts`（メニュー内判定）、`textEntryTarget.ts`（入力欄判定）へ集約。メニューに専用属性を付与 |
| 4 | `useNodeContextMenu.ts` | 状態保持、失効判定（reset/非表示/削除）、グローバルDOMリスナー（Escape/外側クリック/wheel/blur）の3責任 | Task 2: 失効判定を`isNodeContextMenuStale`、リスナーを`useNodeContextMenuDismissal`へ分離 |
| 5 | `NodeContextMenu.tsx` | 見た目とレイアウト寸法を二重管理（Tailwindの`h-9`+`p-1`とレイアウト定数44px。borderを含めると実高は46pxで定数と不一致） | Task 1: 寸法を`NODE_CONTEXT_MENU_SIZE`のインラインstyleのみで管理し、ボタンは`h-full` |
| 6 | `MapStage.test.tsx` | 右クリックの結合テスト約165行が、すでに大きい既存ファイルへ追加されている | Task 5: `MapStageContextMenu.test.tsx`へ分離（`MapStageVisibility.test.tsx`の前例に従う） |
| 7 | `page.tsx` | プレースホルダーのコールバックをHome内に定義 | **対応しない。** 後続項目（生成API連携）で置き換わる空実装で、Hook化は過剰設計になる |
| 8 | `nodeContextMenuTarget.ts`・`nodeContextMenuLayout.ts` | 純粋関数1つずつで責務は単一 | **対応しない** |

## File Structure

- Create: `client/src/components/map/nodeContextMenuDom.ts` — メニュー専用属性とメニュー内判定
- Create: `client/src/components/map/textEntryTarget.ts` — 文字入力欄判定
- Modify: `client/src/components/map/NodeContextMenu.tsx` — 専用属性付与、寸法をレイアウト定数へ一本化
- Create: `client/src/components/map/nodeContextMenuStaleness.ts` — メニュー失効の純粋判定
- Create: `client/src/components/map/useNodeContextMenuDismissal.ts` — 閉じるリスナー
- Modify: `client/src/components/map/useNodeContextMenu.ts` — 状態保持だけにする
- Create: `client/src/components/map/mapContextMenuAction.ts` — 右クリックの意図判定
- Modify: `client/src/components/map/MapStage.tsx` — 薄いハンドラ化、`visibleNodes`共有
- Create: `client/src/components/map/__tests__/MapStageContextMenu.test.tsx` — 右クリック結合テスト（既存から移動）
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx` — 右クリックテストを削除
- Create tests: `nodeContextMenuDom.test.ts`、`textEntryTarget.test.ts`、`nodeContextMenuStaleness.test.ts`、`useNodeContextMenuDismissal.test.tsx`、`mapContextMenuAction.test.ts`（すべて`client/src/components/map/__tests__/`）
- Modify tests: `NodeContextMenu.test.tsx`、`useNodeContextMenu.test.tsx`（期待値は変えず、必要なら追加のみ）

---

### Task 1: DOM判定の集約とメニュー寸法の一本化

**Files:**
- Create: `client/src/components/map/nodeContextMenuDom.ts`
- Create: `client/src/components/map/textEntryTarget.ts`
- Modify: `client/src/components/map/NodeContextMenu.tsx`
- Test: `client/src/components/map/__tests__/nodeContextMenuDom.test.ts`
- Test: `client/src/components/map/__tests__/textEntryTarget.test.ts`
- Modify test: `client/src/components/map/__tests__/NodeContextMenu.test.tsx`

**Interfaces:**
- Produces:
  - `NODE_CONTEXT_MENU_ATTRIBUTE: "data-node-context-menu"`
  - `isInsideNodeContextMenu(target: EventTarget | null): boolean`
  - `isTextEntryTarget(target: EventTarget | null): boolean`（`input`/`textarea`内ならtrue）
  - `NodeContextMenu`は引き続き`role="menu"`を持ち、さらに`data-node-context-menu=""`を持つ。外形サイズは`NODE_CONTEXT_MENU_SIZE`のinline styleで決まる。

- [ ] **Step 1: 失敗するテストを書く**

`nodeContextMenuDom.test.ts`:

```ts
import {
  NODE_CONTEXT_MENU_ATTRIBUTE,
  isInsideNodeContextMenu,
} from "@/components/map/nodeContextMenuDom";

describe("isInsideNodeContextMenu", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("メニュー専用属性を持つ要素とその子孫はtrueを返す", () => {
    document.body.innerHTML = `<div ${NODE_CONTEXT_MENU_ATTRIBUTE}=""><button id="item"></button></div>`;

    expect(isInsideNodeContextMenu(document.querySelector("div"))).toBe(true);
    expect(isInsideNodeContextMenu(document.getElementById("item"))).toBe(true);
  });

  it("role=menuだけを持つ別要素はfalseを返す", () => {
    document.body.innerHTML = `<div role="menu"><button id="item"></button></div>`;

    expect(isInsideNodeContextMenu(document.getElementById("item"))).toBe(false);
  });

  it("メニュー外の要素、非Element、nullはfalseを返す", () => {
    document.body.innerHTML = `<div id="outside"></div>`;

    expect(isInsideNodeContextMenu(document.getElementById("outside"))).toBe(false);
    expect(isInsideNodeContextMenu(window)).toBe(false);
    expect(isInsideNodeContextMenu(null)).toBe(false);
  });
});
```

`textEntryTarget.test.ts`:

```ts
import { isTextEntryTarget } from "@/components/map/textEntryTarget";

describe("isTextEntryTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("inputとtextareaはtrueを返す", () => {
    document.body.innerHTML = `<input id="a" /><textarea id="b"></textarea>`;

    expect(isTextEntryTarget(document.getElementById("a"))).toBe(true);
    expect(isTextEntryTarget(document.getElementById("b"))).toBe(true);
  });

  it("inputの子孫相当（closest）でもtrueを返す", () => {
    document.body.innerHTML = `<textarea><span id="c"></span></textarea>`;

    expect(isTextEntryTarget(document.getElementById("c"))).toBe(true);
  });

  it("その他の要素、非Element、nullはfalseを返す", () => {
    document.body.innerHTML = `<button id="d"></button>`;

    expect(isTextEntryTarget(document.getElementById("d"))).toBe(false);
    expect(isTextEntryTarget(window)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
```

`NodeContextMenu.test.tsx`へ追加（既存3テストは変更しない）。先頭importへ`import { isInsideNodeContextMenu } from "@/components/map/nodeContextMenuDom";`と`import { NODE_CONTEXT_MENU_SIZE } from "@/components/map/nodeContextMenuLayout";`を足し、`describe`内へ:

```tsx
  it("外形サイズをレイアウト定数どおりに指定する", () => {
    render(<NodeContextMenu position={{ x: 0, y: 0 }} onGenerateIllustration={jest.fn()} />);

    expect(screen.getByRole("menu")).toHaveStyle({
      width: `${NODE_CONTEXT_MENU_SIZE.width}px`,
      height: `${NODE_CONTEXT_MENU_SIZE.height}px`,
    });
  });

  it("メニューとその項目はメニュー内判定でtrueになる", () => {
    render(<NodeContextMenu position={{ x: 0, y: 0 }} onGenerateIllustration={jest.fn()} />);

    expect(isInsideNodeContextMenu(screen.getByRole("menu"))).toBe(true);
    expect(isInsideNodeContextMenu(screen.getByRole("menuitem"))).toBe(true);
  });
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/map/__tests__/nodeContextMenuDom.test.ts src/components/map/__tests__/textEntryTarget.test.ts src/components/map/__tests__/NodeContextMenu.test.tsx`
Expected: FAIL（モジュールなし、`height`スタイルと属性なし）

- [ ] **Step 3: 実装**

`nodeContextMenuDom.ts`:

```ts
export const NODE_CONTEXT_MENU_ATTRIBUTE = "data-node-context-menu";

const NODE_CONTEXT_MENU_SELECTOR = `[${NODE_CONTEXT_MENU_ATTRIBUTE}]`;

export function isInsideNodeContextMenu(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(NODE_CONTEXT_MENU_SELECTOR) !== null;
}
```

`textEntryTarget.ts`:

```ts
export function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea") !== null;
}
```

`NodeContextMenu.tsx`は、ルート`div`へ`data-node-context-menu=""`を追加し、`style`を`{ left: position.x, top: position.y, width: NODE_CONTEXT_MENU_SIZE.width, height: NODE_CONTEXT_MENU_SIZE.height }`へ、ボタンの`h-9`を`h-full`へ変更する。`NODE_CONTEXT_MENU_ATTRIBUTE`は属性名の唯一の定義であり、JSXのリテラルと一致していることを`nodeContextMenuDom.test.ts`と上記メニュー内判定テストが保証する。`role`、`aria-label`、イベントハンドラ、その他のclassは変更しない。

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/components/map/__tests__/nodeContextMenuDom.test.ts src/components/map/__tests__/textEntryTarget.test.ts src/components/map/__tests__/NodeContextMenu.test.tsx && npm run lint && npm run typecheck`
Expected: PASS（`NodeContextMenu.test.tsx`の既存3テストも変更なしで通る）

（コミットしない）

---

### Task 2: useNodeContextMenuの分割（失効判定・閉じるリスナー）

**Files:**
- Create: `client/src/components/map/nodeContextMenuStaleness.ts`
- Create: `client/src/components/map/useNodeContextMenuDismissal.ts`
- Modify: `client/src/components/map/useNodeContextMenu.ts`
- Test: `client/src/components/map/__tests__/nodeContextMenuStaleness.test.ts`
- Test: `client/src/components/map/__tests__/useNodeContextMenuDismissal.test.tsx`
- Existing（変更しない）: `client/src/components/map/__tests__/useNodeContextMenu.test.tsx`

**Interfaces:**
- Consumes: `isInsideNodeContextMenu`（Task 1）
- Produces:
  - `isNodeContextMenuStale(input: { menuNodeId: number; menuRevision: number; resetRevision: number; visibleNodeIds: ReadonlySet<number>; nodes: readonly Node[] }): boolean`
  - `useNodeContextMenuDismissal(isOpen: boolean, onDismiss: () => void): void` — `isOpen`の間だけ、Escape、メニュー外の`pointerdown`（キャプチャ）、`wheel`（キャプチャ）、`blur`で`onDismiss`を呼ぶ
  - `useNodeContextMenu`の公開APIは不変: `{ menu, open, close }`

- [ ] **Step 1: 失敗するテストを書く**

`nodeContextMenuStaleness.test.ts`:

```ts
import { isNodeContextMenuStale } from "@/components/map/nodeContextMenuStaleness";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2 })];
const fresh = {
  menuNodeId: 1,
  menuRevision: 0,
  resetRevision: 0,
  visibleNodeIds: new Set([1, 2]) as ReadonlySet<number>,
  nodes,
};

describe("isNodeContextMenuStale", () => {
  it("全条件を満たす間は失効しない", () => {
    expect(isNodeContextMenuStale(fresh)).toBe(false);
  });

  it("resetRevisionが開いた時点と異なると失効する", () => {
    expect(isNodeContextMenuStale({ ...fresh, resetRevision: 1 })).toBe(true);
  });

  it("対象ノードが非表示になると、nodesに残っていても失効する", () => {
    expect(isNodeContextMenuStale({ ...fresh, visibleNodeIds: new Set([2]) })).toBe(true);
  });

  it("対象ノードが削除されると、visibleNodeIdsに残っていても失効する", () => {
    expect(isNodeContextMenuStale({ ...fresh, nodes: [nodes[1]] })).toBe(true);
  });
});
```

`useNodeContextMenuDismissal.test.tsx`:

```tsx
import { fireEvent, renderHook } from "@testing-library/react";
import { useNodeContextMenuDismissal } from "@/components/map/useNodeContextMenuDismissal";

describe("useNodeContextMenuDismissal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("開いている間、EscapeでonDismissを呼ぶ", () => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("Escape以外のキーでは呼ばない", () => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.keyDown(window, { key: "a" });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("メニュー外のpointerdownとwheelとblurで呼ぶ", () => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.pointerDown(document.body);
    fireEvent.wheel(document.body);
    fireEvent.blur(window);

    expect(onDismiss).toHaveBeenCalledTimes(3);
  });

  it("メニュー専用属性の内側のpointerdownでは呼ばない", () => {
    document.body.innerHTML = `<div data-node-context-menu=""><button id="item"></button></div>`;
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.pointerDown(document.getElementById("item")!);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("role=menuだけの別要素のpointerdownは外側として扱う", () => {
    document.body.innerHTML = `<div role="menu"><button id="item"></button></div>`;
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(true, onDismiss));

    fireEvent.pointerDown(document.getElementById("item")!);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("閉じている間はどのイベントでも呼ばない", () => {
    const onDismiss = jest.fn();
    renderHook(() => useNodeContextMenuDismissal(false, onDismiss));

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(document.body);
    fireEvent.wheel(document.body);
    fireEvent.blur(window);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("アンマウント後はリスナーが解除される", () => {
    const onDismiss = jest.fn();
    const { unmount } = renderHook(() => useNodeContextMenuDismissal(true, onDismiss));
    unmount();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(document.body);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("isOpenがfalseへ変わるとリスナーが解除される", () => {
    const onDismiss = jest.fn();
    const { rerender } = renderHook(
      ({ isOpen }) => useNodeContextMenuDismissal(isOpen, onDismiss),
      { initialProps: { isOpen: true } },
    );
    rerender({ isOpen: false });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
```


- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/map/__tests__/nodeContextMenuStaleness.test.ts src/components/map/__tests__/useNodeContextMenuDismissal.test.tsx`
Expected: FAIL（モジュールなし）

- [ ] **Step 3: 実装**

`nodeContextMenuStaleness.ts`:

```ts
import type { Node } from "@/types/node";

type NodeContextMenuStalenessInput = {
  menuNodeId: number;
  menuRevision: number;
  resetRevision: number;
  visibleNodeIds: ReadonlySet<number>;
  nodes: readonly Node[];
};

export function isNodeContextMenuStale({
  menuNodeId,
  menuRevision,
  resetRevision,
  visibleNodeIds,
  nodes,
}: NodeContextMenuStalenessInput): boolean {
  return menuRevision !== resetRevision
    || !visibleNodeIds.has(menuNodeId)
    || !nodes.some((node) => node.id === menuNodeId);
}
```

`useNodeContextMenuDismissal.ts`:

```ts
"use client";

import { useEffect } from "react";
import { isInsideNodeContextMenu } from "@/components/map/nodeContextMenuDom";

export function useNodeContextMenuDismissal(isOpen: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideNodeContextMenu(event.target)) onDismiss();
    };
    const handleDismiss = () => onDismiss();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("wheel", handleDismiss, true);
    window.addEventListener("blur", handleDismiss);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("wheel", handleDismiss, true);
      window.removeEventListener("blur", handleDismiss);
    };
  }, [isOpen, onDismiss]);
}
```

`useNodeContextMenu.ts`を、状態保持（`stored`、`open`、`close`）と、上記2モジュールの利用だけにする:

```ts
"use client";

import { useCallback, useState } from "react";
import type { Point } from "@/components/map/mapGeometry";
import { isNodeContextMenuStale } from "@/components/map/nodeContextMenuStaleness";
import { useNodeContextMenuDismissal } from "@/components/map/useNodeContextMenuDismissal";
import type { Node } from "@/types/node";

export type NodeContextMenuState = { nodeId: number; position: Point };

type UseNodeContextMenuOptions = {
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  resetRevision: number;
};

type StoredMenu = NodeContextMenuState & { revision: number };

export function useNodeContextMenu({
  nodes,
  visibleNodeIds,
  resetRevision,
}: UseNodeContextMenuOptions) {
  const [stored, setStored] = useState<StoredMenu | null>(null);

  const isStale = stored !== null && isNodeContextMenuStale({
    menuNodeId: stored.nodeId,
    menuRevision: stored.revision,
    resetRevision,
    visibleNodeIds,
    nodes,
  });
  if (isStale) setStored(null);

  const close = useCallback(() => setStored(null), []);
  const open = useCallback(
    (menu: NodeContextMenuState) => setStored({ ...menu, revision: resetRevision }),
    [resetRevision],
  );

  const isOpen = stored !== null && !isStale;
  useNodeContextMenuDismissal(isOpen, close);

  const menu: NodeContextMenuState | null = isOpen
    ? { nodeId: stored.nodeId, position: stored.position }
    : null;

  return { menu, open, close };
}
```

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/components/map/__tests__/nodeContextMenuStaleness.test.ts src/components/map/__tests__/useNodeContextMenuDismissal.test.tsx src/components/map/__tests__/useNodeContextMenu.test.tsx && npm run lint && npm run typecheck`
Expected: PASS。`useNodeContextMenu.test.tsx`は変更せず全件通る。`useNodeContextMenu.test.tsx`の「メニュー内のpointerdownでは閉じない」テストは`role="menu"`の要素を使っているため、本Taskで失敗する。その場合は、そのテストのダミー要素を`data-node-context-menu=""`属性を持つ要素へ変更する（これは専用属性化に伴う唯一の許容変更）。

（コミットしない）

---

### Task 3: 右クリック意図判定の純粋関数

**Files:**
- Create: `client/src/components/map/mapContextMenuAction.ts`
- Test: `client/src/components/map/__tests__/mapContextMenuAction.test.ts`

**Interfaces:**
- Consumes: `resolveNodeContextMenuTarget`（`nodeContextMenuTarget.ts`）、`clampNodeContextMenuPosition`（`nodeContextMenuLayout.ts`）
- Produces:
  - `type MapContextMenuAction = { type: "native" } | { type: "suppress" } | { type: "dismiss" } | { type: "select"; nodeId: number } | { type: "open"; nodeId: number; position: Point }`
    - `native`: `preventDefault`しない（編集中、または文字入力欄上）
    - `suppress`: `preventDefault`だけ行う（メニュー上、ジェスチャ中）
    - `dismiss`: `preventDefault`し、開いているメニューを閉じる（空白・非表示ノード）
    - `select`: `preventDefault`し、ノードを選択する（メニューを開けない場合）
    - `open`: `preventDefault`し、ノードを選択してメニューを開く
  - `resolveMapContextMenuAction(input: { isEditing: boolean; isTextEntryTarget: boolean; isInsideMenu: boolean; hasActiveGesture: boolean; canOpenMenu: boolean; client: Point; bounds: Pick<DOMRect, "left" | "top" | "width" | "height">; viewport: Viewport; visibleNodes: readonly Node[] }): MapContextMenuAction`
  - 判定の優先順位: `isEditing`または`isTextEntryTarget` → `native` / `isInsideMenu` → `suppress` / `hasActiveGesture` → `suppress` / 対象なし → `dismiss` / `canOpenMenu` → `open`、それ以外 → `select`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { resolveMapContextMenuAction } from "@/components/map/mapContextMenuAction";
import { NODE_CONTEXT_MENU_SIZE } from "@/components/map/nodeContextMenuLayout";
import { createTestNode } from "@/testing/createTestNode";

const node = createTestNode({ id: 1, x: 50, y: 30, width: 100, height: 60 });
const base = {
  isEditing: false,
  isTextEntryTarget: false,
  isInsideMenu: false,
  hasActiveGesture: false,
  canOpenMenu: true,
  client: { x: 100, y: 60 },
  bounds: { left: 0, top: 0, width: 800, height: 600 },
  viewport: { offsetX: 0, offsetY: 0, scale: 1 },
  visibleNodes: [node],
};

describe("resolveMapContextMenuAction", () => {
  it("ノード上で開ける場合は、クランプ済み位置つきのopenを返す", () => {
    expect(resolveMapContextMenuAction(base)).toEqual({
      type: "open",
      nodeId: 1,
      position: { x: 100, y: 60 },
    });
  });

  it("画面端ではメニューをコンテナ内へ寄せる", () => {
    expect(resolveMapContextMenuAction({
      ...base,
      client: { x: 790, y: 590 },
      visibleNodes: [createTestNode({ id: 1, x: 760, y: 560, width: 100, height: 60 })],
    })).toEqual({
      type: "open",
      nodeId: 1,
      position: {
        x: 800 - NODE_CONTEXT_MENU_SIZE.width,
        y: 600 - NODE_CONTEXT_MENU_SIZE.height,
      },
    });
  });

  it("メニューを開けない場合はselectを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, canOpenMenu: false })).toEqual({
      type: "select",
      nodeId: 1,
    });
  });

  it("対象ノードがなければdismissを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, visibleNodes: [] })).toEqual({ type: "dismiss" });
  });

  it("変換後座標が非有限ならdismissを返す", () => {
    expect(resolveMapContextMenuAction({
      ...base,
      client: { x: Number.MAX_VALUE, y: 0 },
      bounds: { left: -Number.MAX_VALUE, top: 0, width: 800, height: 600 },
    })).toEqual({ type: "dismiss" });
  });

  it("編集中はnativeを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, isEditing: true })).toEqual({ type: "native" });
  });

  it("文字入力欄上はnativeを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, isTextEntryTarget: true })).toEqual({ type: "native" });
  });

  it("メニュー上はsuppressを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, isInsideMenu: true })).toEqual({ type: "suppress" });
  });

  it("ジェスチャ中はsuppressを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, hasActiveGesture: true })).toEqual({ type: "suppress" });
  });

  it("編集中は他の条件より優先してnativeを返す", () => {
    expect(resolveMapContextMenuAction({
      ...base,
      isEditing: true,
      isInsideMenu: true,
      hasActiveGesture: true,
    })).toEqual({ type: "native" });
  });

  it("メニュー上はジェスチャ中の判定より優先する（どちらもsuppress）", () => {
    expect(resolveMapContextMenuAction({
      ...base,
      isInsideMenu: true,
      hasActiveGesture: true,
      visibleNodes: [],
    })).toEqual({ type: "suppress" });
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/map/__tests__/mapContextMenuAction.test.ts`
Expected: FAIL（モジュールなし）

- [ ] **Step 3: 実装**

```ts
import type { Point } from "@/components/map/mapGeometry";
import type { Viewport } from "@/components/map/mapViewport";
import { clampNodeContextMenuPosition } from "@/components/map/nodeContextMenuLayout";
import { resolveNodeContextMenuTarget } from "@/components/map/nodeContextMenuTarget";
import type { Node } from "@/types/node";

export type MapContextMenuAction =
  | { type: "native" }
  | { type: "suppress" }
  | { type: "dismiss" }
  | { type: "select"; nodeId: number }
  | { type: "open"; nodeId: number; position: Point };

type MapContextMenuInput = {
  isEditing: boolean;
  isTextEntryTarget: boolean;
  isInsideMenu: boolean;
  hasActiveGesture: boolean;
  canOpenMenu: boolean;
  client: Point;
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">;
  viewport: Viewport;
  visibleNodes: readonly Node[];
};

export function resolveMapContextMenuAction({
  isEditing,
  isTextEntryTarget,
  isInsideMenu,
  hasActiveGesture,
  canOpenMenu,
  client,
  bounds,
  viewport,
  visibleNodes,
}: MapContextMenuInput): MapContextMenuAction {
  if (isEditing || isTextEntryTarget) return { type: "native" };
  if (isInsideMenu || hasActiveGesture) return { type: "suppress" };

  const target = resolveNodeContextMenuTarget({
    client,
    bounds,
    viewport,
    nodes: visibleNodes,
  });
  if (target === null) return { type: "dismiss" };
  if (!canOpenMenu) return { type: "select", nodeId: target.nodeId };

  return {
    type: "open",
    nodeId: target.nodeId,
    position: clampNodeContextMenuPosition(target.anchor, bounds),
  };
}
```

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/components/map/__tests__/mapContextMenuAction.test.ts && npm run lint && npm run typecheck`
Expected: PASS

（コミットしない）

---

### Task 4: MapStageを薄いハンドラへ

**Files:**
- Modify: `client/src/components/map/MapStage.tsx`
- Existing（変更しない）: `client/src/components/map/__tests__/MapStage.test.tsx`（右クリックのテストを含む全既存テストが通ること）

**Interfaces:**
- Consumes: `resolveMapContextMenuAction`（Task 3）、`isInsideNodeContextMenu`（Task 1）、`isTextEntryTarget`（Task 1）
- Produces: `MapStage`の公開propsは不変

- [ ] **Step 1: 実装**

1. `useMemo`で`visibleNodes`を1つ作る（`effectiveVisibleNodeIds`の直後）:

```tsx
  const visibleNodes = useMemo(
    () => nodes.filter((node) => effectiveVisibleNodeIds.has(node.id)),
    [nodes, effectiveVisibleNodeIds],
  );
```

2. `handleDoubleClick`の`nodes: nodes.filter(...)`を`nodes: visibleNodes`へ置き換える。
3. `handleContextMenu`を次のとおり置き換える。ヒットテスト、方針、クランプ、DOM対象判定は持たず、判定結果に応じた副作用だけを行う:

```tsx
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    const action: MapContextMenuAction = container === null
      ? { type: "suppress" }
      : resolveMapContextMenuAction({
        isEditing: editing.editingNodeId !== null,
        isTextEntryTarget: isTextEntryTarget(event.target),
        isInsideMenu: isInsideNodeContextMenu(event.target),
        hasActiveGesture: hasActiveGesture(),
        canOpenMenu: onGenerateIllustration !== undefined,
        client: { x: event.clientX, y: event.clientY },
        bounds: container.getBoundingClientRect(),
        viewport: viewportRef.current,
        visibleNodes,
      });

    if (action.type === "native") return;
    event.preventDefault();

    if (action.type === "dismiss") contextMenu.close();
    else if (action.type === "select") onSelectNode(action.nodeId);
    else if (action.type === "open") {
      onSelectNode(action.nodeId);
      contextMenu.open({ nodeId: action.nodeId, position: action.position });
    }
  };
```

4. importへ`resolveMapContextMenuAction`と型`MapContextMenuAction`（`@/components/map/mapContextMenuAction`）、`isInsideNodeContextMenu`（`@/components/map/nodeContextMenuDom`）、`isTextEntryTarget`（`@/components/map/textEntryTarget`）を追加し、不要になった`resolveNodeContextMenuTarget`・`clampNodeContextMenuPosition`のimportを削除する。

- [ ] **Step 2: 既存テストで回帰確認**

Run: `cd client && npx jest src/components/map && npm run lint && npm run typecheck`
Expected: PASS（`MapStage.test.tsx`は変更なしで全件通る）

（コミットしない）

---

### Task 5: 右クリック結合テストの分離

**Files:**
- Create: `client/src/components/map/__tests__/MapStageContextMenu.test.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- 新規テストファイルは`MapStageVisibility.test.tsx`の構成（`jest.mock("pixi.js", ...)`、`mapStageTestRuntime`のhelper）に倣う。

- [ ] **Step 1: 移動**

`MapStage.test.tsx`から、右クリックコンテキストメニューに関するテスト（`contextMenu`を発火する、または`イラストを生成`・`role="menu"`を検証するテスト全件）を切り出し、`MapStageContextMenu.test.tsx`へ移す。ファイル先頭の`jest.mock("pixi.js", ...)`、`defaultProps`、`sampleNodes`は新ファイルに必要な分だけ複製する（共通化は行わない。既存の`MapStageVisibility.test.tsx`も同様の構成）。`MapStage.test.tsx`側からは移動したテストと、それだけが使っていたimport・定数を削除する。テスト名・期待値は変更しない。

- [ ] **Step 2: 確認**

Run: `cd client && npx jest src/components/map/__tests__/MapStage.test.tsx src/components/map/__tests__/MapStageContextMenu.test.tsx --verbose 2>&1 | tail -60 && npm run lint && npm run typecheck`
Expected: PASS。移動前後でテスト総数（`MapStage.test.tsx`と`MapStageContextMenu.test.tsx`の合計）が変わらないこと。レポートに移動したテスト名の一覧を載せる。

- [ ] **Step 3: 全体検証**

Run: `cd client && npm run verify`
Expected: すべて成功

（コミットしない）

---

## Self-Review

- **洗い出しの網羅:** 項目1〜6はTask 1〜5、項目7・8は「対応しない」と理由を記載。
- **挙動不変:** 既存の`MapStage.test.tsx`・`NodeContextMenu.test.tsx`・`useNodeContextMenu.test.tsx`は期待値を変えずに通すこと（許容変更は、Task 2に記載した`useNodeContextMenu.test.tsx`のダミー要素の属性のみ）。メニューの実高が46px→44pxになる点（項目5）は、レイアウト定数との不一致の是正であり、意図した唯一の見た目の差。
- **型の一貫性:** `MapContextMenuAction`の各`type`はTask 3で定義し、Task 4の分岐と一致。`isInsideNodeContextMenu`・`isTextEntryTarget`はTask 1で定義し、Task 2・4が使用。
- **ユニットテスト拡充:** 新規6モジュールにユニットテストを追加（`nodeContextMenuDom`、`textEntryTarget`、`nodeContextMenuStaleness`、`useNodeContextMenuDismissal`、`mapContextMenuAction`、`NodeContextMenu`の寸法・属性）。
