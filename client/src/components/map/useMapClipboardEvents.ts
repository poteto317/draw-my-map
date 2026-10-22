"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { isEditableTarget } from "@/components/map/editableTarget";
import {
  MAX_SUBTREE_CLIPBOARD_LENGTH,
  MAX_SUBTREE_CLIPBOARD_NODES,
  decodeSubtreeClipboard,
  type SubtreeClipboardData,
  type SubtreeClipboardResult,
} from "@/domain/clipboard/subtreeClipboardCodec";
import type { OperationNotice } from "@/types/operationNotice";

type MapClipboardEventOptions = {
  selectedNodeId: number | null;
  isEditing: boolean;
  hasActiveGesture: () => boolean;
  copySubtree: (sourceId: number) => SubtreeClipboardResult<string>;
  pasteSubtree: (data: SubtreeClipboardData) => number | null;
  publishNotice: (notice: OperationNotice) => void;
  // false の間（ダイアログ表示中など）は何もせず、既定動作も止めない
  enabled: boolean;
};

const CLIPBOARD_FORMAT = "text/plain";

const COPY_SUCCESS: OperationNotice = { kind: "status", message: "枝をコピーしました。" };
const PASTE_SUCCESS: OperationNotice = {
  kind: "status",
  message: "枝を貼り付けました。Fキーで選択ノードへ移動できます。見えない場合は表示を『すべて』に切り替えてください。",
};
const COPY_FAILURE: OperationNotice = { kind: "error", message: "枝をコピーできませんでした。" };
const PASTE_INVALID: OperationNotice = { kind: "error", message: "貼り付ける枝データが無効です。" };
// 上限の数値はcodecの定数から作る。上限を変えたときに文言だけが古いまま残らないようにする
const formatLimit = (value: number) => value.toLocaleString("en-US");
const TOO_LARGE: OperationNotice = {
  kind: "error",
  message: `枝データが大きすぎます（${formatLimit(MAX_SUBTREE_CLIPBOARD_NODES)}ノード・${formatLimit(MAX_SUBTREE_CLIPBOARD_LENGTH)}文字以内）。`,
};
const PASTE_FAILURE: OperationNotice = { kind: "error", message: "枝を貼り付けできませんでした。" };

// 文字入力・文字選択・ラベル編集・ジェスチャー中、または他で処理済みのイベントはブラウザに任せる
function isLeftToBrowser(event: ClipboardEvent, options: MapClipboardEventOptions): boolean {
  return event.defaultPrevented
    || isEditableTarget(event.target)
    || isEditableTarget(document.activeElement)
    || window.getSelection()?.isCollapsed === false
    || options.isEditing
    || options.hasActiveGesture();
}

// 失敗時は既定動作を止めない。setData無しで止めると、直前のクリップボードの内容を空で上書きしうるため
function copySelectedSubtree(event: ClipboardEvent, options: MapClipboardEventOptions): OperationNotice | null {
  if (options.selectedNodeId === null) return null;

  const encoded = options.copySubtree(options.selectedNodeId);
  if (!encoded.ok) return encoded.reason === "too-large" ? TOO_LARGE : COPY_FAILURE;

  const clipboardData = event.clipboardData;
  if (!clipboardData) return COPY_FAILURE;
  try {
    clipboardData.setData(CLIPBOARD_FORMAT, encoded.value);
  } catch {
    return COPY_FAILURE;
  }
  event.preventDefault();
  return COPY_SUCCESS;
}

// 対象のpasteは結果にかかわらず既定動作を止め、検証済みの枝だけを1回挿入する
function pasteClipboardSubtree(event: ClipboardEvent, options: MapClipboardEventOptions): OperationNotice {
  event.preventDefault();

  const clipboardData = event.clipboardData;
  if (!clipboardData) return PASTE_FAILURE;
  let text: string;
  try {
    text = clipboardData.getData(CLIPBOARD_FORMAT);
  } catch {
    return PASTE_FAILURE;
  }

  const decoded = decodeSubtreeClipboard(text);
  if (!decoded.ok) return decoded.reason === "too-large" ? TOO_LARGE : PASTE_INVALID;
  return options.pasteSubtree(decoded.value) === null ? PASTE_FAILURE : PASTE_SUCCESS;
}

// ブラウザが発火するcopy/pasteで、選択ノードの枝をコピーし、クリップボードの枝を新しいルートとして貼り付ける。
// 登録は1回で、イベント時点の最新の選択・状態・関数を使う
export function useMapClipboardEvents({
  selectedNodeId,
  isEditing,
  hasActiveGesture,
  copySubtree,
  pasteSubtree,
  publishNotice,
  enabled,
}: MapClipboardEventOptions): void {
  const latestOptionsRef = useRef<MapClipboardEventOptions>({
    selectedNodeId,
    isEditing,
    hasActiveGesture,
    copySubtree,
    pasteSubtree,
    publishNotice,
    enabled,
  });
  useLayoutEffect(() => {
    latestOptionsRef.current = {
      selectedNodeId,
      isEditing,
      hasActiveGesture,
      copySubtree,
      pasteSubtree,
      publishNotice,
      enabled,
    };
  }, [selectedNodeId, isEditing, hasActiveGesture, copySubtree, pasteSubtree, publishNotice, enabled]);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      const options = latestOptionsRef.current;
      if (!options.enabled) return;
      if (isLeftToBrowser(event, options)) return;
      const notice = copySelectedSubtree(event, options);
      if (notice !== null) options.publishNotice(notice);
    };
    const handlePaste = (event: ClipboardEvent) => {
      const options = latestOptionsRef.current;
      if (!options.enabled) return;
      if (isLeftToBrowser(event, options)) return;
      options.publishNotice(pasteClipboardSubtree(event, options));
    };

    window.addEventListener("copy", handleCopy);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("copy", handleCopy);
      window.removeEventListener("paste", handlePaste);
    };
  }, []);
}
