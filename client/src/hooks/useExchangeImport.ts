"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ForestInsertionTarget,
  ForestItem,
} from "@/domain/nodes/nodeForestInsertion";
import {
  formatExchangeDecodeError,
  formatExchangeImportSuccess,
  formatExchangeInsertFailure,
} from "@/domain/exchange/exchangeMessages";
import { isExchangeTextTooLong } from "@/domain/exchange/exchangeLimits";
import { buildExchangePreview } from "@/domain/exchange/exchangePreview";
import {
  defaultDelimiterFromFileName,
  type ExchangeFormatEntry,
  type ParsedExchange,
  type ParseExchangeResult,
  parseExchangeContent,
} from "@/domain/exchange/parseExchangeContent";
import { OUTLINE_TOO_LONG_MESSAGE } from "@/domain/outline/outlineMessages";
import { resolveForestImportInsertionTarget } from "@/domain/nodes/resolveForestImportInsertionTarget";
import type { InsertForestResult } from "@/hooks/useNodes";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { OperationNotice } from "@/types/operationNotice";
import type { OutlineImportTarget } from "@/domain/nodes/resolveForestImportInsertionTarget";
import type { OutlinePreview } from "@/domain/outline/outlinePreview";

export type ExchangeImportScreen = "closed" | "input" | "preview";
export type ExchangeInputError = { sequence: number; message: string | null };
export type ExchangeDialogNotices = {
  sequence: number;
  status: string | null;
  alert: string | null;
};
export type ExchangeImportFocusRequest = "input" | "preview" | "header";

export type UseExchangeImportOptions = {
  selectedNodeId: number | null;
  documentRevision: number;
  insertForest: (
    items: readonly ForestItem[],
    target: ForestInsertionTarget,
  ) => InsertForestResult;
  expandNodes: (nodeIds: readonly number[]) => void;
};

export type UseExchangeImportReturn = {
  screen: ExchangeImportScreen;
  entry: ExchangeFormatEntry | null;
  fileName: string | null;
  fileText: string;
  delimiter: "," | "\t";
  inputError: ExchangeInputError;
  parsed: ParsedExchange | null;
  preview: OutlinePreview | null;
  parentCandidateId: number | null;
  parentCandidateStale: boolean;
  target: OutlineImportTarget;
  dialogNotices: ExchangeDialogNotices;
  focusRequest: ExchangeImportFocusRequest | null;
  lastEntry: ExchangeFormatEntry | null;
  notice: OperationNotice | null;
  open: (entry: ExchangeFormatEntry) => void;
  close: () => void;
  setFile: (fileName: string, text: string) => void;
  setDelimiter: (delimiter: "," | "\t") => void;
  requestPreview: () => void;
  back: () => void;
  setTarget: (target: OutlineImportTarget) => void;
  submit: () => void;
  consumeFocusRequest: () => void;
  reportInputError: (message: string) => void;
};

type ImportState = {
  screen: ExchangeImportScreen;
  entry: ExchangeFormatEntry | null;
  fileName: string | null;
  fileText: string;
  delimiter: "," | "\t";
  inputError: ExchangeInputError;
  parsed: ParsedExchange | null;
  parentCandidateId: number | null;
  openedRevision: number;
  target: OutlineImportTarget;
  dialogNotices: ExchangeDialogNotices;
  focusRequest: ExchangeImportFocusRequest | null;
  lastEntry: ExchangeFormatEntry | null;
};

const INITIAL_STATE: ImportState = {
  screen: "closed",
  entry: null,
  fileName: null,
  fileText: "",
  delimiter: ",",
  inputError: { sequence: 0, message: null },
  parsed: null,
  parentCandidateId: null,
  openedRevision: 0,
  target: "root",
  dialogNotices: { sequence: 0, status: null, alert: null },
  focusRequest: null,
  lastEntry: null,
};

function changeInputError(state: ImportState, message: string | null): ExchangeInputError {
  return state.inputError.message === message
    ? state.inputError
    : { sequence: state.inputError.sequence + 1, message };
}

function showInputError(state: ImportState, message: string): ExchangeInputError {
  return { sequence: state.inputError.sequence + 1, message };
}

function clearDialogNotices(state: ImportState): ExchangeDialogNotices {
  return { sequence: state.dialogNotices.sequence + 1, status: null, alert: null };
}

function openDialog(
  state: ImportState,
  entry: ExchangeFormatEntry,
  parentCandidateId: number | null,
  openedRevision: number,
): ImportState {
  return {
    ...state,
    screen: "input",
    entry,
    lastEntry: entry,
    parentCandidateId,
    openedRevision,
    target: "root",
    parsed: null,
    fileName: null,
    fileText: "",
    delimiter: ",",
    dialogNotices: clearDialogNotices(state),
    inputError: changeInputError(state, null),
    focusRequest: "input",
  };
}

function closeDialog(state: ImportState): ImportState {
  return {
    ...state,
    screen: "closed",
    entry: null,
    parsed: null,
    dialogNotices: clearDialogNotices(state),
    focusRequest: "header",
  };
}

function closeAfterSuccess(state: ImportState): ImportState {
  return {
    ...closeDialog(state),
    fileName: null,
    fileText: "",
  };
}

function showInsertFailure(state: ImportState, message: string): ImportState {
  return {
    ...state,
    dialogNotices: { sequence: state.dialogNotices.sequence + 1, status: null, alert: message },
  };
}

function backToInput(state: ImportState): ImportState {
  return {
    ...state,
    screen: "input",
    parsed: null,
    dialogNotices: clearDialogNotices(state),
    focusRequest: "input",
  };
}

