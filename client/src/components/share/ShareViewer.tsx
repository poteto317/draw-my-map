"use client";

import { useMemo } from "react";
import { EditorViewModeControl } from "@/components/layout/EditorViewModeControl";
import { ShareMapView } from "@/components/share/ShareMapView";
import { ShareOutlineView } from "@/components/share/ShareOutlineView";
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
    <div data-testid="share-viewer" className="flex min-h-screen flex-col bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <h1 className="text-base font-semibold text-zinc-900">{SHARE_MESSAGES.viewTitle}</h1>
        <EditorViewModeControl mode={viewMode} onChange={onViewModeChange} />
      </header>
      <main className="min-h-0 flex-1">
        {viewMode === "map" ? (
          <ShareMapView
            key={nodes.map((n) => n.id).join(",") || "empty"}
            nodes={nodes}
            relations={mapDocument.relations}
            groups={mapDocument.groups}
          />
        ) : (
          <ShareOutlineView nodes={nodes} />
        )}
      </main>
    </div>
  );
}
