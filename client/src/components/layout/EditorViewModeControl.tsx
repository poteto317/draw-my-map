export type EditorViewMode = "map" | "outline";

type Props = { mode: EditorViewMode; onChange: (mode: EditorViewMode) => void };

const buttonClassName = "rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-pressed:bg-blue-600 aria-pressed:text-white bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";

export function EditorViewModeControl({ mode, onChange }: Props) {
  return (
    <div role="group" aria-label="表示モード" className="flex shrink-0 gap-2">
      <button type="button" className={buttonClassName} aria-pressed={mode === "map"} onClick={() => onChange("map")}>
        マップ
      </button>
      <button type="button" className={buttonClassName} aria-pressed={mode === "outline"} onClick={() => onChange("outline")}>
        アウトライン
      </button>
    </div>
  );
}
