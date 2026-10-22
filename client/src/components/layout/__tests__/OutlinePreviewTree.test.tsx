import { render, screen, within } from "@testing-library/react";
import { OutlinePreviewTree } from "@/components/layout/OutlinePreviewTree";
import type { OutlinePreviewNode } from "@/domain/outline/outlinePreview";

const ROOTS: OutlinePreviewNode[] = [
  {
    key: 0,
    label: "果物",
    children: [
      { key: 1, label: "りんご", children: [] },
      { key: 2, label: "みかん", children: [] },
    ],
  },
  { key: 3, label: "野菜", children: [] },
];

function itemByLabel(label: string) {
  const item = screen
    .getAllByRole("listitem")
    .find((element) => element.firstChild?.textContent === label);
  if (!item) throw new Error(`listitem not found: ${label}`);
  return item;
}

describe("OutlinePreviewTree", () => {
  it("入れ子の <ul> で階層を表し、子が無い項目には <ul> を置かない", () => {
    render(<OutlinePreviewTree roots={ROOTS} />);

    // 外のリストと、果物の中のリストの2つ
    expect(screen.getAllByRole("list")).toHaveLength(2);

    const fruit = itemByLabel("果物");
    const fruitChildren = within(fruit).getByRole("list");
    const childItems = within(fruitChildren).getAllByRole("listitem");
    expect(childItems.map((item) => item.textContent)).toEqual([
      "りんご",
      "みかん",
    ]);

    expect(within(itemByLabel("野菜")).queryByRole("list")).toBeNull();
  });

  it("ルートの並びは roots の順", () => {
    render(<OutlinePreviewTree roots={ROOTS} />);

    const outer = screen.getAllByRole("list")[0];
    const rootItems = Array.from(outer.children);
    expect(rootItems.map((item) => item.firstChild?.textContent)).toEqual([
      "果物",
      "野菜",
    ]);
  });

  it("ラベルは受け取ったまま表示し（短くするのは buildOutlinePreview）、title 属性を付けない", () => {
    // 81コードポイントでも、ここではもう一度短くしない
    const longLabel = `${"あ".repeat(79)}😀😀`;
    render(
      <OutlinePreviewTree roots={[{ key: 0, label: longLabel, children: [] }]} />,
    );

    const item = screen.getByRole("listitem");
    expect(item.textContent).toBe(longLabel);
    expect(document.querySelector("[title]")).toBeNull();
  });

  it("role=\"tree\" を使わない", () => {
    render(<OutlinePreviewTree roots={ROOTS} />);

    expect(screen.queryByRole("tree")).toBeNull();
    expect(document.querySelector("[role]")).toBeNull();
  });
});
