"use client";

import { useCallback, useMemo, useState, type RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import { createCollabJoinStorageSession } from "@/app/collab/[token]/createCollabJoinStorageSession";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { ShareSession } from "@/domain/share/shareSession";

export type CollabJoinShellProps = {
  token: string;
  shareSession: NonNullable<ShareSession>;
  shareSessionStatus: "ready";
  dialogMouseClickedAtRef: RefObject<number | null>;
};

/**
 * edit リンク参加者シェル。
 * MapEditor を共同編集モード（collabJoinToken）でマウントする（L-060）。
 * /share には載せない（L-061）。
 */
export function CollabJoinShell({
  token,
  shareSession,
  dialogMouseClickedAtRef,
}: CollabJoinShellProps) {
  const storageSession = useMemo(() => createCollabJoinStorageSession(token), [token]);
  const exportButtonRef = useMemo(() => ({ current: null as HTMLButtonElement | null }), []);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const handleShareLogin = useCallback(() => {
    // 参加シェルでは既にログイン済み。no-op（必須 props）
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-900" data-testid="collab-join-shell">
      <MapEditor
        key={storageSession.mapId}
        mapId={storageSession.mapId}
        mapName="共同編集"
        storageSession={storageSession}
        storageMode="persistent"
        mapControls={null}
        exportButtonRef={exportButtonRef}
        mapMoveTargets={[]}
        libraryMeta={createEmptyMapLibraryMeta()}
        onMoveBranchToMap={() => ({
          ok: false,
          notice: { kind: "error", message: "共同編集中はマップ間移動できません。" },
        })}
        onExtractBranchToNewMap={() => ({
          ok: false,
          notice: { kind: "error", message: "共同編集中は切り出しできません。" },
        })}
        shortcutsEnabled
        dialogMouseClickedAtRef={dialogMouseClickedAtRef}
        pendingNavigation={null}
        onConsumePendingNavigation={() => {}}
        onSwitchToMapTarget={() => {}}
        brokenLinksDialogRequest={0}
        onBrokenLinksDialogClosed={() => {}}
        shareSession={shareSession}
        shareSessionStatus="ready"
        shareDialogOpen={shareDialogOpen}
        onShareDialogOpenChange={setShareDialogOpen}
        onShareRequest={() => {
          setShareDialogOpen(true);
        }}
        onShareLogin={handleShareLogin}
        collabJoinToken={token}
      />
    </div>
  );
}
