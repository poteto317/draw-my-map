import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeBacklinksSection } from "@/components/layout/NodeBacklinksSection";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import { createTestNode } from "@/testing/createTestNode";

const CURRENT_MAP_ID = "map-current";
const OTHER_MAP_ID = "map-other";

function createCorpus(overrides: Partial<CrossMapCorpus> = {}): CrossMapCorpus {
  return {
    readableMaps: [
      {
        mapId: CURRENT_MAP_ID,
        mapName: "現在のマップ",
        isCurrent: true,
        nodes: [
          createTestNode({ id: 1, label: "ターゲット" }),
          createTestNode({
            id: 2,
            label: "同マップ参照元",
            mapLinks: [{ targetMapId: CURRENT_MAP_ID, targetNodeId: 1 }],
          }),
        ],
      },
      {
        mapId: OTHER_MAP_ID,
        mapName: "別マップ",
        isCurrent: false,
        nodes: [
          createTestNode({
            id: 10,
            label: "他マップ全体参照",
            mapLinks: [{ targetMapId: CURRENT_MAP_ID }],
          }),
          createTestNode({
            id: 11,
            label: "他マップ直接参照",
            mapLinks: [{ targetMapId: CURRENT_MAP_ID, targetNodeId: 1 }],
          }),
        ],
      },
    ],
    unreadableMaps: [],
    ...overrides,
  };
}

function section(): HTMLElement {
  return screen.getByRole("region", { name: "被リンク" });
}

describe("NodeBacklinksSection", () => {
  it("未選択のときは「ノードを選択してください」のみを表示し、一覧や注意文言を描かない", () => {
    render(
      <NodeBacklinksSection
        selectedNodeId={null}
        currentMapId={CURRENT_MAP_ID}
        corpus={createCorpus({
          unreadableMaps: [{ mapId: "broken", mapName: "破損マップ", reason: "corrupt" }],
        })}
        storageMode="protected"
        onNavigateToMapTarget={jest.fn()}
      />,
    );

    expect(within(section()).getByRole("heading", { name: "被リンク" })).toBeInTheDocument();
    expect(within(section()).getByText("ノードを選択してください")).toBeInTheDocument();
    expect(within(section()).queryByRole("button")).toBeNull();
    expect(
      within(section()).queryByText("保護モードのため他マップからの被リンクは確認できません"),
    ).toBeNull();
    expect(
      within(section()).queryByText(
        "一部のマップを読み取れなかったため、すべての被リンクを表示できていません",
      ),
    ).toBeNull();
  });

  it("被リンクが 0 件のときは「このノードへの被リンクはありません」を表示する", () => {
    render(
      <NodeBacklinksSection
        selectedNodeId={2}
        currentMapId={CURRENT_MAP_ID}
        corpus={{
          readableMaps: [
            {
              mapId: CURRENT_MAP_ID,
              mapName: "現在のマップ",
              isCurrent: true,
              nodes: [createTestNode({ id: 2, label: "孤立ノード" })],
            },
          ],
          unreadableMaps: [],
        }}
        storageMode="persistent"
        onNavigateToMapTarget={jest.fn()}
      />,
    );

    expect(within(section()).getByText("このノードへの被リンクはありません")).toBeInTheDocument();
    expect(within(section()).queryByRole("button")).toBeNull();
  });

  it("ノード直接（このノードへ）を先に、マップ全体（このマップ全体へ）を後に表示し、クリックで参照元へ移動する", async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    render(
      <NodeBacklinksSection
        selectedNodeId={1}
        currentMapId={CURRENT_MAP_ID}
        corpus={createCorpus()}
        storageMode="persistent"
        onNavigateToMapTarget={onNavigate}
      />,
    );

    const buttons = within(section()).getAllByRole("button");
    expect(buttons).toHaveLength(3);

    expect(buttons[0]).toHaveTextContent("現在のマップ");
    expect(buttons[0]).toHaveTextContent("同マップ参照元");
    expect(buttons[0]).toHaveTextContent("このノードへ");
    expect(buttons[0].querySelector("button")).toBeNull();

    expect(buttons[1]).toHaveTextContent("別マップ");
    expect(buttons[1]).toHaveTextContent("他マップ直接参照");
    expect(buttons[1]).toHaveTextContent("このノードへ");

    expect(buttons[2]).toHaveTextContent("別マップ");
    expect(buttons[2]).toHaveTextContent("他マップ全体参照");
    expect(buttons[2]).toHaveTextContent("このマップ全体へ");

    await user.click(buttons[1]);
    expect(onNavigate).toHaveBeenNthCalledWith(1, OTHER_MAP_ID, 11);

    await user.click(buttons[2]);
    expect(onNavigate).toHaveBeenNthCalledWith(2, OTHER_MAP_ID, 10);
  });

  it("保護モードでは注意文言を表示しつつ、現在マップ内の被リンクは引き続き表示・移動できる（L-002）", async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    const protectedCorpus: CrossMapCorpus = {
      readableMaps: [createCorpus().readableMaps[0]],
      unreadableMaps: [],
    };
    render(
      <NodeBacklinksSection
        selectedNodeId={1}
        currentMapId={CURRENT_MAP_ID}
        corpus={protectedCorpus}
        storageMode="protected"
        onNavigateToMapTarget={onNavigate}
      />,
    );

    expect(
      within(section()).getByText("保護モードのため他マップからの被リンクは確認できません"),
    ).toBeInTheDocument();

    const buttons = within(section()).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("同マップ参照元");
    await user.click(buttons[0]);
    expect(onNavigate).toHaveBeenCalledWith(CURRENT_MAP_ID, 2);
  });

  it("読み取れなかったマップがあるときは注意文言を表示する（L-002）", () => {
    render(
      <NodeBacklinksSection
        selectedNodeId={2}
        currentMapId={CURRENT_MAP_ID}
        corpus={{
          readableMaps: [
            {
              mapId: CURRENT_MAP_ID,
              mapName: "現在のマップ",
              isCurrent: true,
              nodes: [createTestNode({ id: 2, label: "孤立ノード" })],
            },
          ],
          unreadableMaps: [
            { mapId: "broken", mapName: "破損マップ", reason: "read-error" },
          ],
        }}
        storageMode="persistent"
        onNavigateToMapTarget={jest.fn()}
      />,
    );

    expect(
      within(section()).getByText(
        "一部のマップを読み取れなかったため、すべての被リンクを表示できていません",
      ),
    ).toBeInTheDocument();
    expect(within(section()).getByText("このノードへの被リンクはありません")).toBeInTheDocument();
  });
});
