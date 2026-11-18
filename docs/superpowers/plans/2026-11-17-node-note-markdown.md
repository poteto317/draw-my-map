# Markdownメモ（候補053）実装プラン

> **状態:** 実装・検証完了。
>
> **For agentic workers:** このリポジトリでは AGENTS.md の規定により、サブエージェント駆動（`superpowers:subagent-driven-development`）で進める。インライン実行は使わない。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 右パネル「ノードの詳細」の「詳細メモ」節に「編集」「プレビュー」の切り替えタブを追加し、保存されている詳細メモ（最大 10,000 文字）を CommonMark + GFM（見出し・箇条書き・番号付きリスト・太字・斜体・打ち消し線・コード・引用・表・タスクリスト・リンク・画像のリンク文字化）として安全にプレビュー表示できるようにする。

**Architecture:** Markdown 内のリンク・画像 URL の安全性検査と画像ラベルの整形はドメイン層の純粋関数（`domain/nodes/nodeNoteMarkdownUrl.ts`）に置き、Markdown の描画は `react-markdown` + `remark-gfm` を包んだ `components/layout/NodeNoteMarkdown.tsx` が担う（生 HTML は解釈せず、画像は `<img>` を出さずリンク文字またはテキストにし、`<a>` の入れ子を Context で防ぐ）。タブの選択状態（`"edit" | "preview"`）は `NodeNoteEditor.tsx` が持ち、WAI-ARIA の `tablist` / `tab` / `tabpanel`（両パネルとも DOM に残し `hidden` で切り替え、roving tabindex と矢印・Home・End キー移動）とプレビュー切り替え時の `<textarea>` の `blur` 確定を `NodeNoteSection.tsx` が受け持つ。保存形式（V3 の `note?: string`）や既存のデバウンス反映・1 回の Undo 確定・`Escape` 取り消しは変更しない。

**Tech Stack:** Next.js（App Router、React Compiler 有効）、React 19、TypeScript、`react-markdown`、`remark-gfm`、Tailwind CSS v4、Jest（jsdom、`next/jest`）、Testing Library。

**設計書:** `docs/superpowers/specs/2026-11-17-node-note-markdown-design.md`（以下「設計書」）

## Global Constraints

- 作業ディレクトリ: `/Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-markdown-note`。テストと検証は `client` ディレクトリで実行する。
- TDD: 実装コードより先にテストを書き、失敗（RED）を確認してから実装する。
- **コミットしない。** コミットは開発フローの後段 `/commit-ja` で責務ごとに行う。`git add` もしない。各タスクは「検証（該当テストと lint・型チェック）」で終える。
- 保存形式は **V3 のまま**（`Node.note?: string`、上限 `NODE_NOTE_MAX_LENGTH = 10000`）。新しいノード属性は追加しない。
- URL の安全性検査（`nodeNoteMarkdownUrl.ts`）:
  - リンク（`toSafeNoteMarkdownLinkHref`）は **`http:`・`https:`・`mailto:` のみ**許可する。
  - 画像（`toSafeNoteMarkdownImageHref`）は **`http:`・`https:` のみ**許可する（`mailto:` は不可）。
  - 前後の空白を `trim()` し、空文字は `null`。
  - **入力（`trim` 後）の `length` が `NODE_NOTE_MAX_LENGTH`（10,000）を超える場合は `new URL` より先に `null` を返す（L-443）**。さらに **`new URL` 解析後の `href.length` にも同じ上限 `NODE_NOTE_MAX_LENGTH` を掛ける（L-836）**。
  - 制御文字（`U+0000`〜`U+001F`、`U+007F`〜`U+009F`）を含む場合は `null`。
  - 相対 URL（`/foo`、`./bar`、`#hash`）・スキーム無し（`example.com`）・`javascript:`・`data:`・`vbscript:`・`file:`・`blob:` などはすべて `null`。
  - `http:` / `https:` で資格情報（`username` または `password` が空でない）を含む場合は `null`（L-032）。
  - 成功時は正規化済みの `parsed.href` を返し、描画側はその文字列をそのまま `href` に使う（L-018・L-834）。
- Markdown 描画（`NodeNoteMarkdown.tsx`）:
  - `react-markdown` + `remark-gfm` を使い、`rehype-raw` は使わない（生 HTML はプレーンテキストとしてエスケープ表示）。
  - `urlTransform` には恒等関数 `(url: string) => url` を渡し、`components.a` と `components.img` で上記のドメイン関数を使って検証する。
  - リンク（`a`）は安全な URL のときだけ `<a href={safeHref} target="_blank" rel="noopener noreferrer">` を描き、`null` のときは `<span>{children}</span>` にする（空の `<a>` を作らない）。
  - 画像（`img`）は `<img>` 要素を一切出力しない。表示文字列は `formatNoteMarkdownImageLabel(alt)`（`alt` の `trim()` が空なら `"[画像]"`、非空なら `"[画像: " + trimmed + "]"`）。`<a>` の外側かつ `toSafeNoteMarkdownImageHref(src)` が非 `null` のときだけ `<a href={safeHref} target="_blank" rel="noopener noreferrer">{label}</a>` にし、それ以外（`<a>` の内側にある場合 `[![alt](img)](link)` を含む）は `<span>{label}</span>` にする（`<a>` の入れ子禁止。L-835）。
  - タスクリストの `<input type="checkbox">` は `disabled`・`readOnly`・`tabIndex={-1}` に固定する（L-157）。`type !== "checkbox"` の `<input>` は `null` を返す。
  - `const normalized = normalizeNodeNote(markdown)` が `undefined`（空文字または空白・改行のみ、末尾の孤立上位サロゲート除去後に空になるものを含む）のときは「メモはありません」を表示し、非空時は正規化後の `normalized` を `<ReactMarkdown>` に渡す（L-018・L-636）。
  - コードブロック（`<pre>`）や表（`<table>`）に `tabIndex` や独立スクロール（`overflow-x-auto`）を持たせず、折り返し（`whitespace-pre-wrap break-words` / `w-full table-fixed break-words`）でパネル幅に収める（フォーカスされた非対話要素での `Delete` キーによるノード削除事故を防ぐ。L-522）。
