# Phase 7 ノードコンテキストメニュー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ノードを右クリックすると「イラストを生成」を含むコンテキストメニューが開き、項目選択で対象ノードIDを通知できるようにする。

**Architecture:** 右クリック位置のノード判定は純粋関数に分離し、メニューの開閉状態は専用Hookで管理する。メニュー本体はMapStage内に絶対配置するDOMコンポーネントとし、PixiJS側のポインタ処理（`button !== 0`は既に無視）は変更しない。実際の画像生成はPhase 7の後続項目であり、本計画では`onGenerateIllustration(nodeId)`コールバックを通知するところまでを範囲とする。

**Tech Stack:** TypeScript 5、React 19、Next.js 16、Jest 30、Testing Library、Tailwind CSS 4

## Global Constraints

- 範囲はROADMAP Phase 7の1項目目「ノード選択時の右クリックコンテキストメニューに『イラストを生成』を追加」のみ。右パネルボタン、画像生成API、イラストの保存・表示・再生成・削除は含めない。
- メニューの対象は表示中（`visibleNodeIds`に含まれる）ノードだけとする。
- 右クリックしたノードは選択状態にする。
- 空白の右クリックはブラウザ標準メニューを抑止し、開いているメニューを閉じるだけにする。
- 新しい外部依存を追加しない。
- `Node`型、永続化形式、Storageキーは変更しない。
- 実装コードより先に対応テストを追加し、REDを確認する。
- client変更後は`client`ディレクトリで`npm run verify`を実行する。
- `ROADMAP.md`は実装済み項目だけ更新する。

## 未決事項（実装前に確認）

- メニュー項目をクリックした時点では生成処理が存在しない。`page.tsx`には何もしないプレースホルダーを渡し、後続項目（生成API連携）で置き換える。押しても何も起きない項目を出したくない場合は、Task 4のStep 4（`page.tsx`への配線）を省く。MapStageは`onGenerateIllustration`未指定ならメニューを開かないため、メニューは後続項目の実装まで表示されない。

## File Structure

- Create: `client/src/components/map/nodeContextMenuTarget.ts` — クライアント座標からメニュー対象ノードを導出する純粋関数
- Create: `client/src/components/map/nodeContextMenuLayout.ts` — メニュー寸法定数と、コンテナ内への位置クランプ
- Create: `client/src/components/map/NodeContextMenu.tsx` — メニューのDOM表示
- Create: `client/src/components/map/useNodeContextMenu.ts` — 開閉状態と閉じる条件
- Modify: `client/src/components/map/MapStage.tsx` — `onContextMenu`とメニュー描画
- Modify: `client/src/app/page.tsx` — `onGenerateIllustration`の配線
- Create tests: `client/src/components/map/__tests__/{nodeContextMenuTarget,nodeContextMenuLayout,NodeContextMenu,useNodeContextMenu}.test.ts(x)`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`
- Modify: `ROADMAP.md`

---

### Task 1: 対象ノード判定と位置クランプ

**Files:**
- Create: `client/src/components/map/nodeContextMenuTarget.ts`
- Create: `client/src/components/map/nodeContextMenuLayout.ts`
- Test: `client/src/components/map/__tests__/nodeContextMenuTarget.test.ts`
- Test: `client/src/components/map/__tests__/nodeContextMenuLayout.test.ts`

**Interfaces:**
- Produces:
  - `resolveNodeContextMenuTarget(input: { client: Point; bounds: Pick<DOMRect, "left" | "top">; viewport: Viewport; nodes: readonly Node[] }): { nodeId: number; anchor: Point } | null`（`anchor`はコンテナ相対のスクリーン座標）
  - `NODE_CONTEXT_MENU_SIZE: { width: 176; height: 44 }`
  - `clampNodeContextMenuPosition(anchor: Point, container: { width: number; height: number }): Point`

- [ ] **Step 1: 失敗するテストを書く**

`nodeContextMenuTarget.test.ts`:

```ts
import { resolveNodeContextMenuTarget } from "@/components/map/nodeContextMenuTarget";
import { createTestNode } from "@/testing/createTestNode";

