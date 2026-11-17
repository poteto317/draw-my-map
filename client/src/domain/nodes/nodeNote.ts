import type { Node } from "@/types/node";

// 詳細メモの上限。数え方は string.length（UTF-16 のコード単位。textarea の maxLength と同じで、絵文字などは 2 文字分）
export const NODE_NOTE_MAX_LENGTH = 10000;

// 統合で複数のノードのメモをつなぐ区切り（空行）
export const NODE_NOTE_MERGE_JOINER = "\n\n";

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

// メモの入力を保存する値にする。末尾が対になっていない上位サロゲートなら 1 単位削る（maxLength で絵文字の途中を
// 切られた場合の保護。L-636）。削った後が空白だけ（空文字を含む）なら「メモなし」として undefined。
// それ以外は値のまま返し、前後の空白・改行は削らない。上限を超える値も切り詰めない（超過の判定は呼び出し側）
export function normalizeNodeNote(value: string): string | undefined {
  const lastIndex = value.length - 1;
  const withoutLoneHigh = lastIndex >= 0 && isHighSurrogate(value.charCodeAt(lastIndex))
    ? value.slice(0, lastIndex)
    : value;
  return withoutLoneHigh.trim() === "" ? undefined : withoutLoneHigh;
}

export function isNodeNoteWithinLimit(value: string): boolean {
  return value.length <= NODE_NOTE_MAX_LENGTH;
}

// 文字数の表示（3 桁区切り）。パネルの「N / 10,000 文字」と統合のプレビューで共有する
export function formatNodeNoteLength(length: number): string {
  return length.toLocaleString("ja-JP");
}

// ノードのメモを note にしたノードを返す（元のノードは変えない）。undefined（メモなし）なら note のキーごと外す
// （note: undefined を残さない）。値の正規化・上限の判定はしない（呼び出し側の責務）
export function withNodeNote(node: Node, note: string | undefined): Node {
  if (note !== undefined) return { ...node, note };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で note を除外するため
  const { note: _removed, ...rest } = node;
  return rest;
}

// 1 ノードのメモを置き換える。note は正規化前の入力で、normalizeNodeNote を通した値で判定する。
// 対象が無い・正規化後の値が今と同じ・正規化後の値が上限超過のときは null（何も変えない。無変更は履歴に積まない。L-135）。
// メモなし（undefined）にするときは note のキーごと外す（withNodeNote）
export function replaceNodeNote(nodes: readonly Node[], id: number, note: string): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined) return null;
  const normalized = normalizeNodeNote(note);
  if (normalized !== undefined && !isNodeNoteWithinLimit(normalized)) return null;
  if (normalized === target.note) return null;

  return nodes.map((node) => (node.id === id ? withNodeNote(node, normalized) : node));
}
