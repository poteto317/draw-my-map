import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import { IllustrationPanel } from "@/components/layout/IllustrationPanel";

describe("IllustrationPanel", () => {
  it("補足領域として名前付きで表示し、見出しを持つ", () => {
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={jest.fn()} />);

    expect(screen.getByRole("complementary", { name: "イラスト" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "イラスト" })).toBeInTheDocument();
  });

  it("ノード未選択のときは案内を表示し、生成ボタンを無効にする", () => {
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={jest.fn()} />);

    expect(screen.getByText("ノードを選択してください")).toBeVisible();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
  });

  it("選択中のノードのラベルを表示し、生成ボタンを有効にする", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 3, label: "企画の背景" }}
        generation={{ status: "idle" }} onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByText("企画の背景")).toBeVisible();
    expect(screen.queryByText("ノードを選択してください")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("ラベルが空のノードでは共通のフォールバックラベルを表示し、titleは付けない", () => {
    render(
      <IllustrationPanel selectedNode={{ id: 4, label: "" }} generation={{ status: "idle" }} onGenerate={jest.fn()} />,
    );

    const text = screen.getByText(FALLBACK_NODE_LABEL);
    expect(text).toBeVisible();
    expect(text).not.toHaveAttribute("title");
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("生成ボタンのクリックで、選択中のノードIDを1回通知する", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(
      <IllustrationPanel selectedNode={{ id: 7, label: "目標" }} generation={{ status: "idle" }} onGenerate={onGenerate} />,
    );

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate).toHaveBeenCalledWith(7);
  });

  it("無効なボタンのクリックでは通知しない", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={onGenerate} />);

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("長いラベルは全文をtitleで確認できる", () => {
    const label = "とても長いラベルのノード".repeat(10);
    render(<IllustrationPanel selectedNode={{ id: 1, label }} generation={{ status: "idle" }} onGenerate={jest.fn()} />);

    expect(screen.getByText(label)).toHaveAttribute("title", label);
  });

  it("固定幅で、縮まない", () => {
    render(<IllustrationPanel selectedNode={null} generation={{ status: "idle" }} onGenerate={jest.fn()} />);

    expect(screen.getByRole("complementary", { name: "イラスト" })).toHaveClass("w-60", "shrink-0");
  });

  it("生成中は、ボタンを無効にして『生成中…』と表示する", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "generating", nodeId: 1 }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("生成中です");
  });

  it("別のノードを生成中のときも、ボタンは無効（二重実行の防止）で、選択中のノードには生成中の表示を出さない", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 2, label: "予算" }}
        generation={{ status: "generating", nodeId: 1 }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "生成中…" })).toBeDisabled();
    expect(screen.queryByText("生成中です")).not.toBeInTheDocument();
  });

  it("生成中のボタンのクリックでは通知しない", async () => {
    const user = userEvent.setup();
    const onGenerate = jest.fn();
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "generating", nodeId: 1 }}
        onGenerate={onGenerate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "生成中…" }));

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("選択中のノードの生成結果を画像で表示する", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "succeeded", nodeId: 1, dataUrl: "data:image/jpeg;base64,AAA" }}
        onGenerate={jest.fn()}
      />,
    );

    const image = screen.getByRole("img", { name: "目標のイラスト" });
    expect(image).toHaveAttribute("src", "data:image/jpeg;base64,AAA");
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
  });

  it("ラベルが空のノードの画像は、代替文言を使った説明を持つ", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "" }}
        generation={{ status: "succeeded", nodeId: 1, dataUrl: "data:image/jpeg;base64,AAA" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: `${FALLBACK_NODE_LABEL}のイラスト` })).toBeInTheDocument();
  });

  it("別のノードの生成結果は、表示しない", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 2, label: "予算" }}
        generation={{ status: "succeeded", nodeId: 1, dataUrl: "data:image/jpeg;base64,AAA" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("選択中のノードの失敗を、alertで表示する", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 1, label: "目標" }}
        generation={{ status: "failed", nodeId: 1, message: "生成に失敗しました" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("生成に失敗しました");
  });

  it("別のノードの失敗は、表示しない", () => {
    render(
      <IllustrationPanel
        selectedNode={{ id: 2, label: "予算" }}
        generation={{ status: "failed", nodeId: 1, message: "生成に失敗しました" }}
        onGenerate={jest.fn()}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
