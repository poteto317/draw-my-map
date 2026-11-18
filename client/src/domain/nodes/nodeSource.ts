import {
  formatNodeLinkFailure,
  normalizeNodeLinkUrl,
  type NodeLinkUrlFailureReason,
} from "@/domain/nodes/nodeLink";
import { nodeTagKey } from "@/domain/nodes/nodeTag";
import type { Node, NodeSource } from "@/types/node";

export type { NodeSource };

// 1 ノードに付けられる出典の件数の上限
export const NODE_SOURCES_MAX_COUNT = 10;
// タイトルの長さの上限（string.length。空白をまとめた後の値に掛ける）
export const NODE_SOURCE_TITLE_MAX_LENGTH = 200;
// ページの長さの上限（string.length。空白をまとめた後の値に掛ける）
export const NODE_SOURCE_PAGE_MAX_LENGTH = 80;
// タイトル・ページの入力の長さの先行判定（前後の空白を削った後の length）。巨大な入力で空白のまとめなどの処理をしない（L-443）
export const NODE_SOURCE_INPUT_MAX_LENGTH = 256;

export type NodeSourceTitleFailureReason = "empty-title" | "too-long-title" | "invalid-title";
export type NodeSourcePageFailureReason = "too-long-page" | "invalid-page";
export type NodeSourceUrlFailureReason = Exclude<NodeLinkUrlFailureReason, "empty">;

export type NodeSourceTitleResult =
  | { ok: true; title: string }
  | { ok: false; reason: NodeSourceTitleFailureReason };

export type NodeSourcePageResult =
  | { ok: true; page: string | undefined }
  | { ok: false; reason: NodeSourcePageFailureReason };

export type NodeSourceUrlResult =
  | { ok: true; url: string | undefined }
  | { ok: false; reason: NodeSourceUrlFailureReason };

export type NodeSourceNormalizeFailureReason =
  | NodeSourceTitleFailureReason
  | NodeSourcePageFailureReason
  | NodeSourceUrlFailureReason;

export type NodeSourceResult =
  | { ok: true; source: NodeSource }
  | { ok: false; reason: NodeSourceNormalizeFailureReason };

export type AddNodeSourceFailureReason =
  | NodeSourceNormalizeFailureReason
  | "node-missing"
  | "duplicate"
  | "too-many";

export type AddNodeSourceResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: AddNodeSourceFailureReason };

// useNodes.addNodeSource の戻り値（ノード配列を含めない。AddNodeLinkOutcome と同じ分け方）
export type AddNodeSourceOutcome =
  | { ok: true }
  | { ok: false; reason: AddNodeSourceFailureReason };

export type NodeSourceInput = {
  title: string;
  page?: string;
  url?: string;
};

// 連続する空白（タブ・改行・全角の空白 U+3000・NBSP・BOM を含む \s）
const WHITESPACE_RUN = /\s+/g;

// 見えない書式文字（タグと同じ集合。U+200D・U+FE0E・U+FE0F は許可）
const INVISIBLE_FORMAT = /[\p{Default_Ignorable_Code_Point}\u{FFF9}-\u{FFFB}]/u;

function isAllowedInvisibleCodePoint(codePoint: number): boolean {
  return codePoint === 0x200d || codePoint === 0xfe0e || codePoint === 0xfe0f;
}

function isControlCodeUnit(code: number): boolean {
  return code <= 0x08 || (code >= 0x0e && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
}

function hasForbiddenCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (isControlCodeUnit(value.charCodeAt(index))) return true;
  }
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (INVISIBLE_FORMAT.test(character) && !isAllowedInvisibleCodePoint(codePoint)) return true;
  }
  return false;
}

function buildNodeSource(title: string, page: string | undefined, url: string | undefined): NodeSource {
  return {
    title,
    ...(page !== undefined ? { page } : {}),
    ...(url !== undefined ? { url } : {}),
  };
}

// タイトルの入力を保存する値にする。検査順: trim → empty → 入力先行 → 空白まとめ → 制御/不可視 → 鍵が空（invalid）→ 長さ
export function normalizeNodeSourceTitle(input: string): NodeSourceTitleResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, reason: "empty-title" };
  if (trimmed.length > NODE_SOURCE_INPUT_MAX_LENGTH) return { ok: false, reason: "too-long-title" };
  const collapsed = trimmed.replace(WHITESPACE_RUN, " ");
  if (hasForbiddenCharacter(collapsed)) return { ok: false, reason: "invalid-title" };
  if (nodeTagKey(collapsed) === "") return { ok: false, reason: "invalid-title" };
  if (collapsed.length > NODE_SOURCE_TITLE_MAX_LENGTH) return { ok: false, reason: "too-long-title" };
  return { ok: true, title: collapsed };
}

// ページの入力を保存する値にする。空・空白だけは無し。それ以外はタイトルと同じ規則（上限 80）
export function normalizeNodeSourcePage(input: string | undefined): NodeSourcePageResult {
  if (input === undefined) return { ok: true, page: undefined };
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, page: undefined };
  if (trimmed.length > NODE_SOURCE_INPUT_MAX_LENGTH) return { ok: false, reason: "too-long-page" };
  const collapsed = trimmed.replace(WHITESPACE_RUN, " ");
  if (hasForbiddenCharacter(collapsed)) return { ok: false, reason: "invalid-page" };
  if (nodeTagKey(collapsed) === "") return { ok: false, reason: "invalid-page" };
  if (collapsed.length > NODE_SOURCE_PAGE_MAX_LENGTH) return { ok: false, reason: "too-long-page" };
  return { ok: true, page: collapsed };
}

