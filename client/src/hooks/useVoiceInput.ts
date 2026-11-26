"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { InsertForestResult } from "@/hooks/useNodes";
import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";
import { normalizeVoiceTranscript } from "@/domain/voice/normalizeVoiceTranscript";
import {
  createSpeechRecognitionAdapter,
  type CreateSpeechRecognitionAdapterOptions,
  type SpeechRecognitionAdapter,
} from "@/domain/voice/speechRecognitionAdapter";

export type VoiceInsertForest = (
  items: readonly ForestItem[],
  target: { kind: "child"; parentId: number } | { kind: "root" },
) => InsertForestResult;

export type UseVoiceInputOptions = {
  readonly selectedNodeId: number | null;
  readonly selectedNodeIds: readonly number[];
  readonly insertForest: VoiceInsertForest;
  readonly selectNode: (id: number | null) => void;
  readonly onInsertSuccess?: (rootId: number) => void;
  readonly onRecognitionError?: (message: string) => void;
  readonly onStoppedExclusive?: () => void;
  readonly adapterOptions?: CreateSpeechRecognitionAdapterOptions;
};

export type UseVoiceInputReturn = {
  readonly listening: boolean;
  readonly interimTranscript: string;
  readonly speechSupported: boolean;
  readonly suppressedAfterFailure: boolean;
  start: () => boolean;
  stop: () => void;
  toggle: () => void;
  stopForExclusive: () => void;
  clearInterim: () => void;
  resetAfterFailure: () => void;
};

export function useVoiceInput({
  selectedNodeId,
  selectedNodeIds,
  insertForest,
  selectNode,
  onInsertSuccess,
  onRecognitionError,
  onStoppedExclusive,
  adapterOptions,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [suppressedAfterFailure, setSuppressedAfterFailure] = useState(false);
  const suppressedAfterFailureRef = useRef(false);
  const adapterRef = useRef<SpeechRecognitionAdapter | null>(null);
  const listeningRef = useRef(false);
  const pendingRestartRef = useRef(false);
  const exclusiveStopRef = useRef(false);

  const [speechSupported] = useState(() => {
    const probe = createSpeechRecognitionAdapter({
      onInterim: () => {},
      onFinal: () => {},
      onError: () => {},
      onEnd: () => {},
    }, adapterOptions);
    const supported = probe !== null;
    probe?.dispose();
    return supported;
  });

  const disposeAdapter = useCallback(() => {
    adapterRef.current?.dispose();
    adapterRef.current = null;
  }, []);

  const insertFromTranscript = useCallback((raw: string) => {
    const label = normalizeVoiceTranscript(raw);
    if (label === null) return;
    const target = selectedNodeIds.length === 1 && selectedNodeId !== null
      ? { kind: "child" as const, parentId: selectedNodeId }
      : { kind: "root" as const };
    const result = insertForest([{ label, parentIndex: null }], target);
    if (!result.ok) {
      suppressedAfterFailureRef.current = true;
      setSuppressedAfterFailure(true);
      return;
    }
    suppressedAfterFailureRef.current = false;
    setSuppressedAfterFailure(false);
    selectNode(result.rootId);
    onInsertSuccess?.(result.rootId);
  }, [insertForest, onInsertSuccess, selectNode, selectedNodeId, selectedNodeIds.length]);

  const insertFromTranscriptRef = useLatestRef(insertFromTranscript);

  const ensureAdapter = useCallback(() => {
    if (adapterRef.current !== null) return adapterRef.current;
    const adapter = createSpeechRecognitionAdapter({
      onInterim: (text) => {
        setInterimTranscript(text);
      },
      onFinal: (text) => {
        setInterimTranscript("");
        if (!listeningRef.current || exclusiveStopRef.current) return;
        insertFromTranscriptRef.current(text);
      },
      onError: (code) => {
        setListening(false);
        listeningRef.current = false;
        setInterimTranscript("");
        disposeAdapter();
        if (code !== "aborted") {
          onRecognitionError?.(code);
        }
      },
      onEnd: () => {
        if (!listeningRef.current || exclusiveStopRef.current) return;
        if (suppressedAfterFailureRef.current) return;
        if (pendingRestartRef.current) return;
        pendingRestartRef.current = true;
        try {
          adapterRef.current?.start();
        } finally {
          pendingRestartRef.current = false;
        }
      },
    }, adapterOptions);
    adapterRef.current = adapter;
    return adapter;
  }, [adapterOptions, disposeAdapter, insertFromTranscriptRef, onRecognitionError]);

  const stopInternal = useCallback((exclusive: boolean) => {
    exclusiveStopRef.current = exclusive;
    listeningRef.current = false;
    setListening(false);
    setInterimTranscript("");
    adapterRef.current?.stop();
    disposeAdapter();
    if (exclusive) onStoppedExclusive?.();
  }, [disposeAdapter, onStoppedExclusive]);

  const start = useCallback((): boolean => {
    if (listeningRef.current) return false;
    if (!speechSupported) return false;
    const adapter = ensureAdapter();
    if (adapter === null) return false;
    exclusiveStopRef.current = false;
    suppressedAfterFailureRef.current = false;
    setSuppressedAfterFailure(false);
    listeningRef.current = true;
    setListening(true);
    adapter.start();
    return true;
  }, [ensureAdapter, speechSupported]);

  const stop = useCallback(() => {
    stopInternal(false);
  }, [stopInternal]);

  const stopForExclusive = useCallback(() => {
    if (!listeningRef.current) return;
    stopInternal(true);
  }, [stopInternal]);

  const toggle = useCallback(() => {
    if (listeningRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => () => {
    disposeAdapter();
    listeningRef.current = false;
  }, [disposeAdapter]);

  return {
    listening,
    interimTranscript,
    speechSupported,
    suppressedAfterFailure,
    start,
    stop,
    toggle,
    stopForExclusive,
    clearInterim: () => setInterimTranscript(""),
    resetAfterFailure: () => {
      suppressedAfterFailureRef.current = false;
      setSuppressedAfterFailure(false);
    },
  };
}