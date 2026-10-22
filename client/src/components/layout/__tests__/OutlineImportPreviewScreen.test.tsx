import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutlineImportPreviewScreen } from "@/components/layout/OutlineImportPreviewScreen";
import { parseOutlineText, type ParsedOutline } from "@/domain/outline/outlineParser";
import { buildOutlinePreview } from "@/domain/outline/outlinePreview";

type Props = Parameters<typeof OutlineImportPreviewScreen>[0];

function parse(text: string): ParsedOutline {
  const result = parseOutlineText(text);
  if (!result.ok) throw new Error(`parse failed: ${result.error.kind}`);
  return result.outline;
}

// 「果物 > (りんご, みかん)、野菜」
const SIMPLE_TEXT = "- 果物\n  - りんご\n  - みかん\n- 野菜";

function createProps(overrides: Partial<Props> = {}, text = SIMPLE_TEXT): Props {
  const outline = parse(text);
  return {
    headingId: "heading",
    summaryId: "summary",
    warningsId: "warnings",
    outline,
    preview: buildOutlinePreview(outline),
    parentCandidate: { kind: "none" },
    target: "root",
    onTargetChange: jest.fn(),
    onSubmit: jest.fn(),
    onBack: jest.fn(),
    regionRef: createRef<HTMLDivElement>(),
    ...overrides,
  };
}

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `項目${index + 1}`).join("\n");
}

function submitButton() {
  return screen.getByRole("button", { name: "マップに追加" });
}

