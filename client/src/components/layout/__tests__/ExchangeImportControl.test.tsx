import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExchangeImportControl } from "@/components/layout/ExchangeImportControl";

function renderControl(onOpen = jest.fn()) {
  const opmlRef = createRef<HTMLButtonElement>();
  const csvRef = createRef<HTMLButtonElement>();
  render(
    <ExchangeImportControl
      opmlExpanded={false}
      csvExpanded={false}
      onOpen={onOpen}
      opmlButtonRef={opmlRef}
      csvButtonRef={csvRef}
    />,
  );
  return {
    onOpen,
    opml: screen.getByRole("button", { name: "OPML取り込み" }),
    csv: screen.getByRole("button", { name: "CSV/TSV取り込み" }),
  };
}

describe("ExchangeImportControl", () => {
  it("2つの取り込みボタンを表示し、どちらも有効", () => {
    const { opml, csv } = renderControl();
    expect(opml).toBeEnabled();
    expect(csv).toBeEnabled();
    expect(opml).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("OPML クリックで onOpen('opml')", async () => {
    const user = userEvent.setup();
    const { onOpen, opml } = renderControl();
    await user.click(opml);
    expect(onOpen).toHaveBeenCalledWith("opml");
  });

  it("CSV クリックで onOpen('csv-tsv')", async () => {
    const user = userEvent.setup();
    const { onOpen, csv } = renderControl();
    await user.click(csv);
    expect(onOpen).toHaveBeenCalledWith("csv-tsv");
  });

  it("repeat Enter は preventDefault", () => {
    const { opml } = renderControl();
    expect(fireEvent.keyDown(opml, { key: "Enter", repeat: true })).toBe(false);
  });
});