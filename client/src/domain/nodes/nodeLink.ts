import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import type { Node } from "@/types/node";

// 1 ノードに付けられる URL の件数の上限
export const NODE_LINKS_MAX_COUNT = 10;
// URL 1 件の長さの上限（string.length）。入力（前後の空白を削った後）と、正規化した href の両方に掛ける
export const NODE_LINK_MAX_LENGTH = 2048;

export type NodeLinkUrlFailureReason = "empty" | "too-long" | "invalid" | "unsupported-scheme" | "has-credentials";

export type NodeLinkUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: NodeLinkUrlFailureReason };

export type AddNodeLinkFailureReason =
  | NodeLinkUrlFailureReason
  | "node-missing"
  | "duplicate"
  | "too-many"
  | "locked";

export type AddNodeLinkResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: AddNodeLinkFailureReason };

// useNodes.addNodeLink の戻り値（ノード配列を含めない。MergeNodesResult と同じ分け方）
export type AddNodeLinkOutcome =
  | { ok: true }
  | { ok: false; reason: AddNodeLinkFailureReason };

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

// URL の入力を、保存して開く値（URL.href）にする。検証と保存と「開く」は同じ href を使う（L-018）。
// 検査の順: 前後の空白を削る → 空 → 入力の長さ（解析より先。L-443）→ new URL（相対 URL・スキーム無しは例外）→
// スキーム（http/https だけ）→ 資格情報（L-032）→ href の長さ（パーセントエンコードで入力より長くなる）
export function normalizeNodeLinkUrl(input: string): NodeLinkUrlResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (trimmed.length > NODE_LINK_MAX_LENGTH) return { ok: false, reason: "too-long" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { ok: false, reason: "unsupported-scheme" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "has-credentials" };
  if (url.href.length > NODE_LINK_MAX_LENGTH) return { ok: false, reason: "too-long" };
  return { ok: true, url: url.href };
}

// 正規化済みの URL か（normalizeNodeLinkUrl が成功し、その値が value と一致する）。描画の再確認とテストで使う
export function isNodeLinkUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const result = normalizeNodeLinkUrl(value);
  return result.ok && result.url === value;
}

// 描画用の href。正規化済みの http/https の URL だけを返し、それ以外は null（保存データが検証済みでも描画で再確認する）
export function toSafeLinkHref(value: string): string | null {
  return isNodeLinkUrl(value) ? value : null;
}

// 2 つの URL の並びが同じか（要素ごと）。undefined は空の並びと同じに扱う
export function areNodeLinksEqual(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((link, index) => link === right[index]);
}

// 利用者向けの失敗の文言。empty は部品が文言を出さないので取らない
export function formatNodeLinkFailure(reason: Exclude<AddNodeLinkFailureReason, "empty">): string {
  switch (reason) {
    case "too-long":
      return `URLが長すぎます（${NODE_LINK_MAX_LENGTH.toLocaleString("ja-JP")} 文字まで。日本語などはエンコードで長くなります）。`;
    case "invalid":
      return "URLの形式が正しくありません。https:// から始まる URL を入力してください。";
    case "unsupported-scheme":
      return "http または https の URL だけを追加できます。";
    case "has-credentials":
      return "ユーザー名やパスワードを含む URL は追加できません。";
    case "duplicate":
      return "同じ URL がすでに追加されています。";
    case "too-many":
      return `リンクは 1 つのノードに ${NODE_LINKS_MAX_COUNT} 件まで追加できます。`;
    case "node-missing":
      return "ノードが見つかりません。";
    case "locked":
      return "ロックされたノードは編集できません。";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

// ノードの URL を links にしたノードを返す（元のノードは変えない）。undefined・空の並びなら links のキーごと外す
// （空配列や links: undefined を残さない）。値の検証はしない（呼び出し側の責務）
export function withNodeLinks(node: Node, links: readonly string[] | undefined): Node {
  if (links !== undefined && links.length > 0) return { ...node, links };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で links を除外するため
  const { links: _removed, ...rest } = node;
  return rest;
}

// 1 ノードの URL の末尾に 1 件足す。検査の順: node-missing → URL の検査 → duplicate → too-many。
// 成功時は対象のノードだけを新しいオブジェクトにし、ほかのノードは同じ参照のまま返す
export function addNodeLink(nodes: readonly Node[], id: number, input: string): AddNodeLinkResult {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  const lockedCheck = assertNodesEditable([id], nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") return { ok: false, reason: "locked" };
  const normalized = normalizeNodeLinkUrl(input);
  if (!normalized.ok) return normalized;
  const current = target.links ?? [];
  if (current.includes(normalized.url)) return { ok: false, reason: "duplicate" };
  if (current.length >= NODE_LINKS_MAX_COUNT) return { ok: false, reason: "too-many" };
  const nextLinks = [...current, normalized.url];
  return { ok: true, nodes: nodes.map((node) => (node.id === id ? withNodeLinks(node, nextLinks) : node)) };
}

// 1 ノードから URL を 1 件消す。url は保存されている値（正規化済み）と完全に一致するものだけを消す。
// 対象が無い・その URL を持たないときは null（何も変えない）。最後の 1 件を消すと links のキーごと外す
export function removeNodeLink(nodes: readonly Node[], id: number, url: string): Node[] | null {
  if (!assertNodesEditable([id], nodes).ok) return null;
  const target = nodes.find((node) => node.id === id);
  const links = target?.links;
  if (links === undefined || !links.includes(url)) return null;
  const nextLinks = links.filter((link) => link !== url);
  return nodes.map((node) => (node.id === id ? withNodeLinks(node, nextLinks) : node));
}
