import { normalizeOutlineRest } from "@/domain/outline/outlineLines";
import type { OutlineRows } from "@/domain/outline/outlineRows";

export type OutlineExportFormat = "md" | "txt";
export type OutlineExportResult =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "too-large" | "invalid-structure" };

export const MAX_OUTLINE_EXPORT_CODE_UNITS = 1_000_000;

export function formatOutlineRows(model: OutlineRows, format: OutlineExportFormat): OutlineExportResult {
  if (model.invalidStructure || model.duplicateIds) return { ok: false, reason: "invalid-structure" };
  if (model.rows.length === 0) return { ok: false, reason: "empty" };

  const prefix = format === "md" ? "- " : "・";
  const normalized: { depth: number; label: string }[] = [];
  let totalLength = 0;
  for (const row of model.rows) {
    const node = model.nodesById.get(row.nodeId);
    if (!node) return { ok: false, reason: "invalid-structure" };
    if (!Number.isSafeInteger(row.depth) || row.depth < 1) return { ok: false, reason: "too-large" };
    const depth = row.depth - 1;
    const indentLength = 2 * depth;
    if (!Number.isSafeInteger(indentLength)) return { ok: false, reason: "too-large" };
    const label = normalizeOutlineRest(node.label) || "（空のノード）";
    const lineLength = indentLength + prefix.length + label.length + 1;
    if (!Number.isSafeInteger(lineLength)) return { ok: false, reason: "too-large" };
    totalLength += lineLength;
    if (!Number.isSafeInteger(totalLength) || totalLength > MAX_OUTLINE_EXPORT_CODE_UNITS) {
      return { ok: false, reason: "too-large" };
    }
    normalized.push({ depth, label });
  }

  const lines: string[] = [];
  for (const { depth, label } of normalized) lines.push(`${"  ".repeat(depth)}${prefix}${label}\n`);
  return { ok: true, text: lines.join("") };
}
