import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";

function clickEvent(detail: number) {
  return { detail, preventDefault: jest.fn(), stopPropagation: jest.fn() };
}

describe("handleDialogClickCapture", () => {
  it("キーボードのクリック（detail 0）は数えず、そのまま通す", () => {
    const event = clickEvent(0);
    const onMouseClick = jest.fn();

    handleDialogClickCapture(event, onMouseClick);

    expect(onMouseClick).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("マウスの1回目は数えて、そのまま通す", () => {
    const event = clickEvent(1);
    const onMouseClick = jest.fn();

    handleDialogClickCapture(event, onMouseClick);

    expect(onMouseClick).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("ダブルクリックの続きは数えて、どの要素にも届けない", () => {
    const event = clickEvent(2);
    const onMouseClick = jest.fn();

    handleDialogClickCapture(event, onMouseClick);

    expect(onMouseClick).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });
});
