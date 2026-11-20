import { preventRepeatedEnterClick } from "@/components/layout/repeatedEnterClick";

type MapViewHistoryControlsProps = {
  canGoBack: boolean;
  canGoForward: boolean;
  onTravel: (direction: "back" | "forward") => void;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function MapViewHistoryControls({
  canGoBack,
  canGoForward,
  onTravel,
}: MapViewHistoryControlsProps) {
  return (
    <>
      <button type="button" className={buttonClassName} disabled={!canGoBack}
        onClick={() => onTravel("back")} onKeyDown={preventRepeatedEnterClick}>
        閲覧を戻る
      </button>
      <button type="button" className={buttonClassName} disabled={!canGoForward}
        onClick={() => onTravel("forward")} onKeyDown={preventRepeatedEnterClick}>
        閲覧を進む
      </button>
    </>
  );
}
