import type { ReactNode } from "react";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import { LayoutModeSelector } from "@/components/layout/LayoutModeSelector";
import { MapSaveStatus as MapSaveStatusDisplay } from "@/components/layout/MapSaveStatus";
import type { MapSaveStatus } from "@/domain/persistence/mapSaveStatus";

type AppHeaderProps = {
  layoutMode: NodeLayoutMode;
  onLayoutModeChange: (mode: NodeLayoutMode) => void;
  layoutModeDisabled?: boolean;
  layoutDirectionControls?: ReactNode;
  mapControls: ReactNode;
  saveStatus: MapSaveStatus;
  viewControls: ReactNode;
  searchControls: ReactNode;
  isNarrowViewport: boolean;
  userChoseMapOnNarrow: boolean;
  operationNotices?: ReactNode;
};

export function AppHeader({
  layoutMode,
  onLayoutModeChange,
  layoutModeDisabled = false,
  layoutDirectionControls,
  mapControls,
  saveStatus,
  viewControls,
  searchControls,
  isNarrowViewport,
  userChoseMapOnNarrow,
  operationNotices,
}: AppHeaderProps) {
  return (
    <header
      className="flex flex-col gap-2 bg-white px-6 py-3 shadow-sm dark:bg-zinc-800"
      data-narrow-viewport={isNarrowViewport}
      data-user-chose-map-on-narrow={userChoseMapOnNarrow}
    >
      <div
        data-testid="header-primary"
        className={
          isNarrowViewport
            ? "flex shrink-0 items-center gap-4 overflow-x-auto overscroll-x-contain"
            : "flex shrink-0 flex-wrap items-center gap-4"
        }
      >
        <h1 className="shrink-0 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          Draw My Map
        </h1>
        {mapControls}
        {isNarrowViewport ? (
          <>
            {viewControls}
            <MapSaveStatusDisplay status={saveStatus} />
          </>
        ) : (
          <>
            <MapSaveStatusDisplay status={saveStatus} />
            {viewControls}
          </>
        )}
        {searchControls}
        <LayoutModeSelector
          layoutMode={layoutMode}
          onLayoutModeChange={onLayoutModeChange}
          disabled={layoutModeDisabled}
        />
        {layoutDirectionControls}
        <a
          href="/help"
          className="shrink-0 text-sm text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-300"
        >
          使い方
        </a>
      </div>
      {operationNotices != null && (
        <div data-testid="operation-notices" className="w-full">
          {operationNotices}
        </div>
      )}
    </header>
  );
}
