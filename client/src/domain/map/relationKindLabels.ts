import type { RelationKind } from "@/types/mapRelation";
import { RELATION_KINDS } from "@/types/mapRelation";

/** 設計 §4: 依存 / 対立 / 参考 / 関連 */
export const RELATION_KIND_LABELS: Record<RelationKind, string> = {
  dependency: "依存",
  conflict: "対立",
  reference: "参考",
  related: "関連",
};

export const RELATION_KIND_OPTIONS: ReadonlyArray<{ value: RelationKind; label: string }> =
  RELATION_KINDS.map((value) => ({ value, label: RELATION_KIND_LABELS[value] }));
