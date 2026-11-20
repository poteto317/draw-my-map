"use client";

import { useEffect } from "react";
import { isCommandPaletteShortcut } from "@/components/map/commandPaletteShortcut";
import { useLatestRef } from "@/hooks/useLatestRef";

type CommandPaletteShortcutOptions = {
  enabled: boolean;
  onOpen: () => void;
};

export function useCommandPaletteShortcut({
  enabled,
  onOpen,
}: CommandPaletteShortcutOptions): void {
  const latestOptionsRef = useLatestRef<CommandPaletteShortcutOptions>({
    enabled,
    onOpen,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { enabled: isEnabled, onOpen: open } = latestOptionsRef.current;
      if (!isEnabled) return;
      if (!isCommandPaletteShortcut(event)) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [latestOptionsRef]);
}
