import type { Node } from "@/types/node";

export function createTestNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 1,
    parentId: null,
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    label: "",
    importance: "medium",
    ...overrides,
  };
}
