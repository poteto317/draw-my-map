import { useLayoutEffect, useRef } from "react";

type UseDocumentRestoreInteractionResetOptions = {
  documentRevision: number;
  cancelEditing: () => void;
  cancelActiveGesture: () => void;
  closeContextMenu: () => void;
};

// Undo／Redo・マップ置換でdocumentRevisionが進んだら、復元前の状態に基づく編集・ジェスチャー・メニューを閉じる。
// viewportは維持する（読み込み時の初期化はuseMapStageResetが担う）。
// callback参照の変更だけでは閉じないよう、revisionの変化だけを検出する。
export function useDocumentRestoreInteractionReset({
  documentRevision,
  cancelEditing,
  cancelActiveGesture,
  closeContextMenu,
}: UseDocumentRestoreInteractionResetOptions): void {
  const callbacksRef = useRef({ cancelEditing, cancelActiveGesture, closeContextMenu });
  useLayoutEffect(() => {
    callbacksRef.current = { cancelEditing, cancelActiveGesture, closeContextMenu };
  }, [cancelEditing, cancelActiveGesture, closeContextMenu]);

  const handledRevisionRef = useRef(documentRevision);
  useLayoutEffect(() => {
    if (handledRevisionRef.current === documentRevision) return;
    handledRevisionRef.current = documentRevision;
    const callbacks = callbacksRef.current;
    callbacks.cancelEditing();
    callbacks.cancelActiveGesture();
    callbacks.closeContextMenu();
  }, [documentRevision]);
}
