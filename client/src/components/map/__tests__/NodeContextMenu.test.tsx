import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeContextMenu } from "@/components/map/NodeContextMenu";
import { isInsideNodeContextMenu } from "@/components/map/nodeContextMenuDom";
import { NODE_CONTEXT_MENU_SIZE } from "@/components/map/nodeContextMenuLayout";

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

  it("外形サイズをレイアウト定数どおりに指定する", () => {
    render(<NodeContextMenu position={{ x: 0, y: 0 }} onGenerateIllustration={jest.fn()} />);

    expect(screen.getByRole("menu")).toHaveStyle({
      width: `${NODE_CONTEXT_MENU_SIZE.width}px`,
      height: `${NODE_CONTEXT_MENU_SIZE.height}px`,
    });
  });

  it("メニューとその項目はメニュー内判定でtrueになる", () => {
    render(<NodeContextMenu position={{ x: 0, y: 0 }} onGenerateIllustration={jest.fn()} />);

    expect(isInsideNodeContextMenu(screen.getByRole("menu"))).toBe(true);
    expect(isInsideNodeContextMenu(screen.getByRole("menuitem"))).toBe(true);
  });

  it("項目のmousedownは既定動作を抑止してフォーカス移動を防ぐ", () => {
    render(<NodeContextMenu position={{ x: 0, y: 0 }} onGenerateIllustration={jest.fn()} />);

    expect(fireEvent.mouseDown(screen.getByRole("menuitem"))).toBe(false);
  });
});