- タブ UI（`NodeNoteSection.tsx`・`NodeNoteEditor.tsx`）:
  - ノード未選択時（`editing === null`）はタブを出さず、従来どおり `disabled` の `<textarea>` だけを出す（L-157）。
  - ノード選択時は `role="tablist"`（`aria-label="詳細メモの表示切替"`）の中に「編集」「プレビュー」の 2 つの `<button type="button" role="tab">` のみを置く（L-395）。
  - 選択中タブは `aria-selected={true}`・`tabIndex={0}`、非選択タブは `aria-selected={false}`・`tabIndex={-1}`。`ArrowRight` / `ArrowLeft` / `Home` / `End`（修飾キーなし）で切り替えと `.focus()` を行う（L-552）。
  - 編集・プレビューの両 `role="tabpanel"` は常に DOM に残し、非選択側を `hidden` 属性で隠す（L-552）。ただし `<NodeNoteMarkdown>` は `activeMode === "preview"` のときだけ描画する（L-411）。
  - 「プレビュー」へ切り替える際、`<textarea>` にフォーカスがあれば先に `textarea.blur()` を呼んで未反映の下書きを即時確定させる（L-473）。
  - 文字数表示と上限の `role="status"` は両タブパネルの外（下）に常設する。
- テストでは `react-markdown` / `remark-gfm` をモックせず、`client/jest.config.ts` の `transformIgnorePatterns` を調整して実物を動かす（L-059・L-727）。
- 返答・コメント・ドキュメントはすべて日本語で書く。

---

### Task 1: Markdown URL の安全性検査・画像ラベル整形ドメイン（`nodeNoteMarkdownUrl.ts`）

**Files:**
- Create: `client/src/domain/nodes/nodeNoteMarkdownUrl.ts`
- Test: `client/src/domain/nodes/__tests__/nodeNoteMarkdownUrl.test.ts`（新規）

**Interfaces:**
- Consumes: `NODE_NOTE_MAX_LENGTH`（`@/domain/nodes/nodeNote`）
- Produces（`@/domain/nodes/nodeNoteMarkdownUrl`）:
  - `toSafeNoteMarkdownLinkHref(rawUrl: string): string | null`
  - `toSafeNoteMarkdownImageHref(rawUrl: string): string | null`
  - `formatNoteMarkdownImageLabel(alt: string | undefined): string`

- [x] **Step 1: 失敗するテストを書く**

`client/src/domain/nodes/__tests__/nodeNoteMarkdownUrl.test.ts` を新規作成する:

```typescript
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import {
  formatNoteMarkdownImageLabel,
  toSafeNoteMarkdownImageHref,
  toSafeNoteMarkdownLinkHref,
} from "@/domain/nodes/nodeNoteMarkdownUrl";

describe("toSafeNoteMarkdownLinkHref", () => {
  it.each<[string, string, string]>([
    ["https URL を正規化して返す", "https://example.com/docs", "https://example.com/docs"],
    ["http URL も許可する", "http://example.com/a", "http://example.com/a"],
    ["mailto URL も許可する", "mailto:user@example.com", "mailto:user@example.com"],
    ["大文字スキームとホストを小文字に正規化する", "HTTPS://EXAMPLE.COM/Path", "https://example.com/Path"],
    ["前後の空白と改行を削る", "  https://example.com/a\n\t ", "https://example.com/a"],
    [
      "括弧を含む URL（Wikipedia 形式）を途中で切らずに保持する（L-834）",
      "https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95)",
      "https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95)",
    ],
    [
      "未エンコードの括弧と日本語を含む URL も href として保持する（L-834）",
      "https://ja.wikipedia.org/wiki/Markdown_(記法)",
      "https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95)",
    ],
  ])("%s", (_title, input, expected) => {
    expect(toSafeNoteMarkdownLinkHref(input)).toBe(expected);
  });

  it.each<[string, string]>([
    ["空文字", ""],
    ["空白のみ", "   \n\t  "],
    ["javascript スキーム", "javascript:alert(1)"],
    ["大文字混じりの JavaScript スキーム", "JaVaScRiPt:alert(1)"],
    ["data スキーム", "data:text/html,<script>alert(1)</script>"],
    ["vbscript スキーム", "vbscript:msgbox(1)"],
    ["file スキーム", "file:///etc/passwd"],
    ["blob スキーム", "blob:https://example.com/550e8400-e29b-41d4-a716-446655440000"],
    ["相対パス（/始まり）", "/docs/intro"],
    ["相対パス（./始まり）", "./intro.md"],
    ["ページ内アンカーのみ", "#section-1"],
    ["スキーム無し", "example.com/path"],
    ["ユーザー名を含む https URL（L-032）", "https://user@example.com/"],
    ["ユーザー名とパスワードを含む https URL（L-032）", "https://user:pass@example.com/"],
    ["ユーザー名を含む http URL（L-032）", "http://admin:secret@example.com/"],
    ["途中に ASCII 制御文字（タブ）を含む URL", "java\tscript:alert(1)"],
    ["途中に NULL 文字を含む URL", "https://example.com/\u0000path"],
    ["途中に C1 制御文字（U+0085）を含む URL", "https://example.com/\u0085path"],
  ])("%s は null を返す", (_title, input) => {
    expect(toSafeNoteMarkdownLinkHref(input)).toBeNull();
  });

  it("入力長が NODE_NOTE_MAX_LENGTH（10,000 文字）ちょうどなら許可し、10,001 文字なら null を返す（L-443）", () => {
    const base = "https://example.com/";
    const exact = base + "a".repeat(NODE_NOTE_MAX_LENGTH - base.length);
    const over = exact + "a";

    expect(exact).toHaveLength(NODE_NOTE_MAX_LENGTH);
    expect(toSafeNoteMarkdownLinkHref(exact)).toBe(exact);
    expect(toSafeNoteMarkdownLinkHref(over)).toBeNull();
  });

  it("入力長が 10,000 文字以内でも、パーセントエンコード後の href が 10,000 文字を超えたら null を返す（L-836）", () => {
    // "あ" は UTF-8 で 3 バイト → "%E3%81%82"（9 文字）になる。1,200 文字の "あ" はエンコード後 10,800 文字
    const input = "https://example.com/" + "あ".repeat(1200);
    expect(input.length).toBeLessThan(NODE_NOTE_MAX_LENGTH);
    expect(toSafeNoteMarkdownLinkHref(input)).toBeNull();
  });
});

describe("toSafeNoteMarkdownImageHref", () => {
  it("https と http の URL を正規化して返す", () => {
    expect(toSafeNoteMarkdownImageHref("https://example.com/img.png")).toBe("https://example.com/img.png");
    expect(toSafeNoteMarkdownImageHref("http://example.com/img.png")).toBe("http://example.com/img.png");
  });

  it.each<[string, string]>([
    ["mailto は画像 URL として拒否する", "mailto:user@example.com"],
    ["javascript は拒否する", "javascript:alert(1)"],
    ["data URL は拒否する", "data:image/png;base64,iVBORw0KGgo="],
    ["資格情報つき URL は拒否する", "https://user:pass@example.com/img.png"],
    ["相対パスは拒否する", "/images/pic.png"],
  ])("%s", (_title, input) => {
    expect(toSafeNoteMarkdownImageHref(input)).toBeNull();
  });

  it("画像 URL も 10,000 文字超過およびエンコード後 10,000 文字超過で null を返す（L-443・L-836）", () => {
    const base = "https://example.com/";
    const exact = base + "a".repeat(NODE_NOTE_MAX_LENGTH - base.length);
    const over = exact + "a";
    const encodedOver = base + "あ".repeat(1200);

    expect(toSafeNoteMarkdownImageHref(exact)).toBe(exact);
    expect(toSafeNoteMarkdownImageHref(over)).toBeNull();
    expect(toSafeNoteMarkdownImageHref(encodedOver)).toBeNull();
  });
});

describe("formatNoteMarkdownImageLabel", () => {
  it("alt があれば前後の空白を削って [画像: alt] を返す", () => {
    expect(formatNoteMarkdownImageLabel("システム構成図")).toBe("[画像: システム構成図]");
    expect(formatNoteMarkdownImageLabel("  画面キャプチャ \n")).toBe("[画像: 画面キャプチャ]");
  });

  it("alt が空文字・空白のみ・undefined のときは [画像] を返す", () => {
    expect(formatNoteMarkdownImageLabel("")).toBe("[画像]");
    expect(formatNoteMarkdownImageLabel("   \t\n ")).toBe("[画像]");
    expect(formatNoteMarkdownImageLabel(undefined)).toBe("[画像]");
  });
});
```

