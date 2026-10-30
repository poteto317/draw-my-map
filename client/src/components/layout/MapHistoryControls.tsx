import { preventRepeatedEnterClick } from "@/components/layout/repeatedEnterClick";
import { usePairedButtonFocusHandover } from "@/components/layout/usePairedButtonFocusHandover";

type MapHistoryControlsProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

const buttonClassName = "rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function MapHistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: MapHistoryControlsProps) {
  // 押したボタンが無効になってもキーボードのフォーカスを失わないよう、もう一方の有効なボタンへ移す
  const {
    firstRef: undoButtonRef,
    secondRef: redoButtonRef,
    handleFocus,
    handleBlur,
  } = usePairedButtonFocusHandover(canUndo, canRedo);

  // Enterの押し続けで履歴が連続して進み、フォーカス移動後にUndoとRedoが往復しないよう、リピートのclick合成を止める（preventRepeatedEnterClick）
  // pointerdownの既定動作は止めない。編集中のラベル入力をblurで確定してから履歴を操作させるため
  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        className={buttonClassName}
        ref={undoButtonRef}
        onClick={onUndo}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={preventRepeatedEnterClick}
        disabled={!canUndo}
      >
        元に戻す
      </button>
      <button
        type="button"
        className={buttonClassName}
        ref={redoButtonRef}
        onClick={onRedo}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={preventRepeatedEnterClick}
        disabled={!canRedo}
      >
        やり直す
      </button>
    </div>
  );
}
