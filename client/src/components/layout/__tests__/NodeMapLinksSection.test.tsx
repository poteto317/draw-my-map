import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeMapLinksSection } from "@/components/layout/NodeMapLinksSection";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import {
  NODE_MAP_LINKS_MAX_COUNT,
  addNodeMapLink,
  removeNodeMapLink,
  type AddNodeMapLinkOutcome,
  type NodeMapLink,
} from "@/domain/nodes/nodeMapLink";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const CURRENT_MAP_ID = "map-current";
const OTHER_MAP_ID = "map-other";
const UNREADABLE_MAP_ID = "map-broken";

const DEFAULT_MAPS: readonly MapIndexEntry[] = [
  {
    id: CURRENT_MAP_ID,
    name: "現在のマップ",
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
  },
  {
    id: OTHER_MAP_ID,
    name: "別マップ",
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
  },
  {
    id: UNREADABLE_MAP_ID,
    name: "破損マップ",
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
  },
];

function createDefaultCorpus(currentNodes: readonly Node[]): CrossMapCorpus {
  return {
    readableMaps: [
      {
        mapId: CURRENT_MAP_ID,
        mapName: "現在のマップ",
        isCurrent: true,
        isArchived: false,
        nodes: currentNodes,
      },
      {
        mapId: OTHER_MAP_ID,
        mapName: "別マップ",
        isCurrent: false,
        isArchived: false,
        nodes: [
          createTestNode({ id: 10, label: "参考資料" }),
          createTestNode({ id: 20, label: "" }),
        ],
      },
    ],
    unreadableMaps: [
      {
        mapId: UNREADABLE_MAP_ID,
        mapName: "破損マップ",
        reason: "corrupt",
      },
    ],
  };
}

function mapLinksOf(count: number): NodeMapLink[] {
  return Array.from({ length: count }, (_, index) => ({
    targetMapId: OTHER_MAP_ID,
    targetNodeId: index + 100,
  }));
}

type HarnessProps = {
  initialLinks?: readonly NodeMapLink[];
  selectedNodeId?: number;
  documentRevision?: number;
  maps?: readonly MapIndexEntry[];
  storageMode?: "persistent" | "protected";
  corpusOverride?: CrossMapCorpus;
  onAdd?: jest.Mock;
  onRemove?: jest.Mock;
  onNavigate?: jest.Mock;
};

function Harness({
  initialLinks,
  selectedNodeId = 1,
  documentRevision = 0,
  maps = DEFAULT_MAPS,
  storageMode = "persistent",
  corpusOverride,
  onAdd = jest.fn(),
  onRemove = jest.fn(),
  onNavigate = jest.fn(),
}: HarnessProps) {
  const [nodes, setNodes] = useState<Node[]>(() => [
    createTestNode({
      id: 1,
      label: "親ノード",
      ...(initialLinks === undefined ? {} : { mapLinks: initialLinks }),
    }),
    createTestNode({ id: 2, label: "子ノード" }),
    createTestNode({ id: 3, label: "" }),
  ]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const corpus = corpusOverride ?? createDefaultCorpus(nodes);

  const handleAdd = (
    nodeId: number,
    input: { targetMapId: string; targetNodeId?: number },
  ): AddNodeMapLinkOutcome => {
    onAdd(nodeId, input);
    const result = addNodeMapLink(nodes, nodeId, CURRENT_MAP_ID, input);
    if (!result.ok) return { ok: false, reason: result.reason };
    setNodes(result.nodes);
    return { ok: true };
  };

  const handleRemove = (nodeId: number, target: NodeMapLink): boolean => {
    onRemove(nodeId, target);
    const next = removeNodeMapLink(nodes, nodeId, target);
    if (next === null) return false;
    setNodes(next);
    return true;
  };

  return (
    <NodeMapLinksSection
      selectedNode={selectedNode}
      documentRevision={documentRevision}
      currentMapId={CURRENT_MAP_ID}
      maps={maps}
      corpus={corpus}
      storageMode={storageMode}
      onAddMapLink={handleAdd}
      onRemoveMapLink={handleRemove}
      onNavigateToMapTarget={onNavigate}
    />
  );
}

function section(): HTMLElement {
  return screen.getByRole("region", { name: "マップ間リンク" });
}

function mapSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: "対象マップ" }) as HTMLSelectElement;
}

function nodeSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: "対象ノード（任意）" }) as HTMLSelectElement;
}

function addButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "追加" }) as HTMLButtonElement;
}

describe("NodeMapLinksSection", () => {
  it("未選択のときは「ノードを選択してください」のみを表示し、フォーム・一覧を描かない", () => {
    render(
      <NodeMapLinksSection
        selectedNode={null}
        documentRevision={0}
        currentMapId={CURRENT_MAP_ID}
        maps={DEFAULT_MAPS}
        corpus={createDefaultCorpus([])}
        storageMode="persistent"
        onAddMapLink={jest.fn()}
        onRemoveMapLink={jest.fn()}
        onNavigateToMapTarget={jest.fn()}
      />,
    );

    expect(within(section()).getByRole("heading", { name: "マップ間リンク" })).toBeInTheDocument();
    expect(within(section()).getByText("ノードを選択してください")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("リンクが 0 件のときは案内と「0 / 10 件」および空の status ライブリージョンを出す", () => {
    render(<Harness />);

    expect(within(section()).getByText("マップ間リンクはありません")).toBeInTheDocument();
    expect(within(section()).getByText("0 / 10 件")).toBeInTheDocument();
    expect(within(section()).getByRole("status")).toHaveTextContent("");
  });

  it("有効なリンク（マップ全体・特定ノード）の移動ボタンを表示し、クリックで遷移先を通知する（ボタン非入れ子・L-835）", async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    render(
      <Harness
        initialLinks={[
          { targetMapId: OTHER_MAP_ID },
          { targetMapId: OTHER_MAP_ID, targetNodeId: 10 },
        ]}
        onNavigate={onNavigate}
      />,
    );

    const mapLinkButton = within(section()).getByRole("button", { name: "別マップ" });
    const nodeLinkButton = within(section()).getByRole("button", { name: "別マップ / 参考資料" });
    expect(mapLinkButton.querySelector("button")).toBeNull();
    expect(nodeLinkButton.querySelector("button")).toBeNull();

    await user.click(mapLinkButton);
    expect(onNavigate).toHaveBeenNthCalledWith(1, OTHER_MAP_ID, undefined);

    await user.click(nodeLinkButton);
    expect(onNavigate).toHaveBeenNthCalledWith(2, OTHER_MAP_ID, 10);

    expect(
      within(section()).getByRole("button", { name: "マップ間リンクを削除: 別マップ" }),
    ).toBeInTheDocument();
    expect(
      within(section()).getByRole("button", { name: "マップ間リンクを削除: 別マップ / 参考資料" }),
    ).toBeInTheDocument();
    expect(within(section()).getByText("2 / 10 件")).toBeInTheDocument();
  });

  it("リンク切れ（missing-map / missing-node / unreadable-map）を理由付きで表示し、移動ボタンは出さない", () => {
    render(
      <Harness
        initialLinks={[
          { targetMapId: "map-deleted" },
          { targetMapId: OTHER_MAP_ID, targetNodeId: 999 },
          { targetMapId: UNREADABLE_MAP_ID, targetNodeId: 5 },
        ]}
      />,
    );

    const items = within(section()).getAllByRole("listitem");
    expect(items).toHaveLength(3);

    expect(items[0]).toHaveTextContent("リンク切れ");
    expect(items[0]).toHaveTextContent("対象マップが見つかりません");
    expect(items[0]).toHaveTextContent("map-deleted");
    expect(within(items[0]).getAllByRole("button")).toHaveLength(1);

    expect(items[1]).toHaveTextContent("リンク切れ");
    expect(items[1]).toHaveTextContent("対象ノードが見つかりません");
    expect(items[1]).toHaveTextContent("別マップ");
    expect(within(items[1]).getAllByRole("button")).toHaveLength(1);

    expect(items[2]).toHaveTextContent("リンク切れ");
    expect(items[2]).toHaveTextContent("対象マップを読み取れません");
    expect(items[2]).toHaveTextContent("破損マップ");
    expect(within(items[2]).getAllByRole("button")).toHaveLength(1);
  });

  it("保護モードでは他マップリンクをリンク切れ扱いせず専用案内を表示し、現在マップ内リンクは移動できる（L-002）", async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    render(
      <Harness
        storageMode="protected"
        maps={[DEFAULT_MAPS[0]]}
        initialLinks={[
          { targetMapId: OTHER_MAP_ID, targetNodeId: 10 },
          { targetMapId: CURRENT_MAP_ID, targetNodeId: 2 },
        ]}
        onNavigate={onNavigate}
      />,
    );

    const items = within(section()).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(items[0]).toHaveTextContent("保護モードのため他マップのリンク先を確認・移動できません");
    expect(items[0]).not.toHaveTextContent("リンク切れ");
    expect(within(items[0]).getAllByRole("button")).toHaveLength(1);

    const localButton = within(items[1]).getByRole("button", { name: "現在のマップ / 子ノード" });
    await user.click(localButton);
    expect(onNavigate).toHaveBeenCalledWith(CURRENT_MAP_ID, 2);
  });

  it("対象マップが現在マップのときは自分自身のノードを除外し、空ラベルノードは既定表示名で出す", () => {
    render(<Harness />);

    expect(mapSelect()).toHaveValue(CURRENT_MAP_ID);
    const options = Array.from(nodeSelect().options).map((option) => ({
      value: option.value,
      label: option.textContent,
    }));
    expect(options).toEqual([
      { value: "", label: "マップ全体" },
      { value: "2", label: "子ノード" },
      { value: "3", label: FALLBACK_NODE_LABEL },
    ]);
  });

  it("対象マップが読み取れないときは「マップ全体」のみ選択可能とし注意文言を出す", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(mapSelect(), UNREADABLE_MAP_ID);

    const options = Array.from(nodeSelect().options).map((option) => option.value);
    expect(options).toEqual([""]);
    expect(
      within(section()).getByText("このマップは読み取れないため、特定のノードは選択できません"),
    ).toBeInTheDocument();
  });

  it("選択中の対象マップが maps から消えた場合は先頭マップへ安全にフォールバックする", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);

    await user.selectOptions(mapSelect(), OTHER_MAP_ID);
    expect(mapSelect()).toHaveValue(OTHER_MAP_ID);

    rerender(<Harness maps={[DEFAULT_MAPS[0]]} />);
    expect(mapSelect()).toHaveValue(CURRENT_MAP_ID);
  });

  it("対象マップを別マップへ切り替えたとき、切替前後に同一ノード ID があっても対象ノードをマップ全体へリセットする", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    const sharedIdCorpus: CrossMapCorpus = {
      readableMaps: [
        {
          mapId: CURRENT_MAP_ID,
          mapName: "現在のマップ",
          isCurrent: true,
        isArchived: false,
          nodes: [
            createTestNode({ id: 1, label: "親ノード" }),
            createTestNode({ id: 10, label: "現在マップのノード10" }),
          ],
        },
        {
          mapId: OTHER_MAP_ID,
          mapName: "別マップ",
          isCurrent: false,
        isArchived: false,
          nodes: [createTestNode({ id: 10, label: "別マップのノード10" })],
        },
      ],
      unreadableMaps: [],
    };
    render(<Harness corpusOverride={sharedIdCorpus} onAdd={onAdd} />);

    await user.selectOptions(nodeSelect(), "10");
    expect(nodeSelect()).toHaveValue("10");

    await user.selectOptions(mapSelect(), OTHER_MAP_ID);
    expect(mapSelect()).toHaveValue(OTHER_MAP_ID);
    expect(nodeSelect()).toHaveValue("");

    await user.click(addButton());
    expect(onAdd).toHaveBeenCalledWith(1, { targetMapId: OTHER_MAP_ID });
  });

  it("選択中の対象マップが maps から消えてフォールバックしたとき、対象ノードをリセットしフォールバック先マップのノードを選択・追加できる", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    const sharedIdCorpus: CrossMapCorpus = {
      readableMaps: [
        {
          mapId: CURRENT_MAP_ID,
          mapName: "現在のマップ",
          isCurrent: true,
        isArchived: false,
          nodes: [
            createTestNode({ id: 1, label: "親ノード" }),
            createTestNode({ id: 2, label: "子ノード" }),
            createTestNode({ id: 10, label: "現在マップのノード10" }),
          ],
        },
        {
          mapId: OTHER_MAP_ID,
          mapName: "別マップ",
          isCurrent: false,
        isArchived: false,
          nodes: [createTestNode({ id: 10, label: "参考資料" })],
        },
      ],
      unreadableMaps: [],
    };
    const { rerender } = render(<Harness corpusOverride={sharedIdCorpus} onAdd={onAdd} />);

    await user.selectOptions(mapSelect(), OTHER_MAP_ID);
    await user.selectOptions(nodeSelect(), "10");
    expect(nodeSelect()).toHaveValue("10");

    // 1 件のみに減った状態へフォールバックする
    rerender(<Harness corpusOverride={sharedIdCorpus} maps={[DEFAULT_MAPS[0]]} onAdd={onAdd} />);
    expect(mapSelect()).toHaveValue(CURRENT_MAP_ID);
    expect(nodeSelect()).toHaveValue("");

    await user.selectOptions(nodeSelect(), "2");
    expect(nodeSelect()).toHaveValue("2");
    await user.click(addButton());
    expect(onAdd).toHaveBeenCalledWith(1, { targetMapId: CURRENT_MAP_ID, targetNodeId: 2 });

    // 消えたマップが後から再登場しても古い選択マップが復活しない
    rerender(<Harness corpusOverride={sharedIdCorpus} maps={DEFAULT_MAPS} onAdd={onAdd} />);
    expect(mapSelect()).toHaveValue(CURRENT_MAP_ID);
  });

  it("対象ノード（任意）で選択中のノードが corpus から削除されたとき、マップ全体へフォールバックし削除済みノード ID を渡さない", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    const initialCorpus = createDefaultCorpus([
      createTestNode({ id: 1, label: "親ノード" }),
      createTestNode({ id: 2, label: "子ノード" }),
    ]);
    const reducedCorpus: CrossMapCorpus = {
      ...initialCorpus,
      readableMaps: initialCorpus.readableMaps.map((snapshot) =>
        snapshot.mapId === OTHER_MAP_ID
          ? { ...snapshot, nodes: snapshot.nodes.filter((node) => node.id !== 10) }
          : snapshot,
      ),
    };

    const { rerender } = render(<Harness corpusOverride={initialCorpus} onAdd={onAdd} />);

    await user.selectOptions(mapSelect(), OTHER_MAP_ID);
    await user.selectOptions(nodeSelect(), "10");
    expect(nodeSelect()).toHaveValue("10");

    rerender(<Harness corpusOverride={reducedCorpus} onAdd={onAdd} />);
    expect(nodeSelect()).toHaveValue("");

    // 同 ID のノードが後から再登場しても古い選択ノードが復活しない
    rerender(<Harness corpusOverride={initialCorpus} onAdd={onAdd} />);
    expect(nodeSelect()).toHaveValue("");

    // 削除状態で送信したときに削除済みノード ID を渡さない
    await user.selectOptions(nodeSelect(), "10");
    rerender(<Harness corpusOverride={reducedCorpus} onAdd={onAdd} />);
    expect(nodeSelect()).toHaveValue("");
    await user.click(addButton());
    expect(onAdd).toHaveBeenCalledWith(1, { targetMapId: OTHER_MAP_ID });
  });

  it("フォーム送信でマップ全体および特定ノード（parsePositiveNodeIdString 復号）を追加でき、成功時は対象ノード選択を戻しフォーカスを維持する", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness onAdd={onAdd} />);

    expect(mapSelect().form).toHaveAttribute("novalidate");

    await user.selectOptions(mapSelect(), OTHER_MAP_ID);
    await user.selectOptions(nodeSelect(), "10");
    await user.click(addButton());

    expect(onAdd).toHaveBeenNthCalledWith(1, 1, { targetMapId: OTHER_MAP_ID, targetNodeId: 10 });
    expect(nodeSelect()).toHaveValue("");
    expect(addButton()).toHaveFocus();
    expect(within(section()).getByRole("button", { name: "別マップ / 参考資料" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();

    await user.click(addButton());
    expect(onAdd).toHaveBeenNthCalledWith(2, 1, { targetMapId: OTHER_MAP_ID });
    expect(within(section()).getByRole("button", { name: "別マップ" })).toBeInTheDocument();
  });

  it("不正なノード ID（0 等）が選択肢に混入しても parsePositiveNodeIdString で弾き role=alert を表示する（L-046）", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    const badCorpus: CrossMapCorpus = {
      readableMaps: [
        {
          mapId: CURRENT_MAP_ID,
          mapName: "現在のマップ",
          isCurrent: true,
        isArchived: false,
          nodes: [createTestNode({ id: 1, label: "親" }), createTestNode({ id: 0, label: "不正ノード" })],
        },
      ],
      unreadableMaps: [],
    };
    render(<Harness corpusOverride={badCorpus} maps={[DEFAULT_MAPS[0]]} onAdd={onAdd} />);

    await user.selectOptions(nodeSelect(), "0");
    await user.click(addButton());

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("リンク先のノードが正しくありません。");
  });

  it("重複などの失敗理由を role=alert で表示し、選択変更でエラーを消す（L-057）", async () => {
    const user = userEvent.setup();
    render(<Harness initialLinks={[{ targetMapId: OTHER_MAP_ID }]} />);

    await user.selectOptions(mapSelect(), OTHER_MAP_ID);
    await user.click(addButton());

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("同じマップ間リンクがすでに追加されています。");
    expect(mapSelect()).toHaveAttribute("aria-invalid", "true");
    expect(mapSelect().getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);

    await user.selectOptions(nodeSelect(), "10");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mapSelect()).not.toHaveAttribute("aria-invalid");
  });

  it.each([[{ isComposing: true }], [{ keyCode: 229 }], [{ repeat: true }]])(
    "IME 変換中・押し続けの Enter（%o）をフォーム上で抑止する（L-408・L-474）",
    (init) => {
      render(<Harness />);

      expect(fireEvent.keyDown(mapSelect(), { key: "Enter", ...init })).toBe(false);
      expect(fireEvent.keyDown(nodeSelect(), { key: "Enter", ...init })).toBe(false);
      expect(fireEvent.keyDown(addButton(), { key: "Enter", ...init })).toBe(false);
      expect(fireEvent.keyDown(mapSelect(), { key: "Enter" })).toBe(true);
    },
  );

  it("上限 10 件では status 案内を出し、入力・追加ボタンは disabled にせず、送信時に too-many を role=alert で通知する（L-061）", async () => {
    const user = userEvent.setup();
    const onAdd = jest.fn();
    render(<Harness initialLinks={mapLinksOf(NODE_MAP_LINKS_MAX_COUNT)} onAdd={onAdd} />);

    expect(within(section()).getByText("10 / 10 件")).toBeInTheDocument();
    expect(within(section()).getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(mapSelect()).toBeEnabled();
    expect(nodeSelect()).toBeEnabled();
    expect(addButton()).toBeEnabled();

    await user.selectOptions(mapSelect(), OTHER_MAP_ID);
    await user.click(addButton());

    expect(onAdd).toHaveBeenCalledWith(1, { targetMapId: OTHER_MAP_ID });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "マップ間リンクは 1 つのノードに 10 件まで追加できます。",
    );
  });

  it("削除は NodeMapLink の値渡しで呼び出し、対象マップセレクトへフォーカスを戻す（L-035・L-397）", async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    render(
      <Harness
        initialLinks={[
          { targetMapId: OTHER_MAP_ID },
          { targetMapId: OTHER_MAP_ID, targetNodeId: 10 },
        ]}
        onRemove={onRemove}
      />,
    );

    await user.click(
      within(section()).getByRole("button", { name: "マップ間リンクを削除: 別マップ" }),
    );

    expect(onRemove).toHaveBeenCalledWith(1, { targetMapId: OTHER_MAP_ID });
    expect(within(section()).queryByRole("button", { name: "別マップ" })).toBeNull();
    expect(within(section()).getByRole("button", { name: "別マップ / 参考資料" })).toBeInTheDocument();
    expect(mapSelect()).toHaveFocus();
  });

  it("10 件から 9 件へ削除すると上限案内が消え、対象マップセレクトへフォーカスが戻る", async () => {
    const user = userEvent.setup();
    render(<Harness initialLinks={mapLinksOf(NODE_MAP_LINKS_MAX_COUNT)} />);

    const deleteButtons = within(section()).getAllByRole("button", { name: /^マップ間リンクを削除:/ });
    await user.click(deleteButtons[0]);

    expect(within(section()).getByText("9 / 10 件")).toBeInTheDocument();
    expect(within(section()).getByRole("status")).toHaveTextContent("");
    expect(mapSelect()).toHaveFocus();
  });

  it("documentRevision が変わると要素を作り直さず（フォーカス維持）下書きとエラーだけをリセットする（L-397）", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Harness
        initialLinks={[{ targetMapId: OTHER_MAP_ID, targetNodeId: 10 }]}
        documentRevision={0}
      />,
    );

    await user.selectOptions(mapSelect(), OTHER_MAP_ID);
    await user.selectOptions(nodeSelect(), "10");
    await user.click(addButton());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(mapSelect()).toHaveValue(OTHER_MAP_ID);
    expect(nodeSelect()).toHaveValue("10");

    const selectEl = mapSelect();
    const deleteButton = within(section()).getByRole("button", {
      name: "マップ間リンクを削除: 別マップ / 参考資料",
    });
    deleteButton.focus();

    rerender(
      <Harness
        initialLinks={[{ targetMapId: OTHER_MAP_ID, targetNodeId: 10 }]}
        documentRevision={1}
      />,
    );

    expect(mapSelect()).toBe(selectEl);
    expect(mapSelect()).toHaveValue(CURRENT_MAP_ID);
    expect(nodeSelect()).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(deleteButton).toHaveFocus();
  });

  it("documentRevision が変わらない再描画では下書きを保持し、selectedNode.id が変わると下書きとエラーをリセットする", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Harness
        initialLinks={[{ targetMapId: OTHER_MAP_ID, targetNodeId: 10 }]}
        selectedNodeId={1}
        documentRevision={0}
      />,
    );

    await user.selectOptions(mapSelect(), OTHER_MAP_ID);
    await user.selectOptions(nodeSelect(), "10");
    await user.click(addButton());
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <Harness
        initialLinks={[{ targetMapId: OTHER_MAP_ID, targetNodeId: 10 }]}
        selectedNodeId={1}
        documentRevision={0}
      />,
    );
    expect(mapSelect()).toHaveValue(OTHER_MAP_ID);
    expect(nodeSelect()).toHaveValue("10");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <Harness
        initialLinks={[{ targetMapId: OTHER_MAP_ID, targetNodeId: 10 }]}
        selectedNodeId={2}
        documentRevision={0}
      />,
    );
    expect(mapSelect()).toHaveValue(CURRENT_MAP_ID);
    expect(nodeSelect()).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
