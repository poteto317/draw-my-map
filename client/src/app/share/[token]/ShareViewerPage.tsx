"use client";

import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { useShareViewerComments } from "@/app/share/[token]/useShareViewerComments";
import { ShareCommentsPanel } from "@/components/share/ShareCommentsPanel";
import { ShareViewer } from "@/components/share/ShareViewer";
import type { ShareCommentTarget } from "@/components/share/shareCommentTarget";
import {
  classifyShareCommentThreads,
  countOpenThreadsByNode,
} from "@/domain/share/classifyShareCommentThreads";
import type { ShareCommentThreadView } from "@/domain/share/shareComment";
import {
  planShareViewLoad,
  planShareViewLoadCaughtError,
  type ShareViewLoadPlan,
} from "@/domain/share/planShareViewLoad";
import { useShareCommenterSession } from "@/hooks/useShareCommenterSession";
import { createShareApiClient } from "@/services/share/shareApiClient";
import type { Node } from "@/types/node";

type ShareViewerPageProps = {
  token: string;
};

type LoadState =
  | { status: "loading"; document: null; loadError: null }
  | ShareViewLoadPlan;

const EMPTY_NODES: readonly Node[] = [];
const EMPTY_THREADS: readonly ShareCommentThreadView[] = [];

/**
 * `/share/[token]` の組み立て役。GET /api/share/view/[token] と、comment リンクのときだけコメント API。
 * 編集・共有 UI は載せない。token 変更は key で再マウントする。
 * 成功／失敗の解釈は planShareViewLoad（純関数）に委譲する。
 */
export function ShareViewerPage({ token }: ShareViewerPageProps) {
  return <ShareViewerPageInner key={token} token={token} />;
}

function ShareViewerPageInner({ token }: ShareViewerPageProps) {
  const [viewMode, setViewMode] = useState<"map" | "outline">("map");
  const [state, setState] = useState<LoadState>({
    status: "loading",
    document: null,
    loadError: null,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const client = createShareApiClient();
        const result = await client.viewByToken(token);
        if (cancelled) return;
        setState(planShareViewLoad(result));
      } catch {
        if (cancelled) return;
        setState(planShareViewLoadCaughtError());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // view リンクではコメント API を一切呼ばず、パネル・件数・選択を null にする（V-C-UM1）
  const commentsEnabled = state.status === "ready" && state.permission === "comment";
  const session = useShareCommenterSession();
  const comments = useShareViewerComments({
    token,
    enabled: commentsEnabled,
    commenterUserId: session.commenter?.userId ?? null,
    sessionStatus: session.status,
  });
  const [selectedCommentNodeId, setSelectedCommentNodeId] = useState<number | null>(null);

  const nodes = state.status === "ready" ? state.document.nodes : EMPTY_NODES;
  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const nodeLabelById = useMemo(() => new Map(nodes.map((node) => [node.id, node.label])), [nodes]);
  const threads = comments.value?.threads ?? EMPTY_THREADS;
  // 判定の文書は公開スナップショット（ローカルの文書は持たない）
  const classified = useMemo(() => classifyShareCommentThreads(threads, nodeIds), [threads, nodeIds]);
  const counts = useMemo(() => countOpenThreadsByNode(classified.attached), [classified]);

  const commentTarget = useMemo(
    (): ShareCommentTarget | null => (commentsEnabled
      ? { counts, selectedNodeId: selectedCommentNodeId, onSelectNode: setSelectedCommentNodeId }
      : null),
    [commentsEnabled, counts, selectedCommentNodeId],
  );
  const commentsPanel = commentsEnabled ? (
    <ShareCommentsPanel
      comments={comments}
      sessionStatus={session.status}
      signedIn={session.commenter !== null}
      classified={classified}
      nodeLabelById={nodeLabelById}
      selectedNodeId={selectedCommentNodeId}
      onSelectNode={setSelectedCommentNodeId}
      onLogin={() => void signIn("google", { redirectTo: window.location.pathname })}
    />
  ) : null;

  return (
    <ShareViewer
      document={state.document}
      loadError={state.loadError}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      commentsPanel={commentsPanel}
      commentTarget={commentTarget}
    />
  );
}
