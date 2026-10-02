import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";

describe("FALLBACK_NODE_LABEL", () => {
  it("ユーザーに見える空ラベルの代替表示は「新しいノード」である", () => {
    expect(typeof FALLBACK_NODE_LABEL).toBe("string");
    expect(FALLBACK_NODE_LABEL).not.toBe("");
    expect(FALLBACK_NODE_LABEL).toBe("新しいノード");
  });
});
