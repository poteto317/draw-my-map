import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type ComponentProps } from "react";
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
        isArchived: false,
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
        isArchived: false,
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
    aiAssist: {
      summary: { enabled: true, rootId: 1 },
      importance: { enabled: true, rootId: 1 },
      childCandidates: { enabled: true, rootId: 1 },
      classifyReorder: { enabled: false, reason: "枝内にノードが 2 件未満のため実行できません" },
      duplicates: { enabled: true, rootId: 1 },
      missingPerspectives: { enabled: true, rootId: 1 },
      summaryButtonRef: createRef<HTMLButtonElement>(),
      importanceButtonRef: createRef<HTMLButtonElement>(),
      childCandidatesButtonRef: createRef<HTMLButtonElement>(),
      classifyReorderButtonRef: createRef<HTMLButtonElement>(),
      duplicatesButtonRef: createRef<HTMLButtonElement>(),
      missingPerspectivesButtonRef: createRef<HTMLButtonElement>(),
      onOpenSummary: jest.fn(),
      onOpenImportance: jest.fn(),
      onOpenChildCandidates: jest.fn(),
      onOpenClassifyReorder: jest.fn(),
      onOpenDuplicates: jest.fn(),
      onOpenMissingPerspectives: jest.fn(),
    },
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
    taskEditing: null,
    customAttributeEditing: null,
    commentSummary: null,
    onOpenNodeComments: null,
    openNodeCommentsDisabledReason: null,
    ...overrides,
  };
  return { props, ...render(<NodeDetailPanel {...props} />) };
}

