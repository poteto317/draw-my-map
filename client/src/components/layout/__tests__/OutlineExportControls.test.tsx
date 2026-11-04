import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutlineExportControls } from "@/components/layout/OutlineExportControls";

it("形式別ボタンから対応する書き出しだけを実行する", async () => {
  const onExportMarkdown = jest.fn();
  const onExportPlainText = jest.fn();
  render(<OutlineExportControls onExportMarkdown={onExportMarkdown} onExportPlainText={onExportPlainText} />);
  const markdown = screen.getByRole("button", { name: "Markdown書き出し" });
  const plainText = screen.getByRole("button", { name: "箇条書き書き出し" });
  expect(markdown).toHaveAttribute("type", "button");
  expect(plainText).toHaveAttribute("type", "button");
  await userEvent.click(markdown);
  expect(onExportMarkdown).toHaveBeenCalledTimes(1);
  expect(onExportPlainText).not.toHaveBeenCalled();
  await userEvent.click(plainText);
  expect(onExportMarkdown).toHaveBeenCalledTimes(1);
  expect(onExportPlainText).toHaveBeenCalledTimes(1);
});
