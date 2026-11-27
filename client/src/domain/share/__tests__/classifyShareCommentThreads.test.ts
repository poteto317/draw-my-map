import {
  classifyShareCommentThreads,
  countOpenThreadsByNode,
} from "@/domain/share/classifyShareCommentThreads";
import type { ShareCommentThreadView } from "@/domain/share/shareComment";

function thread(
  id: string,
  nodeId: number,
  status: ShareCommentThreadView["status"] = "open",
): ShareCommentThreadView {
  return {
    id,
    nodeId,
    nodeLabelSnapshot: `label-${nodeId}`,
    status,
    resolvedByName: status === "resolved" ? "解決者" : null,
    resolvedAt: status === "resolved" ? "2026-11-27T01:00:00.000Z" : null,
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
    canResolve: false,
    comments: [
      { id: `${id}-c1`, authorName: "A", body: "本文", createdAt: "2026-11-27T00:00:00.000Z", canDelete: false },
    ],
  };
}

describe("classifyShareCommentThreads", () => {
  it("文書にあるノードは attached、無いノードは orphaned に分け、入力の順序を保つ", () => {
    const threads = [
      thread("t1", 1),
      thread("t2", 9),
      thread("t3", 1, "resolved"),
      thread("t4", 2),
      thread("t5", 8),
      thread("t6", 1),
    ];
    const result = classifyShareCommentThreads(threads, new Set([1, 2]));
    expect([...result.attached.keys()]).toEqual([1, 2]);
    expect(result.attached.get(1)?.map((t) => t.id)).toEqual(["t1", "t3", "t6"]);
    expect(result.attached.get(2)?.map((t) => t.id)).toEqual(["t4"]);
    expect(result.orphaned.map((t) => t.id)).toEqual(["t2", "t5"]);
  });

  it("空の入力は空の結果", () => {
    const result = classifyShareCommentThreads([], new Set([1]));
    expect(result.attached.size).toBe(0);
    expect(result.orphaned).toEqual([]);
  });

  it("スレッドのないノードはキーを持たない", () => {
    const result = classifyShareCommentThreads([thread("t1", 1)], new Set([1, 2, 3]));
    expect(result.attached.has(2)).toBe(false);
    expect(result.attached.has(3)).toBe(false);
  });
});

describe("countOpenThreadsByNode", () => {
  it("open だけ数え、0 件のノードはキーを持たない", () => {
    const { attached } = classifyShareCommentThreads(
      [
        thread("t1", 1),
        thread("t2", 1),
        thread("t3", 1, "resolved"),
        thread("t4", 2, "resolved"),
        thread("t5", 3),
      ],
      new Set([1, 2, 3]),
    );
    const counts = countOpenThreadsByNode(attached);
    expect([...counts.entries()]).toEqual([
      [1, 2],
      [3, 1],
    ]);
    expect(counts.has(2)).toBe(false);
  });
});
