import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { NodeDetailPanel } from "@/components/layout/NodeDetailPanel";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { AddNodeLinkOutcome } from "@/domain/nodes/nodeLink";
import type { AddNodeMapLinkOutcome } from "@/domain/nodes/nodeMapLink";
import type { AddNodeSourceOutcome } from "@/domain/nodes/nodeSource";
import type { AddNodeTagOutcome } from "@/domain/nodes/nodeTag";
import { createMapHistoryLeaseSpy, createTestMapHistoryLease } from "@/testing/createTestMapHistoryLease";

type Props = ComponentProps<typeof NodeDetailPanel>;

const APPLE_URL = "https://example.com/apple";
const SOURCE_URL = "https://example.com/book";

const DEFAULT_MAPS: readonly MapIndexEntry[] = [
  {
    id: "map-a",
    name: "マップA",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  },
  {
    id: "map-b",
    name: "マップB",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  },
];

const DEFAULT_CORPUS: CrossMapCorpus = {
  readableMaps: [
    {
      mapId: "map-a",
      mapName: "マップA",
      isCurrent: true,
      nodes: [
        {
          id: 1,
          parentId: null,
          label: "りんご",
          importance: "medium",
          x: 100,
          y: 100,
          width: 100,
          height: 60,
          mapLinks: [{ targetMapId: "map-b", targetNodeId: 20 }],
        },
        {
          id: 2,
          parentId: null,
          label: "みかん",
          importance: "medium",
          x: 200,
          y: 100,
          width: 100,
          height: 60,
        },
      ],
    },
    {
      mapId: "map-b",
      mapName: "マップB",
      isCurrent: false,
      nodes: [
        {
          id: 20,
          parentId: null,
          label: "参照先ノード",
          importance: "medium",
          x: 100,
          y: 100,
          width: 100,
          height: 60,
          mapLinks: [{ targetMapId: "map-a", targetNodeId: 1 }],
        },
      ],
    },
  ],
  unreadableMaps: [],
};

function renderPanel(overrides: Partial<Props> = {}) {
  const props: Props = {
    selectedNode: {
      id: 1,
      label: "りんご",
      note: "りんごのメモ",
      tags: ["果物"],
      links: [APPLE_URL],
      sources: [{ title: "設計入門", page: "12", url: SOURCE_URL }],
      mapLinks: [{ targetMapId: "map-b", targetNodeId: 20 }],
    },
    selectionCount: 1,
    documentRevision: 0,
    viewMode: "map",
    currentMapId: "map-a",
    maps: DEFAULT_MAPS,
    corpus: DEFAULT_CORPUS,
    storageMode: "persistent",
    onPreviewNote: jest.fn(() => true),
    onBeginNoteEdit: jest.fn(() => createTestMapHistoryLease()),
    onAddTag: jest.fn((): AddNodeTagOutcome => ({ ok: true })),
    onRemoveTag: jest.fn(() => true),
    onAddLink: jest.fn((): AddNodeLinkOutcome => ({ ok: true })),
    onRemoveLink: jest.fn(() => true),
    onAddSource: jest.fn((): AddNodeSourceOutcome => ({ ok: true })),
    onRemoveSource: jest.fn(() => true),
    onAddMapLink: jest.fn((): AddNodeMapLinkOutcome => ({ ok: true })),
    onRemoveMapLink: jest.fn(() => true),
    onNavigateToMapTarget: jest.fn(),
    onSetNodeIcon: jest.fn(() => true),
    onSetNodeKind: jest.fn(() => true),
    generation: { status: "idle" },
    onGenerate: jest.fn(),
    onAttach: jest.fn(),
    onRemove: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<NodeDetailPanel {...props} />) };
}

function panel(): HTMLElement {
  return screen.getByRole("complementary", { name: "ノードの詳細" });
}

function box(): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: "詳細メモ" }) as HTMLTextAreaElement;
}

function tagInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "タグを追加" }) as HTMLInputElement;
}

function urlInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "URLを追加" }) as HTMLInputElement;
}

function sourceTitleInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "タイトル" }) as HTMLInputElement;
}

function sourcePageInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "ページ" }) as HTMLInputElement;
}

function sourceUrlInput(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "URL" }) as HTMLInputElement;
}

