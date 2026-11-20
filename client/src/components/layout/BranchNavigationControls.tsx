import { preventRepeatedEnterClick } from "@/components/layout/repeatedEnterClick";
import { MapViewHistoryControls } from "@/components/layout/MapViewHistoryControls";
import { NodeBreadcrumb } from "@/components/layout/NodeBreadcrumb";
import { usePairedButtonFocusHandover } from "@/components/layout/usePairedButtonFocusHandover";
import type { Node } from "@/types/node";

type BranchNavigationControlsProps = {
  breadcrumb: readonly Node[];
  focusing: boolean;
  canFocus: boolean;
  canExpand: boolean;
  canCollapse: boolean;
  canFitAll: boolean;
  canFitSelection: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onTravel: (direction: "back" | "forward") => void;
  onFitAll: () => void;
  onFitSelection: () => void;
  onToggleFocus: () => void;
  onSetSubtreeCollapsed: (collapsed: boolean) => void;
  onNavigate: (nodeId: number) => void;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function BranchNavigationControls({
  breadcrumb,
  focusing,
  canFocus,
  canExpand,
  canCollapse,
  canFitAll,
  canFitSelection,
  canGoBack,
  canGoForward,
  onTravel,
  onFitAll,
  onFitSelection,
  onToggleFocus,
  onSetSubtreeCollapsed,
  onNavigate,
}: BranchNavigationControlsProps) {
  const { firstRef, secondRef, handleFocus, handleBlur } = usePairedButtonFocusHandover(canExpand, canCollapse);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
      <button
        type="button"
        className={buttonClassName}
        disabled={!canFocus && !focusing}
        onClick={onToggleFocus}
        onKeyDown={preventRepeatedEnterClick}
      >
        {focusing ? "集中表示を終了" : "枝に集中"}
      </button>
      <button
        ref={firstRef}
        type="button"
        className={buttonClassName}
        disabled={!canExpand}
        onClick={() => onSetSubtreeCollapsed(false)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={preventRepeatedEnterClick}
      >
        枝を一括展開
      </button>
      <button
        ref={secondRef}
        type="button"
        className={buttonClassName}
        disabled={!canCollapse}
        onClick={() => onSetSubtreeCollapsed(true)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={preventRepeatedEnterClick}
      >
        枝を一括折りたたみ
      </button>
      <button type="button" className={buttonClassName} disabled={!canFitAll}
        onClick={onFitAll} onKeyDown={preventRepeatedEnterClick}>
        {focusing ? "表示中の枝に合わせる" : "全体に合わせる"}
      </button>
      <button type="button" className={buttonClassName} disabled={!canFitSelection}
        onClick={onFitSelection} onKeyDown={preventRepeatedEnterClick}>
        選択に合わせる
      </button>
      <MapViewHistoryControls
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onTravel={onTravel}
      />
      <NodeBreadcrumb breadcrumb={breadcrumb} onNavigate={onNavigate} />
    </div>
  );
}
