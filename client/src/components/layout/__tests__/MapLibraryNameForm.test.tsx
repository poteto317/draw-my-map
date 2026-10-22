import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLibraryNameForm } from "@/components/layout/MapLibraryNameForm";

type Props = Parameters<typeof MapLibraryNameForm>[0];

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    mode: "create",
    headingId: "heading",
    initialName: "",
    inputRef: createRef<HTMLInputElement>(),
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  };
}

function nameInput() {
  return screen.getByRole("textbox", { name: "マップ名" });
}

describe("MapLibraryNameForm", () => {
  it("作成では見出し・placeholder・補足文・「作成」ボタンを表示し、maxLength を付けない", () => {
    const inputRef = createRef<HTMLInputElement>();
    render(<MapLibraryNameForm {...createProps({ inputRef })} />);

    expect(screen.getByRole("heading", { name: "新しいマップ" })).toHaveAttribute(
      "id",
      "heading",
    );
    expect(nameInput()).toHaveAttribute("placeholder", "無題のマップ");
    expect(nameInput()).not.toHaveAttribute("maxLength");
    expect(nameInput()).toHaveValue("");
    expect(inputRef.current).toBe(nameInput());
    expect(
      screen.getByText("空欄のときは「無題のマップ」になります。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作成" })).toBeEnabled();
  });

  it("名前変更では見出しと「変更」ボタンを表示し、補足文を出さない", () => {
    render(
      <MapLibraryNameForm
        {...createProps({ mode: "rename", initialName: "旅行の計画" })}
      />,
    );

    expect(screen.getByRole("heading", { name: "マップ名を変更" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "変更" })).toBeInTheDocument();
    expect(
      screen.queryByText("空欄のときは「無題のマップ」になります。"),
    ).not.toBeInTheDocument();
  });

  it("名前変更では、開いたときに初期値が全選択される", () => {
    render(
      <MapLibraryNameForm
        {...createProps({ mode: "rename", initialName: "旅行の計画" })}
      />,
    );

    const input = nameInput() as HTMLInputElement;
    expect(input).toHaveValue("旅行の計画");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("旅行の計画".length);
  });

  it("空欄で送信すると、正規化せずに空文字のまま onSubmit を呼ぶ", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MapLibraryNameForm {...props} />);

    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledWith("");
  });

  it("入力欄の Enter で送信する", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MapLibraryNameForm {...props} />);

    await user.type(nameInput(), "  読書メモ {Enter}");

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledWith("  読書メモ ");
  });

  it("絵文字で50文字なら送信でき、エラーを出さない", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MapLibraryNameForm {...props} />);
    const name = "😀".repeat(50);

    fireEvent.change(nameInput(), { target: { value: name } });
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(props.onSubmit).toHaveBeenCalledWith(name);
    expect(nameInput()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("絵文字で51文字なら送信せず、入力欄の下にエラーを出して aria-invalid と aria-describedby を付ける", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MapLibraryNameForm {...props} />);

    fireEvent.change(nameInput(), { target: { value: "😀".repeat(51) } });
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(props.onSubmit).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "マップ名は50文字以内で入力してください。（現在 51 文字）",
    );
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(nameInput().getAttribute("aria-describedby")?.split(" ")).toContain(
      alert.id,
    );
    // 確定のボタンは無効にしない
    expect(screen.getByRole("button", { name: "作成" })).toBeEnabled();
  });

  it.each([
    [{ isComposing: true }],
    [{ keyCode: 229 }],
  ])("IME の変換中の Enter（%o）では送信しない", (init) => {
    const props = createProps();
    render(<MapLibraryNameForm {...props} />);

    const notPrevented = fireEvent.keyDown(nameInput(), { key: "Enter", ...init });

    expect(notPrevented).toBe(false);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  // ヘッダーの「新しいマップ」で押し続けた Enter のリピートが、開いた直後の入力欄に届いて送信しないようにする（L-408）
  it.each(["create", "rename"] as const)("%s: 押し続けの Enter（repeat）では送信せず、repeat の無い Enter では送信する", async (mode) => {
    const user = userEvent.setup();
    const props = createProps({ mode, initialName: mode === "rename" ? "旅行の計画" : "" });
    render(<MapLibraryNameForm {...props} />);

    expect(fireEvent.keyDown(nameInput(), { key: "Enter", repeat: true })).toBe(false);
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(nameInput(), { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(nameInput(), { key: " ", repeat: true })).toBe(true);

    nameInput().focus();
    await user.keyboard("{Enter}");
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("入力欄からの blur では onSubmit を呼ばない", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(
      <>
        <MapLibraryNameForm {...props} />
        <button type="button">外</button>
      </>,
    );

    await user.type(nameInput(), "読書メモ");
    await user.click(screen.getByRole("button", { name: "外" }));

    expect(nameInput()).not.toHaveFocus();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("「キャンセル」で onCancel を呼び、onSubmit は呼ばない", async () => {
    const user = userEvent.setup();
    const props = createProps({ mode: "rename", initialName: "旅行の計画" });
    render(<MapLibraryNameForm {...props} />);

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
