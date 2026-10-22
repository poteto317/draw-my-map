import type { KeyboardEvent, Ref } from "react";

type MapLibraryControlsProps = {
  mapName: string;
  disabled: boolean;
  listExpanded: boolean;
  onOpenList: () => void;
  onOpenCreate: () => void;
  listButtonRef: Ref<HTMLButtonElement>;
  createButtonRef: Ref<HTMLButtonElement>;
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  // 押し続けたEnter・Spaceのclick合成が、開いた直後のダイアログへ届かないようにする
  if ((event.key === "Enter" || event.key === " ") && event.repeat) {
    event.preventDefault();
  }
}

export function MapLibraryControls({
  mapName,
  disabled,
  listExpanded,
  onOpenList,
  onOpenCreate,
  listButtonRef,
  createButtonRef,
}: MapLibraryControlsProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        data-testid="current-map-name"
        className="max-w-[16rem] truncate text-sm text-zinc-700 dark:text-zinc-200"
        title={mapName}
      >
        マップ: {mapName}
      </span>
      <button
        ref={listButtonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="dialog"
        aria-expanded={listExpanded}
        disabled={disabled}
        onClick={onOpenList}
        onKeyDown={handleKeyDown}
      >
        マップ一覧
      </button>
      <button
        ref={createButtonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={onOpenCreate}
        onKeyDown={handleKeyDown}
      >
        新しいマップ
      </button>
      {disabled && (
        <span className="text-sm text-amber-700 dark:text-amber-300">
          保存できないため、マップの切り替えは使えません。
        </span>
      )}
    </div>
  );
}
