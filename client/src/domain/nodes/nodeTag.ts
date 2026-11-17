import type { Node } from "@/types/node";

// 1 ノードに付けられるタグの件数の上限
export const NODE_TAGS_MAX_COUNT = 10;
// タグ名の長さの上限（string.length。空白をまとめた後の値に掛ける）
export const NODE_TAG_MAX_LENGTH = 30;
// 入力の長さの先行判定（前後の空白を削った後の length）。巨大な入力で空白のまとめなどの処理をしない（L-443）
export const NODE_TAG_INPUT_MAX_LENGTH = 256;

export type NodeTagNameFailureReason = "empty" | "too-long" | "invalid";

export type NodeTagNameResult =
  | { ok: true; name: string }
  | { ok: false; reason: NodeTagNameFailureReason };

export type AddNodeTagFailureReason = NodeTagNameFailureReason | "node-missing" | "duplicate" | "too-many";

export type AddNodeTagResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: AddNodeTagFailureReason };

// useNodes.addNodeTag の戻り値（ノード配列を含めない。AddNodeLinkOutcome と同じ分け方）
export type AddNodeTagOutcome =
  | { ok: true }
  | { ok: false; reason: AddNodeTagFailureReason };

// 連続する空白（タブ・改行・全角の空白 U+3000・NBSP・BOM を含む \s）
const WHITESPACE_RUN = /\s+/g;

// 見えない書式文字（Unicode の Default_Ignorable_Code_Point。ゼロ幅スペース U+200B・双方向制御・WORD JOINER U+2060 など・
// ソフトハイフン U+00AD・ハングルの埋め字・異体字セレクタ・タグ文字 U+E0000 台）。\s にも NFKC にも消えないので、
// 見た目が同じタグが並ぶのを避けるため拒否する（L-816・L-112。文字を列挙すると解釈の差の数だけ漏れる: L-032）。
// BOM U+FEFF は、先に空白のまとめ（\s）で半角スペースになるので、ここには届かない。
// 行内注釈の制御 U+FFF9〜U+FFFB は、Default_Ignorable_Code_Point に含まれない（書式文字 Cf）が、同じく見えないので足す
const INVISIBLE_FORMAT = /[\p{Default_Ignorable_Code_Point}\u{FFF9}-\u{FFFB}]/u;

// 絵文字に要るので許可する見えない書式文字（同じタグかどうかの比較では nodeTagKey が NFKC の前に除く。除いた後の空白は鍵でまとめて trim する）: ゼロ幅結合子 U+200D（連結）、異体字セレクタ U+FE0E・U+FE0F（表示の切り替え）
function isAllowedInvisibleCodePoint(codePoint: number): boolean {
  return codePoint === 0x200d || codePoint === 0xfe0e || codePoint === 0xfe0f;
}

// 制御文字: U+0000〜U+0008・U+000E〜U+001F・U+007F〜U+009F（U+0085 を含む。タブ・改行などの U+0009〜U+000D は
// 先に空白としてまとめるので残らない）。正規表現に書くと no-control-regex に当たるので、コード単位で判定する
function isControlCodeUnit(code: number): boolean {
  return code <= 0x08 || (code >= 0x0e && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
}

// タグ名に使えない文字を含むか。制御文字はコード単位、見えない書式文字はコードポイント単位（サロゲートペアの
// U+E0000 台を含む）で判定する。対になっていないサロゲートは特別に扱わない
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

// タグ名の入力を、保存する名前にする。検証と保存と表示は同じ値を使う（L-018）。
// 検査の順: 前後の空白を削る → 空 → 入力の長さの先行判定（L-443）→ 連続する空白を半角スペース 1 個にまとめる →
// 使えない文字（invalid）→ 許可した見えない書式文字（と空白）だけで見た目が空（nodeTagKey が空。invalid）→
// まとめた後の長さ（too-long）。大文字小文字・全角半角は変えない（最初の表記を残す）
export function normalizeNodeTagName(input: string): NodeTagNameResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (trimmed.length > NODE_TAG_INPUT_MAX_LENGTH) return { ok: false, reason: "too-long" };
  const collapsed = trimmed.replace(WHITESPACE_RUN, " ");
  if (hasForbiddenCharacter(collapsed)) return { ok: false, reason: "invalid" };
  if (nodeTagKey(collapsed) === "") return { ok: false, reason: "invalid" };
  if (collapsed.length > NODE_TAG_MAX_LENGTH) return { ok: false, reason: "too-long" };
  return { ok: true, name: collapsed };
}

// ZWJ U+200D・異体字セレクタ U+FE0E・U+FE0F。名前には残すが、同じタグかどうかの比較では無視する
const IGNORED_IN_TAG_KEY = /[\u200d\ufe0e\ufe0f]/gu;

