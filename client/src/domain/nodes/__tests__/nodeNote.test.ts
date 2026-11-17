import {
  NODE_NOTE_MAX_LENGTH,
  NODE_NOTE_MERGE_JOINER,
  formatNodeNoteLength,
  isNodeNoteWithinLimit,
  normalizeNodeNote,
  replaceNodeNote,
  withNodeNote,
} from "@/domain/nodes/nodeNote";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const EMOJI = "😀"; // 😀（UTF-16 で 2 単位）
const LONE_HIGH = "\uD83D";

describe("定数", () => {
  it("上限は 10,000（UTF-16 のコード単位）、統合の区切りは空行", () => {
    expect(NODE_NOTE_MAX_LENGTH).toBe(10000);
    expect(NODE_NOTE_MERGE_JOINER).toBe("\n\n");
  });
});

describe("normalizeNodeNote", () => {
  it.each(["", " ", "\n\n", "\t", "　", " \n　\t "])("空文字・空白だけ（%j）は undefined（メモなし）", (value) => {
    expect(normalizeNodeNote(value)).toBeUndefined();
  });

  it("前後の空白・改行は削らずにそのまま返す", () => {
    expect(normalizeNodeNote("  本文\n2行目\n\n")).toBe("  本文\n2行目\n\n");
  });

  it("末尾の対になっていない上位サロゲートを 1 単位削る（maxLength で絵文字の途中を切られた場合。L-636）", () => {
    expect(normalizeNodeNote(`メモ${LONE_HIGH}`)).toBe("メモ");
  });

  it("削った結果が空なら undefined", () => {
    expect(normalizeNodeNote(LONE_HIGH)).toBeUndefined();
    expect(normalizeNodeNote(` ${LONE_HIGH}`)).toBeUndefined();
  });

  it("末尾が完全な絵文字なら削らない", () => {
    expect(normalizeNodeNote(`メモ${EMOJI}`)).toBe(`メモ${EMOJI}`);
  });

  it("上限を超える値も切り詰めずにそのまま返す（超過の判定は呼び出し側）", () => {
    const over = "a".repeat(NODE_NOTE_MAX_LENGTH + 1);

    expect(normalizeNodeNote(over)).toBe(over);
  });
});

describe("isNodeNoteWithinLimit", () => {
  it("ちょうど上限は真、1 超過は偽", () => {
    expect(isNodeNoteWithinLimit("a".repeat(NODE_NOTE_MAX_LENGTH))).toBe(true);
    expect(isNodeNoteWithinLimit("a".repeat(NODE_NOTE_MAX_LENGTH + 1))).toBe(false);
  });

  it("絵文字は 2 文字分として数える", () => {
    expect(isNodeNoteWithinLimit(EMOJI.repeat(NODE_NOTE_MAX_LENGTH / 2))).toBe(true);
    expect(isNodeNoteWithinLimit(`${EMOJI.repeat(NODE_NOTE_MAX_LENGTH / 2)}a`)).toBe(false);
  });
});

describe("formatNodeNoteLength", () => {
  it.each([[0, "0"], [999, "999"], [10000, "10,000"]])("%d は %s と表示する", (length, expected) => {
    expect(formatNodeNoteLength(length)).toBe(expected);
  });
});

describe("withNodeNote", () => {
  const base = Object.freeze(createTestNode({ id: 1, label: "対象", note: "元のメモ" }));

  it("メモを渡すと、その値に置き換えたノードを返す（元のノードは変えない）", () => {
    const next = withNodeNote(base, "新しいメモ");

    expect(next).toEqual({ ...base, note: "新しいメモ" });
    expect(base.note).toBe("元のメモ");
  });

  it("undefined を渡すと note のキーごと外す（note: undefined を残さない）", () => {
    const next = withNodeNote(base, undefined);

    expect("note" in next).toBe(false);
    expect(next).toEqual({ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "対象", importance: "medium" });
  });

  it("メモの無いノードに undefined を渡しても、キーを持たないまま", () => {
    const plain = createTestNode({ id: 2 });

    expect("note" in withNodeNote(plain, undefined)).toBe(false);
  });
});

describe("replaceNodeNote", () => {
  // 1: メモあり、2: メモなし。ラベルは全ノードで変える（L-168）
  const nodes: readonly Node[] = Object.freeze([
    Object.freeze(createTestNode({ id: 1, label: "メモあり", note: "元のメモ" })),
    Object.freeze(createTestNode({ id: 2, label: "メモなし", x: 200 })),
  ]);

  it("対象のノードだけにメモを設定し、ほかのノードは同じオブジェクトのまま", () => {
    const next = replaceNodeNote(nodes, 2, "新しいメモ");

    expect(next?.[1]).toEqual({ ...nodes[1], note: "新しいメモ" });
    expect(next?.[0]).toBe(nodes[0]);
  });

  it("正規化した値で設定する（末尾の対になっていない上位サロゲートを削る）", () => {
    expect(replaceNodeNote(nodes, 2, `途中${LONE_HIGH}`)?.[1].note).toBe("途中");
  });

  it("空白だけにすると note のキーごと外す（note: undefined を残さない）", () => {
    const next = replaceNodeNote(nodes, 1, " \n ");

    expect(next).not.toBeNull();
    expect("note" in next![0]).toBe(false);
    expect(next![0]).toEqual({ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "メモあり", importance: "medium" });
  });

  it("ちょうど上限は設定できる", () => {
    const max = "a".repeat(NODE_NOTE_MAX_LENGTH);

    expect(replaceNodeNote(nodes, 2, max)?.[1].note).toBe(max);
  });

  it.each<[string, number, string]>([
    ["対象が無い", 99, "メモ"],
    ["正規化後の値が今と同じ", 1, "元のメモ"],
    ["メモの無いノードを空白だけにする（どちらもメモなし）", 2, "   "],
    ["正規化後の値が上限を 1 超える", 2, "a".repeat(NODE_NOTE_MAX_LENGTH + 1)],
  ])("%s ときは null（何も変えない。L-135）", (_name, id, note) => {
    expect(replaceNodeNote(nodes, id, note)).toBeNull();
  });

  it("上限 + 1 でも、末尾の対になっていない上位サロゲートを削ると上限内なら設定できる", () => {
    const note = `${"a".repeat(NODE_NOTE_MAX_LENGTH)}${LONE_HIGH}`;

    expect(replaceNodeNote(nodes, 2, note)?.[1].note).toBe("a".repeat(NODE_NOTE_MAX_LENGTH));
  });

  it("元の配列を変えない", () => {
    replaceNodeNote(nodes, 1, "変更");

    expect(nodes[0].note).toBe("元のメモ");
  });
});
