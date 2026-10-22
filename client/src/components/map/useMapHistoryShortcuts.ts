"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { resolveMapHistoryShortcut } from "@/components/map/mapHistoryShortcut";

type MapHistoryShortcutCommands = {
  undo: () => boolean;
  redo: () => boolean;
  enabled: boolean;
};

// ページ全体のUndo／Redoショートカット。登録は1回で、押下時点の最新の関数を呼ぶ。
// 対象キーは履歴が空でもブラウザ既定動作を止め、実行可否は各関数側で判定する。
// enabled が false の間（ダイアログ表示中など）は何もせず、既定動作も止めない
export function useMapHistoryShortcuts({ undo, redo, enabled }: MapHistoryShortcutCommands): void {
  const latestCommandsRef = useRef<MapHistoryShortcutCommands>({ undo, redo, enabled });
  useLayoutEffect(() => {
    latestCommandsRef.current = { undo, redo, enabled };
  }, [undo, redo, enabled]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!latestCommandsRef.current.enabled) return;
      const shortcut = resolveMapHistoryShortcut(event);
      if (shortcut === null) return;

      event.preventDefault();
      latestCommandsRef.current[shortcut]();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
