import { validateSubtreeClipboardNodes } from "@/domain/clipboard/subtreeClipboardCodec";
import { normalizeMapDocumentNode } from "@/domain/persistence/mapDocumentNode";
import { isPlainRecord } from "@/domain/shared/unknownRecord";
import type { Node } from "@/types/node";
import {
  createEmptyPartsStore,
  MAX_PART_NAME,
  MAX_PART_NODES,
  MAX_PARTS,
  type Part,
  type PartsStore,
} from "./partsModel";

export type DecodePartsStoreResult =
  | { readonly status: "ok"; readonly store: PartsStore; readonly repaired: boolean }
  | { readonly status: "corrupt" };

function normalizeNodes(values: readonly unknown[]): Node[] | null {
  if (values.length > MAX_PART_NODES) return null;
  const nodes: Node[] = [];
  for (const [index, value] of values.entries()) {
    const normalized = normalizeMapDocumentNode(value, index, 3);
    if (!normalized.ok) return null;
    nodes.push(normalized.value);
  }
  return nodes;
}

function decodePart(value: unknown): Part | null {
  if (!isPlainRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (typeof value.name !== "string" || value.name.length > MAX_PART_NAME) return null;
  if (typeof value.createdAt !== "string") return null;
  if (!Array.isArray(value.nodes)) return null;

  const nodes = normalizeNodes(value.nodes);
  if (!nodes) return null;
  const validated = validateSubtreeClipboardNodes(nodes);
  if (!validated.ok) return null;

  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    nodes: validated.value.nodes,
  };
}

export function decodePartsStore(raw: string | null): DecodePartsStoreResult {
  if (raw === null) {
    return { status: "ok", store: createEmptyPartsStore(), repaired: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt" };
  }

  if (!isPlainRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.parts)) {
    return { status: "corrupt" };
  }
  if (parsed.parts.length > MAX_PARTS) {
    return { status: "corrupt" };
  }

  const parts: Part[] = [];
  const seenIds = new Set<string>();
  let repaired = false;

  for (const entry of parsed.parts) {
    const part = decodePart(entry);
    if (part === null) {
      repaired = true;
      continue;
    }
    if (seenIds.has(part.id)) {
      repaired = true;
      continue;
    }
    seenIds.add(part.id);
    parts.push(part);
  }

  return {
    status: "ok",
    store: { version: 1, parts },
    repaired,
  };
}

export function encodePartsStore(store: PartsStore): string {
  return JSON.stringify({
    version: 1,
    parts: store.parts,
  });
}
