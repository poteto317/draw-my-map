import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";

export function getNodeDisplayLabel(label: string): string {
  return label || FALLBACK_NODE_LABEL;
}