function applyExchangeParseResult(state: ImportState, result: ParseExchangeResult): ImportState {
  if (!result.ok) {
    return { ...state, inputError: showInputError(state, formatExchangeDecodeError(result.reason)) };
  }
  return {
    ...state,
    screen: "preview",
    parsed: result.parsed,
    inputError: changeInputError(state, null),
    focusRequest: "preview",
  };
}

export function useExchangeImport(options: UseExchangeImportOptions): UseExchangeImportReturn {
  const { selectedNodeId, documentRevision, insertForest, expandNodes } = options;
  const [state, setState] = useState<ImportState>(INITIAL_STATE);
  const { notice, publishNotice } = useRevisionScopedNotice(documentRevision);

  const stateRef = useRef(state);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const documentRevisionRef = useRef(documentRevision);
  const insertForestRef = useRef(insertForest);
  const expandNodesRef = useRef(expandNodes);
  const publishNoticeRef = useRef(publishNotice);

  useLayoutEffect(() => {
    stateRef.current = state;
    selectedNodeIdRef.current = selectedNodeId;
    documentRevisionRef.current = documentRevision;
    insertForestRef.current = insertForest;
    expandNodesRef.current = expandNodes;
    publishNoticeRef.current = publishNotice;
  }, [state, selectedNodeId, documentRevision, insertForest, expandNodes, publishNotice]);

  const open = useCallback((entry: ExchangeFormatEntry) => {
    const parentCandidateId = selectedNodeIdRef.current;
    const openedRevision = documentRevisionRef.current;
    setState((prev) => openDialog(prev, entry, parentCandidateId, openedRevision));
  }, []);

  const close = useCallback(() => {
    setState(closeDialog);
  }, []);

  const setFile = useCallback((fileName: string, text: string) => {
    setState((prev) => {
      const delimiter = prev.entry === "csv-tsv"
        ? defaultDelimiterFromFileName(fileName)
        : prev.delimiter;
      const message = isExchangeTextTooLong(text) ? OUTLINE_TOO_LONG_MESSAGE : null;
      return {
        ...prev,
        fileName,
        fileText: text,
        delimiter,
        inputError: changeInputError(prev, message),
      };
    });
  }, []);

  const setDelimiter = useCallback((delimiter: "," | "\t") => {
    setState((prev) => (prev.delimiter === delimiter ? prev : { ...prev, delimiter }));
  }, []);

  const requestPreview = useCallback(() => {
    const current = stateRef.current;
    if (current.screen !== "input" || current.entry === null) return;
    if (current.fileText.trim() === "") {
      const message = formatExchangeDecodeError("empty");
      setState((prev) => ({ ...prev, inputError: showInputError(prev, message) }));
      return;
    }
    if (isExchangeTextTooLong(current.fileText)) {
      setState((prev) => ({ ...prev, inputError: showInputError(prev, OUTLINE_TOO_LONG_MESSAGE) }));
      return;
    }
    const result = parseExchangeContent(current.fileText, current.entry, current.delimiter);
    setState((prev) => applyExchangeParseResult(prev, result));
  }, []);

  const back = useCallback(() => {
    setState(backToInput);
  }, []);

  const setTarget = useCallback((target: OutlineImportTarget) => {
    setState((prev) => (prev.target === target ? prev : { ...prev, target }));
  }, []);

  const submit = useCallback(() => {
    const current = stateRef.current;
    if (current.screen !== "preview" || current.parsed === null) return;

    const resolved = resolveForestImportInsertionTarget({
      placement: current.target,
      parentCandidateId: current.parentCandidateId,
      parentCandidateStale: documentRevisionRef.current !== current.openedRevision,
    });
    if (!resolved.ok) {
      const message = formatExchangeInsertFailure(resolved.reason);
      setState((prev) => showInsertFailure(prev, message));
      return;
    }

    const result = insertForestRef.current(current.parsed.items, resolved.target);
    switch (result.ok) {
      case true:
        if (resolved.target.kind === "child") expandNodesRef.current([resolved.target.parentId]);
        publishNoticeRef.current({
          kind: "status",
          message: formatExchangeImportSuccess(result.count),
        });
        setState(closeAfterSuccess);
        return;
      case false: {
        const message = formatExchangeInsertFailure(result.reason);
        setState((prev) => showInsertFailure(prev, message));
        return;
      }
      default: {
        const unreachable: never = result;
        throw new Error(`Unknown insert forest result: ${JSON.stringify(unreachable)}`);
      }
    }
  }, []);

  const preview = useMemo(
    () => (state.parsed === null ? null : buildExchangePreview(state.parsed.items)),
    [state.parsed],
  );

  const consumeFocusRequest = useCallback(() => {
    setState((prev) => (prev.focusRequest === null ? prev : { ...prev, focusRequest: null }));
  }, []);

  const reportInputError = useCallback((message: string) => {
    setState((prev) => ({
      ...prev,
      fileName: null,
      fileText: "",
      inputError: showInputError(prev, message),
    }));
  }, []);

  return {
    screen: state.screen,
    entry: state.entry,
    fileName: state.fileName,
    fileText: state.fileText,
    delimiter: state.delimiter,
    inputError: state.inputError,
    parsed: state.parsed,
    preview,
    parentCandidateId: state.parentCandidateId,
    parentCandidateStale: state.screen !== "closed" && documentRevision !== state.openedRevision,
    target: state.target,
    dialogNotices: state.dialogNotices,
    focusRequest: state.focusRequest,
    lastEntry: state.lastEntry,
    notice,
    open,
    close,
    setFile,
    setDelimiter,
    requestPreview,
    back,
    setTarget,
    submit,
    consumeFocusRequest,
    reportInputError,
  };
}