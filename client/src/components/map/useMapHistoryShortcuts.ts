"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { resolveMapHistoryShortcut } from "@/components/map/mapHistoryShortcut";

type MapHistoryShortcutCommands = {
  undo: () => boolean;
  redo: () => boolean;
};

// ページ全体のUndo／Redoショートカット。登録は1回で、押下時点の最新の関数を呼ぶ。
// 対象キーは履歴が空でもブラウザ既定動作を止め、実行可否は各関数側で判定する
export function useMapHistoryShortcuts({ undo, redo }: MapHistoryShortcutCommands): void {
  const latestCommandsRef = useRef<MapHistoryShortcutCommands>({ undo, redo });
  useLayoutEffect(() => {
    latestCommandsRef.current = { undo, redo };
  }, [undo, redo]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = resolveMapHistoryShortcut(event);
      if (shortcut === null) return;

      event.preventDefault();
      latestCommandsRef.current[shortcut]();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