- [x] **Step 2: テストを実行して失敗（RED）を確認する**

Run: `cd /Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-markdown-note/client && npx jest src/domain/nodes/__tests__/nodeNoteMarkdownUrl.test.ts`
Expected: `Cannot find module '@/domain/nodes/nodeNoteMarkdownUrl'` で FAIL。

- [x] **Step 3: `client/src/domain/nodes/nodeNoteMarkdownUrl.ts` を実装する**

```typescript
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";

const ALLOWED_NOTE_MARKDOWN_LINK_PROTOCOLS: ReadonlySet<string> = new Set([
  "http:",
  "https:",
  "mailto:",
]);

const ALLOWED_NOTE_MARKDOWN_IMAGE_PROTOCOLS: ReadonlySet<string> = new Set([
  "http:",
  "https:",
]);

// ASCII 制御文字（U+0000〜U+001F, U+007F）と C1 制御文字（U+0080〜U+009F）。
// no-control-regex 回避と既存実装（nodeTag.ts）との統一のためコード単位で判定する（L-018）
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

// Markdown プレビュー内のリンク・画像 URL を検証し、安全な正規化済み href だけを返す（L-018・L-032・L-443・L-836）
function normalizeSafeMarkdownUrl(
  rawUrl: string,
  allowedProtocols: ReadonlySet<string>,
): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || trimmed.length > NODE_NOTE_MAX_LENGTH) {
    return null;
  }
  if (hasControlCharacter(trimmed)) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!allowedProtocols.has(parsed.protocol)) {
    return null;
  }
  if (
    (parsed.protocol === "http:" || parsed.protocol === "https:")
    && (parsed.username !== "" || parsed.password !== "")
  ) {
    return null;
  }
  if (parsed.href.length > NODE_NOTE_MAX_LENGTH) {
    return null;
  }
  return parsed.href;
}

export function toSafeNoteMarkdownLinkHref(rawUrl: string): string | null {
  return normalizeSafeMarkdownUrl(rawUrl, ALLOWED_NOTE_MARKDOWN_LINK_PROTOCOLS);
}

export function toSafeNoteMarkdownImageHref(rawUrl: string): string | null {
  return normalizeSafeMarkdownUrl(rawUrl, ALLOWED_NOTE_MARKDOWN_IMAGE_PROTOCOLS);
}

export function formatNoteMarkdownImageLabel(alt: string | undefined): string {
  const trimmed = (alt ?? "").trim();
  return trimmed === "" ? "[画像]" : `[画像: ${trimmed}]`;
}
```

- [x] **Step 4: テスト・lint・型チェックを実行して GREEN を確認する**

Run: `cd /Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-markdown-note/client && npx jest src/domain/nodes/__tests__/nodeNoteMarkdownUrl.test.ts && npm run lint && npm run typecheck`
Expected: 全テスト PASS、lint・typecheck エラーなし。

---

### Task 2: `react-markdown` + `remark-gfm` の導入、Jest 設定調整、および `NodeNoteMarkdown` コンポーネント

**Files:**
- Modify: `client/package.json`, `client/package-lock.json`
- Modify: `client/jest.config.ts`
- Create: `client/src/components/layout/NodeNoteMarkdown.tsx`
- Test: `client/src/components/layout/__tests__/NodeNoteMarkdown.test.tsx`（新規）

**Interfaces:**
- Consumes: `normalizeNodeNote`（`@/domain/nodes/nodeNote`）、`formatNoteMarkdownImageLabel`, `toSafeNoteMarkdownImageHref`, `toSafeNoteMarkdownLinkHref`（`@/domain/nodes/nodeNoteMarkdownUrl`）、`react-markdown`、`remark-gfm`
- Produces（`@/components/layout/NodeNoteMarkdown`）:
  - `NodeNoteMarkdown({ markdown }: { markdown: string }): JSX.Element`

- [x] **Step 1: `react-markdown` と `remark-gfm` をインストールし、`client/jest.config.ts` を更新する**

1. `client` ディレクトリで `npm install react-markdown remark-gfm` を実行する（ネットワークが必要なため、サンドボックスで失敗した場合は `BypassSandbox: true` で実行する）。
2. `client/jest.config.ts` を更新し、`next/jest.js` が生成する `transformIgnorePatterns` のうち `/node_modules/` を除外するパターンを書き換え、ESM パッケージが SWC で変換されるようにする:

