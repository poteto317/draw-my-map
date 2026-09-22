import { render, screen } from "@testing-library/react";
import { MapPersistenceNotice } from "@/components/layout/MapPersistenceNotice";

describe("MapPersistenceNotice", () => {
  it("status通知をstatus roleで表示する", () => {
    render(<MapPersistenceNotice notice={{
      kind: "status",
      message: "マップを読み込みました。",
    }} />);

    expect(screen.getByRole("status")).toHaveTextContent("マップを読み込みました。");
  });

  it.each(["warning", "error"] as const)(
    "%s通知をalert roleで表示する",
    (kind) => {
      render(<MapPersistenceNotice notice={{ kind, message: "保存に失敗しました。" }} />);

      expect(screen.getByRole("alert")).toHaveTextContent("保存に失敗しました。");
    },
  );

  it("通知がない場合は何も表示しない", () => {
    const { container } = render(<MapPersistenceNotice notice={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
