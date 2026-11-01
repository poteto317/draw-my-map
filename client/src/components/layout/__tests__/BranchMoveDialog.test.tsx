import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BranchMoveDialog } from "@/components/layout/BranchMoveDialog";
import { formatMapUpdatedAt } from "@/domain/mapLibrary/mapTimestamp";

const TIMESTAMP = "2026-10-31T00:00:00.000Z";
const LATER_TIMESTAMP = "2026-10-31T03:30:00.000Z";

type Props = ComponentProps<typeof BranchMoveDialog>;

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    mapMoveTargets: [
      { id: "a", name: "A", updatedAt: TIMESTAMP },
      { id: "b", name: "B", updatedAt: TIMESTAMP },
    ],
    targetMapId: "a",
    currentMapId: "a",
    sameMap: true,
    parentCandidates: [{ id: 5, parentId: null, label: "親" }],
    nodes: [{ id: 5, parentId: null, label: "親" }],
    allowRoot: true,
    parentTarget: "5",
    canSubmit: true,
    error: { sequence: 0, message: null },
    focusRequest: "dialog",
    onFocusRequestApplied: () => {},
    onTargetMapChange: () => {},
    onParentTargetChange: () => {},
    onCancel: jest.fn(),
    onSubmit: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
}

function setup(overrides: Partial<Props> = {}) {
  const props = baseProps(overrides);
  render(<BranchMoveDialog {...props} />);
  return props;
}

it("最初のselectへフォーカスしTabを巡回、Escapeでキャンセルする", () => {
  const props = setup();
  const first = screen.getByLabelText("移動先マップ");
  expect(first).toHaveFocus();

  fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
  expect(screen.getByRole("button", { name: "移動する" })).toHaveFocus();

  fireEvent.keyDown(window, { key: "Tab" });
  expect(first).toHaveFocus();

  fireEvent.keyDown(window, { key: "Escape" });
  expect(props.onCancel).toHaveBeenCalledTimes(1);
});

it("移動先の親の選択肢で、同名のノードだけ親を併記する", () => {
  const nodes = [
    { id: 1, parentId: null, label: "親A" },
    { id: 2, parentId: 1, label: "同名" },
    { id: 3, parentId: null, label: "同名" },
    { id: 4, parentId: null, label: "別名" },
  ];
  setup({ nodes, parentCandidates: nodes.slice(1), parentTarget: "" });

  const select = screen.getByLabelText("移動先の親");
  expect(within(select).getByRole("option", { name: "同名（親: 親A）" })).toHaveValue("2");
  expect(within(select).getByRole("option", { name: "同名（ルート）" })).toHaveValue("3");
  expect(within(select).getByRole("option", { name: "別名" })).toHaveValue("4");
});

it("連続マウスclickの時刻は記録するが2回目の操作を止め、キーボードclickは記録しない", () => {
  const props = setup();
  const button = screen.getByRole("button", { name: "移動する" });

  fireEvent.click(button, { detail: 2 });
  expect(props.onMouseClick).toHaveBeenCalledTimes(1);
  expect(props.onSubmit).not.toHaveBeenCalled();

  fireEvent.click(button, { detail: 0 });
  expect(props.onMouseClick).toHaveBeenCalledTimes(1);
  expect(props.onSubmit).toHaveBeenCalledTimes(1);
});

it("revision変更によるエラーを確定不可とともに表示する", async () => {
  const props = baseProps({ parentCandidates: [], parentTarget: "root", focusRequest: null });
  const view = render(<BranchMoveDialog {...props} />);

  view.rerender(
    <BranchMoveDialog
      {...props}
      canSubmit={false}
      error={{ sequence: 1, message: "マップが更新されました。" }}
    />,
  );

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("マップが更新されました。"));
  expect(screen.getByRole("button", { name: "移動する" })).toBeDisabled();
});

it("別マップの選択中は、取り消せないことを「移動する」の説明に結ぶ", () => {
  setup({ targetMapId: "b", sameMap: false });

  expect(screen.getByRole("button", { name: "移動する" }))
    .toHaveAccessibleDescription("別マップへの移動は元に戻せません。移動後に移動先を開きます。");
});

it("同一マップの選択中は「移動する」に取り消せない旨の説明を付けない", () => {
  setup();

  expect(screen.getByRole("button", { name: "移動する" })).not.toHaveAccessibleDescription();
});

it("現在のマップに印を付け、それ以外の名前はそのまま出す", () => {
  setup();

  expect(screen.getByRole("option", { name: "A（現在のマップ）" })).toHaveValue("a");
  expect(screen.getByRole("option", { name: "B" })).toHaveValue("b");
});

it("同名のマップには更新日時を併記して見分けられるようにする", () => {
  setup({
    mapMoveTargets: [
      { id: "a", name: "同名", updatedAt: TIMESTAMP },
      { id: "b", name: "同名", updatedAt: LATER_TIMESTAMP },
      { id: "c", name: "別名", updatedAt: TIMESTAMP },
    ],
  });

  expect(screen.getByRole("option", { name: `同名（現在のマップ・${formatMapUpdatedAt(TIMESTAMP)}）` }))
    .toHaveValue("a");
  expect(screen.getByRole("option", { name: `同名（${formatMapUpdatedAt(LATER_TIMESTAMP)}）` }))
    .toHaveValue("b");
  expect(screen.getByRole("option", { name: "別名" })).toHaveValue("c");
});
