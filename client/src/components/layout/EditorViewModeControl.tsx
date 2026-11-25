import type { EditorViewMode } from "@/domain/view/editorViewMode";

export type { EditorViewMode };

type Props = { mode: EditorViewMode; onChange: (mode: EditorViewMode) => void; disabled?: boolean };

const buttonClassName = "rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-pressed:bg-blue-600 aria-pressed:text-white bg-zinc-100 text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200";

export function EditorViewModeControl({ mode, onChange, disabled = false }: Props) {
  return (
    <div role="group" aria-label="表示モード" className="flex shrink-0 gap-2">
      <button type="button" className={buttonClassName} aria-pressed={mode === "map"} disabled={disabled} onClick={() => onChange("map")}>
        マップ
      </button>
      <button type="button" className={buttonClassName} aria-pressed={mode === "outline"} disabled={disabled} onClick={() => onChange("outline")}>
        アウトライン
      </button>
    </div>
  );
}
