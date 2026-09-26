import type { NodeImportance } from "@/types/nodeImportance";

export type Node = {
  id: number;
  parentId: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  importance: NodeImportance;
};
