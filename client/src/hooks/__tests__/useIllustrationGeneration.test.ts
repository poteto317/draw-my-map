import { renderHook } from "@testing-library/react";
import { useIllustrationGeneration } from "@/hooks/useIllustrationGeneration";

describe("useIllustrationGeneration", () => {
  it("ノードIDを渡して呼んでも例外を投げない", () => {
    const { result } = renderHook(() => useIllustrationGeneration());

    expect(() => result.current.generateIllustration(1)).not.toThrow();
  });

  it("再レンダーしても同じ関数を返す", () => {
    const { result, rerender } = renderHook(() => useIllustrationGeneration());
    const first = result.current.generateIllustration;

    rerender();

    expect(result.current.generateIllustration).toBe(first);
  });
});
