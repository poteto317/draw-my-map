import { useCallback, useEffect, useRef, useState } from "react";
import { validateIllustrationLabel } from "@/domain/illustration/illustrationPrompt";
import {
  IllustrationRequestError,
  describeIllustrationError,
  requestIllustration,
} from "@/services/illustration/illustrationClient";
import {
  IllustrationThumbnailError,
  createIllustrationThumbnail,
} from "@/services/illustration/illustrationThumbnail";
import type { Node } from "@/types/node";

export type IllustrationGenerationState =
  | { status: "idle" }
  | { status: "generating"; nodeId: number }
  | { status: "succeeded"; nodeId: number; dataUrl: string }
  | { status: "failed"; nodeId: number; message: string };

// 状態を保存した時点の resetRevision を添えて持つ（マップ置き換え後の古い状態を見分けるため）
type StoredGeneration = { state: IllustrationGenerationState; revision: number };

const IDLE: IllustrationGenerationState = { status: "idle" };

// イラスト生成の入口。生成は同時に1件までで、生成中の再要求は無視する。
// resetRevision が変わる（マップが置き換わる）と、状態を破棄して進行中の生成を中断する。
export function useIllustrationGeneration(nodes: readonly Node[], resetRevision: number) {
  const [stored, setStored] = useState<StoredGeneration>({ state: IDLE, revision: resetRevision });
  const controllerRef = useRef<AbortController | null>(null);

  // 保存時の revision が現在と違う状態は古いので、描画時に idle として扱う
  const generation = stored.revision === resetRevision ? stored.state : IDLE;

  const setGeneration = useCallback((state: IllustrationGenerationState) => {
    setStored({ state, revision: resetRevision });
  }, [resetRevision]);

  // アンマウント時は、進行中のリクエストを中断する
  useEffect(() => () => controllerRef.current?.abort(), []);

  // マップの置き換え時は、進行中のリクエストを中断して、生成中のロックを解く（初回マウントでは何もしない）
  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, [resetRevision]);

  const generateIllustration = useCallback((nodeId: number) => {
    if (controllerRef.current !== null) return;
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) return;

    const validation = validateIllustrationLabel(node.label);
    if (!validation.ok) {
      setGeneration({ status: "failed", nodeId, message: describeIllustrationError("invalid-label") });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setGeneration({ status: "generating", nodeId });

    requestIllustration(validation.label, { signal: controller.signal })
      .then((image) => createIllustrationThumbnail(image.dataUrl))
      .then((dataUrl) => {
        if (controller.signal.aborted) return;
        setGeneration({ status: "succeeded", nodeId, dataUrl });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof IllustrationRequestError
          ? error.kind
          : error instanceof IllustrationThumbnailError
            ? "image-processing"
            : "upstream-error";
        setGeneration({ status: "failed", nodeId, message: describeIllustrationError(kind) });
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
  }, [nodes, setGeneration]);

  const dismissGeneration = useCallback(() => setGeneration(IDLE), [setGeneration]);

  return { generation, generateIllustration, dismissGeneration };
}
