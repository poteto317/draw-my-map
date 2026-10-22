"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ForestInsertionTarget,
  ForestItem,
} from "@/domain/nodes/nodeForestInsertion";
import { isOutlineTextTooLong } from "@/domain/outline/outlineLimits";
import {
  formatOutlineImportSuccess,
  formatOutlineInsertFailure,
  formatOutlineParseError,
  OUTLINE_TOO_LONG_MESSAGE,
} from "@/domain/outline/outlineMessages";
import {
  parseOutlineText,
  type OutlineParseResult,
  type ParsedOutline,
} from "@/domain/outline/outlineParser";
import {
  buildOutlinePreview,
  type OutlinePreview,
} from "@/domain/outline/outlinePreview";
import type { InsertForestResult } from "@/hooks/useNodes";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { OperationNotice } from "@/types/operationNotice";

export type OutlineImportScreen = "closed" | "input" | "preview";
export type OutlineImportTarget = "root" | "child";
export type OutlineInputError = { sequence: number; message: string | null };
export type OutlineDialogNotices = {
  sequence: number;
  status: string | null;
  alert: string | null;
};
export type OutlineImportFocusRequest = "input" | "preview" | "header";

export type UseOutlineImportOptions = {
  selectedNodeId: number | null; // open の時点の値を追加先の候補として控える
  documentRevision: number;
  insertForest: (
    items: readonly ForestItem[],
    target: ForestInsertionTarget,
  ) => InsertForestResult;
  expandNodes: (nodeIds: readonly number[]) => void;
};

export type UseOutlineImportReturn = {
  screen: OutlineImportScreen;
  text: string; // 閉じても残す。追加の成功で "" にする
  textLength: number;
  inputError: OutlineInputError;
  outline: ParsedOutline | null; // preview の画面のときだけ null でない
  preview: OutlinePreview | null;
  parentCandidateId: number | null; // 開いた時点の selectedNodeId
  parentCandidateStale: boolean; // 開いた時点の documentRevision から変わったか（変わっていれば親は無くなったものとして扱う）
  target: OutlineImportTarget;
  dialogNotices: OutlineDialogNotices;
  focusRequest: OutlineImportFocusRequest | null;
  notice: OperationNotice | null; // 操作通知バーの7系統目
  open: () => void;
  close: () => void;
  setText: (text: string) => void;
  requestPreview: () => void;
  back: () => void;
  setTarget: (target: OutlineImportTarget) => void;
  submit: () => void;
  consumeFocusRequest: () => void;
};

type ImportState = {
  screen: OutlineImportScreen;
  text: string;
  inputError: OutlineInputError;
  outline: ParsedOutline | null; // プレビューは outline から作る派生値なので持たない
  parentCandidateId: number | null;
  openedRevision: number; // open の時点の documentRevision
  target: OutlineImportTarget;
  dialogNotices: OutlineDialogNotices;
  focusRequest: OutlineImportFocusRequest | null;
};

const INITIAL_STATE: ImportState = {
  screen: "closed",
  text: "",
  inputError: { sequence: 0, message: null },
  outline: null,
  parentCandidateId: null,
  openedRevision: 0,
  target: "root",
  dialogNotices: { sequence: 0, status: null, alert: null },
  focusRequest: null,
};

// 文言が変わるときだけ sequence を進める（入力のたびに読み上げ直させない）
function changeInputError(state: ImportState, message: string | null): OutlineInputError {
  return state.inputError.message === message
    ? state.inputError
    : { sequence: state.inputError.sequence + 1, message };
}

// 同じ文言でも sequence を進め、読み上げ直させる（L-166）
function showInputError(state: ImportState, message: string): OutlineInputError {
  return { sequence: state.inputError.sequence + 1, message };
}

function clearDialogNotices(state: ImportState): OutlineDialogNotices {
  return { sequence: state.dialogNotices.sequence + 1, status: null, alert: null };
}

function openDialog(
  state: ImportState,
  parentCandidateId: number | null,
  openedRevision: number,
): ImportState {
  return {
    ...state,
    screen: "input",
    parentCandidateId,
    openedRevision,
    target: "root",
    dialogNotices: clearDialogNotices(state),
    focusRequest: "input",
  };
}

function closeDialog(state: ImportState): ImportState {
  return {
    ...state,
    screen: "closed",
    outline: null,
    dialogNotices: clearDialogNotices(state),
    focusRequest: "header",
  };
}

// 文字数の判定だけで、解析はしない（L-467）
function changeText(state: ImportState, text: string): ImportState {
  const message = isOutlineTextTooLong(text) ? OUTLINE_TOO_LONG_MESSAGE : null;
  return { ...state, text, inputError: changeInputError(state, message) };
}

