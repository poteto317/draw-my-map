// インデントの後の残りから、記号と番号を除いたラベルを取り出す。
import { normalizeOutlineRest } from "./outlineLines";

export type OutlineLabelResult =
  | { kind: "label"; label: string } // 空でないラベル
  | { kind: "marker-only" } // 記号を取り除くと空になる行
  | { kind: "blank" }; // 制御文字の置き換えと trim で空になる行（空行）

// 後ろの文字によらず取り除く記号（日本語では後ろに空白を置かないことが多い）。
const ALWAYS_MARKER_PATTERN = /^[\u30FB\u2022]/;
// 後ろが空白か行末のときだけ取り除く記号と、半角数字1〜9桁の番号。
const SPACED_MARKER_PATTERN = /^(?:[-*+]|[0-9]{1,9}[.)])(?=\s|$)/;

// 上から順に判定し、最初に当てはまった記号1つの長さを返す（無ければ 0）。
function markerLength(normalized: string): number {
  const always = ALWAYS_MARKER_PATTERN.exec(normalized);
  if (always) return always[0].length;
  const spaced = SPACED_MARKER_PATTERN.exec(normalized);
  return spaced ? spaced[0].length : 0;
}

// 手順: 制御文字の置き換えと trim → 記号を1つだけ除去 → trim。
export function extractOutlineLabel(rest: string): OutlineLabelResult {
  const normalized = normalizeOutlineRest(rest);
  if (normalized === "") return { kind: "blank" };

  const label = normalized.slice(markerLength(normalized)).trim();
  return label === "" ? { kind: "marker-only" } : { kind: "label", label };
}
