"use client";

import { useCallback, useState } from "react";

export type NodeKeyedDrafts = {
  /** 下書きが無ければ空文字 */
  draftFor: (nodeId: number) => string;
  /** 空文字はそのノードの下書きを消す */
  setDraft: (nodeId: number, draft: string) => void;
};

/**
 * 新規スレッドの下書きをノード ID キーで持つ（閲覧パネル・所有者ダイアログ共用）。
 * ノードを切り替えても一覧を差し替えても消さない。送信成功時は呼び出し元が空文字を入れる（L-859 / L-775）
 */
export function useNodeKeyedDrafts(): NodeKeyedDrafts {
  const [drafts, setDrafts] = useState<ReadonlyMap<number, string>>(() => new Map());

  const draftFor = useCallback((nodeId: number) => drafts.get(nodeId) ?? "", [drafts]);

  const setDraft = useCallback((nodeId: number, draft: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      if (draft.length === 0) next.delete(nodeId);
      else next.set(nodeId, draft);
      return next;
    });
  }, []);

  return { draftFor, setDraft };
}
