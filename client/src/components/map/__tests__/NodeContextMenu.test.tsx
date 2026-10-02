import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeContextMenu } from "@/components/map/NodeContextMenu";

describe("NodeContextMenu", () => {
  it("指定位置にメニューと項目を表示する", () => {
    render(<NodeContextMenu position={{ x: 10, y: 20 }} onGenerateIllustration={jest.fn()} />);

    expect(screen.getByRole("menu")).toHaveStyle({ left: "10px", top: "20px" });
    expect(screen.getByRole("menuitem", { name: "イラストを生成" })).toBeInTheDocument();
  });

  it("項目クリックでコールバックを呼ぶ", async () => {
    const onGenerateIllustration = jest.fn();
    render(<NodeContextMenu position={{ x: 0, y: 0 }} onGenerateIllustration={onGenerateIllustration} />);

    await userEvent.click(screen.getByRole("menuitem", { name: "イラストを生成" }));

    expect(onGenerateIllustration).toHaveBeenCalledTimes(1);
  });

  it("メニュー上のdouble-clickを親へ伝播しない", async () => {
    const onDoubleClick = jest.fn();
    render(
      <div onDoubleClick={onDoubleClick}>
        <NodeContextMenu position={{ x: 0, y: 0 }} onGenerateIllustration={jest.fn()} />
      </div>,
    );

    await userEvent.dblClick(screen.getByRole("menuitem"));

    expect(onDoubleClick).not.toHaveBeenCalled();
  });
});
