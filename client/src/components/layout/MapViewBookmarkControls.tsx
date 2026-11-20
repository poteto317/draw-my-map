import { useRef, useState } from "react";
import { preventRepeatedEnterClick } from "@/components/layout/repeatedEnterClick";
import type { MapViewBookmark } from "@/services/persistence/mapViewBookmarkStorage";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";

type MapViewBookmarkControlsProps = {
  unavailable: boolean;
  disabled: boolean;
  bookmarks: readonly MapViewBookmark[];
  onSave: (name: string) => boolean;
  onApply: (snapshot: MapViewSnapshot) => void;
  onDelete: (name: string) => boolean;
};

const buttonClassName =
  "rounded-md bg-zinc-100 px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:bg-zinc-700";

export function MapViewBookmarkControls({
  unavailable, disabled, bookmarks, onSave, onApply, onDelete,
}: MapViewBookmarkControlsProps) {
  const [name, setName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  return (
    <div role="group" aria-label="表示ブックマーク" className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && onSave(name)) {
          setName("");
          nameInputRef.current?.focus();
        }
      }}>
        <input
          ref={nameInputRef}
          aria-label="表示ブックマーク名"
          placeholder="表示ブックマーク名"
          className="w-40 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-600"
          value={name}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={preventRepeatedEnterClick}
        />
        <button className={buttonClassName} type="submit" disabled={disabled} onKeyDown={preventRepeatedEnterClick}>
          現在の表示を保存
        </button>
      </form>
      {unavailable && <span>このマップでは表示ブックマークを保存できません。</span>}
      {bookmarks.length > 0 && (
        <ul aria-label="保存した表示ブックマーク" className="flex min-w-0 max-w-full gap-2 overflow-x-auto p-1 whitespace-nowrap">
          {bookmarks.map(({ name, snapshot }) => (
            <li key={name} className="flex shrink-0 items-center gap-1">
              <button className={`${buttonClassName} max-w-48 truncate`} type="button"
                title={name} aria-label={`${name}を適用`} disabled={disabled}
                onClick={() => onApply(snapshot)} onKeyDown={preventRepeatedEnterClick}>
                {name}
              </button>
              <button className={buttonClassName} type="button" aria-label={`${name}を削除`} disabled={disabled}
                onClick={() => { if (onDelete(name)) nameInputRef.current?.focus(); }}
                onKeyDown={preventRepeatedEnterClick}>
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
