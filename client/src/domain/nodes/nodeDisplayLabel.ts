import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";

export function getNodeDisplayLabel(label: string): string {
  return label || FALLBACK_NODE_LABEL;
}

// maxCodePoints を超えるラベルは、先頭 maxCodePoints コードポイントに「…」を付ける。サロゲートペアを途中で切らない
export function truncateLabelByCodePoints(label: string, maxCodePoints: number): string {
  // コードポイント数は UTF-16 コード単位数以下なので、短ければ分割しない
  if (label.length <= maxCodePoints) return label;
  const codePoints = Array.from(label);
  if (codePoints.length <= maxCodePoints) return label;
  return `${codePoints.slice(0, maxCodePoints).join("")}…`;
}
