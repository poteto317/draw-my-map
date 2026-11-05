import type { ReactNode } from "react";
import type { NodeLayoutMode } from "@/types/nodeLayout";
import { LayoutModeOperationHint } from "@/components/layout/LayoutModeOperationHint";
import { LayoutModeSelector } from "@/components/layout/LayoutModeSelector";
import { MapSaveStatus as MapSaveStatusDisplay } from "@/components/layout/MapSaveStatus";
import type { MapSaveStatus } from "@/domain/persistence/mapSaveStatus";

type AppHeaderProps = {
  layoutMode: NodeLayoutMode;
  onLayoutModeChange: (mode: NodeLayoutMode) => void;
  mapControls: ReactNode;
  saveStatus: MapSaveStatus;
  viewControls: ReactNode;
  showCanvasHints: boolean;
  searchControls: ReactNode;
  importanceControls?: ReactNode;
  resolutionControls?: ReactNode;
  operationControls?: ReactNode;
  operationNotices?: ReactNode;
};

export function AppHeader({
  layoutMode,
  onLayoutModeChange,
  mapControls,
  saveStatus,
  viewControls,
  showCanvasHints,
  searchControls,
  importanceControls,
  resolutionControls,
  operationControls,
  operationNotices,
}: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-4 bg-white px-6 py-3 shadow-sm dark:bg-zinc-800">
      <h1 className="shrink-0 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
        Draw My Map
      </h1>
      {mapControls}
      <MapSaveStatusDisplay status={saveStatus} />
      {viewControls}
      {searchControls}
      <LayoutModeSelector
        layoutMode={layoutMode}
        onLayoutModeChange={onLayoutModeChange}
      />
      {showCanvasHints && <LayoutModeOperationHint layoutMode={layoutMode} />}
      {importanceControls}
      {resolutionControls}
      {operationControls}
      {operationNotices && (
        <div data-testid="operation-notices" className="w-full">
          {operationNotices}
        </div>
      )}
    </header>
  );
}
