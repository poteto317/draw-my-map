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
