import { generateReviewCards } from "@/domain/map/mapReviewCards";
import { createTestNode } from "@/testing/createTestNode";
import { MAP_REVIEW_CARD_TEXT_MAX_CODEPOINTS } from "@/types/mapLearn";

function node(
  id: number,
  parentId: number | null,
  label = "",
  note?: string,
) {
  return createTestNode({ id, parentId, label, ...(note !== undefined ? { note } : {}) });
}

describe("generateReviewCards", () => {
  it("深さ優先で親子→メモの2周目を挟み、同一 source は1枚", () => {
    const nodes = [
      node(1, null, "親"),
      node(2, 1, "子"),
      node(3, null, "別ルート", "メモ3"),
    ];
    const cards = generateReviewCards(nodes);
    expect(cards.map((c) => c.prompt)).toEqual([
      "「親」の下にある項目は？",
      "「別ルート」のメモの要点は？",
    ]);
    expect(cards[0]!.answer).toBe("子");
    expect(cards[0]!.sourceNodeIds).toEqual([1, 2]);
    expect(cards[1]!.answer).toBe("メモ3");
    expect(cards[1]!.sourceNodeIds).toEqual([3]);
  });

  it("親ラベルまたは子ラベルが空なら親子カードを作らない", () => {
    const nodes = [
      node(1, null, "親"),
      node(2, 1, "  "),
      node(3, 1, "  ", "子メモ"),
    ];
    const cards = generateReviewCards(nodes);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.prompt).toBe("このノードのメモの要点は？");
  });

  it("メモ空・ラベル空のメモ prompt は汎用文言", () => {
    const nodes = [node(1, null, "  ", "要点")];
    const cards = generateReviewCards(nodes);
    expect(cards).toEqual([
      expect.objectContaining({
        prompt: "このノードのメモの要点は？",
        answer: "要点",
        sourceNodeIds: [1],
      }),
    ]);
  });

  it("最大50枚で打ち切り", () => {
    const nodes = [node(1, null, "親")];
    for (let i = 2; i <= 60; i += 1) {
      nodes.push(node(i, 1, `子${i}`));
    }
    expect(generateReviewCards(nodes)).toHaveLength(50);
  });

  it("正規化後501文字以上の prompt または answer はスキップ", () => {
    const long = "あ".repeat(MAP_REVIEW_CARD_TEXT_MAX_CODEPOINTS + 1);
    const nodes = [
      node(1, null, long),
      node(2, 1, "子"),
      node(3, null, "短", long),
    ];
    expect(generateReviewCards(nodes)).toHaveLength(0);
  });

  it("同一ノード列で結果が決定的", () => {
    const nodes = [
      node(10, null, "A"),
      node(20, 10, "B", "nb"),
      node(30, 10, "C"),
    ];
    const first = generateReviewCards(nodes);
    const second = generateReviewCards(nodes);
    expect(second).toEqual(first);
  });

  it("不正な森なら0件", () => {
    expect(generateReviewCards([node(2, 99, "孤立")])).toEqual([]);
  });
});