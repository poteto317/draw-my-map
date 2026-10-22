process.env.TZ = "Asia/Tokyo";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLibraryListScreen } from "@/components/layout/MapLibraryListScreen";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";

type Props = Parameters<typeof MapLibraryListScreen>[0];

const maps: MapIndexEntry[] = [
  {
    id: "b",
    name: "旅行の計画",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-21T03:00:00.000Z",
  },
  {
    id: "a",
    name: "旅行の計画",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-20T01:05:00.000Z",
  },
  {
    id: "c",
    name: "読書メモ",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-19T00:00:00.000Z",
  },
];

function renderList(overrides: Partial<Props> = {}) {
  const props: Props = {
    headingId: "map-library-heading",
    maps,
    currentMapId: "a",
    onOpenCreate: jest.fn(),
    onClose: jest.fn(),
    onSwitch: jest.fn(),
    onOpenRename: jest.fn(),
    onOpenDelete: jest.fn(),
    ...overrides,
  };
  render(<MapLibraryListScreen {...props} />);
  return props;
}

function rows() {
  return within(screen.getByRole("list", { name: "保存済みのマップ" })).getAllByRole(
    "listitem",
  );
}

describe("MapLibraryListScreen", () => {
  it("見出し・新しいマップ・閉じるのボタンを表示する", () => {
    renderList();

    const heading = screen.getByRole("heading", { name: "マップ一覧" });
    expect(heading).toHaveAttribute("id", "map-library-heading");
    expect(screen.getByRole("button", { name: "新しいマップ" })).toHaveAttribute(
      "data-map-action",
      "create",
    );
    expect(screen.getByRole("button", { name: "閉じる" })).toBeInTheDocument();
  });

  it("渡された表示順のとおりに行を並べ、同じ名前の行を更新日時で見分けられる", () => {
    renderList();

    const items = rows();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("旅行の計画");
    expect(items[0]).toHaveTextContent("更新: 2026/10/21 12:00");
    expect(items[1]).toHaveTextContent("旅行の計画");
    expect(items[1]).toHaveTextContent("更新: 2026/10/20 10:05");
    expect(items[2]).toHaveTextContent("読書メモ");
    expect(items[2]).toHaveTextContent("更新: 2026/10/19 09:00");
  });

  it("開いているマップの行だけに aria-current と「（開いています）」を付ける", () => {
    renderList();

    const openButtons = rows().map((item) =>
      item.querySelector('[data-map-action="open"]'),
    );
    expect(openButtons[0]).not.toHaveAttribute("aria-current");
    expect(openButtons[1]).toHaveAttribute("aria-current", "true");
    expect(openButtons[1]).toHaveTextContent("（開いています）");
    expect(openButtons[0]).not.toHaveTextContent("（開いています）");
    expect(openButtons[2]).not.toHaveTextContent("（開いています）");
  });

  it("各ボタンの名前が見える文字を先頭に含む", () => {
    renderList();

    const [, second] = rows();
    const scoped = within(second);
    const openButton = scoped.getByRole("button", { name: /^旅行の計画/ });
    expect(openButton).toHaveAttribute("data-map-id", "a");
    expect(openButton).toHaveAttribute("data-map-action", "open");

    const rename = scoped.getByRole("button", { name: "名前を変更: 旅行の計画" });
    expect(rename).toHaveTextContent(/^名前を変更$/);
    expect(rename).toHaveAttribute("data-map-id", "a");
    expect(rename).toHaveAttribute("data-map-action", "rename");

    const remove = scoped.getByRole("button", { name: "削除: 旅行の計画" });
    expect(remove).toHaveTextContent(/^削除$/);
    expect(remove).toHaveAttribute("data-map-id", "a");
    expect(remove).toHaveAttribute("data-map-action", "delete");
  });

  it("各行のボタンがその行の id をコールバックへ渡す", async () => {
    const user = userEvent.setup();
    const props = renderList();
    const [first, , third] = rows();

    await user.click(within(third).getByRole("button", { name: /^読書メモ/ }));
    await user.click(within(first).getByRole("button", { name: "名前を変更: 旅行の計画" }));
    await user.click(within(third).getByRole("button", { name: "削除: 読書メモ" }));

    expect(props.onSwitch).toHaveBeenCalledTimes(1);
    expect(props.onSwitch).toHaveBeenCalledWith("c");
    expect(props.onOpenRename).toHaveBeenCalledTimes(1);
    expect(props.onOpenRename).toHaveBeenCalledWith("b");
    expect(props.onOpenDelete).toHaveBeenCalledTimes(1);
    expect(props.onOpenDelete).toHaveBeenCalledWith("c");
  });

  it("新しいマップと閉じるのボタンがコールバックを呼ぶ", async () => {
    const user = userEvent.setup();
    const props = renderList();

    await user.click(screen.getByRole("button", { name: "新しいマップ" }));
    await user.click(screen.getByRole("button", { name: "閉じる" }));

    expect(props.onOpenCreate).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
