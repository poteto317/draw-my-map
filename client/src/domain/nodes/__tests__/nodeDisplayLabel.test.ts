import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import { getNodeDisplayLabel, truncateLabelByCodePoints } from "@/domain/nodes/nodeDisplayLabel";

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

describe("truncateLabelByCodePoints", () => {
  it.each([
    ["上限ちょうどはそのまま", "あいう", 3, "あいう"],
    ["上限を1つ超えると先頭の上限分に…", "あいうえ", 3, "あいう…"],
    ["空文字はそのまま", "", 3, ""],
    ["サロゲートペアは1文字として数える（上限ちょうど）", "😀😀😀", 3, "😀😀😀"],
    ["サロゲートペアを途中で切らない", "😀😀😀😀", 3, "😀😀😀…"],
  ])("%s", (_name, label, maxCodePoints, expected) => {
    expect(truncateLabelByCodePoints(label, maxCodePoints)).toBe(expected);
  });

  it("UTF-16 の長さが上限を超えても、コードポイント数が上限以下ならそのまま", () => {
    expect(truncateLabelByCodePoints("😀😀", 3)).toBe("😀😀");
  });
});