```typescript
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

const baseJestConfig = createJestConfig(config);

// next/jest は既定で node_modules を SWC 変換から除外するため、react-markdown / remark-gfm と
// その推移的 ESM パッケージをそのまま変換対象に通し、テストでモックせず実物を動かす（L-059・L-727）
const asyncJestConfig = async () => {
  const resolved = await baseJestConfig();
  return {
    ...resolved,
    transformIgnorePatterns: ["^.+\\.module\\.(css|sass|scss)$"],
  };
};

export default asyncJestConfig;
```

- [x] **Step 2: `NodeNoteMarkdown.test.tsx` に失敗するテストを書く**

`client/src/components/layout/__tests__/NodeNoteMarkdown.test.tsx` を新規作成する:

```tsx
import { render, screen } from "@testing-library/react";
import { NodeNoteMarkdown } from "@/components/layout/NodeNoteMarkdown";

describe("NodeNoteMarkdown", () => {
  it("空文字や空白・改行のみのときは「メモはありません」を表示する", () => {
    const { rerender } = render(<NodeNoteMarkdown markdown="" />);
    expect(screen.getByText("メモはありません")).toBeInTheDocument();

    rerender(<NodeNoteMarkdown markdown={"  \n\t  "} />);
    expect(screen.getByText("メモはありません")).toBeInTheDocument();
  });

  it("見出し・太字・斜体・打ち消し線・箇条書き・番号付きリスト・引用・コード・水平線・表・タスクリストを描画する", () => {
    const md = [
      "# 見出し1",
      "## 見出し2",
      "### 見出し3",
      "",
      "段落の**太字**と*斜体*と~~打ち消し~~と`inlineCode`。",
      "",
      "- 箇条A",
      "- 箇条B",
      "",
      "1. 番号1",
      "2. 番号2",
      "",
      "> 引用文",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "---",
      "",
      "| 列1 | 列2 |",
      "| --- | --- |",
      "| 値A | 値B |",
      "",
      "- [ ] 未完了タスク",
      "- [x] 完了タスク",
    ].join("\n");

    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    expect(screen.getByRole("heading", { level: 1, name: "見出し1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "見出し2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "見出し3" })).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("太字");
    expect(container.querySelector("em")).toHaveTextContent("斜体");
    expect(container.querySelector("del")).toHaveTextContent("打ち消し");
    expect(container.querySelector("p code")).toHaveTextContent("inlineCode");
    expect(container.querySelector("pre code")).toHaveTextContent("const x = 1;");
    expect(container.querySelector("blockquote")).toHaveTextContent("引用文");
    expect(container.querySelector("hr")).not.toBeNull();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "列1" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "値A" })).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[0]).toBeDisabled();
    expect(checkboxes[0]).toHaveAttribute("tabindex", "-1");
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[1]).toBeDisabled();
    expect(checkboxes[1]).toHaveAttribute("tabindex", "-1");
  });

  it("http / https / mailto のリンクを target=_blank かつ rel=noopener noreferrer で描画し、括弧付き URL も保持する（L-834）", () => {
    const md = [
      "[公式サイト](https://example.com/docs)",
      "[連絡先](mailto:info@example.com)",
      "[Wiki](https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95))",
    ].join("\n\n");

    render(<NodeNoteMarkdown markdown={md} />);

    const docsLink = screen.getByRole("link", { name: "公式サイト" });
    expect(docsLink).toHaveAttribute("href", "https://example.com/docs");
    expect(docsLink).toHaveAttribute("target", "_blank");
    expect(docsLink).toHaveAttribute("rel", "noopener noreferrer");

    const mailLink = screen.getByRole("link", { name: "連絡先" });
    expect(mailLink).toHaveAttribute("href", "mailto:info@example.com");
    expect(mailLink).toHaveAttribute("target", "_blank");
    expect(mailLink).toHaveAttribute("rel", "noopener noreferrer");

    const wikiLink = screen.getByRole("link", { name: "Wiki" });
    expect(wikiLink).toHaveAttribute(
      "href",
      "https://ja.wikipedia.org/wiki/Markdown_(%E8%A8%98%E6%B3%95)",
    );
  });

  it("危険なスキーム・相対 URL・資格情報つき URL は <a> 要素を作らず文字だけを表示する（L-032・L-727）", () => {
    const md = [
      "[JSリンク](javascript:alert(1))",
      "[山括弧JS](<javascript:alert(1)>)",
      "[実体参照JS](jav&#x09;ascript:alert(1))",
      "[Dataリンク](data:text/html,<script>alert(1)</script>)",
      "[VBリンク](vbscript:msgbox)",
      "[相対リンク](/internal/path)",
      "[秘密リンク](https://user:pass@example.com/secret)",
    ].join("\n\n");

    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText("JSリンク")).toBeInTheDocument();
    expect(screen.getByText("山括弧JS")).toBeInTheDocument();
    expect(screen.getByText("実体参照JS")).toBeInTheDocument();
    expect(screen.getByText("Dataリンク")).toBeInTheDocument();
    expect(screen.getByText("VBリンク")).toBeInTheDocument();
    expect(screen.getByText("相対リンク")).toBeInTheDocument();
    expect(screen.getByText("秘密リンク")).toBeInTheDocument();
  });

  it("生 HTML（script / img / iframe / a など）を DOM 要素として解釈せず、テキストとして表示する（L-727）", () => {
    const md = [
      "<script>window.__xss = true;</script>",
      '<img src="x" onerror="alert(1)">',
      '<iframe src="https://example.com"></iframe>',
      '<a href="javascript:alert(1)">悪意あるHTMLリンク</a>',
    ].join("\n\n");

    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText(/<script>window\.__xss = true;<\/script>/)).toBeInTheDocument();
  });

  it("画像記法は <img> を描画せず、安全な http/https URL ならリンク文字、それ以外はテキストとして表示する", () => {
    const md = [
      "![システム構成図](https://example.com/arch.png)",
      "![](https://example.com/no-alt.png)",
      "![危険な画像](javascript:alert(1))",
      "![データ画像](data:image/png;base64,aaaa)",
    ].join("\n\n");

    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    expect(container.querySelector("img")).toBeNull();
    const archLink = screen.getByRole("link", { name: "[画像: システム構成図]" });
    expect(archLink).toHaveAttribute("href", "https://example.com/arch.png");
    expect(archLink).toHaveAttribute("target", "_blank");
    expect(archLink).toHaveAttribute("rel", "noopener noreferrer");

    const noAltLink = screen.getByRole("link", { name: "[画像]" });
    expect(noAltLink).toHaveAttribute("href", "https://example.com/no-alt.png");

    expect(screen.getByText("[画像: 危険な画像]").tagName).toBe("SPAN");
    expect(screen.getByText("[画像: データ画像]").tagName).toBe("SPAN");
  });

  it("リンクの中に画像が書かれた場合（[![alt](img)](link)）に <a> を入れ子にしない（L-835）", () => {
    const md = "[![バナー](https://example.com/banner.png)](https://example.com/landing)";
    const { container } = render(<NodeNoteMarkdown markdown={md} />);

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://example.com/landing");
    expect(links[0]).toHaveTextContent("[画像: バナー]");
    expect(links[0].querySelector("a")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
```

