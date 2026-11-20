import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapLibraryMetaStatusNotice } from "@/components/layout/MapLibraryMetaStatusNotice";

describe("MapLibraryMetaStatusNotice", () => {
  it("ready では何も描画しない", () => {
    const { container } = render(
      <MapLibraryMetaStatusNotice status="ready" buttonClassName="" onReset={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("corrupt では初期化ボタン付きの alert を出し、1回のクリックだけで初期化する", async () => {
    const user = userEvent.setup();
    const onReset = jest.fn();
    render(<MapLibraryMetaStatusNotice status="corrupt" buttonClassName="" onReset={onReset} />);

    expect(screen.getByRole("alert")).toHaveTextContent("破損");
    await user.dblClick(screen.getByRole("button", { name: "メタデータを初期化" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("unavailable では初期化ボタンの無い alert で再読み込みを案内する", () => {
    render(<MapLibraryMetaStatusNotice status="unavailable" buttonClassName="" onReset={jest.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("再読み込み");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
