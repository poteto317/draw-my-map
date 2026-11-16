import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeSeparatorField } from "@/components/layout/NodeSeparatorField";

type Props = Parameters<typeof NodeSeparatorField>[0];

function renderField(overrides: Partial<Props> = {}) {
  const props: Props = {
    preset: "ja-comma",
    customSeparator: "",
    selectRef: createRef<HTMLSelectElement>(),
    onPresetChange: jest.fn(),
    onCustomSeparatorChange: jest.fn(),
    onCustomEnter: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeSeparatorField {...props} />) };
}

describe("NodeSeparatorField", () => {
  it("可視のラベルつきのプルダウンに、プリセットと「その他」を順に並べる", () => {
    renderField();

    const select = screen.getByLabelText("区切り文字");
    expect(select).toHaveValue("ja-comma");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "、", ",", "/", "・", "半角スペース", "その他",
    ]);
  });

  it("選択中のプリセットを反映し、選択を通知する", async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderField({ preset: "space" });
    expect(screen.getByLabelText("区切り文字")).toHaveValue("space");

    await user.selectOptions(screen.getByLabelText("区切り文字"), "slash");
    expect(props.onPresetChange).toHaveBeenCalledWith("slash");

    rerender(<NodeSeparatorField {...props} preset="custom" />);
    expect(screen.getByLabelText("区切り文字")).toHaveValue("custom");
  });

  it("selectRef をプルダウンへ渡す", () => {
    const selectRef = createRef<HTMLSelectElement>();

    renderField({ selectRef });

    expect(selectRef.current).toBe(screen.getByLabelText("区切り文字"));
  });

  it("「その他」の入力欄は、「その他」を選んだときだけ可視のラベルつきで出る", () => {
    const { props, rerender } = renderField({ preset: "comma" });
    expect(screen.queryByLabelText("その他の区切り文字")).toBeNull();

    rerender(<NodeSeparatorField {...props} preset="custom" customSeparator=" -> " />);
    expect(screen.getByLabelText("その他の区切り文字")).toHaveValue(" -> ");
  });

  it("「その他」の入力の変更を通知する（前後の空白もそのまま）", () => {
    const { props } = renderField({ preset: "custom" });

    fireEvent.change(screen.getByLabelText("その他の区切り文字"), { target: { value: " | " } });

    expect(props.onCustomSeparatorChange).toHaveBeenCalledWith(" | ");
  });

  describe("「その他」の入力欄の Enter", () => {
    it("IME 変換中でもリピートでもない Enter で onCustomEnter を呼び、既定動作を止める", () => {
      const { props } = renderField({ preset: "custom" });

      const notPrevented = fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter" });

      expect(props.onCustomEnter).toHaveBeenCalledTimes(1);
      expect(notPrevented).toBe(false);
    });

    it.each([
      ["isComposing が真", { isComposing: true }],
      ["keyCode が 229", { keyCode: 229 }],
      ["リピート", { repeat: true }],
    ])("%sのときは呼ばない", (_name, init) => {
      const { props } = renderField({ preset: "custom" });

      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "Enter", ...init });

      expect(props.onCustomEnter).not.toHaveBeenCalled();
    });

    it("Enter 以外のキーでは呼ばない", () => {
      const { props } = renderField({ preset: "custom" });

      fireEvent.keyDown(screen.getByLabelText("その他の区切り文字"), { key: "a" });

      expect(props.onCustomEnter).not.toHaveBeenCalled();
    });
  });

  it("プルダウンの Enter では onCustomEnter を呼ばない（プルダウンでは確定しない）", () => {
    const { props } = renderField({ preset: "custom" });

    fireEvent.keyDown(screen.getByLabelText("区切り文字"), { key: "Enter" });

    expect(props.onCustomEnter).not.toHaveBeenCalled();
  });
});