- [x] **Step 3: テストを実行して失敗（RED）を確認する**

Run: `cd /Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-markdown-note/client && npx jest src/components/layout/__tests__/NodeNoteMarkdown.test.tsx`
Expected: `Cannot find module '@/components/layout/NodeNoteMarkdown'` で FAIL。

- [x] **Step 4: `client/src/components/layout/NodeNoteMarkdown.tsx` を実装する**

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeNodeNote } from "@/domain/nodes/nodeNote";
import {
  formatNoteMarkdownImageLabel,
  toSafeNoteMarkdownImageHref,
  toSafeNoteMarkdownLinkHref,
} from "@/domain/nodes/nodeNoteMarkdownUrl";

type NodeNoteMarkdownProps = {
  markdown: string;
};

const REMARK_PLUGINS = [remarkGfm];

// 既定の urlTransform は危険スキームを空文字 "" に変えて <a href=""> を残すため、
// 恒等関数で元の文字列を渡し、components.a / components.img で検証して <span> へ落とす（L-018・L-032）
const identityUrlTransform = (url: string): string => url;

// [![alt](img)](link) のように <a> の内側に画像があるとき、<a> の中に <a> を入れ子にしないための文脈（L-835）
const InsideMarkdownLinkContext = createContext(false);

const LINK_CLASS_NAME =
  "break-all text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300";

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const safeHref = typeof href === "string" ? toSafeNoteMarkdownLinkHref(href) : null;
  if (safeHref === null) {
    return <span>{children}</span>;
  }
  return (
    <InsideMarkdownLinkContext.Provider value={true}>
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS_NAME}
      >
        {children}
      </a>
    </InsideMarkdownLinkContext.Provider>
  );
}

function MarkdownImage({ src, alt }: { src?: string | Blob; alt?: string }) {
  const isInsideLink = useContext(InsideMarkdownLinkContext);
  const label = formatNoteMarkdownImageLabel(alt);
  if (isInsideLink) {
    return <span>{label}</span>;
  }
  const safeHref = typeof src === "string" ? toSafeNoteMarkdownImageHref(src) : null;
  if (safeHref === null) {
    return <span className="text-zinc-600 dark:text-zinc-400">{label}</span>;
  }
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS_NAME}
    >
      {label}
    </a>
  );
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
  img: ({ src, alt }) => <MarkdownImage src={src} alt={alt} />,
  input: ({ type, checked }) => {
    if (type !== "checkbox") return null;
    return (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled
        readOnly
        tabIndex={-1}
        className="mr-1.5 align-middle"
      />
    );
  },
  h1: ({ children }) => (
    <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{children}</h6>
  ),
  p: ({ children }) => (
    <p className="leading-relaxed whitespace-pre-wrap break-words">{children}</p>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="break-words">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="whitespace-pre-wrap break-words rounded-md bg-zinc-100 p-2 font-mono text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <table className="w-full table-fixed border-collapse text-xs">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-left font-semibold break-words dark:border-zinc-600 dark:bg-zinc-900">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-zinc-300 px-2 py-1 break-words dark:border-zinc-600">
      {children}
    </td>
  ),
  hr: () => <hr className="border-zinc-200 dark:border-zinc-700" />,
  del: ({ children }) => (
    <del className="text-zinc-500 line-through dark:text-zinc-400">{children}</del>
  ),
};

