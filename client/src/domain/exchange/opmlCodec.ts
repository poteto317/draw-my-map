import {
  forestRootNodes,
  sortedChildNodes,
} from "@/domain/exchange/closedNodeForest";
import { normalizeMapXmlText } from "@/domain/imageExport/mapXmlText";
import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";
import type { Node } from "@/types/node";

export type OpmlDecodeResult =
  | { ok: true; items: ForestItem[] }
  | { ok: false; reason: string };

function escapeXmlAttribute(value: string): string {
  return normalizeMapXmlText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildOutlineXml(roots: readonly Node[], nodes: readonly Node[]): string {
  const chunks: string[] = [];
  type Frame =
    | { kind: "enter"; node: Node }
    | { kind: "close" };
  const stack: Frame[] = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push({ kind: "enter", node: roots[index]! });
  }
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.kind === "close") {
      chunks.push("</outline>");
      continue;
    }
    const { node } = frame;
    const attrs = [`text="${escapeXmlAttribute(node.label)}"`];
    if (node.note) attrs.push(`_note="${escapeXmlAttribute(node.note)}"`);
    const children = sortedChildNodes(node.id, nodes);
    if (children.length === 0) {
      chunks.push(`<outline ${attrs.join(" ")}/>`);
      continue;
    }
    chunks.push(`<outline ${attrs.join(" ")}>`);
    stack.push({ kind: "close" });
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ kind: "enter", node: children[index]! });
    }
  }
  return chunks.join("");
}

export function encodeOpml(closedNodes: readonly Node[]): string {
  const roots = forestRootNodes(closedNodes);
  const body = buildOutlineXml(roots, closedNodes);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    "<head><title>Draw My Map</title></head>",
    `<body>${body}</body>`,
    "</opml>",
  ].join("");
}

function outlineNote(outline: Element): string | undefined {
  const fromAttr = outline.getAttribute("_note");
  if (fromAttr !== null && fromAttr !== "") return fromAttr;
  const noteElement = outline.querySelector(":scope > note");
  const fromElement = noteElement?.textContent;
  if (fromElement !== null && fromElement !== undefined && fromElement !== "") return fromElement;
  return undefined;
}

function outlineLabel(outline: Element): string {
  const text = outline.getAttribute("text");
  if (text !== null && text !== "") return text;
  const title = outline.getAttribute("title");
  if (title !== null && title !== "") return title;
  return text ?? "";
}

function collectOutlineItems(body: Element): ForestItem[] {
  const items: ForestItem[] = [];
  const roots = body.querySelectorAll(":scope > outline");
  type Frame = { element: Element; parentIndex: number | null };
  const stack: Frame[] = [];
  const rootList = Array.from(roots);
  for (let index = rootList.length - 1; index >= 0; index -= 1) {
    stack.push({ element: rootList[index]!, parentIndex: null });
  }
  while (stack.length > 0) {
    const { element, parentIndex } = stack.pop()!;
    const label = outlineLabel(element);
    const note = outlineNote(element);
    const item: ForestItem = { label, parentIndex };
    if (note !== undefined) item.note = note;
    const itemIndex = items.length;
    items.push(item);
    const children = element.querySelectorAll(":scope > outline");
    const childList = Array.from(children);
    for (let index = childList.length - 1; index >= 0; index -= 1) {
      stack.push({ element: childList[index]!, parentIndex: itemIndex });
    }
  }
  return items;
}

export function decodeOpml(xml: string): OpmlDecodeResult {
  const trimmed = xml.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };

  const doc = new DOMParser().parseFromString(trimmed, "text/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) return { ok: false, reason: "invalid-xml" };

  const opml = doc.querySelector("opml");
  const body = opml?.querySelector("body");
  if (!body) return { ok: false, reason: "missing-body" };

  const items = collectOutlineItems(body);
  if (items.length === 0) return { ok: false, reason: "empty" };

  return { ok: true, items };
}