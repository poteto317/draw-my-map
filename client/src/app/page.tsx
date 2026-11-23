"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { MapLibraryControls } from "@/components/layout/MapLibraryControls";
import { MapLibraryDialog } from "@/components/layout/MapLibraryDialog";
import { MapLibraryNoticeRegion } from "@/components/layout/MapLibraryNoticeRegion";
import { MapEditor } from "@/components/map/MapEditor";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import { createEmptyMapLibraryMeta, type MapLibraryMetaV1 } from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapTrashEntry } from "@/domain/mapLibrary/mapTrash";
import { useMapLibrary, type MapLibraryDeps } from "@/hooks/useMapLibrary";
import { useMapLibraryDialogState } from "@/hooks/useMapLibraryDialogState";
import { usePendingMapNavigation } from "@/hooks/usePendingMapNavigation";
import { generateMapId } from "@/services/persistence/mapIdGenerator";
import { getBrowserMapLibraryStorage } from "@/services/persistence/mapLibraryStorage";

// useMapLibrary は deps を layout effect で ref へ同期するので、描画ごとに作り直さない
const MAP_LIBRARY_DEPS: MapLibraryDeps = {
  getStorage: getBrowserMapLibraryStorage,
  now: () => new Date(),
  generateId: () => generateMapId(),
};

const NO_MAPS: readonly MapIndexEntry[] = [];
const NO_TRASH_ENTRIES: readonly MapTrashEntry[] = [];
const EMPTY_LIBRARY_META: MapLibraryMetaV1 = createEmptyMapLibraryMeta();