export function NodeNoteMarkdown({ markdown }: NodeNoteMarkdownProps) {
  const normalized = normalizeNodeNote(markdown);
  if (normalized === undefined) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">メモはありません</p>;
  }
  return (
    <div className="flex flex-col gap-2 break-words text-sm text-zinc-800 dark:text-zinc-100">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        urlTransform={identityUrlTransform}
        components={MARKDOWN_COMPONENTS}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
```

- [x] **Step 5: テスト・lint・型チェック・tailwind:scan を実行して GREEN を確認する**

Run: `cd /Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-markdown-note/client && npx jest src/components/layout/__tests__/NodeNoteMarkdown.test.tsx && npm run tailwind:scan && npm run lint && npm run typecheck`
Expected: 全テスト PASS、エラーなし。

---

### Task 3: 詳細メモ節の「編集」「プレビュー」切り替えタブ（`NodeNoteSection.tsx`・`NodeNoteEditor.tsx`）とページ結合テスト

**Files:**
- Modify: `client/src/components/layout/NodeNoteSection.tsx`
- Modify: `client/src/components/layout/NodeNoteEditor.tsx`
- Modify: `client/src/components/layout/__tests__/NodeNoteSection.test.tsx`
- Modify: `client/src/components/layout/__tests__/NodeNoteEditor.test.tsx`
- Modify: `client/src/components/layout/__tests__/NodeDetailPanel.test.tsx`
- Modify: `client/src/app/__tests__/pageNodeNote.test.tsx`

**Interfaces:**
- `NodeNoteSection.tsx`:
  - `export type NodeNoteViewMode = "edit" | "preview"`
  - `NodeNoteSectionProps`: 既存の `targetLabel`・`selectionCount`・`editing` に加え、`mode?: NodeNoteViewMode`（既定 `"edit"`）と `onModeChange?: (mode: NodeNoteViewMode) => void` を受ける。
- `NodeNoteEditor.tsx`:
  - `const [mode, setMode] = useState<NodeNoteViewMode>("edit")` を持ち、`NodeNoteSection` に `mode={mode}` と `onModeChange={setMode}` を明示的に渡す（L-060）。

- [x] **Step 1: `NodeNoteSection.test.tsx`・`NodeNoteEditor.test.tsx`・`NodeDetailPanel.test.tsx`・`pageNodeNote.test.tsx` に失敗するテストを追加する**

1. `client/src/components/layout/__tests__/NodeNoteSection.test.tsx` に以下を追加する:
   - 未選択（`editing === null`）のときは `role="tablist"` を描画しないこと。
   - 選択時（`editing !== null`）は `role="tablist"`（名前「詳細メモの表示切替」）と「編集」「プレビュー」の 2 つの `role="tab"`、および対応する 2 つの `role="tabpanel"` が常に DOM にあり、初期状態（`mode="edit"`）では「編集」タブが `aria-selected="true"`・`tabIndex={0}`、「プレビュー」タブが `aria-selected="false"`・`tabIndex={-1}`、プレビューの `tabpanel` が `hidden` であること（L-552）。
   - `mode="preview"` を渡すと、「プレビュー」タブが `aria-selected="true"`・`tabIndex={0}` になり、プレビューの `tabpanel` が表示されて Markdown（見出しなど）が描かれ、編集の `tabpanel` は `hidden` のまま DOM に残り、文字数表示（`N / 10,000 文字`）も引き続き見えること。
   - `tablist` で `ArrowRight` / `ArrowLeft` / `Home` / `End` を押すと `onModeChange` が呼ばれ、移動先のタブにフォーカスが移ること。`Alt+ArrowRight` など修飾キー付きでは切り替わらないこと。
   - `<textarea>` にフォーカスがある状態で「プレビュー」タブを押すと、先に `<textarea>` の `onBlur` が呼ばれてから `onModeChange("preview")` が呼ばれること（L-473）。

2. `client/src/components/layout/__tests__/NodeNoteEditor.test.tsx` に以下を追加する:
   - `useNodeNoteEditing` は `onBlur` の `flush()` 後に `replaceDraft(null)` を呼んで親の `node.note` を表示するため、既存の `setup()`（`node.note` を更新しないモック）ではなく、`onPreviewNote` で `note` state を更新して `NodeNoteEditor` を再レンダリングするステートフルな親ラッパーを用意する。
   - `jest.useFakeTimers()` 環境下で `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })` を用い、`<textarea>` に入力した直後（300ms デバウンス満了前）に「プレビュー」タブをクリックして実際のイベント順（`mousedown` → `blur` → `click`）を通すと、即座に `onPreviewNote` と `lease.finish` が 1 回ずつ呼ばれて確定し、プレビューパネルに Markdown の見出しが表示されること、さらに「編集」タブへ戻すと `<textarea>` に同じ値が残っていることを確認する（L-473・L-737）。
   - あわせて、`fireEvent.click` で `<textarea>` にフォーカスが残ったまま「プレビュー」タブを押した場合も、`selectMode` 内の `textareaRef.current.blur()` フォールバック経路により同じように確定してプレビューに表示されることを確認する。

3. `client/src/components/layout/__tests__/NodeDetailPanel.test.tsx` に以下を追加する:
   - 「プレビュー」タブに切り替えた後、選択ノードの `id` または `documentRevision` が変わると、タブが「編集」（`aria-selected="true"`）に戻ること（L-588）。

4. `client/src/app/__tests__/pageNodeNote.test.tsx` に以下を追加する:
   - メモに Markdown（`# 概要\n\n- 項目1\n\n[参考](https://example.com/ref)\n\n![構成図](https://example.com/diagram.png)`）を入力して「プレビュー」タブへ切り替えると、見出し・箇条書き・リンク・画像のリンク文字（`[画像: 構成図]`）が整形表示され、ヘッダーの「元に戻す」1 回で変更前のメモに戻り、かつタブやプレビュー内のリンクにフォーカスがある状態で `Delete` / `Backspace` を押しても選択中のノードが削除されないこと（L-522）。

- [x] **Step 2: テストを実行して失敗（RED）を確認する**

Run: `cd /Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-markdown-note/client && npx jest src/components/layout/__tests__/NodeNoteSection.test.tsx src/components/layout/__tests__/NodeNoteEditor.test.tsx src/components/layout/__tests__/NodeDetailPanel.test.tsx src/app/__tests__/pageNodeNote.test.tsx`
Expected: 新しく追加したタブ・プレビュー関連のテストが FAIL。

- [x] **Step 3: `NodeNoteSection.tsx` と `NodeNoteEditor.tsx` を実装する**

`client/src/components/layout/NodeNoteSection.tsx`:

