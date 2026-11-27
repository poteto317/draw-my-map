import {
  removeCommentFromList,
  replaceThreadInList,
} from "@/domain/share/shareCommentListMutations";
import type { ShareCommentThreadView, ShareCommentView } from "@/domain/share/shareComment";

function comment(id: string): ShareCommentView {
  return { id, authorName: "A", body: id, createdAt: "2026-11-27T00:00:00.000Z", canDelete: true };
}

function thread(
  id: string,
  createdAt: string,
  comments: readonly ShareCommentView[] = [comment(`${id}-c1`)],
  overrides: Partial<ShareCommentThreadView> = {},
): ShareCommentThreadView {
  return {
    id,
    nodeId: 1,
    nodeLabelSnapshot: "ラベル",
    status: "open",
    resolvedByName: null,
    resolvedAt: null,
    createdAt,
    updatedAt: createdAt,
    canResolve: true,
    comments,
    ...overrides,
  };
}

const T1 = "2026-11-27T00:00:01.000Z";
const T2 = "2026-11-27T00:00:02.000Z";
const T3 = "2026-11-27T00:00:03.000Z";

describe("replaceThreadInList", () => {
  it("同じ id のスレッドを置き換え、位置を保つ", () => {
    const list = [thread("a", T1), thread("b", T2), thread("c", T3)];
    const updated = thread("b", T2, [comment("b-c1"), comment("b-c2")], { status: "resolved" });
    const result = replaceThreadInList(list, updated);
    expect(result.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(result[1]).toBe(updated);
  });

  it("無ければ createdAt 昇順の位置へ挿入する", () => {
    const list = [thread("a", T1), thread("c", T3)];
    expect(replaceThreadInList(list, thread("b", T2)).map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(replaceThreadInList(list, thread("z", "2026-11-26T00:00:00.000Z")).map((t) => t.id))
      .toEqual(["z", "a", "c"]);
    expect(replaceThreadInList(list, thread("d", "2026-11-28T00:00:00.000Z")).map((t) => t.id))
      .toEqual(["a", "c", "d"]);
  });

  it("createdAt が同じなら id 昇順の位置へ挿入する", () => {
    const list = [thread("a", T2), thread("c", T2)];
    expect(replaceThreadInList(list, thread("b", T2)).map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(replaceThreadInList(list, thread("d", T2)).map((t) => t.id)).toEqual(["a", "c", "d"]);
    expect(replaceThreadInList(list, thread("0", T2)).map((t) => t.id)).toEqual(["0", "a", "c"]);
  });

  it("空の一覧へ挿入できる", () => {
    expect(replaceThreadInList([], thread("a", T1)).map((t) => t.id)).toEqual(["a"]);
  });

  it("入力配列を破壊しない", () => {
    const list = Object.freeze([thread("a", T1), thread("c", T3)]);
    const snapshot = [...list];
    replaceThreadInList(list, thread("b", T2));
    replaceThreadInList(list, thread("a", T1, [comment("x")]));
    expect(list).toEqual(snapshot);
  });
});

describe("removeCommentFromList", () => {
  it("該当スレッドからコメントだけを除く", () => {
    const list = [thread("a", T1, [comment("a1"), comment("a2")]), thread("b", T2)];
    const result = removeCommentFromList(list, "a", "a1", false);
    expect(result.map((t) => t.id)).toEqual(["a", "b"]);
    expect(result[0].comments.map((c) => c.id)).toEqual(["a2"]);
    expect(result[1]).toBe(list[1]);
  });

  it("最後のコメントを消したらスレッドごと除く", () => {
    const list = [thread("a", T1, [comment("a1")]), thread("b", T2)];
    expect(removeCommentFromList(list, "a", "a1", false).map((t) => t.id)).toEqual(["b"]);
  });

  it("threadDeleted が true ならコメントが残っていてもスレッドごと除く", () => {
    const list = [thread("a", T1, [comment("a1"), comment("a2")]), thread("b", T2)];
    expect(removeCommentFromList(list, "a", "a1", true).map((t) => t.id)).toEqual(["b"]);
  });

  it("該当が無ければ内容を変えない", () => {
    const list = [thread("a", T1, [comment("a1")])];
    expect(removeCommentFromList(list, "a", "zz", false)).toEqual(list);
    expect(removeCommentFromList(list, "zz", "a1", false)).toEqual(list);
  });

  it("入力配列とスレッドを破壊しない", () => {
    const inner = Object.freeze([comment("a1"), comment("a2")]);
    const list = Object.freeze([thread("a", T1, inner)]);
    const snapshot = JSON.parse(JSON.stringify(list));
    removeCommentFromList(list, "a", "a1", false);
    removeCommentFromList(list, "a", "a1", true);
    expect(list).toEqual(snapshot);
  });
});