// シェル。マップの一覧の状態とダイアログを持ち、現在のマップの MapEditor を id で再マウントする
export default function Home() {
  const library = useMapLibrary(MAP_LIBRARY_DEPS);
  const { view } = library;
  // フックは条件付きで呼ばない。loading の間は一覧を空にし、起動の通知も出さない
  const dialog = useMapLibraryDialogState({
    library,
    maps: view.status === "ready" ? view.maps : NO_MAPS,
    trashEntries: view.status === "ready" ? view.trashEntries : NO_TRASH_ENTRIES,
    libraryMeta: view.status === "ready" ? view.libraryMeta : EMPTY_LIBRARY_META,
    startupNotice: view.status === "ready" ? view.startupNotice : null,
  });
  const listButtonRef = useRef<HTMLButtonElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  // ダイアログの中で最後にマウスでクリックした時刻。1回目のクリックで閉じたダイアログのダブルクリックの
  // 2回目がキャンバスへ届いたときに、MapStage が dblclick を無視する（L-150）。再マウントをまたぐのでシェルで持つ
  const dialogMouseClickedAtRef = useRef<number | null>(null);
  const currentMapId = view.status === "ready" ? view.currentMap.id : null;
  const {
    headerFocusRequest,
    consumeHeaderFocusRequest,
    closeSilently,
    publishShellNotice,
  } = dialog;

  const {
    pendingNavigation,
    consumePendingNavigation,
    clearPendingNavigation,
    switchToMapTarget,
  } = usePendingMapNavigation({
    view,
    switchMap: library.switchMap,
    publishShellNotice,
  });
  const [brokenLinksDialogRequest, setBrokenLinksDialogRequest] = useState(0);

  const handleOpenBrokenLinks = useCallback(() => {
    closeSilently();
    setBrokenLinksDialogRequest((count) => count + 1);
  }, [closeSilently]);

  const handleBrokenLinksDialogClosed = useCallback(() => {
    listButtonRef.current?.focus();
  }, []);

  // 再マウントで新しいヘッダーの ref がつながった後に、ダイアログの戻し先へフォーカスする
  useLayoutEffect(() => {
    if (headerFocusRequest === null) return;
    const buttonRefs = { list: listButtonRef, create: createButtonRef, export: exportButtonRef };
    buttonRefs[headerFocusRequest].current?.focus();
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
            key={`${view.currentMap.id}:${view.currentMap.createdAt}:${view.storageMode}`}
            mapId={view.currentMap.id}
            mapCreatedAt={view.currentMap.createdAt}
            mapMoveTargets={view.maps}
            libraryMeta={view.libraryMeta}
            onMoveBranchToMap={(rootId, targetMapId) => {
              clearPendingNavigation();
              return dialog.moveBranchToMap(view.storageSession, targetMapId, rootId);
            }}
            onExtractBranchToNewMap={(rootId) => {
              clearPendingNavigation();
              return dialog.extractBranchToNewMap(view.storageSession, rootId);
            }}
            mapName={view.currentMap.name}
            storageSession={view.storageSession}
            storageMode={view.storageMode}
            shortcutsEnabled={dialog.screen.kind === "closed"}
            dialogMouseClickedAtRef={dialogMouseClickedAtRef}
            exportButtonRef={exportButtonRef}
            onSaveCurrentAsNewMap={(name, json) => {
              clearPendingNavigation();
              return library.saveCurrentAsNewMap(name, json);
            }}
            pendingNavigation={pendingNavigation}
            onConsumePendingNavigation={consumePendingNavigation}
            onSwitchToMapTarget={switchToMapTarget}
            brokenLinksDialogRequest={brokenLinksDialogRequest}
            onBrokenLinksDialogClosed={handleBrokenLinksDialogClosed}
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
              trashEntries={view.trashEntries}
              trashStatus={view.trashStatus}
              libraryMeta={view.libraryMeta}
              libraryMetaStatus={view.libraryMetaStatus}
              listTab={dialog.listTab}
              folderFilter={dialog.folderFilter}
              onChangeListTab={dialog.setListTab}
              onChangeFolderFilter={dialog.setFolderFilter}
              onOpenFolders={dialog.openFolders}
              onOpenFolderRename={dialog.openFolderRename}
              onOpenFolderDelete={dialog.openFolderDelete}
              onToggleFavorite={dialog.toggleFavorite}
              onArchiveMap={dialog.archiveMap}
              onUnarchiveMap={dialog.unarchiveMap}
              onAssignFolder={dialog.assignFolder}
              onCreateFolder={dialog.submitCreateFolder}
              onSubmitRenameFolder={dialog.submitRenameFolder}
              onConfirmDeleteFolder={dialog.confirmDeleteFolder}
              onResetLibraryMeta={dialog.resetLibraryMeta}
              notices={dialog.notices}
              focusTarget={dialog.focusTarget}
              onFocusTargetApplied={dialog.consumeFocusTarget}
              onEscape={dialog.back}
              onClose={dialog.close}
              onOpenCreate={dialog.openCreateFromList}
              onOpenRename={dialog.openRename}
              onOpenDelete={dialog.openDelete}
              onOpenTrash={dialog.openTrash}
              onOpenBrokenLinks={handleOpenBrokenLinks}
              onSwitch={(mapId) => {
                clearPendingNavigation();
                dialog.switchTo(mapId);
              }}
              onCancel={dialog.back}
              onSubmitCreate={(nameInput, templateId) => {
                clearPendingNavigation();
                dialog.submitCreate(nameInput, templateId);
              }}
              onSubmitRename={dialog.submitRename}
              onConfirmDelete={(mapId) => {
                clearPendingNavigation();
                dialog.confirmDelete(mapId);
              }}
              onConfirmPermanentDeleteActive={(mapId) => {
                clearPendingNavigation();
                dialog.confirmPermanentDeleteActive(mapId);
              }}
              onRestoreTrash={dialog.restoreTrash}
              onOpenTrashPermanentDelete={dialog.openTrashPermanentDelete}
              onConfirmTrashPermanentDelete={dialog.confirmTrashPermanentDelete}
              onOpenEmptyTrash={dialog.openEmptyTrash}
              onConfirmEmptyTrash={dialog.confirmEmptyTrash}
              onPrepareBackup={dialog.prepareBackup}
              onDownloadBackup={dialog.downloadBackup}
              onSelectRestoreFile={dialog.selectRestoreFile}
              onConfirmRestore={() => {
                clearPendingNavigation();
                dialog.confirmRestore();
              }}
              storageMode={view.storageMode}
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
