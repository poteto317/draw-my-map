import {
  applyProjectedNodeKind,
  isNodeKind,
  normalizeNodeKind,
  projectNodeKind,
} from "@/domain/nodes/nodeKindUpdate";
import { createTestNode } from "@/testing/createTestNode";
import {
  NODE_KIND_BAR_CSS_VARS,
  NODE_KIND_BAR_FALLBACK_COLORS,
  NODE_KIND_BAR_WIDTH_PX,
  type NodeKind,
} from "@/types/nodeKind";

describe("NodeKind / NODE_KIND_BAR_CSS_VARS", () => {
  it("許可種別と色トークン（CSS 変数名）を持つ", () => {
    const kinds: NodeKind[] = ["question", "conclusion", "evidence", "idea"];
    expect(kinds.map((k) => NODE_KIND_BAR_CSS_VARS[k])).toEqual([
      "--node-kind-question",
      "--node-kind-conclusion",
      "--node-kind-evidence",
      "--node-kind-idea",
    ]);
    expect(NODE_KIND_BAR_WIDTH_PX).toBe(4);
    expect(kinds.map((k) => NODE_KIND_BAR_FALLBACK_COLORS[k])).toEqual([
      "#3b82f6",
      "#22c55e",
      "#f97316",
      "#a855f7",
    ]);
  });
});

describe("isNodeKind / normalizeNodeKind", () => {
  it.each(["question", "conclusion", "evidence", "idea"] as const)(
    "許可値 %s を保持する",
    (kind) => {
      expect(isNodeKind(kind)).toBe(true);
      expect(normalizeNodeKind(kind)).toBe(kind);
    },
  );

  it.each(["other", "", 1, null, true, {}, [], undefined, "Question"])(
    "許可外 %p は削除（undefined）",
    (raw) => {
      expect(isNodeKind(raw)).toBe(false);
      expect(normalizeNodeKind(raw)).toBeUndefined();
    },
  );
});

describe("projectNodeKind", () => {
  it("許可 kind だけを書き出し、欠落・不正はキー省略する", () => {
    expect(projectNodeKind({ kind: "idea" })).toEqual({ kind: "idea" });
    expect(projectNodeKind({})).toEqual({});
    expect(projectNodeKind({ kind: undefined })).toEqual({});
    expect(projectNodeKind({ kind: "other" as NodeKind })).toEqual({});
  });
});

describe("applyProjectedNodeKind", () => {
  it("クリアでキーを外し、他属性は保つ", () => {
    const node = createTestNode({
      id: 1,
      icon: "😀",
      kind: "question",
      labelBold: true,
    });

    expect(applyProjectedNodeKind(node, undefined)).toEqual({
      ...createTestNode({ id: 1, icon: "😀", labelBold: true }),
    });
    expect("kind" in applyProjectedNodeKind(node, undefined)).toBe(false);
  });
});
