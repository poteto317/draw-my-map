import { resolveMapContextMenuAction } from "@/components/map/mapContextMenuAction";
import { NODE_CONTEXT_MENU_SIZE } from "@/components/map/nodeContextMenuLayout";
import { createTestNode } from "@/testing/createTestNode";

const node = createTestNode({ id: 1, x: 50, y: 30, width: 100, height: 60 });
const base = {
  isEditing: false,
  isTextEntryTarget: false,
  isInsideMenu: false,
  hasActiveGesture: false,
  canOpenMenu: true,
  client: { x: 100, y: 60 },
  bounds: { left: 0, top: 0, width: 800, height: 600 },
  viewport: { offsetX: 0, offsetY: 0, scale: 1 },
  visibleNodes: [node],
};

describe("resolveMapContextMenuAction", () => {
  it("ノード上で開ける場合は、クランプ済み位置つきのopenを返す", () => {
    expect(resolveMapContextMenuAction(base)).toEqual({
      type: "open",
      nodeId: 1,
      position: { x: 100, y: 60 },
    });
  });

  it("画面端ではメニューをコンテナ内へ寄せる", () => {
    expect(resolveMapContextMenuAction({
      ...base,
      client: { x: 790, y: 590 },
      visibleNodes: [createTestNode({ id: 1, x: 760, y: 560, width: 100, height: 60 })],
    })).toEqual({
      type: "open",
      nodeId: 1,
      position: {
        x: 800 - NODE_CONTEXT_MENU_SIZE.width,
        y: 600 - NODE_CONTEXT_MENU_SIZE.height,
      },
    });
  });

  it("メニューを開けない場合はselectを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, canOpenMenu: false })).toEqual({
      type: "select",
      nodeId: 1,
    });
  });

  it("対象ノードがなければdismissを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, visibleNodes: [] })).toEqual({ type: "dismiss" });
  });

  it("編集中はnativeを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, isEditing: true })).toEqual({ type: "native" });
  });

  it("文字入力欄上はnativeを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, isTextEntryTarget: true })).toEqual({ type: "native" });
  });

  it("メニュー上はsuppressを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, isInsideMenu: true })).toEqual({ type: "suppress" });
  });

  it("ジェスチャ中はsuppressを返す", () => {
    expect(resolveMapContextMenuAction({ ...base, hasActiveGesture: true })).toEqual({ type: "suppress" });
  });

  it("編集中は他の条件より優先してnativeを返す", () => {
    expect(resolveMapContextMenuAction({
      ...base,
      isEditing: true,
      isInsideMenu: true,
      hasActiveGesture: true,
    })).toEqual({ type: "native" });
  });

  it("メニュー上かつジェスチャ中でも、対象判定より先にsuppressを返す", () => {
    expect(resolveMapContextMenuAction({
      ...base,
      isInsideMenu: true,
      hasActiveGesture: true,
      visibleNodes: [],
    })).toEqual({ type: "suppress" });
  });

  it("文字入力欄上ならメニュー上かつジェスチャ中でもnativeを返す", () => {
    expect(resolveMapContextMenuAction({
      ...base,
      isTextEntryTarget: true,
      isInsideMenu: true,
      hasActiveGesture: true,
    })).toEqual({ type: "native" });
  });

  it("メニューを開けず対象ノードもない場合はselectではなくdismissを返す", () => {
    expect(resolveMapContextMenuAction({
      ...base,
      canOpenMenu: false,
      visibleNodes: [],
    })).toEqual({ type: "dismiss" });
  });

  it("拡大・平行移動したビューポートでもワールド座標でヒット判定する", () => {
    // client(250,170) -> world((250-50)/2, (170-50)/2) = (100,60) はノード(50..150, 30..90)内
    expect(resolveMapContextMenuAction({
      ...base,
      client: { x: 250, y: 170 },
      viewport: { offsetX: 50, offsetY: 50, scale: 2 },
    })).toEqual({
      type: "open",
      nodeId: 1,
      position: { x: 250, y: 170 },
    });
  });
});
