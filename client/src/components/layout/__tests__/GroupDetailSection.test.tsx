import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { GroupDetailSection } from "@/components/layout/GroupDetailSection";
import { MAP_GROUP_LABEL_MAX_CODEPOINTS } from "@/types/mapGroup";

type Props = ComponentProps<typeof GroupDetailSection>;

function renderSection(overrides: Partial<Props> = {}) {
  const props: Props = {
    visible: true,
    disabled: false,
    label: "",
    onLabelChange: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<GroupDetailSection {...props} />) };
}

describe("GroupDetailSection", () => {
  it("節名「グループ」とラベル入力を出す", () => {
    renderSection({ label: "題名" });
    expect(screen.getByRole("heading", { name: "グループ" })).toBeInTheDocument();
    expect(screen.getByLabelText("ラベル")).toHaveValue("題名");
    expect(screen.getByPlaceholderText("グループ")).toBeInTheDocument();
  });

  it("visible が false なら節を描画しない", () => {
    renderSection({ visible: false });
    expect(screen.queryByRole("heading", { name: "グループ" })).not.toBeInTheDocument();
  });

  it("disabled なら入力できない", () => {
    renderSection({ disabled: true, label: "x" });
    expect(screen.getByLabelText("ラベル")).toBeDisabled();
  });

  it("入力中は onLabelChange を呼ばず、blur で1回確定する", () => {
    const onLabelChange = jest.fn();
    renderSection({ label: "", onLabelChange });
    const input = screen.getByLabelText("ラベル");

    fireEvent.change(input, { target: { value: "あ" } });
    fireEvent.change(input, { target: { value: "あい" } });
    fireEvent.change(input, { target: { value: "あいう" } });
    expect(onLabelChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("あいう");

    fireEvent.blur(input);

    expect(onLabelChange).toHaveBeenCalledTimes(1);
    expect(onLabelChange).toHaveBeenCalledWith("あいう");
  });

  it("Enter で確定する（リピート Enter は無視）", () => {
    const onLabelChange = jest.fn();
    renderSection({ label: "", onLabelChange });
    const input = screen.getByLabelText("ラベル");

    fireEvent.change(input, { target: { value: "題" } });
    fireEvent.keyDown(input, { key: "Enter", repeat: true });
    expect(onLabelChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onLabelChange).toHaveBeenCalledTimes(1);
    expect(onLabelChange).toHaveBeenCalledWith("題");
  });

  it("未変更の blur では onLabelChange を呼ばない", () => {
    const onLabelChange = jest.fn();
    renderSection({ label: "既存", onLabelChange });

    fireEvent.blur(screen.getByLabelText("ラベル"));

    expect(onLabelChange).not.toHaveBeenCalled();
  });

  it("onChange で 100 コードポイントを超える入力を切り詰める", () => {
    const onLabelChange = jest.fn();
    renderSection({ label: "", onLabelChange });
    const input = screen.getByLabelText("ラベル");
    const over = `${"あ".repeat(MAP_GROUP_LABEL_MAX_CODEPOINTS)}${"😀"}`;

    fireEvent.change(input, { target: { value: over } });

    const limited = "あ".repeat(MAP_GROUP_LABEL_MAX_CODEPOINTS);
    expect(input).toHaveValue(limited);
    expect(Array.from((input as HTMLInputElement).value)).toHaveLength(MAP_GROUP_LABEL_MAX_CODEPOINTS);
    expect(onLabelChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onLabelChange).toHaveBeenCalledWith(limited);
  });
});
