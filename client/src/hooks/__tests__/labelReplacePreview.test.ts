import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
import {
  describeLabelReplaceStatus,
  LABEL_REPLACE_PREVIEW_LIMIT,
  selectLabelReplacePreviewRows,
} from "@/hooks/labelReplacePreview";
import type { LabelReplaceRow, LabelReplaceRowStatus } from "@/domain/search/nodeLabelReplace";

function row(nodeId: number, status: LabelReplaceRowStatus): LabelReplaceRow {
  return { nodeId, before: `b${nodeId}`, after: status === "emptied" ? "" : `a${nodeId}`, matchCount: 1, status };
}

describe("selectLabelReplacePreviewRows", () => {
  it("unchanged の行は出さない", () => {
    const rows = [row(1, "unchanged"), row(2, "replace")];

    expect(selectLabelReplacePreviewRows(rows)).toEqual({ shown: [rows[1]], hiddenReplaceCount: 0 });
  });

  it("上限を超えた replace は先頭から上限件数だけ残し、残りの件数を返す", () => {
    const rows = Array.from({ length: LABEL_REPLACE_PREVIEW_LIMIT + 3 }, (_, index) => row(index + 1, "replace"));

    const { shown, hiddenReplaceCount } = selectLabelReplacePreviewRows(rows);

    expect(shown).toEqual(rows.slice(0, LABEL_REPLACE_PREVIEW_LIMIT));
    expect(hiddenReplaceCount).toBe(3);
  });

  it("emptied は上限の枠に数えず、上限を超えた後でも常に残す", () => {
    const rows = [
      ...Array.from({ length: LABEL_REPLACE_PREVIEW_LIMIT }, (_, index) => row(index + 1, "replace")),
      row(1000, "emptied"),
      row(1001, "replace"),
    ];

    const { shown, hiddenReplaceCount } = selectLabelReplacePreviewRows(rows);

    expect(shown).toHaveLength(LABEL_REPLACE_PREVIEW_LIMIT + 1);
    expect(shown[LABEL_REPLACE_PREVIEW_LIMIT]).toBe(rows[LABEL_REPLACE_PREVIEW_LIMIT]);
    expect(hiddenReplaceCount).toBe(1);
  });
});

describe("describeLabelReplaceStatus", () => {
  it("stale のときは、ほかの状態より先に更新を促す文言を返す", () => {
    expect(describeLabelReplaceStatus({ stale: true, query: "a", matchedRowCount: 1, replaceCount: 1, emptiedCount: 0 })).toBe(STALE_DIALOG_MESSAGE);
  });

  it("検索語が空なら入力を求める", () => {
    expect(describeLabelReplaceStatus({ stale: false, query: "", matchedRowCount: 0, replaceCount: 0, emptiedCount: 0 })).toBe("検索語を入力してください。");
  });

  it("一致する行（unchanged を除く）が無ければ一致なしを返す", () => {
    expect(describeLabelReplaceStatus({ stale: false, query: "a", matchedRowCount: 0, replaceCount: 0, emptiedCount: 0 })).toBe("一致するノードがありません。");
  });

  it("置換できる行が無く、空になる行だけがあるときは置換できないことを返す", () => {
    expect(describeLabelReplaceStatus({ stale: false, query: "a", matchedRowCount: 2, replaceCount: 0, emptiedCount: 2 })).toBe("置換できるノードがありません。");
  });

  it("置換する件数を返し、空になる行があれば対象外の件数を添える", () => {
    expect(describeLabelReplaceStatus({ stale: false, query: "a", matchedRowCount: 3, replaceCount: 3, emptiedCount: 0 })).toBe("3件を置換します。");
    expect(describeLabelReplaceStatus({ stale: false, query: "a", matchedRowCount: 3, replaceCount: 2, emptiedCount: 1 })).toBe("2件を置換します。1件は置換後に空になるため対象外です。");
  });
});