const node = createTestNode({ id: 1, x: 70, y: 45, width: 10, height: 10 });
const input = {
  client: { x: 300, y: 200 },
  bounds: { left: 100, top: 50 },
  viewport: { offsetX: 50, offsetY: 50, scale: 2 },
};

describe("resolveNodeContextMenuTarget", () => {
  it("ワールド座標にノードがあればIDとコンテナ相対anchorを返す", () => {
    expect(resolveNodeContextMenuTarget({ ...input, nodes: [node] })).toEqual({
      nodeId: 1,
      anchor: { x: 200, y: 150 },
    });
  });

  it("ノードがなければnullを返す", () => {
    expect(resolveNodeContextMenuTarget({ ...input, nodes: [] })).toBeNull();
  });

  it("変換後座標が非有限ならnullを返す", () => {
    expect(resolveNodeContextMenuTarget({
      ...input,
      client: { x: Number.MAX_VALUE, y: 0 },
      bounds: { left: -Number.MAX_VALUE, top: 0 },
      nodes: [node],
    })).toBeNull();
  });
});
```

`nodeContextMenuLayout.test.ts`:

```ts
import {
  NODE_CONTEXT_MENU_SIZE,
  clampNodeContextMenuPosition,
} from "@/components/map/nodeContextMenuLayout";

const container = { width: 800, height: 600 };

