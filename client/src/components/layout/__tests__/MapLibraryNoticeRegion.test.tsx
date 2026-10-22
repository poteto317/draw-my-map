import { act, render, screen } from "@testing-library/react";
import {
  MapLibraryNoticeRegion,
  type ShellNotice,
} from "@/components/layout/MapLibraryNoticeRegion";

function notice(
  sequence: number,
  kind: ShellNotice["notice"]["kind"],
  message: string,
): ShellNotice {
  return { sequence, notice: { kind, message } };
}

function flushFrame() {
  act(() => {
    jest.advanceTimersToNextFrame();
  });
}

describe("MapLibraryNoticeRegion", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("初回から空のstatusとalertを描画する", () => {
    render(<MapLibraryNoticeRegion notice={null} />);

    const status = screen.getByRole("status");
    const alert = screen.getByRole("alert");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(status).toBeEmptyDOMElement();
    expect(alert).toBeEmptyDOMElement();
  });

  it("statusの通知は次のフレームでstatus要素だけに入る", () => {
    const { rerender } = render(<MapLibraryNoticeRegion notice={null} />);

    rerender(<MapLibraryNoticeRegion notice={notice(1, "status", "切り替えました。")} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    flushFrame();
    expect(screen.getByRole("status")).toHaveTextContent("切り替えました。");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it.each(["warning", "error"] as const)("%sの通知はalert要素だけに入る", (kind) => {
    const { rerender } = render(<MapLibraryNoticeRegion notice={null} />);

    rerender(<MapLibraryNoticeRegion notice={notice(1, kind, "失敗しました。")} />);
    flushFrame();

    expect(screen.getByRole("alert")).toHaveTextContent("失敗しました。");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("同じ文言でsequenceだけが変わると、一度空になり次のフレームで同じDOMノードへ再び入る", () => {
    const { rerender } = render(
      <MapLibraryNoticeRegion notice={notice(1, "status", "同じ文言")} />,
    );
    flushFrame();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("同じ文言");

    rerender(<MapLibraryNoticeRegion notice={notice(2, "status", "同じ文言")} />);
    expect(status).toBeEmptyDOMElement();

    flushFrame();
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("同じ文言");
  });

  it("通知の種類が変わると前の領域は空になる", () => {
    const { rerender } = render(
      <MapLibraryNoticeRegion notice={notice(1, "error", "失敗")} />,
    );
    flushFrame();

    rerender(<MapLibraryNoticeRegion notice={notice(2, "status", "成功")} />);
    flushFrame();

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).toHaveTextContent("成功");
  });

  it("通知がnullになると両方空になる", () => {
    const { rerender } = render(
      <MapLibraryNoticeRegion notice={notice(1, "status", "成功")} />,
    );
    flushFrame();

    rerender(<MapLibraryNoticeRegion notice={null} />);
    flushFrame();

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("フレーム前にアンマウントしても例外にならない", () => {
    const { unmount } = render(
      <MapLibraryNoticeRegion notice={notice(1, "status", "成功")} />,
    );

    unmount();

    expect(() => flushFrame()).not.toThrow();
  });
});
