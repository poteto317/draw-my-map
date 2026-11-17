# URLの添付（候補012）実装プラン

> **状態:** 作成済み（サブエージェントレビュー前）。
>
> **For agentic workers:** このリポジトリでは AGENTS.md の規定により、サブエージェント駆動（`superpowers:subagent-driven-development`）で進める。インライン実行は使わない。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ノードに http / https の URL を最大 10 件付けられるようにし、右パネル「ノードの詳細」の「リンク」節で追加・削除・開く操作を提供する。URL は保存・JSON・Undo / Redo・複製・コピー＆貼り付け・別マップへの枝の移動・分割・統合と整合し、キャンバスに「リンクあり」の印を描き、ノード検索で URL からも見つかる。

**Architecture:** URL の規則（検証・正規化・追加・削除・文言）は純関数（`domain/nodes/nodeLink.ts`）に集め、保存形式の検証（`mapDocumentNodeLinks.ts`）・書き出し（`mapDocumentNodeProjection.ts`）・競合と履歴の比較（`mapConflict.ts`・`mapHistory.ts`）・統合（`nodeMerge.ts` ほか）・検索（`nodeLabelSearch.ts`）・描画（`renderMapNodes.ts`）がそれを使う。更新経路は `useNodes.addNodeLink` / `removeNodeLink`（`applyNonStructuralChange` で 1 回の履歴）だけで、表示とフォームの状態は `NodeLinksSection` が持ち、`NodeDetailPanel` が「メモ → リンク → イラスト」の順に置き、`MapEditor` が配線する。

**Tech Stack:** Next.js（App Router、React Compiler 有効）、React 19、TypeScript、Jest（jsdom、`next/jest`）、Testing Library、Pixi.js v8。

**設計書:** `docs/superpowers/specs/2026-11-17-node-links-design.md`（以下「設計書」）

## Global Constraints

- 作業ディレクトリ: `/Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-node-links`。テストと検証は `client` ディレクトリで実行する。
- TDD: 実装コードより先にテストを書き、失敗（RED）を確認してから実装する。RED の確認では、実装前でも通る「現状固定」のテストと、失敗するテストを分けて扱う（各タスクの Step 2 に書く）。
- **コミットしない。** コミットは開発フローの後段 `/commit-ja` で責務ごとに行う。`git add` もしない。各タスクは「検証（該当テストと lint・型チェック）」で終える。
- 数: 1 ノードあたり **10 件**（`NODE_LINKS_MAX_COUNT = 10`）。
- 長さ: URL 1 件 **2,048 文字**（`NODE_LINK_MAX_LENGTH = 2048`。`string.length`）。**入力（前後の空白を削った後）の `length` を解析より先に判定し（L-443）、解析した後の `href` の `length` にも同じ上限を掛ける**。保存した値は常に上限内で、読み込みで拒否されない。
- 許可するスキームは **`http:` と `https:` のみ**。`javascript:`・`data:`・`file:`・`mailto:` などは保存・読み込み・貼り付けのすべてで拒否する。相対 URL・スキーム無しは拒否し、スキームを補わない。
- **資格情報つき**（`username` / `password` が空でない）の URL は拒否する（L-032）。
- 検証と保存と「開く」は**同じ `new URL(...).href`** を使う（L-018）。保存する値は正規化した `URL.href` だけ。
- 項目: `Node.links?: readonly string[]`（読み取り専用の配列。`push` などで書き換えない）。保存形式は **V3 のまま**（版は上げない。`note` と同じ）。リンクの無いノードでは**項目ごと持たない**（空配列も `links: undefined` も残さない）。V1 / V2 の `links` は無視する。統合の計画・保存の正規化の戻り値・`ExportedNode` も `readonly string[]` にそろえる。
- 重複: 同じノードの中で正規化した URL が同じものは追加できない（`duplicate`）。読み込みでは後のものを捨てる。
- 統合: 選択中のノードの `links` を**配列順**に連結し、最初に出てきたものを残して重複を除く。重複を除いて **10 件を超えたら `links-too-many`**（検査は `note-too-long` の後。黙って切り詰めない）。文言「URLをまとめると件数の上限（10 件）を超えるため、統合できません。」。プレビューは「URL: {件数} 件（重複 {M} 件を除く）」（重複 0 件なら括弧なし。URL 本文は出さない）。
- 分割は元のノード（最初の断片）に `links` を残し、新しい断片は持たない。複製・貼り付け・別マップへの枝の移動は `links` を写す（参照の共有でよい）。親の挿入で作る新しい親は持たない。
- 履歴: 追加・削除は**それぞれ即時に 1 回の履歴**（途中反映・履歴グループは使わない）。`mapHistory.areNodesEqual` は配列の値を要素ごとに比べる（内容が同じなら履歴を積まない。L-135）。
- フックの戻り値: `addNodeLink(id, input): AddNodeLinkOutcome`（`{ ok: true } | { ok: false; reason: AddNodeLinkFailureReason }`。失敗は何も変えない。最新の状態から判定する。L-453）、`removeNodeLink(id, url): boolean`。
- パネル: 「リンク」節は**メモ → リンク → イラスト**の順。`<form noValidate onSubmit>` で**確定は送信の 1 か所**（`type="url"` のブラウザの検証の吹き出しを出さない）。`keydown` は確定せず、`Enter` が変換中（`isComposing`・`keyCode === 229`）または `repeat` のときに `preventDefault` するだけ（L-474・L-408）。前後の空白を削った入力が空なら何もしない。成功で入力欄を空にしてフォーカスを入力欄へ、失敗は入力を残して `role="alert"` で理由を出し、入力を変えたらエラーを消す。**入力欄とボタンは `disabled` にしない**（L-155・L-157。上限 10 件でも有効のまま、試みると `too-many` の文言）。削除の後はフォーカスを入力欄へ移す。入力欄は `type="url"`・`autoComplete="off"`・`maxLength` なし。
- リンクは `<a href={toSafeLinkHref(url)} target="_blank" rel="noopener noreferrer">`。`toSafeLinkHref` が `null` のときは `<span>` で文字だけを出す（描画で再確認する）。
- 失敗の文言（`formatNodeLinkFailure`。`empty` は出さない）: `too-long`「URLが長すぎます（2,048 文字まで。日本語などはエンコードで長くなります）。」、`invalid`「URLの形式が正しくありません。https:// から始まる URL を入力してください。」、`unsupported-scheme`「http または https の URL だけを追加できます。」、`has-credentials`「ユーザー名やパスワードを含む URL は追加できません。」、`duplicate`「同じ URL がすでに追加されています。」、`too-many`「リンクは 1 つのノードに 10 件まで追加できます。」、`node-missing`「ノードが見つかりません。」。上限の数値は定数から組み立て、`never` による網羅性を保つ。
- キャンバスの印: URL を 1 件以上持つノードの**右上の角**（中心 `(x + width, y)`）に、**半径 6** の塗りつぶしの円（**`0x3b82f6`**、**白い縁**）。表示専用（`eventMode` は親の `Container` のまま）で、`contentAlpha` を同じく当てる。**画像書き出し・アウトライン書き出しには出さない**。
- 検索: `NodeSearchMatch` に `matchedBy: "label" | "link"`。ラベルが一致すれば `"label"`、そうでなく URL のどれかが一致すれば `"link"`。一致は既存と同じ正規化（NFKC＋小文字化）で、**`decodeURI` で戻した形でも一致**する（例外のときはエンコードのままだけ）。URL ごとに別の要素で比べ、区切りをまたいで一致しない。正規化の結果は `links` の配列の参照を鍵にした `WeakMap` で使い回す。UI は補助行の最後に「 · URL 一致」、`aria-label` は「ラベル（親: X、非表示、URL 一致）」の形。
- 範囲外（実装しない。設計書 §1）: 表示名・ページタイトルの取得・存在確認・favicon・プレビュー（外部への通信をしない）、`http`/`https` 以外のスキーム、スキーム補完、キャンバス上の印のクリック、アウトライン書き出し・画像書き出し・一括置換（`nodeLabelReplace`）への URL の反映、複数ノードへの一括追加、ノードの右クリックメニューやショートカットからの操作。属性ごとの扱いの表（`satisfies Record<keyof Node, …>`）は導入しない（設計書 §11）。
- ショートカットの競合は既存の判定（`isInteractiveTarget`・`isEditableTarget`）に任せ、新しい判定は足さない。
- 気をつける知見: L-018、L-023、L-032、L-078、L-443、L-036、L-453・L-454、L-135、L-474・L-408、L-155、L-588、L-737、L-160、L-522、L-609、L-203、L-825、L-157、L-057・L-161（設計書 §11）。
- テストの値: `URL` の挙動（jsdom の `URL` と Node の `URL` は同じ結果）は、このプランを書く時点で実際に実行して確かめた値を使う。例: `new URL("https://例え.jp/パス?q=日本語").href` は `"https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9?q=%E6%97%A5%E6%9C%AC%E8%AA%9E"`、`"https://example.com/" + "あ".repeat(500)` は入力 520 文字・`href` 4,520 文字。jsdom の `<input type="url">` は値の前後の空白を削る（値のサニタイズ）ので、部品のテストでは前後の空白の扱いを確かめない（ドメインのテストで確かめる）。
- 返答・コメント・ドキュメントは日本語。

---

### Task 1: URL の規則のドメイン（`nodeLink.ts`）

**Files:**
- Create: `client/src/domain/nodes/nodeLink.ts`
- Modify: `client/src/types/node.ts`（`links?: readonly string[];` の 1 行だけ。コメントの整備は Task 2）
- Test: `client/src/domain/nodes/__tests__/nodeLink.test.ts`（新規）

**Interfaces:**
- Consumes: なし。`Node`（`@/types/node`）に `links` が無いと型が通らないため、**このタスクの Step 3 で `client/src/types/node.ts` に `links?: readonly string[];` の 1 行だけを先に足す**。
- Produces（`@/domain/nodes/nodeLink`）:
  - `NODE_LINKS_MAX_COUNT = 10`、`NODE_LINK_MAX_LENGTH = 2048`
  - `type NodeLinkUrlFailureReason = "empty" | "too-long" | "invalid" | "unsupported-scheme" | "has-credentials"`
  - `type NodeLinkUrlResult = { ok: true; url: string } | { ok: false; reason: NodeLinkUrlFailureReason }`
  - `type AddNodeLinkFailureReason = NodeLinkUrlFailureReason | "node-missing" | "duplicate" | "too-many"`
  - `type AddNodeLinkResult = { ok: true; nodes: Node[] } | { ok: false; reason: AddNodeLinkFailureReason }`
  - `type AddNodeLinkOutcome = { ok: true } | { ok: false; reason: AddNodeLinkFailureReason }`（`useNodes.addNodeLink` の戻り値。`MergeNodesResult` が `nodeMerge.ts` にあるのと同じく、ドメインに置いて部品からも参照する）
  - `normalizeNodeLinkUrl(input: string): NodeLinkUrlResult`
  - `isNodeLinkUrl(value: unknown): value is string`
  - `toSafeLinkHref(value: string): string | null`
  - `areNodeLinksEqual(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean`（要素ごと。`undefined` は空と同じ。Task 2 の `mapConflict` と Task 4 の `isSameNodeMergePlan` が使う）
  - `formatNodeLinkFailure(reason: Exclude<AddNodeLinkFailureReason, "empty">): string`
  - `withNodeLinks(node: Node, links: readonly string[] | undefined): Node`（`undefined`・空ならキーごと外す）
  - `addNodeLink(nodes: readonly Node[], id: number, input: string): AddNodeLinkResult`
  - `removeNodeLink(nodes: readonly Node[], id: number, url: string): Node[] | null`

- [ ] **Step 1: 失敗するテストを書く**

`client/src/domain/nodes/__tests__/nodeLink.test.ts`:

```typescript
import {
  NODE_LINKS_MAX_COUNT,
  NODE_LINK_MAX_LENGTH,
  addNodeLink,
  areNodeLinksEqual,
  formatNodeLinkFailure,
  isNodeLinkUrl,
  normalizeNodeLinkUrl,
  removeNodeLink,
  toSafeLinkHref,
  withNodeLinks,
  type AddNodeLinkFailureReason,
  type NodeLinkUrlFailureReason,
} from "@/domain/nodes/nodeLink";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const BASE = "https://example.com/";
const A = "https://example.com/a";
const B = "https://example.org/b";

// 正規化済みの URL を count 件（https://example.com/link0 …）
function linksOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${BASE}link${index}`);
}

describe("定数", () => {
  it("件数の上限は 10、長さの上限は 2,048", () => {
    expect(NODE_LINKS_MAX_COUNT).toBe(10);
    expect(NODE_LINK_MAX_LENGTH).toBe(2048);
  });
});

describe("normalizeNodeLinkUrl", () => {
  it.each<[string, string, string]>([
    ["パスが空なら / を補う", "https://example.com", "https://example.com/"],
    ["スキームとホストは小文字にし、パスの大文字は保つ", "HTTPS://EXAMPLE.COM/Path", "https://example.com/Path"],
    ["http も受け付ける", "http://example.com/a", "http://example.com/a"],
    ["前後の空白を削る", "  https://example.com/a \n", "https://example.com/a"],
    ["パスの空白はパーセントエンコードする", "https://example.com/a b", "https://example.com/a%20b"],
    [
      "IDN のホストは punycode、日本語のパス・クエリはパーセントエンコードにする",
      "https://例え.jp/パス?q=日本語",
      "https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9?q=%E6%97%A5%E6%9C%AC%E8%AA%9E",
    ],
    ["パーセントエンコード済みはそのまま", "https://example.com/%E3%81%82", "https://example.com/%E3%81%82"],
  ])("%s", (_name, input, expected) => {
    expect(normalizeNodeLinkUrl(input)).toEqual({ ok: true, url: expected });
  });

  it.each<[string, string, NodeLinkUrlFailureReason]>([
    ["空文字", "", "empty"],
    ["空白だけ", " \t\n　", "empty"],
    ["スキームが無い（補わない）", "example.com", "invalid"],
    ["相対 URL", "/relative/path", "invalid"],
    ["スキーム相対", "//example.com/a", "invalid"],
    ["ホストが空", "http://", "invalid"],
    ["ホストに空白", "https://exa mple.com", "invalid"],
    ["javascript:", "javascript:alert(1)", "unsupported-scheme"],
    ["大文字の JavaScript:", "JavaScript:alert(1)", "unsupported-scheme"],
    ["data:", "data:text/html,<b>x</b>", "unsupported-scheme"],
    ["file:", "file:///etc/passwd", "unsupported-scheme"],
    ["mailto:", "mailto:someone@example.com", "unsupported-scheme"],
    ["ftp:", "ftp://example.com/", "unsupported-scheme"],
    ["ユーザー名とパスワード", "https://user:pass@example.com/", "has-credentials"],
    ["ユーザー名だけ", "https://user@example.com/", "has-credentials"],
    ["パスワードだけ", "https://:pass@example.com/", "has-credentials"],
  ])("%s は %s で拒否する", (_name, input, reason) => {
    expect(normalizeNodeLinkUrl(input)).toEqual({ ok: false, reason });
  });

  it("入力（前後の空白を削った後）がちょうど上限なら受け付け、1 超えると too-long", () => {
    const max = `${BASE}${"a".repeat(NODE_LINK_MAX_LENGTH - BASE.length)}`;

    expect(normalizeNodeLinkUrl(max)).toEqual({ ok: true, url: max });
    expect(normalizeNodeLinkUrl(` ${max} `)).toEqual({ ok: true, url: max });
    expect(normalizeNodeLinkUrl(`${max}a`)).toEqual({ ok: false, reason: "too-long" });
  });

  it("入力の長さは解析より先に判定する（URL として不正でも、長すぎれば too-long。L-443）", () => {
    expect(normalizeNodeLinkUrl("x".repeat(NODE_LINK_MAX_LENGTH + 1))).toEqual({ ok: false, reason: "too-long" });
    expect(normalizeNodeLinkUrl(`javascript:${"a".repeat(NODE_LINK_MAX_LENGTH)}`)).toEqual({ ok: false, reason: "too-long" });
  });

  it("入力は上限内でも、パーセントエンコードした href が上限を超えれば too-long", () => {
    const input = `${BASE}${"あ".repeat(500)}`;

    expect(input.length).toBeLessThanOrEqual(NODE_LINK_MAX_LENGTH);
    expect(normalizeNodeLinkUrl(input)).toEqual({ ok: false, reason: "too-long" });
  });

  it("スキームの検査は資格情報より先、資格情報は href の長さより先", () => {
    expect(normalizeNodeLinkUrl("ftp://user:pass@example.com/")).toEqual({ ok: false, reason: "unsupported-scheme" });
    expect(normalizeNodeLinkUrl(`https://user:pass@example.com/${"あ".repeat(300)}`))
      .toEqual({ ok: false, reason: "has-credentials" });
  });
});

describe("isNodeLinkUrl・toSafeLinkHref", () => {
  it.each([A, B, "https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9"])("正規化済みの %s は真で、そのまま href にする", (value) => {
    expect(isNodeLinkUrl(value)).toBe(true);
    expect(toSafeLinkHref(value)).toBe(value);
  });

  it.each([
    "https://example.com",
    "HTTPS://example.com/a",
    " https://example.com/a",
    "javascript:alert(1)",
    "data:text/html,x",
    "https://user:pass@example.com/",
    "example.com",
    "",
  ])("正規化済みでない・許可しない %j は偽で、href にしない（null）", (value) => {
    expect(isNodeLinkUrl(value)).toBe(false);
    expect(toSafeLinkHref(value)).toBeNull();
  });

  it.each([1, null, undefined, {}, [A]])("文字列でない %p は偽", (value) => {
    expect(isNodeLinkUrl(value)).toBe(false);
  });
});

describe("areNodeLinksEqual", () => {
  it("要素ごとに比べ、別の配列でも内容が同じなら真", () => {
    expect(areNodeLinksEqual([A, B], [A, B])).toBe(true);
    expect(areNodeLinksEqual(undefined, undefined)).toBe(true);
    expect(areNodeLinksEqual(undefined, [])).toBe(true);
  });

  it.each<[string, readonly string[] | undefined, readonly string[] | undefined]>([
    ["順が違う", [A, B], [B, A]],
    ["長さが違う", [A], [A, B]],
    ["要素が違う", [A], [B]],
    ["片方だけ持つ", undefined, [A]],
  ])("%s なら偽", (_name, a, b) => {
    expect(areNodeLinksEqual(a, b)).toBe(false);
  });
});

describe("formatNodeLinkFailure", () => {
  it.each<[Exclude<AddNodeLinkFailureReason, "empty">, string]>([
    ["too-long", "URLが長すぎます（2,048 文字まで。日本語などはエンコードで長くなります）。"],
    ["invalid", "URLの形式が正しくありません。https:// から始まる URL を入力してください。"],
    ["unsupported-scheme", "http または https の URL だけを追加できます。"],
    ["has-credentials", "ユーザー名やパスワードを含む URL は追加できません。"],
    ["duplicate", "同じ URL がすでに追加されています。"],
    ["too-many", "リンクは 1 つのノードに 10 件まで追加できます。"],
    ["node-missing", "ノードが見つかりません。"],
  ])("%s は「%s」", (reason, message) => {
    expect(formatNodeLinkFailure(reason)).toBe(message);
  });
});

describe("withNodeLinks", () => {
  const node = createTestNode({ id: 1, label: "対象", links: [A] });

  it("空でない並びなら links にする（元のノードは変えない）", () => {
    expect(withNodeLinks(node, [A, B])).toEqual({ ...node, links: [A, B] });
    expect(node.links).toEqual([A]);
  });

  it.each([undefined, []])("%p なら links のキーごと外す", (links) => {
    const next = withNodeLinks(node, links);

    expect("links" in next).toBe(false);
    expect(next).toEqual({ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "対象", importance: "medium" });
  });
});

describe("addNodeLink", () => {
  // 1: URL あり、2: URL なし、3: 上限まで。ラベルは全ノードで変える（L-168）
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(createTestNode({ id: 1, label: "URLあり", links: [A] })),
    Object.freeze(createTestNode({ id: 2, label: "URLなし", x: 200 })),
    Object.freeze(createTestNode({ id: 3, label: "上限", x: 400, links: linksOf(NODE_LINKS_MAX_COUNT) })),
  ]);

  function success(id: number, input: string): Node[] {
    const result = addNodeLink(nodes, id, input);
    if (!result.ok) throw new Error(result.reason);
    return result.nodes;
  }

  it("正規化した URL を末尾に足し、ほかのノードは同じ参照のまま", () => {
    const next = success(1, " HTTPS://Example.org/b ");

    expect(next[0].links).toEqual([A, B]);
    expect(next[1]).toBe(nodes[1]);
    expect(next[2]).toBe(nodes[2]);
  });

  it("URL の無いノードには 1 件の並びを作る", () => {
    expect(success(2, A)[1]).toEqual({ ...nodes[1], links: [A] });
  });

  it("9 件のノードには 10 件目を足せる", () => {
    const nine = [createTestNode({ id: 1, links: linksOf(9) })];
    const result = addNodeLink(nine, 1, A);

    expect(result.ok && result.nodes[0].links).toHaveLength(NODE_LINKS_MAX_COUNT);
  });

  it.each<[string, number, string, AddNodeLinkFailureReason]>([
    ["対象が無い（URL が不正でも node-missing を先に返す）", 99, "javascript:alert(1)", "node-missing"],
    ["空白だけ", 2, "   ", "empty"],
    ["形式が不正", 2, "example.com", "invalid"],
    ["http/https 以外", 2, "javascript:alert(1)", "unsupported-scheme"],
    ["資格情報つき", 2, "https://user:pass@example.com/", "has-credentials"],
    ["長すぎる", 2, `${BASE}${"a".repeat(NODE_LINK_MAX_LENGTH)}`, "too-long"],
    ["正規化すると同じ URL がすでにある", 1, "HTTPS://EXAMPLE.COM/a", "duplicate"],
    ["上限の 10 件に達している", 3, A, "too-many"],
    ["上限に達していても、同じ URL なら duplicate を先に返す", 3, `${BASE}link0`, "duplicate"],
    ["上限に達していても、URL が不正なら URL の理由を先に返す", 3, "javascript:alert(1)", "unsupported-scheme"],
  ])("%s ときは失敗の理由を返す", (_name, id, input, reason) => {
    expect(addNodeLink(nodes, id, input)).toEqual({ ok: false, reason });
  });
});

describe("removeNodeLink", () => {
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(createTestNode({ id: 1, label: "2件", links: [A, B] })),
    Object.freeze(createTestNode({ id: 2, label: "1件", x: 200, links: [A] })),
    Object.freeze(createTestNode({ id: 3, label: "0件", x: 400 })),
  ]);

  it("指定の URL だけを消し、順を保ち、ほかのノードは同じ参照のまま", () => {
    const next = removeNodeLink(nodes, 1, A);

    expect(next?.[0].links).toEqual([B]);
    expect(next?.[1]).toBe(nodes[1]);
    expect(nodes[0].links).toEqual([A, B]);
  });

  it("最後の 1 件を消すと links のキーごと外す（空配列を残さない）", () => {
    const next = removeNodeLink(nodes, 2, A);

    expect(next).not.toBeNull();
    expect("links" in next![1]).toBe(false);
  });

  it.each<[string, number, string]>([
    ["対象が無い", 99, A],
    ["その URL を持たない", 2, B],
    ["URL の無いノード", 3, A],
    ["正規化前の表記（保存した値と完全に一致しない）", 2, "HTTPS://EXAMPLE.COM/a"],
  ])("%s ときは null（何も変えない）", (_name, id, url) => {
    expect(removeNodeLink(nodes, id, url)).toBeNull();
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeLink.test.ts`
Expected: FAIL（`Cannot find module '@/domain/nodes/nodeLink'`）

- [ ] **Step 3: 実装する**

`client/src/types/node.ts` の `note?: string;` の次に、次の 1 行だけを先に足す（コメントは Task 2 で整える）:

```typescript
  links?: readonly string[];
```

`client/src/domain/nodes/nodeLink.ts`:

```typescript
import type { Node } from "@/types/node";

// 1 ノードに付けられる URL の件数の上限
export const NODE_LINKS_MAX_COUNT = 10;
// URL 1 件の長さの上限（string.length）。入力（前後の空白を削った後）と、正規化した href の両方に掛ける
export const NODE_LINK_MAX_LENGTH = 2048;

export type NodeLinkUrlFailureReason = "empty" | "too-long" | "invalid" | "unsupported-scheme" | "has-credentials";

export type NodeLinkUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: NodeLinkUrlFailureReason };

export type AddNodeLinkFailureReason = NodeLinkUrlFailureReason | "node-missing" | "duplicate" | "too-many";

export type AddNodeLinkResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: AddNodeLinkFailureReason };

// useNodes.addNodeLink の戻り値（ノード配列を含めない。MergeNodesResult と同じ分け方）
export type AddNodeLinkOutcome =
  | { ok: true }
  | { ok: false; reason: AddNodeLinkFailureReason };

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

// URL の入力を、保存して開く値（URL.href）にする。検証と保存と「開く」は同じ href を使う（L-018）。
// 検査の順: 前後の空白を削る → 空 → 入力の長さ（解析より先。L-443）→ new URL（相対 URL・スキーム無しは例外）→
// スキーム（http/https だけ）→ 資格情報（L-032）→ href の長さ（パーセントエンコードで入力より長くなる）
export function normalizeNodeLinkUrl(input: string): NodeLinkUrlResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (trimmed.length > NODE_LINK_MAX_LENGTH) return { ok: false, reason: "too-long" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, reason: "unsupported-scheme" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "has-credentials" };
  if (url.href.length > NODE_LINK_MAX_LENGTH) return { ok: false, reason: "too-long" };
  return { ok: true, url: url.href };
}

// 正規化済みの URL か（normalizeNodeLinkUrl が成功し、その値が value と一致する）。描画の再確認とテストで使う
export function isNodeLinkUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const result = normalizeNodeLinkUrl(value);
  return result.ok && result.url === value;
}