describe("clampNodeContextMenuPosition", () => {
  it("収まる位置はそのまま返す", () => {
    expect(clampNodeContextMenuPosition({ x: 10, y: 20 }, container)).toEqual({ x: 10, y: 20 });
  });

  it("右下端ではメニューがコンテナ内に収まる位置へ寄せる", () => {
    expect(clampNodeContextMenuPosition({ x: 790, y: 599 }, container)).toEqual({
      x: 800 - NODE_CONTEXT_MENU_SIZE.width,
      y: 600 - NODE_CONTEXT_MENU_SIZE.height,
    });
  });

  it("コンテナがメニューより小さくても負にならない", () => {
    expect(clampNodeContextMenuPosition({ x: 5, y: 5 }, { width: 10, height: 10 })).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/map/__tests__/nodeContextMenu -v`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`nodeContextMenuTarget.ts`:

```ts
import { findNodeAtPoint, toLocalPoint, type Point } from "@/components/map/mapGeometry";
import { screenToWorld, type Viewport } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

export type NodeContextMenuTarget = { nodeId: number; anchor: Point };

type NodeContextMenuTargetInput = {
  client: Point;
  bounds: Pick<DOMRect, "left" | "top">;
  viewport: Viewport;
  nodes: readonly Node[];
};

export function resolveNodeContextMenuTarget({
  client,
  bounds,
  viewport,
  nodes,
}: NodeContextMenuTargetInput): NodeContextMenuTarget | null {
  const anchor = toLocalPoint(client.x, client.y, bounds);
  const world = screenToWorld(anchor, viewport);
  if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return null;

  const node = findNodeAtPoint(nodes, world);
  return node ? { nodeId: node.id, anchor } : null;
}
```

`nodeContextMenuLayout.ts`:

```ts
import type { Point } from "@/components/map/mapGeometry";

export const NODE_CONTEXT_MENU_SIZE = { width: 176, height: 44 } as const;

export function clampNodeContextMenuPosition(
  anchor: Point,
  container: { width: number; height: number },
): Point {
  return {
    x: Math.max(0, Math.min(anchor.x, container.width - NODE_CONTEXT_MENU_SIZE.width)),
    y: Math.max(0, Math.min(anchor.y, container.height - NODE_CONTEXT_MENU_SIZE.height)),
  };
}
```

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/components/map/__tests__/nodeContextMenu -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/map/nodeContextMenuTarget.ts client/src/components/map/nodeContextMenuLayout.ts client/src/components/map/__tests__/nodeContextMenu*.test.ts
git commit -m "feat(map): コンテキストメニュー対象判定と位置補正を追加"
```

---

### Task 2: NodeContextMenuコンポーネント

**Files:**
- Create: `client/src/components/map/NodeContextMenu.tsx`
- Test: `client/src/components/map/__tests__/NodeContextMenu.test.tsx`

**Interfaces:**
- Consumes: `NODE_CONTEXT_MENU_SIZE`, `Point`
- Produces: `NodeContextMenu({ position: Point; onGenerateIllustration: () => void })`。`role="menu"`、項目は`role="menuitem"`「イラストを生成」。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeContextMenu } from "@/components/map/NodeContextMenu";

describe("NodeContextMenu", () => {
  it("指定位置にメニューと項目を表示する", () => {
    render(<NodeContextMenu position={{ x: 10, y: 20 }} onGenerateIllustration={jest.fn()} />);

    expect(screen.getByRole("menu")).toHaveStyle({ left: "10px", top: "20px" });
    expect(screen.getByRole("menuitem", { name: "イラストを生成" })).toBeInTheDocument();
  });

  it("項目クリックでコールバックを呼ぶ", async () => {
    const onGenerateIllustration = jest.fn();
    render(<NodeContextMenu position={{ x: 0, y: 0 }} onGenerateIllustration={onGenerateIllustration} />);

    await userEvent.click(screen.getByRole("menuitem", { name: "イラストを生成" }));

    expect(onGenerateIllustration).toHaveBeenCalledTimes(1);
  });

  it("メニュー上のdouble-clickを親へ伝播しない", async () => {
    const onDoubleClick = jest.fn();
    render(
      <div onDoubleClick={onDoubleClick}>
        <NodeContextMenu position={{ x: 0, y: 0 }} onGenerateIllustration={jest.fn()} />
      </div>,
    );

    await userEvent.dblClick(screen.getByRole("menuitem"));

    expect(onDoubleClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/map/__tests__/NodeContextMenu.test.tsx -v`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

```tsx
"use client";

import type { Point } from "@/components/map/mapGeometry";
import { NODE_CONTEXT_MENU_SIZE } from "@/components/map/nodeContextMenuLayout";

type NodeContextMenuProps = {
  position: Point;
  onGenerateIllustration: () => void;
};

export function NodeContextMenu({ position, onGenerateIllustration }: NodeContextMenuProps) {
  return (
    <div
      role="menu"
      aria-label="ノードメニュー"
      className="absolute z-20 rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
      style={{ left: position.x, top: position.y, width: NODE_CONTEXT_MENU_SIZE.width }}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        autoFocus
        onClick={onGenerateIllustration}
        className="h-9 w-full rounded px-3 text-left text-sm text-zinc-800 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus:bg-zinc-700"
      >
        イラストを生成
      </button>
    </div>
  );
}
```

注意: `h-9`（36px）+ `p-1`（4px×2）= 44px。`NODE_CONTEXT_MENU_SIZE.height`と一致させる。

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/components/map/__tests__/NodeContextMenu.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/components/map/NodeContextMenu.tsx client/src/components/map/__tests__/NodeContextMenu.test.tsx
git commit -m "feat(map): ノードコンテキストメニューを追加"
```

---

### Task 3: useNodeContextMenu（開閉状態）

**Files:**
- Create: `client/src/components/map/useNodeContextMenu.ts`
- Test: `client/src/components/map/__tests__/useNodeContextMenu.test.tsx`

**Interfaces:**
- Consumes: `Point`, `Node`
- Produces: `useNodeContextMenu({ nodes: readonly Node[]; visibleNodeIds: ReadonlySet<number>; resetRevision: number }): { menu: { nodeId: number; position: Point } | null; open: (menu: { nodeId: number; position: Point }) => void; close: () => void }`

閉じる条件: Escape、メニュー外の`pointerdown`、`wheel`、`blur`、対象ノードの削除・非表示（導出で無効化）、`resetRevision`変化（開いた時点のrevisionと不一致なら無効化）。無効化は状態から導出し、Effect内での`setState`を避ける。

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { act, renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { useNodeContextMenu } from "@/components/map/useNodeContextMenu";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [createTestNode({ id: 1 }), createTestNode({ id: 2 })];
const target = { nodeId: 1, position: { x: 10, y: 20 } };

function setup(overrides: Partial<Parameters<typeof useNodeContextMenu>[0]> = {}) {
  return renderHook((props) => useNodeContextMenu(props), {
    initialProps: {
      nodes,
      visibleNodeIds: new Set([1, 2]) as ReadonlySet<number>,
      resetRevision: 0,
      ...overrides,
    },
  });
}

describe("useNodeContextMenu", () => {
  it("openで対象を保持し、closeでnullに戻す", () => {
    const { result } = setup();
    expect(result.current.menu).toBeNull();

    act(() => result.current.open(target));
    expect(result.current.menu).toEqual(target);

    act(() => result.current.close());
    expect(result.current.menu).toBeNull();
  });

  it("Escapeで閉じる", () => {
    const { result } = setup();
    act(() => result.current.open(target));

    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });

    expect(result.current.menu).toBeNull();
  });

  it("メニュー外のpointerdownとwheelで閉じる", () => {
    const { result } = setup();
    act(() => result.current.open(target));
    act(() => { fireEvent.pointerDown(document.body); });
    expect(result.current.menu).toBeNull();

    act(() => result.current.open(target));
    act(() => { fireEvent.wheel(document.body); });
    expect(result.current.menu).toBeNull();
  });

  it("メニュー内のpointerdownでは閉じない", () => {
    const { result } = setup();
    const menuElement = document.createElement("div");
    menuElement.setAttribute("role", "menu");
    document.body.appendChild(menuElement);
    act(() => result.current.open(target));

    act(() => { fireEvent.pointerDown(menuElement); });

    expect(result.current.menu).toEqual(target);
    menuElement.remove();
  });

  it("対象ノードが削除または非表示になるとmenuはnullになる", () => {
    const { result, rerender } = setup();
    act(() => result.current.open(target));

    rerender({ nodes: [nodes[1]], visibleNodeIds: new Set([2]), resetRevision: 0 });

    expect(result.current.menu).toBeNull();
  });

  it("resetRevisionが変わるとmenuはnullになり、戻しても復活しない", () => {
    const { result, rerender } = setup();
    act(() => result.current.open(target));

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 1 });
    expect(result.current.menu).toBeNull();

    rerender({ nodes, visibleNodeIds: new Set([1, 2]), resetRevision: 0 });
    expect(result.current.menu).toBeNull();
  });
});
```

注意: 最後のテストは「戻しても復活しない」ことを保証するため、実装側は無効化時に状態も破棄する必要がある。導出のみだとrevisionを0へ戻したとき復活する。→ 実装では`open`時のrevisionを状態に保持し、`close`と同様にレンダー中の無効検知で`setMenu(null)`を呼ぶ（Reactが許容する「レンダー中の同一コンポーネントstate調整」パターン）。

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/map/__tests__/useNodeContextMenu.test.tsx -v`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Point } from "@/components/map/mapGeometry";
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

  const isStale = stored !== null && (
    stored.revision !== resetRevision
    || !visibleNodeIds.has(stored.nodeId)
    || !nodes.some((node) => node.id === stored.nodeId)
  );
  if (isStale) setStored(null);

  const close = useCallback(() => setStored(null), []);
  const open = useCallback(
    (menu: NodeContextMenuState) => setStored({ ...menu, revision: resetRevision }),
    [resetRevision],
  );

  const isOpen = stored !== null && !isStale;
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[role="menu"]')) return;
      close();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("blur", close);
    };
  }, [isOpen, close]);

  const menu: NodeContextMenuState | null = isOpen
    ? { nodeId: stored.nodeId, position: stored.position }
    : null;

  return { menu, open, close };
}
```

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/components/map/__tests__/useNodeContextMenu.test.tsx -v && npm run lint`
Expected: PASS、lintエラーなし。React Compilerのlintがレンダー中`setStored`を拒否する場合は、`useLayoutEffect`で`isStale`時に`setStored(null)`する形へ置き換え、`menu`の導出（`isOpen`）は維持する。

