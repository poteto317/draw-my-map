import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLibraryDeleteConfirm } from "@/components/layout/MapLibraryDeleteConfirm";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";

type Props = Parameters<typeof MapLibraryDeleteConfirm>[0];

const target: MapIndexEntry = {
  id: "a",
  name: "旅行の計画",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-21T03:00:00.000Z",
};

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    headingId: "heading",
    descriptionId: "description",
    target,
    isCurrent: false,
    nextMapName: null,
    isLast: false,
    cancelButtonRef: createRef<HTMLButtonElement>(),
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

function description() {
  return document.getElementById("description");
}

function confirmButton() {
  return screen.getByRole("button", { name: "このマップを削除" });
}

describe("MapLibraryDeleteConfirm", () => {
  it("開いていないマップでは、対象の名前を含む本文だけを表示する", () => {
    render(<MapLibraryDeleteConfirm {...createProps()} />);

    expect(screen.getByRole("heading", { name: "マップを削除" })).toHaveAttribute(
      "id",
      "heading",
    );
    expect(description()).toHaveTextContent(
      /^マップ「旅行の計画」を削除します。削除したマップは元に戻せません。$/,
    );
  });

  it("開いているマップでは、削除の後に開くマップの名前を続けて表示する", () => {
    render(
      <MapLibraryDeleteConfirm
        {...createProps({ isCurrent: true, nextMapName: "読書メモ" })}
      />,
    );

    expect(description()).toHaveTextContent(
      /^マップ「旅行の計画」を削除します。削除したマップは元に戻せません。開いているマップです。削除すると「読書メモ」を開きます。$/,
    );
  });

  it("最後のマップでは、空の「無題のマップ」を作成することを表示する", () => {
    render(
      <MapLibraryDeleteConfirm {...createProps({ isCurrent: true, isLast: true })} />,
    );

    expect(description()).toHaveTextContent(
      /^マップ「旅行の計画」を削除します。削除したマップは元に戻せません。最後のマップのため、削除すると空の「無題のマップ」を作成します。$/,
    );
  });

  it("「キャンセル」は「このマップを削除」より DOM 上で先にあり、cancelButtonRef が指す", () => {
    const cancelButtonRef = createRef<HTMLButtonElement>();
    render(<MapLibraryDeleteConfirm {...createProps({ cancelButtonRef })} />);

    const cancel = screen.getByRole("button", { name: "キャンセル" });
    expect(cancelButtonRef.current).toBe(cancel);
    expect(
      cancel.compareDocumentPosition(confirmButton()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("「キャンセル」で onCancel を呼ぶ", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MapLibraryDeleteConfirm {...props} />);

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it.each(["Enter", " "])(
    "押し続けの %p の keydown は preventDefault し、最初の keydown は妨げない",
    (key) => {
      render(<MapLibraryDeleteConfirm {...createProps()} />);

      expect(fireEvent.keyDown(confirmButton(), { key, repeat: true })).toBe(false);
      expect(fireEvent.keyDown(confirmButton(), { key })).toBe(true);
    },
  );

  it("ダブルクリックの続きの click（detail: 2）は無視し、detail: 1 と 0 で onConfirm を呼ぶ", () => {
    const props = createProps();
    render(<MapLibraryDeleteConfirm {...props} />);

    fireEvent.click(confirmButton(), { detail: 2 });
    expect(props.onConfirm).not.toHaveBeenCalled();

    fireEvent.click(confirmButton(), { detail: 1 });
    expect(props.onConfirm).toHaveBeenCalledTimes(1);

    // キーボードによる click は detail が 0
    fireEvent.click(confirmButton(), { detail: 0 });
    expect(props.onConfirm).toHaveBeenCalledTimes(2);
  });
});
