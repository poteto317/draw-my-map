import {
  toShareCommentThreadSections,
  toShareCommentThreadSectionsForNode,
} from "@/components/share/shareCommentThreadSections";
import { classifyShareCommentThreads } from "@/domain/share/classifyShareCommentThreads";
import type { ShareCommentThreadView } from "@/domain/share/shareComment";

function thread(overrides: Partial<ShareCommentThreadView> = {}): ShareCommentThreadView {
  return {
    id: "t1",
    nodeId: 1,
    nodeLabelSnapshot: "根ノード",
    status: "open",
    resolvedByName: null,
    resolvedAt: null,
    createdAt: "2026-11-27T01:00:00.000Z",
    updatedAt: "2026-11-27T01:00:00.000Z",
    canResolve: true,
    comments: [],
    ...overrides,
  };
}

const THREADS = [
  thread({ id: "a-open", nodeId: 1 }),
  thread({ id: "b-resolved", nodeId: 2, status: "resolved" }),
  thread({ id: "c-open", nodeId: 2 }),
  thread({ id: "d-gone", nodeId: 99 }),
  thread({ id: "e-resolved", nodeId: 1, status: "resolved" }),
];
const CLASSIFIED = classifyShareCommentThreads(THREADS, new Set([1, 2]));

describe("toShareCommentThreadSections", () => {
  it("attached を未解決と解決済みに分け、orphaned はそのまま削除されたノード節にする", () => {
    const sections = toShareCommentThreadSections(CLASSIFIED);
    expect(sections.open.map((item) => item.id)).toEqual(["a-open", "c-open"]);
    expect(sections.resolved.map((item) => item.id)).toEqual(["e-resolved", "b-resolved"]);
    expect(sections.orphaned.map((item) => item.id)).toEqual(["d-gone"]);
  });

  it("0 件なら 3 節とも空", () => {
    const sections = toShareCommentThreadSections(classifyShareCommentThreads([], new Set([1])));
    expect(sections).toEqual({ open: [], resolved: [], orphaned: [] });
  });
});

describe("toShareCommentThreadSectionsForNode", () => {
  it("そのノードのスレッドだけを未解決と解決済みに分け、削除されたノード節は空", () => {
    const sections = toShareCommentThreadSectionsForNode(CLASSIFIED, 1);
    expect(sections.open.map((item) => item.id)).toEqual(["a-open"]);
    expect(sections.resolved.map((item) => item.id)).toEqual(["e-resolved"]);
    expect(sections.orphaned).toEqual([]);
  });

  it("スレッドの無いノード・未選択（null）は 3 節とも空", () => {
    expect(toShareCommentThreadSectionsForNode(CLASSIFIED, 3)).toEqual({ open: [], resolved: [], orphaned: [] });
    expect(toShareCommentThreadSectionsForNode(CLASSIFIED, null)).toEqual({ open: [], resolved: [], orphaned: [] });
  });
});