// 描画用の href。正規化済みの http/https の URL だけを返し、それ以外は null（保存データが検証済みでも描画で再確認する）
export function toSafeLinkHref(value: string): string | null {
  return isNodeLinkUrl(value) ? value : null;
}

// 2 つの URL の並びが同じか（要素ごと）。undefined は空の並びと同じに扱う
export function areNodeLinksEqual(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((link, index) => link === right[index]);
}

// 利用者向けの失敗の文言。empty は部品が文言を出さないので取らない
export function formatNodeLinkFailure(reason: Exclude<AddNodeLinkFailureReason, "empty">): string {
  switch (reason) {
    case "too-long":
      return `URLが長すぎます（${NODE_LINK_MAX_LENGTH.toLocaleString("ja-JP")} 文字まで。日本語などはエンコードで長くなります）。`;
    case "invalid":
      return "URLの形式が正しくありません。https:// から始まる URL を入力してください。";
    case "unsupported-scheme":
      return "http または https の URL だけを追加できます。";
    case "has-credentials":
      return "ユーザー名やパスワードを含む URL は追加できません。";
    case "duplicate":
      return "同じ URL がすでに追加されています。";
    case "too-many":
      return `リンクは 1 つのノードに ${NODE_LINKS_MAX_COUNT} 件まで追加できます。`;
    case "node-missing":
      return "ノードが見つかりません。";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

// ノードの URL を links にしたノードを返す（元のノードは変えない）。undefined・空の並びなら links のキーごと外す
// （空配列や links: undefined を残さない）。値の検証はしない（呼び出し側の責務）
export function withNodeLinks(node: Node, links: readonly string[] | undefined): Node {
  if (links !== undefined && links.length > 0) return { ...node, links };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で links を除外するため
  const { links: _removed, ...rest } = node;
  return rest;
}

// 1 ノードの URL の末尾に 1 件足す。検査の順: node-missing → URL の検査 → duplicate → too-many。
// 成功時は対象のノードだけを新しいオブジェクトにし、ほかのノードは同じ参照のまま返す
export function addNodeLink(nodes: readonly Node[], id: number, input: string): AddNodeLinkResult {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  const normalized = normalizeNodeLinkUrl(input);
  if (!normalized.ok) return normalized;
  const current = target.links ?? [];
  if (current.includes(normalized.url)) return { ok: false, reason: "duplicate" };
  if (current.length >= NODE_LINKS_MAX_COUNT) return { ok: false, reason: "too-many" };
  const nextLinks = [...current, normalized.url];
  return { ok: true, nodes: nodes.map((node) => (node.id === id ? withNodeLinks(node, nextLinks) : node)) };
}

// 1 ノードから URL を 1 件消す。url は保存されている値（正規化済み）と完全に一致するものだけを消す。
// 対象が無い・その URL を持たないときは null（何も変えない）。最後の 1 件を消すと links のキーごと外す
export function removeNodeLink(nodes: readonly Node[], id: number, url: string): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  const links = target?.links;
  if (links === undefined || !links.includes(url)) return null;
  const nextLinks = links.filter((link) => link !== url);
  return nodes.map((node) => (node.id === id ? withNodeLinks(node, nextLinks) : node));
}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeLink.test.ts`
Expected: PASS（78 件）

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし。

---

### Task 2: 保存形式・競合と履歴の比較、既存の操作での URL の扱いの固定

**Files:**
- Create: `client/src/domain/persistence/mapDocumentNodeLinks.ts`
- Modify: `client/src/domain/persistence/mapDocumentNode.ts`（`normalizeMapDocumentNodeLinks` を呼び、`links` を `projectMapDocumentNode` へ渡す）
- Modify: `client/src/domain/persistence/mapDocumentNodeProjection.ts`（`links` があるときだけ出す）
- Modify: `client/src/domain/mapLibrary/mapConflict.ts`（`areNodesEqual` に `links`）
- Modify: `client/src/domain/history/mapHistory.ts`（`areNodesEqual` を配列対応にする）
- Modify: `client/src/types/node.ts`（`links` のコメントと、見直し箇所のコメント）
- Modify: `client/src/domain/nodes/nodePlacement.ts`（`createParentNode` のコメントに `links` も持たないことを追記。コードは変えない）
- Modify: `client/src/app/testing/pageTestHelpers.tsx`（`ExportedNode` に `links?: readonly string[]`。`V3SeedNode` は `Partial<ExportedNode>` なので自動で受け付ける）
- Test: `client/src/domain/persistence/__tests__/mapDocumentNodeLinks.test.ts`（新規）
- Test: `client/src/domain/persistence/__tests__/mapDocumentNode.test.ts`（追記）
- Test: `client/src/domain/persistence/__tests__/mapDocumentNodeProjection.test.ts`（追記）
- Test: `client/src/domain/persistence/__tests__/mapDocumentCodec.test.ts`（追記）
- Test: `client/src/domain/persistence/__tests__/mapDocumentDecoder.test.ts`（追記）
- Test: `client/src/domain/mapLibrary/__tests__/mapConflict.test.ts`（追記）
- Test: `client/src/domain/history/__tests__/mapHistory.test.ts`（追記）
- Test: `client/src/domain/clipboard/__tests__/subtreeClipboardCodec.test.ts`（追記）
- Test: `client/src/domain/nodes/__tests__/nodeSubtreeInsertion.test.ts`（追記）
- Test: `client/src/domain/nodes/__tests__/nodeSplit.test.ts`（追記）
- Test: `client/src/domain/nodes/__tests__/nodeParentInsertion.test.ts`（追記）
- Test: `client/src/domain/nodes/__tests__/nodeBranchMove.test.ts`（追記）

**Interfaces:**
- Consumes（Task 1）: `NODE_LINKS_MAX_COUNT`、`NODE_LINK_MAX_LENGTH`、`normalizeNodeLinkUrl(input: string): NodeLinkUrlResult`、`areNodeLinksEqual(a, b): boolean`（`@/domain/nodes/nodeLink`）
- Produces:
  - `Node.links?: readonly string[]`（`@/types/node`。コメントつき）
  - `normalizeMapDocumentNodeLinks(links: unknown, index: number, version: MapDocumentVersion): MapDocumentResult<readonly string[] | undefined>`（`@/domain/persistence/mapDocumentNodeLinks`）。失敗の文言は `node[${index}].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。`
  - `ExportedNode.links?: readonly string[]`（`@/app/testing/pageTestHelpers`）
  - `areMapStatesEqual`（`@/domain/history/mapHistory`）は、配列の値を要素ごとに比べる（シグネチャは変えない）

- [ ] **Step 1: 失敗するテストを書く**

`client/src/domain/persistence/__tests__/mapDocumentNodeLinks.test.ts`:

```typescript
import { NODE_LINKS_MAX_COUNT, NODE_LINK_MAX_LENGTH } from "@/domain/nodes/nodeLink";
import { normalizeMapDocumentNodeLinks } from "@/domain/persistence/mapDocumentNodeLinks";

const ERROR = "node[2].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。";
const BASE = "https://example.com/";
const A = "https://example.com/a";

function linksOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${BASE}link${index}`);
}

describe("normalizeMapDocumentNodeLinks", () => {
  it.each([1, 2] as const)("V%d では links を無視して undefined を返す（不正な値でも失敗にしない）", (version) => {
    expect(normalizeMapDocumentNodeLinks([A], 0, version)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeLinks("javascript:alert(1)", 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で undefined なら undefined", () => {
    expect(normalizeMapDocumentNodeLinks(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 の各要素を正規化した値（URL.href）にし、順を保つ", () => {
    expect(normalizeMapDocumentNodeLinks(["https://Example.com", " https://example.com/a b "], 0, 3))
      .toEqual({ ok: true, value: ["https://example.com/", "https://example.com/a%20b"] });
  });

  it("正規化すると同じになる要素は、後のものを捨てる", () => {
    expect(normalizeMapDocumentNodeLinks([A, "HTTPS://EXAMPLE.COM/a", "https://example.org/"], 0, 3))
      .toEqual({ ok: true, value: [A, "https://example.org/"] });
  });

  it("空の配列は undefined（項目ごと持たない）", () => {
    expect(normalizeMapDocumentNodeLinks([], 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("ちょうど 10 件、ちょうど 2,048 文字は受け付ける", () => {
    const max = `${BASE}${"a".repeat(NODE_LINK_MAX_LENGTH - BASE.length)}`;

    expect(normalizeMapDocumentNodeLinks(linksOf(NODE_LINKS_MAX_COUNT), 0, 3))
      .toEqual({ ok: true, value: linksOf(NODE_LINKS_MAX_COUNT) });
    expect(normalizeMapDocumentNodeLinks([max], 0, 3)).toEqual({ ok: true, value: [max] });
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["文字列", A],
    ["オブジェクト", { 0: A }],
    ["数値の要素", [1]],
    ["null の要素", [null]],
    ["空文字の要素", [""]],
    ["空白だけの要素", ["   "]],
    ["スキームの無い要素", ["example.com"]],
    ["javascript: の要素", ["javascript:alert(1)"]],
    ["data: の要素", ["data:text/html,x"]],
    ["資格情報つきの要素", ["https://user:pass@example.com/"]],
    ["href が上限を超える要素", [`${BASE}${"あ".repeat(500)}`]],
    ["11 件", linksOf(NODE_LINKS_MAX_COUNT + 1)],
    ["正しい要素の後ろに不正な要素", [A, "javascript:alert(1)"]],
  ])("V3 で不正な links（%s）は失敗", (_name, links) => {
    expect(normalizeMapDocumentNodeLinks(links, 2, 3)).toEqual({ ok: false, error: ERROR });
  });

  it("要素の長さは前後の空白を削る前の length で、解析より先に判定する（削れば上限内になる値も拒否する。L-443）", () => {
    const max = `${BASE}${"a".repeat(NODE_LINK_MAX_LENGTH - BASE.length)}`;

    expect(normalizeMapDocumentNodeLinks([`${max} `], 2, 3)).toEqual({ ok: false, error: ERROR });
  });
});
```

`client/src/domain/persistence/__tests__/mapDocumentNode.test.ts` の末尾（最後の `});` の後）に追加する（既存の `validNode` を使う）:

```typescript
describe("normalizeMapDocumentNode の links", () => {
  it("V3 の links を正規化して読み込む", () => {
    expect(normalizeMapDocumentNode({ ...validNode, links: ["https://Example.com"] }, 0, 3)).toEqual({
      ok: true,
      value: { ...validNode, links: ["https://example.com/"] },
    });
  });

  it("V3 の空の links は、項目ごと持たない", () => {
    const result = normalizeMapDocumentNode({ ...validNode, links: [] }, 0, 3);

    expect(result.ok && "links" in result.value).toBe(false);
  });

  it("V2 の links は無視する", () => {
    const result = normalizeMapDocumentNode({ ...validNode, links: ["https://example.com/"] }, 0, 2);

    expect(result).toEqual({ ok: true, value: validNode });
    expect(result.ok && "links" in result.value).toBe(false);
  });

  it("V3 の不正な links は、位置付きのエラーで拒否する", () => {
    expect(normalizeMapDocumentNode({ ...validNode, links: ["javascript:alert(1)"] }, 4, 3)).toEqual({
      ok: false,
      error: "node[4].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。",
    });
  });
});
```

`client/src/domain/persistence/__tests__/mapDocumentNodeProjection.test.ts` の `describe` の中、既存の `it` の後に追加する:

```typescript
  it("links があるときだけ項目を出す", () => {
    const base = {
      id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "a", importance: "medium" as const,
    };

    expect(projectMapDocumentNode({ ...base, links: ["https://example.com/"] })).toEqual({ ...base, links: ["https://example.com/"] });
    expect("links" in projectMapDocumentNode(base)).toBe(false);
    expect("links" in projectMapDocumentNode({ ...base, links: undefined })).toBe(false);
  });
```

`client/src/domain/persistence/__tests__/mapDocumentCodec.test.ts` の `describe("MapDocument Codec", ...)` の中、既存の `it` の後に追加する:

```typescript
  it("V3 の URL（日本語のパスはパーセントエンコード済み）を往復し、URL の無いノードは項目を持たない", () => {
    const links = ["https://example.com/", "https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9"];
    const withLinks = createTestNode({ ...node(1, null, "high"), links });
    const withoutLinks = node(2, 1, "low");
    const document = createMapDocument([withLinks, withoutLinks], "manual");

    const parsed = parseMapDocumentJson(serializeMapDocument(document));

    expect(parsed).toEqual({ ok: true, value: document });
    expect(parsed.ok && parsed.value.nodes[0].links).toEqual(links);
    expect(parsed.ok && "links" in parsed.value.nodes[1]).toBe(false);
  });
```

`client/src/domain/persistence/__tests__/mapDocumentDecoder.test.ts` の末尾に追加する（既存の `baseNode`・`json` を使う）:

```typescript
describe("version 3 の URL", () => {
  it("version 3 の links を正規化して読み込み、重複は後のものを捨てる", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, {
      ...baseNode,
      links: ["https://Example.com", "https://example.com/"],
    }));

    expect(parsed.ok && parsed.value.document.nodes[0].links).toEqual(["https://example.com/"]);
  });

  it.each([1, 2])("version %i の links は無視する", (version) => {
    const links = ["javascript:alert(1)"];
    const node = version === 1 ? { ...baseNode, links, importance: undefined } : { ...baseNode, links };
    const parsed = parseMapDocumentJsonWithVersion(json(version, node));

    expect(parsed.ok && "links" in parsed.value.document.nodes[0]).toBe(false);
  });

  it("version 3 で http/https 以外の links は、読み込みを失敗にする", () => {
    expect(parseMapDocumentJsonWithVersion(json(3, { ...baseNode, links: ["javascript:alert(1)"] }))).toEqual({
      ok: false,
      error: "node[0].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。",
    });
  });
});
```

`client/src/domain/mapLibrary/__tests__/mapConflict.test.ts` の `describe("isDocumentContentEqual", ...)` の中、`"note が未定義とオプショナル未定義は等価"` の `it` の後に追加する:

```typescript
    it("URL だけが違う 2 文書は別物と判定する（別タブで変えた URL の競合を見逃さない）", () => {
      const withLinks: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/a"] }],
      };
      const reordered: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/b", "https://example.com/a"] }],
      };
      const ordered: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/a", "https://example.com/b"] }],
      };

      expect(isDocumentContentEqual(baseDoc, withLinks)).toBe(false);
      expect(isDocumentContentEqual(withLinks, ordered)).toBe(false);
      expect(isDocumentContentEqual(ordered, reordered)).toBe(false);
    });

    it("links は要素ごとに比べ、別の配列でも内容が同じなら等価。未定義とオプショナル未定義も等価", () => {
      const left: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/a"] }],
      };
      const right: MapDocumentV3 = {
        ...baseDoc,
        nodes: [baseDoc.nodes[0], { ...baseDoc.nodes[1], links: ["https://example.com/a"] }],
      };
      const explicitUndefined: MapDocumentV3 = {
        ...baseDoc,
        nodes: [{ ...baseDoc.nodes[0], links: undefined }, baseDoc.nodes[1]],
      };

      expect(isDocumentContentEqual(left, right)).toBe(true);
      expect(isDocumentContentEqual(baseDoc, explicitUndefined)).toBe(true);
    });
```

`client/src/domain/history/__tests__/mapHistory.test.ts` の `describe("areMapStatesEqual", ...)` を次のように変える:
- `it.each([...])("%sの違いを検出する", ...)` の配列の `["illustration", { illustration: "data:x" }],` の次に `["links", { links: ["https://example.com/"] }],` を足す。
- `"同内容なら参照が違っても等しい"` の `it` の後（`describe("areMapStatesEqual")` の閉じ括弧の前）に追加する:

```typescript
    describe("配列の値（links）", () => {
      const A = "https://example.com/a";
      const B = "https://example.org/b";
      const withLinks = (links: readonly string[]): NodeMapState => ({
        layoutMode: "manual",
        nodes: [createTestNode({ id: 1, links })],
      });

      it("内容が同じなら別の配列でも等しく、確定しても履歴を積まない（L-135）", () => {
        expect(areMapStatesEqual(withLinks([A, B]), withLinks([A, B]))).toBe(true);

        const committed = commitMapHistory(createMapHistory(withLinks([A])), withLinks([A]));
        expect(committed.past).toHaveLength(0);
      });

      it.each<[string, readonly string[], readonly string[]]>([
        ["要素が違う", [A], [B]],
        ["順が違う", [A, B], [B, A]],
        ["長さが違う", [A], [A, B]],
      ])("%s なら等しくない", (_name, left, right) => {
        expect(areMapStatesEqual(withLinks(left), withLinks(right))).toBe(false);
      });
    });
```

`client/src/domain/clipboard/__tests__/subtreeClipboardCodec.test.ts`:
- `describe("encodeSubtreeClipboard / decodeSubtreeClipboard", ...)` の中、`"詳細メモもコピーに含めて往復する（メモの無いノードは項目を持たない）"` の後に追加する:

```typescript
  it("URL もコピーに含めて往復する（URL の無いノードは項目を持たない）", () => {
    const withLinks: Node[] = [
      node(1, null),
      node(2, 1, { links: ["https://example.com/a", "https://example.org/b"] }),
      node(3, 2),
    ];

    const decoded = encodeAndDecode(withLinks, 2);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.nodes.find((item) => item.id === 2)?.links).toEqual(["https://example.com/a", "https://example.org/b"]);
    expect("links" in decoded.value.nodes.find((item) => item.id === 3)!).toBe(false);
  });
```

- `describe("decodeSubtreeClipboard", ...)` の中、`"未知のプロパティを持ち込まない"` の後に追加する（既存の `valid`・`clipboardText` を使う）:

```typescript
  it("貼り付けでも URL を検証し、http/https 以外を含む枝は受け付けない", () => {
    expect(decodeSubtreeClipboard(clipboardText([{ ...valid, links: ["javascript:alert(1)"] }])))
      .toEqual({ ok: false, reason: "invalid" });
    expect(decodeSubtreeClipboard(clipboardText([{ ...valid, links: ["https://Example.com"] }])))
      .toEqual({ ok: true, value: { rootId: 1, nodes: [{ ...valid, links: ["https://example.com/"] }] } });
  });
```

`client/src/domain/nodes/__tests__/nodeSubtreeInsertion.test.ts` の `describe("insertNodeSubtree", ...)` の中、`"%s では詳細メモも写し、メモの無いノードには付けない"` の後に追加する:

```typescript
  it.each(["paste", "duplicate"] as const)("%s では URL も写し、URL の無いノードには付けない", (kind) => {
    const links = ["https://example.com/a"];
    const current = [createTestNode({ id: 1, label: "既存", links: ["https://example.org/existing"] })];
    const sources = [
      createTestNode({ id: 1, label: "根", links }),
      createTestNode({ id: 2, parentId: 1, x: 200, label: "子" }),
    ];

    const result = insertNodeSubtree(current, sources, 1, null, "manual", idsFrom([10, 11]), kind);

    expect(result).not.toBeNull();
    expect(findNode(result!.nodes, 10)?.links).toEqual(links);
    expect("links" in findNode(result!.nodes, 11)!).toBe(false);
    expect(findNode(result!.nodes, 1)?.links).toEqual(["https://example.org/existing"]);
  });
```

`client/src/domain/nodes/__tests__/nodeSplit.test.ts` の `describe("splitNode", ...)` の中、`"詳細メモは元のノード（最初の断片）にだけ残し、新しい断片には付けない"` の後に追加する:

```typescript
  it("URL は元のノード（最初の断片）にだけ残し、新しい断片には付けない", () => {
    const withLinks = rootNodes.map((item) => (item.id === 2 ? { ...item, links: ["https://example.com/a"] } : item));

    const { nodes } = success(withLinks, 2, [101, 102]);

    expect(nodes.find((item) => item.id === 2)?.links).toEqual(["https://example.com/a"]);
    for (const id of [101, 102]) expect("links" in nodes.find((item) => item.id === id)!).toBe(false);
  });
```

`client/src/domain/nodes/__tests__/nodeParentInsertion.test.ts` の末尾（`describe("親の挿入と詳細メモ", ...)` の後）に追加する（既存の `n`・`succeed` を使う。新しい親の ID は 50）:

```typescript
describe("親の挿入と URL", () => {
  it("新しい親は URL を持たず、対象のノードの URL は変わらない", () => {
    const nodes = [n(1, null, 0, 0), n(2, 1, 220, 0, { links: ["https://example.com/a"] })];

    const result = succeed(nodes, 2, undefined, "manual");

    expect("links" in result.nodes.find((node) => node.id === 50)!).toBe(false);
    expect(result.nodes.find((node) => node.id === 2)?.links).toEqual(["https://example.com/a"]);
  });
});
```

`client/src/domain/nodes/__tests__/nodeBranchMove.test.ts` の `describe("transferNodeBranch", ...)` の中、`"IDは渡された採番で決まり、時計に依存しない"` の後に追加する（既存の `node`・`allocateIds` を使う）:

```typescript
  it("別マップへ移した枝の URL も写る", () => {
    const links = ["https://example.com/a"];
    const source = { layoutMode: "manual" as const, nodes: [node(1, null, 0, 0), node(2, 1, 300, 0, { links })] };
    const target = { layoutMode: "manual" as const, nodes: [node(1, null, 10, 10)] };

    const result = transferNodeBranch(source, target, 1, allocateIds);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.target.nodes.find((item) => item.label === "ノード2")?.links).toEqual(links);
  });
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/persistence src/domain/mapLibrary/__tests__/mapConflict.test.ts src/domain/history src/domain/clipboard src/domain/nodes/__tests__/nodeSubtreeInsertion.test.ts src/domain/nodes/__tests__/nodeSplit.test.ts src/domain/nodes/__tests__/nodeParentInsertion.test.ts src/domain/nodes/__tests__/nodeBranchMove.test.ts`

Expected: `mapDocumentNodeLinks.test.ts` が `Cannot find module '@/domain/persistence/mapDocumentNodeLinks'` で FAIL。次の追加分が FAIL する:
- `mapDocumentNode` の「V3 の links を正規化して読み込む」「V3 の不正な links は…拒否する」（`links` が欠ける・`ok: true` が返る）
- `mapDocumentNodeProjection` の「links があるときだけ項目を出す」（`links` が欠ける）
- `mapDocumentCodec` の往復、`mapDocumentDecoder` の「version 3 の links を…読み込み」「…読み込みを失敗にする」
- `mapConflict` の「URL だけが違う 2 文書は別物と判定する」（現状は `links` を比べず `true`）
- `mapHistory` の「内容が同じなら別の配列でも等しく…」（現状は参照で比べ `false`）
- `subtreeClipboardCodec` の「URL もコピーに含めて往復する」「貼り付けでも URL を検証し…」（`links` が落ちる・`ok: true` が返る）

**次の追加分は、実装前でも PASS してよい**（現状と同じ結果を固定する検査。L-609）:
- `mapDocumentNode` の「V3 の空の links は、項目ごと持たない」「V2 の links は無視する」、`mapDocumentDecoder` の「version %i の links は無視する」
- `mapConflict` の「links は要素ごとに比べ…等価」（現状は `links` を比べないので `true`）
- `mapHistory` の「links」の違いの検出と「要素が違う／順が違う／長さが違う」（現状は別の配列を `!==` で違うとみなす）
- `nodeSubtreeInsertion`・`nodeSplit`・`nodeParentInsertion`・`nodeBranchMove` の追加分（`...source`／`...node` で写る・写らない現状を固定。実装は変えない。設計書 §3.4）

- [ ] **Step 3: 実装する**

`client/src/domain/persistence/mapDocumentNodeLinks.ts`:

```typescript
import { NODE_LINKS_MAX_COUNT, NODE_LINK_MAX_LENGTH, normalizeNodeLinkUrl } from "@/domain/nodes/nodeLink";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

function failure(index: number): MapDocumentResult<readonly string[] | undefined> {
  return {
    ok: false,
    error: `node[${index}].linksは、http または https の URL（${NODE_LINK_MAX_LENGTH}文字以内）の配列（最大${NODE_LINKS_MAX_COUNT}件）である必要があります。`,
  };
}

// 件数と各要素の型・長さ（前後の空白を削る前の length）を、URL の解析より先に判定する（L-443）
function isBoundedStringArray(values: readonly unknown[]): values is readonly string[] {
  return values.length <= NODE_LINKS_MAX_COUNT
    && values.every((value) => typeof value === "string" && value.length <= NODE_LINK_MAX_LENGTH);
}

// URL の添付は version 3 の任意項目。それ以前の version では、あっても無視する。
// 各要素は normalizeNodeLinkUrl で正規化した値（URL.href）にし、重複は後のものを捨て、空になれば undefined
export function normalizeMapDocumentNodeLinks(
  links: unknown,
  index: number,
  version: MapDocumentVersion,
): MapDocumentResult<readonly string[] | undefined> {
  if (version !== 3 || links === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(links) || !isBoundedStringArray(links)) {
    return failure(index);
  }
  const normalized: string[] = [];
  for (const link of links) {
    const result = normalizeNodeLinkUrl(link);
    if (!result.ok) return failure(index);
    if (!normalized.includes(result.url)) normalized.push(result.url);
  }
  return { ok: true, value: normalized.length === 0 ? undefined : normalized };
}
```

`client/src/domain/persistence/mapDocumentNode.ts`:
- import に `import { normalizeMapDocumentNodeLinks } from "@/domain/persistence/mapDocumentNodeLinks";` を `normalizeMapDocumentNodeIllustration` の import の次に足す。
- `const note = noteResult.value;` の次に、次を足す:

```typescript
  const linksResult = normalizeMapDocumentNodeLinks(node.links, index, version);
  if (!linksResult.ok) {
    return linksResult;
  }
  const links = linksResult.value;
```

- `projectMapDocumentNode({...})` の引数の `...(note === undefined ? {} : { note }),` の次に `...(links === undefined ? {} : { links }),` を足す。

`client/src/domain/persistence/mapDocumentNodeProjection.ts` の戻り値の最後の行（`...(node.note === undefined ? {} : { note: node.note }),`）の次に足す:

```typescript
    ...(node.links === undefined ? {} : { links: node.links }),
```

`client/src/domain/mapLibrary/mapConflict.ts`:
- import に `import { areNodeLinksEqual } from "@/domain/nodes/nodeLink";` を足す（`MAX_MAP_NAME_LENGTH` の import の次）。
- `areNodesEqual` の最後の条件を次にする:

```typescript
    (a.illustration ?? "") === (b.illustration ?? "") &&
    (a.note ?? "") === (b.note ?? "") &&
    areNodeLinksEqual(a.links, b.links)
```

`client/src/domain/history/mapHistory.ts` の `areNodesEqual` を次にする（`areArrayValuesEqual` を `areNodesEqual` の前に足す）:

```typescript
// 配列の値（links）は要素ごとに比べる。別の配列でも内容が同じなら、実変更の無い履歴を積まない（L-135）
function areArrayValuesEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function areNodesEqual(a: Node, b: Node): boolean {
  if (a === b) return true;
  // Node は型エイリアスのため、キャストなしで任意のキーを読める型へ代入できる（illustration・links の有無も比較する）
  const left: Readonly<Record<string, unknown>> = a;
  const right: Readonly<Record<string, unknown>> = b;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) continue;
    if (Array.isArray(leftValue) && Array.isArray(rightValue) && areArrayValuesEqual(leftValue, rightValue)) continue;
    return false;
  }
  return true;
}
```

`client/src/types/node.ts` を次にする（Task 1 で足した `links?: readonly string[];` の行にコメントを付け、型の上のコメントに見直し箇所を足す）:

```typescript
import type { NodeImportance } from "@/types/nodeImportance";

// マップのノード。属性を足すときは、ノードの分割・統合での扱いを決めて見直す
// （domain/nodes/nodeSplit.ts の断片のノード、domain/nodes/nodeMerge.ts の applyPlanToSurvivor・planNodeMerge・isSameNodeMergePlan）。
// 属性を値のまま写している次の場所も見直す: 枝の複製・コピー＆ペースト（domain/nodes/nodeSubtreeInsertion.ts の `...source`）、
// 保存形式の書き出しと検証（domain/persistence/mapDocumentNodeProjection.ts・mapDocumentNode.ts。
// コピー＆ペーストのクリップボードの形式も mapDocumentNode.ts を使う）、マップの競合判定（domain/mapLibrary/mapConflict.ts の
// areNodesEqual。項目を並べて比べている）、編集履歴の同値判定（domain/history/mapHistory.ts の areNodesEqual。配列の値は
// 要素ごとに比べる）、親の挿入（domain/nodes/nodePlacement.ts の createParentNode）、検索（domain/search/nodeLabelSearch.ts）、
// キャンバスの描画（components/map/pixi/renderMapNodes.ts）、各エクスポート
export type Node = {
  id: number;
  parentId: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  importance: NodeImportance;
  // 縮小済みのイラストの data URL。無いノードでは、項目ごと持たない
  illustration?: string;
  // 詳細メモ（プレーンテキスト。上限は domain/nodes/nodeNote.ts の NODE_NOTE_MAX_LENGTH）。
  // 無いノード・空白だけのメモでは、項目ごと持たない。更新は domain/nodes/nodeNote.ts の replaceNodeNote。
  // 分割では元のノードにだけ残し、統合では選択中のメモを連結し、親の挿入では新しい親に持たせない
  note?: string;
  // 添付した URL（正規化した http/https の URL.href。最大 domain/nodes/nodeLink.ts の NODE_LINKS_MAX_COUNT 件、重複なし）。
  // 読み取り専用の配列で、書き換えずに作り直す。無いノードでは、項目ごと持たない（空配列も持たない）。
  // 更新は domain/nodes/nodeLink.ts の addNodeLink・removeNodeLink。分割では元のノードにだけ残し、統合では選択中の URL を
  // 配列順に重複を除いて連結し、複製・貼り付け・別マップへの移動では写し、親の挿入では新しい親に持たせない
  links?: readonly string[];
};
```

`client/src/domain/nodes/nodePlacement.ts` の `createParentNode` の上のコメント 1 行目を次にする（コードは変えない）:

```typescript
// target の親・座標・重要度を写し、大きさ・ラベルは新しいノードの既定値にする。illustration・note（詳細メモ）・links（URL）は持たない。
```

`client/src/app/testing/pageTestHelpers.tsx` の `ExportedNode` の `note?: string;` の次に足す:

```typescript
  links?: readonly string[];
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain`
Expected: PASS（既存のテストも含めて）

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし。

---

### Task 3: URL の追加・削除の更新経路（`useNodes.addNodeLink`・`removeNodeLink`）

**Files:**
- Modify: `client/src/hooks/useNodes.ts`（`addNodeLink`・`removeNodeLink` を足す）
- Test: `client/src/hooks/__tests__/useNodesLinks.test.ts`（新規）

**Interfaces:**
- Consumes（Task 1）: `addNodeLink(nodes, id, input): AddNodeLinkResult`、`removeNodeLink(nodes, id, url): Node[] | null`、`type AddNodeLinkOutcome`、`type AddNodeLinkFailureReason`、`NODE_LINKS_MAX_COUNT`（`@/domain/nodes/nodeLink`）
- Produces:
  - `useNodes().addNodeLink: (id: number, input: string) => AddNodeLinkOutcome`
  - `useNodes().removeNodeLink: (id: number, url: string) => boolean`

- [ ] **Step 1: 失敗するテストを書く**

`client/src/hooks/__tests__/useNodesLinks.test.ts`:

```typescript
import { act, renderHook } from "@testing-library/react";
import {
  NODE_LINKS_MAX_COUNT,
  type AddNodeLinkFailureReason,
  type AddNodeLinkOutcome,
} from "@/domain/nodes/nodeLink";
import { useNodes } from "@/hooks/useNodes";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeMapState } from "@/types/nodeMapState";

type Hook = ReturnType<typeof useNodes>;

const A = "https://example.com/a";
const B = "https://example.org/b";

// 正規化済みの URL を count 件（https://example.com/link0 …）
function linksOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `https://example.com/link${index}`);
}