- [ ] **Step 5: Commit**

```bash
git add client/src/components/map/useNodeContextMenu.ts client/src/components/map/__tests__/useNodeContextMenu.test.tsx
git commit -m "feat(map): コンテキストメニューの開閉Hookを追加"
```

---

### Task 4: MapStageへの統合とpage配線

**Files:**
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/app/page.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- Consumes: Task 1〜3の全API
- Produces: `MapStage`の新規optional prop `onGenerateIllustration?: (nodeId: number) => void`。未指定の場合は右クリックでメニューを開かない（標準メニュー抑止と選択だけ行う）。

- [ ] **Step 1: 失敗するテストを書く**（`MapStage.test.tsx`の`describe`内、double-click系テストの近くへ追加）

```tsx
  it("ノードを右クリックすると選択してメニューを表示する", async () => {
    const onSelectNode = jest.fn();
    const { getByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        onSelectNode={onSelectNode}
        onGenerateIllustration={jest.fn()}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    expect(onSelectNode).toHaveBeenCalledWith(1);
    expect(getByRole("menu")).toHaveStyle({ left: "100px", top: "60px" });
  });

  it("メニュー項目の選択で対象ノードIDを通知してメニューを閉じる", async () => {
    const onGenerateIllustration = jest.fn();
    const { getByRole, queryByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        onGenerateIllustration={onGenerateIllustration}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    fireEvent.click(getByRole("menuitem", { name: "イラストを生成" }));

    expect(onGenerateIllustration).toHaveBeenCalledWith(1);
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("空白の右クリックは標準メニューを抑止し、開いているメニューを閉じる", async () => {
    const { queryByRole } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onGenerateIllustration={jest.fn()} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    const notPrevented = fireEvent.contextMenu(container, { clientX: 700, clientY: 500 });

    expect(notPrevented).toBe(false);
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("非表示ノードの右クリックではメニューを開かない", async () => {
    const onSelectNode = jest.fn();
    const { queryByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        visibleNodeIds={new Set([2])}
        onSelectNode={onSelectNode}
        onGenerateIllustration={jest.fn()}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.contextMenu(container, { clientX: 100, clientY: 60 });

    expect(onSelectNode).not.toHaveBeenCalled();
    expect(queryByRole("menu")).not.toBeInTheDocument();
  });

  it("画面端の右クリックではメニューをコンテナ内へ寄せる", async () => {
    const { getByRole } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={[{ ...sampleNodes[0], x: 760, y: 560 }]}
        onGenerateIllustration={jest.fn()}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.contextMenu(container, { clientX: 790, clientY: 590 });

    expect(getByRole("menu")).toHaveStyle({ left: "624px", top: "556px" });
  });
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/map/__tests__/MapStage.test.tsx -t "右クリック|メニュー" -v`
Expected: FAIL（`getByRole("menu")`が見つからない）

