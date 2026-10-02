# Phase 7 右パネル 単一責任リファクタリング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. インライン実行は使わない（`AGENTS.md`参照）。

**Goal:** `origin/main`からの変更箇所（右パネルとイラスト生成の入口）を、単一責任の単位へ整理し、整理した単位ごとにユニットテストを拡充する。外部から見える挙動は変えない。

**Architecture:** 「ノードの表示ラベル」の規則（空なら代替文言）を、3か所の重複から純粋関数1つへ集約する。ページの横並びレイアウト（CSS）を、配線を担う`page.tsx`から`AppWorkspace`へ分離し、レイアウトのテストをその部品へ移す。

**Tech Stack:** TypeScript 5、React 19、Next.js 16、Jest 30、Testing Library、Tailwind CSS 4

## Global Constraints

- **コミットしない。** 本リファクタリングでは`git commit`、`git add`を実行しない（ユーザー指示）。作業ツリーに変更を残す。
- 外部から見える挙動を変えない（表示文言、DOM構造、クラス、操作）。既存テストは、移動・統合する場合を除き、期待値を変更せずに通ること。
- 実装コードより先に、新規モジュールの対応テストを追加し、REDを確認する。
- 新しい外部依存を追加しない。`Node`型、永続化形式、Storageキー、`MapStage`の公開propsは変更しない。
- 空ラベルの扱いは現状どおり: `label`が空文字のときだけ`FALLBACK_NODE_LABEL`（「新しいノード」）を使う。空白だけのラベルは、置き換えない（現状の`||`の挙動）。
- UI文言・コメント・テスト名は日本語、識別子は英語。
- 各タスクと最後に、`client`ディレクトリで`npm run lint`、`npm run typecheck`、関連テストを実行する。最後に`npm run verify`を実行する。

## 洗い出し結果（対象: `origin/main...HEAD`の本番コード変更）

対象: `IllustrationPanel.tsx`、`useIllustrationGeneration.ts`、`nodeLabel.ts`、`renderMapNodes.ts`、`mapExportText.ts`、`page.tsx`、`page.test.tsx`。

| # | 場所 | 問題 | 対応 |
|---|------|------|------|
| 1 | `renderMapNodes.ts`・`mapExportText.ts`・`IllustrationPanel.tsx` | 「ラベルが空なら代替文言」の規則が、3か所にそれぞれ`||`で書かれている。共有されているのは文言の定数だけで、規則（いつ置き換えるか）は重複している | Task 1: 純粋関数`getNodeDisplayLabel`へ集約 |
| 2 | `page.tsx`・`page.test.tsx` | `Home`の配線に、横並びレイアウトのCSS（`flex`、`min-w-0`、`flex-1`）が混在している。ページのテストも、ラッパーのCSSクラスに結合している | Task 2: `AppWorkspace`へ分離し、クラスの検証を部品のテストへ移す |
| 3 | `useIllustrationGeneration.ts` | 入口の関数1つだけで、責務は単一 | 対応しない |
| 4 | `IllustrationPanel.tsx`の対象表示とボタン | 43行で、分割しても利用者が増えない | 対応しない（YAGNI） |
| 5 | `page.test.tsx`への追加（describe） | 重いモックを別ファイルへ複製する利点がなく、既存のページテストの流儀と一致する | 対応しない |

## File Structure

- Create: `client/src/domain/nodes/nodeDisplayLabel.ts` — ノードの表示ラベルの規則
- Create: `client/src/domain/nodes/__tests__/nodeDisplayLabel.test.ts`
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`、`client/src/domain/imageExport/mapExportText.ts`、`client/src/components/layout/IllustrationPanel.tsx` — 規則の利用
- Create: `client/src/components/layout/AppWorkspace.tsx` — キャンバスと側面パネルの横並びレイアウト
- Create: `client/src/components/layout/__tests__/AppWorkspace.test.tsx`
- Modify: `client/src/app/page.tsx`、`client/src/app/__tests__/page.test.tsx`、`client/src/components/layout/__tests__/IllustrationPanel.test.tsx`

---

### Task 1: 表示ラベルの規則の集約

**Files:**
- Create: `client/src/domain/nodes/nodeDisplayLabel.ts`
- Test: `client/src/domain/nodes/__tests__/nodeDisplayLabel.test.ts`
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`
- Modify: `client/src/domain/imageExport/mapExportText.ts`
- Modify: `client/src/components/layout/IllustrationPanel.tsx`

