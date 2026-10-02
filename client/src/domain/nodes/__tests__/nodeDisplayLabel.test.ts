import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";

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
