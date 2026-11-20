"use client";

import { useCallback, useState } from "react";
import {
  closeCommandPalette,
  consumeCommandPaletteFocusRequest,
  createCommandPaletteState,
  markCommandPaletteStaleIfNeeded,
  moveCommandPaletteHighlight,
  openCommandPalette,
  setCommandPaletteQuery,
  setCommandPaletteReject,
  type CommandPaletteCloseReason,
  type CommandPaletteFocusRequest,
} from "@/hooks/commandPaletteState";
import { useLatestRef } from "@/hooks/useLatestRef";

export type UseCommandPaletteOptions = {
  readonly mapId: string;
  readonly documentRevision: number;
};

export type UseCommandPaletteResult = {
  screen: "closed" | "open";
  query: string;
  activeIndex: number;
  rejectMessage: string | null;
  rejectSequence: number;
  focusRequest: CommandPaletteFocusRequest;
  closeReason: CommandPaletteCloseReason | null;
  open: () => void;
  close: (reason: CommandPaletteCloseReason) => void;
  setQuery: (query: string) => void;
  moveHighlight: (action: "up" | "down" | "home" | "end", itemCount: number) => void;
  setReject: (message: string) => void;
  consumeFocusRequest: () => void;
};

export function useCommandPalette(options: UseCommandPaletteOptions): UseCommandPaletteResult {
  const [state, setState] = useState(createCommandPaletteState);
  const latestOptionsRef = useLatestRef(options);

  // mapId / documentRevision 変化は props 同期（L-037）。usePendingMapNavigation と同型。
  const syncedState = markCommandPaletteStaleIfNeeded(state, {
    mapId: options.mapId,
    revision: options.documentRevision,
  });
  if (syncedState !== state) {
    setState(syncedState);
  }
  const effectiveState = syncedState !== state ? syncedState : state;

  const open = useCallback(() => {
    const { mapId, documentRevision } = latestOptionsRef.current;
    setState((prev) => openCommandPalette(prev, { mapId, revision: documentRevision }));
  }, [latestOptionsRef]);

  const close = useCallback((reason: CommandPaletteCloseReason) => {
    setState((prev) => closeCommandPalette(prev, reason));
  }, []);

  const setQuery = useCallback((query: string) => {
    setState((prev) => setCommandPaletteQuery(prev, query));
  }, []);

  const moveHighlight = useCallback(
    (action: "up" | "down" | "home" | "end", itemCount: number) => {
      setState((prev) => moveCommandPaletteHighlight(prev, action, itemCount));
    },
    [],
  );

  const setReject = useCallback((message: string) => {
    setState((prev) => setCommandPaletteReject(prev, message));
  }, []);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeCommandPaletteFocusRequest);
  }, []);

  return {
    screen: effectiveState.screen,
    query: effectiveState.query,
    activeIndex: effectiveState.activeIndex,
    rejectMessage: effectiveState.rejectMessage,
    rejectSequence: effectiveState.rejectSequence,
    focusRequest: effectiveState.focusRequest,
    closeReason: effectiveState.closeReason,
    open,
    close,
    setQuery,
    moveHighlight,
    setReject,
    consumeFocusRequest,
  };
}
