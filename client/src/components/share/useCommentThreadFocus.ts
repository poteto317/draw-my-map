"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * 描画後に移すフォーカスの要求。thread は候補の見出しを順に試し、どれも無ければ一覧の見出しへ。
 * element は失敗時に押した元のボタンへ戻す要求で、busy で無効な間は保留する
 */
export type CommentThreadFocusRequest =
  | { readonly kind: "thread"; readonly candidates: readonly string[] }
  | { readonly kind: "delete-button"; readonly commentId: string }
  | { readonly kind: "element"; readonly element: HTMLButtonElement };

export type UseCommentThreadFocusOptions = {
  /** 呼び出し元の書込み中フラグ。解けた描画で保留中の element 要求を処理する */
  busy: boolean;
  /** フォーカスの最後の戻り先（一覧の見出し） */
  listHeadingRef: RefObject<HTMLElement | null>;
};

export type CommentThreadFocus = {
  /** スレッド見出しの callback ref */
  registerHeading: (threadId: string) => (element: HTMLElement | null) => void;
  /** 削除ボタンの callback ref */
  registerDeleteButton: (commentId: string) => (element: HTMLButtonElement | null) => void;
  /** 次の描画の後にフォーカスを移す（一覧の差し替え後に移すため。L-397） */
  requestFocus: (request: CommentThreadFocusRequest) => void;
};

function registerIn<K, E>(elements: Map<K, E>, key: K) {
  return (element: E | null) => {
    if (element) elements.set(key, element);
    else elements.delete(key);
  };
}

/** コメントスレッド一覧の操作後のフォーカス移動（ShareCommentThreadList 用） */
export function useCommentThreadFocus({
  busy,
  listHeadingRef,
}: UseCommentThreadFocusOptions): CommentThreadFocus {
  const headingElementsRef = useRef(new Map<string, HTMLElement>());
  const deleteButtonElementsRef = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = useRef<CommentThreadFocusRequest | null>(null);
  const [focusRequestSequence, setFocusRequestSequence] = useState(0);

  useLayoutEffect(() => {
    const request = pendingFocusRef.current;
    if (request === null) return;
    if (request.kind === "element") {
      // 呼び出し元の busy が解けてボタンが有効に戻った描画で戻す
      if (request.element.disabled) return;
      pendingFocusRef.current = null;
      if (request.element.isConnected) request.element.focus();
      return;
    }
    pendingFocusRef.current = null;
    if (request.kind === "delete-button") {
      deleteButtonElementsRef.current.get(request.commentId)?.focus();
      return;
    }
    for (const threadId of request.candidates) {
      const heading = headingElementsRef.current.get(threadId);
      // 折りたたまれた「解決済み」の中の見出しはフォーカスできないため飛ばす
      if (heading && !heading.closest("details:not([open])")) {
        heading.focus();
        return;
      }
    }
    listHeadingRef.current?.focus();
  }, [busy, focusRequestSequence, listHeadingRef]);

  const registerHeading = useCallback(
    (threadId: string) => registerIn(headingElementsRef.current, threadId),
    [],
  );
  const registerDeleteButton = useCallback(
    (commentId: string) => registerIn(deleteButtonElementsRef.current, commentId),
    [],
  );
  const requestFocus = useCallback((request: CommentThreadFocusRequest) => {
    pendingFocusRef.current = request;
    setFocusRequestSequence((value) => value + 1);
  }, []);

  return { registerHeading, registerDeleteButton, requestFocus };
}
