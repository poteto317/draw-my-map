import { resolveLayoutMetrics } from "@/domain/nodes/resolveLayoutMetrics";

describe("resolveLayoutMetrics", () => {
  it("LayoutSpacing を gap メトリクスへ写す", () => {
    expect(resolveLayoutMetrics({ childGap: 80, siblingGap: 16 })).toEqual({
      childGap: 80,
      siblingGap: 16,
    });
  });
});