"use client";

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { MapHistoryGroupLease } from "@/domain/history/mapHistory";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import { getNodeNotePreviewDelay } from "@/hooks/nodeNotePreviewDelay";

// 待ち時間の規則（定数と計算）は nodeNotePreviewDelay.ts が持つ
// IME変換中のkeydownは、isComposingが立たないブラウザでもkeyCode 229になる
const IME_PROCESS_KEY_CODE = 229;

export type UseNodeNoteEditingOptions = {
  nodeId: number;
  note: string | undefined;
  // useNodes.previewNodeNote。グループ中は履歴に積まず、グループ外では1操作として確定する
  previewNote: (id: number, note: string) => boolean;
  // useNodes.beginMoveHistory
  beginGroup: () => MapHistoryGroupLease;
};

export type NodeNoteEditing = {
  value: string;
  length: number;
  isAtLimit: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
};

// 詳細メモのテキスト欄の下書き・途中反映・確定を受け持つ。フォーカスで履歴グループを始め、入力が止まるたびに
// グループの中で反映し、blur で残りを反映してグループを閉じる（実変更があるときだけ1回の履歴になる）。
// 対象の ID と documentRevision が変わったら、呼び出し側（NodeNoteEditor の key）が作り直す
export function useNodeNoteEditing({ nodeId, note, previewNote, beginGroup }: UseNodeNoteEditingOptions): NodeNoteEditing {
  const [draft, setDraft] = useState<string | null>(null);
  // 同じイベントの中の連続操作でも最新を読むため、下書きは ref を正として state へ同じ値を渡す
  const draftRef = useRef<string | null>(null);
  const leaseRef = useRef<MapHistoryGroupLease | null>(null);
  // フォーカスを入れた時点のメモ（Escape で戻す先）
  const baseNoteRef = useRef("");
  const timerRef = useRef<number | null>(null);
  // 未反映の入力が始まった時刻（直前の反映・フォーカスの後の最初の入力）。反映したら null に戻す
  const pendingSinceRef = useRef<number | null>(null);
  const composingRef = useRef(false);
  // タイマーとアンマウントの反映が、最新の ID と更新関数を使うように、コミット後の値を同期する
  const latestRef = useRef({ nodeId, previewNote });
  useLayoutEffect(() => {
    latestRef.current = { nodeId, previewNote };
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const replaceDraft = useCallback((next: string | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  // 下書きがあればマップへ反映する。履歴に積むかは previewNote（グループの有無）が決める
  const flush = useCallback(() => {
    clearTimer();
    pendingSinceRef.current = null;
    const pending = draftRef.current;
    if (pending === null) return;
    latestRef.current.previewNote(latestRef.current.nodeId, pending);
  }, [clearTimer]);

  const schedule = useCallback(() => {
    clearTimer();
    const now = Date.now();
    if (pendingSinceRef.current === null) pendingSinceRef.current = now;
    const delay = getNodeNotePreviewDelay(pendingSinceRef.current, now);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flush();
    }, delay);
  }, [clearTimer, flush]);

  const finishGroup = useCallback(() => {
    const lease = leaseRef.current;
    leaseRef.current = null;
    lease?.finish();
  }, []);

  const onFocus = useCallback(() => {
    leaseRef.current = beginGroup();
    baseNoteRef.current = note ?? "";
    pendingSinceRef.current = null;
  }, [beginGroup, note]);

  const onChange = useCallback((value: string) => {
    replaceDraft(value);
    // 変換中は途中反映のタイマーを張らない（変換前の文字をマップへ入れない。L-474）。変換の確定で張る
    if (!composingRef.current) schedule();
  }, [replaceDraft, schedule]);

  const onBlur = useCallback(() => {
    flush();
    finishGroup();
    composingRef.current = false;
    replaceDraft(null);
  }, [flush, finishGroup, replaceDraft]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Escape") return;
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === IME_PROCESS_KEY_CODE) return;
    clearTimer();
    pendingSinceRef.current = null;
    latestRef.current.previewNote(latestRef.current.nodeId, baseNoteRef.current);
    finishGroup();
    // 下書きを先に消すので、続く blur では何も反映しない（L-473）
    replaceDraft(null);
    event.currentTarget.blur();
  }, [clearTimer, finishGroup, replaceDraft]);

  const onCompositionStart = useCallback(() => {
    composingRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const onCompositionEnd = useCallback(() => {
    composingRef.current = false;
    schedule();
  }, [schedule]);

  // blur を起こさずに外れる（キャンバスでの選択の変更）ときも、有効なグループの下書きを反映してから閉じる。
  // 文書の入れ替え（reset）ではグループが失効しているので、古い下書きを新しい文書へ書かない（L-588）
  useLayoutEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // 外れた後に blur が届いても（ブラウザによっては届く）、古い下書きを書かないよう、先に下書きを消費する（L-473・L-588）
    const pending = draftRef.current;
    draftRef.current = null;
    pendingSinceRef.current = null;
    composingRef.current = false;
    const lease = leaseRef.current;
    leaseRef.current = null;
    if (lease === null) return;
    if (lease.isActive() && pending !== null) {
      latestRef.current.previewNote(latestRef.current.nodeId, pending);
    }
    lease.finish();
  }, []);

  const value = draft ?? note ?? "";
  return {
    value,
    length: value.length,
    isAtLimit: value.length >= NODE_NOTE_MAX_LENGTH,
    onFocus,
    onChange,
    onBlur,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
  };
}
