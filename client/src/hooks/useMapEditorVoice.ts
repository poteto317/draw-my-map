"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import {
  MAP_VOICE_MESSAGES,
  resolveVoiceStartBlocked,
  voiceStartBlockedMessage,
  type VoiceStartGuardInput,
} from "@/domain/map/mapVoiceGuards";
import { formatOutlineInsertFailure } from "@/domain/outline/outlineMessages";
import type { InsertForestResult } from "@/hooks/useNodes";
import { useVoiceInput, type VoiceInsertForest } from "@/hooks/useVoiceInput";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { CreateSpeechRecognitionAdapterOptions } from "@/domain/voice/speechRecognitionAdapter";

export type UseMapEditorVoiceOptions = {
  readonly documentRevision: number;
  readonly mapId: string;
  readonly insertForest: VoiceInsertForest;
  readonly selectNode: (id: number | null) => void;
  readonly selectedNodeId: number | null;
  readonly selectedNodeIds: readonly number[];
  readonly onInsertSuccessInMap?: (rootId: number) => void;
  readonly startGuard: Omit<VoiceStartGuardInput, "listening" | "speechSupported">;
  readonly exclusiveStopRequested: boolean;
  readonly adapterOptions?: CreateSpeechRecognitionAdapterOptions;
  readonly onListeningChange?: (listening: boolean) => void;
};

export type UseMapEditorVoiceReturn = {
  readonly listening: boolean;
  readonly interimTranscript: string;
  readonly voiceNotice: ReturnType<typeof useRevisionScopedNotice>["notice"];
  readonly voiceStartDisabledReason: string | null;
  readonly canVoiceInputStart: boolean;
  readonly canVoiceInputStop: boolean;
  readonly handleVoiceToggle: () => void;
  readonly startVoiceFromPalette: () => boolean;
  readonly stopVoiceFromPalette: () => boolean;
};

export function useMapEditorVoice({
  documentRevision,
  mapId,
  insertForest,
  selectNode,
  selectedNodeId,
  selectedNodeIds,
  onInsertSuccessInMap,
  startGuard,
  exclusiveStopRequested,
  adapterOptions,
  onListeningChange,
}: UseMapEditorVoiceOptions): UseMapEditorVoiceReturn {
  const { notice: voiceNotice, publishNotice, clearNotice } = useRevisionScopedNotice(documentRevision);

  const insertWithNotice = useCallback<VoiceInsertForest>((items, target) => {
    const result: InsertForestResult = insertForest(items, target);
    if (!result.ok) {
      publishNotice({ kind: "error", message: formatOutlineInsertFailure(result.reason) });
    } else {
      clearNotice();
    }
    return result;
  }, [clearNotice, insertForest, publishNotice]);

  const {
    listening,
    interimTranscript,
    speechSupported,
    start,
    stop,
    stopForExclusive,
  } = useVoiceInput({
    selectedNodeId,
    selectedNodeIds,
    insertForest: insertWithNotice,
    selectNode,
    onInsertSuccess: onInsertSuccessInMap,
    adapterOptions,
    onRecognitionError: () => {
      publishNotice({ kind: "error", message: MAP_VOICE_MESSAGES.recognitionError });
    },
    onStoppedExclusive: () => {
      publishNotice({ kind: "status", message: MAP_VOICE_MESSAGES.stoppedExclusive });
    },
  });
  const stopRef = useLatestRef(stop);
  const stopForExclusiveRef = useLatestRef(stopForExclusive);

  const voiceStartBlocked = useMemo(() => {
    return resolveVoiceStartBlocked({
      ...startGuard,
      listening,
      speechSupported,
    });
  }, [listening, speechSupported, startGuard]);

  const voiceStartDisabledReason = useMemo(() => {
    if (voiceStartBlocked === null) return null;
    return voiceStartBlockedMessage(voiceStartBlocked);
  }, [voiceStartBlocked]);

  const canVoiceInputStart = voiceStartBlocked === null && !listening;
  const canVoiceInputStop = listening;

  const startWithGuard = useCallback((): boolean => {
    if (listening) return false;
    const blocked = resolveVoiceStartBlocked({
      ...startGuard,
      listening: false,
      speechSupported,
    });
    if (blocked !== null) {
      publishNotice({ kind: "status", message: voiceStartBlockedMessage(blocked) });
      return false;
    }
    if (!start()) {
      publishNotice({ kind: "status", message: MAP_VOICE_MESSAGES.unsupported });
      return false;
    }
    clearNotice();
    return true;
  }, [clearNotice, listening, publishNotice, speechSupported, start, startGuard]);

  const stopWithClear = useCallback((): boolean => {
    if (!listening) return false;
    stop();
    clearNotice();
    return true;
  }, [clearNotice, listening, stop]);

  const handleVoiceToggle = useCallback(() => {
    if (listening) {
      stopWithClear();
      return;
    }
    startWithGuard();
  }, [listening, startWithGuard, stopWithClear]);

  useLayoutEffect(() => {
    onListeningChange?.(listening);
  }, [listening, onListeningChange]);

  useEffect(() => {
    if (listening && exclusiveStopRequested) {
      stopForExclusiveRef.current();
    }
  }, [exclusiveStopRequested, listening, stopForExclusiveRef]);

  useEffect(() => {
    clearNotice();
    stopRef.current();
  }, [mapId, clearNotice, stopRef]);

  useEffect(() => () => {
    stopRef.current();
    clearNotice();
  }, [clearNotice, stopRef]);

  return {
    listening,
    interimTranscript,
    voiceNotice,
    voiceStartDisabledReason,
    canVoiceInputStart,
    canVoiceInputStop,
    handleVoiceToggle,
    startVoiceFromPalette: startWithGuard,
    stopVoiceFromPalette: stopWithClear,
  };
}