"use client";

import { useEffect, useState } from "react";
import { ShareViewer } from "@/components/share/ShareViewer";
import {
  planShareViewLoad,
  planShareViewLoadCaughtError,
  type ShareViewLoadPlan,
} from "@/domain/share/planShareViewLoad";
import { createShareApiClient } from "@/services/share/shareApiClient";

type ShareViewerPageProps = {
  token: string;
};

type LoadState =
  | { status: "loading"; document: null; loadError: null }
  | ShareViewLoadPlan;

/**
 * `/share/[token]` の組み立て役。GET /api/share/view/[token] のみ。
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

  return (
    <ShareViewer
      document={state.document}
      loadError={state.loadError}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
    />
  );
}
