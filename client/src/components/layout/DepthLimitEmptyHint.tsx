type DepthLimitEmptyHintProps = {
  onResetToUnlimited: () => void;
};

/** 深さ制限で表示が 0 件のときの無制限復帰導線。 */
export function DepthLimitEmptyHint({ onResetToUnlimited }: DepthLimitEmptyHintProps) {
  return (
    <div
      role="status"
      aria-label="深さ制限の表示案内"
      className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <span>深さ制限により表示できるノードがありません。</span>
      <button
        type="button"
        className="rounded-md bg-amber-600 px-3 py-1 text-white transition-colors hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
        onClick={onResetToUnlimited}
      >
        深さを無制限に戻す
      </button>
    </div>
  );
}
