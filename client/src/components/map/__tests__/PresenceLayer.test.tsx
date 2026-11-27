import { render, screen } from "@testing-library/react";
import {
  PresenceLayer,
  type PresenceLayerProps,
} from "@/components/map/PresenceLayer";
import type { Node } from "@/types/node";

const REQUIRED_PRESENCE_LAYER_PROP_KEYS = [
  "remoteSelections",
  "remoteViewports",
  "participants",
  "nodes",
  "viewport",
] as const satisfies ReadonlyArray<keyof PresenceLayerProps>;

const sampleNode: Node = {
  id: 1,
  label: "根",
  x: 100,
  y: 50,
  width: 120,
  height: 40,
  parentId: null,
  importance: "medium",
};

function createProps(overrides: Partial<PresenceLayerProps> = {}): PresenceLayerProps {
  return {
    remoteSelections: new Map(),
    remoteViewports: new Map(),
    participants: [],
    nodes: [sampleNode],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    ...overrides,
  };
}

describe("PresenceLayer（L-060 / presence）", () => {
  it("L-060: 必須 props キーが揃っている（未配線 RED 用の正本）", () => {
    const props = createProps();
    for (const key of REQUIRED_PRESENCE_LAYER_PROP_KEYS) {
      expect(props[key]).toBeDefined();
    }
    render(<PresenceLayer {...props} />);
    expect(screen.getByTestId("presence-layer")).toBeInTheDocument();
  });

  it("L-060 外し変異: remoteSelections / remoteViewports 欠落は型エラー", () => {
    const full = createProps();
    // @ts-expect-error L-060: remoteSelections は必須（空 Map 成功に省略しない）
    const missingSelections: PresenceLayerProps = {
      remoteViewports: full.remoteViewports,
      participants: full.participants,
      nodes: full.nodes,
      viewport: full.viewport,
    };
    // @ts-expect-error L-060: remoteViewports は必須
    const missingViewports: PresenceLayerProps = {
      remoteSelections: full.remoteSelections,
      participants: full.participants,
      nodes: full.nodes,
      viewport: full.viewport,
    };
    void missingSelections;
    void missingViewports;
    expect(REQUIRED_PRESENCE_LAYER_PROP_KEYS).toEqual(
      expect.arrayContaining(["remoteSelections", "remoteViewports"]),
    );
  });

  it("L-060 外し変異: remoteSelections を実行時欠落させると render 失敗", () => {
    const props = createProps();
    delete (props as { remoteSelections?: unknown }).remoteSelections;
    expect(() =>
      render(<PresenceLayer {...(props as PresenceLayerProps)} />),
    ).toThrow();
  });

  it("空 Map では選択輪郭もビューポート枠も出さない（誰も選んでいない）", () => {
    render(<PresenceLayer {...createProps()} />);
    expect(screen.queryByTestId("presence-selection")).not.toBeInTheDocument();
    expect(screen.queryByTestId("presence-viewport")).not.toBeInTheDocument();
  });

  it("キーあり + [] は未選択なので選択輪郭を出さない（キー欠落と同じ見た目だが意味は別）", () => {
    render(
      <PresenceLayer
        {...createProps({
          remoteSelections: new Map([["u1", []]]),
          remoteViewports: new Map([["u1", { x: 160, y: 70 }]]),
          participants: [{ userId: "u1", displayName: "太郎", color: "#c2410c" }],
        })}
      />,
    );
    expect(screen.queryByTestId("presence-selection")).not.toBeInTheDocument();
    expect(screen.getByTestId("presence-viewport")).toBeInTheDocument();
    expect(screen.getByTestId("presence-viewport")).toHaveAttribute("data-user-id", "u1");
  });

  it("他者選択ノードに輪郭色を出し、ビューポート中心に枠を出す（ポインタ軌跡は出さない）", () => {
    render(
      <PresenceLayer
        {...createProps({
          remoteSelections: new Map([["u1", [1]]]),
          remoteViewports: new Map([["u1", { x: 160, y: 70 }]]),
          participants: [{ userId: "u1", displayName: "太郎", color: "#c2410c" }],
        })}
      />,
    );
    const selection = screen.getByTestId("presence-selection");
    expect(selection).toHaveAttribute("data-user-id", "u1");
    expect(selection).toHaveAttribute("data-node-id", "1");
    expect(selection).toHaveStyle({ borderColor: "#c2410c" });
    expect(selection).toHaveAttribute("aria-label", "太郎の選択");

    const viewport = screen.getByTestId("presence-viewport");
    expect(viewport).toHaveAttribute("data-user-id", "u1");
    expect(viewport).toHaveStyle({ borderColor: "#c2410c" });
    expect(viewport).toHaveAttribute("aria-label", "太郎の視点");

    expect(screen.queryByTestId("presence-pointer")).not.toBeInTheDocument();
  });

  it("remoteViewports にキーが無い userId は枠を出さない（null 埋めしない）", () => {
    render(
      <PresenceLayer
        {...createProps({
          remoteSelections: new Map([["u1", [1]]]),
          remoteViewports: new Map(),
          participants: [{ userId: "u1", displayName: "太郎", color: "#c2410c" }],
        })}
      />,
    );
    expect(screen.getByTestId("presence-selection")).toBeInTheDocument();
    expect(screen.queryByTestId("presence-viewport")).not.toBeInTheDocument();
  });

  it("Map キー欠落 ≠ 空選択: 欠落ユーザーは輪郭なし、キーあり+[] のみ明示未選択", () => {
    const remoteSelections = new Map<string, readonly number[]>([["present", []]]);
    expect(remoteSelections.has("present")).toBe(true);
    expect(remoteSelections.has("absent")).toBe(false);
    render(
      <PresenceLayer
        {...createProps({
          remoteSelections,
          remoteViewports: new Map([["present", { x: 160, y: 70 }]]),
          participants: [
            { userId: "present", displayName: "居る", color: "#0369a1" },
            { userId: "absent", displayName: "欠落", color: "#c2410c" },
          ],
        })}
      />,
    );
    expect(screen.queryByTestId("presence-selection")).not.toBeInTheDocument();
    const viewports = screen.getAllByTestId("presence-viewport");
    expect(viewports).toHaveLength(1);
    expect(viewports[0]).toHaveAttribute("data-user-id", "present");
  });

  it("displayName 欠落時は userId をラベルに出さず、名前バッジも出さない（Google sub 非露出）", () => {
    const googleSub = "108234567890123456789";
    render(
      <PresenceLayer
        {...createProps({
          remoteSelections: new Map([[googleSub, [1]]]),
          remoteViewports: new Map([[googleSub, { x: 160, y: 70 }]]),
          participants: [{ userId: googleSub, displayName: "", color: "#c2410c" }],
        })}
      />,
    );
    const selection = screen.getByTestId("presence-selection");
    expect(selection).toHaveAttribute("aria-label", "他の参加者の選択");
    expect(selection.getAttribute("aria-label")).not.toContain(googleSub);

    const viewport = screen.getByTestId("presence-viewport");
    expect(viewport).toHaveAttribute("aria-label", "他の参加者の視点");
    expect(viewport.getAttribute("aria-label")).not.toContain(googleSub);
    expect(viewport.textContent ?? "").not.toContain(googleSub);
    expect(viewport.textContent?.trim() ?? "").toBe("");
  });
});
