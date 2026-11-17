import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import { createNodeCollapseIndex, deriveNodeCollapse } from "@/domain/nodes/nodeCollapse";
import {
  isSameNodeMergePlan,
  mergeNodes,
  planNodeMerge,
  type NodeMergePlan,
} from "@/domain/nodes/nodeMerge";
import { NODE_LINKS_MAX_COUNT } from "@/domain/nodes/nodeLink";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import { NODE_TAGS_MAX_COUNT } from "@/domain/nodes/nodeTag";
import { createMapDocument, serializeMapDocument } from "@/domain/persistence/mapDocumentEncoder";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentDecoder";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

function node(id: number, parentId: number | null, label: string, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label, x: id * 10, y: id * 20, ...overrides });
}

const LINK_A = "https://example.com/a";
const LINK_B = "https://example.com/b";
const LINK_C = "https://example.org/c";

// 正規化済みの URL を count 件（https://example.com/{prefix}0 …）
function urls(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `https://example.com/${prefix}${index}`);
}

// タグ名を count 件（{prefix}0 …）
function tagNames(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

function visibleOf(nodes: readonly Node[]): Set<number> {
  return new Set(nodes.map((item) => item.id));
}

function ids(nodes: readonly Node[]): number[] {
  return nodes.map((item) => item.id);
}

function byId(nodes: readonly Node[], id: number): Node {
  return nodes.find((item) => item.id === id)!;
}

function merged(
  nodes: readonly Node[],
  selectedIds: readonly number[],
  primaryId: number | null,
  joiner = " ",
  mode: NodeLayoutMode = "manual",
  visible: ReadonlySet<number> = visibleOf(nodes),
) {
  const result = mergeNodes(nodes, selectedIds, primaryId, joiner, visible, mode);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function okPlan(nodes: readonly Node[], selectedIds: readonly number[], primaryId: number | null, joiner = " ") {
  const plan = planNodeMerge(nodes, selectedIds, primaryId, joiner, visibleOf(nodes));
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(plan.reason);
  return plan;
}

// 計画 1: 親 1 の下の兄弟 2（低）・3（高）・4（中）・8（選択しない）と、その子・孫。
// 配列は子孫を親の直後にまとめず、兄弟の間にも子を置く
const family = [
  node(1, null, "計画", { x: 0, y: 0 }),
  node(2, 1, "りんご", { importance: "low", x: 200, y: 0 }),
  node(3, 1, "リンゴ", { importance: "high", x: 200, y: 100 }),
  node(4, 1, "apple", { importance: "medium", x: 200, y: 200 }),
  node(8, 1, "バナナ", { x: 200, y: 300 }),
  node(5, 2, "りんごの子", { x: 400, y: 0 }),
  node(6, 3, "リンゴの子1", { x: 400, y: 100 }),
  node(7, 3, "リンゴの子2", { x: 400, y: 160 }),
  node(9, 5, "りんごの孫", { x: 600, y: 0 }),
];

describe("planNodeMerge", () => {
  it("主選択を残し、吸収されるノードを配列順に並べ、ラベル・重要度・付け替える子の件数を計画する", () => {
    expect(okPlan(family, [2, 3, 4], 3)).toEqual({
      ok: true,
      survivorId: 3,
      absorbedIds: [2, 4],
      label: "りんご リンゴ apple",
      importance: "high",
      illustration: undefined,
      illustrationFrom: "none",
      illustrationSourceId: null,
      discardedIllustrationCount: 0,
      movedChildCount: 1,
      note: undefined,
      noteSourceCount: 0,
      links: undefined,
      linkSourceCount: 0,
      linkDuplicateCount: 0,
      tags: undefined,
      tagSourceCount: 0,
      tagDuplicateCount: 0,
    });
  });

  it("並びは配列順で、ids の順序を変えても同じ計画になる", () => {
    const expected = okPlan(family, [2, 3, 4], 3);

    expect(okPlan(family, [4, 3, 2], 3)).toEqual(expected);
    expect(okPlan(family, [3, 4, 2, 3], 3)).toEqual(expected);
  });

  describe("ラベルの連結", () => {
    it("区切り文字で連結する（主選択が先頭でなくても、配列上の位置に入る）", () => {
      expect(okPlan(family, [2, 3, 4], 4, "・").label).toBe("りんご・リンゴ・apple");
    });

    it("区切り文字が空なら区切りなしで連結する", () => {
      expect(okPlan(family, [2, 3], 2, "").label).toBe("りんごリンゴ");
    });

    it("空文字のラベルを除き、前後の空白は削らない（空白だけが違う結果を作れる）", () => {
      const nodes = [
        node(1, null, "A "),
        node(2, null, ""),
        node(3, null, " B"),
      ];

      expect(okPlan(nodes, [1, 2, 3], 1, "").label).toBe("A  B");
      expect(okPlan(nodes, [1, 2, 3], 1, "|").label).toBe("A | B");
    });

    it("すべてのラベルが空なら空のラベルになる", () => {
      expect(okPlan([node(1, null, ""), node(2, null, "")], [1, 2], 1).label).toBe("");
    });
  });

  it("重要度は選択中で最も高いもの（選択外のノードは含めない）", () => {
    expect(okPlan(family, [2, 4], 2).importance).toBe("medium");
    expect(okPlan(family, [2, 8], 2).importance).toBe("medium");
    expect(okPlan(family, [2, 3], 2).importance).toBe("high");
    expect(okPlan([node(1, null, "a", { importance: "low" }), node(2, null, "b", { importance: "low" })], [1, 2], 1).importance)
      .toBe("low");
  });

  describe("イラストの優先順位", () => {
    const illustrationA = createJpegDataUrl(100, 100);
    const illustrationB = createJpegDataUrl(120, 120);
    const illustrated = (id: number, dataUrl: string) => node(id, 1, `ノード${id}`, { illustration: dataUrl, height: ILLUSTRATED_NODE_HEIGHT });
    const siblings = [node(1, null, "親"), node(2, 1, "持たない"), illustrated(3, illustrationA), illustrated(4, illustrationB)];

    it("主選択が持っていればそれを残す（吸収される側の 1 件が失われる）", () => {
      const plan = okPlan(siblings, [2, 3, 4], 4);

      expect(plan).toMatchObject({
        illustrationFrom: "primary",
        illustration: illustrationB,
        illustrationSourceId: null,
        discardedIllustrationCount: 1,
      });
    });

    it("主選択が持たなければ、吸収されるノードのうち配列順で最初に持つものを引き継ぐ", () => {
      const plan = okPlan(siblings, [4, 3, 2], 2);

      expect(plan).toMatchObject({
        illustrationFrom: "absorbed",
        illustration: illustrationA,
        illustrationSourceId: 3,
        discardedIllustrationCount: 1,
      });
    });

    it("持つものが無ければ none で、失われるイラストも無い", () => {
      const plan = okPlan(family, [2, 3], 2);

      expect(plan).toMatchObject({ illustrationFrom: "none", illustration: undefined, illustrationSourceId: null, discardedIllustrationCount: 0 });
    });

    it("吸収される側の 1 件だけが持つときは、引き継ぐので失われない", () => {
      expect(okPlan(siblings, [2, 3], 2)).toMatchObject({ illustrationFrom: "absorbed", discardedIllustrationCount: 0 });
    });
  });

  it("付け替える子の件数は、吸収されるノードの直下の子の数で、孫は数えない", () => {
    expect(okPlan(family, [2, 3], 3).movedChildCount).toBe(1);
    expect(okPlan(family, [2, 3], 2).movedChildCount).toBe(2);
    expect(okPlan(family, [2, 3, 4], 2).movedChildCount).toBe(2);
    expect(okPlan(family, [4, 8], 4).movedChildCount).toBe(0);
  });

  it("付け替える子の件数は、折りたたみ・解像度で隠れた子も数える（表示されている集合に絞らない。L-460）", () => {
    // 2 の子 5 と、5 の子 9 を、表示されていないことにする（選択した 2・3 は表示されている）
    const visible = new Set([1, 2, 3, 4, 6, 7, 8]);

    expect(okPlan(family, [2, 3], 3).movedChildCount).toBe(1);
    const plan = planNodeMerge(family, [2, 3], 3, " ", visible);
    expect(plan.ok && plan.movedChildCount).toBe(1);
  });

  it("配列を変えない", () => {
    const frozen = Object.freeze(family.map((item) => Object.freeze({ ...item })));

    expect(planNodeMerge(frozen, [2, 3], 3, " ", visibleOf(frozen)).ok).toBe(true);
  });

  describe("メモの連結", () => {
    // 親 1 の下の兄弟 2・3・4・5。2 と 4 がメモを持ち、3・5 は持たない
    const withNotes = [
      node(1, null, "親"),
      node(2, 1, "a", { note: "メモA" }),
      node(3, 1, "b"),
      node(4, 1, "c", { note: "メモC\n2行目" }),
      node(5, 1, "d"),
    ];

    it("選択中のメモを配列順に空行で連結し、メモの無いノードは飛ばす（ids の順序に依存しない）", () => {
      expect(okPlan(withNotes, [4, 3, 2], 3)).toMatchObject({ note: "メモA\n\nメモC\n2行目", noteSourceCount: 2 });
    });

    it("主選択のメモも、配列上の位置に入る", () => {
      expect(okPlan(withNotes, [2, 4], 4)).toMatchObject({ note: "メモA\n\nメモC\n2行目", noteSourceCount: 2 });
    });

    it("メモが 1 つだけなら、そのまま", () => {
      expect(okPlan(withNotes, [3, 4], 3)).toMatchObject({ note: "メモC\n2行目", noteSourceCount: 1 });
    });

    it("誰もメモを持たなければ undefined と 0", () => {
      expect(okPlan(withNotes, [3, 5], 3)).toMatchObject({ note: undefined, noteSourceCount: 0 });
    });

    it("連結がちょうど上限なら統合できる", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { note: "a".repeat(5000) }),
        node(3, 1, "b", { note: "b".repeat(NODE_NOTE_MAX_LENGTH - 5000 - 2) }),
      ];

      expect(okPlan(nodes, [2, 3], 2).note).toHaveLength(NODE_NOTE_MAX_LENGTH);
    });

    it("連結が上限を 1 超えると note-too-long（黙って切り詰めない）", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { note: "a".repeat(5000) }),
        node(3, 1, "b", { note: "b".repeat(NODE_NOTE_MAX_LENGTH - 5000 - 1) }),
      ];

      expect(planNodeMerge(nodes, [2, 3], 2, " ", visibleOf(nodes))).toEqual({ ok: false, reason: "note-too-long" });
    });

    it("メモの長さの検査は different-parents の後（親が違えば、メモが長くても different-parents）", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { note: "a".repeat(NODE_NOTE_MAX_LENGTH) }),
        node(3, null, "b", { note: "b".repeat(NODE_NOTE_MAX_LENGTH) }),
      ];

      expect(planNodeMerge(nodes, [2, 3], 2, " ", visibleOf(nodes))).toEqual({ ok: false, reason: "different-parents" });
    });
  });

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

  describe("タグの連結", () => {
    // 親 1 の下の兄弟 2・3・4・5。2・4・5 がタグを持ち、3 は持たない。「Python」と「重要」は表記違いで 2 つのノードが持つ
    const withTags = [
      node(1, null, "親"),
      node(2, 1, "a", { tags: ["Python", "資料"] }),
      node(3, 1, "b"),
      node(4, 1, "c", { tags: ["python", "重要"] }),
      node(5, 1, "d", { tags: ["ＰＹＴＨＯＮ", "重要"] }),
    ];

    it("選択中のタグを配列順に並べ、同じタグとみなすもの（nodeTagKey）は最初の表記を残して除く（ids の順序に依存しない）", () => {
      expect(okPlan(withTags, [5, 4, 3, 2], 3)).toMatchObject({
        tags: ["Python", "資料", "重要"],
        tagSourceCount: 3,
        tagDuplicateCount: 3,
      });
    });

    it("主選択のタグも、配列上の位置に入る（主選択の表記が後なら、前のノードの表記が残る）", () => {
      expect(okPlan(withTags, [2, 4], 4)).toMatchObject({
        tags: ["Python", "資料", "重要"],
        tagSourceCount: 2,
        tagDuplicateCount: 1,
      });
    });

    it("U+200D・U+FE0F を挟んだだけの違いも同じタグとみなして除く（最初の表記を残す）", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { tags: ["AI"] }),
        node(3, 1, "b", { tags: ["A\u200dI", "A\ufe0fI"] }),
      ];

      expect(okPlan(nodes, [2, 3], 2)).toMatchObject({ tags: ["AI"], tagSourceCount: 2, tagDuplicateCount: 2 });
    });

    it("大文字小文字だけが違う同じタグ（toLowerCase の後に NFKC が崩れる組）も同じタグとみなして除く", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { tags: ["\u0390", "\u1e97"] }),
        node(3, 1, "b", { tags: ["\u03aa\u0301", "T\u0308"] }),
      ];

      expect(okPlan(nodes, [2, 3], 2)).toMatchObject({ tags: ["\u0390", "\u1e97"], tagSourceCount: 2, tagDuplicateCount: 2 });
    });

    it("3 文字を除いて空白が残る組も同じタグとみなして除く", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { tags: ["AI", "機械 学習"] }),
        node(3, 1, "b", { tags: ["AI \u200d", "機械 \u200d 学習"] }),
      ];

      expect(okPlan(nodes, [2, 3], 2)).toMatchObject({ tags: ["AI", "機械 学習"], tagSourceCount: 2, tagDuplicateCount: 2 });
    });

    it("合成済みの文字と、U+200D で合成が途切れた並びも同じタグとみなして除く", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { tags: ["\u00e9", "\u30ac"] }),
        node(3, 1, "b", { tags: ["e\u200d\u0301", "\uff76\u200d\uff9e"] }),
      ];

      expect(okPlan(nodes, [2, 3], 2)).toMatchObject({ tags: ["\u00e9", "\u30ac"], tagSourceCount: 2, tagDuplicateCount: 2 });
    });

    it("タグを持つノードが 1 つだけなら、そのタグのまま（重複 0 件）", () => {
      expect(okPlan(withTags, [3, 2], 3)).toMatchObject({ tags: ["Python", "資料"], tagSourceCount: 1, tagDuplicateCount: 0 });
    });

    it("誰もタグを持たなければ undefined と 0 件", () => {
      const plain = [node(1, null, "親"), node(2, 1, "a"), node(3, 1, "b")];

      expect(okPlan(plain, [2, 3], 2)).toMatchObject({ tags: undefined, tagSourceCount: 0, tagDuplicateCount: 0 });
    });

    it("同じタグとみなすものを除いてちょうど上限（10 件）なら統合できる", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { tags: tagNames("a", 6) }),
        node(3, 1, "b", { tags: [...tagNames("A", 2), ...tagNames("b", 4)] }),
      ];

      expect(okPlan(nodes, [2, 3], 2)).toMatchObject({ tagSourceCount: 2, tagDuplicateCount: 2 });
      expect(okPlan(nodes, [2, 3], 2).tags).toHaveLength(NODE_TAGS_MAX_COUNT);
    });

    it("同じタグとみなすものを除いて上限を 1 超えると tags-too-many（黙って切り詰めない）", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { tags: tagNames("a", 6) }),
        node(3, 1, "b", { tags: tagNames("b", 5) }),
      ];

      expect(planNodeMerge(nodes, [2, 3], 2, " ", visibleOf(nodes))).toEqual({ ok: false, reason: "tags-too-many" });
    });

    it("タグの件数の検査は links-too-many の後（URL も多ければ links-too-many）", () => {
      const nodes = [
        node(1, null, "親"),
        node(2, 1, "a", { tags: tagNames("a", 6), links: urls("a", 6) }),
        node(3, 1, "b", { tags: tagNames("b", 5), links: urls("b", 5) }),
      ];

      expect(planNodeMerge(nodes, [2, 3], 2, " ", visibleOf(nodes))).toEqual({ ok: false, reason: "links-too-many" });
    });
  });

  describe("各 reason と、検査の順序", () => {
    const failure = (
      nodes: readonly Node[],
      selectedIds: readonly number[],
      primaryId: number | null,
      visible: ReadonlySet<number> = visibleOf(nodes),
    ) => planNodeMerge(nodes, selectedIds, primaryId, " ", visible);

    it("重複を除いて 2 件未満なら too-few-nodes（存在しない ID でもそちらが先）", () => {
      expect(failure(family, [], null)).toEqual({ ok: false, reason: "too-few-nodes" });
      expect(failure(family, [2], 2)).toEqual({ ok: false, reason: "too-few-nodes" });
      expect(failure(family, [2, 2, 2], 2)).toEqual({ ok: false, reason: "too-few-nodes" });
      expect(failure(family, [99], 99)).toEqual({ ok: false, reason: "too-few-nodes" });
    });

    it("1 つでも配列に無い ID があれば node-missing（非表示の判定より先）", () => {
      expect(failure(family, [2, 99], 2, new Set())).toEqual({ ok: false, reason: "node-missing" });
    });

    it("1 つでも表示されていなければ node-hidden（主選択の判定より先）", () => {
      expect(failure(family, [2, 3], null, new Set([1, 2]))).toEqual({ ok: false, reason: "node-hidden" });
    });

    it("主選択が null または選択に含まれなければ primary-missing（座標の不正より先）", () => {
      const broken = [node(1, null, "a", { width: 0 }), node(2, null, "b")];

      expect(failure(broken, [1, 2], null)).toEqual({ ok: false, reason: "primary-missing" });
      expect(failure(family, [2, 3], 4)).toEqual({ ok: false, reason: "primary-missing" });
    });

    it("座標が有限でない・幅高が 0 以下のノードがあれば placement-failed（構造の不正より先）", () => {
      const broken = [node(1, null, "a", { x: Number.NaN }), node(2, null, "b"), node(2, null, "重複")];

      expect(failure(broken, [1, 2], 1)).toEqual({ ok: false, reason: "placement-failed" });
    });

    it("森として不正（ID の重複・親が無い・循環）なら invalid-structure（親の不一致より先）", () => {
      expect(failure([node(1, null, "a"), node(2, 99, "b")], [1, 2], 1)).toEqual({ ok: false, reason: "invalid-structure" });
      expect(failure([node(1, null, "a"), node(1, null, "b"), node(2, null, "c")], [1, 2], 1)).toEqual({ ok: false, reason: "invalid-structure" });
      expect(failure([node(1, 2, "a"), node(2, 1, "b")], [1, 2], 1)).toEqual({ ok: false, reason: "invalid-structure" });
    });

    it("親が揃わなければ different-parents（別の親の子・ルートと子・祖先と子孫・孫と子）", () => {
      expect(failure(family, [5, 6], 5)).toEqual({ ok: false, reason: "different-parents" });
      expect(failure(family, [1, 2], 1)).toEqual({ ok: false, reason: "different-parents" });
      expect(failure(family, [2, 5], 2)).toEqual({ ok: false, reason: "different-parents" });
      expect(failure(family, [2, 9], 2)).toEqual({ ok: false, reason: "different-parents" });
    });
  });
});

