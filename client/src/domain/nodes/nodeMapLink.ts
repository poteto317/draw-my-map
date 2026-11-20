import { isValidMapId } from "@/domain/mapLibrary/mapIndex";
import type { Node, NodeMapLink } from "@/types/node";

export type { NodeMapLink };

// 1 ノードに付けられるマップ間リンクの件数の上限
export const NODE_MAP_LINKS_MAX_COUNT = 10;

const POSITIVE_NODE_ID_PATTERN = /^[1-9][0-9]*$/;

export type NodeMapLinkNormalizeFailureReason = "invalid-map-id" | "invalid-node-id";

export type NodeMapLinkResult =
  | { ok: true; link: NodeMapLink }
  | { ok: false; reason: NodeMapLinkNormalizeFailureReason };

export type NodeMapLinkFailureReason =
  | NodeMapLinkNormalizeFailureReason
  | "node-missing"
  | "self-node"
  | "duplicate"
  | "too-many";

export type AddNodeMapLinkResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: NodeMapLinkFailureReason };

// useNodes.addNodeMapLink の戻り値（ノード配列を含めない）
export type AddNodeMapLinkOutcome =
  | { ok: true }
  | { ok: false; reason: NodeMapLinkFailureReason };

export type NodeMapLinkInput = {
  targetMapId: string;
  targetNodeId?: number;
};

// 1 以上の安全な整数かどうかを判定する（L-046, L-047）
export function isValidTargetNodeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

// <select> 値など文字列の正の整数を厳密に復号する（L-046）
export function parsePositiveNodeIdString(raw: string): number | null {
  if (!POSITIVE_NODE_ID_PATTERN.test(raw)) return null;
  const parsed = Number(raw);
  return isValidTargetNodeId(parsed) ? parsed : null;
}

function buildNodeMapLink(targetMapId: string, targetNodeId: number | undefined): NodeMapLink {
  return targetNodeId === undefined ? { targetMapId } : { targetMapId, targetNodeId };
}

// マップ間リンクの入力を正規化する。targetNodeId が未指定ならキーを省略する
export function normalizeNodeMapLink(input: {
  targetMapId: unknown;
  targetNodeId?: unknown;
}): NodeMapLinkResult {
  if (!isValidMapId(input.targetMapId)) {
    return { ok: false, reason: "invalid-map-id" };
  }
  if (input.targetNodeId === undefined) {
    return { ok: true, link: buildNodeMapLink(input.targetMapId, undefined) };
  }
  if (!isValidTargetNodeId(input.targetNodeId)) {
    return { ok: false, reason: "invalid-node-id" };
  }
  return { ok: true, link: buildNodeMapLink(input.targetMapId, input.targetNodeId) };
}

// targetMapId は [A-Za-z0-9_-] のみのためコロンと衝突不能（L-539）
export function nodeMapLinkKey(link: NodeMapLink): string {
  return link.targetNodeId === undefined
    ? `${link.targetMapId}:map`
    : `${link.targetMapId}:node:${link.targetNodeId}`;
}

// 鍵が同じものは最初に出てきたものを残して除く（後を捨てる）
export function uniqueNodeMapLinks(links: readonly NodeMapLink[]): NodeMapLink[] {
  const keys = new Set<string>();
  const unique: NodeMapLink[] = [];
  for (const link of links) {
    const key = nodeMapLinkKey(link);
    if (keys.has(key)) continue;
    keys.add(key);
    unique.push(link);
  }
  return unique;
}

// 要素の targetMapId / targetNodeId を順比較。undefined と空配列は同値
export function areNodeMapLinksEqual(
  a: readonly NodeMapLink[] | undefined,
  b: readonly NodeMapLink[] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every(
      (link, index) =>
        link.targetMapId === right[index].targetMapId &&
        link.targetNodeId === right[index].targetNodeId,
    )
  );
}

