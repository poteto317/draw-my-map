import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLibraryListFilters } from "@/components/layout/MapLibraryListFilters";
import type { MapFolder } from "@/domain/mapLibrary/mapLibraryMeta";

const folders: MapFolder[] = [
  { id: "f1", name: "仕事", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" },
];

function renderFilters(overrides: Partial<Parameters<typeof MapLibraryListFilters>[0]> = {}) {
  const props = {
    listTab: "all" as const,
    folderFilter: { kind: "all" } as const,
    folders,
    buttonClassName: "button",
    selectClassName: "select",
    onChangeListTab: jest.fn(),
    onChangeFolderFilter: jest.fn(),
    ...overrides,
  };
  render(<MapLibraryListFilters {...props} />);
  return props;
}

describe("MapLibraryListFilters", () => {
  it("選択中のタブだけを押下状態にし、押したタブを通知する", async () => {
    const user = userEvent.setup();
    const props = renderFilters({ listTab: "recent" });

    expect(screen.getByRole("button", { name: "すべて" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "最近使用" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "お気に入り" }));
    expect(props.onChangeListTab).toHaveBeenCalledWith("favorites");
  });

  it("フォルダーの選択肢を並べ、選んだ絞り込みを通知する", async () => {
    const user = userEvent.setup();
    const props = renderFilters({ folderFilter: { kind: "folder", folderId: "f1" } });
    const select = screen.getByRole("combobox", { name: "フォルダーで絞り込み" });

    expect(select).toHaveValue("folder:f1");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "すべてのフォルダー",
      "未分類",
      "仕事",
    ]);
    await user.selectOptions(select, "unclassified");
    expect(props.onChangeFolderFilter).toHaveBeenCalledWith({ kind: "unclassified" });
  });
});
