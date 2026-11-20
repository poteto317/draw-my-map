"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

type UseCrossMapDialogsParams = {
  storageMode: "persistent" | "protected";
  brokenLinksDialogRequest: number;
  crossMapSearchButtonRef: RefObject<HTMLButtonElement | null>;
  refreshCorpus: () => void;
  onNavigateToMapTarget: (targetMapId: string, targetNodeId?: number) => void;
  onBrokenLinksDialogClosed: () => void;
};

export type UseCrossMapDialogsResult = {
  crossMapSearchOpen: boolean;
  brokenLinksDialogOpen: boolean;
  openCrossMapSearch: () => void;
  closeCrossMapSearch: () => void;
  closeBrokenLinksDialog: () => void;
  selectCrossMapSearchMatch: (targetMapId: string, targetNodeId: number) => void;
  navigateToBrokenLinkSource: (sourceMapId: string, sourceNodeId: number) => void;
};

// 全マップ検索ダイアログ・リンク切れ確認ダイアログの開閉、起動前コーパス更新、
// および閉じた後のフォーカス復帰を管理するフック
export function useCrossMapDialogs({
  storageMode,
  brokenLinksDialogRequest,
  crossMapSearchButtonRef,
  refreshCorpus,
  onNavigateToMapTarget,
  onBrokenLinksDialogClosed,
}: UseCrossMapDialogsParams): UseCrossMapDialogsResult {
  const [crossMapSearchOpen, setCrossMapSearchOpen] = useState(false);
  const crossMapSearchFocusReturnRef = useRef(false);

  const [brokenLinksDialogOpen, setBrokenLinksDialogOpen] = useState(false);
  const brokenLinksFocusReturnRef = useRef(false);
  const [seenBrokenLinksRequest, setSeenBrokenLinksRequest] = useState(brokenLinksDialogRequest);

  if (brokenLinksDialogRequest !== seenBrokenLinksRequest) {
    setSeenBrokenLinksRequest(brokenLinksDialogRequest);
    if (storageMode !== "protected") {
      refreshCorpus();
      setBrokenLinksDialogOpen(true);
    }
  }

  const openCrossMapSearch = useCallback(() => {
    crossMapSearchFocusReturnRef.current = false;
    refreshCorpus();
    setCrossMapSearchOpen(true);
  }, [refreshCorpus]);

  const closeCrossMapSearch = useCallback(() => {
    crossMapSearchFocusReturnRef.current = true;
    setCrossMapSearchOpen(false);
  }, []);

  const closeBrokenLinksDialog = useCallback(() => {
    brokenLinksFocusReturnRef.current = true;
    setBrokenLinksDialogOpen(false);
  }, []);

  const selectCrossMapSearchMatch = useCallback(
    (targetMapId: string, targetNodeId: number) => {
      crossMapSearchFocusReturnRef.current = false;
      setCrossMapSearchOpen(false);
      onNavigateToMapTarget(targetMapId, targetNodeId);
    },
    [onNavigateToMapTarget],
  );

  const navigateToBrokenLinkSource = useCallback(
    (sourceMapId: string, sourceNodeId: number) => {
      brokenLinksFocusReturnRef.current = false;
      setBrokenLinksDialogOpen(false);
      onNavigateToMapTarget(sourceMapId, sourceNodeId);
    },
    [onNavigateToMapTarget],
  );

  useLayoutEffect(() => {
    if (!crossMapSearchFocusReturnRef.current || crossMapSearchOpen) return;
    crossMapSearchFocusReturnRef.current = false;
    crossMapSearchButtonRef.current?.focus();
  }, [crossMapSearchButtonRef, crossMapSearchOpen]);

  useLayoutEffect(() => {
    if (!brokenLinksFocusReturnRef.current || brokenLinksDialogOpen) return;
    brokenLinksFocusReturnRef.current = false;
    onBrokenLinksDialogClosed();
  }, [brokenLinksDialogOpen, onBrokenLinksDialogClosed]);

  return {
    crossMapSearchOpen,
    brokenLinksDialogOpen,
    openCrossMapSearch,
    closeCrossMapSearch,
    closeBrokenLinksDialog,
    selectCrossMapSearchMatch,
    navigateToBrokenLinkSource,
  };
}
