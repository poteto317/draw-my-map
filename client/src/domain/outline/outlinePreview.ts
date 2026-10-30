// プレビュー用の木。先頭の一部の項目だけを木にし、表示用にラベルを短くする。
import { truncateLabelByCodePoints } from "@/domain/nodes/nodeDisplayLabel";
import type { ParsedOutline } from "./outlineParser";

// プレビューに表示する項目数の上限。
export const OUTLINE_PREVIEW_MAX_ITEMS = 200;
// プレビューのラベルの長さの上限（コードポイント数）。
export const OUTLINE_PREVIEW_LABEL_LENGTH = 80;

export type OutlinePreviewNode = {
  key: number; // ParsedOutline.items の添字
  label: string; // 表示用に短くしたラベル
  children: OutlinePreviewNode[];
};

export type OutlinePreview = {
  roots: OutlinePreviewNode[];
  shownCount: number; // min(items.length, maxItems)
  totalCount: number; // items.length
  truncated: boolean; // totalCount > shownCount
};

// 81コードポイント以上なら先頭80コードポイントに「…」を付ける。
export function truncateOutlinePreviewLabel(label: string): string {
  return truncateLabelByCodePoints(label, OUTLINE_PREVIEW_LABEL_LENGTH);
}

// items の先頭 maxItems 件を1回の走査で木にする。親は常に自分より前にあるので再帰を使わない。
export function buildOutlinePreview(
  outline: ParsedOutline,
  maxItems = OUTLINE_PREVIEW_MAX_ITEMS,
): OutlinePreview {
  const totalCount = outline.items.length;
  const shownCount = Math.min(totalCount, maxItems);
  const nodes: OutlinePreviewNode[] = [];
  const roots: OutlinePreviewNode[] = [];

  for (let index = 0; index < shownCount; index += 1) {
    const { label, parentIndex } = outline.items[index];
    const node: OutlinePreviewNode = {
      key: index,
      label: truncateOutlinePreviewLabel(label),
      children: [],
    };
    nodes.push(node);
    if (parentIndex === null) {
      roots.push(node);
    } else {
      nodes[parentIndex].children.push(node);
    }
  }

  return { roots, shownCount, totalCount, truncated: totalCount > shownCount };
}