// 1: 根、2: URL あり、3: URL なし。ラベルは全ノードで変える（L-168）
function initialMap(layoutMode: "manual" | "auto" = "manual"): NodeMapState {
  return {
    layoutMode,
    nodes: [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "URLあり", x: 220, links: [A] }),
      createTestNode({ id: 3, parentId: 1, label: "URLなし", x: 220, y: 100 }),
    ],
  };
}

function renderNodes(initial: NodeMapState = initialMap()) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

function nodeOf(current: Hook, id: number): Node {
  return current.nodes.find((item) => item.id === id)!;
}

describe("useNodes の addNodeLink", () => {
  it("正規化した URL を末尾に足して { ok: true } を返し、1 回の履歴として確定する。1 回の Undo で戻り、documentRevision は変えない", () => {
    const { result } = renderNodes();
    const revision = result.current.documentRevision;
    let outcome!: AddNodeLinkOutcome;

    act(() => { outcome = result.current.addNodeLink(2, "HTTPS://Example.org/b"); });

    expect(outcome).toEqual({ ok: true });
    expect(nodeOf(result.current, 2).links).toEqual([A, B]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.documentRevision).toBe(revision);

    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 2).links).toEqual([A]);
    expect(result.current.canUndo).toBe(false);
  });

  it("URL の無いノードにも追加できる", () => {
    const { result } = renderNodes();

    act(() => { result.current.addNodeLink(3, A); });

    expect(nodeOf(result.current, 3).links).toEqual([A]);
  });

  it.each<[string, number, string, AddNodeLinkFailureReason]>([
    ["対象が無い", 99, A, "node-missing"],
    ["空白だけ", 3, "   ", "empty"],
    ["形式が不正", 3, "example.com", "invalid"],
    ["http/https 以外", 3, "javascript:alert(1)", "unsupported-scheme"],
    ["資格情報つき", 3, "https://user:pass@example.com/", "has-credentials"],
    ["長すぎる", 3, `https://example.com/${"a".repeat(2048)}`, "too-long"],
    ["正規化すると同じ URL がすでにある", 2, "HTTPS://EXAMPLE.COM/a", "duplicate"],
  ])("%s ときは理由を返し、何も変えず履歴も積まない（L-135）", (_name, id, input, reason) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let outcome!: AddNodeLinkOutcome;

    act(() => { outcome = result.current.addNodeLink(id, input); });

    expect(outcome).toEqual({ ok: false, reason });
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });

  it("10 件あるノードへの追加は too-many で、何も変えない", () => {
    const full: NodeMapState = {
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "上限", links: linksOf(NODE_LINKS_MAX_COUNT) })],
    };
    const { result } = renderNodes(full);
    const before = result.current.nodes;
    let outcome!: AddNodeLinkOutcome;

    act(() => { outcome = result.current.addNodeLink(1, A); });

    expect(outcome).toEqual({ ok: false, reason: "too-many" });
    expect(result.current.nodes).toBe(before);
  });

  it("同じイベントの中の連続 2 回の追加は、最新の状態から判定して両方とも入り、2 回の履歴になる（L-453）", () => {
    const { result } = renderNodes();
    const outcomes: AddNodeLinkOutcome[] = [];

    act(() => {
      outcomes.push(result.current.addNodeLink(3, A));
      outcomes.push(result.current.addNodeLink(3, B));
    });

    expect(outcomes).toEqual([{ ok: true }, { ok: true }]);
    expect(nodeOf(result.current, 3).links).toEqual([A, B]);
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 3).links).toEqual([A]);
  });

  it("同じイベントの中で同じ URL を 2 回追加すると、2 回目は duplicate（古い状態で判定しない）", () => {
    const { result } = renderNodes();
    const outcomes: AddNodeLinkOutcome[] = [];

    act(() => {
      outcomes.push(result.current.addNodeLink(3, A));
      outcomes.push(result.current.addNodeLink(3, A));
    });

    expect(outcomes).toEqual([{ ok: true }, { ok: false, reason: "duplicate" }]);
    expect(nodeOf(result.current, 3).links).toEqual([A]);
  });

  it("自動配置でも追加でき、座標は変えない", () => {
    const { result } = renderNodes(initialMap("auto"));
    const before = nodeOf(result.current, 3);

    act(() => { result.current.addNodeLink(3, A); });

    expect(nodeOf(result.current, 3)).toEqual({ ...before, links: [A] });
  });

  it("関数参照は更新後も安定している", () => {
    const { result } = renderNodes();
    const { addNodeLink, removeNodeLink } = result.current;

    act(() => { result.current.addNodeLink(3, A); });

    expect(result.current.addNodeLink).toBe(addNodeLink);
    expect(result.current.removeNodeLink).toBe(removeNodeLink);
  });
});

describe("useNodes の removeNodeLink", () => {
  it("指定の URL だけを消して true を返し、1 回の Undo で戻る", () => {
    const twoLinks: NodeMapState = {
      layoutMode: "manual",
      nodes: [createTestNode({ id: 1, label: "2件", links: [A, B] })],
    };
    const { result } = renderNodes(twoLinks);
    let removed!: boolean;

    act(() => { removed = result.current.removeNodeLink(1, A); });

    expect(removed).toBe(true);
    expect(nodeOf(result.current, 1).links).toEqual([B]);
    act(() => { result.current.undo(); });
    expect(nodeOf(result.current, 1).links).toEqual([A, B]);
  });

  it("最後の 1 件を消すと links のキーごと外す", () => {
    const { result } = renderNodes();

    act(() => { result.current.removeNodeLink(2, A); });

    expect("links" in nodeOf(result.current, 2)).toBe(false);
  });

  it.each<[string, number, string]>([
    ["対象が無い", 99, A],
    ["その URL を持たない", 2, B],
    ["正規化前の表記（保存した値と完全に一致しない）", 2, "HTTPS://EXAMPLE.COM/a"],
  ])("%s ときは false を返し、何も変えず履歴も積まない", (_name, id, url) => {
    const { result } = renderNodes();
    const before = result.current.nodes;
    let removed!: boolean;

    act(() => { removed = result.current.removeNodeLink(id, url); });

    expect(removed).toBe(false);
    expect(result.current.nodes).toBe(before);
    expect(result.current.canUndo).toBe(false);
  });
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodesLinks.test.ts`
Expected: FAIL（`result.current.addNodeLink is not a function`、`result.current.removeNodeLink is not a function`）

- [ ] **Step 3: 実装する**

`client/src/hooks/useNodes.ts`:
- import に次を足す（`replaceNodeNote` の import の次）:

```typescript
import {
  addNodeLink as computeNodeLinkAddition,
  removeNodeLink as computeNodeLinkRemoval,
  type AddNodeLinkOutcome,
} from "@/domain/nodes/nodeLink";
```

- `UseNodesReturn` の `previewNodeNote: (id: number, note: string) => boolean;` の次に足す:

```typescript
  // URL の追加（右パネルの「リンク」節）。最新の状態から判定し、成功なら1操作として確定する。
  // 失敗は理由を返し、何も変えない。documentRevision は変えない
  addNodeLink: (id: number, input: string) => AddNodeLinkOutcome;
  // URL の削除。保存されている値と完全に一致する URL だけを消し、1操作として確定する。受理したかを返す
  removeNodeLink: (id: number, url: string) => boolean;
```

- `previewNodeNote` の定義の次に足す:

```typescript
  // 判定と確定は同じ最新の状態（getCurrentState と applyNonStructuralChange は同じ ref を読む）で行う。
  // 同じイベントの中で続けて呼んでも、直前の追加を反映した状態から判定する（L-453）
  const addNodeLink = useCallback((id: number, input: string): AddNodeLinkOutcome => {
    const result = computeNodeLinkAddition(getCurrentState().nodes, id, input);
    if (!result.ok) return { ok: false, reason: result.reason };
    applyNonStructuralChange(() => result.nodes);
    return { ok: true };
  }, [getCurrentState, applyNonStructuralChange]);

  const removeNodeLink = useCallback((id: number, url: string) => (
    applyNonStructuralChange((currentNodes) => computeNodeLinkRemoval(currentNodes, id, url))
  ), [applyNonStructuralChange]);
```

- `return` の `previewNodeNote,` の次に `addNodeLink,` と `removeNodeLink,` を足す。

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/hooks/__tests__/useNodesLinks.test.ts src/hooks/__tests__/useNodesNote.test.ts src/hooks/__tests__/useNodesHistory.test.ts src/hooks/__tests__/useNodes.test.ts`
Expected: PASS

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし。

---

### Task 4: 統合での URL の連結（計画・失敗の理由・文言・プレビュー・ダイアログ）

**Files:**
- Modify: `client/src/domain/nodes/nodeMerge.ts`（`links`・`linkSourceCount`・`linkDuplicateCount`・`links-too-many`・`isSameNodeMergePlan`・`applyPlanToSurvivor`）
- Modify: `client/src/domain/nodes/nodeMergeMessages.ts`（`links-too-many` の文言）
- Modify: `client/src/hooks/nodeMergePreview.ts`（`linkText`）
- Modify: `client/src/components/layout/NodeMergeDialog.tsx`（プレビューの「URL」の行）
- Test: `client/src/domain/nodes/__tests__/nodeMerge.test.ts`（既存の 1 件を更新し、追記）
- Test: `client/src/domain/nodes/__tests__/nodeMergeMessages.test.ts`（追記）
- Test: `client/src/hooks/__tests__/nodeMergePreview.test.ts`（既存の 1 件を更新し、追記）
- Test: `client/src/hooks/__tests__/useNodeMergeDialog.test.ts`（既存のプレビューの期待値を更新）
- Test: `client/src/hooks/__tests__/useNodesSplitMerge.test.ts`（追記）
- Test: `client/src/components/layout/__tests__/NodeMergeDialog.test.tsx`（fixture を更新し、追記）

**Interfaces:**
- Consumes（Task 1）: `NODE_LINKS_MAX_COUNT`、`areNodeLinksEqual(a, b): boolean`、`withNodeLinks(node: Node, links: readonly string[] | undefined): Node`（`@/domain/nodes/nodeLink`）。（Task 3）`useNodes().addNodeLink(id: number, input: string): AddNodeLinkOutcome`（テストで確認の後に URL を足すのに使う）
- Produces（`@/domain/nodes/nodeMerge`）:
  - `NodeMergeFailureReason` に `"links-too-many"`
  - `NodeMergePlan` の成功側に `links: readonly string[] | undefined`、`linkSourceCount: number`（URL を持つノードの件数）、`linkDuplicateCount: number`（重複で捨てる件数）
  - `isSameNodeMergePlan` は `links`（要素ごと）・`linkSourceCount`・`linkDuplicateCount` も比べる
- Produces（`@/hooks/nodeMergePreview`）: `NodeMergePreview.linkText: string | null`（`"{links.length} 件"`、重複があれば `"{links.length} 件（重複 {linkDuplicateCount} 件を除く）"`。URL が無ければ `null`）
- `useNodes.mergeNodes` はコードを変えない（再計画の失敗の `reason` をそのまま返すので `links-too-many` も通る。テストで固定する）

- [ ] **Step 1: 失敗するテストを書き、既存の期待値を更新する**

`client/src/domain/nodes/__tests__/nodeMerge.test.ts`:
- import に `import { NODE_LINKS_MAX_COUNT } from "@/domain/nodes/nodeLink";` を `NODE_NOTE_MAX_LENGTH` の import の前に足す。
- `function visibleOf(` の前に、次を足す:

```typescript
const LINK_A = "https://example.com/a";
const LINK_B = "https://example.com/b";
const LINK_C = "https://example.org/c";

// 正規化済みの URL を count 件（https://example.com/{prefix}0 …）
function urls(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `https://example.com/${prefix}${index}`);
}
```

- 既存の `"主選択を残し、吸収されるノードを配列順に並べ、ラベル・重要度・付け替える子の件数を計画する"` の期待値の `noteSourceCount: 0,` の次に `links: undefined,`・`linkSourceCount: 0,`・`linkDuplicateCount: 0,` を足す（L-609。`toEqual` は `undefined` の項目を無視するが、件数の 2 項目は足さないと落ちる）。
- `describe("planNodeMerge", ...)` の中、`describe("各 reason と、検査の順序", ...)` の前に追加する:

```typescript
  describe("URL の連結", () => {
    // 親 1 の下の兄弟 2・3・4・5。2・4・5 が URL を持ち、3 は持たない。B と C は 2 つのノードが持つ
    const withLinks = [
      node(1, null, "親"),
      node(2, 1, "a", { links: [LINK_A, LINK_B] }),
      node(3, 1, "b"),
      node(4, 1, "c", { links: [LINK_B, LINK_C] }),
      node(5, 1, "d", { links: [LINK_C] }),
    ];

    it("選択中の URL を配列順に並べ、最初に出てきたものを残して重複を除く（ids の順序に依存しない）", () => {
      expect(okPlan(withLinks, [5, 4, 3, 2], 3)).toMatchObject({
        links: [LINK_A, LINK_B, LINK_C],
        linkSourceCount: 3,
        linkDuplicateCount: 2,
      });
    });

    it("主選択の URL も、配列上の位置に入る", () => {
      expect(okPlan(withLinks, [2, 4], 4)).toMatchObject({
        links: [LINK_A, LINK_B, LINK_C],
        linkSourceCount: 2,
        linkDuplicateCount: 1,
      });
    });

    it("URL を持つノードが 1 つだけなら、その URL のまま（重複 0 件）", () => {
      expect(okPlan(withLinks, [3, 2], 3)).toMatchObject({ links: [LINK_A, LINK_B], linkSourceCount: 1, linkDuplicateCount: 0 });
    });

    it("誰も URL を持たなければ undefined と 0 件", () => {
      const plain = [node(1, null, "親"), node(2, 1, "a"), node(3, 1, "b")];

      expect(okPlan(plain, [2, 3], 2)).toMatchObject({ links: undefined, linkSourceCount: 0, linkDuplicateCount: 0 });
    });

    it("重複を除いてちょうど上限（10 件）なら統合できる", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { links: urls("a", 6) }),
        node(3, 1, "b", { links: [...urls("a", 2), ...urls("b", 4)] }),
      ];

      expect(okPlan(nodes, [2, 3], 2)).toMatchObject({ linkSourceCount: 2, linkDuplicateCount: 2 });
      expect(okPlan(nodes, [2, 3], 2).links).toHaveLength(NODE_LINKS_MAX_COUNT);
    });

    it("重複を除いて上限を 1 超えると links-too-many（黙って切り詰めない）", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { links: urls("a", 6) }),
        node(3, 1, "b", { links: urls("b", 5) }),
      ];

      expect(planNodeMerge(nodes, [2, 3], 2, " ", visibleOf(nodes))).toEqual({ ok: false, reason: "links-too-many" });
    });

    it("URL の件数の検査は note-too-long の後（メモも長ければ note-too-long）", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { links: urls("a", 6), note: "a".repeat(NODE_NOTE_MAX_LENGTH) }),
        node(3, 1, "b", { links: urls("b", 5), note: "b" }),
      ];

      expect(planNodeMerge(nodes, [2, 3], 2, " ", visibleOf(nodes))).toEqual({ ok: false, reason: "note-too-long" });
    });
  });
```

- `describe("isSameNodeMergePlan", ...)` の中、`"吸収されるノードの順が違えば偽"` の前に追加する:

```typescript
  it("連結した URL・URL の件数・重複の件数が違えば偽（L-036）", () => {
    expect(isSameNodeMergePlan(base, { ...base, links: [LINK_A] })).toBe(false);
    expect(isSameNodeMergePlan(base, { ...base, linkSourceCount: base.linkSourceCount + 1 })).toBe(false);
    expect(isSameNodeMergePlan(base, { ...base, linkDuplicateCount: base.linkDuplicateCount + 1 })).toBe(false);
  });

  it("連結した URL は要素ごとに比べる（別の配列でも内容が同じなら真、順が違えば偽）", () => {
    const withLinks = { ...base, links: [LINK_A, LINK_B] };

    expect(isSameNodeMergePlan(withLinks, { ...base, links: [LINK_A, LINK_B] })).toBe(true);
    expect(isSameNodeMergePlan(withLinks, { ...base, links: [LINK_B, LINK_A] })).toBe(false);
  });
```

- `describe("mergeNodes", ...)` の中、`describe("イラストと高さ", ...)` の前に追加する:

```typescript
  describe("URL", () => {
    const withLinks = [
      node(1, null, "親"),
      node(2, 1, "a", { links: [LINK_A, LINK_B] }),
      node(3, 1, "b"),
      node(4, 1, "c", { links: [LINK_B, LINK_C] }),
    ];

    it("残すノードの URL は、選択中の URL を配列順に重複を除いて並べたもの（残すノードが URL を持たなくても付く）", () => {
      expect(byId(merged(withLinks, [2, 3, 4], 3).nodes, 3).links).toEqual([LINK_A, LINK_B, LINK_C]);
    });

    it("残すノードだけが URL を持つときは、その URL のまま", () => {
      expect(byId(merged(withLinks, [2, 3], 2).nodes, 2).links).toEqual([LINK_A, LINK_B]);
    });

    it("誰も URL を持たなければ links のキーを持たない", () => {
      const plain = [node(1, null, "親"), node(2, 1, "a"), node(3, 1, "b")];

      expect("links" in byId(merged(plain, [2, 3], 2).nodes, 2)).toBe(false);
    });

    it("重複を除いて上限を超えるときは links-too-many を返し、統合しない", () => {
      const many = [
        node(1, null, "親"),
        node(2, 1, "a", { links: urls("a", 6) }),
        node(3, 1, "b", { links: urls("b", 5) }),
      ];

      expect(mergeNodes(many, [2, 3], 2, " ", visibleOf(many), "manual")).toEqual({ ok: false, reason: "links-too-many" });
    });

    it("連結した URL は保存と読み込みで往復する", () => {
      const result = merged(withLinks, [2, 3, 4], 3);
      const parsed = parseMapDocumentJson(serializeMapDocument(createMapDocument(result.nodes, "manual")));

      expect(parsed.ok && parsed.value.nodes.find((item) => item.id === 3)?.links).toEqual([LINK_A, LINK_B, LINK_C]);
    });
  });
```

`client/src/domain/nodes/__tests__/nodeMergeMessages.test.ts` の `cases` の最後に足す:

```typescript
    ["links-too-many", "URLをまとめると件数の上限（10 件）を超えるため、統合できません。"],
```

`client/src/hooks/__tests__/nodeMergePreview.test.ts`:
- `"統合後のラベル・重要度の表示・付け替える子の件数・消えるノードのラベルを配列順にまとめる"` の期待値の `noteText: null,` の次に `linkText: null,` を足す。
- `describe("buildNodeMergePreview", ...)` の末尾（`"note-too-long の計画はプレビューを作らず、状態文言は失敗の文言"` の後）に追加する:

```typescript
  describe("URL の連結", () => {
    const A = "https://example.com/a";
    const B = "https://example.com/b";
    const C = "https://example.org/c";

    it("URL を持つノードが 1 つ以上あれば、重複を除いた件数と重複の件数を示す（URL の本文は出さない）", () => {
      const nodes = [node(1, "a", { links: [A, B] }), node(2, "b"), node(3, "c", { links: [B, C] })];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2, 3], 1))?.linkText).toBe("3 件（重複 1 件を除く）");
    });

    it("重複が無ければ括弧を出さない", () => {
      const nodes = [node(1, "a", { links: [A] }), node(2, "b", { links: [B] })];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.linkText).toBe("2 件");
    });

    it("URL が 1 つも無ければ null（行を出さない）", () => {
      const nodes = [node(1, "a"), node(2, "b")];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.linkText).toBeNull();
    });
  });

  it("links-too-many の計画はプレビューを作らず、状態文言は失敗の文言", () => {
    const plan: NodeMergePlan = { ok: false, reason: "links-too-many" };

    expect(buildNodeMergePreview([], plan)).toBeNull();
    expect(describeNodeMergeStatus(false, plan)).toBe("URLをまとめると件数の上限（10 件）を超えるため、統合できません。");
  });