```tsx
import { useId, useRef, type KeyboardEvent } from "react";
import { NodeNoteMarkdown } from "@/components/layout/NodeNoteMarkdown";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import { NODE_NOTE_MAX_LENGTH, formatNodeNoteLength } from "@/domain/nodes/nodeNote";
import type { NodeNoteEditing } from "@/hooks/useNodeNoteEditing";

export type NodeNoteViewMode = "edit" | "preview";

type NodeNoteSectionProps = {
  // 対象ノードのラベル。未選択のときは null
  targetLabel: string | null;
  // 選択件数（MapEditor の importanceTargetIds の件数。アウトライン表示では主選択だけなので最大 1）
  selectionCount: number;
  // 未選択のときは null（テキスト欄を無効にする）
  editing: NodeNoteEditing | null;
  // 表示モード（未選択時はタブを出さないため使わない。NodeNoteEditor からは明示的に渡す）
  mode?: NodeNoteViewMode;
  onModeChange?: (mode: NodeNoteViewMode) => void;
};

const TAB_BASE_CLASS =
  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const ACTIVE_TAB_CLASS = `${TAB_BASE_CLASS} bg-blue-600 text-white`;
const INACTIVE_TAB_CLASS = `${TAB_BASE_CLASS} bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600`;

// 詳細メモの表示だけを受け持つ（状態と副作用は持たない。ID と要素参照にだけ useId / useRef を使う）。値とハンドラは NodeNoteEditor が渡す
export function NodeNoteSection({
  targetLabel,
  selectionCount,
  editing,
  mode = "edit",
  onModeChange,
}: NodeNoteSectionProps) {
  const headingId = useId();
  const textareaId = useId();
  const countId = useId();
  const editTabId = useId();
  const previewTabId = useId();
  const editPanelId = useId();
  const previewPanelId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTabRef = useRef<HTMLButtonElement>(null);
  const previewTabRef = useRef<HTMLButtonElement>(null);

  const length = editing?.length ?? 0;
  const activeMode: NodeNoteViewMode = editing === null ? "edit" : mode;

  // プレビューへ切り替える際、textarea にフォーカスが残っていれば先に blur して未反映の下書きを確定させる（L-473）
  const selectMode = (nextMode: NodeNoteViewMode) => {
    if (nextMode === "preview" && textareaRef.current !== null && document.activeElement === textareaRef.current) {
      textareaRef.current.blur();
    }
    if (nextMode !== activeMode) {
      onModeChange?.(nextMode);
    }
  };

  const handleTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let nextMode: NodeNoteViewMode | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      nextMode = activeMode === "edit" ? "preview" : "edit";
    } else if (event.key === "Home") {
      nextMode = "edit";
    } else if (event.key === "End") {
      nextMode = "preview";
    }
    if (nextMode === null) return;
    event.preventDefault();
    selectMode(nextMode);
    const targetTab = nextMode === "edit" ? editTabRef.current : previewTabRef.current;
    targetTab?.focus();
  };

  const textareaElement = (
    <>
      {/* 見出しと同じ文言なので、ラベルは読み上げ用にだけ置く */}
      <label htmlFor={textareaId} className="sr-only">詳細メモ</label>
      <textarea
        ref={textareaRef}
        id={textareaId}
        rows={8}
        maxLength={NODE_NOTE_MAX_LENGTH}
        disabled={editing === null}
        placeholder="このノードの詳細な説明を書けます"
        value={editing?.value ?? ""}
        aria-describedby={countId}
        onFocus={editing?.onFocus}
        onChange={(event) => editing?.onChange(event.target.value)}
        onBlur={editing?.onBlur}
        onKeyDown={editing?.onKeyDown}
        onCompositionStart={editing?.onCompositionStart}
        onCompositionEnd={editing?.onCompositionEnd}
        className="w-full resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:disabled:bg-zinc-800"
      />
    </>
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">詳細メモ</h2>
      {targetLabel === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">対象ノード</span>
          <p
            className="line-clamp-3 break-words text-sm text-zinc-800 dark:text-zinc-100"
            title={targetLabel || undefined}
          >
            {getNodeDisplayLabel(targetLabel)}
          </p>
        </div>
      )}
      {selectionCount >= 2 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {`${selectionCount} 件選択中。主選択のノードのメモを編集します`}
        </p>
      )}
      {editing === null ? (
        textareaElement
      ) : (
        <>
          <div
            role="tablist"
            aria-label="詳細メモの表示切替"
            onKeyDown={handleTabListKeyDown}
            className="flex gap-1"
          >
            <button
              ref={editTabRef}
              id={editTabId}
              type="button"
              role="tab"
              aria-selected={activeMode === "edit"}
              aria-controls={editPanelId}
              tabIndex={activeMode === "edit" ? 0 : -1}
              onClick={() => selectMode("edit")}
              className={activeMode === "edit" ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS}
            >
              編集
            </button>
            <button
              ref={previewTabRef}
              id={previewTabId}
              type="button"
              role="tab"
              aria-selected={activeMode === "preview"}
              aria-controls={previewPanelId}
              tabIndex={activeMode === "preview" ? 0 : -1}
              onClick={() => selectMode("preview")}
              className={activeMode === "preview" ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS}
            >
              プレビュー
            </button>
          </div>
          <div
            id={editPanelId}
            role="tabpanel"
            aria-labelledby={editTabId}
            hidden={activeMode !== "edit"}
          >
            {textareaElement}
          </div>
          <div
            id={previewPanelId}
            role="tabpanel"
            aria-labelledby={previewTabId}
            hidden={activeMode !== "preview"}
            className="min-h-40 rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {activeMode === "preview" ? <NodeNoteMarkdown markdown={editing.value} /> : null}
          </div>
        </>
      )}
      <p id={countId} className="text-xs text-zinc-500 dark:text-zinc-400">
        {`${formatNodeNoteLength(length)} / ${formatNodeNoteLength(NODE_NOTE_MAX_LENGTH)} 文字`}
      </p>
      {/* ライブリージョンは常に描画し、中身だけを替える */}
      <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
        {editing?.isAtLimit === true ? "上限に達しました" : ""}
      </p>
    </section>
  );
}
```

`client/src/components/layout/NodeNoteEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { NodeNoteSection, type NodeNoteViewMode } from "@/components/layout/NodeNoteSection";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { useNodeNoteEditing } from "@/hooks/useNodeNoteEditing";
import type { Node } from "@/types/node";

type NodeNoteEditorProps = {
  node: Pick<Node, "id" | "label" | "note">;
  selectionCount: number;
  onPreviewNote: (id: number, note: string) => boolean;
  onBeginNoteEdit: () => MapHistoryGroupLease;
};

// 選択中のノードの詳細メモの編集。NodeDetailPanel が対象の ID と documentRevision を key にして作り直す
// （古い下書きや表示モードを別のノード・新しい文書へ引き継がない。L-588）
export function NodeNoteEditor({ node, selectionCount, onPreviewNote, onBeginNoteEdit }: NodeNoteEditorProps) {
  const [mode, setMode] = useState<NodeNoteViewMode>("edit");
  const editing = useNodeNoteEditing({
    nodeId: node.id,
    note: node.note,
    previewNote: onPreviewNote,
    beginGroup: onBeginNoteEdit,
  });
  return (
    <NodeNoteSection
      targetLabel={node.label}
      selectionCount={selectionCount}
      editing={editing}
      mode={mode}
      onModeChange={setMode}
    />
  );
}
```

- [x] **Step 4: テスト・lint・型チェック・tailwind:scan を実行して GREEN を確認する**

Run: `cd /Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-markdown-note/client && npx jest src/components/layout/__tests__/NodeNoteSection.test.tsx src/components/layout/__tests__/NodeNoteEditor.test.tsx src/components/layout/__tests__/NodeDetailPanel.test.tsx src/app/__tests__/pageNodeNote.test.tsx && npm run tailwind:scan && npm run lint && npm run typecheck`
Expected: 全テスト PASS、エラーなし。

---

### Task 4: ドキュメント・ロードマップ・ブラウザテスト手順書の更新と全体検証