describe("isSameNodeMergePlan", () => {
  const base = okPlan(family, [2, 3, 4], 3);

  it("残すノード・吸収されるノードの順・ラベル・イラストの引き継ぎ元が同じなら真", () => {
    expect(isSameNodeMergePlan(base, okPlan(family, [4, 2, 3], 3))).toBe(true);
  });

  it.each([
    ["残すノードが違う", okPlan(family, [2, 3, 4], 2)],
    ["吸収されるノードが違う", okPlan(family, [2, 3], 3)],
    ["区切り文字でラベルが違う", okPlan(family, [2, 3, 4], 3, "-")],
  ])("%sなら偽", (_name, other) => {
    expect(isSameNodeMergePlan(base, other)).toBe(false);
  });

  it("イラストの引き継ぎ元が違えば偽", () => {
    const withIllustration = family.map((item) => (item.id === 4 ? { ...item, illustration: createJpegDataUrl(100, 100) } : item));

    expect(isSameNodeMergePlan(base, okPlan(withIllustration, [2, 3, 4], 3))).toBe(false);
  });

  describe("プレビューで見せた内容（失われるイラストの件数・重要度・イラストの扱い・付け替える子の件数）が違えば偽", () => {
    const illustration = createJpegDataUrl(100, 100);
    // 主選択 3 だけがイラストを持つ計画（引き継ぎ元は主選択。失われる件数は 0）
    const primaryOnly = family.map((item) => (item.id === 3 ? { ...item, illustration, height: ILLUSTRATED_NODE_HEIGHT } : item));
    const primaryOnlyPlan = okPlan(primaryOnly, [2, 3, 4], 3);

    it("吸収側にもイラストが付いて、失われる件数だけが違う計画は偽（引き継ぎ元は同じ主選択）", () => {
      const absorbedHasIllustration = primaryOnly.map((item) => (item.id === 2 ? { ...item, illustration } : item));
      const other = okPlan(absorbedHasIllustration, [2, 3, 4], 3);

      expect(other).toMatchObject({ illustrationFrom: "primary", illustrationSourceId: null, discardedIllustrationCount: 1 });
      expect(isSameNodeMergePlan(primaryOnlyPlan, other)).toBe(false);
    });

    it("吸収側のイラストの持ち主だけが違う計画は偽（ほかの項目はすべて同じで、別のイラストで確定させない）", () => {
      const illustrationA = createJpegDataUrl(100, 100);
      const illustrationB = createJpegDataUrl(120, 120);
      const onlyNode2 = family.map((item) => (item.id === 2 ? { ...item, illustration: illustrationA, height: ILLUSTRATED_NODE_HEIGHT } : item));
      const onlyNode4 = family.map((item) => (item.id === 4 ? { ...item, illustration: illustrationB, height: ILLUSTRATED_NODE_HEIGHT } : item));
      const fromNode2 = okPlan(onlyNode2, [2, 3, 4], 3);
      const fromNode4 = okPlan(onlyNode4, [2, 3, 4], 3);

      expect(fromNode2).toMatchObject({ illustrationFrom: "absorbed", illustrationSourceId: 2, discardedIllustrationCount: 0 });
      expect(fromNode4).toMatchObject({ illustrationFrom: "absorbed", illustrationSourceId: 4, discardedIllustrationCount: 0 });
      // 引き継ぎ元とイラスト本体以外は、プレビューで見せる項目がすべて同じ
      expect({ ...fromNode2, illustrationSourceId: null, illustration: undefined })
        .toEqual({ ...fromNode4, illustrationSourceId: null, illustration: undefined });
      expect(isSameNodeMergePlan(fromNode2, fromNode4)).toBe(false);
    });

    it("重要度が違う計画は偽", () => {
      expect(isSameNodeMergePlan(base, { ...base, importance: "low" })).toBe(false);
    });

    it("イラストの扱い（illustrationFrom）が違う計画は偽", () => {
      expect(isSameNodeMergePlan(primaryOnlyPlan, { ...primaryOnlyPlan, illustrationFrom: "none" })).toBe(false);
    });

    it("付け替える子の件数が違う計画は偽", () => {
      expect(isSameNodeMergePlan(base, { ...base, movedChildCount: base.movedChildCount + 1 })).toBe(false);
    });
  });

  it("連結したメモ・メモの件数が違えば偽（プレビューで見せた内容が確定時に変わっていない。L-036）", () => {
    expect(isSameNodeMergePlan(base, { ...base, note: "確認の後に書いたメモ" })).toBe(false);
    expect(isSameNodeMergePlan(base, { ...base, noteSourceCount: base.noteSourceCount + 1 })).toBe(false);
  });

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

  it("連結したタグ・タグの件数・重複の件数が違えば偽（L-036）", () => {
    expect(isSameNodeMergePlan(base, { ...base, tags: ["重要"] })).toBe(false);
    expect(isSameNodeMergePlan(base, { ...base, tagSourceCount: base.tagSourceCount + 1 })).toBe(false);
    expect(isSameNodeMergePlan(base, { ...base, tagDuplicateCount: base.tagDuplicateCount + 1 })).toBe(false);
  });

  it("連結したタグは要素ごとに比べる（別の配列でも内容が同じなら真、順や表記が違えば偽）", () => {
    const withTags = { ...base, tags: ["Python", "重要"] };

    expect(isSameNodeMergePlan(withTags, { ...base, tags: ["Python", "重要"] })).toBe(true);
    expect(isSameNodeMergePlan(withTags, { ...base, tags: ["重要", "Python"] })).toBe(false);
    expect(isSameNodeMergePlan(withTags, { ...base, tags: ["python", "重要"] })).toBe(false);
  });

  it("吸収されるノードの順が違えば偽", () => {
    const reordered: NodeMergePlan = { ...base, absorbedIds: [4, 2] };

    expect(isSameNodeMergePlan(base, reordered)).toBe(false);
  });

  it("どちらかが失敗した計画なら、同じ失敗でも偽", () => {
    const failedPlan: NodeMergePlan = { ok: false, reason: "different-parents" };

    expect(isSameNodeMergePlan(failedPlan, failedPlan)).toBe(false);
    expect(isSameNodeMergePlan(base, failedPlan)).toBe(false);
  });
});