```

`client/src/hooks/__tests__/useNodeMergeDialog.test.ts` の、開いた直後のプレビューの期待値（`expect(view.result.current.preview).toEqual({...})`）の `noteText: null,` の次に `linkText: null,` を足す。

`client/src/hooks/__tests__/useNodesSplitMerge.test.ts` の `describe("useNodes の mergeNodes", ...)` の中、`describe("失敗では何も変えず、選択も履歴も変えない", ...)` の中、最後の `it`（`"確認の後にメモが変わったら plan-changed…"`）の後に追加する:

```typescript
    it("重複を除いた URL が上限を超えるときは links-too-many で、何も変えない", () => {
      const urls = (prefix: string, count: number) => (
        Array.from({ length: count }, (_, index) => `https://example.com/${prefix}${index}`)
      );
      const many: NodeMapState = {
        layoutMode: "manual",
        nodes: mergeMap().nodes.map((item) => {
          if (item.id === 2) return { ...item, links: urls("a", 6) };
          if (item.id === 3) return { ...item, links: urls("b", 5) };
          return item;
        }),
      };
      const { result } = renderNodes(many);
      const before = result.current;

      const outcome = merge(() => result.current, [2, 3], 3);

      expect(outcome).toEqual({ ok: false, reason: "links-too-many" });
      expect(result.current.nodes).toBe(before.nodes);
      expect(result.current.canUndo).toBe(false);
    });

    it("確認の後に URL が増えたら plan-changed（連結後の URL が警告なしに変わらない）", () => {
      const { result } = renderNodes(mergeMap());
      const shown = planNodeMerge(result.current.nodes, [2, 3], 3, " ", ALL);
      act(() => { result.current.addNodeLink(2, "https://example.com/added"); });
      const before = result.current;

      let outcome!: MergeNodesResult;
      act(() => { outcome = result.current.mergeNodes([2, 3], 3, " ", ALL, shown); });

      expect(outcome).toEqual({ ok: false, reason: "plan-changed" });
      expect(result.current.nodes).toBe(before.nodes);
    });
```

`client/src/components/layout/__tests__/NodeMergeDialog.test.tsx`:
- `preview()` の fixture の `noteText: null,` の次に `linkText: null,` を足す。
- `describe("プレビュー", ...)` の中、`"メモが無いときは「メモ」の行を出さない"` の後に追加する:

```typescript
    it("URL を連結するときは「URL」の行に件数を出す。見出しは縮まない", () => {
      renderDialog({ preview: preview({ linkText: "3 件（重複 1 件を除く）" }) });

      const term = screen.getByText("URL");
      expect(term.tagName).toBe("DT");
      expect(term).toHaveClass("shrink-0");
      expect(term.nextElementSibling).toHaveTextContent("3 件（重複 1 件を除く）");
    });

    it("URL が無いときは「URL」の行を出さない", () => {
      renderDialog({ preview: preview({ linkText: null }) });

      expect(screen.queryByText("URL")).toBeNull();
    });
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/nodes/__tests__/nodeMerge.test.ts src/domain/nodes/__tests__/nodeMergeMessages.test.ts src/hooks/__tests__/nodeMergePreview.test.ts src/hooks/__tests__/useNodeMergeDialog.test.ts src/hooks/__tests__/useNodesSplitMerge.test.ts src/components/layout/__tests__/NodeMergeDialog.test.tsx`

Expected: FAIL（計画に `linkSourceCount`・`linkDuplicateCount` が無い（既存の `toEqual` も落ちる）、`links-too-many` にならない（`nodeMergeMessages` は `default` の分岐で理由の文字列をそのまま返す）、`isSameNodeMergePlan` が URL の違いを見ない、残すノードに `links` が付かない、プレビューに `linkText` が無い、ダイアログに「URL」の行が無い）。**次の追加分は、実装前でも PASS してよい**（現状と同じ結果を固定する検査）: `mergeNodes` の「誰も URL を持たなければ links のキーを持たない」、ダイアログの「URL が無いときは「URL」の行を出さない」。

- [ ] **Step 3: 実装する**

`client/src/domain/nodes/nodeMerge.ts`:
- import に `import { NODE_LINKS_MAX_COUNT, areNodeLinksEqual, withNodeLinks } from "@/domain/nodes/nodeLink";` を足す（`nodeLayoutForest` の import の次）。
- `NodeMergeFailureReason` の `| "note-too-long"` の次に足す:

```typescript
  // 選択中の URL を重複を除いて連結すると上限（NODE_LINKS_MAX_COUNT）を超える。黙って切り詰めない
  | "links-too-many"
```

- `NodeMergePlan` の成功側の `noteSourceCount: number;` の次に足す:

```typescript
    // 選択中のノードの URL を配列順に並べ、最初に出てきたものを残して重複を除いたもの。1 つも無ければ undefined
    links: readonly string[] | undefined;
    // URL を持つノードの件数
    linkSourceCount: number;
    // 重複で捨てる URL の件数（プレビューで見せる）
    linkDuplicateCount: number;
```

- `planNodeMerge` の `if (note !== undefined && !isNodeNoteWithinLimit(note)) return failed("note-too-long");` の直前のコメント `// 検査の順の最後（different-parents の後）` を `// 検査の順: different-parents の後` に改める（「最後」のコメントを 2 つにしない）。
- 同じ行（`return failed("note-too-long");`）の次に足す:

```typescript
  const linkLists = selected.flatMap((node) => (node.links === undefined || node.links.length === 0 ? [] : [node.links]));
  const allLinks = linkLists.flat();
  const links = [...new Set(allLinks)];
  // 検査の順の最後（note-too-long の後）
  if (links.length > NODE_LINKS_MAX_COUNT) return failed("links-too-many");
```

- `planNodeMerge` の戻り値の `noteSourceCount: notes.length,` の次に足す:

```typescript
    links: links.length === 0 ? undefined : links,
    linkSourceCount: linkLists.length,
    linkDuplicateCount: allLinks.length - links.length,
```

- `isSameNodeMergePlan` の上のコメントの 2 行目を次の 2 行にする:

```typescript
// イラストの扱いと引き継ぎ元・失われるイラストの件数・付け替える子の件数・連結したメモとその件数・連結した URL と
// その元の件数・重複で捨てる件数）で比べる（L-036）。URL は要素ごとに比べる（別の配列でも内容が同じなら同じ）。
```

- `isSameNodeMergePlan` の `&& a.noteSourceCount === b.noteSourceCount` の次に足す:

```typescript
    && areNodeLinksEqual(a.links, b.links)
    && a.linkSourceCount === b.linkSourceCount
    && a.linkDuplicateCount === b.linkDuplicateCount
```

- `applyPlanToSurvivor` の上のコメントの「（残すノードのメモも連結に含まれるので失われない）、連結結果が無ければ note のキーを持たせない。」の行を次の 2 行にする:

```typescript
// （残すノードのメモも連結に含まれるので失われない）、連結結果が無ければ note のキーを持たせない。URL も同じく
// 計画の連結結果で置き換え、連結結果が無ければ links のキーを持たせない。
```

- `applyPlanToSurvivor` の `const updated = ...;` を次にする:

```typescript
  const updated = withNodeLinks(
    withNodeNote({ ...survivor, label: plan.label, importance: plan.importance }, plan.note),
    plan.links,
  );
```

`client/src/domain/nodes/nodeMergeMessages.ts`:
- import に `import { NODE_LINKS_MAX_COUNT } from "@/domain/nodes/nodeLink";` を足す（`nodeNote` の import の前）。
- `case "note-too-long":` の `return` の次（`default` の前）に足す:

```typescript
    case "links-too-many":
      return { kind: "error", message: `URLをまとめると件数の上限（${NODE_LINKS_MAX_COUNT} 件）を超えるため、統合できません。` };
```

`client/src/hooks/nodeMergePreview.ts`:
- `NodeMergePreview` の `noteText: string | null;` の次に足す:

```typescript
  // URL の連結の説明（「N 件」、重複があれば「N 件（重複 M 件を除く）」。URL の本文は出さない）。URL が無ければ null
  linkText: string | null;
```

- `describeNote` の次に足す:

```typescript
function describeLinks(plan: Extract<NodeMergePlan, { ok: true }>): string | null {
  if (plan.links === undefined) return null;
  const duplicate = plan.linkDuplicateCount > 0 ? `（重複 ${plan.linkDuplicateCount} 件を除く）` : "";
  return `${plan.links.length} 件${duplicate}`;
}
```

- `buildNodeMergePreview` の戻り値の `noteText: describeNote(plan),` の次に `linkText: describeLinks(plan),` を足す。

`client/src/components/layout/NodeMergeDialog.tsx` の `<dl>` の中、「メモ」の行（`{preview.noteText !== null && (...)}`）の次に足す:

```tsx
              {preview.linkText !== null && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium">URL</dt>
                  <dd>{preview.linkText}</dd>
                </div>
              )}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/nodes src/hooks/__tests__/nodeMergePreview.test.ts src/hooks/__tests__/useNodeMergeDialog.test.ts src/hooks/__tests__/useNodesSplitMerge.test.ts src/components/layout/__tests__/NodeMergeDialog.test.tsx src/app/__tests__/pageNodeMerge.test.tsx src/app/__tests__/pageNodeNote.test.tsx`
Expected: PASS（`pageNodeMerge.test.tsx`・`pageNodeNote.test.tsx` は既存のまま通る。URL の無い統合ではプレビューに「URL」の行が出ない）

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし（`formatNodeMergeFailureNotice` の `never` による網羅性の検査も通る）。

---

### Task 5: ノード検索に URL を含める（`nodeLabelSearch`・`useNodeLabelSearch`・`NodeSearchBox`）

**Files:**
- Modify: `client/src/domain/search/nodeLabelSearch.ts`（`matchedBy`・`normalizedLinks`・`WeakMap`）
- Modify: `client/src/components/layout/NodeSearchBox.tsx`（「URL 一致」の表示と `optionName`）
- `client/src/hooks/useNodeLabelSearch.ts` と `client/src/types/nodeSearch.ts` はコードを変えない（`...match` と `NodeSearchMatch & { hidden }` で `matchedBy` がそのまま通る）
- Test: `client/src/domain/search/__tests__/nodeLabelSearch.test.ts`（既存の期待値を更新し、追記）
- Test: `client/src/hooks/__tests__/useNodeLabelSearch.test.ts`（既存の期待値を更新し、追記）
- Test: `client/src/components/layout/__tests__/NodeSearchBox.test.tsx`（既存の fixture を更新し、追記）

**Interfaces:**
- Consumes: `Node.links?: readonly string[]`（Task 1・2）
- Produces（`@/domain/search/nodeLabelSearch`）:
  - `NodeSearchMatch = { nodeId: number; label: string; parentLabel: string | null; matchedBy: "label" | "link" }`
  - `NodeSearchIndexEntry = Omit<NodeSearchMatch, "matchedBy"> & { normalizedLabel: string; normalizedLinks: readonly string[] }`
  - `createNodeSearchIndex`・`searchNodeLabels`・`normalizeNodeSearchText`・`normalizeNodeSearchQuery`・`MAX_NODE_SEARCH_RESULTS` の名前とシグネチャは変えない
- Produces（`@/types/nodeSearch`）: `NodeSearchListItem` に `matchedBy` が含まれる（型の定義は変えない）

- [ ] **Step 1: 失敗するテストを書き、既存の期待値を更新する**

`client/src/domain/search/__tests__/nodeLabelSearch.test.ts`（L-609。`matchedBy` は必須の項目なので、`toEqual` のリテラルをすべて直す）:
- `"検索語の前後の半角・全角空白を無視し、空白だけなら結果を返さない"` の `matches: [{ nodeId: 1, label: "ＡＢＣ１", parentLabel: null }],` を `matches: [{ nodeId: 1, label: "ＡＢＣ１", parentLabel: null, matchedBy: "label" }],` にする。
- `"入力順と元ラベルを保ち、親の表示ラベルを事前計算する"` の 3 つの期待値に `matchedBy: "label"` を足す:

```typescript
        { nodeId: 2, label: "Child", parentLabel: "新しいノード", matchedBy: "label" },
        { nodeId: 3, label: "orphan child", parentLabel: null, matchedBy: "label" },
        { nodeId: 4, label: "root child", parentLabel: null, matchedBy: "label" },
```

- `"索引エントリの公開された形を保つ"` の期待値を `expect(entry).toEqual({ nodeId: 1, label: "A", parentLabel: null, normalizedLabel: "a", normalizedLinks: [] });` にする。
- ファイルの末尾（最後の `});` の後）に追加する:

```typescript
describe("URL の検索", () => {
  // パス「パス」とクエリ「日本語」をパーセントエンコードした URL（保存される形）
  const JAPANESE = "https://example.com/%E3%83%91%E3%82%B9?q=%E6%97%A5%E6%9C%AC%E8%AA%9E";

  it("ラベルに無くても URL に含まれれば、matchedBy: link で返す", () => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "資料", links: ["https://example.com/report"] })]);

    expect(searchNodeLabels(index, "report")).toEqual({
      matches: [{ nodeId: 1, label: "資料", parentLabel: null, matchedBy: "link" }],
      total: 1,
    });
  });

  it("ラベルと URL の両方に一致すれば、ラベル一致として扱う", () => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "example", links: ["https://example.com/"] })]);

    expect(searchNodeLabels(index, "example").matches[0].matchedBy).toBe("label");
  });

  it("URL もラベルと同じ正規化（NFKC と小文字化）で照合する", () => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "資料", links: ["https://example.com/Report"] })]);

    expect(searchNodeLabels(index, "ＲＥＰＯＲＴ").total).toBe(1);
  });

  it.each(["パス", "日本語", "%E3%83%91"])("パーセントエンコードを戻した形でも、エンコードのままでも一致する（%s）", (query) => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "資料", links: [JAPANESE] })]);

    expect(searchNodeLabels(index, query).matches).toEqual([{ nodeId: 1, label: "資料", parentLabel: null, matchedBy: "link" }]);
  });

  it("不正なパーセントエンコードの URL は、例外にせず、エンコードのままで一致する", () => {
    const index = createNodeSearchIndex([createTestNode({ id: 1, label: "資料", links: ["https://example.com/%E3%81"] })]);

    expect(searchNodeLabels(index, "%e3%81").total).toBe(1);
  });

  it("URL の区切りをまたいで一致しない", () => {
    const index = createNodeSearchIndex([
      createTestNode({ id: 1, label: "資料", links: ["https://a.example/x", "https://b.example/y"] }),
    ]);

    expect(searchNodeLabels(index, "xhttps")).toEqual({ matches: [], total: 0 });
    expect(searchNodeLabels(index, "x https")).toEqual({ matches: [], total: 0 });
  });

  it("件数（total）にはラベル一致と URL 一致の両方を数え、並びは配列順", () => {
    const index = createNodeSearchIndex([
      createTestNode({ id: 1, label: "対象外" }),
      createTestNode({ id: 2, label: "URLだけ", links: ["https://example.com/target"] }),
      createTestNode({ id: 3, label: "target のラベル" }),
    ]);

    expect(searchNodeLabels(index, "target")).toEqual({
      matches: [
        { nodeId: 2, label: "URLだけ", parentLabel: null, matchedBy: "link" },
        { nodeId: 3, label: "target のラベル", parentLabel: null, matchedBy: "label" },
      ],
      total: 2,
    });
  });

  it("索引の normalizedLinks は、URL ごとにエンコードのままと戻した形を並べ、同じ文字列は 1 つにする", () => {
    const [withLinks, withoutLinks] = createNodeSearchIndex([
      createTestNode({ id: 1, links: ["https://example.com/Report", JAPANESE] }),
      createTestNode({ id: 2 }),
    ]);

    expect(withLinks.normalizedLinks).toEqual([
      "https://example.com/report",
      "https://example.com/%e3%83%91%e3%82%b9?q=%e6%97%a5%e6%9c%ac%e8%aa%9e",
      "https://example.com/パス?q=日本語",
    ]);
    expect(withoutLinks.normalizedLinks).toEqual([]);
  });

  it("links の配列が同じなら、索引を作り直しても decodeURI を繰り返さない", () => {
    const decodeSpy = jest.spyOn(globalThis, "decodeURI");
    const links = ["https://example.com/cache-test"];

    createNodeSearchIndex([createTestNode({ id: 1, label: "a", links })]);
    createNodeSearchIndex([createTestNode({ id: 1, label: "移動後", x: 500, links })]);
    expect(decodeSpy).toHaveBeenCalledTimes(1);

    // 内容が同じでも別の配列なら、作り直す
    createNodeSearchIndex([createTestNode({ id: 1, label: "a", links: [...links] })]);
    expect(decodeSpy).toHaveBeenCalledTimes(2);
    decodeSpy.mockRestore();
  });
});
```

`client/src/hooks/__tests__/useNodeLabelSearch.test.ts`:
- `"一致したノードに現在の表示状態を付けて返す"` の期待値の 2 行を、`{ nodeId: 1, label: "Alpha", parentLabel: null, matchedBy: "label", hidden: false },` と `{ nodeId: 2, label: "Alphabet", parentLabel: null, matchedBy: "label", hidden: true },` にする。
- `"nodesを差し替えると同じ検索語で索引と結果を作り直す"` の期待値を `{ nodeId: 2, label: "target new", parentLabel: null, matchedBy: "label", hidden: true },` にする。
- `"検索語を保持したままnodesとvisibleNodeIdsを同時に差し替えると最新候補と表示状態を返す"` の期待値の 2 行を、`{ nodeId: 2, label: "target visible", parentLabel: null, matchedBy: "label", hidden: false },` と `{ nodeId: 3, label: "target hidden", parentLabel: null, matchedBy: "label", hidden: true },` にする。
- `"空白だけの検索語では検索中にせず結果を返さない"` の後に追加する:

```typescript
  it("URL だけに一致したノードは matchedBy: link で、表示状態を付けて返す", () => {
    const nodes = [
      createTestNode({ id: 1, label: "資料", links: ["https://example.com/report"] }),
      createTestNode({ id: 2, label: "report のラベル" }),
    ];
    const { result } = renderHook(() =>
      useNodeLabelSearch({ nodes, visibleNodeIds: new Set([2]) }),
    );

    act(() => result.current.setQuery("report"));

    expect(result.current.total).toBe(2);
    expect(result.current.matches).toEqual([
      { nodeId: 1, label: "資料", parentLabel: null, matchedBy: "link", hidden: true },
      { nodeId: 2, label: "report のラベル", parentLabel: null, matchedBy: "label", hidden: false },
    ]);
  });
```

`client/src/components/layout/__tests__/NodeSearchBox.test.tsx`:
- 先頭の `matches` の 5 行に `matchedBy: "label",` を足す:

```typescript
const matches: readonly NodeSearchListItem[] = [
  { nodeId: 10, label: "親あり", parentLabel: "親ノード", matchedBy: "label", hidden: false },
  { nodeId: 20, label: "非表示の子", parentLabel: "親ノード", matchedBy: "label", hidden: true },
  { nodeId: 30, label: "ルート", parentLabel: null, matchedBy: "label", hidden: false },
  { nodeId: 40, label: "非表示ルート", parentLabel: null, matchedBy: "label", hidden: true },
  { nodeId: 50, label: "とても長いラベル", parentLabel: "別の親", matchedBy: "label", hidden: false },
];
```

- `"候補追加や並べ替えで選択IDが後方へ移ったら同じ候補へ再スクロールする"` の `addedMatches` の要素の `parentLabel: null,` の次に `matchedBy: "label" as const,` を足す（無いと `resultMatches` の型が合わない）。
- `"候補の親・ルート・非表示を表示し、アクセシブルネームで区別する"` の後に追加する:

```typescript
  it("URL だけで一致した候補は、補助行とアクセシブルネームに「URL 一致」を付ける", () => {
    const linkMatches: readonly NodeSearchListItem[] = [
      { nodeId: 60, label: "資料", parentLabel: "親ノード", matchedBy: "link", hidden: false },
      { nodeId: 70, label: "隠れた資料", parentLabel: null, matchedBy: "link", hidden: true },
      { nodeId: 80, label: "ラベル一致", parentLabel: null, matchedBy: "label", hidden: false },
    ];
    render(<Harness initialQuery="資料" resultMatches={linkMatches} />);

    const linkOnly = screen.getByRole("option", { name: "資料（親: 親ノード、URL 一致）" });
    expect(within(linkOnly).getByText(/親: 親ノード.*URL 一致/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "隠れた資料（ルート、非表示、URL 一致）" })).toBeInTheDocument();
    const labelOnly = screen.getByRole("option", { name: "ラベル一致（ルート）" });
    expect(labelOnly).not.toHaveTextContent("URL 一致");
  });
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/domain/search/__tests__/nodeLabelSearch.test.ts src/hooks/__tests__/useNodeLabelSearch.test.ts src/components/layout/__tests__/NodeSearchBox.test.tsx`

Expected: FAIL（結果に `matchedBy` が無い、索引に `normalizedLinks` が無い、URL だけの一致が見つからない、候補に「URL 一致」が出ない）。**次の追加分は、実装前でも PASS してよい**（現状と同じ結果を固定する検査）: 「URL の区切りをまたいで一致しない」（現状は URL を検索しないので 0 件）、`NodeSearchBox` の既存のテスト（`matchedBy: "label"` を足しても表示は変わらない）、`NodeSearchBox` の追加分の「ラベル一致（ルート）」の行。

- [ ] **Step 3: 実装する**

`client/src/domain/search/nodeLabelSearch.ts` を次にする:

```typescript
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import type { Node } from "@/types/node";

export const MAX_NODE_SEARCH_RESULTS = 50;

export type NodeSearchMatch = {
  nodeId: number;
  label: string;
  parentLabel: string | null;
  // ラベルで一致したか、URL だけで一致したか（ラベルと URL の両方に一致すればラベル）
  matchedBy: "label" | "link";
};

// 索引の段階では、どちらで一致するかは決まらない（matchedBy は検索結果を作るときに付ける）
export type NodeSearchIndexEntry = Omit<NodeSearchMatch, "matchedBy"> & {
  normalizedLabel: string;
  // URL ごとの正規化した文字列（エンコードのままと、decodeURI で戻した形）。URL が無ければ空
  normalizedLinks: readonly string[];
};

export type NodeSearchIndex = readonly NodeSearchIndexEntry[];

export type NodeSearchResultSet = {
  matches: NodeSearchMatch[];
  total: number;
};

const NO_NORMALIZED_LINKS: readonly string[] = Object.freeze([]);

// links の配列の参照を鍵にして、正規化の結果を使い回す（索引はノードが変わるたびに作り直されるが、
// links が変わらないノードでは decodeURI と正規化を繰り返さない）
const normalizedLinksCache = new WeakMap<readonly string[], readonly string[]>();

export function normalizeNodeSearchText(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function normalizeNodeSearchQuery(query: string): string {
  return normalizeNodeSearchText(query).trim();
}

// パーセントエンコードを戻した形。不正なパーセントエンコードで decodeURI が例外を投げるときは null
function decodeLinkForSearch(url: string): string | null {
  try {
    return decodeURI(url);
  } catch {
    return null;
  }
}

function normalizeNodeLinksForSearch(links: readonly string[] | undefined): readonly string[] {
  if (links === undefined || links.length === 0) return NO_NORMALIZED_LINKS;
  const cached = normalizedLinksCache.get(links);
  if (cached !== undefined) return cached;

  const normalized = new Set<string>();
  for (const url of links) {
    normalized.add(normalizeNodeSearchText(url));
    const decoded = decodeLinkForSearch(url);
    if (decoded !== null) normalized.add(normalizeNodeSearchText(decoded));
  }
  const result = Object.freeze([...normalized]);
  normalizedLinksCache.set(links, result);
  return result;
}

export function createNodeSearchIndex(nodes: readonly Node[]): NodeSearchIndex {
  const displayLabelsById = new Map<number, string>();
  for (const node of nodes) {
    displayLabelsById.set(node.id, getNodeDisplayLabel(node.label));
  }

  return nodes.map((node) => ({
    nodeId: node.id,
    label: getNodeDisplayLabel(node.label),
    parentLabel: node.parentId === null ? null : displayLabelsById.get(node.parentId) ?? null,
    normalizedLabel: node.label === "" ? "" : normalizeNodeSearchText(node.label),
    normalizedLinks: normalizeNodeLinksForSearch(node.links),
  }));
}

function findMatchedBy(entry: NodeSearchIndexEntry, normalizedQuery: string): NodeSearchMatch["matchedBy"] | null {
  if (entry.normalizedLabel.includes(normalizedQuery)) return "label";
  // URL ごとに別の要素なので、URL の区切りをまたいで一致しない
  if (entry.normalizedLinks.some((link) => link.includes(normalizedQuery))) return "link";
  return null;
}

// ラベルと URL（ノードの links）を検索する。名前は互換のため変えない
export function searchNodeLabels(
  index: NodeSearchIndex,
  query: string,
  limit: number = MAX_NODE_SEARCH_RESULTS
): NodeSearchResultSet {
  const normalizedQuery = normalizeNodeSearchQuery(query);
  if (normalizedQuery === "") return { matches: [], total: 0 };

  const matches: NodeSearchMatch[] = [];
  let total = 0;

  for (const entry of index) {
    const matchedBy = findMatchedBy(entry, normalizedQuery);
    if (matchedBy === null) continue;

    total += 1;
    if (matches.length < limit) {
      const { nodeId, label, parentLabel } = entry;
      matches.push({ nodeId, label, parentLabel, matchedBy });
    }
  }

  return { matches, total };
}
```

`client/src/components/layout/NodeSearchBox.tsx`:
- `optionName` を次にする:

```typescript
// 候補のアクセシブルネーム。「ラベル（親: X、非表示、URL 一致）」の形で、該当するものだけを並べる
function optionName(match: NodeSearchListItem): string {
  const details = [
    match.parentLabel === null ? "ルート" : `親: ${match.parentLabel}`,
    ...(match.hidden ? ["非表示"] : []),
    ...(match.matchedBy === "link" ? ["URL 一致"] : []),
  ];
  return `${match.label}（${details.join("、")}）`;
}
```

- 候補の補助行の `{match.hidden && " · 非表示"}` の次の行に足す:

```tsx
                    {match.matchedBy === "link" && " · URL 一致"}
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/domain/search src/hooks/__tests__/useNodeLabelSearch.test.ts src/hooks/__tests__/useNodeSearchNavigation.test.ts src/components/layout/__tests__/NodeSearchBox.test.tsx src/app/__tests__/pageSearch.test.tsx`
Expected: PASS（`pageSearch.test.tsx` の既存の候補名「検索対象（親: 親ノード）」などはラベル一致なので変わらない）

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし。`matchedBy` を持たない `NodeSearchMatch`・`NodeSearchListItem` のリテラルが残っていれば型エラーになるので、`cd client && grep -rn "parentLabel:" src --include='*.ts' --include='*.tsx'` で残りが無いことを確かめる。

---

### Task 6: キャンバスの「リンクあり」の印（`renderMapNodes`）

**Files:**
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`（`createNodeLinkMarker` と定数）
- Modify: `client/src/components/map/pixi/testing/pixiTestHarness.ts`（`Graphics` のモックに `circle`）
- Modify: `client/src/components/map/testing/mapStageTestRuntime.tsx`（`Graphics` のモックに `circle`。`pageModuleMocks.ts` の `createPagePixiModuleMock` もこれを使う）
- Test: `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`（追記）
- Test: `client/src/domain/imageExport/__tests__/mapSvgNodes.test.ts`（追記。画像書き出しに出ないことの固定）

**Interfaces:**
- Consumes: `Node.links?: readonly string[]`（Task 1・2）
- Produces: なし（`renderMapNodes` のシグネチャは変えない。内部関数 `createNodeLinkMarker(constructors: PixiConstructors, node: Node): Graphics | null`）

- [ ] **Step 1: 失敗するテストを書き、テスト用のモックに `circle` を足す**

`client/src/components/map/pixi/testing/pixiTestHarness.ts` の `Graphics` のモックの `rect: jest.fn().mockReturnThis(),` の次に足す:

```typescript
    circle: jest.fn().mockReturnThis(),
```

`client/src/components/map/testing/mapStageTestRuntime.tsx` の `Graphics: jest.fn().mockImplementation(() => ({` の中、`rect: jest.fn().mockReturnThis(),` の次に足す（無いと、URL を持つノードを描くページ統合のテスト（Task 7）が `TypeError: marker.circle is not a function` で落ちる）:

```typescript
      circle: jest.fn().mockReturnThis(),
```

`client/src/components/map/pixi/__tests__/renderMapNodes.test.ts` の `describe("renderMapNodes", ...)` の中、最後の `describe("並べ替えのドラッグ中のノード", ...)` の後（ファイルの最後の `});` の前）に追加する:

```typescript
  describe("リンクありの印", () => {
    const linkedNode = createTestNode({
      id: 2, parentId: null, x: 200, y: 30, width: 120, height: 60, label: "資料", links: ["https://example.com/"],
    });

    function renderWithLinks(siblingReorderSourceNodeId: number | null = null) {
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        nodes: [node, linkedNode], selectedNodeIds: [], editingNodeId: null, connectionTargetNodeId: null,
        siblingReorderSourceNodeId, onNodePointerDown: jest.fn(), visibleKeys: new Set(["node:1", "node:2"]),
      });
      const containers = harness.stage.addChild.mock.calls.map(
        ([container]: [unknown]) => container as { addChild: jest.Mock },
      );
      const childrenOf = (index: number) => containers[index].addChild.mock.calls.map(
        ([child]: [unknown]) => child as { alpha?: number },
      );
      return { ...harness, childrenOf };
    }

    it("URL を持つノードにだけ、右上の角を中心に半径 6 の青い円（白い縁）を最前面に描く", () => {
      const { Graphics, Text, childrenOf } = renderWithLinks();

      // 枠 2 つと印 1 つ
      expect(Graphics).toHaveBeenCalledTimes(3);
      expect(childrenOf(0)).toEqual([Graphics.mock.results[0].value, Text.mock.results[0].value]);
      const marker = Graphics.mock.results[2].value;
      expect(childrenOf(1)).toEqual([Graphics.mock.results[1].value, Text.mock.results[1].value, marker]);
      expect(marker.circle).toHaveBeenCalledWith(320, 30, 6);
      expect(marker.fill).toHaveBeenCalledWith({ color: 0x3b82f6 });
      expect(marker.stroke).toHaveBeenCalledWith({ width: 2, color: 0xffffff });
    });

    it("並べ替えのドラッグ中のノードでは、印も同じく半透明にする", () => {
      const { childrenOf } = renderWithLinks(2);

      expect(childrenOf(1).map((child) => child.alpha)).toEqual([0.5, 0.5, 0.5]);
    });

    it("ラベルの編集中も印は描く（クリックはノードの Container が受ける）", () => {
      const harness = createPixiTestHarness();
      renderMapNodes(harness.app.stage as never, harness.constructors as never, {
        nodes: [linkedNode], selectedNodeIds: [2], editingNodeId: 2, connectionTargetNodeId: null,
        siblingReorderSourceNodeId: null, onNodePointerDown: jest.fn(), visibleKeys: new Set(["node:2"]),
      });

      expect(harness.Graphics).toHaveBeenCalledTimes(2);
      expect(harness.Graphics.mock.results[1].value.circle).toHaveBeenCalledWith(320, 30, 6);
    });
  });
```

`client/src/domain/imageExport/__tests__/mapSvgNodes.test.ts` の末尾に追加する:

```typescript
it("URL の有無で画像書き出しの内容は変わらない（リンクありの印はキャンバス表示専用）", () => {
  const bounds = { minX: 0, minY: 0, width: 164, height: 124, offsetX: 32, offsetY: 32 };
  const plain = createTestNode({ label: "資料" });

  expect(createMapSvgNodes([{ ...plain, links: ["https://example.com/"] }], bounds, measureText))
    .toEqual(createMapSvgNodes([plain], bounds, measureText));
});
```

- [ ] **Step 2: RED を確認する**

Run: `cd client && npx jest src/components/map/pixi/__tests__/renderMapNodes.test.ts src/domain/imageExport/__tests__/mapSvgNodes.test.ts`
Expected: `renderMapNodes.test.ts` の「リンクありの印」の 3 件が FAIL（`Graphics` が 2 回しか呼ばれない・印が `addChild` されない）。`mapSvgNodes.test.ts` の追加分は**実装前でも PASS してよい**（画像書き出しは `links` を読まない現状を固定する。実装は変えない）。

- [ ] **Step 3: 実装する**

`client/src/components/map/pixi/renderMapNodes.ts`:
- `const DRAGGED_NODE_ALPHA = 0.5;` の次に足す:

```typescript

// 「リンクあり」の印。ノードの右上の角に重ねる小さな円（枠と同じ青、白い縁）。キャンバス表示専用で、画像書き出しには出さない
const LINK_MARKER_RADIUS = 6;
const LINK_MARKER_COLOR = 0x3b82f6;
const LINK_MARKER_BORDER_WIDTH = 2;
const LINK_MARKER_BORDER_COLOR = 0xffffff;
```

- `function createNodeLabelText(` の前に足す:

```typescript
// URL を 1 件以上持つノードだけに印を作る。中心は右上の角（x + width, y）なので、ラベル（折り返し幅 width - 16）にも
// イラスト（中央）にも重ならない。選択・接続先の色には影響されない。eventMode は親の Container のまま（表示専用）
function createNodeLinkMarker(constructors: PixiConstructors, node: Node): Graphics | null {
  if (node.links === undefined || node.links.length === 0) return null;
  const marker = new constructors.Graphics();
  marker.circle(node.x + node.width, node.y, LINK_MARKER_RADIUS)
    .fill({ color: LINK_MARKER_COLOR })
    .stroke({ width: LINK_MARKER_BORDER_WIDTH, color: LINK_MARKER_BORDER_COLOR });
  return marker;
}

```

- `renderMapNodes` のループの中、ラベルの `if (!isEditing) { ... }` の次（`stage.addChild(container);` の前）に足す:

```typescript

    const marker = createNodeLinkMarker(constructors, node);
    if (marker !== null) {
      marker.alpha = contentAlpha;
      container.addChild(marker);
    }
```

- [ ] **Step 4: GREEN を確認する**

Run: `cd client && npx jest src/components/map src/domain/imageExport`
Expected: PASS

- [ ] **Step 5: このタスクの範囲を検証する**

Run: `cd client && npm run typecheck && npm run lint`
Expected: 型エラー・lint エラーなし。

---

### Task 7: 右パネルの「リンク」節（`NodeLinksSection`・`NodeDetailPanel`）と `MapEditor` の配線、ページ統合テスト

**Files:**
- Create: `client/src/components/layout/NodeLinksSection.tsx`
- Modify: `client/src/components/layout/NodeDetailPanel.tsx`（props に `links`・`onAddLink`・`onRemoveLink`、メモとイラストの間に `NodeLinksSection`）
- Modify: `client/src/components/map/MapEditor.tsx`（`addNodeLink`・`removeNodeLink` を `NodeDetailPanel` へ渡す）
- Test: `client/src/components/layout/__tests__/NodeLinksSection.test.tsx`（新規）
- Test: `client/src/components/layout/__tests__/NodeDetailPanel.test.tsx`（全体を置き換える）
- Test: `client/src/app/__tests__/pageNodeLinks.test.tsx`（新規）

**Interfaces:**
- Consumes（Task 1）: `NODE_LINKS_MAX_COUNT`、`formatNodeLinkFailure(reason)`、`toSafeLinkHref(value): string | null`、`type AddNodeLinkOutcome`、`addNodeLink`・`removeNodeLink`（部品のテストの `Harness` で使う）（`@/domain/nodes/nodeLink`）。（Task 2）`ExportedNode.links`・`V3SeedNode` の `links`（`@/app/testing/pageTestHelpers`）。（Task 3）`useNodes().addNodeLink(id, input): AddNodeLinkOutcome`・`removeNodeLink(id, url): boolean`。（Task 4）統合のプレビューの「URL」の行。（Task 5）検索の候補名の「URL 一致」。（Task 6）`mapStageTestRuntime` の `Graphics` の `circle`
- Produces:
  - `NodeLinksSection`（`@/components/layout/NodeLinksSection`）の props: `{ node: Pick<Node, "id" | "label" | "links"> | null; documentRevision: number; onAddLink: (id: number, input: string) => AddNodeLinkOutcome; onRemoveLink: (id: number, url: string) => boolean }`
  - 作り直しの規則: `NodeDetailPanel` は `NodeLinksSection` を**ノードの ID だけ**の `key`（`links:${id}`、未選択は `links:none`）で作り直す。`documentRevision` では作り直さず、`NodeLinksSection` が描画中に前回の世代（`useState` で持つ）と比べ、変わったら入力欄の下書きとエラーを空にする（React の「props の変化に応じた state の調整」の書き方。既存の `useReannouncedNotice` と同じ。L-588）。作り直すと、リンクや「削除」ボタンにあったフォーカスが `body` へ落ちるため（L-155）
  - `NodeDetailPanel` の props: `selectedNode: Pick<Node, "id" | "label" | "note" | "links" | "illustration"> | null` と、追加の `onAddLink: (id: number, input: string) => AddNodeLinkOutcome`・`onRemoveLink: (id: number, url: string) => boolean`
  - 画面の構造: 「リンク」節は `<section aria-labelledby>`（role `region`、名前「リンク」）。見出し `<h2>`「リンク」、入力欄の名前「URLを追加」、追加ボタン「追加」、削除ボタンの名前「リンクを削除: {URL}」、件数「N / 10 件」、上限の `role="status"`「上限（10 件）に達しました」、エラーの `role="alert"`

- [ ] **Step 1: 失敗するテストを書く（部品）**

`client/src/components/layout/__tests__/NodeLinksSection.test.tsx`:

```tsx
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeLinksSection } from "@/components/layout/NodeLinksSection";
import { NODE_LINKS_MAX_COUNT, addNodeLink, removeNodeLink, type AddNodeLinkOutcome } from "@/domain/nodes/nodeLink";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const A = "https://example.com/a";
const B = "https://example.org/b";

// 正規化済みの URL を count 件（https://example.com/link0 …）
function linksOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `https://example.com/link${index}`);
}

type HarnessProps = {
  links?: readonly string[];
  documentRevision?: number;
  onAdd?: jest.Mock;
  onRemove?: jest.Mock;
};

// useNodes の代わりにドメインの addNodeLink・removeNodeLink で状態を持ち、部品と規則を実際の DOM イベントでつなぐ（L-737）
function Harness({ links, documentRevision = 0, onAdd = jest.fn(), onRemove = jest.fn() }: HarnessProps) {
  const [nodes, setNodes] = useState<Node[]>(() => [
    createTestNode({ id: 1, label: "りんご", ...(links === undefined ? {} : { links }) }),
  ]);
  const addLink = (id: number, input: string): AddNodeLinkOutcome => {
    onAdd(id, input);
    const result = addNodeLink(nodes, id, input);
    if (!result.ok) return { ok: false, reason: result.reason };
    setNodes(result.nodes);
    return { ok: true };
  };
  const removeLink = (id: number, url: string): boolean => {
    onRemove(id, url);
    const next = removeNodeLink(nodes, id, url);
    if (next === null) return false;
    setNodes(next);
    return true;
  };
  return (
    <NodeLinksSection
      node={nodes[0]}
      documentRevision={documentRevision}
      onAddLink={addLink}
      onRemoveLink={removeLink}
    />
  );
}

function section(): HTMLElement {
  return screen.getByRole("region", { name: "リンク" });
}

function urlInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "URLを追加" }) as HTMLInputElement;
}

function addButton(): HTMLElement {
  return screen.getByRole("button", { name: "追加" });
}

describe("NodeLinksSection", () => {
  it("見出し「リンク」の領域に、対象ノードの表示ラベルを出す", () => {
    render(<Harness />);

    expect(within(section()).getByRole("heading", { name: "リンク" })).toBeInTheDocument();
    expect(within(section()).getByText("対象ノード").nextElementSibling).toHaveTextContent("りんご");
  });

  it("未選択では案内だけを出し、入力欄・ボタンを描かない", () => {
    render(<NodeLinksSection node={null} documentRevision={0} onAddLink={jest.fn()} onRemoveLink={jest.fn()} />);

    expect(within(section()).getByText("ノードを選択してください")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("URL が無いときは「リンクはありません」と「0 / 10 件」を出す", () => {
    render(<Harness />);

    expect(screen.getByText("リンクはありません")).toBeInTheDocument();
    expect(screen.getByText("0 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("URL を順に、新しいタブで開くリンク（noopener noreferrer）と削除ボタンで並べる", () => {
    render(<Harness links={[A, B]} />);

    const links = within(section()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([A, B]);
    expect(links[0]).toHaveAttribute("href", A);
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[0]).toHaveAttribute("title", A);
    expect(screen.getByRole("button", { name: `リンクを削除: ${A}` })).toBeInTheDocument();
    expect(screen.getByText("2 / 10 件")).toBeInTheDocument();
  });

  it("正規化済みの http/https でない値は <a> にせず、文字だけを出す（toSafeLinkHref が null）", () => {
    render(
      <NodeLinksSection
        node={{ id: 1, label: "a", links: ["javascript:alert(1)", "https://example.com"] }}
        documentRevision={0}
        onAddLink={jest.fn()}
        onRemoveLink={jest.fn()}
      />,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("javascript:alert(1)").tagName).toBe("SPAN");
    expect(screen.getByText("https://example.com").tagName).toBe("SPAN");
  });

  it("入力欄は type=url・autocomplete=off・maxLength なしで、フォームはブラウザの検証をしない（noValidate）", () => {
    render(<Harness />);

    expect(urlInput()).toHaveAttribute("type", "url");
    expect(urlInput()).toHaveAttribute("autocomplete", "off");
    expect(urlInput()).not.toHaveAttribute("maxlength");
    expect(urlInput().form).toHaveAttribute("novalidate");
  });

  it("「追加」で入力のまま渡し、正規化した URL が並び、入力欄を空にしてフォーカスを入力欄に置く", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    await user.type(urlInput(), "HTTPS://Example.com/docs");
    await user.click(addButton());

    expect(onAdd).toHaveBeenCalledWith(1, "HTTPS://Example.com/docs");
    expect(screen.getByRole("link", { name: "https://example.com/docs" })).toBeInTheDocument();
    expect(urlInput()).toHaveValue("");
    expect(urlInput()).toHaveFocus();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("入力欄の Enter で追加する", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(urlInput(), `${A}{Enter}`);

    expect(screen.getByRole("link", { name: A })).toBeInTheDocument();
  });

  it("空のまま追加しても何もしない（追加を呼ばず、エラーも出さない）", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    await user.click(addButton());
    await user.type(urlInput(), "   {Enter}");

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each<[string, string, readonly string[] | undefined, string]>([
    ["javascript:", "javascript:alert(1)", undefined, "http または https の URL だけを追加できます。"],
    ["スキームが無い", "example.com", undefined, "URLの形式が正しくありません。https:// から始まる URL を入力してください。"],
    ["資格情報つき", "https://user:pass@example.com/", undefined, "ユーザー名やパスワードを含む URL は追加できません。"],
    ["重複", "https://EXAMPLE.com/a", [A], "同じ URL がすでに追加されています。"],
    ["長すぎる", `https://example.com/${"a".repeat(2048)}`, undefined, "URLが長すぎます（2,048 文字まで。日本語などはエンコードで長くなります）。"],
  ])("%s は理由を role=alert で出し、入力を残す", (_name, value, links, message) => {
    render(<Harness links={links} />);
    fireEvent.change(urlInput(), { target: { value } });

    fireEvent.submit(urlInput().form!);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(urlInput()).toHaveValue(value);
    expect(urlInput()).toHaveAttribute("aria-invalid", "true");
    expect(urlInput().getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
  });

  it("入力を変えるとエラーを消す", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(urlInput(), "example.com{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.type(urlInput(), "/");

    expect(screen.queryByRole("alert")).toBeNull();
    expect(urlInput()).not.toHaveAttribute("aria-invalid");
  });

  it.each([[{ isComposing: true }], [{ keyCode: 229 }], [{ repeat: true }]])(
    "IME の変換中・押し続けの Enter（%o）では送信しない（L-474・L-408）",
    (init) => {
      const onAdd = jest.fn();
      render(<Harness onAdd={onAdd} />);
      fireEvent.change(urlInput(), { target: { value: A } });

      expect(fireEvent.keyDown(urlInput(), { key: "Enter", ...init })).toBe(false);
      expect(onAdd).not.toHaveBeenCalled();
      expect(fireEvent.keyDown(urlInput(), { key: "Enter" })).toBe(true);
    },
  );

  it("10 件では「上限（10 件）に達しました」を出し、入力欄とボタンは有効のまま、追加すると too-many の文言を出す", () => {
    const onAdd = jest.fn();
    render(<Harness links={linksOf(NODE_LINKS_MAX_COUNT)} onAdd={onAdd} />);

    expect(screen.getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(screen.getByText("10 / 10 件")).toBeInTheDocument();
    expect(urlInput()).toBeEnabled();
    expect(addButton()).toBeEnabled();
    fireEvent.change(urlInput(), { target: { value: A } });
    fireEvent.submit(urlInput().form!);

    expect(onAdd).toHaveBeenCalledWith(1, A);
    expect(screen.getByRole("alert")).toHaveTextContent("リンクは 1 つのノードに 10 件まで追加できます。");
  });

  it("9 件から 10 件目を追加した直後も、フォーカスは入力欄にある", async () => {
    const user = userEvent.setup();
    render(<Harness links={linksOf(9)} />);

    await user.type(urlInput(), A);
    await user.click(addButton());

    expect(screen.getByText("10 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(urlInput()).toHaveFocus();
  });

  it("削除で指定の URL を消し、押したボタンが消えてもフォーカスを入力欄へ移す（L-155）", async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    render(<Harness links={[A, B]} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: `リンクを削除: ${A}` }));

    expect(onRemove).toHaveBeenCalledWith(1, A);
    expect(within(section()).getAllByRole("link").map((link) => link.textContent)).toEqual([B]);
    expect(urlInput()).toHaveFocus();
  });

  it("10 件から 9 件へ削除した直後も、フォーカスは入力欄にあり、上限の表示を消す", async () => {
    const user = userEvent.setup();
    render(<Harness links={linksOf(NODE_LINKS_MAX_COUNT)} />);

    await user.click(screen.getByRole("button", { name: "リンクを削除: https://example.com/link9" }));

    expect(screen.getByText("9 / 10 件")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(urlInput()).toHaveFocus();
  });
  it("documentRevision が変わると、作り直さずに入力欄の下書きとエラーを消す（フォーカスと要素はそのまま。L-588・L-155）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness links={[A]} />);
    await user.type(urlInput(), "example.com{Enter}");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const input = urlInput();
    const deleteButton = screen.getByRole("button", { name: `リンクを削除: ${A}` });
    deleteButton.focus();

    rerender(<Harness links={[A]} documentRevision={1} />);

    expect(urlInput()).toBe(input);
    expect(urlInput()).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: `リンクを削除: ${A}` })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("documentRevision が変わらない再描画では、下書きを消さない", () => {
    const { rerender } = render(<Harness />);
    fireEvent.change(urlInput(), { target: { value: A } });

    rerender(<Harness />);

    expect(urlInput()).toHaveValue(A);
  });
});
```

`client/src/components/layout/__tests__/NodeDetailPanel.test.tsx` を次で置き換える（既存のテストは残し、`onAddLink`・`onRemoveLink` の props、見出しの順、未選択の案内の数（2 → 3）、リンクの節の作り直しを足す）:

```tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeDetailPanel } from "@/components/layout/NodeDetailPanel";
import type { AddNodeLinkOutcome } from "@/domain/nodes/nodeLink";
import { createMapHistoryLeaseSpy, createTestMapHistoryLease } from "@/testing/createTestMapHistoryLease";

type Props = ComponentProps<typeof NodeDetailPanel>;

const APPLE_URL = "https://example.com/apple";

function renderPanel(overrides: Partial<Props> = {}) {
  const props: Props = {
    selectedNode: { id: 1, label: "りんご", note: "りんごのメモ", links: [APPLE_URL] },
    selectionCount: 1,
    documentRevision: 0,
    onPreviewNote: jest.fn(() => true),
    onBeginNoteEdit: jest.fn(() => createTestMapHistoryLease()),
    onAddLink: jest.fn((): AddNodeLinkOutcome => ({ ok: true })),
    onRemoveLink: jest.fn(() => true),
    generation: { status: "idle" },
    onGenerate: jest.fn(),
    onAttach: jest.fn(),
    onRemove: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeDetailPanel {...props} />) };
}

function panel(): HTMLElement {
  return screen.getByRole("complementary", { name: "ノードの詳細" });
}

function box(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: "詳細メモ" }) as HTMLTextAreaElement;
}

function urlInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "URLを追加" }) as HTMLInputElement;
}

