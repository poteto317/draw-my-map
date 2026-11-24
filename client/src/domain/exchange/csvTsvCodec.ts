import { preOrderClosedForest } from "@/domain/exchange/closedNodeForest";
import { DEFAULT_NODE_IMPORTANCE } from "@/domain/nodes/nodeImportance";
import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";

export type CsvDecodeResult =
  | { ok: true; items: ForestItem[]; warnings: string[] }
  | { ok: false; reason: string };

const HEADER_COLUMNS = ["id", "parentId", "label", "importance", "note", "tags"] as const;

type HeaderColumn = (typeof HEADER_COLUMNS)[number];

export function defaultDelimiterFromFileName(fileName: string): "," | "\t" {
  return fileName.toLowerCase().endsWith(".tsv") ? "\t" : ",";
}

// Excel 等が式と解釈しないよう、先頭が = + - @ のセルにはタブを付ける（OWASP CSV 式インジェクション対策）。
function neutralizeCsvFormulaInjection(value: string): string {
  return /^[=+\-@]/.test(value) ? `\t${value}` : value;
}

function restoreCsvFormulaInjection(value: string): string {
  if (value.startsWith("\t") && /^[=+\-@]/.test(value.slice(1))) {
    return value.slice(1);
  }
  return value;
}

function csvEscapeField(value: string, delimiter: string): string {
  const safe = neutralizeCsvFormulaInjection(value);
  if (
    safe.includes('"') ||
    safe.includes(delimiter) ||
    safe.includes("\n") ||
    safe.includes("\r")
  ) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

function escapeTagSegment(tag: string): string {
  return tag.replaceAll("\\", "\\\\").replaceAll(";", "\\;");
}

function encodeTags(tags: readonly string[] | undefined): string {
  return tags && tags.length > 0 ? tags.map(escapeTagSegment).join(";") : "";
}

function splitEncodedTags(raw: string): string[] {
  const tags: string[] = [];
  let current = "";
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    const next = raw[index + 1];
    if (char === "\\" && (next === ";" || next === "\\")) {
      current += next;
      index += 1;
      continue;
    }
    if (char === ";") {
      if (current.length > 0) tags.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.length > 0) tags.push(current);
  return tags;
}

export function encodeCsv(closedNodes: readonly Node[], delimiter: "," | "\t"): string {
  const ordered = preOrderClosedForest(closedNodes);
  const lines = [HEADER_COLUMNS.join(delimiter)];
  for (const node of ordered) {
    const row = [
      String(node.id),
      node.parentId === null ? "" : String(node.parentId),
      node.label,
      node.importance,
      node.note ?? "",
      encodeTags(node.tags),
    ].map((cell) => csvEscapeField(cell, delimiter));
    lines.push(row.join(delimiter));
  }
  return lines.join("\n");
}

export type ParseCsvRowsFailure = "unclosed-quote";

function parseCsvRows(text: string, delimiter: string): string[][] | ParseCsvRowsFailure {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") {
      if (next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) return "unclosed-quote";
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeHeaderCell(cell: string): string {
  return cell.replace(/^\uFEFF/, "").trim();
}

const IMPORTANCE_VALUES: ReadonlySet<NodeImportance> = new Set(["high", "medium", "low"]);

function parseImportance(
  raw: string,
  rowNumber: number,
  warnings: string[],
): NodeImportance {
  const trimmed = raw.trim();
  if (trimmed === "") return DEFAULT_NODE_IMPORTANCE;
  if (IMPORTANCE_VALUES.has(trimmed as NodeImportance)) return trimmed as NodeImportance;
  warnings.push(`行${rowNumber}: 不明な importance "${trimmed}" を medium にしました`);
  return "medium";
}

function parseTags(raw: string): readonly string[] | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const tags = splitEncodedTags(trimmed);
  return tags.length > 0 ? tags : undefined;
}

export function decodeCsv(text: string, delimiter: "," | "\t"): CsvDecodeResult {
  const parsed = parseCsvRows(text.trimEnd(), delimiter);
  if (parsed === "unclosed-quote") return { ok: false, reason: "unclosed-quote" };
  const rows = parsed;
  if (rows.length === 0) return { ok: false, reason: "empty" };

  const header = rows[0]!.map(normalizeHeaderCell);
  const columnIndex = new Map<HeaderColumn, number>();
  const known = new Set<string>(HEADER_COLUMNS);
  header.forEach((name, index) => {
    if (known.has(name)) columnIndex.set(name as HeaderColumn, index);
  });

  for (const required of HEADER_COLUMNS) {
    if (!columnIndex.has(required)) return { ok: false, reason: "missing-header" };
  }

  const warnings: string[] = [];
  const items: ForestItem[] = [];
  const idToIndex = new Map<string, number>();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex]!;
    if (cells.every((cell) => cell.trim() === "")) continue;

    const read = (column: HeaderColumn): string => cells[columnIndex.get(column)!] ?? "";

    const fileId = read("id").trim();
    const parentFileId = read("parentId").trim();
    const label = restoreCsvFormulaInjection(read("label"));
    if (label === "" && fileId === "") continue;

    const importance = parseImportance(read("importance"), rowIndex + 1, warnings);
    const noteRaw = restoreCsvFormulaInjection(read("note"));
    const tags = parseTags(read("tags"));

    let parentIndex: number | null = null;
    if (parentFileId !== "") {
      const parent = idToIndex.get(parentFileId);
      if (parent === undefined) {
        return { ok: false, reason: `行${rowIndex + 1}: parentId "${parentFileId}" が未登録` };
      }
      parentIndex = parent;
    }

    const item: ForestItem = { label, parentIndex, importance };
    if (noteRaw !== "") item.note = noteRaw;
    if (tags) item.tags = tags;

    if (fileId !== "") {
      if (idToIndex.has(fileId)) {
        return { ok: false, reason: `行${rowIndex + 1}: id "${fileId}" が重複` };
      }
      idToIndex.set(fileId, items.length);
    }
    items.push(item);
  }

  if (items.length === 0) return { ok: false, reason: "empty" };

  return { ok: true, items, warnings };
}