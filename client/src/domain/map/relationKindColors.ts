import type { RelationKind } from "@/types/mapRelation";

/** 設計 §7: kind 固定色トークン */
export const RELATION_KIND_COLORS: Record<RelationKind, number> = {
  dependency: 0x2563eb,
  conflict: 0xdc2626,
  reference: 0x0f766e,
  related: 0x64748b,
};

export const RELATION_KIND_COLOR_CSS: Record<RelationKind, string> = {
  dependency: "#2563eb",
  conflict: "#dc2626",
  reference: "#0f766e",
  related: "#64748b",
};
