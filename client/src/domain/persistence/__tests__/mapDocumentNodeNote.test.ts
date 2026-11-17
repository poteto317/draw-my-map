import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import { normalizeMapDocumentNodeNote } from "@/domain/persistence/mapDocumentNodeNote";

const ERROR = "node[2].noteは10000文字以内の文字列である必要があります。";

describe("normalizeMapDocumentNodeNote", () => {
  it.each([1, 2] as const)("V%d では note を無視して undefined を返す（不正な値でも失敗にしない）", (version) => {
    expect(normalizeMapDocumentNodeNote("メモ", 0, version)).toEqual({ ok: true, value: undefined });
    expect(normalizeMapDocumentNodeNote(123, 0, version)).toEqual({ ok: true, value: undefined });
  });

  it("V3 で undefined なら undefined", () => {
    expect(normalizeMapDocumentNodeNote(undefined, 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 の文字列は、前後の空白・改行を削らずに返す", () => {
    expect(normalizeMapDocumentNodeNote("  本文\n", 0, 3)).toEqual({ ok: true, value: "  本文\n" });
  });

  it("V3 の空白だけのメモは undefined（項目ごと持たない）", () => {
    expect(normalizeMapDocumentNodeNote(" \n\t　", 0, 3)).toEqual({ ok: true, value: undefined });
  });

  it("V3 の末尾の対になっていない上位サロゲートは削る", () => {
    expect(normalizeMapDocumentNodeNote("メモ\uD83D", 0, 3)).toEqual({ ok: true, value: "メモ" });
  });

  it("ちょうど上限は受け付ける", () => {
    const max = "a".repeat(NODE_NOTE_MAX_LENGTH);

    expect(normalizeMapDocumentNodeNote(max, 0, 3)).toEqual({ ok: true, value: max });
  });

  it.each([null, 1, true, {}, ["a"], "a".repeat(NODE_NOTE_MAX_LENGTH + 1)])("V3 で不正な note（%p）は失敗", (note) => {
    expect(normalizeMapDocumentNodeNote(note, 2, 3)).toEqual({ ok: false, error: ERROR });
  });

  it("上限は入力の length で、正規化より先に判定する（削れば上限内になる値も拒否する。L-443）", () => {
    const note = `${"a".repeat(NODE_NOTE_MAX_LENGTH)}\uD83D`;

    expect(normalizeMapDocumentNodeNote(note, 2, 3)).toEqual({ ok: false, error: ERROR });
  });
});
