import { planNodeMerge, type NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
import {
  NODE_MERGE_PREVIEW_LIMIT,
  buildNodeMergePreview,
  describeNodeMergeStatus,
} from "@/hooks/nodeMergePreview";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";

function node(id: number, label: string, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId: null, label, ...overrides });
}

function okPlan(nodes: readonly Node[], ids: readonly number[], primaryId: number, joiner = " "): NodeMergePlan {
  return planNodeMerge(nodes, ids, primaryId, joiner, new Set(nodes.map((item) => item.id)));
}

describe("describeNodeMergeStatus", () => {
  const nodes = [node(1, "a"), node(2, "b"), node(3, "c")];

  it("stale のときは、計画より先に更新を促す文言を返す", () => {
    expect(describeNodeMergeStatus(true, okPlan(nodes, [1, 2], 1))).toBe(STALE_DIALOG_MESSAGE);
    expect(describeNodeMergeStatus(true, null)).toBe(STALE_DIALOG_MESSAGE);
  });

  it("計画が無ければ空文字", () => {
    expect(describeNodeMergeStatus(false, null)).toBe("");
  });

  it("成功の計画は、統合するノードの総数を「N件を1件に統合します」で返す", () => {
    expect(describeNodeMergeStatus(false, okPlan(nodes, [1, 2], 1))).toBe("2件を1件に統合します");
    expect(describeNodeMergeStatus(false, okPlan(nodes, [1, 2, 3], 2))).toBe("3件を1件に統合します");
  });

  it("失敗の計画は、その reason の文言を返す", () => {
    expect(describeNodeMergeStatus(false, { ok: false, reason: "too-few-nodes" })).toBe("2 つ以上のノードを選択してください。");
    expect(describeNodeMergeStatus(false, { ok: false, reason: "different-parents" })).toBe("同じ親の兄弟のノードだけを統合できます。");
    expect(describeNodeMergeStatus(false, { ok: false, reason: "primary-missing" })).toBe("主選択のノードがありません。");
  });
});

