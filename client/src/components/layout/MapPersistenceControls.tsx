"use client";

import { useRef, type ChangeEvent, type Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

type MapPersistenceControlsProps = {
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  exportButtonRef?: Ref<HTMLButtonElement>;
};

export function MapPersistenceControls({
  onExport,
  onImport,
  exportButtonRef,
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
        ref={exportButtonRef}
        type="button"
        className="rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors dark:bg-zinc-700 dark:text-zinc-200"
        onClick={onExport}
        // 保護モードへ移るとフォーカスがこのボタンへ来る。押し続けたEnter・Spaceのclick合成で書き出さない
        onKeyDown={preventRepeatedActivationClick}
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
