import {
  decodeFolderFilterValue,
  encodeFolderFilterValue,
} from "@/components/layout/mapListFolderFilterValue";
import type { MapListFolderFilter } from "@/domain/mapLibrary/mapLibraryMeta";

describe("mapListFolderFilterValue", () => {
  it.each<[MapListFolderFilter, string]>([
    [{ kind: "all" }, "all"],
    [{ kind: "unclassified" }, "unclassified"],
    [{ kind: "folder", folderId: "f-1" }, "folder:f-1"],
  ])("絞り込み %o を select の値 %s に変換し、元に戻せる", (filter, value) => {
    expect(encodeFolderFilterValue(filter)).toBe(value);
    expect(decodeFolderFilterValue(value)).toEqual(filter);
  });

  it("フォルダー ID が名前の「all」「unclassified」と同じでも区別する", () => {
    expect(decodeFolderFilterValue(encodeFolderFilterValue({ kind: "folder", folderId: "all" })))
      .toEqual({ kind: "folder", folderId: "all" });
  });

  it.each(["", "folder:", "folder:不正な id", "unknown"])(
    "解釈できない値 %p はすべてのフォルダーへ戻す",
    (value) => {
      expect(decodeFolderFilterValue(value)).toEqual({ kind: "all" });
    },
  );
});
