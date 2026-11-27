import type { ShareCommentThreadView } from "@/domain/share/shareComment";

/** 一覧の並び（createdAt 昇順、同値は id 昇順）で a が b より前か */
function comesBefore(a: ShareCommentThreadView, b: ShareCommentThreadView): boolean {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt;
  return a.id < b.id;
}

/** 書込み後のスレッドで一覧を差し替える。無ければ並び順の位置へ挿入する（入力は破壊しない） */
export function replaceThreadInList(
  threads: readonly ShareCommentThreadView[],
  thread: ShareCommentThreadView,
): ShareCommentThreadView[] {
  const index = threads.findIndex((item) => item.id === thread.id);
  if (index >= 0) {
    return threads.map((item, i) => (i === index ? thread : item));
  }
  const insertAt = threads.findIndex((item) => comesBefore(thread, item));
  const result = [...threads];
  result.splice(insertAt < 0 ? result.length : insertAt, 0, thread);
  return result;
}

/** コメント削除を一覧へ反映する。threadDeleted またはコメント 0 件ならスレッドごと除く */
export function removeCommentFromList(
  threads: readonly ShareCommentThreadView[],
  threadId: string,
  commentId: string,
  threadDeleted: boolean,
): ShareCommentThreadView[] {
  const result: ShareCommentThreadView[] = [];
  for (const thread of threads) {
    if (thread.id !== threadId) {
      result.push(thread);
      continue;
    }
    if (threadDeleted) continue;
    const comments = thread.comments.filter((comment) => comment.id !== commentId);
    if (comments.length === 0) continue;
    result.push(comments.length === thread.comments.length ? thread : { ...thread, comments });
  }
  return result;
}
