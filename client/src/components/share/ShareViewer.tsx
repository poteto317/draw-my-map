"use client";

import { useMemo, type ReactNode } from "react";
import { EditorViewModeControl } from "@/components/layout/EditorViewModeControl";
import { ShareMapView } from "@/components/share/ShareMapView";
import { ShareOutlineView } from "@/components/share/ShareOutlineView";
import type { ShareCommentTarget } from "@/components/share/shareCommentTarget";
import { asShareViewDocument } from "@/domain/share/parseShareViewDocument";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import type { MapDocument } from "@/types/mapDocument";

export type ShareViewerProps = {
  /** 成功時の MapDocument。空と欠落を混同しない */
  document: unknown | null;
  /** 取得失敗・404 */
  loadError: string | null;
  viewMode: "map" | "outline";
  onViewModeChange: (mode: "map" | "outline") => void;
  /** comment リンクのコメントパネル。view リンクでは null を明示する（L-060・L-061） */
  commentsPanel: ReactNode | null;
  commentTarget: ShareCommentTarget | null;
};

type ResolvedView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; document: MapDocument };

/**
 * 閲覧専用シェル（L-060）。編集・書き出し・共有 UI は import しない（S5/S6・L-061）。
 */
export function ShareViewer({
  document,
  loadError,
  viewMode,
  onViewModeChange,
  commentsPanel,
  commentTarget,
}: ShareViewerProps) {
  const resolved = useMemo((): ResolvedView => {
    if (loadError) return { kind: "error", message: loadError };
    if (document === null) return { kind: "loading" };
    const parsed = asShareViewDocument(document);
    if (!parsed.ok) return { kind: "error", message: parsed.error };
    return { kind: "ready", document: parsed.document };
  }, [document, loadError]);

  if (resolved.kind === "error") {
    return (
      <div data-testid="share-viewer" className="flex min-h-screen flex-col items-center justify-center gap-2 p-6">
        <h1 className="text-lg font-semibold text-zinc-900">{SHARE_MESSAGES.viewTitle}</h1>
        <p role="alert" className="text-sm text-zinc-700">
          {resolved.message}
        </p>
      </div>
    );
  }

  if (resolved.kind === "loading") {
    return (
      <div data-testid="share-viewer" className="flex min-h-screen flex-col items-center justify-center p-6">
        <p role="status" aria-live="polite" className="text-sm text-zinc-600">
          {SHARE_MESSAGES.viewLoading}
        </p>
      </div>
    );
  }

  const { document: mapDocument } = resolved;
  const nodes = mapDocument.nodes;

  return (
    <div data-testid="share-viewer" className="flex min-h-screen flex-col bg-white md:h-dvh md:min-h-0">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <h1 className="text-base font-semibold text-zinc-900">{SHARE_MESSAGES.viewTitle}</h1>
        <EditorViewModeControl mode={viewMode} onChange={onViewModeChange} />
      </header>
      {/* パネルは md 以上で右の 360px 列、狭い画面ではマップの下 */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="min-h-0 flex-1">
          {viewMode === "map" ? (
            <ShareMapView
              key={nodes.map((n) => n.id).join(",") || "empty"}
              nodes={nodes}
              relations={mapDocument.relations}
              groups={mapDocument.groups}
              commentTarget={commentTarget}
            />
          ) : (
            <ShareOutlineView nodes={nodes} commentTarget={commentTarget} />
          )}
        </main>
        {commentsPanel !== null && (
          <aside className="w-full border-t border-zinc-200 md:min-h-0 md:w-[360px] md:shrink-0 md:overflow-y-auto md:border-t-0 md:border-l">
            {commentsPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
