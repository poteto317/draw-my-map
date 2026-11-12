import { render, screen } from "@testing-library/react";
import { MapSaveStatus } from "@/components/layout/MapSaveStatus";

describe("MapSaveStatus", () => {
  it.each([
    ["checking", "保存状態を確認中"],
    ["saved", "保存済み"],
    ["beforeSave", "保存前"],
    ["restoreFailed", "復元できませんでした"],
    ["pending", "保存待ち"],
    ["failed", "保存失敗"],
    ["protected", "ブラウザへ保存できません"],
    ["conflict", "競合が発生しました"],
    ["externallyDeleted", "削除されました"],
  ] as const)("%s を %s と通知する", (status, label) => {
    render(<MapSaveStatus status={status} />);

    const element = screen.getByRole("status", { name: `保存状態: ${label}` });
    expect(element).toHaveTextContent(label);
    expect(element).toHaveAttribute("aria-live", "polite");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
