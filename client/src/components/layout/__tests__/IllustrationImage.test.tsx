import { render, screen } from "@testing-library/react";
import { IllustrationImage } from "@/components/layout/IllustrationImage";

describe("IllustrationImage", () => {
  it("srcとaltを持つ画像を、枠付きで表示する", () => {
    render(<IllustrationImage src="data:image/jpeg;base64,AAAA" alt="猫のイラスト" />);
    const image = screen.getByRole("img", { name: "猫のイラスト" });
    expect(image).toHaveAttribute("src", "data:image/jpeg;base64,AAAA");
    expect(image).toHaveClass("w-full", "rounded-md", "border");
  });
});