// 失敗は画面とフォーカスを変えず、入力のエラーだけを出す
function applyParseResult(state: ImportState, result: OutlineParseResult): ImportState {
  switch (result.ok) {
    case true:
      return {
        ...state,
        screen: "preview",
        outline: result.outline,
        inputError: changeInputError(state, null),
        focusRequest: "preview",
      };
    case false:
      return { ...state, inputError: showInputError(state, formatOutlineParseError(result.error)) };
    default: {
      const unreachable: never = result;
      throw new Error(`Unknown outline parse result: ${JSON.stringify(unreachable)}`);
    }
  }
}

function backToInput(state: ImportState): ImportState {
  return {
    ...state,
    screen: "input",
    outline: null,
    dialogNotices: clearDialogNotices(state),
    focusRequest: "input",
  };
}

// 成功の結果は操作通知バーに出し、ダイアログ内には重ねない（L-249）
function closeAfterSuccess(state: ImportState): ImportState {
  return { ...closeDialog(state), text: "" };
}

// 画面・フォーカス・テキストを変えず、理由を alert に出す（L-001）
function showInsertFailure(state: ImportState, message: string): ImportState {
  return {
    ...state,
    dialogNotices: { sequence: state.dialogNotices.sequence + 1, status: null, alert: message },
  };
}

export function useOutlineImport(options: UseOutlineImportOptions): UseOutlineImportReturn {
  const { selectedNodeId, documentRevision, insertForest, expandNodes } = options;
  const [state, setState] = useState<ImportState>(INITIAL_STATE);
  const { notice, publishNotice } = useRevisionScopedNotice(documentRevision);

  // 操作の関数を描画ごとに変えないため、最新の値は commit の後に同期する ref から読む（L-521）
  // 同じイベントの中の直前の state の更新は、commit 前なので stateRef からは見えない
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

  // 状態の更新は関数形式にし、同じイベントの中の前の更新を消さない（L-453）
  const open = useCallback(() => {
    const parentCandidateId = selectedNodeIdRef.current;
    const openedRevision = documentRevisionRef.current;
    setState((prev) => openDialog(prev, parentCandidateId, openedRevision));
  }, []);

  const close = useCallback(() => {
    setState(closeDialog);
  }, []);

  const setText = useCallback((text: string) => {
    setState((prev) => changeText(prev, text));
  }, []);

  // 解析は updater の外で1回だけ行い、updater は結果を当てるだけにする（L-467）
  const requestPreview = useCallback(() => {
    const current = stateRef.current;
    if (current.screen !== "input") return;
    const result = parseOutlineText(current.text);
    setState((prev) => applyParseResult(prev, result));
  }, []);

  const back = useCallback(() => {
    setState(backToInput);
  }, []);

  const setTarget = useCallback((target: OutlineImportTarget) => {
    setState((prev) => (prev.target === target ? prev : { ...prev, target }));
  }, []);

  const submit = useCallback(() => {
    const current = stateRef.current;
    if (current.screen !== "preview" || current.outline === null) return;

    let target: ForestInsertionTarget;
    if (current.target === "child") {
      // マップの置き換えの後は、同じ ID のノードがあっても別のノードなので、ID の存在だけで判定しない（L-037）。
      // 黙って新しいルートへ変えず、失敗として選び直させる（L-002）
      const stale = documentRevisionRef.current !== current.openedRevision;
      if (current.parentCandidateId === null || stale) {
        const message = formatOutlineInsertFailure("parent-missing");
        setState((prev) => showInsertFailure(prev, message));
        return;
      }
      target = { kind: "child", parentId: current.parentCandidateId };
    } else {
      target = { kind: "root" };
    }

    const result = insertForestRef.current(current.outline.items, target);
    switch (result.ok) {
      case true:
        if (target.kind === "child") expandNodesRef.current([target.parentId]);
        publishNoticeRef.current({
          kind: "status",
          message: formatOutlineImportSuccess(result.count),
        });
        setState(closeAfterSuccess);
        return;
      case false: {
        const message = formatOutlineInsertFailure(result.reason);
        setState((prev) => showInsertFailure(prev, message));
        return;
      }
      default: {
        const unreachable: never = result;
        throw new Error(`Unknown insert forest result: ${JSON.stringify(unreachable)}`);
      }
    }
  }, []);

  // outline が変わったときだけ作り直す。outline と別に持たないので、片方だけが残ることは無い
  const preview = useMemo(
    () => (state.outline === null ? null : buildOutlinePreview(state.outline)),
    [state.outline],
  );

  const consumeFocusRequest = useCallback(() => {
    setState((prev) => (prev.focusRequest === null ? prev : { ...prev, focusRequest: null }));
  }, []);

  return {
    screen: state.screen,
    text: state.text,
    textLength: state.text.length,
    inputError: state.inputError,
    outline: state.outline,
    preview,
    parentCandidateId: state.parentCandidateId,
    parentCandidateStale: state.screen !== "closed" && documentRevision !== state.openedRevision,
    target: state.target,
    dialogNotices: state.dialogNotices,
    focusRequest: state.focusRequest,
    notice,
    open,
    close,
    setText,
    requestPreview,
    back,
    setTarget,
    submit,
    consumeFocusRequest,
  };
}
