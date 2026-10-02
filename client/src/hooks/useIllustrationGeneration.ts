import { useCallback, useEffect, useRef, useState } from "react";
import { validateIllustrationLabel } from "@/domain/illustration/illustrationPrompt";
import {
  IllustrationRequestError,
  describeIllustrationError,
  requestIllustration,
} from "@/services/illustration/illustrationClient";
import type { Node } from "@/types/node";

export type IllustrationGenerationState =
  | { status: "idle" }
  | { status: "generating"; nodeId: number }
  | { status: "succeeded"; nodeId: number; dataUrl: string }
  | { status: "failed"; nodeId: number; message: string };

// イラスト生成の入口。生成は同時に1件までで、生成中の再要求は無視する。
export function useIllustrationGeneration(nodes: readonly Node[]) {
  const [generation, setGeneration] = useState<IllustrationGenerationState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  // アンマウント時は、進行中のリクエストを中断する
  useEffect(() => () => controllerRef.current?.abort(), []);

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
      .then((image) => {
        if (controller.signal.aborted) return;
        setGeneration({ status: "succeeded", nodeId, dataUrl: image.dataUrl });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof IllustrationRequestError ? error.kind : "upstream-error";
        setGeneration({ status: "failed", nodeId, message: describeIllustrationError(kind) });
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
  }, [nodes]);

  return { generation, generateIllustration };
}
