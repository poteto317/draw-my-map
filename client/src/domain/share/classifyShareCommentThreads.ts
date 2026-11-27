import type { ShareCommentThreadView } from "@/domain/share/shareComment";

export type ClassifiedShareCommentThreads = {
  /** 文書にあるノード */
  readonly attached: ReadonlyMap<number, readonly ShareCommentThreadView[]>;
  /** 削除されたノード */
  readonly orphaned: readonly ShareCommentThreadView[];
};

/** スレッドを文書のノード ID 集合で振り分ける（入力の順序を保つ） */
export function classifyShareCommentThreads(
  threads: readonly ShareCommentThreadView[],
  nodeIds: ReadonlySet<number>,
): ClassifiedShareCommentThreads {
  const attached = new Map<number, ShareCommentThreadView[]>();
  const orphaned: ShareCommentThreadView[] = [];
  for (const thread of threads) {
    if (!nodeIds.has(thread.nodeId)) {
      orphaned.push(thread);
      continue;
    }
    const list = attached.get(thread.nodeId);
    if (list) {
      list.push(thread);
    } else {
      attached.set(thread.nodeId, [thread]);
    }
  }
  return { attached, orphaned };
}

/** ノードごとの未解決スレッド数。0 のノードはキーを持たない */
export function countOpenThreadsByNode(
  attached: ClassifiedShareCommentThreads["attached"],
): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const [nodeId, threads] of attached) {
    const open = threads.filter((thread) => thread.status === "open").length;
    if (open > 0) counts.set(nodeId, open);
  }
  return counts;
}
