import {
  formatOutlineCurrentLength,
  formatOutlineImportSuccess,
  formatOutlineInsertFailure,
  formatOutlineParseError,
  formatOutlinePreviewSummary,
  formatOutlinePreviewTruncation,
  formatOutlineWarning,
  OUTLINE_ROOT_TARGET_LABEL,
  OUTLINE_TOO_LONG_MESSAGE,
} from "../outlineMessages";
import type { ParsedOutline } from "../outlineParser";
import type { OutlinePreview } from "../outlinePreview";

describe("formatOutlineWarning", () => {
  it("階層の補正は件数と行番号を示す", () => {
    expect(
      formatOutlineWarning({
        kind: "depth-adjusted",
        count: 3,
        lineNumbers: [3, 7, 12],
      }),
    ).toBe(
      "階層が合わない行を 3 行補正しました（3、7、12行目）。プレビューで親子関係を確かめてください。",
    );
  });

  it("記号だけの行は1件でも同じ形", () => {
    expect(
      formatOutlineWarning({ kind: "empty-label", count: 1, lineNumbers: [5] }),
    ).toBe("記号だけの行を 1 行取り込みません（5行目）。");
  });

  it("長い行は件数と行番号を示す", () => {
    expect(
      formatOutlineWarning({
        kind: "long-label",
        count: 3,
        lineNumbers: [9, 10, 11],
      }),
    ).toBe(
      "200文字を超える行が 3 行あります（9、10、11行目）。そのまま取り込みます。",
    );
  });

  it("行番号が件数より少ないときは「ほか」を付ける", () => {
    expect(
      formatOutlineWarning({
        kind: "depth-adjusted",
        count: 7,
        lineNumbers: [3, 7, 12, 15, 20],
      }),
    ).toBe(
      "階層が合わない行を 7 行補正しました（3、7、12、15、20行目ほか）。プレビューで親子関係を確かめてください。",
    );
  });

  it("件数は桁区切りで表示する", () => {
    expect(
      formatOutlineWarning({
        kind: "empty-label",
        count: 1234,
        lineNumbers: [1, 2, 3, 4, 5],
      }),
    ).toBe("記号だけの行を 1,234 行取り込みません（1、2、3、4、5行目ほか）。");
  });
});

describe("formatOutlineParseError", () => {
  it("文字数超過", () => {
    expect(OUTLINE_TOO_LONG_MESSAGE).toBe(
      "テキストが長すぎます（1,000,000文字以内）。",
    );
    expect(
      formatOutlineParseError({ kind: "too-long", length: 1_000_001 }),
    ).toBe("テキストが長すぎます（1,000,000文字以内）。");
  });

  it("行数超過は現在の行数を桁区切りで示す", () => {
    expect(
      formatOutlineParseError({ kind: "too-many-lines", lines: 10_001 }),
    ).toBe("行が多すぎます（空行を除いて10,000行以内）。現在 10,001 行です。");
  });

  it("取り込める行がない", () => {
    expect(formatOutlineParseError({ kind: "no-items" })).toBe(
      "取り込める行がありません。空行と記号だけの行は取り込みません。",
    );
  });
});

describe("formatOutlineCurrentLength", () => {
  it("桁区切りで現在の文字数を示す", () => {
    expect(formatOutlineCurrentLength(1_000_123)).toBe("現在 1,000,123 文字");
  });
});

describe("formatOutlinePreviewSummary", () => {
  it("件数・根の数・最も深い階層（maxDepth + 1 段目）を示す", () => {
    const outline: ParsedOutline = {
      items: Array.from({ length: 1234 }, (_, index) => ({
        label: `x${index}`,
        depth: 0,
        parentIndex: null,
        lineNumber: index + 1,
      })),
      rootCount: 3,
      maxDepth: 4,
      warnings: [],
    };
    expect(formatOutlinePreviewSummary(outline)).toBe(
      "追加するノード: 1,234件（一番上の階層: 3件、最も深い階層: 5段目）",
    );
  });
});

describe("formatOutlinePreviewTruncation", () => {
  it("打ち切ったときは表示件数と全件数を示す", () => {
    const preview: OutlinePreview = {
      roots: [],
      shownCount: 200,
      totalCount: 1234,
      truncated: true,
    };
    expect(formatOutlinePreviewTruncation(preview)).toBe(
      "先頭の200件を表示しています（全1,234件）。",
    );
  });

  it("打ち切らないときは null", () => {
    const preview: OutlinePreview = {
      roots: [],
      shownCount: 200,
      totalCount: 200,
      truncated: false,
    };
    expect(formatOutlinePreviewTruncation(preview)).toBeNull();
  });
});

describe("formatOutlineImportSuccess", () => {
  it("追加した件数を桁区切りで示し、移動と表示の切り替えを案内する", () => {
    expect(formatOutlineImportSuccess(1234)).toBe(
      "1,234件のノードを追加しました。Fキーで選択ノードへ移動できます。見えない場合は表示を『すべて』に切り替えてください。",
    );
  });
});

describe("OUTLINE_ROOT_TARGET_LABEL", () => {
  it("追加する位置の選択肢「新しいルートとして追加」の文言を持つ", () => {
    expect(OUTLINE_ROOT_TARGET_LABEL).toBe("新しいルートとして追加");
  });

  it("親が無いときの失敗の案内は、選択肢の文言をそのまま括弧で引用する", () => {
    expect(formatOutlineInsertFailure("parent-missing")).toContain(
      `「${OUTLINE_ROOT_TARGET_LABEL}」を選び直してください。`,
    );
  });
});

describe("formatOutlineInsertFailure", () => {
  it("親が無いときは追加先の選び直しを案内する", () => {
    expect(formatOutlineInsertFailure("parent-missing")).toBe(
      "選択していたノードが見つからないため、追加できませんでした。「新しいルートとして追加」を選び直してください。",
    );
  });

  it("不正な項目のときはマップが変わっていないことを示す", () => {
    expect(formatOutlineInsertFailure("invalid-items")).toBe(
      "ノードを追加できませんでした。マップは変わっていません。",
    );
  });

  it("配置の失敗のときはマップが変わっていないことを示す", () => {
    expect(formatOutlineInsertFailure("placement-failed")).toBe(
      "ノードを追加できませんでした。マップは変わっていません。",
    );
  });
});