describe("OutlineImportPreviewScreen", () => {
  it("見出し・要約に id を付け、要約の文言を表示する", () => {
    render(<OutlineImportPreviewScreen {...createProps()} />);

    expect(screen.getByRole("heading", { name: "変換結果の確認" })).toHaveAttribute(
      "id",
      "heading",
    );
    expect(document.getElementById("summary")).toHaveTextContent(
      /^追加するノード: 4件（一番上の階層: 2件、最も深い階層: 2段目）$/,
    );
  });

  it("警告は「注意: 」で始まる <li> で並べる", () => {
    // 記号だけの行と、階層が合わない行（3行目）を含む
    const props = createProps({}, "- 果物\n-\n   - りんご\n  - みかん");
    render(<OutlineImportPreviewScreen {...props} />);

    const warnings = document.getElementById("warnings");
    expect(warnings?.tagName).toBe("UL");
    const items = within(warnings as HTMLElement).getAllByRole("listitem");
    expect(items.length).toBe(props.outline.warnings.length);
    expect(items.length).toBeGreaterThan(0);
    expect(items.map((item) => item.textContent)).toContain(
      "注意: 記号だけの行を 1 行取り込みません（2行目）。",
    );
    for (const item of items) {
      expect(item.textContent?.startsWith("注意: ")).toBe(true);
    }
  });

  it("警告が0件でも、要約と警告の要素を置く（aria-describedby の参照先を消さない）", () => {
    const props = createProps();
    expect(props.outline.warnings).toEqual([]);
    render(<OutlineImportPreviewScreen {...props} />);

    expect(document.getElementById("summary")).not.toBeNull();
    const warnings = document.getElementById("warnings");
    expect(warnings).not.toBeNull();
    expect(warnings?.children).toHaveLength(0);
  });

  it("201件のときは領域の下に打ち切りの文言を表示する", () => {
    render(<OutlineImportPreviewScreen {...createProps({}, lines(201))} />);

    const notice = screen.getByText("先頭の200件を表示しています（全201件）。");
    const region = screen.getByRole("region", { name: "変換結果のプレビュー" });
    expect(
      region.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(region).getAllByRole("listitem")).toHaveLength(200);
  });

  it("200件のときは打ち切りの文言を表示しない", () => {
    render(<OutlineImportPreviewScreen {...createProps({}, lines(200))} />);

    expect(screen.queryByText(/件を表示しています/)).toBeNull();
  });

  it("プレビューの領域は名前付きの region で tabIndex=0、regionRef が指し、中に木がある", () => {
    const regionRef = createRef<HTMLDivElement>();
    render(<OutlineImportPreviewScreen {...createProps({ regionRef })} />);

    const region = screen.getByRole("region", { name: "変換結果のプレビュー" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(regionRef.current).toBe(region);
    expect(
      within(region)
        .getAllByRole("listitem")
        .map((item) => item.firstChild?.textContent),
    ).toEqual(["果物", "りんご", "みかん", "野菜"]);
  });

  it("親の候補が無いときは、ラジオボタンを置かずに文を表示する", () => {
    render(<OutlineImportPreviewScreen {...createProps()} />);

    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: "追加する位置" })).toBeNull();
    expect(screen.getByText("新しいルートとして追加します。")).toBeInTheDocument();
  });

  it("親の候補があるときは、追加する位置の2つのラジオボタンを同じ name で置き、target に従って選ぶ", () => {
    render(
      <OutlineImportPreviewScreen
        {...createProps({ parentCandidate: { kind: "found", label: "旅行" } })}
      />,
    );

    const group = screen.getByRole("group", { name: "追加する位置" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    const [root, child] = radios;
    expect(root).toHaveAccessibleName("新しいルートとして追加");
    expect(child).toHaveAccessibleName("選択中のノード「旅行」の子として追加");
    expect(root).toBeChecked();
    expect(child).not.toBeChecked();
    expect(root.getAttribute("name")).not.toBe("");
    expect(root.getAttribute("name")).toBe(child.getAttribute("name"));
    expect(screen.queryByText("新しいルートとして追加します。")).toBeNull();
  });

  it("target が child なら2つ目を選び、1つ目を選ぶと onTargetChange(\"root\")", async () => {
    const user = userEvent.setup();
    const props = createProps({
      parentCandidate: { kind: "found", label: "旅行" },
      target: "child",
    });
    render(<OutlineImportPreviewScreen {...props} />);

    const [root, child] = screen.getAllByRole("radio");
    expect(child).toBeChecked();
    expect(root).not.toBeChecked();

    await user.click(root);
    expect(props.onTargetChange).toHaveBeenCalledTimes(1);
    expect(props.onTargetChange).toHaveBeenCalledWith("root");
  });

  it("2つ目を選ぶと onTargetChange(\"child\")", async () => {
    const user = userEvent.setup();
    const props = createProps({ parentCandidate: { kind: "found", label: "旅行" } });
    render(<OutlineImportPreviewScreen {...props} />);

    await user.click(
      screen.getByRole("radio", { name: "選択中のノード「旅行」の子として追加" }),
    );

    expect(props.onTargetChange).toHaveBeenCalledTimes(1);
    expect(props.onTargetChange).toHaveBeenCalledWith("child");
  });

  it("親が見つからないときは「選択していたノードの子として追加」を選べるまま置く", () => {
    render(
      <OutlineImportPreviewScreen
        {...createProps({ parentCandidate: { kind: "missing" } })}
      />,
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAccessibleName("新しいルートとして追加");
    expect(radios[1]).toHaveAccessibleName("選択していたノードの子として追加");
    expect(radios[1]).toBeEnabled();
  });

  it.each(["Enter", " "])(
    "「マップに追加」の押し続けの %p の keydown は preventDefault し、最初の keydown は妨げない",
    (key) => {
      render(<OutlineImportPreviewScreen {...createProps()} />);

      expect(fireEvent.keyDown(submitButton(), { key, repeat: true })).toBe(false);
      expect(fireEvent.keyDown(submitButton(), { key, repeat: false })).toBe(true);
    },
  );

  it("「マップに追加」はダブルクリックの続きの click（detail: 2）を無視し、detail: 1 と 0 で onSubmit を呼ぶ", () => {
    const props = createProps();
    render(<OutlineImportPreviewScreen {...props} />);

    fireEvent.click(submitButton(), { detail: 2 });
    expect(props.onSubmit).not.toHaveBeenCalled();

    fireEvent.click(submitButton(), { detail: 1 });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);

    // キーボードによる click は detail が 0
    fireEvent.click(submitButton(), { detail: 0 });
    expect(props.onSubmit).toHaveBeenCalledTimes(2);
  });

  it("「戻る」で onBack を呼び、onSubmit は呼ばない", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<OutlineImportPreviewScreen {...props} />);

    await user.click(screen.getByRole("button", { name: "戻る" }));

    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