- [ ] **Step 3: MapStageを実装**

importへ追加:

```tsx
import { NodeContextMenu } from "@/components/map/NodeContextMenu";
import { clampNodeContextMenuPosition } from "@/components/map/nodeContextMenuLayout";
import { resolveNodeContextMenuTarget } from "@/components/map/nodeContextMenuTarget";
import { useNodeContextMenu } from "@/components/map/useNodeContextMenu";
```

`MapStageProps`へ`onGenerateIllustration?: (nodeId: number) => void;`を追加し、引数分割代入にも追加。`effectiveVisibleNodeIds`定義後、`useMapViewport`の後（`viewportRef`が使える位置）で:

```tsx
  const contextMenu = useNodeContextMenu({
    nodes,
    visibleNodeIds: effectiveVisibleNodeIds,
    resetRevision,
  });
```

`handleDoubleClick`の後へ追加:

```tsx
  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const target = resolveNodeContextMenuTarget({
      client: { x: event.clientX, y: event.clientY },
      bounds,
      viewport: viewportRef.current,
      nodes: nodes.filter((node) => effectiveVisibleNodeIds.has(node.id)),
    });
    if (target === null) {
      contextMenu.close();
      return;
    }

    onSelectNode(target.nodeId);
    if (onGenerateIllustration === undefined) return;
    contextMenu.open({
      nodeId: target.nodeId,
      position: clampNodeContextMenuPosition(target.anchor, bounds),
    });
  };
```

