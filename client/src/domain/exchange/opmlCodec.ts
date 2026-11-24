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

function outlineXml(node: Node, nodes: readonly Node[]): string {
  const attrs = [`text="${escapeXmlAttribute(node.label)}"`];
  if (node.note) attrs.push(`_note="${escapeXmlAttribute(node.note)}"`);
  const childXml = sortedChildNodes(node.id, nodes).map((child) => outlineXml(child, nodes)).join("");
  if (childXml) return `<outline ${attrs.join(" ")}>${childXml}</outline>`;
  return `<outline ${attrs.join(" ")}/>`;
}

export function encodeOpml(closedNodes: readonly Node[]): string {
  const roots = forestRootNodes(closedNodes);
  const body = roots.map((root) => outlineXml(root, closedNodes)).join("");
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

function walkOutline(outline: Element, parentIndex: number | null, items: ForestItem[]): void {
  const label = outlineLabel(outline);
  const note = outlineNote(outline);
  const item: ForestItem = { label, parentIndex };
  if (note !== undefined) item.note = note;
  const index = items.length;
  items.push(item);
  for (const child of outline.querySelectorAll(":scope > outline")) {
    walkOutline(child, index, items);
  }
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

  const items: ForestItem[] = [];
  for (const outline of body.querySelectorAll(":scope > outline")) {
    walkOutline(outline, null, items);
  }
  if (items.length === 0) return { ok: false, reason: "empty" };

  return { ok: true, items };
}