describe("mergeNodes", () => {
  it("主選択が残り、吸収されるノードは配列から消え、残すノードのラベル・重要度だけが変わる", () => {
    const result = merged(family, [2, 3, 4], 3);

    expect(result.survivorId).toBe(3);
    expect(result.absorbedIds).toEqual([2, 4]);
    expect(ids(result.nodes)).not.toContain(2);
    expect(ids(result.nodes)).not.toContain(4);
    // 位置・大きさ・id・parentId は主選択のまま
    expect(byId(result.nodes, 3)).toEqual({ ...byId(family, 3), label: "りんご リンゴ apple", importance: "high" });
  });

  it("吸収されるノードの子を、残すノードの直下の子の最後のものの直後へ付け替える（座標は変えない）", () => {
    const result = merged(family, [2, 3, 4], 3);

    // 残すノード 3 の子 6・7 の後ろへ、2 の子 5 が入る。5 の孫 9 は動かない
    expect(ids(result.nodes)).toEqual([1, 3, 8, 6, 7, 5, 9]);
    expect(byId(result.nodes, 5)).toEqual({ ...byId(family, 5), parentId: 3 });
    expect(byId(result.nodes, 9)).toBe(byId(family, 9));
    expect(result.nodes.filter((item) => item.parentId === 3).map((item) => item.id)).toEqual([6, 7, 5]);
  });

  describe("隠れた（表示されていない）子を含めて、全体の配列を基準に付け替える（L-460）", () => {
    it("吸収されるノードの隠れた子も付け替え、隠れた孫は動かさない", () => {
      // 2 の子 5 と、5 の子 9 を、表示されていないことにする
      const visible = new Set([1, 2, 3, 4, 6, 7, 8]);

      const result = merged(family, [2, 3], 3, " ", "manual", visible);

      expect(ids(result.nodes)).toEqual([1, 3, 4, 8, 6, 7, 5, 9]);
      expect(byId(result.nodes, 5)).toEqual({ ...byId(family, 5), parentId: 3 });
      expect(byId(result.nodes, 9)).toBe(byId(family, 9));
    });

    it("残すノードの最後の子が隠れていても、その子の直後へ差し込む", () => {
      // 3 の子 6・7 のうち、最後の 7 を表示されていないことにする（見えている子だけを基準にすると、6 の直後になる）
      const visible = new Set([1, 2, 3, 4, 5, 6, 8, 9]);

      const result = merged(family, [2, 3], 3, " ", "manual", visible);

      expect(ids(result.nodes)).toEqual([1, 3, 4, 8, 6, 7, 5, 9]);
      expect(result.nodes.filter((item) => item.parentId === 3).map((item) => item.id)).toEqual([6, 7, 5]);
    });
  });

  it("子孫が間にあっても、残すノードの直下の子の最後のものの直後へ差し込む", () => {
    // 残すノード 2 の子は 4（直後に孫 8）と 5（直後に孫 9）。吸収される 3 の子 6・7 は配列の後ろにある
    const nodes = [
      node(1, null, "親"),
      node(2, 1, "残す"),
      node(4, 2, "子 1"),
      node(8, 4, "子 1 の孫"),
      node(5, 2, "子 2"),
      node(9, 5, "子 2 の孫"),
      node(3, 1, "吸収"),
      node(6, 3, "付け替え 1"),
      node(7, 3, "付け替え 2"),
      node(10, null, "別の根"),
    ];

    const result = merged(nodes, [2, 3], 2);

    expect(ids(result.nodes)).toEqual([1, 2, 4, 8, 5, 6, 7, 9, 10]);
    expect(result.nodes.filter((item) => item.parentId === 2).map((item) => item.id)).toEqual([4, 5, 6, 7]);
  });

  it("残すノードに子が無ければ、残すノードの直後へ、吸収されるノードの配列順・各ノード内の元の順で付け替える", () => {
    // 吸収される 3・4 の子は、配列で吸収されるノードより前にもある（20）
    const nodes = [
      node(1, null, "親"),
      node(2, 1, "残す"),
      node(3, 1, "吸収 1"),
      node(4, 1, "吸収 2"),
      node(20, 4, "吸収 2 の子"),
      node(21, 3, "吸収 1 の子 a"),
      node(22, 3, "吸収 1 の子 b"),
    ];

    const result = merged(nodes, [4, 3, 2], 2);

    expect(ids(result.nodes)).toEqual([1, 2, 21, 22, 20]);
    expect(result.nodes.slice(2).every((item) => item.parentId === 2)).toBe(true);
  });

  it("残すノードの子が配列で残すノードより前にあるときは、その最後の子の直後へ差し込む", () => {
    const nodes = [
      node(1, null, "親"),
      node(4, 2, "残すノードの子"),
      node(2, 1, "残す"),
      node(3, 1, "吸収"),
      node(5, 3, "吸収の子"),
    ];

    expect(ids(merged(nodes, [2, 3], 2).nodes)).toEqual([1, 4, 5, 2]);
  });

  it("ルート同士（親が null）も統合でき、吸収されるルートの子は残すルートの子になる", () => {
    const nodes = [
      node(1, null, "根 A", { x: 10, y: 20 }),
      node(2, null, "根 B", { x: 30, y: 40 }),
      node(3, 1, "A の子"),
      node(4, 2, "B の子"),
    ];

    const result = merged(nodes, [1, 2], 1);

    expect(ids(result.nodes)).toEqual([1, 3, 4]);
    expect(result.nodes.map((item) => item.parentId)).toEqual([null, 1, 1]);
  });

  describe("自動配置での先頭のルートの座標の引き継ぎ", () => {
    const roots = [
      node(1, null, "根 A", { x: 10, y: 20 }),
      node(2, null, "根 B", { x: 30, y: 40 }),
      node(3, null, "根 C", { x: 50, y: 60 }),
      node(4, 2, "B の子", { x: 70, y: 80 }),
    ];

    it("先頭のルートが吸収され、統合後の先頭のルートが別のノードになるとき、旧先頭の座標を新しい先頭へ写す", () => {
      const result = merged(roots, [1, 2], 2, " ", "auto");

      expect(byId(result.nodes, 2)).toMatchObject({ x: 10, y: 20, label: "根 A 根 B" });
    });

    it("新しい先頭のルートは、残すノードでなくてもよい（吸収されるのが先頭で、残すのが 3 のとき、新しい先頭は 2）", () => {
      const result = merged(roots, [1, 3], 3, " ", "auto");

      expect(ids(result.nodes)).toEqual([2, 3, 4]);
      expect(byId(result.nodes, 2)).toMatchObject({ x: 10, y: 20 });
      expect(byId(result.nodes, 3)).toMatchObject({ x: 50, y: 60 });
    });

    it("手動配置では座標を引き継がない", () => {
      const result = merged(roots, [1, 2], 2, " ", "manual");

      expect(byId(result.nodes, 2)).toMatchObject({ x: 30, y: 40 });
    });

    it("残すノードが先頭のルートのとき、先頭のルートが吸収されないときは座標を変えない", () => {
      expect(byId(merged(roots, [1, 2], 1, " ", "auto").nodes, 1)).toMatchObject({ x: 10, y: 20 });
      expect(byId(merged(roots, [2, 3], 3, " ", "auto").nodes, 3)).toMatchObject({ x: 50, y: 60 });
      expect(byId(merged(roots, [2, 3], 2, " ", "auto").nodes, 2)).toMatchObject({ x: 30, y: 40 });
    });

    it("兄弟の統合（ルートでない）では座標を引き継がない", () => {
      const result = merged(family, [2, 3], 3, " ", "auto");

      expect(byId(result.nodes, 3)).toMatchObject({ x: 200, y: 100 });
      expect(byId(result.nodes, 1)).toMatchObject({ x: 0, y: 0 });
    });
  });

  describe("詳細メモ", () => {
    const withNotes = [
      node(1, null, "親"),
      node(2, 1, "a", { note: "メモA" }),
      node(3, 1, "b"),
      node(4, 1, "c", { note: "メモC" }),
    ];

    it("残すノードのメモは、選択中のメモを配列順に空行で連結したもの（残すノードがメモを持たなくても付く）", () => {
      const survivor = byId(merged(withNotes, [2, 3, 4], 3).nodes, 3);

      expect(survivor.note).toBe("メモA\n\nメモC");
    });

    it("残すノードだけがメモを持つときは、そのメモのまま", () => {
      const survivor = byId(merged(withNotes, [2, 3], 2).nodes, 2);

      expect(survivor.note).toBe("メモA");
    });

    it("誰もメモを持たなければ note のキーを持たない", () => {
      const plain = [node(1, null, "親"), node(2, 1, "a"), node(3, 1, "b")];

      expect("note" in byId(merged(plain, [2, 3], 2).nodes, 2)).toBe(false);
    });

    it("連結が上限を超えるときは note-too-long を返し、統合しない", () => {
      const long = [
        node(1, null, "親"),
        node(2, 1, "a", { note: "a".repeat(6000) }),
        node(3, 1, "b", { note: "b".repeat(4000) }),
      ];

      expect(mergeNodes(long, [2, 3], 2, " ", visibleOf(long), "manual")).toEqual({ ok: false, reason: "note-too-long" });
    });

    it("連結したメモは保存と読み込みで往復する", () => {
      const result = merged(withNotes, [2, 3, 4], 3);
      const parsed = parseMapDocumentJson(serializeMapDocument(createMapDocument(result.nodes, "manual")));

      expect(parsed.ok && parsed.value.nodes.find((item) => item.id === 3)?.note).toBe("メモA\n\nメモC");
    });
  });

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

  describe("タグ", () => {
    const withTags = [
      node(1, null, "親"),
      node(2, 1, "a", { tags: ["Python", "資料"] }),
      node(3, 1, "b"),
      node(4, 1, "c", { tags: ["python", "重要"] }),
    ];

    it("残すノードのタグは、選択中のタグを配列順に同じタグとみなすものを除いて並べたもの（残すノードがタグを持たなくても付く）", () => {
      expect(byId(merged(withTags, [2, 3, 4], 3).nodes, 3).tags).toEqual(["Python", "資料", "重要"]);
    });

    it("残すノードだけがタグを持つときは、そのタグのまま", () => {
      expect(byId(merged(withTags, [2, 3], 2).nodes, 2).tags).toEqual(["Python", "資料"]);
    });

    it("誰もタグを持たなければ tags のキーを持たない", () => {
      const plain = [node(1, null, "親"), node(2, 1, "a"), node(3, 1, "b")];

      expect("tags" in byId(merged(plain, [2, 3], 2).nodes, 2)).toBe(false);
    });

    it("同じタグとみなすものを除いて上限を超えるときは tags-too-many を返し、統合しない", () => {
      const many = [
        node(1, null, "親"),
        node(2, 1, "a", { tags: tagNames("a", 6) }),
        node(3, 1, "b", { tags: tagNames("b", 5) }),
      ];

      expect(mergeNodes(many, [2, 3], 2, " ", visibleOf(many), "manual")).toEqual({ ok: false, reason: "tags-too-many" });
    });

    it("連結したタグは保存と読み込みで往復する", () => {
      const result = merged(withTags, [2, 3, 4], 3);
      const parsed = parseMapDocumentJson(serializeMapDocument(createMapDocument(result.nodes, "manual")));

      expect(parsed.ok && parsed.value.nodes.find((item) => item.id === 3)?.tags).toEqual(["Python", "資料", "重要"]);
    });
  });

  describe("イラストと高さ", () => {
    const illustrationA = createJpegDataUrl(100, 100);
    const illustrationB = createJpegDataUrl(120, 120);
    const nodes = [
      node(1, null, "親"),
      node(2, 1, "持たない", { width: 140 }),
      node(3, 1, "A", { illustration: illustrationA, height: ILLUSTRATED_NODE_HEIGHT }),
      node(4, 1, "B", { illustration: illustrationB, height: ILLUSTRATED_NODE_HEIGHT }),
    ];

    it("主選択が持っていれば、そのイラストと高さのまま残る", () => {
      const survivor = byId(merged(nodes, [2, 3, 4], 4).nodes, 4);

      expect(survivor).toMatchObject({ illustration: illustrationB, height: ILLUSTRATED_NODE_HEIGHT });
    });

    it("主選択が持たなければ、配列順で最初の吸収されるノードのイラストを引き継ぎ、高さをイラスト付きの高さにする", () => {
      const survivor = byId(merged(nodes, [2, 3, 4], 2).nodes, 2);

      expect(survivor).toMatchObject({
        illustration: illustrationA,
        height: ILLUSTRATED_NODE_HEIGHT,
        width: 140,
        x: 20,
        y: 40,
      });
    });

    it("持つものが無ければ illustration のキーを持たず、高さも変えない", () => {
      const plain = [node(1, null, "親"), node(2, 1, "a"), node(3, 1, "b")];

      const survivor = byId(merged(plain, [2, 3], 2).nodes, 2);

      expect("illustration" in survivor).toBe(false);
      expect(survivor.height).toBe(60);
    });
  });

  describe("結果は保存と読み込みの検証を通る", () => {
    function roundTrips(nodes: readonly Node[], mode: NodeLayoutMode = "manual") {
      return parseMapDocumentJson(serializeMapDocument(createMapDocument(nodes, mode)));
    }

    it("吸収されるノードのイラストを引き継いだ結果（高さがイラスト付きの高さ）", () => {
      const illustrated = [
        node(1, null, "親"),
        node(2, 1, "持たない"),
        node(3, 1, "持つ", { illustration: createJpegDataUrl(100, 100), height: ILLUSTRATED_NODE_HEIGHT }),
      ];

      const result = merged(illustrated, [2, 3], 2);

      expect(byId(result.nodes, 2).height).toBe(ILLUSTRATED_NODE_HEIGHT);
      expect(roundTrips(result.nodes).ok).toBe(true);
    });

    it("子・孫を付け替えた結果", () => {
      const result = merged(family, [2, 3, 4], 3);

      expect(roundTrips(result.nodes).ok).toBe(true);
    });
  });

  it("ほかのノードは同じオブジェクトのまま相対順を変えず、元の配列は変えない", () => {
    const frozen = Object.freeze(family.map((item) => Object.freeze({ ...item })));

    const result = merged(frozen, [2, 3, 4], 3);

    const untouchedIds = [1, 8, 6, 7, 9];
    for (const id of untouchedIds) expect(byId(result.nodes, id)).toBe(byId(frozen, id));
    expect(ids(result.nodes).filter((id) => untouchedIds.includes(id))).toEqual([1, 8, 6, 7, 9]);
  });

  it("計画の失敗は、その reason をそのまま返す（兄弟でない選択・祖先と子孫の選択を拒否する）", () => {
    expect(mergeNodes(family, [2, 5], 2, " ", visibleOf(family), "manual")).toEqual({ ok: false, reason: "different-parents" });
    expect(mergeNodes(family, [1, 2], 1, " ", visibleOf(family), "manual")).toEqual({ ok: false, reason: "different-parents" });
    expect(mergeNodes(family, [2], 2, " ", visibleOf(family), "manual")).toEqual({ ok: false, reason: "too-few-nodes" });
    expect(mergeNodes(family, [2, 3], 2, " ", new Set([1, 2]), "manual")).toEqual({ ok: false, reason: "node-hidden" });
  });

  describe("折りたたみ状態の違う親へ子を付け替えたときの見え方", () => {
    const tree = [
      node(1, null, "根"),
      node(2, 1, "A"),
      node(3, 1, "B"),
      node(5, 2, "A の子"),
      node(6, 3, "B の子"),
    ];

    function visibleAfterMerge(collapsed: readonly number[], primaryId: number) {
      const result = merged(tree, [2, 3], primaryId);
      const index = createNodeCollapseIndex(result.nodes)!;
      return deriveNodeCollapse(index, new Set(collapsed)).visibleNodeIds;
    }

    it("閉じていた A を吸収し、開いている B を残すと、A の子が見えるようになる", () => {
      const before = deriveNodeCollapse(createNodeCollapseIndex(tree)!, new Set([2])).visibleNodeIds;
      expect(before.has(5)).toBe(false);

      expect(visibleAfterMerge([2], 3).has(5)).toBe(true);
    });

    it("開いていた A を吸収し、閉じている B を残すと、A の子が見えなくなる", () => {
      const before = deriveNodeCollapse(createNodeCollapseIndex(tree)!, new Set([3])).visibleNodeIds;
      expect(before.has(5)).toBe(true);

      expect(visibleAfterMerge([3], 3).has(5)).toBe(false);
    });
  });
});
