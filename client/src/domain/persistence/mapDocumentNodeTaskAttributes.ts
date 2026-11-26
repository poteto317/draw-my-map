import { normalizeCustomAttributes, normalizeNodeTask, projectNodeTaskAttributes } from "@/domain/nodes/nodeTaskAttributes";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";
import type { Node } from "@/types/node";

type TaskAttributes = Pick<Node, "task" | "customAttributes">;

export function normalizeMapDocumentNodeTaskAttributes(
  node: { task?: unknown; customAttributes?: unknown },
  index: number,
  version: MapDocumentVersion,
): MapDocumentResult<TaskAttributes> {
  if (version !== 3) return { ok: true, value: {} };

  // V3: JSON null はキー省略と同義（設計書・mapDocumentNode.test.ts）
  const task = node.task == null ? undefined : normalizeNodeTask(node.task);
  if (task?.ok === false) return { ok: false, error: `node[${index}].taskの値が無効です。` };

  const attributes = normalizeCustomAttributes(node.customAttributes ?? undefined);
  if (!attributes.ok) return { ok: false, error: `node[${index}].customAttributesの値が無効です。` };

  return {
    ok: true,
    value: projectNodeTaskAttributes({ task: task?.value, customAttributes: attributes.value }),
  };
}