describe("NodeDetailPanel", () => {
  it("名前付きの補足領域で、幅 w-72・縮まない・内容が高さを超えたら縦にスクロールする", () => {
    renderPanel();

    expect(panel()).toHaveClass("w-72", "shrink-0", "min-h-0", "overflow-y-auto");
  });

  it("上から詳細メモ、見た目、タグ、リンク、出典、マップ間リンク、被リンク、イラストの順に置く", () => {
    renderPanel();

    const headings = within(panel()).getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual([
      "詳細メモ",
      "見た目",
      "タグ",
      "リンク",
      "出典",
      "マップ間リンク",
      "被リンク",
      "イラスト",
    ]);
    expect(within(panel()).getByRole("region", { name: "見た目" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "タグ" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "リンク" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "出典" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "マップ間リンク" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "被リンク" })).toBeInTheDocument();
    expect(within(panel()).getByRole("region", { name: "イラスト" })).toBeInTheDocument();
  });

  it("アウトライン・複数選択・保護モードでは見た目節を出さない", () => {
    const { rerender, props } = renderPanel({ viewMode: "outline" });
    expect(screen.queryByRole("heading", { name: "見た目" })).not.toBeInTheDocument();

    rerender(<NodeDetailPanel {...props} viewMode="map" selectionCount={2} />);
    expect(screen.queryByRole("heading", { name: "見た目" })).not.toBeInTheDocument();

    rerender(<NodeDetailPanel {...props} viewMode="map" selectionCount={1} storageMode="protected" />);
    expect(screen.queryByRole("heading", { name: "見た目" })).not.toBeInTheDocument();
  });

  it("locked のとき見た目節の操作を無効化する", () => {
    renderPanel({
      selectedNode: {
        id: 1,
        label: "りんご",
        locked: true,
      },
    });

    expect(screen.getByRole("textbox", { name: "アイコン" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "疑問" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "画像を添付" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
  });

  it("保護モードではイラストの添付・生成を無効化する", () => {
    renderPanel({ storageMode: "protected" });

    expect(screen.getByRole("button", { name: "画像を添付" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
  });

  it("主選択がちょうど1でないときはイラストの添付・生成を無効化する", () => {
    renderPanel({ selectionCount: 2 });

    expect(screen.getByRole("button", { name: "画像を添付" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
  });

  it("イラストの機能は従来どおり（生成ボタンで選択中のノード ID を通知する）", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    expect(props.onGenerate).toHaveBeenCalledWith(1);
  });

  it("未選択のときはメモの欄を無効にし、タグ・URL・出典・マップ間リンクの入力欄を出さず、7 つの節すべてに案内を出す", () => {
    renderPanel({ selectedNode: null, selectionCount: 0 });

    expect(box()).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "タグを追加" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "URLを追加" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "タイトル" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "対象マップ" })).toBeNull();
    expect(within(panel()).getAllByText("ノードを選択してください")).toHaveLength(7);
  });

  it("選択中のノードのメモ・タグ・URL・出典・マップ間リンク・被リンクを出し、選択件数を渡す", () => {
    renderPanel({ selectionCount: 2 });

    expect(box()).toHaveValue("りんごのメモ");
    expect(screen.getByRole("button", { name: "タグを削除: 果物" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: APPLE_URL })).toHaveAttribute("href", APPLE_URL);
    expect(screen.getByText("設計入門")).toBeInTheDocument();
    expect(screen.getByText("p. 12")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SOURCE_URL })).toHaveAttribute("href", SOURCE_URL);
    expect(
      within(screen.getByRole("region", { name: "マップ間リンク" })).getByRole("button", {
        name: "マップB / 参照先ノード",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "被リンク" })).getByRole("button", {
        name: /参照先ノード/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 件選択中。主選択のノードのメモを編集します")).toBeInTheDocument();
  });

  it("マップ間リンクの追加・削除・移動と、被リンクからの移動を通知する", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    const mapLinksRegion = screen.getByRole("region", { name: "マップ間リンク" });
    await user.click(within(mapLinksRegion).getByRole("button", { name: "マップB / 参照先ノード" }));
    expect(props.onNavigateToMapTarget).toHaveBeenCalledWith("map-b", 20);

    await user.selectOptions(within(mapLinksRegion).getByRole("combobox", { name: "対象マップ" }), "map-a");
    await user.selectOptions(within(mapLinksRegion).getByRole("combobox", { name: "対象ノード（任意）" }), "2");
    await user.click(within(mapLinksRegion).getByRole("button", { name: "追加" }));
    expect(props.onAddMapLink).toHaveBeenCalledWith(1, { targetMapId: "map-a", targetNodeId: 2 });

    await user.click(
      within(mapLinksRegion).getByRole("button", { name: "マップ間リンクを削除: マップB / 参照先ノード" }),
    );
    expect(props.onRemoveMapLink).toHaveBeenCalledWith(1, { targetMapId: "map-b", targetNodeId: 20 });

    const backlinksRegion = screen.getByRole("region", { name: "被リンク" });
    await user.click(within(backlinksRegion).getByRole("button", { name: /参照先ノード/ }));
    expect(props.onNavigateToMapTarget).toHaveBeenLastCalledWith("map-b", 20);
  });

  it("URL の追加と削除は、選択中のノードの ID で通知する", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.type(urlInput(), "https://example.com/new{Enter}");
    await user.click(screen.getByRole("button", { name: `リンクを削除: ${APPLE_URL}` }));

    expect(props.onAddLink).toHaveBeenCalledWith(1, "https://example.com/new");
    expect(props.onRemoveLink).toHaveBeenCalledWith(1, APPLE_URL);
  });

  it("タグの追加と削除は、選択中のノードの ID で通知し、リンク・出典の通知とは混ざらない", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.type(tagInput(), "重要{Enter}");
    await user.click(screen.getByRole("button", { name: "タグを削除: 果物" }));

    expect(props.onAddTag).toHaveBeenCalledWith(1, "重要");
    expect(props.onRemoveTag).toHaveBeenCalledWith(1, "果物");
    expect(props.onAddLink).not.toHaveBeenCalled();
    expect(props.onRemoveLink).not.toHaveBeenCalled();
    expect(props.onAddSource).not.toHaveBeenCalled();
    expect(props.onRemoveSource).not.toHaveBeenCalled();
  });

  it("出典の追加と削除は、選択中のノードの ID で通知し、リンク・タグの通知とは混ざらない", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.type(sourceTitleInput(), "実装ガイド");
    await user.type(sourcePageInput(), "3");
    await user.type(sourceUrlInput(), "https://example.com/guide{Enter}");
    await user.click(screen.getByRole("button", { name: `出典を削除: 設計入門 p. 12 ${SOURCE_URL}` }));

    expect(props.onAddSource).toHaveBeenCalledWith(1, {
      title: "実装ガイド",
      page: "3",
      url: "https://example.com/guide",
    });
    expect(props.onRemoveSource).toHaveBeenCalledWith(1, 0);
    expect(props.onAddLink).not.toHaveBeenCalled();
    expect(props.onRemoveLink).not.toHaveBeenCalled();
    expect(props.onAddTag).not.toHaveBeenCalled();
    expect(props.onRemoveTag).not.toHaveBeenCalled();
  });

  it("選択の ID が変わると作り直す。フォーカスを外さずに変わっても、前のノードの下書きを反映してから切り替える", () => {
    const spy = createMapHistoryLeaseSpy();
    const { props, rerender } = renderPanel({ onBeginNoteEdit: spy.onBeginNodeMove });
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "下書き" } });
    fireEvent.change(urlInput(), { target: { value: "https://example.com/draft" } });
    fireEvent.change(tagInput(), { target: { value: "下書きのタグ" } });
    fireEvent.change(sourceTitleInput(), { target: { value: "下書きの出典" } });

    rerender(<NodeDetailPanel {...props} selectedNode={{ id: 2, label: "みかん" }} />);

    expect(props.onPreviewNote).toHaveBeenCalledWith(1, "下書き");
    expect(box()).toHaveValue("");
    expect(urlInput()).toHaveValue("");
    expect(screen.getByText("リンクはありません")).toBeInTheDocument();
    expect(tagInput()).toHaveValue("");
    expect(screen.getByText("タグはありません")).toBeInTheDocument();
    expect(sourceTitleInput()).toHaveValue("");
    expect(screen.getByText("出典はありません")).toBeInTheDocument();
    expect(screen.getByText("マップ間リンクはありません")).toBeInTheDocument();
  });

  it("documentRevision が変わると作り直し、文書の入れ替え（グループの失効）では古い下書きを書かない（L-588）", () => {
    const spy = createMapHistoryLeaseSpy();
    const { props, rerender } = renderPanel({ onBeginNoteEdit: spy.onBeginNodeMove });
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "古い下書き" } });
    spy.expire();

    rerender(<NodeDetailPanel {...props} documentRevision={1} selectedNode={{ id: 1, label: "りんご", note: "新しい文書のメモ" }} />);

    expect(props.onPreviewNote).not.toHaveBeenCalled();
    expect(box()).toHaveValue("新しい文書のメモ");
  });

  it("documentRevision が変わると、リンクの節は作り直さずに入力とエラーだけを消し、削除ボタンのフォーカスを保つ（L-588・L-155）", () => {
    const { props, rerender } = renderPanel({
      onAddLink: jest.fn((): AddNodeLinkOutcome => ({ ok: false, reason: "invalid" })),
    });
    fireEvent.change(urlInput(), { target: { value: "example.com" } });
    fireEvent.submit(urlInput().form!);
    expect(within(panel()).getByRole("alert")).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: `リンクを削除: ${APPLE_URL}` });
    act(() => deleteButton.focus());

    rerender(<NodeDetailPanel {...props} documentRevision={1} />);

    expect(within(panel()).queryByRole("alert")).toBeNull();
    expect(urlInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: `リンクを削除: ${APPLE_URL}` })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("documentRevision が変わると、タグの節は作り直さずに入力とエラーだけを消し、削除ボタンのフォーカスを保つ（L-588・L-155）", () => {
    const { props, rerender } = renderPanel({
      onAddTag: jest.fn((): AddNodeTagOutcome => ({ ok: false, reason: "duplicate" })),
    });
    fireEvent.change(tagInput(), { target: { value: "果物" } });
    fireEvent.submit(tagInput().form!);
    expect(within(panel()).getByRole("alert")).toHaveTextContent("同じタグがすでに追加されています。");
    const deleteButton = screen.getByRole("button", { name: "タグを削除: 果物" });
    act(() => deleteButton.focus());

    rerender(<NodeDetailPanel {...props} documentRevision={1} />);

    expect(within(panel()).queryByRole("alert")).toBeNull();
    expect(tagInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: "タグを削除: 果物" })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("documentRevision が変わると、出典の節は作り直さずに入力とエラーだけを消し、削除ボタンのフォーカスを保つ（L-588・L-155）", () => {
    const { props, rerender } = renderPanel({
      onAddSource: jest.fn((): AddNodeSourceOutcome => ({ ok: false, reason: "duplicate" })),
    });
    fireEvent.change(sourceTitleInput(), { target: { value: "設計入門" } });
    fireEvent.change(sourcePageInput(), { target: { value: "12" } });
    fireEvent.change(sourceUrlInput(), { target: { value: SOURCE_URL } });
    fireEvent.submit(sourceTitleInput().form!);
    expect(within(panel()).getByRole("alert")).toHaveTextContent("同じ出典がすでに追加されています。");
    const deleteButton = screen.getByRole("button", { name: `出典を削除: 設計入門 p. 12 ${SOURCE_URL}` });
    act(() => deleteButton.focus());

    rerender(<NodeDetailPanel {...props} documentRevision={1} />);

    expect(within(panel()).queryByRole("alert")).toBeNull();
    expect(sourceTitleInput()).toHaveValue("");
    expect(sourcePageInput()).toHaveValue("");
    expect(sourceUrlInput()).toHaveValue("");
    expect(screen.getByRole("button", { name: `出典を削除: 設計入門 p. 12 ${SOURCE_URL}` })).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("documentRevision が変わると、マップ間リンクの節は作り直さずにエラーを消し、削除ボタンのフォーカスを保つ（L-397・L-588）", () => {
    const { props, rerender } = renderPanel({
      onAddMapLink: jest.fn((): AddNodeMapLinkOutcome => ({ ok: false, reason: "duplicate" })),
    });
    const mapLinksRegion = screen.getByRole("region", { name: "マップ間リンク" });
    const mapSelect = within(mapLinksRegion).getByRole("combobox", { name: "対象マップ" });
    fireEvent.submit(mapSelect.closest("form")!);
    expect(within(mapLinksRegion).getByRole("alert")).toBeInTheDocument();
    const deleteButton = within(mapLinksRegion).getByRole("button", {
      name: "マップ間リンクを削除: マップB / 参照先ノード",
    });
    act(() => deleteButton.focus());

    rerender(<NodeDetailPanel {...props} documentRevision={1} />);

    expect(within(mapLinksRegion).queryByRole("alert")).toBeNull();
    expect(
      within(mapLinksRegion).getByRole("button", {
        name: "マップ間リンクを削除: マップB / 参照先ノード",
      }),
    ).toBe(deleteButton);
    expect(deleteButton).toHaveFocus();
  });

  it("プレビュータブに切り替えた後、選択ノードの id または documentRevision が変わるとタブが編集に戻る（L-588）", () => {
    const { props, rerender } = renderPanel();

    fireEvent.click(screen.getByRole("tab", { name: "プレビュー" }));
    expect(screen.getByRole("tab", { name: "プレビュー" })).toHaveAttribute("aria-selected", "true");

    rerender(<NodeDetailPanel {...props} selectedNode={{ id: 2, label: "みかん", note: "みかんのメモ" }} />);
    expect(screen.getByRole("tab", { name: "編集" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "プレビュー" }));
    expect(screen.getByRole("tab", { name: "プレビュー" })).toHaveAttribute("aria-selected", "true");

    rerender(<NodeDetailPanel {...props} documentRevision={1} selectedNode={{ id: 2, label: "みかん", note: "みかんのメモ" }} />);
    expect(screen.getByRole("tab", { name: "編集" })).toHaveAttribute("aria-selected", "true");
  });
});
