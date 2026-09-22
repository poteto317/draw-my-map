import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapPersistenceControls } from "@/components/layout/MapPersistenceControls";

describe("MapPersistenceControls", () => {
  it("JSON書き出しcommandをボタンから実行する", async () => {
    const user = userEvent.setup();
    const onExport = jest.fn();
    render(<MapPersistenceControls onExport={onExport} onImport={jest.fn()} />);

    const button = screen.getByRole("button", { name: "JSON書き出し" });
    expect(button).toHaveAttribute("type", "button");
    await user.click(button);

    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("JSON読み込みボタンから非表示ファイル入力を開く", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MapPersistenceControls onExport={jest.fn()} onImport={jest.fn()} />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = jest.spyOn(input, "click");

    expect(input).toHaveAttribute("accept", "application/json,.json");
    await user.click(screen.getByRole("button", { name: "JSON読み込み" }));

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("同じファイルを続けて選択しても毎回インポートする", async () => {
    const user = userEvent.setup();
    const onImport = jest.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MapPersistenceControls onExport={jest.fn()} onImport={onImport} />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["{}"], "map.json", { type: "application/json" });

    await user.upload(input, file);
    await user.upload(input, file);

    expect(onImport).toHaveBeenNthCalledWith(1, file);
    expect(onImport).toHaveBeenNthCalledWith(2, file);
  });

  it("インポート失敗後も入力をリセットして同じファイルを再選択できる", async () => {
    const user = userEvent.setup();
    const onImport = jest.fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce(undefined);
    const { container } = render(
      <MapPersistenceControls onExport={jest.fn()} onImport={onImport} />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["{}"], "map.json", { type: "application/json" });

    await user.upload(input, file);
    await waitFor(() => expect(input.value).toBe(""));
    await user.upload(input, file);

    expect(onImport).toHaveBeenCalledTimes(2);
  });

  it("ファイルが選択されていないchangeではインポートしない", () => {
    const onImport = jest.fn();
    const { container } = render(
      <MapPersistenceControls onExport={jest.fn()} onImport={onImport} />,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    fireEvent.change(input, { target: { files: [] } });

    expect(onImport).not.toHaveBeenCalled();
  });
});