function panel(name = "ノードの詳細"): HTMLElement {
  return screen.getByRole("complementary", { name });
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
  it("「AI支援」の節を詳細メモの節のすぐ下に置く", () => {
    renderPanel();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings.indexOf("AI支援")).toBe(headings.indexOf("詳細メモ") + 1);
  });

  it("関連線の選択中は「AI支援」の節を出さない", () => {
    renderPanel({ selectedRelation: { id: 10, kind: "related", directed: false } });
    expect(screen.queryByRole("region", { name: "AI支援" })).not.toBeInTheDocument();
  });

  it("名前付きの補足領域で、幅 w-72・縮まない・内容が高さを超えたら縦にスクロールする", () => {
    renderPanel();

    expect(panel()).toHaveClass("w-72", "shrink-0", "min-h-0", "overflow-y-auto");
  });

  it("上から詳細メモ、AI支援、見た目、タグ、リンク、出典、マップ間リンク、被リンク、イラストの順に置く", () => {
    renderPanel();

    const headings = within(panel()).getAllByRole("heading").map((heading) => heading.textContent);
    expect(headings).toEqual([
      "詳細メモ",
      "AI支援",
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

  it("関連線選択時は「関連線」節だけ出し、kind / 有向の変更を通知する", async () => {
    const user = userEvent.setup();
    const onUpdateRelationKind = jest.fn();
    const onUpdateRelationDirected = jest.fn();
    renderPanel({
      selectedNode: null,
      selectionCount: 0,
      selectedRelation: { id: 10, kind: "related", directed: false },
      onUpdateRelationKind,
      onUpdateRelationDirected,
    });

    expect(panel("関連線の詳細")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "関連線" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "詳細メモ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "見た目" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "依存" }));
    expect(onUpdateRelationKind).toHaveBeenCalledWith(10, "dependency");

    await user.click(screen.getByRole("checkbox", { name: "有向" }));
    expect(onUpdateRelationDirected).toHaveBeenCalledWith(10, true);
  });

  it("アウトラインでは関連線選択が残ってもノード UI を出し、関連線節は出さない", () => {
    renderPanel({
      viewMode: "outline",
      selectedNode: null,
      selectionCount: 0,
      selectedRelation: { id: 10, kind: "related", directed: false },
    });

    expect(screen.queryByRole("heading", { name: "関連線" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "詳細メモ" })).toBeInTheDocument();
  });

  it("関連線編集が disabled のとき操作できない", () => {
    renderPanel({
      selectedNode: null,
      selectionCount: 0,
      selectedRelation: { id: 10, kind: "conflict", directed: true },
      relationEditDisabled: true,
    });

    expect(screen.getByRole("radio", { name: "対立" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "有向" })).toBeDisabled();
  });

  it("グループ選択時は「グループ」節だけ出し、ラベル変更を通知する", () => {
    const onUpdateGroupLabel = jest.fn();
    renderPanel({
      selectedNode: null,
      selectionCount: 0,
      selectedGroup: { id: 20, label: "" },
      onUpdateGroupLabel,
    });

    expect(panel("グループの詳細")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "グループ" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "詳細メモ" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "見た目" })).not.toBeInTheDocument();

    const input = screen.getByLabelText("ラベル");
    fireEvent.change(input, { target: { value: "題名" } });
    expect(onUpdateGroupLabel).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onUpdateGroupLabel).toHaveBeenCalledWith(20, "題名");
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

  describe("コメント節（Phase 38 C4）", () => {
    it("commentSummary が null なら節を出さない", () => {
      renderPanel({ commentSummary: null, onOpenNodeComments: jest.fn() });
      expect(screen.queryByRole("region", { name: "コメント" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /コメントを開く/ })).not.toBeInTheDocument();
    });

    it("onOpenNodeComments が null なら節を出さない", () => {
      renderPanel({ commentSummary: { open: 1, resolved: 0 }, onOpenNodeComments: null });
      expect(screen.queryByRole("region", { name: "コメント" })).not.toBeInTheDocument();
    });

    it("0 件でも節と「コメントを開く」を出し、押すと onOpenNodeComments を呼ぶ", async () => {
      const user = userEvent.setup();
      const onOpenNodeComments = jest.fn();
      renderPanel({ commentSummary: { open: 0, resolved: 0 }, onOpenNodeComments });
      const section = screen.getByRole("region", { name: "コメント" });
      expect(section).toHaveTextContent("コメント: 未解決 0 / 解決済み 0");
      await user.click(within(section).getByRole("button", { name: "コメントを開く" }));
      expect(onOpenNodeComments).toHaveBeenCalledTimes(1);
    });

    it("件数を表示する", () => {
      renderPanel({ commentSummary: { open: 2, resolved: 3 }, onOpenNodeComments: jest.fn() });
      expect(screen.getByRole("region", { name: "コメント" })).toHaveTextContent("コメント: 未解決 2 / 解決済み 3");
    });

    it("openNodeCommentsDisabledReason で disabled・title・aria-label に理由を出す", async () => {
      const user = userEvent.setup();
      const onOpenNodeComments = jest.fn();
      const reason = "学習モード中はコメントを開けません。";
      renderPanel({
        commentSummary: { open: 1, resolved: 0 },
        onOpenNodeComments,
        openNodeCommentsDisabledReason: reason,
      });
      const button = screen.getByRole("button", { name: `コメントを開く（${reason}）` });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", reason);
      await user.click(button);
      expect(onOpenNodeComments).not.toHaveBeenCalled();
    });

    it("属性編集の無効化（attributeEditDisabled）ではコメントを開くを止めない", () => {
      renderPanel({
        commentSummary: { open: 1, resolved: 0 },
        onOpenNodeComments: jest.fn(),
        attributeEditDisabled: true,
      });
      expect(screen.getByRole("button", { name: "コメントを開く" })).toBeEnabled();
    });

    it("関連線を選択中はコメント節を出さない", () => {
      renderPanel({
        selectedRelation: { id: 5, kind: "related", directed: false },
        commentSummary: { open: 1, resolved: 0 },
        onOpenNodeComments: jest.fn(),
      });
      expect(screen.queryByRole("region", { name: "コメント" })).not.toBeInTheDocument();
    });
  });
});