// 同じタグとみなすための鍵（U+200D・U+FE0E・U+FE0F を除く → NFKC → 空白のまとめと trim → 小文字化 → NFKC）。NFKC と小文字化はノード検索
// （domain/search/nodeLabelSearch.ts の normalizeNodeSearchText）と同じ規則だが、domain/search が domain/nodes に
// 依存しているため、ここに同じ規則を持つ。U+200D・U+FE0E・U+FE0F は絵文字のために名前へ許可しているが、見た目に
// 現れず NFKC でも消えないので、鍵から除かないと見た目が同じタグ（AI と A + U+200D + I など）が別のタグになる。
// 除くのは NFKC より前: この 3 文字は NFKC の合成を止めるので、後で除くと分解された列が残り、見た目が同じ
// 合成済みの文字（é と e + U+200D + U+0301 など）と鍵が一致しない。
// 空白のまとめと trim は normalizeNodeTagName と同じ規則（WHITESPACE_RUN）。名前の検査では 3 文字を除く前にまとめるので、
// 除いた後に前後や連続の空白が残る（AI と "AI " + U+200D など）。鍵でも同じ規則をもう一度かけて、見た目が同じタグを
// 同じ鍵にし、見た目が空白だけの名前は鍵を空にする（NFKC が空白にするものがあるので、NFKC の後にかける）。
// 最後にもう一度 NFKC をかけるのは、toLowerCase の結果が NFKC の正規形とは限らないため（Ϊ + 結合アキュートの小文字化は
// 合成済みの ΐ にならないなど）。かけないと nodeTagKey(nodeTagKey(x)) !== nodeTagKey(x) になり、大文字小文字だけが違う
// 同じタグが別の鍵になる。
// 除くので、絵文字の ❤ と ❤️ も同じタグになる（保存する名前は変えず、最初の表記を残す）
export function nodeTagKey(name: string): string {
  return name.replace(IGNORED_IN_TAG_KEY, "").normalize("NFKC").replace(WHITESPACE_RUN, " ").trim().toLowerCase().normalize("NFKC");
}

// 同じタグとみなすもの（nodeTagKey が同じ）は、最初に出てきたものを残して除く（順と表記は最初のもの。元の並びは変えない）。
// 統合の連結（nodeMerge.ts）と保存データの検証（mapDocumentNodeTags.ts）が使う
export function uniqueNodeTags(tags: readonly string[]): string[] {
  const keys = new Set<string>();
  const unique: string[] = [];
  for (const tag of tags) {
    const key = nodeTagKey(tag);
    if (keys.has(key)) continue;
    keys.add(key);
    unique.push(tag);
  }
  return unique;
}

// 2 つのタグの並びが同じか（要素ごと。順も区別する）。undefined は空の並びと同じに扱う
export function areNodeTagsEqual(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

// 利用者向けの失敗の文言。empty は部品が文言を出さないので取らない
export function formatNodeTagFailure(reason: Exclude<AddNodeTagFailureReason, "empty">): string {
  switch (reason) {
    case "too-long":
      return `タグ名が長すぎます（${NODE_TAG_MAX_LENGTH} 文字まで）。`;
    case "invalid":
      return "タグ名に使えない文字が含まれています。";
    case "duplicate":
      return "同じタグがすでに追加されています。";
    case "too-many":
      return `タグは 1 つのノードに ${NODE_TAGS_MAX_COUNT} 件まで追加できます。`;
    case "node-missing":
      return "ノードが見つかりません。";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

// ノードのタグを tags にしたノードを返す（元のノードは変えない）。undefined・空の並びなら tags のキーごと外す
// （空配列や tags: undefined を残さない）。値の検証はしない（呼び出し側の責務）
export function withNodeTags(node: Node, tags: readonly string[] | undefined): Node {
  if (tags !== undefined && tags.length > 0) return { ...node, tags };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で tags を除外するため
  const { tags: _removed, ...rest } = node;
  return rest;
}

// 1 ノードのタグの末尾に 1 件足す。検査の順: node-missing → タグ名の検査 → duplicate（nodeTagKey が同じ）→ too-many。
// 成功時は対象のノードだけを新しいオブジェクトにし、ほかのノードは同じ参照のまま返す
export function addNodeTag(nodes: readonly Node[], id: number, input: string): AddNodeTagResult {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  const normalized = normalizeNodeTagName(input);
  if (!normalized.ok) return normalized;
  const current = target.tags ?? [];
  const key = nodeTagKey(normalized.name);
  if (current.some((tag) => nodeTagKey(tag) === key)) return { ok: false, reason: "duplicate" };
  if (current.length >= NODE_TAGS_MAX_COUNT) return { ok: false, reason: "too-many" };
  const nextTags = [...current, normalized.name];
  return { ok: true, nodes: nodes.map((node) => (node.id === id ? withNodeTags(node, nextTags) : node)) };
}

// 1 ノードからタグを 1 件消す。tag は保存されている名前と完全に一致するものだけを消す（表記違いは消さない）。
// 対象が無い・そのタグを持たないときは null（何も変えない）。最後の 1 件を消すと tags のキーごと外す
export function removeNodeTag(nodes: readonly Node[], id: number, tag: string): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  const tags = target?.tags;
  if (tags === undefined || !tags.includes(tag)) return null;
  const nextTags = tags.filter((item) => item !== tag);
  return nodes.map((node) => (node.id === id ? withNodeTags(node, nextTags) : node));
}
