import { nodeTagKey } from "@/domain/nodes/nodeTag";
import {
  areCustomAttributesEqual,
  areCustomAttributeValuesEqual,
  areNodeTasksEqual,
  MAX_CUSTOM_ATTRIBUTES,
} from "@/domain/nodes/nodeTaskAttributes";
import type { Node, NodeCustomAttribute } from "@/types/node";

type MergeSource = Pick<Node, "id" | "task" | "customAttributes">;

export type NodeTaskAttributeMerge = {
  task: Node["task"];
  taskSourceId: number | null;
  discardedTaskCount: number;
  customAttributes: Node["customAttributes"];
  duplicateAttributeCount: number;
  discardedAttributeNames: readonly string[];
  sources: readonly Readonly<MergeSource>[];
};

export function planNodeTaskAttributeMerge(nodes: readonly Node[]): NodeTaskAttributeMerge | null {
  const sources = nodes.map(({ id, task, customAttributes }) => ({ id, task, customAttributes }));
  const taskSources = sources.filter(({ task }) => task !== undefined);
  const firstTask = taskSources[0];
  const attributesByKey = new Map<string, NodeCustomAttribute>();
  const discardedAttributeNames: string[] = [];
  let duplicateAttributeCount = 0;

  for (const { customAttributes } of sources) {
    for (const attribute of customAttributes ?? []) {
      const key = nodeTagKey(attribute.name);
      const retained = attributesByKey.get(key);
      if (retained === undefined) {
        if (attributesByKey.size >= MAX_CUSTOM_ATTRIBUTES) return null;
        attributesByKey.set(key, attribute);
      } else if (areCustomAttributeValuesEqual(retained, attribute)) {
        duplicateAttributeCount += 1;
      } else {
        discardedAttributeNames.push(attribute.name);
      }
    }
  }

  return {
    task: firstTask?.task,
    taskSourceId: firstTask?.id ?? null,
    discardedTaskCount: firstTask === undefined ? 0 : taskSources.length - 1,
    customAttributes: attributesByKey.size === 0 ? undefined : Array.from(attributesByKey.values()),
    duplicateAttributeCount,
    discardedAttributeNames,
    sources,
  };
}

export function areNodeTaskAttributeMergesEqual(a: NodeTaskAttributeMerge, b: NodeTaskAttributeMerge): boolean {
  if (a.sources.length !== b.sources.length) return false;
  return a.sources.every(({ id, task, customAttributes }, index) => {
    const other = b.sources[index];
    return id === other.id
      && areNodeTasksEqual(task, other.task)
      && areCustomAttributesEqual(customAttributes, other.customAttributes);
  });
}