describe("buildNodeMergePreview", () => {
  it("失敗の計画は null", () => {
    expect(buildNodeMergePreview([], { ok: false, reason: "too-few-nodes" })).toBeNull();
  });

  it("統合後のラベル・重要度の表示・付け替える子の件数・消えるノードのラベルを配列順にまとめる", () => {
    const nodes = [
      node(1, "親"),
      node(2, "りんご", { parentId: 1, importance: "low" }),
      node(3, "リンゴ", { parentId: 1, importance: "high" }),
      node(4, "りんごの子", { parentId: 2 }),
    ];

    expect(buildNodeMergePreview(nodes, okPlan(nodes, [2, 3], 3))).toEqual({
      survivorLabel: "リンゴ",
      label: "りんご リンゴ",
      importanceLabel: "高",
      illustrationText: "イラストなし",
      movedChildCount: 1,
      discardedIllustrationCount: 0,
      absorbedLabels: ["りんご"],
      hiddenAbsorbedCount: 0,
      noteText: null,
      linkText: null,
      tagText: null,
    });
  });

  it.each([
    ["low", "低"],
    ["medium", "中"],
    ["high", "高"],
  ] as const)("重要度 %s は「%s」と表示する", (importance, expected) => {
    const nodes = [node(1, "a", { importance }), node(2, "b", { importance })];

    expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.importanceLabel).toBe(expected);
  });

  describe("イラストの扱い", () => {
    const illustration = createJpegDataUrl(100, 100);

    it("主選択が持っていれば「主選択のイラストを残す」", () => {
      const nodes = [node(1, "a", { illustration }), node(2, "b")];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.illustrationText).toBe("主選択のイラストを残す");
    });

    it("吸収されるノードから引き継ぐときは、元のノードのラベルを『』で囲んで示す", () => {
      const nodes = [node(1, "a"), node(2, "引き継ぐ元", { illustration })];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.illustrationText).toBe("『引き継ぐ元』のイラストを引き継ぐ");
    });

    it("引き継ぐ元のラベルが空なら「（空）」、空白だけなら「（空白のみ）」と示す", () => {
      const empty = [node(1, "a"), node(2, "", { illustration })];
      const blank = [node(1, "a"), node(2, "  ", { illustration })];

      expect(buildNodeMergePreview(empty, okPlan(empty, [1, 2], 1))?.illustrationText).toBe("『（空）』のイラストを引き継ぐ");
      expect(buildNodeMergePreview(blank, okPlan(blank, [1, 2], 1))?.illustrationText).toBe("『（空白のみ）』のイラストを引き継ぐ");
    });

    it("失われるイラストの件数を持つ", () => {
      const nodes = [node(1, "a", { illustration }), node(2, "b", { illustration }), node(3, "c", { illustration })];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2, 3], 1))?.discardedIllustrationCount).toBe(2);
    });
  });

  it("消えるノードのラベルは先頭の 200 件までで、超えた分は件数だけを持つ（確定の対象は計画が全件持つ）", () => {
    const nodes = Array.from({ length: NODE_MERGE_PREVIEW_LIMIT + 51 }, (_, index) => node(index + 1, `項目${index + 1}`));
    const plan = okPlan(nodes, nodes.map((item) => item.id), 1);

    const preview = buildNodeMergePreview(nodes, plan);

    expect(NODE_MERGE_PREVIEW_LIMIT).toBe(200);
    expect(plan.ok && plan.absorbedIds).toHaveLength(NODE_MERGE_PREVIEW_LIMIT + 50);
    expect(preview?.absorbedLabels).toHaveLength(NODE_MERGE_PREVIEW_LIMIT);
    expect(preview?.absorbedLabels[0]).toBe("項目2");
    expect(preview?.hiddenAbsorbedCount).toBe(50);
  });

  it("ちょうど 200 件なら超過は 0", () => {
    const nodes = Array.from({ length: NODE_MERGE_PREVIEW_LIMIT + 1 }, (_, index) => node(index + 1, `項目${index + 1}`));

    const preview = buildNodeMergePreview(nodes, okPlan(nodes, nodes.map((item) => item.id), 1));

    expect(preview?.absorbedLabels).toHaveLength(NODE_MERGE_PREVIEW_LIMIT);
    expect(preview?.hiddenAbsorbedCount).toBe(0);
  });

  describe("メモの連結", () => {
    it("メモのあるノードが 1 つ以上あれば、件数と連結後の文字数を示す（本文は出さない）", () => {
      const nodes = [node(1, "a", { note: "メモ1" }), node(2, "b"), node(3, "c", { note: "メモ3" })];

      // "メモ1" + "\n\n" + "メモ3" = 3 + 2 + 3 = 8
      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2, 3], 1))?.noteText).toBe("2 件のメモを連結（8 文字）");
    });

    it("文字数は 3 桁区切りで示す", () => {
      const nodes = [node(1, "a", { note: "a".repeat(10000) }), node(2, "b")];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.noteText).toBe("1 件のメモを連結（10,000 文字）");
    });

    it("メモが 1 つも無ければ null（行を出さない）", () => {
      const nodes = [node(1, "a"), node(2, "b")];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.noteText).toBeNull();
    });
  });

  it("note-too-long の計画はプレビューを作らず、状態文言は失敗の文言", () => {
    const plan: NodeMergePlan = { ok: false, reason: "note-too-long" };

    expect(buildNodeMergePreview([], plan)).toBeNull();
    expect(describeNodeMergeStatus(false, plan)).toBe("メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。");
  });

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

  describe("タグの連結", () => {
    it("タグを持つノードが 1 つ以上あれば、同じタグとみなすものを除いた件数と除いた件数を示す（タグ名は出さない）", () => {
      const nodes = [node(1, "a", { tags: ["Python", "資料"] }), node(2, "b"), node(3, "c", { tags: ["python", "重要"] })];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2, 3], 1))?.tagText).toBe("3 件（重複 1 件を除く）");
    });

    it("重複が無ければ括弧を出さない", () => {
      const nodes = [node(1, "a", { tags: ["Python"] }), node(2, "b", { tags: ["重要"] })];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.tagText).toBe("2 件");
    });

    it("タグが 1 つも無ければ null（行を出さない）", () => {
      const nodes = [node(1, "a"), node(2, "b")];

      expect(buildNodeMergePreview(nodes, okPlan(nodes, [1, 2], 1))?.tagText).toBeNull();
    });
  });

  it("tags-too-many の計画はプレビューを作らず、状態文言は失敗の文言", () => {
    const plan: NodeMergePlan = { ok: false, reason: "tags-too-many" };

    expect(buildNodeMergePreview([], plan)).toBeNull();
    expect(describeNodeMergeStatus(false, plan)).toBe("タグをまとめると件数の上限（10 件）を超えるため、統合できません。");
  });
});
