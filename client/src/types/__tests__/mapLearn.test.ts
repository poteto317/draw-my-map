import {
  areMapLearnsEqual,
  normalizeLearn,
  projectLearn,
} from "@/types/mapLearn";

const validCard = {
  id: "card-1",
  prompt: "問題",
  answer: "答え",
  sourceNodeIds: [2, 1],
};

const validLearn = {
  version: 1 as const,
  revealedNodeIds: [2, 1],
  cards: [validCard],
};

describe("projectLearn", () => {
  it("cards 無しかつ revealed が空なら learn キーを出さない", () => {
    expect(projectLearn({ version: 1, revealedNodeIds: [] })).toEqual({});
    expect(projectLearn(undefined)).toEqual({});
  });

  it("revealed のみ／cards のみ／両方を載せる", () => {
    expect(projectLearn({ version: 1, revealedNodeIds: [1] })).toEqual({
      learn: { version: 1, revealedNodeIds: [1] },
    });
    expect(projectLearn({ version: 1, revealedNodeIds: [], cards: [validCard] })).toEqual({
      learn: { version: 1, revealedNodeIds: [], cards: [validCard] },
    });
    expect(projectLearn(validLearn)).toEqual({ learn: validLearn });
  });
});

describe("normalizeLearn", () => {
  it("往復できる learn を正規化する", () => {
    expect(normalizeLearn(validLearn)).toEqual(validLearn);
  });

  it("null 欠落は同等で learn 全体を落とす", () => {
    expect(normalizeLearn(null)).toBeUndefined();
    expect(normalizeLearn(undefined)).toBeUndefined();
    expect(normalizeLearn({ version: 1, revealedNodeIds: [], cards: [] })).toBeUndefined();
  });

  it("version 不正なら learn 全体を落とす", () => {
    expect(normalizeLearn({ version: 2, revealedNodeIds: [1] })).toBeUndefined();
    expect(normalizeLearn("nope")).toBeUndefined();
  });

  it("revealed の不正 ID を除外し重複を落とす", () => {
    expect(
      normalizeLearn({
        version: 1,
        revealedNodeIds: [1, 1, -1, 1.5, "x", 2, null],
      }),
    ).toEqual({ version: 1, revealedNodeIds: [1, 2] });
  });

  it("revealed 欠落は空配列と同等", () => {
    expect(
      normalizeLearn({
        version: 1,
        cards: [validCard],
      }),
    ).toEqual({ version: 1, revealedNodeIds: [], cards: [validCard] });
  });

  it("不正カードを除外し、残 0 なら cards キー無し", () => {
    expect(
      normalizeLearn({
        version: 1,
        revealedNodeIds: [1],
        cards: [
          validCard,
          { id: "", prompt: "p", answer: "a", sourceNodeIds: [1] },
          { id: "x", prompt: "", answer: "a", sourceNodeIds: [1] },
          null,
        ],
      }),
    ).toEqual({
      version: 1,
      revealedNodeIds: [1],
      cards: [validCard],
    });
    expect(
      normalizeLearn({
        version: 1,
        revealedNodeIds: [1],
        cards: [{ id: "", prompt: "p", answer: "a", sourceNodeIds: [1] }],
      }),
    ).toEqual({ version: 1, revealedNodeIds: [1] });
  });

  it("101 件超は先頭 100 件に切り詰め、0 件なら learn を落とす", () => {
    const cards = Array.from({ length: 101 }, (_, index) => ({
      id: `c${index}`,
      prompt: `p${index}`,
      answer: `a${index}`,
      sourceNodeIds: [1],
    }));
    const normalized = normalizeLearn({ version: 1, revealedNodeIds: [], cards });
    expect(normalized?.cards?.length).toBe(100);
    expect(normalized?.cards?.[0]?.id).toBe("c0");
    expect(normalized?.cards?.[99]?.id).toBe("c99");
    expect(
      normalizeLearn({
        version: 1,
        revealedNodeIds: [],
        cards: [{ id: "", prompt: "p", answer: "a", sourceNodeIds: [1] }],
      }),
    ).toBeUndefined();
  });

  it("sourceNodeIds は 1〜3 件・重複除去", () => {
    expect(
      normalizeLearn({
        version: 1,
        revealedNodeIds: [1],
        cards: [{
          id: "c",
          prompt: "p",
          answer: "a",
          sourceNodeIds: [3, 1, 1, 2, 4],
        }],
      }),
    ).toEqual({
      version: 1,
      revealedNodeIds: [1],
      cards: [{
        id: "c",
        prompt: "p",
        answer: "a",
        sourceNodeIds: [3, 1, 2],
      }],
    });
  });
});

describe("areMapLearnsEqual", () => {
  it("未定義同士は等価", () => {
    expect(areMapLearnsEqual(undefined, undefined)).toBe(true);
  });

  it("revealed は昇順ソート後の集合比較", () => {
    expect(
      areMapLearnsEqual(
        { version: 1, revealedNodeIds: [2, 1] },
        { version: 1, revealedNodeIds: [1, 2] },
      ),
    ).toBe(true);
  });

  it("cards は保存順で比較し sourceNodeIds は昇順比較", () => {
    expect(
      areMapLearnsEqual(
        { version: 1, revealedNodeIds: [], cards: [{ ...validCard, sourceNodeIds: [2, 1] }] },
        { version: 1, revealedNodeIds: [], cards: [{ ...validCard, sourceNodeIds: [1, 2] }] },
      ),
    ).toBe(true);
    expect(
      areMapLearnsEqual(
        { version: 1, revealedNodeIds: [], cards: [validCard] },
        { version: 1, revealedNodeIds: [], cards: [{ ...validCard, id: "other" }] },
      ),
    ).toBe(false);
    expect(
      areMapLearnsEqual(
        { version: 1, revealedNodeIds: [], cards: [validCard, { ...validCard, id: "c2" }] },
        { version: 1, revealedNodeIds: [], cards: [{ ...validCard, id: "c2" }, validCard] },
      ),
    ).toBe(false);
  });

  it("内容差分を検出する", () => {
    expect(areMapLearnsEqual(undefined, validLearn)).toBe(false);
    expect(
      areMapLearnsEqual(validLearn, { ...validLearn, revealedNodeIds: [99] }),
    ).toBe(false);
  });
});