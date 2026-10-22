"use client";

import { useLayoutEffect, useRef } from "react";
import { MapLibraryControls } from "@/components/layout/MapLibraryControls";
import { MapLibraryDialog } from "@/components/layout/MapLibraryDialog";
import { MapLibraryNoticeRegion } from "@/components/layout/MapLibraryNoticeRegion";
import { MapEditor } from "@/components/map/MapEditor";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { useMapLibrary, type MapLibraryDeps } from "@/hooks/useMapLibrary";
import { useMapLibraryDialogState } from "@/hooks/useMapLibraryDialogState";
import { generateMapId } from "@/services/persistence/mapIdGenerator";
import { getBrowserMapLibraryStorage } from "@/services/persistence/mapLibraryStorage";

// useMapLibrary は deps を layout effect で ref へ同期するので、描画ごとに作り直さない
const MAP_LIBRARY_DEPS: MapLibraryDeps = {
  getStorage: getBrowserMapLibraryStorage,
  now: () => new Date(),
  generateId: () => generateMapId(),
};

const NO_MAPS: readonly MapIndexEntry[] = [];

// シェル。マップの一覧の状態とダイアログを持ち、現在のマップの MapEditor を id で再マウントする
export default function Home() {
  const library = useMapLibrary(MAP_LIBRARY_DEPS);
  const { view } = library;
  // フックは条件付きで呼ばない。loading の間は一覧を空にし、起動の通知も出さない
  const dialog = useMapLibraryDialogState({
    library,
    maps: view.status === "ready" ? view.maps : NO_MAPS,
    startupNotice: view.status === "ready" ? view.startupNotice : null,
  });
  const listButtonRef = useRef<HTMLButtonElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  // ダイアログの中で最後にマウスでクリックした時刻。1回目のクリックで閉じたダイアログのダブルクリックの
  // 2回目がキャンバスへ届いたときに、MapStage が dblclick を無視する（L-150）。再マウントをまたぐのでシェルで持つ
  const dialogMouseClickedAtRef = useRef<number | null>(null);
  const currentMapId = view.status === "ready" ? view.currentMap.id : null;
  const { headerFocusRequest, consumeHeaderFocusRequest } = dialog;

  // 再マウントで新しいヘッダーの ref がつながった後に、ダイアログの戻し先へフォーカスする
  useLayoutEffect(() => {
    if (headerFocusRequest === null) return;
    const button = headerFocusRequest === "list"
      ? listButtonRef.current
      : createButtonRef.current;
    button?.focus();
    consumeHeaderFocusRequest();
  }, [headerFocusRequest, currentMapId, consumeHeaderFocusRequest]);

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-900">
      <MapLibraryNoticeRegion notice={dialog.shellNotice} />
      {view.status === "loading" ? (
        <p role="status" className="px-6 py-3 text-sm text-zinc-600 dark:text-zinc-400">マップを読み込んでいます…</p>
      ) : (
        <>
          <MapEditor
            key={view.currentMap.id}
            mapId={view.currentMap.id}
            mapName={view.currentMap.name}
            storageSession={view.storageSession}
            shortcutsEnabled={dialog.screen.kind === "closed"}
            dialogMouseClickedAtRef={dialogMouseClickedAtRef}
            mapControls={(
              <MapLibraryControls
                mapName={view.currentMap.name}
                disabled={view.storageMode === "protected"}
                listExpanded={dialog.screen.kind === "list"}
                onOpenList={dialog.openList}
                onOpenCreate={dialog.openCreateFromHeader}
                listButtonRef={listButtonRef}
                createButtonRef={createButtonRef}
              />
            )}
          />
          {dialog.screen.kind !== "closed" && (
            <MapLibraryDialog
              screen={dialog.screen}
              maps={view.maps}
              currentMapId={view.currentMap.id}
              notices={dialog.notices}
              focusTarget={dialog.focusTarget}
              onFocusTargetApplied={dialog.consumeFocusTarget}
              onEscape={dialog.back}
              onClose={dialog.close}
              onOpenCreate={dialog.openCreateFromList}
              onOpenRename={dialog.openRename}
              onOpenDelete={dialog.openDelete}
              onSwitch={dialog.switchTo}
              onCancel={dialog.back}
              onSubmitCreate={dialog.submitCreate}
              onSubmitRename={dialog.submitRename}
              onConfirmDelete={dialog.confirmDelete}
              onMouseClick={() => {
                dialogMouseClickedAtRef.current = Date.now();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
