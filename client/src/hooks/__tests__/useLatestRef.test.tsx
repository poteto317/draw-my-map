import { renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";

describe("useLatestRef", () => {
  it("初回の描画の直後に渡した値が読める", () => {
    const { result } = renderHook(() => useLatestRef("初回"));

    expect(result.current.current).toBe("初回");
  });

  it("再描画の後は同じ ref オブジェクトで新しい値が読める", () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: "前" },
    });
    const firstRef = result.current;

    rerender({ value: "後" });

    expect(result.current).toBe(firstRef);
    expect(firstRef.current).toBe("後");
  });

  it("同じコンポーネントで後に宣言した useLayoutEffect から最新の値が読める", () => {
    const readValues: string[] = [];
    const { rerender } = renderHook(
      ({ value }) => {
        const latestRef = useLatestRef(value);
        useLayoutEffect(() => {
          readValues.push(latestRef.current);
        });
      },
      { initialProps: { value: "前" } },
    );

    rerender({ value: "後" });

    expect(readValues).toEqual(["前", "後"]);
  });
});