**Files:**
- Modify: `docs/specifications/features.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `README.md`, `client/README.md`, `docs/README.md`
- Modify: `ROADMAP.md`

- [x] **Step 1: `docs/specifications/features.md` を更新する**

- 冒頭（3 行目付近）の「詳細メモ、URLの添付、タグを含む」を「詳細メモ（Markdownプレビュー対応）、URLの添付、タグを含む」に更新する。
- 1.1 節「フェーズ別機能マトリクス」の Phase 18 行（68 行目付近）を、詳細メモ・Markdownメモ（候補053）・URLの添付・タグが完了した実態に合わせて更新する（「（プレーンテキスト、最大 10,000 文字）」を編集・プレビュー切替による Markdown 表示対応の説明に改める）。
- 24 章「## 24. 詳細メモ」（2409 行目付近）:
  - 導入文を「Phase 18・候補011 / 候補053。キャンバスには短い見出し（ラベル）だけを置き、長い説明は右パネル「ノードの詳細」の**詳細メモ**に保存します。ノード選択時は「編集」「プレビュー」タブを切り替え、見出し・箇条書き・コード・表・タスクリスト・リンクなどの Markdown（CommonMark + GFM）として整形表示できます（生 HTML は解釈しません）。」に更新する。
  - 24.1 の表に「表示切替（編集 / プレビュー）」と「Markdown プレビュー（候補053）」の行を追加し、WAI-ARIA タブ構成（`role="tablist"` / `role="tab"` / `role="tabpanel"`、矢印・Home・End キー操作、未選択時はタブ非表示）、対応記法（CommonMark + GFM、タスクリストは表示専用、画像は読み込まず `[画像: alt]` / `[画像]` のリンク文字またはテキスト、リンクは `http:` / `https:` / `mailto:` のみ `target="_blank" rel="noopener noreferrer"`、危険スキームや資格情報入り URL はリンク化しない、生 HTML はプレーンテキスト表示、空メモは「メモはありません」）、プレビュー切り替え時の即時確定を記載する。
  - 24.6「検証範囲と対象外」に `nodeNoteMarkdownUrl.test.ts`・`NodeNoteMarkdown.test.tsx` と実ブラウザ確認 AI 節を追記し、対象外から「Markdown の描画（候補053）」を除いて「WYSIWYG エディタ、画像の実体読み込み、生 HTML の解釈」を明記する。
- 25.6 節（2541 行目付近）・26.7 節（2624 行目付近）の対象外一覧に残っている「Markdown メモ（候補053）」の文言を削除して他章との記述を揃える（L-203）。

- [x] **Step 2: `docs/architecture/overview.md` を更新する**

- 1.3 節「技術スタックとコンパイラ・ビルド設定」の表（69〜79 行目付近）に `react-markdown` + `remark-gfm`（詳細メモの安全な Markdown プレビュー描画）を追記する。
- 2.1 節の UI Layer（124 行目・150 行目付近）について、`src/components/layout/` のファイル数を 68 → 69 ファイルにし、`NodeDetailPanel.tsx` の項にある `NodeNoteSection.tsx` / `NodeNoteEditor.tsx` の説明を「編集」「プレビュー」タブ切替と状態保持（`NodeNoteEditor` が表示モードを持ち、ノード ID と `documentRevision` で初期化）に合わせて更新し、`NodeNoteMarkdown.tsx`（`react-markdown` + `remark-gfm` による Markdown プレビュー、リンク・画像の安全性検証と `<a>` の入れ子防止）を追記する。
- 2.1 節の Domain Layer（297〜298 行目・331 行目付近）について、`src/domain/` のファイル数を 107 → 108 ファイル（`domain/nodes/` を 55 → 56 ファイル）にし、`nodeNoteMarkdownUrl.ts`（Markdown プレビュー内のリンク・画像 URL の検証と正規化、画像ラベル整形）を追記する。
- 4.1 節「#### 詳細メモ（候補011）の流れ」（843〜847 行目）を見出しごと「#### 詳細メモ・Markdownメモ（候補011・候補053）の流れ」へ更新し、責務の分担に `nodeNoteMarkdownUrl.ts` と `NodeNoteMarkdown` を、動作説明に編集・プレビュー切り替え時の `blur` 確定とモードのリセットを追記する。
- 5.1 節の `client/jest.config.ts` の説明（956 行目付近）に、ESM パッケージ（`react-markdown` / `remark-gfm` 等）を SWC 変換に通す `transformIgnorePatterns` 設定について追記する。

- [x] **Step 3: `docs/testing/browser-test-cases.md` に AI 節を追加する**

- AH 節の直後（「## 結果の集計」の前）に「## AI. Markdownメモ（Phase 18・候補053）」を追加し、AI-01（見出し・箇条書き・コード・表・タスクリストのプレビュー表示）、AI-02（リンクの新しいタブ遷移と括弧付き URL）、AI-03（危険スキーム・資格情報つき URL・生 HTML の無害化）、AI-04（画像の非読み込みとリンク文字化・リンク内画像の入れ子防止）、AI-05（編集からプレビューへの切り替えによる即時確定と 1 回の Undo / Redo）、AI-06（タブのキーボード操作 ArrowLeft/Right/Home/End と Delete キーでのノード非削除）、AI-07（空メモの表示・ノード切り替え・アウトライン表示・ダークモード）を記載する。
- 「結果の集計」の表に AI 節（未実施・7 件）の行を追加する。

- [x] **Step 4: `README.md`・`client/README.md`・`docs/README.md`・`ROADMAP.md` を更新する**

- `README.md`:「21. **詳細メモ（Phase 18 の候補011・候補053）**」に Markdown プレビュー（「編集」「プレビュー」タブ、CommonMark + GFM、安全なリンクと画像のリンク文字化、生 HTML 非解釈、実ブラウザ確認 AI 節）を追記する。
- `client/README.md`: 詳細メモの項に候補053（`NodeNoteMarkdown`・`nodeNoteMarkdownUrl.ts`、「編集」「プレビュー」タブ切り替え）を追記する。
- `docs/README.md`:
  - 36 行目付近の「Phase 18 の詳細メモ・URLの添付・タグを含む」に Markdown メモ（24 章）を追記する。
  - 87 行目付近の「Phase 18 の詳細メモは AF 節・URLの添付は AG 節・タグは AH 節」に「・Markdownメモは AI 節」を足す。
  - 93 行目付近の Phase 18 の完了項目に「Markdownメモ」を加え、次の未完了項目を Phase 18 の「出典情報」にする。
- `ROADMAP.md`:
  - `- [ ] **Markdownメモ**（候補053）` を `- [x] **Markdownメモ**（候補053）` に更新する。
  - 「現在地」のドキュメント体系の段落と Phase 18 の段落に候補053「Markdownメモ」の完了内容（編集・プレビューのタブ切替、CommonMark + GFM、安全なリンク・画像のリンク文字化、生 HTML 非解釈、AI 節は未実施）を追記し、「次の未完了項目は Phase 18 の「出典情報」（候補054）。」に更新する。

- [x] **Step 5: `cd client && npm run verify` を実行して全体検証を通す**

Run: `cd /Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-markdown-note/client && npm run verify`
Expected: `tailwind:scan`・`lint`・`typecheck`・`test`・`build` がすべて成功する。
