import { useCallback, useEffect, useRef, useState } from "react";
import { validateIllustrationLabel } from "@/domain/illustration/illustrationPrompt";
import { describeIllustrationError } from "@/services/illustration/illustrationClient";
import {
  generateIllustrationThumbnail,
  toIllustrationErrorKind,
} from "@/services/illustration/illustrationGeneration";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { Node } from "@/types/node";

// 状態を保存した時点の documentRevision を添えて持つ（マップの置き換え・Undo/Redo による復元の後に、古い状態を見分けるため）
type StoredGeneration = { state: IllustrationGenerationState; revision: number };

const IDLE: IllustrationGenerationState = { status: "idle" };

// イラスト生成の入口。生成は同時に1件までで、生成中の再要求は無視する。
// documentRevision が変わる（マップの置き換え・Undo/Redo による復元が起きる）と、状態を破棄して進行中の生成を中断する。
export function useIllustrationGeneration(nodes: readonly Node[], documentRevision: number) {
  const [stored, setStored] = useState<StoredGeneration>({ state: IDLE, revision: documentRevision });
  const controllerRef = useRef<AbortController | null>(null);

  // 保存時の revision が現在と違う状態は古いので、描画時に idle として扱う
  const generation = stored.revision === documentRevision ? stored.state : IDLE;

  const setGeneration = useCallback((state: IllustrationGenerationState) => {
    setStored({ state, revision: documentRevision });
  }, [documentRevision]);

  // アンマウント時は、進行中のリクエストを中断する
  useEffect(() => () => controllerRef.current?.abort(), []);

  // マップの置き換え・Undo/Redo による復元の時は、進行中のリクエストを中断して、生成中のロックを解く（初回マウントでは何もしない）
  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, [documentRevision]);

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
    setGeneration({ status: "generating", nodeId, label: node.label });

    generateIllustrationThumbnail(validation.label, { signal: controller.signal })
      .then((dataUrl) => {
        if (controller.signal.aborted) return;
        setGeneration({ status: "succeeded", nodeId, label: node.label, dataUrl });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setGeneration({
          status: "failed",
          nodeId,
          message: describeIllustrationError(toIllustrationErrorKind(error)),
        });
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
  }, [nodes, setGeneration]);

  const dismissGeneration = useCallback(() => setGeneration(IDLE), [setGeneration]);

  return { generation, generateIllustration, dismissGeneration };
}