describe("NodeDetailPanel", () => {
  it("名前付きの補足領域で、幅 w-72・縮まない・内容が高さを超えたら縦にスクロールする", () => {
    renderPanel();

    expect(panel()).toHaveClass("w-72", "shrink-0", "min-h-0", "overflow-y-auto");
  });

  it("上から詳細メモ、リンク、イラストの順に置く", () => {
    renderPanel();

    const headings = within(panel()).getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual(["詳細メモ", "リンク", "イラスト"]);
    expect(within(panel()).getByRole("region", { name: "リンク" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "イラスト" })).toBeInTheDocument();
  });

  it("イラストの機能は従来どおり（生成ボタンで選択中のノード ID を通知する）", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(props.onGenerate).toHaveBeenCalledWith(1);
  });

  it("未選択のときはメモの欄を無効にし、URL の入力欄を出さず、3 つの節すべてに案内を出す", () => {
    renderPanel({ selectedNode: null, selectionCount: 0 });

    expect(box()).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "URLを追加" })).toBeNull();
    expect(within(panel()).getAllByText("ノードを選択してください")).toHaveLength(3);
  });

  it("選択中のノードのメモと URL を出し、選択件数を渡す", () => {
    renderPanel({ selectionCount: 2 });

    expect(box()).toHaveValue("りんごのメモ");
    expect(screen.getByRole("link", { name: APPLE_URL })).toHaveAttribute("href", APPLE_URL);
    expect(screen.getByText("2 件選択中。主選択のノードのメモを編集します")).toBeInTheDocument();
  });

  it("URL の追加と削除は、選択中のノードの ID で通知する", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.type(urlInput(), "https://example.com/new{Enter}");
    await user.click(screen.getByRole("button", { name: `リンクを削除: ${APPLE_URL}` }));

    expect(props.onAddLink).toHaveBeenCalledWith(1, "https://example.com/new");
    expect(props.onRemoveLink).toHaveBeenCalledWith(1, APPLE_URL);
  });

  it("選択の ID が変わると作り直す。フォーカスを外さずに変わっても、前のノードの下書きを反映してから切り替える", () => {
    const spy = createMapHistoryLeaseSpy();
    const { props, rerender } = renderPanel({ onBeginNoteEdit: spy.onBeginNodeMove });
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "下書き" } });
    fireEvent.change(urlInput(), { target: { value: "https://example.com/draft" } });

    rerender(<NodeDetailPanel {...props} selectedNode={{ id: 2, label: "みかん" }} />);

    expect(props.onPreviewNote).toHaveBeenCalledWith(1, "下書き");
    expect(box()).toHaveValue("");
    expect(urlInput()).toHaveValue("");
    expect(screen.getByText("リンクはありません")).toBeInTheDocument();
  });

  it("documentRevision が変わると作り直し、文書の入れ替え（グループの失効）では古い下書きを書かない（L-588）", () => {
    const spy = createMapHistoryLeaseSpy();
    const { props, rerender } = renderPanel({ onBeginNoteEdit: spy.onBeginNodeMove });
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "古い下書き" } });
    spy.expire();

    rerender(<NodeDetailPanel {...props} documentRevision={1} selectedNode={{ id: 1, label: "りんご", note: "新しい文書のメモ" }} />);

    expect(props.onPreviewNote).not.toHaveBeenCalled();
    expect(box()).toHaveValue("新しい文書のメモ");
  });

  it("documentRevision が変わると、リンクの節は作り直さずに入力とエラーだけを消し、削除ボタンのフォーカスを保つ（L-588・L-155）", () => {
    const { props, rerender } = renderPanel({
      onAddLink: jest.fn((): AddNodeLinkOutcome => ({ ok: false, reason: "invalid" })),
    });
    fireEvent.change(urlInput(), { target: { value: "example.com" } });
    fireEvent.submit(urlInput().form!);
    expect(within(panel()).getByRole("alert")).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: `リンクを削除: ${APPLE_URL}` });
    act(() => deleteButton.focus());

    rerender(<NodeDetailPanel {...props} documentRevision={1} />);

    expect(within(panel()).queryByRole("alert")).toBeNull();
    expect(urlInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: `リンクを削除: ${APPLE_URL}` })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });
});
```

- [ ] **Step 2: RED を確認する（部品）**

Run: `cd client && npx jest src/components/layout/__tests__/NodeLinksSection.test.tsx src/components/layout/__tests__/NodeDetailPanel.test.tsx`
Expected: `NodeLinksSection.test.tsx` が `Cannot find module '@/components/layout/NodeLinksSection'` で FAIL。`NodeDetailPanel.test.tsx` は、見出しの順（`["詳細メモ", "イラスト"]` になる）、案内の数（2 になる）、「URLを追加」の入力欄が無いことで、該当のテストが FAIL する。`NodeLinksSection.test.tsx` の「documentRevision が変わると、作り直さずに…」と `NodeDetailPanel.test.tsx` の「documentRevision が変わると、リンクの節は作り直さずに…」は、`key` に `documentRevision` を含める実装（作り直す実装）では要素が別物になってフォーカスも失われるので FAIL する（この 2 件が key の規則の回帰を止める）。**次は実装前でも PASS してよい**（既存の挙動の固定）: 幅・スクロールのクラス、イラストの生成、「documentRevision が変わると作り直し、文書の入れ替え…では古い下書きを書かない」（メモだけを見るテスト）。

- [ ] **Step 3: 部品を実装する**

`client/src/components/layout/NodeLinksSection.tsx`:

```tsx
"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import {
  NODE_LINKS_MAX_COUNT,
  formatNodeLinkFailure,
  toSafeLinkHref,
  type AddNodeLinkOutcome,
} from "@/domain/nodes/nodeLink";
import type { Node } from "@/types/node";

type NodeLinksSectionProps = {
  // 対象のノード（主選択）。未選択のときは null
  node: Pick<Node, "id" | "label" | "links"> | null;
  // 文書の世代（useNodes の documentRevision）。変わったら入力欄の下書きとエラーを消す
  documentRevision: number;
  onAddLink: (id: number, input: string) => AddNodeLinkOutcome;
  onRemoveLink: (id: number, url: string) => boolean;
};

const NO_LINKS: readonly string[] = [];

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";

// 右パネルの「リンク」節。一覧（開く・削除）と追加のフォームを持ち、入力欄の下書き・エラーの文言・フォーカスを受け持つ。
// NodeDetailPanel が対象のノードの ID だけを key にして作り直す（別のノードの下書きを引き継がない）。
// documentRevision（Undo / Redo・JSON 読み込み・マップの切り替えで増える）では作り直さず、描画中に前回の世代と比べて
// 下書きとエラーだけを消す（L-588）。作り直すと、リンクや削除ボタンにあったフォーカスが body へ落ち、続けて押した
// Delete などのキーがマップの操作になるため（L-155）。入力欄とボタンは disabled にしない（L-155・L-157）
export function NodeLinksSection({ node, documentRevision, onAddLink, onRemoveLink }: NodeLinksSectionProps) {
  const headingId = useId();
  const inputId = useId();
  const countId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seenRevision, setSeenRevision] = useState(documentRevision);

  // 文書が入れ替わったら、古い下書きとエラーを新しい文書へ残さない（レンダー中に調整し、effect 内の同期 setState を避ける）
  if (documentRevision !== seenRevision) {
    setSeenRevision(documentRevision);
    setInput("");
    setError(null);
  }
  const links = node?.links ?? NO_LINKS;
  const isAtLimit = links.length >= NODE_LINKS_MAX_COUNT;

  // 確定は送信の 1 か所だけ（type="url" のブラウザの検証は noValidate で止め、独自の文言を出す。L-057・L-161）
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (node === null || input.trim() === "") return;
    const outcome = onAddLink(node.id, input);
    if (outcome.ok) {
      setInput("");
      setError(null);
      inputRef.current?.focus();
      return;
    }
    if (outcome.reason !== "empty") setError(formatNodeLinkFailure(outcome.reason));
  };

  // IME の変換中の Enter（L-474）と、押し続けの Enter（L-408）では送信しない
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) event.preventDefault();
  };

  // 押した削除ボタンは消えるので、フォーカスを常に有効な入力欄へ移す（L-155）
  const handleRemove = (url: string) => {
    if (node === null) return;
    if (onRemoveLink(node.id, url)) setError(null);
    inputRef.current?.focus();
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">リンク</h2>
      {node === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">対象ノード</span>
            <p
              className="line-clamp-3 break-words text-sm text-zinc-800 dark:text-zinc-100"
              title={node.label || undefined}
            >
              {getNodeDisplayLabel(node.label)}
            </p>
          </div>
          {links.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">リンクはありません</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {links.map((url) => {
                const href = toSafeLinkHref(url);
                return (
                  <li key={url} className="flex items-center gap-2">
                    {href === null ? (
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100" title={url}>
                        {url}
                      </span>
                    ) : (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={url}
                        className="min-w-0 flex-1 truncate text-sm text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-300"
                      >
                        {url}
                      </a>
                    )}
                    <button
                      type="button"
                      aria-label={`リンクを削除: ${url}`}
                      className={buttonClassName}
                      onClick={() => handleRemove(url)}
                    >
                      削除
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p id={countId} className="text-xs text-zinc-500 dark:text-zinc-400">
              {`${links.length} / ${NODE_LINKS_MAX_COUNT} 件`}
            </p>
            {/* ライブリージョンは常に描画し、中身だけを替える */}
            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
              {isAtLimit ? `上限（${NODE_LINKS_MAX_COUNT} 件）に達しました` : ""}
            </p>
          </div>
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">URLを追加</label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id={inputId}
                type="url"
                autoComplete="off"
                value={input}
                aria-invalid={error === null ? undefined : "true"}
                aria-describedby={error === null ? countId : `${countId} ${errorId}`}
                onChange={(event) => {
                  setInput(event.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button type="submit" className={buttonClassName}>追加</button>
            </div>
            {error !== null && (
              <p id={errorId} role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
```

`client/src/components/layout/NodeDetailPanel.tsx` を次にする（`NodeLinksSection` の `key` はノードの ID だけにし、`documentRevision` は props で渡す。`key` には、兄弟の `NodeNoteEditor` の `key`（`${id}:${documentRevision}`）と同じ文字列にならないよう `links:` を前に付ける。同じだと React が兄弟の key の重複として扱い、テキスト欄が二重に描かれる）:

```tsx
import { IllustrationPanel } from "@/components/layout/IllustrationPanel";
import { NodeLinksSection } from "@/components/layout/NodeLinksSection";
import { NodeNoteEditor } from "@/components/layout/NodeNoteEditor";
import { NodeNoteSection } from "@/components/layout/NodeNoteSection";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import type { AddNodeLinkOutcome } from "@/domain/nodes/nodeLink";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { Node } from "@/types/node";

type NodeDetailPanelProps = {
  selectedNode: Pick<Node, "id" | "label" | "note" | "links" | "illustration"> | null;
  selectionCount: number;
  documentRevision: number;
  onPreviewNote: (id: number, note: string) => boolean;
  onBeginNoteEdit: () => MapHistoryGroupLease;
  onAddLink: (id: number, input: string) => AddNodeLinkOutcome;
  onRemoveLink: (id: number, url: string) => boolean;
  generation: IllustrationGenerationState;
  onGenerate: (nodeId: number) => void;
  onAttach: (nodeId: number, dataUrl: string) => void;
  onRemove: (nodeId: number) => void;
};

// 右のパネル。上から詳細メモ、リンク、イラストを縦に積み、内容が高さを超えたら縦にスクロールする
export function NodeDetailPanel({
  selectedNode,
  selectionCount,
  documentRevision,
  onPreviewNote,
  onBeginNoteEdit,
  onAddLink,
  onRemoveLink,
  generation,
  onGenerate,
  onAttach,
  onRemove,
}: NodeDetailPanelProps) {
  return (
    <aside
      aria-label="ノードの詳細"
      className="flex min-h-0 w-72 shrink-0 flex-col gap-6 overflow-y-auto border-l border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
    >
      {selectedNode === null ? (
        <NodeNoteSection targetLabel={null} selectionCount={selectionCount} editing={null} />
      ) : (
        <NodeNoteEditor
          key={`${selectedNode.id}:${documentRevision}`}
          node={selectedNode}
          selectionCount={selectionCount}
          onPreviewNote={onPreviewNote}
          onBeginNoteEdit={onBeginNoteEdit}
        />
      )}
      {/* key はノードの ID だけ（兄弟の NodeNoteEditor と重ならないよう接頭辞を付ける）。documentRevision では作り直さず、
          節の中で下書きとエラーだけを消す（作り直すとリンク・削除ボタンのフォーカスが body へ落ちる。L-155・L-588） */}
      <NodeLinksSection
        key={selectedNode === null ? "links:none" : `links:${selectedNode.id}`}
        node={selectedNode}
        documentRevision={documentRevision}
        onAddLink={onAddLink}
        onRemoveLink={onRemoveLink}
      />
      <IllustrationPanel
        selectedNode={selectedNode}
        generation={generation}
        onGenerate={onGenerate}
        onAttach={onAttach}
        onRemove={onRemove}
      />
    </aside>
  );
}
```

- [ ] **Step 4: GREEN を確認する（部品）**

Run: `cd client && npx jest src/components/layout/__tests__/NodeLinksSection.test.tsx src/components/layout/__tests__/NodeDetailPanel.test.tsx`
Expected: PASS（`NodeLinksSection` 24 件、`NodeDetailPanel` 9 件）。この時点では `MapEditor` が新しい props を渡していないので `npm run typecheck` は `MapEditor.tsx` で失敗する（Step 7 で直す）。

- [ ] **Step 5: 失敗するページ統合テストを書く**

`client/src/app/__tests__/pageNodeLinks.test.tsx`:

```tsx
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から MapEditor・右パネル・
// ヘッダー・ダイアログまでは本物を通す
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

jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: jest.fn(),
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

const APPLE_URL = "https://example.com/apple";
const RINGO_URL = "https://example.org/ringo";
const DOCS_URL = "https://example.com/docs";

// 正規化済みの URL を count 件（https://example.com/link0 …）
function linksOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `https://example.com/link${index}`);
}

// 1: 親（ルート）、2: りんご（URL 1 件）、3: リンゴ（URL 2 件。1 件はりんごと同じ）、4: バナナ（既定は URL なし）。
// 2・3・4 は 1 の子で兄弟
function seed(bananaLinks?: readonly string[]) {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "リンクテスト",
      json: v3Json([
        { id: 1, label: "プロジェクト", x: 100, y: 100 },
        { id: 2, parentId: 1, label: "りんご", x: 300, y: 100, links: [APPLE_URL] },
        { id: 3, parentId: 1, label: "リンゴ", x: 300, y: 300, links: [APPLE_URL, RINGO_URL] },
        { id: 4, parentId: 1, label: "バナナ", x: 300, y: 500, ...(bananaLinks === undefined ? {} : { links: bananaLinks }) },
      ]),
    },
  ], { currentMapId: "a" });
}

const NODE_COUNT = 4;
const APPLE = 1;
const APPLE_KANA = 2;
const BANANA = 3;

// Cmd/Ctrl を押しながらノードを押して選択へ加える（index は 0 始まり）。押したノードが主選択になる
function toggleSelectNode(index: number, nodeCount: number) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(0, 0, { ctrlKey: true }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}

// ダイアログで根が inert でも取れるよう hidden を含めて探す
function linksRegion(): HTMLElement {
  return screen.getByRole("region", { name: "リンク", hidden: true });
}

function linkInput(): HTMLInputElement {
  return within(linksRegion()).getByRole("textbox", { name: "URLを追加", hidden: true }) as HTMLInputElement;
}

function shownLinks(): string[] {
  return within(linksRegion()).queryAllByRole("link").map((link) => link.textContent ?? "");
}

function nodesOf() {
  return exportedMap(mockDownloadMapJson).nodes;
}

function nodeOf(id: number) {
  return nodesOf().find((node) => node.id === id)!;
}

async function importMap(text: string) {
  const file = new File([text], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
  await act(async () => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } }));
}

describe("URLの添付", () => {
  it("URL を追加し、別のノードを選んで戻っても残り、JSON には正規化した URL で入る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(linkInput(), "HTTPS://Example.com/docs{Enter}");

    expect(linkInput()).toHaveValue("");
    expect(linkInput()).toHaveFocus();
    expect(shownLinks()).toEqual([DOCS_URL]);
    selectNode(APPLE, NODE_COUNT);
    expect(shownLinks()).toEqual([APPLE_URL]);
    selectNode(BANANA, NODE_COUNT);
    expect(within(linksRegion()).getByRole("link", { name: DOCS_URL })).toHaveAttribute("href", DOCS_URL);
    expect(nodeOf(4).links).toEqual([DOCS_URL]);
  });

  it("追加と削除は、それぞれ 1 回の Undo で戻り、Redo でやり直せる", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    expect(undoButton()).toBeDisabled();

    await user.type(linkInput(), `${DOCS_URL}{Enter}`);
    await user.click(undoButton());
    expect("links" in nodeOf(4)).toBe(false);
    expect(undoButton()).toBeDisabled();
    await user.click(redoButton());
    expect(nodeOf(4).links).toEqual([DOCS_URL]);

    selectNode(APPLE_KANA, NODE_COUNT);
    await user.click(within(linksRegion()).getByRole("button", { name: `リンクを削除: ${RINGO_URL}` }));
    expect(nodeOf(3).links).toEqual([APPLE_URL]);
    await user.click(undoButton());
    expect(nodeOf(3).links).toEqual([APPLE_URL, RINGO_URL]);
  });

  it("JSON に書き出した URL は、読み込むと戻る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(linkInput(), `${DOCS_URL}{Enter}`);
    fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const json = mockDownloadMapJson.mock.lastCall![0] as string;
    expect(JSON.parse(json).nodes.find((node: { id: number }) => node.id === 4).links).toEqual([DOCS_URL]);

    // 消してから、書き出した JSON を読み込む
    await user.click(within(linksRegion()).getByRole("button", { name: `リンクを削除: ${DOCS_URL}` }));
    expect(shownLinks()).toEqual([]);
    await importMap(json);
    selectNode(BANANA, NODE_COUNT);

    expect(shownLinks()).toEqual([DOCS_URL]);
  });

  it("javascript: の URL は追加できず、理由を出し、履歴も積まない。JSON の読み込みでも拒否する", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(linkInput(), "javascript:alert(1){Enter}");

    expect(within(linksRegion()).getByRole("alert")).toHaveTextContent("http または https の URL だけを追加できます。");
    expect(linkInput()).toHaveValue("javascript:alert(1)");
    expect(undoButton()).toBeDisabled();
    expect("links" in nodeOf(4)).toBe(false);

    await importMap(v3Json([{ id: 1, label: "危険", links: ["javascript:alert(1)"] }]));

    await waitFor(() => expect(within(screen.getByRole("banner")).getByRole("alert")).toHaveTextContent(
      "現在のマップは変更されていません。",
    ));
    expect(nodesOf().map((node) => node.id)).toEqual([1, 2, 3, 4]);
  });

  it("統合では、選択中の URL が配列順に重複を除いて連結され、プレビューに件数と重複の件数が出る", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);
    fireEvent.click(headerButton("ノードを統合"));

    expect(dialog().getByText("URL").nextElementSibling).toHaveTextContent("2 件（重複 1 件を除く）");
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    expect(nodeOf(3).links).toEqual([APPLE_URL, RINGO_URL]);
    expect(shownLinks()).toEqual([APPLE_URL, RINGO_URL]);
  });

  it("枝の複製では URL も写る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(APPLE_KANA, NODE_COUNT);

    await user.click(screen.getByRole("button", { name: "枝を複製" }));

    const copies = nodesOf().filter((node) => node.label === "リンゴ");
    expect(copies).toHaveLength(2);
    for (const copy of copies) expect(copy.links).toEqual([APPLE_URL, RINGO_URL]);
  });

  it("ノード検索で URL からノードが見つかり、パスの日本語でも見つかる", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(linkInput(), "https://example.com/資料{Enter}");
    const search = screen.getByRole("combobox", { name: "ノードを検索" });

    await user.type(search, "ringo");
    expect(screen.getByRole("option", { name: "リンゴ（親: プロジェクト、URL 一致）" })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "資料");
    expect(screen.getByRole("option", { name: "バナナ（親: プロジェクト、URL 一致）" })).toBeInTheDocument();
  });

  it("入力欄の中の Delete・Backspace・Tab・Enter・Ctrl/Cmd+Z と、リンクの上の Delete ではマップを動かさない（L-522）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(linkInput(), `${DOCS_URL}{Enter}`);

    for (const init of [
      { key: "Delete" },
      { key: "Backspace" },
      { key: "Tab" },
      { key: "Enter" },
      { key: "z", ctrlKey: true },
      { key: "z", metaKey: true },
      { key: "z", ctrlKey: true, shiftKey: true },
    ]) {
      fireEvent.keyDown(linkInput(), init);
    }
    const link = within(linksRegion()).getByRole("link", { name: DOCS_URL });
    act(() => link.focus());
    fireEvent.keyDown(link, { key: "Delete" });
    fireEvent.keyDown(link, { key: "Backspace" });

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect(nodes.find((node) => node.id === 4)?.links).toEqual([DOCS_URL]);
  });

  it("ダイアログを開くと、リンクの節も編集画面の根ごと inert になる", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);

    fireEvent.click(headerButton("ノードを統合"));

    const root = document.querySelector("[data-map-id]");
    expect(root).toHaveAttribute("inert");
    expect(root).toContainElement(linkInput());
  });

  it("アウトライン表示でも、主選択のノードに URL を追加できる", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));

    await user.type(linkInput(), `${DOCS_URL}{Enter}`);

    expect(shownLinks()).toEqual([DOCS_URL]);
    expect(nodeOf(4).links).toEqual([DOCS_URL]);
  });

  it("9 件から 10 件目を追加した直後と、10 件から 9 件へ削除した直後に、フォーカスは入力欄にある（L-155）", async () => {
    seed(linksOf(9));
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(linkInput(), `${DOCS_URL}{Enter}`);
    expect(within(linksRegion()).getByText("10 / 10 件")).toBeInTheDocument();
    expect(within(linksRegion()).getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(linkInput()).toHaveFocus();

    await user.click(within(linksRegion()).getByRole("button", { name: `リンクを削除: ${DOCS_URL}` }));
    expect(within(linksRegion()).getByText("9 / 10 件")).toBeInTheDocument();
    expect(within(linksRegion()).getByRole("status")).toHaveTextContent("");
    expect(linkInput()).toHaveFocus();
  });
  it("リンクの「削除」ボタンにフォーカスして Ctrl+Z を押すと Undo が動き、続けて Delete を押してもノードは消えない（L-155・L-588）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(linkInput(), `${DOCS_URL}{Enter}`);
    const deleteButton = within(linksRegion()).getByRole("button", { name: `リンクを削除: ${DOCS_URL}` });
    act(() => deleteButton.focus());

    // <button> は文字入力先ではないので、マップの Undo が動く。成功した Undo は選択を解除するので、リンクの節は未選択の案内になる
    fireEvent.keyDown(deleteButton, { key: "z", ctrlKey: true });
    expect(within(linksRegion()).getByText("ノードを選択してください")).toBeInTheDocument();
    // フォーカスの行き先（押したボタンは消えている）で Delete を押しても、選択が無いので何も消えない
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Delete" });

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect("links" in nodes.find((node) => node.id === 4)!).toBe(false);
  });
});
```

- [ ] **Step 6: RED を確認する（ページ）**

Run: `cd client && npx jest src/app/__tests__/pageNodeLinks.test.tsx`
Expected: FAIL（`MapEditor` が `onAddLink` を渡していないため、「URLを追加」で `onAddLink is not a function`。統合・複製・検索・`inert` の各テストは、リンクの節の一覧・入力欄の検査で落ちる）。

- [ ] **Step 7: `MapEditor` を配線する**

`client/src/components/map/MapEditor.tsx`:
- `useNodes()` の分割代入の `previewNodeNote,` の次に `addNodeLink,` と `removeNodeLink,` を足す。
- `<NodeDetailPanel ... />` の `onBeginNoteEdit={beginMoveHistory}` の次に足す:

```tsx
              onAddLink={addNodeLink}
              onRemoveLink={removeNodeLink}
