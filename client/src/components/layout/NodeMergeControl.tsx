import { useId, type Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

type NodeMergeControlProps = {
  expanded: boolean;
  disabled: boolean;
  // 無効のときに、title と aria-describedby の説明で示す理由
  disabledReason: string;
  onOpen: () => void;
  buttonRef: Ref<HTMLButtonElement>;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeMergeControl({ expanded, disabled, disabledReason, onOpen, buttonRef }: NodeMergeControlProps) {
  const reasonId = useId();

  // 押し続けた Enter・Space の click 合成が、開いた直後のダイアログへ届かないようにする
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-describedby={disabled ? reasonId : undefined}
        title={disabled ? disabledReason : undefined}
        disabled={disabled}
        onClick={onOpen}
        onKeyDown={preventRepeatedActivationClick}
      >
        ノードを統合
      </button>
      {disabled && <span id={reasonId} className="sr-only">{disabledReason}</span>}
    </>
  );
}
