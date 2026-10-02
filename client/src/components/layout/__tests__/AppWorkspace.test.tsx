import { render, screen } from "@testing-library/react";
import { AppWorkspace } from "@/components/layout/AppWorkspace";

describe("AppWorkspace", () => {
  it("mainランドマークとして、横並びのflexレイアウトを提供する", () => {
    render(<AppWorkspace canvas={<div>キャンバス</div>} sidePanel={<aside>パネル</aside>} />);

    const main = screen.getByRole("main");
    expect(main).toHaveClass("flex", "min-h-0", "flex-1", "overflow-hidden");
  });

  it("キャンバスを、残りの幅を使い縮められる枠で包む", () => {
    render(<AppWorkspace canvas={<div>キャンバス</div>} sidePanel={<aside>パネル</aside>} />);

    const wrapper = screen.getByText("キャンバス").parentElement;
    expect(wrapper).toHaveClass("min-h-0", "min-w-0", "flex-1");
  });

  it("キャンバスの後ろに、側面パネルを並べる", () => {
    render(<AppWorkspace canvas={<div>キャンバス</div>} sidePanel={<aside>パネル</aside>} />);

    const main = screen.getByRole("main");
    const wrapper = screen.getByText("キャンバス").parentElement!;
    const panel = screen.getByText("パネル");
    expect(main).toContainElement(panel);
    expect(wrapper.nextElementSibling).toBe(panel);
  });
});
