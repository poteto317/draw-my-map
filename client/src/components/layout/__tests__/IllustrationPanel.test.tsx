import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IllustrationPanel } from "@/components/layout/IllustrationPanel";

describe("IllustrationPanel", () => {
  it("補足領域として名前付きで表示し、見出しを持つ", () => {
    render(<IllustrationPanel selectedNode={null} onGenerate={jest.fn()} />);

    expect(screen.getByRole("complementary", { name: "イラスト" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "イラスト" })).toBeInTheDocument();
  });

  it("ノード未選択のときは案内を表示し、生成ボタンを無効にする", () => {
    render(<IllustrationPanel selectedNode={null} onGenerate={jest.fn()} />);

    expect(screen.getByText("ノードを選択してください")).toBeVisible();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
  });

  it("選択中のノードのラベルを表示し、生成ボタンを有効にする", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 3, label: "企画の背景" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByText("企画の背景")).toBeVisible();
    expect(screen.queryByText("ノードを選択してください")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("ラベルが空のノードでは「（ラベルなし）」を表示する", () => {
    render(
      <IllustrationPanel selectedNode={{ id: 4, label: "" }} onGenerate={jest.fn()} />,
    );

    expect(screen.getByText("（ラベルなし）")).toBeVisible();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("生成ボタンのクリックで、選択中のノードIDを1回通知する", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(
      <IllustrationPanel selectedNode={{ id: 7, label: "目標" }} onGenerate={onGenerate} />,
    );

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledWith(7);
  });

  it("無効なボタンのクリックでは通知しない", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(<IllustrationPanel selectedNode={null} onGenerate={onGenerate} />);

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("長いラベルは全文をtitleで確認できる", () => {
    const label = "とても長いラベルのノード".repeat(10);
    render(<IllustrationPanel selectedNode={{ id: 1, label }} onGenerate={jest.fn()} />);

    expect(screen.getByText(label)).toHaveAttribute("title", label);
  });
});
