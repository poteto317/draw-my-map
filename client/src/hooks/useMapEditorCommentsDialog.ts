"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { MapCommentsDialogFilter } from "@/components/layout/MapCommentsDialog";

export type UseMapEditorCommentsDialogOptions = {
  mapId: string;
  /** 入口のボタンが無効なときのフォーカスの戻り先（常に押せるボタン） */
  fallbackFocusRef: RefObject<HTMLElement | null>;
};

export type MapEditorCommentsDialog = {
  open: boolean;
  initialFilter: MapCommentsDialogFilter;
  /** ヘッダーの入口のボタン。閉じた後のフォーカスの戻り先 */
  buttonRef: RefObject<HTMLButtonElement | null>;
  /** ガードは呼び出し側で済ませる（入口の塞ぎ方は resolveCommentsEntry） */
  show: (initialFilter: MapCommentsDialogFilter) => void;
  close: () => void;
};

/**
 * 編集シェルのコメントダイアログの開閉。
 * マップ切替で閉じ（共有ダイアログと同じ。L-166）、閉じたらヘッダーの入口（無効なら代わりのボタン）へフォーカスを戻す
 */
export function useMapEditorCommentsDialog({
  mapId,
  fallbackFocusRef,
}: UseMapEditorCommentsDialogOptions): MapEditorCommentsDialog {
  const [state, setState] = useState<{ open: boolean; initialFilter: MapCommentsDialogFilter }>({
    open: false,
    initialFilter: "all",
  });
  const buttonRef = useRef<HTMLButtonElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- mapId 切替時のダイアログ閉鎖（L-166） */
  useLayoutEffect(() => {
    setState((current) => (current.open ? { ...current, open: false } : current));
  }, [mapId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const wasOpenRef = useRef(false);
  useLayoutEffect(() => {
    if (wasOpenRef.current && !state.open) {
      const button = buttonRef.current;
      (button?.disabled ? fallbackFocusRef.current : button)?.focus();
    }
    wasOpenRef.current = state.open;
  }, [state.open, fallbackFocusRef]);

  const show = useCallback((initialFilter: MapCommentsDialogFilter) => {
    setState({ open: true, initialFilter });
  }, []);
  const close = useCallback(() => {
    setState((current) => ({ ...current, open: false }));
  }, []);

  return { open: state.open, initialFilter: state.initialFilter, buttonRef, show, close };
}