```

- [ ] **Step 8: 既存のテストで、右パネルの文言を画面全体から探している箇所が無いことを確かめる**

「ノードを選択してください」「対象ノード」は、右パネルのメモ・リンク・イラストの 3 か所に出る（未選択の案内は 3 か所、選択中の「対象ノード」も 3 か所）。既存のテストは候補011で `within(screen.getByRole("region", { name: "イラスト" }))` に絞ってあるので、直す箇所は無い想定。次で確かめ、`within(...)` の外で探している箇所があれば、`within(screen.getByRole("region", { name: "イラスト" }))` で探す範囲を絞る（パネルの文言や構造を変えて通さない）:

`cd client && grep -rn 'getByText("ノードを選択してください")\|getByText("対象ノード")\|getAllByText("ノードを選択してください")\|getByRole("link"\|getAllByRole("link"\|name: "追加" }\|name: "削除" }' src --include='*.ts' --include='*.tsx' | grep -v 'region", { name: "イラスト" })' | grep -v 'NodeNoteSection.test\|IllustrationPanel.test\|NodeLinksSection.test\|NodeDetailPanel.test\|pageNodeLinks.test'`

Expected: 次の 3 行だけが出る（どれも直前の行で `const panel = within(screen.getByRole("region", { name: "イラスト" }));` に絞ってあるので直さない）。これ以外の行が出たら直す:

```text
src/app/testing/__tests__/pageTestHelpers.test.tsx:61:  return panel.getByText("対象ノード").nextElementSibling!.textContent;
src/app/__tests__/pageOutlineImportKeyboard.test.tsx:86:  return panel.getByText("対象ノード").nextElementSibling!.textContent;
src/app/__tests__/pageOutlineImport.test.tsx:108:  return panel.getByText("対象ノード").nextElementSibling!.textContent;
```

- [ ] **Step 9: GREEN を確認する**

Run: `cd client && npx jest src/components src/app`
Expected: PASS。`Found multiple elements` で落ちるテストが残っていたら、右パネルのメモ・リンク・イラストに同じ文言が出たためなので、Step 8 と同じく `within(screen.getByRole("region", { name: "イラスト" }))` で探す範囲を絞る。

- [ ] **Step 10: このタスクの範囲を検証する**

Run: `cd client && npm run tailwind:scan && npm run lint && npm run typecheck && npm test -- --runInBand`
Expected: すべて成功（全テストが通る）。

---

### Task 8: ドキュメントと ROADMAP の更新、全体検証

**Files:**
- Modify: `docs/specifications/features.md`
- Modify: `docs/specifications/api.md`
- Modify: `docs/specifications/data-model.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `README.md`
- Modify: `client/README.md`
- Modify: `docs/README.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: Task 1〜7 の挙動と、Global Constraints の文言。設計書 §12。直近の候補011（`features.md` の 24 章、`overview.md` の「詳細メモ（候補011）の流れ」、`data-model.md` の `note` の各行、`browser-test-cases.md` の AF 節）を書式の手本にする。L-203（並んだ全箇所）・L-825（比較項目の列挙）に気をつける。

- [ ] **Step 1: `features.md` を更新する**

次の `grep` で全箇所を確かめてから更新する（行番号は目安）:
```bash
grep -n "詳細メモを含む\|24\. \[詳細メモ\]\|\*\*Phase 18\*\*\|note?: string;\|（詳細メモ）も持\|V3 の任意項目\|右サイドパネル「ノードの詳細」\|^| ノードの統合 \|^| 詳細メモの編集\|ノードの詳細（詳細メモ）\|右のパネル（詳細メモ・イラスト）\|ラベル・重要度・イラスト・詳細メモだけ\|\*\*詳細メモ\*\*\|N 件のメモを連結\|連結したメモとその元の件数\|note-too-long\|詳細メモは 24 章の任意項目\|URL（候補012）\|現在メモリ上にある全ノードのラベル" docs/specifications/features.md
```

- 冒頭（3 行目）の「…ノードの分割・統合、詳細メモを含む）」を「…ノードの分割・統合、詳細メモ、URLの添付を含む）」にする。
- 目次の `24. [詳細メモ](#24-詳細メモ)` の次に `25. [URLの添付](#25-urlの添付)` を足す。
- 1.1 節の表の Phase 18 の行を次にする:

```markdown
| **Phase 18** | 詳細情報と出典の蓄積（進行中。詳細メモ・URLの添付） | 右パネル「ノードの詳細」の上段で、選択中のノードに長い説明（プレーンテキスト、最大 10,000 文字）を保存。入力は止まってから 300ms（入力が続いても最長 2 秒）でマップへ反映し、フォーカスを外したときに 1 操作の Undo / Redo にまとめる（24 章）。中段の「リンク」で http / https の URL を 1 ノード 10 件まで追加・削除・新しいタブで開け、キャンバスに「リンクあり」の印を出し、ノード検索で URL からも見つかる（25 章）。保存形式は V3 のまま任意項目 `note`・`links` を追加。複製・コピー＆貼り付け・分割・統合と整合 |
```

- 3.1 節の `Node` の型の `note?: string;              // 詳細メモ（…）` の次に `links?: readonly string[];   // 添付した URL（正規化した http/https の URL、最大 10 件、重複なし。無ければ項目ごと持たない。25 章）` を足す。
- 3.x 節（236 行目付近）と 16.2 節（1751 行目付近）の「`illustration`・`note`（詳細メモ）も持たない」「`illustration`・`note`（詳細メモ）も持ちません」を、「`illustration`・`note`（詳細メモ）・`links`（URL）も持たない」「…も持ちません」にする。
- 6.1 節の `note` の項目（565 行目付近）の次に、次の項目を足す:

```markdown
  - V3 の任意項目 `links`（URL の添付。http / https の URL の配列、最大 10 件、各 2,048 文字以内。読み込みでは各要素を正規化した `URL.href` にし、重複は後のものを捨て、空なら項目ごと持たない。V1 / V2 の `links` は無視。配列でない・11 件以上・文字列でない要素・長すぎる要素・http / https 以外・資格情報つき・URL として不正な要素は `node[i].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。` で読み込み失敗。25 章）。
```

- 7.3 節の「右サイドパネル「ノードの詳細」（…）は…上に詳細メモ（24 章）、下にイラスト（…）を縦に積みます。」を「…上から詳細メモ（24 章）、リンク（25 章）、イラスト（`IllustrationPanel.tsx`。`<section aria-label="イラスト">`）を縦に積みます。」にする。
- 8.1 節の表の「ノードの統合」の行の「ラベル・重要度・イラスト・詳細メモの更新」を「ラベル・重要度・イラスト・詳細メモ・URL の更新」にし、「詳細メモの編集」の行の次に次の行を足す:

```markdown
| URL の追加・削除 | 追加・削除のそれぞれを1操作（右パネルの「リンク」。失敗（形式が不正・重複・上限など）は履歴を積まない。25 章） |
```

- 11 章の表の「ノードの詳細（詳細メモ）」の行の次に、次の行を足す:

```markdown
| **ノードの詳細（リンク）** | 入力欄「URLを追加」 / `追加` / `リンクを削除: {URL}` / URL のリンク | 選択中のノード（複数選択では主選択）に http / https の URL を追加（`Enter` または「追加」。IME の変換中・押し続けの `Enter` では追加しない）・削除し、URL を新しいタブで開く（`noopener noreferrer`）。最大 10 件。各 1 操作の履歴 |
```

- 9 章の冒頭の「現在メモリ上にある全ノードのラベルを検索できます。」を「現在メモリ上にある全ノードのラベルと URL（25 章）を検索できます。」にし、9.1 節の最後の項目の後に次の項目を足す:

```markdown
- URL もラベルと同じ正規化で部分一致を照合します。保存した URL（パーセントエンコードの形）と、`decodeURI` で戻した形の両方で照合するため、パスやクエリの日本語は日本語の検索語で見つかります（IDN のホストは `xn--` で始まる punycode の形でだけ一致します）。URL ごとに照合し、2 つの URL の区切りをまたいでは一致しません。ラベルと URL の両方に一致したときはラベルの一致として扱い、URL だけに一致した候補には補助行に「 · URL 一致」を付けます（アクセシブルネームは「ラベル（親: X、非表示、URL 一致）」の形）。一致総数には両方を数えます。
```

- 19 章（2011 行目付近）の「右のパネル（詳細メモ・イラスト）は共通選択IDが対象です」を「右のパネル（詳細メモ・リンク・イラスト）は共通選択IDが対象です」にする。
- 23.3 節の「- **詳細メモ**は元のノード（最初の断片）にだけ残り、新しい断片には付きません。」の次に「- **URL**（25 章）も元のノード（最初の断片）にだけ残り、新しい断片には付きません。」を足し、その節の NOTE の「詳細メモを含むほかは兄弟追加の既定値です（詳細メモは元のノードにだけ残ります）」を「詳細メモ・URL を含むほかは兄弟追加の既定値です（詳細メモと URL は元のノードにだけ残ります）」にする。
- 23.4 節の NOTE の「ラベル・重要度・イラスト・詳細メモだけを次の規則で扱い」を「ラベル・重要度・イラスト・詳細メモ・URL だけを次の規則で扱い」にし、「- **詳細メモ**: …（24.5 節）。」の次に次の項目を足す:

```markdown
- **URL**: 選択中のノードの URL を配列順に並べ、最初に出てきたものを残して重複を除きます。重複を除いて 10 件を超えるときは統合できません（25.5 節）。
```

- 23.5 節の統合のプレビューの「「メモ」（`N 件のメモを連結（M 文字）`。メモのあるノードが 1 つ以上のときだけ）、」の次に「「URL」（`N 件`、重複があれば `N 件（重複 M 件を除く）`。URL を持つノードが 1 つ以上のときだけ。URL の本文は出しません）、」を足す。
- 23.6 節の 1. の「…連結したメモとその元の件数で比べます」を「…連結したメモとその元の件数・連結した URL（要素ごと）とその元の件数・重複で捨てる件数で比べます」にする。
- 23.7 節の表の `note-too-long` の行の次に、次の行を足す:

```markdown
| URL が上限を超える（`links-too-many`） | — | URLをまとめると件数の上限（10 件）を超えるため、統合できません。 |
```

- 23.10 節の表の「保存・JSON・画像」の行の「（詳細メモは 24 章の任意項目を使います）」を「（詳細メモは 24 章、URL は 25 章の任意項目を使います）」にする。
- 24.6 節の対象外の「URL（候補012）」を「URL（25 章）」にする。
- 24 章の末尾（`### 24.6` の最後の項目の後）に、次の章を追加する:

````markdown
## 25. URLの添付

Phase 18・候補012。資料や Web ページの URL をノードに付け、キャンバスの見出しを短く保ちながら根拠を開けるようにします。URL には表示名を付けません（説明は詳細メモに書きます）。ページタイトルの取得・リンク先の存在確認・プレビューなど、外部への通信は一切しません。

### 25.1 操作と表示

| 項目 | 内容 |
| :--- | :--- |
| 置き場所 | 右パネル「ノードの詳細」の中段「リンク」（`NodeLinksSection.tsx`、`<section>`。見出し「リンク」）。上に詳細メモ（24 章）、下にイラスト（7.3 節）。マップ表示・アウトライン表示のどちらでも出ます |
| 対象 | **主選択の 1 ノード**（複数選択の件数の文言は詳細メモの節だけが出します）。未選択では「ノードを選択してください」だけを出し、入力欄・ボタンは出しません。選択中は「対象ノード」に表示ラベル |
| 一覧 | 保存した URL を順に表示します。各行は新しいタブで開くリンク（`target="_blank" rel="noopener noreferrer"`。長い URL は 1 行に省略し、全文は `title`）と「削除」ボタン（名前「リンクを削除: {URL}」）。0 件のときは「リンクはありません」 |
| 件数 | 「N / 10 件」を常に表示します。10 件に達すると、その横に「上限（10 件）に達しました」（`role="status"`）を出します |
| 追加 | 入力欄「URLを追加」（`type="url"`、自動補完なし、文字数の制限なし）と「追加」ボタン。`Enter` または「追加」で追加します。入力欄とボタンは、上限に達しても無効にしません |
| 開く | リンクを押すと新しいタブで開きます。`href` には保存した値を描画の時点でもう一度確かめた値（`toSafeLinkHref`）だけを使い、http / https の正規化済みの URL でなければリンクにせず文字だけを出します |
| キャンバスの印 | URL を 1 件以上持つノードの右上の角に、小さな青い円（白い縁、半径 6px）を重ねて描きます。表示専用で、押すとノードを押したのと同じ扱いです。選択・接続先の強調の色には影響されません。並べ替えのドラッグ中は、ノードと同じく半透明になります |

### 25.2 URL の規則

- 受け付けるのは **`http` と `https` の URL だけ**です。`javascript:`・`data:`・`file:`・`mailto:` などは、入力・JSON の読み込み・貼り付けのどれでも受け付けません。
- 入力は前後の空白を削ってから解釈します。スキームの無い入力（`example.com`）や相対 URL は受け付けません（`https://` を補いません）。
- ユーザー名やパスワードを含む URL（`https://user:pass@example.com/`）は受け付けません。
- 保存するのはブラウザが解釈した後の URL（`URL.href`）です。スキームとホストは小文字になり、日本語のホスト名は `xn--` で始まる形（punycode）に、パスやクエリの日本語・空白はパーセントエンコードになり、パスが空なら `/` が付きます（例: `HTTPS://Example.com` → `https://example.com/`）。開くのも、この保存した値です。
- 長さは **2,048 文字**までです。前後の空白を削った入力の長さを解釈の前に確かめ、さらに解釈した後の URL の長さにも同じ上限を掛けます（日本語などはパーセントエンコードで長くなるため、入力が 2,048 文字以内でも受け付けないことがあります）。
- 1 ノードに **10 件**まで。同じノードに、解釈した後の URL が同じものは追加できません。

### 25.3 追加・削除と履歴

| 操作 | 挙動 |
| :--- | :--- |
| 追加に成功 | 一覧の末尾に足し、入力欄を空にしてフォーカスを入力欄に残します。**1 回の履歴**になります |
| 追加に失敗 | 入力を残し、入力欄の下に理由を `role="alert"` で出します（25.4 節）。入力を変えると消えます。履歴は積みません |
| 空のまま追加 | 何もしません（理由も出しません） |
| IME 変換中・押し続けの `Enter` | 追加しません |
| 削除 | その URL だけを消し、**1 回の履歴**になります。押したボタンは消えるので、フォーカスを入力欄へ移します。最後の 1 件を消すと、ノードは `links` の項目を持たなくなります |
| Undo / Redo | 追加・削除の 1 回ずつを戻し、やり直します |

- Undo / Redo・JSON 読み込み・マップの切り替えで文書が入れ替わったとき、別のノードを選んだときは、入力欄の下書きと理由の表示を消します。

### 25.4 失敗の文言

| 理由 | 文言 |
| :--- | :--- |
| 長すぎる（`too-long`） | URLが長すぎます（2,048 文字まで。日本語などはエンコードで長くなります）。 |
| 形式が不正（`invalid`） | URLの形式が正しくありません。https:// から始まる URL を入力してください。 |
| http / https 以外（`unsupported-scheme`） | http または https の URL だけを追加できます。 |
| ユーザー名・パスワードを含む（`has-credentials`） | ユーザー名やパスワードを含む URL は追加できません。 |
| 重複（`duplicate`） | 同じ URL がすでに追加されています。 |
| 上限（`too-many`） | リンクは 1 つのノードに 10 件まで追加できます。 |
| ノードが無い（`node-missing`） | ノードが見つかりません。 |

### 25.5 保存形式と既存機能との関係

- 保存形式は **V3 のまま**で、ノードに任意の項目 `links`（文字列の配列）を足します。版は上げません。URL の無いノードは項目を持ちません（空の配列も持ちません）。
- 読み込み（JSON・自動保存・バックアップ・ゴミ箱・コピー＆貼り付けのクリップボード）では、V3 の `links` を検証します。配列でない・11 件以上・文字列でない要素・2,048 文字を超える要素（前後の空白を削る前の長さ）・25.2 節の規則に合わない要素は `node[i].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。` で失敗します。件数と長さは解釈の前に確かめます。通った要素は正規化した値にし、重複は後のものを捨てます。V1 / V2 の `links` は無視します。
- 古いアプリは `links` を知らないため、古いアプリで開いて保存し直すと URL は失われます（その環境はサポートしません）。
- 複数タブの競合検出（21 章）は、URL だけが違う 2 つの内容も別物として扱います（URL は要素ごと、順も含めて比べます）。

| 機能 | 挙動 |
| :--- | :--- |
| 枝の複製・コピー＆貼り付け・別マップへの枝の移動 | URL も一緒に写ります。貼り付けでも 25.2 節の検証が働きます |
| ノードの分割 | 元のノード（最初の断片）に URL を残し、新しい断片には付けません |
| ノードの統合 | 選択中のノードの URL を配列順に並べ、最初に出てきたものを残して重複を除き、残すノードに付けます。プレビューに「URL: N 件（重複 M 件を除く）」を出します（重複が無ければ括弧なし）。重複を除いて 10 件を超えるときは「URLをまとめると件数の上限（10 件）を超えるため、統合できません。」で統合できません（黙って切り詰めません） |
| 親の挿入 | 新しい親は URL を持ちません |
| ノード検索 | URL も検索します（9.1 節） |
| 一括置換・アウトライン書き出し・画像書き出し | URL は対象にしません（画像にはキャンバスの印も出ません） |
| ダイアログ表示中 | 編集画面の根ごと `inert` になり、リンクの節も操作できません |
| ショートカット | 入力欄の中の `Delete`・`Tab`・`Enter`・`Cmd`/`Ctrl`+`Z` などでマップを動かしません。リンクや削除ボタンにフォーカスがあるときの `Delete` などのツリー編集のキーも動きません（既存のボタンと同じ扱い） |

### 25.6 検証範囲と対象外

- **検証範囲**: Jest（jsdom）で、ドメイン（`nodeLink.test.ts`、`mapDocumentNodeLinks.test.ts`、`mapDocumentNode.test.ts`、`mapDocumentNodeProjection.test.ts`、`mapDocumentCodec.test.ts`、`mapDocumentDecoder.test.ts`、`mapConflict.test.ts`、`mapHistory.test.ts`、`subtreeClipboardCodec.test.ts`、`nodeSubtreeInsertion.test.ts`、`nodeSplit.test.ts`、`nodeParentInsertion.test.ts`、`nodeBranchMove.test.ts`、`nodeMerge.test.ts`、`nodeMergeMessages.test.ts`、`nodeLabelSearch.test.ts`、`mapSvgNodes.test.ts`）、フック（`useNodesLinks.test.ts`、`useNodesSplitMerge.test.ts`、`useNodeLabelSearch.test.ts`、`nodeMergePreview.test.ts`、`useNodeMergeDialog.test.ts`）、部品（`NodeLinksSection.test.tsx`、`NodeDetailPanel.test.tsx`、`NodeMergeDialog.test.tsx`、`NodeSearchBox.test.tsx`、`renderMapNodes.test.ts`）、ページ統合（`pageNodeLinks.test.tsx`）を確認しています。実ブラウザでの確認（[AG 節](../testing/browser-test-cases.md)）は未実施です。
- **対象外（YAGNI）**: URL の表示名、ページタイトルの自動取得、リンク先の存在確認、favicon・プレビュー、`http` / `https` 以外のスキーム、スキームの補完、キャンバスの印からの直接のリンクの開き方、アウトライン書き出し・画像書き出し・一括置換への URL の反映、複数ノードへの URL の一括追加、ノードの右クリックメニュー・ショートカットからの操作、出典情報（候補054）、タグ（候補023）、Markdown メモ（候補053）、版の引き上げ（V4）と古いアプリへの書き戻し互換。
- **既知の制限**: IDN のホストは punycode の形（`xn--…`）でだけ検索できます。URL の有無は画像書き出し・アウトライン書き出しでは分かりません。
````

- 追加後、`grep -rn "上限（10 件）に達しました\|URLをまとめると件数の上限\|リンクは 1 つのノードに 10 件まで\|linksは、http または https の URL\|http または https の URL だけを追加できます\|URLの形式が正しくありません\|URLが長すぎます\|ユーザー名やパスワードを含む URL\|同じ URL がすでに追加されています" docs/specifications/features.md client/src --include='*.md' --include='*.ts' --include='*.tsx'` で、文言が実装と一致していることを突き合わせる。

- [ ] **Step 2: `api.md` と `data-model.md` を更新する**

`docs/specifications/api.md`（`grep -n "isDocumentContentEqual" docs/specifications/api.md` で位置を確かめる）: `isDocumentContentEqual` の説明の「各ノードフィールド（ID・親ID・座標・寸法・重要度・イラスト）を正規化比較し」を「各ノードフィールド（ID・親ID・座標・寸法・ラベル・重要度・イラスト・詳細メモ `note`・URL `links`（要素ごと、順も含めて））を正規化比較し」にする（L-825。`note` の追加時に直されていなかった分も直す）。

`docs/specifications/data-model.md`（`grep -n "note" docs/specifications/data-model.md` で `note` の各行を確かめ、そのすべての隣に `links` を並べる。L-203）:
- `Node` 型（158 行目付近）の `note?: string;` の次に足す:

```typescript
  /**
   * 添付した URL（Phase 18 以降）。正規化した http / https の URL（URL.href）の読み取り専用の配列。
   * 最大 10 件、各 2,048 文字以内、重複なし。URL が無いノードではプロパティ自体が存在しない（空配列も持たない）
   */
  links?: readonly string[];
```

- 3.3 節の「Phase 18 では、Version 3 のまま（版は上げません）、詳細メモを保存する任意項目 `note`…」の段落の次に、「同じく Phase 18 で、URL を保存する任意項目 `links`（http / https の URL の配列、最大 10 件、各 2,048 文字以内）がノードに追加されました。URL が無いノードは項目ごと持ちません。古いアプリで開いて保存し直すと URL は失われます。」を足す。
- 3.3 節のプロパティ仕様の表の `nodes[].note` の行の次に足す:

```markdown
| `nodes[].links` | `string[]` | △ (任意) | 添付した URL（http / https、最大 10 件、各 2,048 文字以内）。読み込みでは各要素を `URL.href` に正規化し、重複は後のものを捨て、空なら項目ごと持たない。無い場合はキー自体を含めない。V1/V2 では存在しても無視する |
```

- 3.4 節の差分表の `nodes[].note` の行の次に足す:

```markdown
| **`nodes[].links`** | 未対応（存在しても破棄） | 未対応（存在しても破棄） | **対応** (http/https の URL の配列、最大 10 件、省略可能) |
```

- 4 章の流れの図の `└─ note 検証（V3 のみ。V1/V2 は無視）` を `├─ note 検証（V3 のみ。V1/V2 は無視）` にし、その次の行に `    └─ links 検証（V3 のみ。V1/V2 は無視）` を足す。
- 検証規則の `9. **`note`**（…）` の項目の後に、次の項目を足す:

```markdown
10. **`links`**（`mapDocumentNodeLinks.ts`）:
   - Version 3 のみ検証。V1 / V2 では存在しても無視（`undefined`）。`undefined` は項目なし。
   - 条件: 配列で、件数が 10 以下、各要素が文字列で `length` が 2,048 以下（前後の空白を削る前の値。件数と長さは URL の解析より先に判定する）、各要素が `normalizeNodeLinkUrl`（前後の空白を削り、`new URL` で解釈でき、`protocol` が `http:` / `https:`、`username` / `password` が空、`href` の長さが 2,048 以下）を通る。
   - 通った要素は `URL.href` に正規化し、重複は後のものを捨てる。空になれば `undefined`（項目ごと持たない）。
   - エラー: `"node[${index}].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。"`
```

- エラーの表の `note` の行の次に足す:

```markdown
| **ノード単体** | `node[${i}].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。` | V3 で `links` が配列でない、11 件以上、文字列でない要素、2,048 文字超過の要素、http / https 以外・資格情報つき・URL として不正な要素 |
```

- クリップボード形式（1339 行目付近）の「任意の `illustration`・`note`」を「任意の `illustration`・`note`・`links`」にし、1344 行目付近の「詳細メモ `note` も V3 と同じ規則で検証し、10,000 文字超過・文字列以外は拒否）」を「詳細メモ `note`・URL `links` も V3 と同じ規則で検証し、規則に合わない値は拒否）」にする。

- [ ] **Step 3: `overview.md` を更新する**

まず実際の件数を数える:

```bash
cd /Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-node-links/client/src
ls components/layout/*.ts* | wc -l   # レイアウト UI（想定 67）
ls hooks/*.ts | wc -l                # フック（想定 57。変わらない）
ls domain/nodes/*.ts | wc -l         # domain/nodes（想定 53）
ls domain/persistence/*.ts | wc -l   # domain/persistence（想定 12）
ls domain/*/*.ts | wc -l             # domain 全体（想定 104）
ls components/map/pixi/*.ts | wc -l  # Pixi（想定 30。変わらない）
```

数えた値で、`docs/architecture/overview.md` の「`src/components/layout/` 全 66 ファイル」「構成サブパッケージ（全 102 ファイル）」「`domain/nodes/` (52 ファイル)」「`domain/persistence/` (11 ファイル)」を直す（想定と違う値が出たら、数えた値を書く。`hooks` と `pixi` も数えた値と記載が一致するか確かめる）。

次を更新する（`grep -n "NodeDetailPanel.tsx\|NodeSearchBox.tsx\|renderMapNodes.ts\|useNodes.ts\|nodeMergePreview.ts\|nodeMerge.ts\|nodeMergeMessages.ts\|nodeNote.ts\|nodeLabelSearch.ts\|mapHistory.ts\|mapDocumentNodeNote.ts\|mapConflict.ts\|詳細メモ（候補011）の流れ\|ノード検索と移動の流れ" docs/architecture/overview.md` で位置を確かめる）:
- レイアウト UI の一覧の `NodeDetailPanel.tsx` の項目を「上から詳細メモ、リンク、イラストを積み、選択中のノードがあるときだけ `NodeNoteEditor` を `key={`${id}:${documentRevision}`}` で描く。`NodeLinksSection` はノードの ID だけの `key={`links:${id}`}`（未選択は `links:none`）で作り直し、`documentRevision` は props で渡す（節の中で下書きとエラーだけを消し、フォーカスを保つ）。」に直し、「`NodeLinksSection.tsx`: 「リンク」節（`<section>`、見出し「リンク」）。URL の一覧（`toSafeLinkHref` で確かめた `<a target="_blank" rel="noopener noreferrer">` と削除ボタン）・件数と上限の `role="status"`・追加のフォーム（`<form noValidate onSubmit>` で確定は送信の 1 か所、`type="url"`、IME 変換中・押し続けの `Enter` は `preventDefault`、失敗は `role="alert"`）と、入力欄の下書き・エラー・フォーカス（成功と削除の後は入力欄へ）を持つ。入力欄とボタンは `disabled` にしない。」を足す。
- `NodeSearchBox.tsx` の説明に「URL だけで一致した候補には補助行に「 · URL 一致」、アクセシブルネームに「URL 一致」を足す」を足す。
- Pixi のシーン描画の `renderMapNodes.ts` に「URL を持つノードの右上の角に「リンクあり」の印（`createNodeLinkMarker`。半径 6 の青い円、白い縁、表示専用）」を足す。
- `useNodes.ts` の説明の「詳細メモの更新（`previewNodeNote`…）」の次に「・URL の追加と削除（`addNodeLink`・`removeNodeLink`。`applyNonStructuralChange` で 1 回の履歴。`addNodeLink` は `getCurrentState` の最新の状態から判定し、失敗は理由（`AddNodeLinkOutcome`）を返して何も変えない）」を足す。
- `nodeMergePreview.ts` の説明の「（メモの連結の説明 `noteText` を含む）」を「（メモの連結の説明 `noteText` と URL の件数の説明 `linkText` を含む）」にする。
- `domain/nodes/` の一覧の `nodeNote.ts` の次に「`nodeLink.ts`: URL の上限（`NODE_LINKS_MAX_COUNT = 10`・`NODE_LINK_MAX_LENGTH = 2048`）・検証と正規化（`normalizeNodeLinkUrl`。前後の空白 → 空 → 入力の長さ → `new URL` → スキーム → 資格情報 → `href` の長さの順。成功値は `URL.href`）・正規化済みかの判定（`isNodeLinkUrl`）・描画用の `href`（`toSafeLinkHref`）・並びの比較（`areNodeLinksEqual`）・失敗の文言（`formatNodeLinkFailure`）・差し替え（`withNodeLinks`。空ならキーごと外す）・追加と削除（`addNodeLink`・`removeNodeLink`）。`useNodes.addNodeLink` の戻り値の型 `AddNodeLinkOutcome` もここに置く。」を足す。`nodeMerge.ts` の説明の「連結したメモが上限を超える（`note-too-long`）、の順に検査して」を「連結したメモが上限を超える（`note-too-long`）・重複を除いた URL が上限を超える（`links-too-many`）、の順に検査して」にし、計画の項目に「連結した URL `links` とその元の件数 `linkSourceCount`・重複で捨てる件数 `linkDuplicateCount`」を、`isSameNodeMergePlan` の比較項目に「連結した URL（要素ごと）とその元の件数・重複の件数」を足す。`nodeMergeMessages.ts` に「`links-too-many` は URL の連結が上限を超える旨」を足す。
- `domain/history/` の `mapHistory.ts` の説明の「同値判定」を「同値判定（ノードの各キーを比べ、配列の値（`links`）は要素ごとに比べる）」にする。
- `domain/search/` の `nodeLabelSearch.ts` の説明に「ノードの URL も検索し（`decodeURI` で戻した形も照合。結果の `matchedBy` はラベル優先で `"label"` / `"link"`）、URL の正規化の結果は `links` の配列を鍵にした `WeakMap` で使い回す」を足す。
- `domain/persistence/` の一覧の `mapDocumentNodeNote.ts` の次に「`mapDocumentNodeLinks.ts`: V3 の任意項目 `links` の検証（`normalizeMapDocumentNodeLinks`。件数と各要素の長さを URL の解析より先に判定し、各要素を `URL.href` に正規化し、重複は後のものを捨てる）。」を足す。
- `domain/mapLibrary/` の `mapConflict.ts` の説明の「（`isDocumentContentEqual`。`note` も比べる）」を「（`isDocumentContentEqual`。`note`・`links`（要素ごと）も比べる）」にする。
- 「詳細メモ（候補011）の流れ」の節の後に、次の節を足す:

```markdown
#### URLの添付（候補012）の流れ

- **責務の分担**: 規則（検証・正規化・追加・削除・文言）は `domain/nodes/nodeLink.ts`、保存形式の検証は `domain/persistence/mapDocumentNodeLinks.ts`（`mapDocumentNode.ts` と `mapDocumentNodeProjection.ts` から呼ぶ。クリップボードの貼り付けも同じ検証を通る）、複数タブの競合と履歴の比較は `mapConflict.ts`・`mapHistory.ts`（要素ごと）、統合は `nodeMerge.ts`、検索は `nodeLabelSearch.ts`、キャンバスの印は `renderMapNodes.ts`、更新経路は `useNodes.addNodeLink` / `removeNodeLink` → `useNodeLayoutState.applyNonStructuralChange`、表示とフォームの状態は `NodeLinksSection`、配置は `NodeDetailPanel`、配線は `MapEditor` が持つ。
- **単一の解釈**: 検証・保存・「開く」は同じ `new URL(...).href` を使う。描画では `toSafeLinkHref` でもう一度確かめ、正規化済みの http / https でない値は `<a>` にしない。
- **履歴**: 追加・削除はそれぞれ即時に 1 回の履歴（途中反映・履歴グループは使わない）。`mapHistory.areNodesEqual` は配列を要素ごとに比べるので、内容が同じ `links` では履歴を積まない。
- **文書の入れ替え**: `NodeLinksSection` はノードの ID だけの `key={`links:${id}`}` で作り直し（別のノードの下書きを引き継がない）、`documentRevision` の変化（Undo / Redo・JSON 読み込み・マップの切り替え）では作り直さずに、描画中に前回の世代と比べて下書きとエラーだけを消す（作り直すとリンクや削除ボタンのフォーカスが `body` へ落ちるため。L-155・L-588）。
```

- 「ノード検索と移動の流れ」の 1 つ目の項目の「正規化済み索引を同期走査する」を「正規化済み索引（ラベルと URL）を同期走査する」にする。

- [ ] **Step 4: `browser-test-cases.md` に AG 節を追加する**

3 行目の「Phase 18 は詳細メモを含む）」を「Phase 18 は詳細メモ・URLの添付を含む）」にする。`## AF.` 節の後、`## 結果の集計` の前に、次の Markdown をそのまま追加する:

````markdown
## AG. URLの添付（Phase 18・候補012）

**2026-11-17 時点で AG-01〜AG-13 の実ブラウザ確認はすべて未実施です。** 自動テスト（Jest / jsdom）と `npm run verify` の成功を実ブラウザ確認済みとは扱いません。URL は右パネル「ノードの詳細」の中段「リンク」で追加・削除します。保存内容は、ヘッダーの「JSON書き出し」で書き出した JSON の `nodes[].links` で確かめます。

### AG-01 URL を追加して開く【高】
- 前提: 手動配置。ルート「計画」とその子「調査」がある。どちらも URL なし。
- 手順: (1) 「調査」を選択する。(2) 「URLを追加」に `HTTPS://Example.com/docs` と入力して `Enter` を押す。(3) 一覧のリンクを押す。(4) 「JSON書き出し」で書き出す。
- 期待: (2) 一覧に `https://example.com/docs` が出て、入力欄が空になり、フォーカスは入力欄に残る。件数が「1 / 10 件」。キャンバスの「調査」の右上の角に青い丸の印が出る。(3) 新しいタブで開き、元のタブは残る（開いたページから元のタブを操作できない）。(4) 「調査」の `links` が `["https://example.com/docs"]`、「計画」は `links` の項目を持たない。
- 結果: -（未実施）

### AG-02 追加と削除は 1 回ずつ Undo / Redo できる【高】
- 前提: AG-01 の後。
- 手順: (1) 「調査」の一覧の「削除」を押す。(2) ヘッダーの「元に戻す」を押す。(3) 「やり直す」を押す。
- 期待: (1) URL が消え、フォーカスが入力欄へ移る。印が消える。(2) URL が戻る。(3) もう一度消える。
- 結果: -（未実施）

### AG-03 http / https 以外と相対 URL を拒否する【高】
- 前提: ノード「A」を選んでいる。
- 手順: `javascript:alert(1)`、`data:text/html,x`、`mailto:a@example.com`、`file:///etc/passwd`、`example.com`、`/docs` をそれぞれ入力して `Enter` を押す。
- 期待: どれも追加されず、入力が残り、入力欄の下に理由が出る（http / https 以外は「http または https の URL だけを追加できます。」、`example.com` と `/docs` は「URLの形式が正しくありません。https:// から始まる URL を入力してください。」）。ブラウザ標準の検証の吹き出しは出ない。入力を変えると理由が消える。履歴は増えない。
- 結果: -（未実施）

### AG-04 ユーザー名・パスワードを含む URL を拒否する【中】
- 前提: ノード「A」を選んでいる。
- 手順: `https://user:pass@example.com/` を入力して「追加」を押す。
- 期待: 「ユーザー名やパスワードを含む URL は追加できません。」が出て、追加されない。
- 結果: -（未実施）

### AG-05 上限 10 件【高】
- 前提: ノード「A」に URL が 9 件ある。
- 手順: (1) 10 件目を追加する。(2) 11 件目を追加しようとする。(3) 1 件を削除する。
- 期待: (1) 「10 / 10 件」と「上限（10 件）に達しました」が並んで出る。入力欄とボタンは無効にならず、フォーカスは入力欄にある。(2) 「リンクは 1 つのノードに 10 件まで追加できます。」が出て追加されない。(3) 「9 / 10 件」になり、上限の表示が消え、フォーカスは入力欄にある（ページの先頭へ飛ばない）。
- 結果: -（未実施）

### AG-06 重複と正規化【中】
- 前提: ノード「A」に `https://example.com/` がある。
- 手順: (1) `https://EXAMPLE.com` を追加する。(2) `https://例え.jp/パス` を追加する。
- 期待: (1) 「同じ URL がすでに追加されています。」が出る。(2) 一覧に `https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9` が出る（保存と表示は正規化した形）。
- 結果: -（未実施）

### AG-07 JSON の書き出しと読み込み、不正な URL を含む JSON【高】
- 前提: AG-01 の後。
- 手順: (1) 「JSON書き出し」で書き出す。(2) URL を削除する。(3) (1) のファイルを「JSON読み込み」で読み込む。(4) (1) のファイルの `links` の要素を `"javascript:alert(1)"` に書き換えて読み込む。
- 期待: (3) 「調査」に URL が戻る。(4) 読み込みは失敗し、現在のマップは変わらない（エラーの通知が出る）。
- 結果: -（未実施）

### AG-08 複製・コピー＆貼り付け・別マップへの移動・分割【中】
- 前提: 「調査」に URL が 1 件あり、子「詳細」がある。
- 手順: (1) 「調査」を「枝を複製」する。(2) 「調査」を `Cmd`/`Ctrl`+`C` でコピーし、別のマップで `Cmd`/`Ctrl`+`V` で貼り付ける。(3) 「調査」の枝を別のマップへ移す。(4) 「調査」のラベルを「調査、資料」にして「ノードを分割」する。
- 期待: (1)〜(3) 写したノードにも同じ URL がある。(4) 元のノード「調査」に URL が残り、新しい「資料」は URL を持たない（印も出ない）。
- 結果: -（未実施）

### AG-09 統合（プレビューと上限）【高】
- 前提: 親「果物」の子「りんご」（`https://example.com/a`）・「みかん」（URL なし）・「ぶどう」（`https://example.com/a` と `https://example.com/b`）がある。
- 手順: (1) 3 つを選んで「ノードを統合」を開き、プレビューの「URL」の行を見る。(2) 「統合する」を押し、残ったノードの一覧を見る。(3) 別の兄弟 2 つに URL を 6 件と 5 件（重複なし）付けてから、その 2 つで「ノードを統合」を開く。
- 期待: (1) 「2 件（重複 1 件を除く）」。URL の本文は出ない。(2) `https://example.com/a`、`https://example.com/b` の順。(3) 状態文言が「URLをまとめると件数の上限（10 件）を超えるため、統合できません。」で、「統合する」が無効。
- 結果: -（未実施）

### AG-10 ノード検索で URL から見つかる【中】
- 前提: ノード「資料」に `https://example.com/report` と `https://example.com/会議` がある（ラベルに「report」「会議」を含まない）。
- 手順: (1) ヘッダーの検索に `report` と入力する。(2) `会議` と入力する。(3) 候補を選ぶ。
- 期待: (1)(2) 「資料」が候補に出て、補助行に「 · URL 一致」が付く。(3) 「資料」が選ばれ、中央へ移動する。
- 結果: -（未実施）

### AG-11 キャンバスの印と画像書き出し【中】
- 前提: URL のあるノードとないノード、イラスト付きで URL のあるノードがある。
- 手順: (1) キャンバスで印の位置と見え方を確かめる（選択中・接続先の強調・並べ替えのドラッグ中・ダークモード）。(2) 印を押す。(3) PNG・SVG で書き出す。
- 期待: (1) 印は右上の角に重なり、ラベル・イラストと重ならない。選択・強調で色が変わらない。ドラッグ中はノードと同じく半透明。(2) ノードを押したのと同じく選択される（リンクは開かない）。(3) 書き出した画像に印は出ない。
- 結果: -（未実施）

### AG-12 IME・押し続けの Enter・入力欄の中のキー【中】
- 前提: 日本語入力が有効。ノード「A」を選んでいる。
- 手順: (1) 「URLを追加」に `https://example.com/` と入力し、続けて日本語入力で「しりょう」と入力して変換中に `Enter` を押す。(2) 変換を確定してから `Enter` を押し続ける。(3) 入力欄で `Tab`・`Delete`・`Backspace`・`Cmd`/`Ctrl`+`Z` を押す。(4) 一覧のリンクにフォーカスを当てて `Delete` を押す。
- 期待: (1) 変換が確定するだけで追加されない。(2) 1 件だけ追加される（押し続けで二重に追加されない）。(3) ノードの削除・追加・Undo は起きず、入力欄の中だけで文字が変わる。(4) ノードは削除されない。
- 結果: -（未実施）

### AG-13 長い URL の表示と上限【中】
- 前提: ノード「A」を選んでいる。
- 手順: (1) 2,000 文字程度の英数字の URL を貼り付けて追加する。(2) 日本語を 500 文字含む URL（入力は 2,048 文字以内）を追加しようとする。(3) ダイアログ（「ノードを統合」など）を開いた状態でリンクの節を操作しようとする。
- 期待: (1) 追加され、一覧では 1 行に省略され、マウスを重ねると全文が出る。パネルは横にはみ出さない。(2) 「URLが長すぎます（2,048 文字まで。日本語などはエンコードで長くなります）。」が出る。(3) リンクの節は操作できない（編集画面の根が `inert`）。
- 結果: -（未実施）
````

「結果の集計」の表の AF 行の次に、次の AG 行を足す:

```markdown
| 未実施 | 2026-11-17 |  | 0 | 0 | 0 | 13 | Phase 18 AG-01〜AG-13（AG 節。URLの添付）。実ブラウザの観測は未実施。Jest / jsdom の結果と区別する |
```

- [ ] **Step 5: `README.md`・`client/README.md`・`docs/README.md` を更新する**

- `README.md`: 機能一覧の「21. **詳細メモ（Phase 18 の候補011）**」の項目の後（次の項目または `---` の前）に、次を足す:

```markdown
22. **URLの添付（Phase 18 の候補012）**
   - 右パネル「ノードの詳細」の中段「リンク」で、選択中のノードに http / https の URL を 10 件まで追加・削除し、新しいタブで開けます。URL はブラウザが解釈した形で保存し、`javascript:` などの URL やユーザー名・パスワードを含む URL は受け付けません。
   - URL のあるノードにはキャンバスの右上の角に小さな印が出て、ノード検索で URL からも見つかります。
   - 追加・削除は 1 回ずつ Undo / Redo でき、複製・コピー＆貼り付け・JSON の書き出しと読み込みで URL も往復し、統合では重複を除いて連結されます。保存形式は V3 のままです。
   - 詳細は [features.md の 25 章](./docs/specifications/features.md#25-urlの添付)。実ブラウザでの確認（[AG 節](./docs/testing/browser-test-cases.md)）は未実施です。
```

- `README.md` の 111 行目付近の「選択は右のパネル（詳細メモ・イラスト）と共通です。」を「選択は右のパネル（詳細メモ・リンク・イラスト）と共通です。」にする。
- `client/README.md`: 32 行目付近の「選択は右のパネル（詳細メモ・イラスト）と共通です」を「選択は右のパネル（詳細メモ・リンク・イラスト）と共通です」にし、34 行目付近の「詳細メモ（Phase 18・候補011）。…」の項目の次に、同じ書式で「URLの添付（Phase 18・候補012）。右パネル「ノードの詳細」の中段「リンク」（`NodeLinksSection`）で、選択中のノードに http / https の URL を 10 件まで追加・削除し、新しいタブで開けます（`useNodes.addNodeLink` / `removeNodeLink`。規則は `domain/nodes/nodeLink.ts`）。キャンバスに「リンクあり」の印を出し、ノード検索は URL も対象にします。保存形式は V3 の任意項目 `links`。」を足す。
- `docs/README.md`:
  - 36 行目付近の「Phase 18 の詳細メモを含む）で実装された機能の詳細仕様。…詳細メモは24章。」を「Phase 18 の詳細メモ・URLの添付を含む）で実装された機能の詳細仕様。…詳細メモは24章、URLの添付は25章。」にする。
  - 87 行目付近の「Phase 18 の詳細メモは AF 節）」を「Phase 18 の詳細メモは AF 節・URLの添付は AG 節）」にする。
  - 93 行目付近の「Phase 18 は進行中（詳細メモが完了）、Phase 19〜39 は未着手。次の未完了項目は Phase 18 の「URLの添付」」を「Phase 18 は進行中（詳細メモ・URLの添付が完了）、Phase 19〜39 は未着手。次の未完了項目は Phase 18 の「タグ」」にする。

- [ ] **Step 6: `ROADMAP.md` を更新する**

- `最終更新:` を `2026-11-17` にする（既に同日なら変えない）。
- `## Phase 18: 詳細情報と出典の蓄積（進行中）` は進行中のまま（候補023・053・054 が未完了）。
- `- [ ] **URLの添付**（候補012）` を `- [x] **URLの添付**（候補012）` にする。ほかの Phase 18 の項目（候補023・053・054）は `[ ]` のまま。
- 「現在地」の 13 行目付近（ドキュメント体系の段落）の「および Phase 18 の詳細メモに対応する」を「および Phase 18 の詳細メモ・URLの添付に対応する」にする。
- 「現在地」の Phase 18 の段落（27 行目付近）を次にする（前の段落の末尾の「次の未完了項目は Phase 18 の「URLの添付」（候補012）。」は、この書き換えで消える。`grep -n "次の未完了項目は" ROADMAP.md` で、ほかに「URLの添付」を次の項目としている文が残っていないことを確かめる）:

```markdown
- Phase 18（詳細情報と出典の蓄積）が進行中。候補011「詳細メモ」と候補012「URLの添付」が完了。右パネルを「ノードの詳細」（上から詳細メモ、リンク、イラスト）にまとめ、選択中のノード（複数選択では主選択）に最大10,000文字のプレーンテキストのメモを保存できる。入力は止まってから300ms（入力が続いても最長2秒）でマップへ反映し、フォーカスを外すと1回のUndo / Redoにまとめ、`Escape`で取り消せる。候補012では、「リンク」の節でhttp / httpsのURLを1ノード10件まで追加・削除し、新しいタブ（`noopener noreferrer`）で開ける。URLはブラウザが解釈した形（`URL.href`）で保存し、`javascript:`などのスキーム・ユーザー名やパスワードを含むURL・2,048文字を超えるURLは受け付けない。追加・削除は1回ずつUndo / Redoでき、キャンバスに「リンクあり」の印を出し、ノード検索はURLも対象にする。保存形式はV3のまま任意項目`note`・`links`を追加し、複製・コピー＆貼り付け・JSON・分割（元のノードに残す）・統合（メモは空行で連結、URLは重複を除いて連結。上限超過は統合できない）と整合する。Jest（jsdom）の自動テストと `npm run verify` で確認済み、実ブラウザ確認（`docs/testing/browser-test-cases.md` の AF 節・AG 節）は未実施。次の未完了項目は Phase 18 の「タグ」（候補023）。
```

- [ ] **Step 7: 全体検証**

Run: `cd client && npm run verify`
Expected: tailwind:scan・lint・typecheck・test・build がすべて成功。

---

## 自己レビューの結果

- 設計書との対応: 「決めたこと」1（最大 10 件）→ Task 1・2・4・7、2（表示名なし）→ Task 7（URL だけを表示）、3（http / https のみ・`noopener noreferrer`）→ Task 1（`normalizeNodeLinkUrl`・`toSafeLinkHref`）・Task 2（読み込み・貼り付け）・Task 7（`<a>`）、4（範囲）→ Task 6（印）・Task 5（検索）と Global Constraints の範囲外。「設計中に決めたこと」の項目・単一の解釈・検証の規則・重複 → Task 1・2、追加・削除の履歴 → Task 3、操作の入口 → Task 7、キャンバスの印 → Task 6、検索 → Task 5。§3.1 → Task 1、§3.2 → Task 2、§3.3 → Task 4、§3.4 → Task 2（分割・複製・貼り付け・別マップへの移動・親の挿入を固定）、§3.5 → Task 2、§3.6 → Task 5、§4 → Task 3、§5.1・§5.2・§5.3 → Task 1（文言）・Task 7、§6 → Task 6、§7 → Task 5、§8 → 各 Task のテストと Task 7 のページ統合テスト（ショートカット・`inert`・アウトライン表示）、§9 → Task 4、§10 → 各 Task、§11 → Global Constraints、§12 → Task 8。
- §10 のミューテーションの観点: スキームの許可リスト → `nodeLink.test.ts`（`javascript:`・大文字の `JavaScript:`・`data:`・`file:`・`mailto:`・`ftp:`）、資格情報 → 同（ユーザー名だけ・パスワードだけも）、上限の境界 → 同（ちょうど・1 超過・入力は上限内で `href` が超過・長さの判定が解析より先）と `mapDocumentNodeLinks.test.ts`（10 件・11 件・削る前の長さ）、`href` の正規化後の値 → `nodeLink.test.ts`・`isNodeLinkUrl`（正規化前の値は偽）、`areNodesEqual` の配列比較 → `mapHistory.test.ts`（同内容の別配列で履歴を積まない・順の違い）、キー除去 → `nodeLink.test.ts`（`withNodeLinks`・`removeNodeLink`）・`useNodesLinks.test.ts`・`nodeMerge.test.ts`（`"links" in`）、`matchedBy` の優先順位 → `nodeLabelSearch.test.ts`（両方に一致すればラベル）。
- 型と名前の一貫性: `NODE_LINKS_MAX_COUNT`・`NODE_LINK_MAX_LENGTH`・`normalizeNodeLinkUrl`・`isNodeLinkUrl`・`toSafeLinkHref`・`areNodeLinksEqual`・`formatNodeLinkFailure`・`withNodeLinks`・`addNodeLink`・`removeNodeLink`・`NodeLinkUrlFailureReason`・`NodeLinkUrlResult`・`AddNodeLinkFailureReason`・`AddNodeLinkResult`・`AddNodeLinkOutcome`（Task 1）、`normalizeMapDocumentNodeLinks`（Task 2）、`useNodes().addNodeLink`・`removeNodeLink`（Task 3。ドメインの同名の関数は `computeNodeLinkAddition`・`computeNodeLinkRemoval` の別名で import）、`links`・`linkSourceCount`・`linkDuplicateCount`・`"links-too-many"`・`linkText`（Task 4）、`matchedBy`・`normalizedLinks`（Task 5）、`createNodeLinkMarker`（Task 6）、`NodeLinksSection`（`node`・`onAddLink`・`onRemoveLink`）・`NodeDetailPanel` の `onAddLink`・`onRemoveLink`（Task 7）を全タスクで同じ名前と型で使う。
- 途中のタスクで型エラーが残らないこと: Task 1 で `Node.links` を先に足す。Task 4 で `NodeMergePreview.linkText` を必須にするのと同じタスクで、`NodeMergeDialog.test.tsx` の fixture と `useNodeMergeDialog.test.ts`・`nodeMergePreview.test.ts` の期待値を直す。Task 5 で `matchedBy` を必須にするのと同じタスクで、`nodeLabelSearch.test.ts`・`useNodeLabelSearch.test.ts`・`NodeSearchBox.test.tsx` のリテラルを直す。Task 7 で `NodeDetailPanel` の props を必須にするのと同じタスクで、`MapEditor` と `NodeDetailPanel.test.tsx` を直す（Step 4 の時点だけは `MapEditor` が未配線で型エラーになることを明記し、Step 7 で直してから Step 10 で検証する）。
- 設計書からの具体化・判断:
  - `AddNodeLinkOutcome` はフックではなくドメイン（`nodeLink.ts`）に置いた（`MergeNodesResult` が `nodeMerge.ts` にあるのと同じ。部品が `hooks` を import しないため）。
  - `areNodeLinksEqual` をドメインに足し、`mapConflict.areNodesEqual` と `isSameNodeMergePlan` で共有した（設計書は両方で「要素ごと」と書いており、同じ比較を 2 か所に書かないため）。`mapHistory.areNodesEqual` はキーを列挙する汎用の比較なので、配列一般を要素ごとに比べる形にした。
  - `useNodes.addNodeLink` は、更新関数の中で結果を外の変数へ代入する代わりに、`getCurrentState()`（`applyNonStructuralChange` と同じ ref）で判定してから確定する形にした（React Compiler の lint に引っかかりうる、コールバック内での再代入を避ける。同じイベントの連続 2 回の追加はテストで固定）。
  - 未選択のときの「リンク」節は、案内だけを出して入力欄・ボタンを描かない形にした（設計書の「無効の状態で描く」を、`disabled` の要素を作らない形で具体化。L-157）。
  - 入力欄には `placeholder` を付けない（設計書に文言が無く、`<label>`「URLを追加」で足りるため）。
  - 削除が受理されなかったとき（`removeNodeLink` が `false`）も、フォーカスは入力欄へ移す（押したボタンが残っていても、入力欄は常に有効なので害がない）。
- プランレビュー第 2 周で直した点:
  - `NodeLinksSection` の `key` から `documentRevision` を外し、ノードの ID だけにした。`documentRevision` は props で受け、描画中に前回の世代と比べて下書きとエラーだけを消す（リンク・削除ボタンにフォーカスがある状態の Undo などで節が作り直され、フォーカスが `body` へ落ちるのを避ける。L-155・L-588）。部品のテスト（`NodeLinksSection`・`NodeDetailPanel`）に、世代が変わっても同じ要素とフォーカスのまま下書きとエラーだけが消えることを足し、ページ統合テストに「削除ボタンにフォーカスして Ctrl+Z → 続けて Delete でもノードが消えない」を足した。
  - なお実際に実行すると、成功した Undo は選択を解除する（`useNodes.markDocumentRestored`）ので、ページではリンクの節が未選択の案内に切り替わり、押したボタンは消えてフォーカスは `body` に落ちる（Delete は選択が無いので何も消さない）。このページのテストはその安全性を固定するもので、`key` の回帰は部品のテストが止める。
  - Task 7 Step 8 の `grep` の期待値を、実行して出る 3 行（直前の行で `region`「イラスト」に絞ってあるもの）に直した。
  - Task 4 Step 3 に、既存のコメント「検査の順の最後（different-parents の後）」を「検査の順: different-parents の後」に改める手順を足した（「最後」のコメントを 2 つにしない）。
  - 作業ツリーの外に `client` を写し、このプランの全タスクのコードとテストの変更を当てて、`npx jest`（391 スイート・5,911 件）・`tsc --noEmit`・`eslint src` がすべて通ることを確かめた。
- セルフレビューで直した点:
  - `NodeLinksSection` の `key` を `NodeNoteEditor` と同じ `${id}:${documentRevision}` にすると、兄弟の key の重複でテキスト欄が二重に描かれることを、実装を試してテストで確かめたため、`links:` の接頭辞を付けた（Task 7 の `NodeDetailPanel`）。
  - jsdom の `<input type="url">` は値の前後の空白を削る（値のサニタイズ）ことを実行して確かめ、部品のテストから前後の空白の検査を外し、ドメインのテストで確かめる形にした。
  - Task 4 の RED の説明で、`nodeMergeMessages` の未知の理由は `default` の分岐で理由の文字列をそのまま返す（`undefined` ではない）ことに直した。
  - `nodeMerge.test.ts` の「誰も URL を持たなければ」のテストが、URL を持つノードを含む計画も検査していたので、2 件に分けた。
  - テストのコード（`nodeLink`・`mapDocumentNodeLinks`・`nodeMerge`・`nodeLabelSearch`・`NodeSearchBox`・`renderMapNodes`・`NodeLinksSection`・`NodeDetailPanel`）は、作業ツリーを変えずに一時ディレクトリで実装の案と合わせて実行し、すべて通ること（`nodeMerge` の保存の往復の 1 件だけは Task 2 の実装が要るため除く）と、実装の案が型チェックを通ることを確かめた。フック（`useNodesLinks.test.ts`）とページ統合（`pageNodeLinks.test.tsx`）のテストは、既存の実装が要るため実行していない。
