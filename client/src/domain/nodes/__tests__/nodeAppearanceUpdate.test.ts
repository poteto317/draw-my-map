import { updateNodeIcon, updateNodeKind } from "@/domain/nodes/nodeAppearanceUpdate";
import { createTestNode } from "@/testing/createTestNode";

describe("updateNodeIcon", () => {
  it("対象の icon を変え、ほかは参照を保つ", () => {
    const target = createTestNode({ id: 1 });
    const other = createTestNode({ id: 2, icon: "🎯" });

    const result = updateNodeIcon([target, other], 1, "😀");

    expect(result).toEqual([{ ...target, icon: "😀" }, other]);
    expect(result?.[1]).toBe(other);
  });

  it("undefined でクリアしキーを削除する", () => {
    const target = createTestNode({ id: 1, icon: "😀", kind: "idea" });

    const result = updateNodeIcon([target], 1, undefined);

    expect(result?.[0]).toEqual(createTestNode({ id: 1, kind: "idea" }));
    expect("icon" in (result?.[0] ?? {})).toBe(false);
  });

  it("同じ実効値・不正入力・対象不在・locked は null", () => {
    const plain = createTestNode({ id: 1 });
    const withIcon = createTestNode({ id: 2, icon: "😀" });
    const locked = createTestNode({ id: 3, locked: true });

    expect(updateNodeIcon([plain], 1, undefined)).toBeNull();
    expect(updateNodeIcon([withIcon], 2, "😀")).toBeNull();
    expect(updateNodeIcon([plain], 1, "A")).toBeNull();
    expect(updateNodeIcon([plain], 999, "😀")).toBeNull();
    expect(updateNodeIcon([locked], 3, "😀")).toBeNull();
  });
});

describe("updateNodeKind", () => {
  it("対象の kind を変え、ほかは参照を保つ", () => {
    const target = createTestNode({ id: 1 });
    const other = createTestNode({ id: 2, kind: "evidence" });

    const result = updateNodeKind([target, other], 1, "question");

    expect(result).toEqual([{ ...target, kind: "question" }, other]);
    expect(result?.[1]).toBe(other);
  });

  it("undefined でクリアしキーを削除する", () => {
    const target = createTestNode({ id: 1, kind: "conclusion", icon: "🎯" });

    const result = updateNodeKind([target], 1, undefined);

    expect(result?.[0]).toEqual(createTestNode({ id: 1, icon: "🎯" }));
    expect("kind" in (result?.[0] ?? {})).toBe(false);
  });

  it("同じ実効値・対象不在・locked は null", () => {
    const plain = createTestNode({ id: 1 });
    const withKind = createTestNode({ id: 2, kind: "idea" });
    const locked = createTestNode({ id: 3, locked: true, kind: "idea" });

    expect(updateNodeKind([plain], 1, undefined)).toBeNull();
    expect(updateNodeKind([withKind], 2, "idea")).toBeNull();
    expect(updateNodeKind([plain], 999, "idea")).toBeNull();
    expect(updateNodeKind([locked], 3, "question")).toBeNull();
  });
});
