import type { ReactNode } from "react";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import { LayoutModeOperationHint } from "@/components/layout/LayoutModeOperationHint";
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
  showCanvasHints: boolean;
  searchControls: ReactNode;
  isNarrowViewport: boolean;
  userChoseMapOnNarrow: boolean;
  voiceControls?: ReactNode;
  importanceControls?: ReactNode;
  resolutionControls?: ReactNode;
  operationControls?: ReactNode;
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
  showCanvasHints,
  searchControls,
  isNarrowViewport,
  userChoseMapOnNarrow,
  voiceControls,
  importanceControls,
  resolutionControls,
  operationControls,
  operationNotices,
}: AppHeaderProps) {
  const hasOperationsSection =
    Boolean(importanceControls) ||
    Boolean(resolutionControls) ||
    Boolean(operationControls) ||
    Boolean(operationNotices);

  return (
    <header
      className="flex max-h-[40dvh] flex-col gap-4 bg-white px-6 py-3 shadow-sm dark:bg-zinc-800"
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
            {voiceControls}
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
        {showCanvasHints && <LayoutModeOperationHint layoutMode={layoutMode} />}
      </div>
      {hasOperationsSection && (
        <div
          data-testid="header-operations-scroll"
          className="flex min-h-0 flex-1 flex-wrap items-center gap-4 overflow-y-auto overscroll-y-contain"
        >
          {importanceControls}
          {resolutionControls}
          {operationControls}
          {operationNotices != null && (
            <div data-testid="operation-notices" className="w-full">
              {operationNotices}
            </div>
          )}
        </div>
      )}
    </header>
  );
}