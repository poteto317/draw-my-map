process.env.TZ = "Asia/Tokyo";

import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLibraryConfirmActions } from "@/components/layout/MapLibraryConfirmActions";
import { MapLibraryTrashEmptyConfirm } from "@/components/layout/MapLibraryTrashEmptyConfirm";
import { MapLibraryTrashPermanentDeleteConfirm } from "@/components/layout/MapLibraryTrashPermanentDeleteConfirm";
import { MapLibraryTrashScreen } from "@/components/layout/MapLibraryTrashScreen";
import { UNKNOWN_MAP_TIMESTAMP } from "@/domain/mapLibrary/mapTimestamp";
import type { MapTrashEntry } from "@/domain/mapLibrary/mapTrash";

type TrashScreenProps = Parameters<typeof MapLibraryTrashScreen>[0];

const NOW = new Date("2026-11-14T12:00:00.000Z");

const entries: MapTrashEntry[] = [
  {
    id: "t1",
    originalMapId: "m1",
    name: "旅行の計画",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-21T03:00:00.000Z",
    deletedAt: "2026-11-10T01:05:00.000Z",
    expiresAt: "2026-12-10T01:05:00.000Z",
    hasBody: true,
  },
  {
    id: "t2",
    originalMapId: "m2",
    name: "期限切れのメモ",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    deletedAt: "2026-10-10T00:00:00.000Z",
    expiresAt: "2026-11-09T00:00:00.000Z",
    hasBody: false,
  },
];

const blockedKeys = [
  { key: "Enter", repeat: true },
  { key: " ", repeat: true },
  { key: "Enter", isComposing: true },
  { key: "Enter", keyCode: 229 },
  { key: " ", isComposing: true },
  { key: " ", keyCode: 229 },
];

function createTrashScreenProps(
  overrides: Partial<TrashScreenProps> = {},
): TrashScreenProps {
  return {
    headingId: "trash-heading",
    entries,
    trashStatus: "ok",
    now: NOW,
    onRestore: jest.fn(),
    onOpenPermanentDelete: jest.fn(),
    onOpenEmptyTrash: jest.fn(),
    onBackToList: jest.fn(),
    ...overrides,
  };
}