ルート`div`へ`onContextMenu={handleContextMenu}`を追加し、`editing.editingNode`ブロックの後へ:

```tsx
      {contextMenu.menu && onGenerateIllustration && (
        <NodeContextMenu
          position={contextMenu.menu.position}
          onGenerateIllustration={() => {
            const { nodeId } = contextMenu.menu!;
            contextMenu.close();
            onGenerateIllustration(nodeId);
          }}
        />
      )}
```

（`contextMenu.menu!`が非nullアサーションでlintに触れる場合は、`const menu = contextMenu.menu;`を描画前に取り出して使う。）

- [ ] **Step 4: page.tsxを配線**

`MapStage`へ`onGenerateIllustration={handleGenerateIllustration}`を渡す。`Home`内、`imageExport`定義の後へ:

```tsx
  // 画像生成はPhase 7の後続項目で実装する。それまでは通知を受けるだけ。
  const handleGenerateIllustration = useCallback((nodeId: number) => {
    void nodeId;
  }, []);
```

`import { useState } from "react";`を`import { useCallback, useState } from "react";`へ変更する。

- [ ] **Step 5: 成功確認と全体検証**

Run: `cd client && npx jest src/components/map src/app -v`
Expected: PASS（既存の右クリック無関係テストにも回帰なし）

Run: `cd client && npm run verify`
Expected: tailwind scan / lint / typecheck / test / build がすべて成功

- [ ] **Step 6: Commit**

```bash
git add client/src/components/map/MapStage.tsx client/src/app/page.tsx client/src/components/map/__tests__/MapStage.test.tsx
git commit -m "feat(map): ノード右クリックでイラスト生成メニューを表示"
```

---

### Task 5: ROADMAP更新

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: 更新**

- 「現在地」の最終行（`次の未完了項目は…`）を、Phase 7の1項目目完了と、次の未完了項目「右パネルにイラスト生成ボタンを配置」へ書き換える。ただし生成処理自体は未実装であることを一文で明記する。
- 「最終更新」を実施日へ変更する。
- Phase 7の`- [ ] ノード選択時の右クリックコンテキストメニューに「イラストを生成」を追加`を`- [x]`へ変更する。

- [ ] **Step 2: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): Phase 7コンテキストメニューの完了を反映"
```

---

## Self-Review

- **Spec coverage:** ROADMAP 1項目目の「右クリック→メニュー→『イラストを生成』」はTask 1〜4で実装。選択・非表示ノード・空白・画面端・閉じる条件（Escape / 外側クリック / wheel / blur / 削除 / リセット）をテストで固定。
- **Placeholder scan:** `page.tsx`の`handleGenerateIllustration`は意図的な空実装。理由と置換時期を「未決事項」とコメントで明示済み。
- **Type consistency:** `NodeContextMenuState = { nodeId; position }`はTask 3定義、Task 4で同形を使用。`resolveNodeContextMenuTarget`は`anchor`を返し、Task 4で`clampNodeContextMenuPosition(target.anchor, bounds)`へ渡す（`bounds`は`width/height`を持つ`DOMRect`）。
- **既知リスク:** Task 3のレンダー中`setStored`がReact Compiler lintで拒否される可能性 → Step 4に代替手順を記載。macOSのCtrl+クリックは`contextmenu`とpointerdown(button 0)が両方発火し、ノード移動ジェスチャが開始されうるが、移動閾値未満ならクリック扱いで影響は選択のみ。
