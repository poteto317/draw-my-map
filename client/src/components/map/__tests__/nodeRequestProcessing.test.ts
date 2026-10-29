import { classifyNodeRequest } from "@/components/map/nodeRequestProcessing";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [createTestNode({ id: 1, parentId: null }), createTestNode({ id: 2, parentId: 1 })];

describe("classifyNodeRequest", () => {
  it("要求が無ければ skip", () => {
    expect(classifyNodeRequest(null, null, 0, nodes)).toEqual({ kind: "skip" });
  });

  it("処理済みの sequence なら skip", () => {
    const request = { nodeId: 2, sequence: 3, documentRevision: 0 };

    expect(classifyNodeRequest(request, 3, 0, nodes)).toEqual({ kind: "skip" });
  });

  it("処理済みの sequence なら、documentRevision が違っても skip", () => {
    const request = { nodeId: 2, sequence: 3, documentRevision: 0 };

    expect(classifyNodeRequest(request, 3, 1, nodes)).toEqual({ kind: "skip" });
  });

  it("documentRevision が違う要求は discard", () => {
    const request = { nodeId: 2, sequence: 3, documentRevision: 0 };

    expect(classifyNodeRequest(request, null, 1, nodes)).toEqual({ kind: "discard", sequence: 3 });
  });

  it("対象のノードが配列に無ければ discard", () => {
    const request = { nodeId: 99, sequence: 4, documentRevision: 0 };

    expect(classifyNodeRequest(request, 3, 0, nodes)).toEqual({ kind: "discard", sequence: 4 });
  });

  it("未処理で、documentRevision が同じで、ノードがあれば ready と対象のノードを返す", () => {
    const request = { nodeId: 2, sequence: 4, documentRevision: 0 };

    expect(classifyNodeRequest(request, 3, 0, nodes)).toEqual({
      kind: "ready",
      sequence: 4,
      node: nodes[1],
    });
  });

  it("同じ ID のノードが重なっていれば、配列で最初のノードを返す", () => {
    const first = createTestNode({ id: 5, parentId: null, x: 0 });
    const second = createTestNode({ id: 5, parentId: null, x: 50 });
    const request = { nodeId: 5, sequence: 1, documentRevision: 0 };

    const processing = classifyNodeRequest(request, null, 0, [first, second]);

    expect(processing.kind === "ready" && processing.node).toBe(first);
  });

  it("処理済みの sequence なら、対象のノードが無くても skip（discard より先に判定する）", () => {
    const request = { nodeId: 99, sequence: 3, documentRevision: 0 };

    expect(classifyNodeRequest(request, 3, 0, nodes)).toEqual({ kind: "skip" });
  });

  it("documentRevision が違い、対象のノードも無ければ discard", () => {
    const request = { nodeId: 99, sequence: 5, documentRevision: 0 };

    expect(classifyNodeRequest(request, null, 1, nodes)).toEqual({ kind: "discard", sequence: 5 });
  });

  it("処理済みの sequence と違えば、小さい sequence の要求も未処理として扱う", () => {
    const request = { nodeId: 2, sequence: 2, documentRevision: 0 };

    expect(classifyNodeRequest(request, 3, 0, nodes)).toEqual({
      kind: "ready",
      sequence: 2,
      node: nodes[1],
    });
  });
});