**Interfaces:**
- Consumes: `FALLBACK_NODE_LABEL`（`@/config/nodeLabel`、既存）
- Produces: `getNodeDisplayLabel(label: string): string` — `label`が空文字なら`FALLBACK_NODE_LABEL`、それ以外は`label`をそのまま返す。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";

describe("getNodeDisplayLabel", () => {
  it("空ラベルは代替文言を返す", () => {
    expect(getNodeDisplayLabel("")).toBe(FALLBACK_NODE_LABEL);
  });

  it("ラベルがあればそのまま返す", () => {
    expect(getNodeDisplayLabel("企画の背景")).toBe("企画の背景");
  });

  it("空白だけのラベルは置き換えない", () => {
    expect(getNodeDisplayLabel("   ")).toBe("   ");
  });

  it("代替文言と同じ文字列のラベルも、そのまま返す", () => {
    expect(getNodeDisplayLabel(FALLBACK_NODE_LABEL)).toBe(FALLBACK_NODE_LABEL);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeDisplayLabel.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

`nodeDisplayLabel.ts`:

```ts
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";

export function getNodeDisplayLabel(label: string): string {
  return label || FALLBACK_NODE_LABEL;
}
```

利用側の置き換え（挙動は同一）:
- `renderMapNodes.ts`: `text: node.label || FALLBACK_NODE_LABEL` → `text: getNodeDisplayLabel(node.label)`。`FALLBACK_NODE_LABEL`のimportを、`getNodeDisplayLabel`のimport（`@/domain/nodes/nodeDisplayLabel`）へ置き換える。
- `mapExportText.ts`: `normalizeMapXmlText(label || FALLBACK_NODE_LABEL)`に相当する箇所を、`normalizeMapXmlText(getNodeDisplayLabel(label))`へ置き換える。`FALLBACK_NODE_LABEL`のimportは不要になるため削除する。
- `IllustrationPanel.tsx`: `const label = selectedNode?.label || FALLBACK_NODE_LABEL;`を削除し、非nullの分岐の中の`{label}`を`{getNodeDisplayLabel(selectedNode.label)}`へ置き換える。`FALLBACK_NODE_LABEL`のimportを、`getNodeDisplayLabel`のimportへ置き換える。`title={selectedNode.label || undefined}`は変更しない。

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeDisplayLabel.test.ts src/components/layout src/components/map/pixi/__tests__/renderMapNodes.test.ts src/domain/imageExport src/config src/app && npm run lint && npm run typecheck`
Expected: PASS（`renderMapNodes.test.ts`、`mapExportText.test.ts`、`IllustrationPanel.test.tsx`、`page.test.tsx`は、変更なしで通る）

（コミットしない）

---

### Task 2: AppWorkspace（レイアウトの分離）

**Files:**
- Create: `client/src/components/layout/AppWorkspace.tsx`
- Test: `client/src/components/layout/__tests__/AppWorkspace.test.tsx`
- Modify: `client/src/app/page.tsx`
- Modify: `client/src/app/__tests__/page.test.tsx`
- Modify: `client/src/components/layout/__tests__/IllustrationPanel.test.tsx`

**Interfaces:**
- Produces: `AppWorkspace({ canvas, sidePanel }: { canvas: ReactNode; sidePanel: ReactNode })`
  - `<main className="flex min-h-0 flex-1 overflow-hidden">`の中に、`canvas`を`<div className="min-h-0 min-w-0 flex-1">`で包んで先に、`sidePanel`をその後に、並べる。

- [ ] **Step 1: 失敗するテストを書く**

`AppWorkspace.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { AppWorkspace } from "@/components/layout/AppWorkspace";

describe("AppWorkspace", () => {
  it("mainランドマークとして、横並びのflexレイアウトを提供する", () => {
    render(<AppWorkspace canvas={<div>キャンバス</div>} sidePanel={<aside>パネル</aside>} />);

    const main = screen.getByRole("main");
    expect(main).toHaveClass("flex", "min-h-0", "flex-1", "overflow-hidden");
  });

  it("キャンバスを、残りの幅を使い縮められる枠で包む", () => {
    render(<AppWorkspace canvas={<div>キャンバス</div>} sidePanel={<aside>パネル</aside>} />);

    const wrapper = screen.getByText("キャンバス").parentElement;
    expect(wrapper).toHaveClass("min-h-0", "min-w-0", "flex-1");
  });

  it("キャンバスの後ろに、側面パネルを並べる", () => {
    render(<AppWorkspace canvas={<div>キャンバス</div>} sidePanel={<aside>パネル</aside>} />);

    const main = screen.getByRole("main");
    const wrapper = screen.getByText("キャンバス").parentElement!;
    const panel = screen.getByText("パネル");
    expect(main).toContainElement(panel);
    expect(wrapper.nextElementSibling).toBe(panel);
  });
});
```

`IllustrationPanel.test.tsx`へ追加（既存のテストは変更しない）:

```tsx
  it("固定幅で、縮まない", () => {
    render(<IllustrationPanel selectedNode={null} onGenerate={jest.fn()} />);

    expect(screen.getByRole("complementary", { name: "イラスト" })).toHaveClass("w-60", "shrink-0");
  });
```

- [ ] **Step 2: 失敗確認**

Run: `cd client && npx jest src/components/layout/__tests__/AppWorkspace.test.tsx src/components/layout/__tests__/IllustrationPanel.test.tsx`
Expected: AppWorkspaceはFAIL（モジュールなし）。IllustrationPanelの新テストは、すでに`w-60 shrink-0`があるため、PASSする（既存の挙動を、部品側のテストに固定する追加）。

- [ ] **Step 3: 実装**

`AppWorkspace.tsx`:

```tsx
import type { ReactNode } from "react";

type AppWorkspaceProps = {
  canvas: ReactNode;
  sidePanel: ReactNode;
};

export function AppWorkspace({ canvas, sidePanel }: AppWorkspaceProps) {
  return (
    <main className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1">{canvas}</div>
      {sidePanel}
    </main>
  );
}
```

`page.tsx`: `<main>…</main>`のブロックを、次へ置き換える（`MapStage`のpropsは変更しない）。`AppWorkspace`をimportする。

```tsx
      <AppWorkspace
        canvas={(
          <MapStage
            /* 既存のprops（変更なし） */
          />
        )}
        sidePanel={<IllustrationPanel selectedNode={selectedNode} onGenerate={generateIllustration} />}
      />
```

`page.test.tsx`: 「キャンバスとパネルを横に並べて表示する」のテストから、ラッパーとパネルのCSSクラスの検証（`min-w-0`、`flex-1`、`w-60`、`shrink-0`）を削除し、配線の検証（`main`の中にキャンバスとパネルがあること）だけを残す。テスト名は「キャンバスとパネルを同じ作業領域に表示する」へ変更してよい。クラスの検証は、`AppWorkspace.test.tsx`と`IllustrationPanel.test.tsx`が持つ。

- [ ] **Step 4: 成功確認**

Run: `cd client && npx jest src/components/layout src/app && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 全体検証**

Run: `cd client && npm run verify`
Expected: すべて成功

（コミットしない）

---

## Self-Review

- **洗い出しの網羅:** 項目1・2はTask 1・2、項目3〜5は「対応しない」と理由を記載。
- **挙動不変:** 表示文言、DOM構造、クラスは変更しない。空白だけのラベルを置き換えない現状の挙動は、Task 1のテストで固定する。
- **テストの所有者:** 表示ラベルの規則は`nodeDisplayLabel.test.ts`、レイアウトのクラスは`AppWorkspace.test.tsx`と`IllustrationPanel.test.tsx`、ページのテストは配線だけを持つ。
