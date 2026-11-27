import type { ClassifiedShareCommentThreads } from "@/domain/share/classifyShareCommentThreads";
import type { ShareCommentThreadView } from "@/domain/share/shareComment";

/** スレッド一覧の 3 節（未解決 / 解決済み / 削除されたノード）。ShareCommentThreadList が描画する */
export type ShareCommentThreadSections = {
  readonly open: readonly ShareCommentThreadView[];
  readonly resolved: readonly ShareCommentThreadView[];
  readonly orphaned: readonly ShareCommentThreadView[];
};

function splitByStatus(
  threads: readonly ShareCommentThreadView[],
  orphaned: readonly ShareCommentThreadView[],
): ShareCommentThreadSections {
  return {
    open: threads.filter((item) => item.status === "open"),
    resolved: threads.filter((item) => item.status === "resolved"),
    orphaned,
  };
}

/** 振り分け済みの一覧を 3 節（未解決 / 解決済み / 削除されたノード）にする（閲覧パネル・所有者ダイアログ共用） */
export function toShareCommentThreadSections(
  classified: ClassifiedShareCommentThreads,
): ShareCommentThreadSections {
  return splitByStatus([...classified.attached.values()].flat(), classified.orphaned);
}

/** 1 ノードに絞った 3 節。削除されたノードはどのノードにも属さないので空。nodeId が null なら全節が空 */
export function toShareCommentThreadSectionsForNode(
  classified: ClassifiedShareCommentThreads,
  nodeId: number | null,
): ShareCommentThreadSections {
  const threads = nodeId === null ? [] : classified.attached.get(nodeId) ?? [];
  return splitByStatus(threads, []);
}