// ノードのマップ間リンクを mapLinks にしたノードを返す。undefined・空配列ならキーごと外す
export function withNodeMapLinks(node: Node, mapLinks: readonly NodeMapLink[] | undefined): Node {
  if (mapLinks !== undefined && mapLinks.length > 0) return { ...node, mapLinks };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で mapLinks を除外するため
  const { mapLinks: _removed, ...rest } = node;
  return rest;
}

// 現在マップの nodeId 自身を指すリンクか（追加では self-node で拒否し、統合では残すノードを指すものを除く）
export function isSelfNodeMapLink(link: NodeMapLink, currentMapId: string, nodeId: number): boolean {
  return link.targetMapId === currentMapId && link.targetNodeId === nodeId;
}

// 検査順: node-missing → normalizeNodeMapLink → self-node → duplicate → too-many。成功時は末尾追加
export function addNodeMapLink(
  nodes: readonly Node[],
  nodeId: number,
  currentMapId: string,
  input: NodeMapLinkInput,
): AddNodeMapLinkResult {
  const target = nodes.find((node) => node.id === nodeId);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  const normalized = normalizeNodeMapLink(input);
  if (!normalized.ok) return normalized;
  if (isSelfNodeMapLink(normalized.link, currentMapId, nodeId)) {
    return { ok: false, reason: "self-node" };
  }
  const current = target.mapLinks ?? [];
  const key = nodeMapLinkKey(normalized.link);
  if (current.some((item) => nodeMapLinkKey(item) === key)) {
    return { ok: false, reason: "duplicate" };
  }
  if (current.length >= NODE_MAP_LINKS_MAX_COUNT) {
    return { ok: false, reason: "too-many" };
  }
  const nextMapLinks = [...current, normalized.link];
  return {
    ok: true,
    nodes: nodes.map((node) => (node.id === nodeId ? withNodeMapLinks(node, nextMapLinks) : node)),
  };
}

// 値一致（nodeMapLinkKey）でリンクを削除する（L-035）。対象不在は null。最後の 1 件ならキーごと外す
export function removeNodeMapLink(
  nodes: readonly Node[],
  nodeId: number,
  target: NodeMapLink,
): Node[] | null {
  const node = nodes.find((item) => item.id === nodeId);
  const current = node?.mapLinks;
  if (current === undefined) return null;
  const targetKey = nodeMapLinkKey(target);
  if (!current.some((link) => nodeMapLinkKey(link) === targetKey)) return null;
  const nextMapLinks = current.filter((link) => nodeMapLinkKey(link) !== targetKey);
  return nodes.map((item) => (item.id === nodeId ? withNodeMapLinks(item, nextMapLinks) : item));
}

// 一括復元時にバックアップ内の targetMapId を新規採番 ID へ付け替え、重複を除去する
export function remapNodeMapLinks(
  nodes: readonly Node[],
  mapIdMapping: ReadonlyMap<string, string>,
): Node[] {
  return nodes.map((node) => {
    const current = node.mapLinks;
    if (current === undefined || current.length === 0) return node;
    let changed = false;
    const mapped = current.map((link) => {
      const nextMapId = mapIdMapping.get(link.targetMapId);
      if (nextMapId === undefined || nextMapId === link.targetMapId) return link;
      changed = true;
      return buildNodeMapLink(nextMapId, link.targetNodeId);
    });
    const unique = uniqueNodeMapLinks(mapped);
    if (!changed && unique.length === current.length) return node;
    return withNodeMapLinks(node, unique);
  });
}

// 利用者向けの失敗文言
export function formatNodeMapLinkFailure(reason: NodeMapLinkFailureReason): string {
  switch (reason) {
    case "invalid-map-id":
      return "リンク先のマップが正しくありません。";
    case "invalid-node-id":
      return "リンク先のノードが正しくありません。";
    case "self-node":
      return "自分自身のノードにはリンクできません。";
    case "duplicate":
      return "同じマップ間リンクがすでに追加されています。";
    case "too-many":
      return `マップ間リンクは 1 つのノードに ${NODE_MAP_LINKS_MAX_COUNT} 件まで追加できます。`;
    case "node-missing":
      return "ノードが見つかりません。";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}
