"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import {
  createDefaultDockVisibleSlotIds,
  type DockLayoutPrefs,
} from "@/domain/dock/defaultDockLayout";
import type { DockSlotId } from "@/domain/dock/dockSlotCatalog";
import type { SetDockLayoutResult } from "@/hooks/useUiPrefs";

export type UseDockCustomizeSessionResult = {
  readonly open: boolean;
  readonly draftVisibleSlotIds: readonly DockSlotId[];
  readonly customizeButtonRef: RefObject<HTMLButtonElement | null>;
  readonly setDraftVisibleSlotIds: (next: DockSlotId[]) => void;
  readonly openCustomize: () => void;
  readonly cancelCustomize: () => void;
  readonly resetDraftToDefault: () => void;
  readonly applyCustomize: () => SetDockLayoutResult;
};

/**
 * Dock カスタマイズダイアログの下書き・開閉・適用だけを担う。
 * スロット node の組み立てや EditorDock 計測とは分離する。
 * 適用失敗時の prefs ロールバックは setDockLayout 側（失敗で state を進めない）。
 * キャンセルは open 時点の visible スナップショットへ戻す。
 */
export function useDockCustomizeSession(input: {
  readonly visibleSlotIds: readonly DockSlotId[];
  readonly setDockLayout: (layout: DockLayoutPrefs) => SetDockLayoutResult;
}): UseDockCustomizeSessionResult {
  const { visibleSlotIds, setDockLayout } = input;
  const [open, setOpen] = useState(false);
  const [draftVisibleSlotIds, setDraftVisibleSlotIds] = useState<DockSlotId[]>(
    () => [...visibleSlotIds],
  );
  const customizeButtonRef = useRef<HTMLButtonElement>(null);
  const applyBaselineRef = useRef<DockSlotId[]>([...visibleSlotIds]);

  const restoreBaseline = useCallback(() => {
    setDockLayout({ visibleSlotIds: [...applyBaselineRef.current] });
  }, [setDockLayout]);

  const openCustomize = useCallback(() => {
    applyBaselineRef.current = [...visibleSlotIds];
    setDraftVisibleSlotIds([...visibleSlotIds]);
    setOpen(true);
  }, [visibleSlotIds]);

  const cancelCustomize = useCallback(() => {
    restoreBaseline();
    setOpen(false);
  }, [restoreBaseline]);

  const resetDraftToDefault = useCallback(() => {
    setDraftVisibleSlotIds(createDefaultDockVisibleSlotIds());
  }, []);

  const applyCustomize = useCallback((): SetDockLayoutResult => {
    const result = setDockLayout({ visibleSlotIds: draftVisibleSlotIds });
    if (result.ok) {
      setOpen(false);
    }
    return result;
  }, [draftVisibleSlotIds, setDockLayout]);

  return {
    open,
    draftVisibleSlotIds,
    customizeButtonRef,
    setDraftVisibleSlotIds,
    openCustomize,
    cancelCustomize,
    resetDraftToDefault,
    applyCustomize,
  };
}
