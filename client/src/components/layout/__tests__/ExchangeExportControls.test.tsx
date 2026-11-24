import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExchangeExportControls } from "@/components/layout/ExchangeExportControls";

it("形式別ボタンから対応する書き出しだけを実行する", async () => {
  const onExportOpml = jest.fn();
  const onExportCsv = jest.fn();
  const onExportTsv = jest.fn();
  render(
    <ExchangeExportControls
      onExportOpml={onExportOpml}
      onExportCsv={onExportCsv}
      onExportTsv={onExportTsv}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "OPML書き出し" }));
  expect(onExportOpml).toHaveBeenCalledTimes(1);
  expect(onExportCsv).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "CSV書き出し" }));
  expect(onExportCsv).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole("button", { name: "TSV書き出し" }));
  expect(onExportTsv).toHaveBeenCalledTimes(1);
});