// URL の入力を保存する値にする。空・空白だけは無し。それ以外は normalizeNodeLinkUrl（empty は無し扱い）
export function normalizeNodeSourceUrl(input: string | undefined): NodeSourceUrlResult {
  if (input === undefined) return { ok: true, url: undefined };
  const result = normalizeNodeLinkUrl(input);
  if (!result.ok) {
    if (result.reason === "empty") return { ok: true, url: undefined };
    return { ok: false, reason: result.reason };
  }
  return { ok: true, url: result.url };
}

// 検査順: タイトル → ページ → URL
export function normalizeNodeSource(input: NodeSourceInput): NodeSourceResult {
  const title = normalizeNodeSourceTitle(input.title);
  if (!title.ok) return title;
  const page = normalizeNodeSourcePage(input.page);
  if (!page.ok) return page;
  const url = normalizeNodeSourceUrl(input.url);
  if (!url.ok) return url;
  return { ok: true, source: buildNodeSource(title.title, page.page, url.url) };
}

// 同じ出典とみなすための鍵（タイトルは nodeTagKey と同じ手順 + page 正規化値 or "" + url or ""）
export function nodeSourceKey(source: NodeSource): string {
  return `${nodeTagKey(source.title)}\0${source.page ?? ""}\0${source.url ?? ""}`;
}

// 鍵が同じものは最初に出てきたものを残して除く（後を捨てる）
export function uniqueNodeSources(sources: readonly NodeSource[]): NodeSource[] {
  const keys = new Set<string>();
  const unique: NodeSource[] = [];
  for (const source of sources) {
    const key = nodeSourceKey(source);
    if (keys.has(key)) continue;
    keys.add(key);
    unique.push(source);
  }
  return unique;
}

function sameOptionalString(a: string | undefined, b: string | undefined): boolean {
  return (a ?? undefined) === (b ?? undefined);
}

// 要素の title/page/url を順比較。undefined と空配列は同値
export function areNodeSourcesEqual(
  a: readonly NodeSource[] | undefined,
  b: readonly NodeSource[] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every(
      (source, index) =>
        source.title === right[index].title &&
        sameOptionalString(source.page, right[index].page) &&
        sameOptionalString(source.url, right[index].url),
    )
  );
}

// 利用者向けの失敗の文言。empty-title は部品が文言を出さないので取らない。URL 系はリンクと同じ文言
export function formatNodeSourceFailure(reason: Exclude<AddNodeSourceFailureReason, "empty-title">): string {
  switch (reason) {
    case "too-long-title":
      return `出典のタイトルが長すぎます（${NODE_SOURCE_TITLE_MAX_LENGTH} 文字まで）。`;
    case "invalid-title":
      return "出典のタイトルに使えない文字が含まれています。";
    case "too-long-page":
      return `出典のページが長すぎます（${NODE_SOURCE_PAGE_MAX_LENGTH} 文字まで）。`;
    case "invalid-page":
      return "出典のページに使えない文字が含まれています。";
    case "too-long":
    case "invalid":
    case "unsupported-scheme":
    case "has-credentials":
      return formatNodeLinkFailure(reason);
    case "duplicate":
      return "同じ出典がすでに追加されています。";
    case "too-many":
      return `出典は 1 つのノードに ${NODE_SOURCES_MAX_COUNT} 件まで追加できます。`;
    case "node-missing":
      return "ノードが見つかりません。";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

// ノードの出典を sources にしたノードを返す。undefined・空の並びならキーごと外す
export function withNodeSources(node: Node, sources: readonly NodeSource[] | undefined): Node {
  if (sources !== undefined && sources.length > 0) return { ...node, sources };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で sources を除外するため
  const { sources: _removed, ...rest } = node;
  return rest;
}

// 検査順: node-missing → 正規化 → duplicate → too-many。成功時は末尾追加
export function addNodeSource(
  nodes: readonly Node[],
  id: number,
  input: NodeSourceInput,
): AddNodeSourceResult {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  const normalized = normalizeNodeSource(input);
  if (!normalized.ok) return normalized;
  const current = target.sources ?? [];
  const key = nodeSourceKey(normalized.source);
  if (current.some((item) => nodeSourceKey(item) === key)) return { ok: false, reason: "duplicate" };
  if (current.length >= NODE_SOURCES_MAX_COUNT) return { ok: false, reason: "too-many" };
  const nextSources = [...current, normalized.source];
  return { ok: true, nodes: nodes.map((node) => (node.id === id ? withNodeSources(node, nextSources) : node)) };
}

// 指定 index の出典を消す。範囲外・ノード無しは null。最後の 1 件なら sources キーを外す
export function removeNodeSource(nodes: readonly Node[], id: number, index: number): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  const sources = target?.sources;
  if (sources === undefined || index < 0 || index >= sources.length) return null;
  const nextSources = sources.filter((_, sourceIndex) => sourceIndex !== index);
  return nodes.map((node) => (node.id === id ? withNodeSources(node, nextSources) : node));
}
