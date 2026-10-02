import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";

describe("FALLBACK_NODE_LABEL", () => {
  it("ユーザーに見える空ラベルの代替表示は「新しいノード」である", () => {
    expect(FALLBACK_NODE_LABEL).toBe("新しいノード");
  });
});