describe("MapLibraryTrashScreen", () => {
  it("見出し・説明文・一覧に戻るボタンを表示し、クリックで onBackToList を呼ぶ", async () => {
    const user = userEvent.setup();
    const props = createTrashScreenProps({ entries: [] });
    render(<MapLibraryTrashScreen {...props} />);

    expect(screen.getByRole("heading", { name: "ゴミ箱" })).toHaveAttribute(
      "id",
      "trash-heading",
    );
    expect(
      screen.getByText(
        "削除したマップは 30 日間保存されます。期限を過ぎると自動的に削除されます。",
      ),
    ).toBeInTheDocument();

    const backButton = screen.getByRole("button", { name: "一覧に戻る" });
    expect(backButton).toHaveAttribute("data-map-library-action", "backToList");

    await user.click(backButton);
    expect(props.onBackToList).toHaveBeenCalledTimes(1);
  });

  it("空状態のときは「ゴミ箱は空です。」を表示し、リストや「ゴミ箱を空にする」ボタンを出さない", () => {
    render(<MapLibraryTrashScreen {...createTrashScreenProps({ entries: [] })} />);

    expect(screen.getByText("ゴミ箱は空です。")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "ゴミ箱のマップ" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ゴミ箱を空にする" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "一覧に戻る" }),
    ).toBeInTheDocument();
  });

  it("通常状態では項目リストにマップ名・削除日時・更新日時・残り日数を表示し、各操作を配線する", async () => {
    const user = userEvent.setup();
    const props = createTrashScreenProps();
    render(<MapLibraryTrashScreen {...props} />);

    const list = screen.getByRole("list", { name: "ゴミ箱のマップ" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(items[0]).toHaveTextContent("旅行の計画");
    expect(items[0]).toHaveTextContent("削除: 2026/11/10 10:05");
    expect(items[0]).toHaveTextContent("更新: 2026/10/21 12:00");
    expect(items[0]).toHaveTextContent("あと 26 日");

    expect(items[1]).toHaveTextContent("期限切れのメモ");
    expect(items[1]).toHaveTextContent("削除: 2026/10/10 09:00");
    expect(items[1]).toHaveTextContent("更新: 2026/09/20 09:00");
    expect(items[1]).toHaveTextContent("期限切れ");

    const restoreBtn = within(items[0]).getByRole("button", {
      name: "復元: 旅行の計画",
    });
    expect(restoreBtn).toHaveTextContent(/^復元$/);
    expect(restoreBtn).toHaveAttribute("data-trash-id", "t1");
    expect(restoreBtn).toHaveAttribute("data-trash-action", "restore");

    const permanentDeleteBtn = within(items[1]).getByRole("button", {
      name: "完全に削除: 期限切れのメモ",
    });
    expect(permanentDeleteBtn).toHaveTextContent(/^完全に削除$/);
    expect(permanentDeleteBtn).toHaveAttribute("data-trash-id", "t2");
    expect(permanentDeleteBtn).toHaveAttribute(
      "data-trash-action",
      "permanentDelete",
    );

    const emptyBtn = screen.getByRole("button", { name: "ゴミ箱を空にする" });
    expect(emptyBtn).toHaveAttribute("data-map-library-action", "emptyTrash");

    await user.click(restoreBtn);
    await user.click(permanentDeleteBtn);
    await user.click(emptyBtn);

    expect(props.onRestore).toHaveBeenCalledWith("t1");
    expect(props.onOpenPermanentDelete).toHaveBeenCalledWith("t2");
    expect(props.onOpenEmptyTrash).toHaveBeenCalledTimes(1);
  });

  it("保持期限が UNKNOWN_MAP_TIMESTAMP のエントリは「期限不明」を表示する", () => {
    render(
      <MapLibraryTrashScreen
        {...createTrashScreenProps({
          entries: [
            {
              ...entries[0],
              deletedAt: UNKNOWN_MAP_TIMESTAMP,
              expiresAt: UNKNOWN_MAP_TIMESTAMP,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("削除: 不明")).toBeInTheDocument();
    expect(screen.getByText("期限不明")).toBeInTheDocument();
  });

  it("破損状態のときは読み込み失敗メッセージと「ゴミ箱を空にする」「一覧に戻る」を表示し、リストは出さない", async () => {
    const user = userEvent.setup();
    const props = createTrashScreenProps({
      entries: [],
      trashStatus: "corrupt",
    });
    render(<MapLibraryTrashScreen {...props} />);

    expect(
      screen.getByText(/ゴミ箱の読み込みに失敗しました/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "ゴミ箱のマップ" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ゴミ箱を空にする" }));
    await user.click(screen.getByRole("button", { name: "一覧に戻る" }));

    expect(props.onOpenEmptyTrash).toHaveBeenCalledTimes(1);
    expect(props.onBackToList).toHaveBeenCalledTimes(1);
  });

  it("全ボタンで repeat / IME キーを抑止し、detail > 1 の click を無視する", () => {
    const props = createTrashScreenProps();
    render(<MapLibraryTrashScreen {...props} />);

    const cases: Array<{
      button: HTMLElement;
      callback: jest.Mock;
      expectedArgs: unknown[];
    }> = [
      {
        button: screen.getByRole("button", { name: "復元: 旅行の計画" }),
        callback: props.onRestore as jest.Mock,
        expectedArgs: ["t1"],
      },
      {
        button: screen.getByRole("button", { name: "完全に削除: 旅行の計画" }),
        callback: props.onOpenPermanentDelete as jest.Mock,
        expectedArgs: ["t1"],
      },
      {
        button: screen.getByRole("button", { name: "ゴミ箱を空にする" }),
        callback: props.onOpenEmptyTrash as jest.Mock,
        expectedArgs: [],
      },
      {
        button: screen.getByRole("button", { name: "一覧に戻る" }),
        callback: props.onBackToList as jest.Mock,
        expectedArgs: [],
      },
    ];

    for (const { button, callback, expectedArgs } of cases) {
      for (const keyEvent of blockedKeys) {
        expect(fireEvent.keyDown(button, keyEvent)).toBe(false);
      }
      expect(fireEvent.keyDown(button, { key: "Enter" })).toBe(true);
      expect(fireEvent.keyDown(button, { key: " " })).toBe(true);

      fireEvent.click(button, { detail: 2 });
      expect(callback).not.toHaveBeenCalled();

      fireEvent.click(button, { detail: 1 });
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenLastCalledWith(...expectedArgs);

      fireEvent.click(button, { detail: 0 });
      expect(callback).toHaveBeenCalledTimes(2);
    }
  });
});

describe("MapLibraryConfirmActions", () => {
  it("confirmVariant 未指定のときは通常スタイル、danger 指定時は赤系スタイルを適用する", () => {
    const cancelRef = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <MapLibraryConfirmActions
        cancelButtonRef={cancelRef}
        confirmText="実行"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const defaultConfirm = screen.getByRole("button", { name: "実行" });
    expect(defaultConfirm.className).toContain("bg-zinc-100");
    expect(defaultConfirm.className).not.toContain("border-red-600");

    rerender(
      <MapLibraryConfirmActions
        cancelButtonRef={cancelRef}
        confirmText="実行"
        confirmVariant="danger"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const dangerConfirm = screen.getByRole("button", { name: "実行" });
    expect(dangerConfirm.className).toContain("border-red-600");
    expect(dangerConfirm.className).toContain("text-red-600");
  });
});

describe("MapLibraryTrashPermanentDeleteConfirm", () => {
  it("見出し・説明文・キャンセル先頭・danger 確認ボタンを表示し、誤操作を抑止する", () => {
    const cancelButtonRef = createRef<HTMLButtonElement>();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <MapLibraryTrashPermanentDeleteConfirm
        headingId="perm-heading"
        descriptionId="perm-desc"
        target={entries[0]}
        cancelButtonRef={cancelButtonRef}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("heading", { name: "完全に削除" })).toHaveAttribute(
      "id",
      "perm-heading",
    );
    expect(document.getElementById("perm-desc")).toHaveTextContent(
      /^ゴミ箱からマップ「旅行の計画」を完全に削除します。この操作は元に戻せません。$/,
    );

    const cancel = screen.getByRole("button", { name: "キャンセル" });
    const confirm = screen.getByRole("button", { name: "完全に削除" });
    expect(cancelButtonRef.current).toBe(cancel);
    expect(
      cancel.compareDocumentPosition(confirm) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(confirm.className).toContain("border-red-600");

    for (const keyEvent of blockedKeys) {
      expect(fireEvent.keyDown(confirm, keyEvent)).toBe(false);
    }
    fireEvent.click(confirm, { detail: 2 });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(confirm, { detail: 1 });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(cancel, { detail: 1 });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("MapLibraryTrashEmptyConfirm", () => {
  it("通常状態では件数を含む警告文言を表示し、danger 確認ボタンの誤操作を抑止する", () => {
    const cancelButtonRef = createRef<HTMLButtonElement>();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <MapLibraryTrashEmptyConfirm
        headingId="empty-heading"
        descriptionId="empty-desc"
        trashStatus="ok"
        count={3}
        cancelButtonRef={cancelButtonRef}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "ゴミ箱を空にする" }),
    ).toHaveAttribute("id", "empty-heading");
    expect(document.getElementById("empty-desc")).toHaveTextContent(
      /^ゴミ箱内の 3 件のマップをすべて完全に削除します。この操作は元に戻せません。$/,
    );

    const cancel = screen.getByRole("button", { name: "キャンセル" });
    const confirm = screen.getByRole("button", { name: "ゴミ箱を空にする" });
    expect(cancelButtonRef.current).toBe(cancel);
    expect(
      cancel.compareDocumentPosition(confirm) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(confirm.className).toContain("border-red-600");

    for (const keyEvent of blockedKeys) {
      expect(fireEvent.keyDown(confirm, keyEvent)).toBe(false);
    }
    fireEvent.click(confirm, { detail: 2 });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(confirm, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(cancel, { detail: 1 });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("破損状態では初期化の警告文言を表示する", () => {
    render(
      <MapLibraryTrashEmptyConfirm
        headingId="empty-heading"
        descriptionId="empty-desc"
        trashStatus="corrupt"
        count={0}
        cancelButtonRef={createRef<HTMLButtonElement>()}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(document.getElementById("empty-desc")).toHaveTextContent(
      /^壊れたゴミ箱の保存データをすべて削除して初期化します。この操作は元に戻せません。$/,
    );
  });
});
