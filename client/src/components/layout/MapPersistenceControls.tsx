"use client";

import { useRef, type ChangeEvent } from "react";

type MapPersistenceControlsProps = {
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
};

export function MapPersistenceControls({
  onExport,
  onImport,
}: MapPersistenceControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      await onImport(file);
    } catch {
      // The import command owns user-facing error reporting.
    } finally {
      input.value = "";
    }
  };

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        className="rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors dark:bg-zinc-700 dark:text-zinc-200"
        onClick={onExport}
      >
        JSON書き出し
      </button>
      <button
        type="button"
        className="rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors dark:bg-zinc-700 dark:text-zinc-200"
        onClick={() => fileInputRef.current?.click()}
      >
        JSON読み込み
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
