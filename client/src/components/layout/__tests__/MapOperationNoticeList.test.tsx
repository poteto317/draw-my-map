import { render, screen } from "@testing-library/react";
import {
  hasOperationNotice,
  MapOperationNoticeList,
} from "@/components/layout/MapOperationNoticeList";
import type { OperationNotice } from "@/types/operationNotice";

const SAVED: OperationNotice = { kind: "status", message: "保存しました。" };
const EXPORT_FAILED: OperationNotice = { kind: "error", message: "書き出しに失敗しました。" };
const COPIED: OperationNotice = { kind: "warning", message: "コピーできませんでした。" };

describe("hasOperationNotice", () => {
  it("空の配列と、null だけの配列は false", () => {
    expect(hasOperationNotice([])).toBe(false);
    expect(hasOperationNotice([null, null])).toBe(false);
  });

  it("1つでも通知があれば true", () => {
    expect(hasOperationNotice([null, SAVED, null])).toBe(true);
  });
});

describe("MapOperationNoticeList", () => {
  it("null を飛ばし、通知を配列の順に表示する", () => {
    const { container } = render(
      <MapOperationNoticeList notices={[EXPORT_FAILED, null, SAVED, COPIED]} />,
    );

    const paragraphs = Array.from(container.querySelectorAll("p"));
    expect(paragraphs.map((p) => p.textContent)).toEqual([
      "書き出しに失敗しました。",
      "保存しました。",
      "コピーできませんでした。",
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("保存しました。");
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("すべて null なら何も表示しない", () => {
    const { container } = render(<MapOperationNoticeList notices={[null, null]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("前にある通知が消えても、後ろの通知の要素を作り直さない", () => {
    const { container, rerender } = render(
      <MapOperationNoticeList notices={[SAVED, EXPORT_FAILED]} />,
    );
    const exportFailed = screen.getByRole("alert");

    rerender(<MapOperationNoticeList notices={[null, EXPORT_FAILED]} />);

    expect(screen.getByRole("alert")).toBe(exportFailed);
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
});
