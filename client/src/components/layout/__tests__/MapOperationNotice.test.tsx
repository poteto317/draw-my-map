import { render, screen } from "@testing-library/react";
import { MapOperationNotice } from "@/components/layout/MapOperationNotice";

describe("MapOperationNotice", () => {
  it("status通知をpoliteなstatus roleと既存の色で表示する", () => {
    render(<MapOperationNotice notice={{
      kind: "status",
      message: "マップを読み込みました。",
    }} />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("マップを読み込みました。");
    expect(notice).toHaveAttribute("aria-live", "polite");
    expect(notice).toHaveClass("text-zinc-600", "dark:text-zinc-400");
  });

  it.each([
    ["warning", "text-amber-700", "dark:text-amber-300"],
    ["error", "text-red-700", "dark:text-red-300"],
  ] as const)("%s通知をassertiveなalert roleと既存の色で表示する", (kind, lightColor, darkColor) => {
    render(<MapOperationNotice notice={{ kind, message: "書き出しに失敗しました。" }} />);

    const notice = screen.getByRole("alert");
    expect(notice).toHaveTextContent("書き出しに失敗しました。");
    expect(notice).toHaveAttribute("aria-live", "assertive");
    expect(notice).toHaveClass(lightColor, darkColor);
  });

  it("通知がない場合は何も表示しない", () => {
    const { container } = render(<MapOperationNotice notice={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
