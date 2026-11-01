import { formatBranchMoveMapOption } from "@/components/layout/branchMoveMapOption";
import { formatMapUpdatedAt } from "@/domain/mapLibrary/mapTimestamp";

const UPDATED_AT = "2026-10-31T00:00:00.000Z";
const other = { id: "other", name: "別", updatedAt: UPDATED_AT };

describe("formatBranchMoveMapOption", () => {
  it("名前が重ならないほかのマップは名前だけを出す", () => {
    expect(formatBranchMoveMapOption(other, [other], "current")).toBe("別");
  });

  it("現在のマップに印を付ける", () => {
    const current = { id: "current", name: "今", updatedAt: UPDATED_AT };
    expect(formatBranchMoveMapOption(current, [current, other], "current")).toBe("今（現在のマップ）");
  });

  it("同名のマップは更新日時で見分ける", () => {
    const same = { id: "same", name: "別", updatedAt: UPDATED_AT };
    expect(formatBranchMoveMapOption(other, [other, same], "current")).toBe(`別（${formatMapUpdatedAt(UPDATED_AT)}）`);
  });

  it("現在のマップが同名なら印と更新日時を両方出す", () => {
    const same = { id: "same", name: "別", updatedAt: UPDATED_AT };
    expect(formatBranchMoveMapOption(other, [other, same], "other")).toBe(`別（現在のマップ・${formatMapUpdatedAt(UPDATED_AT)}）`);
  });
});
