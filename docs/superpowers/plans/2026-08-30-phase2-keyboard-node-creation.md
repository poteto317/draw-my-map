# Phase 2 Keyboard Node Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 選択中のノードから Tab で子ノード、Enter で兄弟ノードを作成し、親子間の曲線描画とサブツリー削除を実現する。

**Architecture:** Node.parentId を親子関係の単一情報源とし、作成・配置・削除は useNodes、キーボード入力・編集開始・PixiJS描画は MapStage が担当する。接続線は保存せず、現在のノード配列から描画時に導出する。

**Tech Stack:** Next.js 16.1.6、React 19.2.3、TypeScript 5、PixiJS 8.16、Jest 30、Testing Library、Tailwind CSS 4

**Spec:** docs/superpowers/specs/2026-08-30-phase2-keyboard-node-creation-design.md

## Global Constraints

- マウスによる既存ノード同士の接続は今回実装しない。
- ノード同士の重なりを避ける自動レイアウトは今回実装しない。
- 親ノード移動時の子孫ノード一括移動は今回実装しない。
- 接続線は parentId から導出し、独立した Edge[] として保存しない。
- 水平間隔は120px、兄弟間の垂直余白は40pxとする。
- 編集中の Enter、Tab、Delete、Backspace はノード操作に使用しない。
- 各実装タスクは失敗するテストを先に確認してから最小実装を行う。
- client の変更後は最終的に npm run verify を実行する。

---

### Task 1: Phase 1の検証済みベースラインを記録する

**Files:**
- Modify: client/src/app/page.tsx
- Modify: client/src/components/map/MapStage.tsx
- Modify: client/src/components/map/__tests__/MapStage.test.tsx
- Create: client/src/hooks/useNodes.ts
- Create: client/src/hooks/__tests__/useNodes.test.ts
- Create: client/src/types/node.ts
- Delete: client/src/hooks/useRects.ts
- Delete: client/src/hooks/__tests__/useRects.test.ts
- Delete: client/src/types/rect.ts
- Create: ROADMAP.md
- Create: docs/backlog/phase1-node-basics.md

**Interfaces:**
- Consumes: 現在の作業ツリーにあるPhase 1実装
- Produces: Phase 2を積み上げられる、テスト済みのコミット済みベースライン

- [ ] **Step 1: Phase 1差分の対象を確認する**

Run:

~~~bash
git status --short
git diff -- client/src/app/page.tsx client/src/components/map/MapStage.tsx client/src/components/map/__tests__/MapStage.test.tsx
git diff -- client/src/hooks/useRects.ts client/src/hooks/__tests__/useRects.test.ts client/src/types/rect.ts
~~~

Expected: Phase 1のノード追加・選択・編集・移動・削除と、Rect から Node への移行だけが表示される。

- [ ] **Step 2: Phase 1の検証を実行する**

Run:

~~~bash
cd client
npm run verify
~~~

Expected: lint、型チェック、37件のテスト、本番ビルドが成功する。サンドボックスのポート制限だけでビルドが失敗した場合は、同じ npm run build を許可付きで再実行する。

- [ ] **Step 3: Phase 1関連ファイルだけをコミットする**

~~~bash
git add ROADMAP.md docs/backlog/phase1-node-basics.md \
  client/src/app/page.tsx \
  client/src/components/map/MapStage.tsx \
  client/src/components/map/__tests__/MapStage.test.tsx \
  client/src/hooks/useNodes.ts \
  client/src/hooks/__tests__/useNodes.test.ts \
  client/src/types/node.ts
git add -u client/src/hooks/useRects.ts client/src/hooks/__tests__/useRects.test.ts client/src/types/rect.ts
git commit -m "feat: complete phase 1 node basics"
~~~

Expected: Phase 2実装開始前の git status --short が空になる。

---

### Task 2: 親子関係をノードモデルへ追加する

**Files:**
- Modify: client/src/types/node.ts:1
- Modify: client/src/hooks/useNodes.ts:5
- Modify: client/src/hooks/__tests__/useNodes.test.ts:5
- Modify: client/src/components/map/__tests__/MapStage.test.tsx:49

**Interfaces:**
- Consumes: Node、useNodes.addNode(x, y)
- Produces: Node.parentId: number | null、addNode(x: number, y: number): number

- [ ] **Step 1: ルートノードの親と戻り値を表す失敗テストを書く**

client/src/hooks/__tests__/useNodes.test.ts に追加する。

~~~tsx
it("addNode は parentId が null のルートノードを作成し、そのIDを返す", () => {
  jest.spyOn(Date, "now").mockReturnValue(101);
  const { result } = renderHook(() => useNodes());
  let createdId!: number;

  act(() => {
    createdId = result.current.addNode(200, 150);
  });

  expect(createdId).toBe(101);
  expect(result.current.nodes[0]).toMatchObject({
    id: 101,
    parentId: null,
  });
  jest.restoreAllMocks();
});
~~~

client/src/components/map/__tests__/MapStage.test.tsx のすべての Node fixture に parentId: null を追加する。

- [ ] **Step 2: テストが型または期待値で失敗することを確認する**

Run:

~~~bash
cd client
npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts
~~~

Expected: parentId が存在しない、または addNode がIDを返さないためFAILする。

- [ ] **Step 3: Node と addNode を最小変更する**

client/src/types/node.ts:

~~~ts
export type Node = {
  id: number;
  parentId: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};
~~~

client/src/hooks/useNodes.ts:

~~~ts
type UseNodesReturn = {
  nodes: Node[];
  selectedNodeId: number | null;
  addNode: (x: number, y: number) => number;
  selectNode: (id: number | null) => void;
  updateNodeLabel: (id: number, label: string) => void;
  moveNode: (id: number, x: number, y: number) => void;
  deleteNode: (id: number) => void;
};

const addNode = (x: number, y: number) => {
  const id = Date.now();
  setNodes((prev) => [
    ...prev,
    {
      id,
      parentId: null,
      x: x - RECT_WIDTH / 2,
      y: y - RECT_HEIGHT / 2,
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      label: "",
    },
  ]);
  return id;
};
~~~

- [ ] **Step 4: 関連テストを実行して成功を確認する**

Run:

~~~bash
cd client
npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts src/components/map/__tests__/MapStage.test.tsx
~~~

Expected: 対象テストがすべてPASSする。

- [ ] **Step 5: コミットする**

~~~bash
git add client/src/types/node.ts client/src/hooks/useNodes.ts client/src/hooks/__tests__/useNodes.test.ts client/src/components/map/__tests__/MapStage.test.tsx
git commit -m "feat: add parent relation to nodes"
~~~

---

### Task 3: 子ノードと兄弟ノードの作成・配置を実装する

**Files:**
- Modify: client/src/config/shapes.ts:1
- Modify: client/src/hooks/useNodes.ts:5
- Modify: client/src/hooks/__tests__/useNodes.test.ts

**Interfaces:**
- Consumes: Node.parentId、RECT_WIDTH、RECT_HEIGHT
- Produces: CHILD_HORIZONTAL_GAP = 120、SIBLING_VERTICAL_GAP = 40、addChildNode(parentId: number): number | null、addSiblingNode(nodeId: number): number | null

- [ ] **Step 1: 子ノード作成の失敗テストを書く**

~~~tsx
it("addChildNode は親の右側に子を作成して選択する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());

  act(() => result.current.addNode(100, 100));
  const parent = result.current.nodes[0];
  let childId!: number | null;
  act(() => {
    childId = result.current.addChildNode(parent.id);
  });

  expect(childId).toBe(2);
  expect(result.current.nodes[1]).toMatchObject({
    id: 2,
    parentId: parent.id,
    x: parent.x + parent.width + 120,
    y: parent.y,
  });
  expect(result.current.selectedNodeId).toBe(2);
  jest.restoreAllMocks();
});

it("2個目の子は既存兄弟の最下部から40px下へ配置する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());

  act(() => result.current.addNode(100, 100));
  const parentId = result.current.nodes[0].id;
  act(() => result.current.addChildNode(parentId));
  const firstChild = result.current.nodes[1];
  act(() => result.current.addChildNode(parentId));

  expect(result.current.nodes[2].y).toBe(firstChild.y + firstChild.height + 40);
  jest.restoreAllMocks();
});

it("存在しない親には子ノードを作成しない", () => {
  const { result } = renderHook(() => useNodes());
  let createdId!: number | null;
  act(() => {
    createdId = result.current.addChildNode(999);
  });
  expect(createdId).toBeNull();
  expect(result.current.nodes).toEqual([]);
});
~~~

- [ ] **Step 2: 子ノード作成テストが未実装で失敗することを確認する**

Run: cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts

Expected: addChildNode が存在しないためFAILする。

- [ ] **Step 3: 子ノード作成を最小実装する**

client/src/config/shapes.ts:

~~~ts
export const RECT_WIDTH = 100;
export const RECT_HEIGHT = 60;
export const CHILD_HORIZONTAL_GAP = 120;
export const SIBLING_VERTICAL_GAP = 40;
~~~

client/src/hooks/useNodes.ts の UseNodesReturn に次を追加する。

~~~ts
addChildNode: (parentId: number) => number | null;
addSiblingNode: (nodeId: number) => number | null;
~~~

実装:

~~~ts
const addChildNode = useCallback((parentId: number) => {
  const parent = nodes.find((node) => node.id === parentId);
  if (!parent) return null;

  const siblings = nodes.filter((node) => node.parentId === parentId);
  const id = Date.now();
  const y = siblings.length === 0
    ? parent.y
    : Math.max(...siblings.map((node) => node.y + node.height))
      + SIBLING_VERTICAL_GAP;

  setNodes((prev) => [
    ...prev,
    {
      id,
      parentId,
      x: parent.x + parent.width + CHILD_HORIZONTAL_GAP,
      y,
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      label: "",
    },
  ]);
  setSelectedNodeId(id);
  return id;
}, [nodes]);
~~~

- [ ] **Step 4: 子ノード作成テストが成功することを確認する**

Run: cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts

Expected: 子ノード作成の3テストがPASSする。

- [ ] **Step 5: 兄弟ノード作成の失敗テストを書く**

~~~tsx
it("addSiblingNode は同じ親を持つ兄弟を最下部へ追加する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());

  act(() => result.current.addNode(100, 100));
  const parentId = result.current.nodes[0].id;
  act(() => result.current.addChildNode(parentId));
  const firstChild = result.current.nodes[1];
  let siblingId!: number | null;
  act(() => {
    siblingId = result.current.addSiblingNode(firstChild.id);
  });

  const sibling = result.current.nodes[2];
  expect(siblingId).toBe(sibling.id);
  expect(sibling.parentId).toBe(parentId);
  expect(sibling.x).toBe(firstChild.x);
  expect(sibling.y).toBe(firstChild.y + firstChild.height + 40);
  expect(result.current.selectedNodeId).toBe(sibling.id);
  jest.restoreAllMocks();
});

it("ルートノードの兄弟は parentId null のルートとして追加する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());

  act(() => result.current.addNode(100, 100));
  const root = result.current.nodes[0];
  act(() => result.current.addSiblingNode(root.id));

  expect(result.current.nodes[1]).toMatchObject({
    parentId: null,
    x: root.x,
    y: root.y + root.height + 40,
  });
  jest.restoreAllMocks();
});

it("存在しないノードには兄弟を作成しない", () => {
  const { result } = renderHook(() => useNodes());
  let createdId!: number | null;
  act(() => {
    createdId = result.current.addSiblingNode(999);
  });
  expect(createdId).toBeNull();
  expect(result.current.nodes).toEqual([]);
});
~~~

- [ ] **Step 6: 兄弟ノード作成テストが未実装で失敗することを確認する**

Run: cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts

Expected: addSiblingNode が動作しないためFAILする。

- [ ] **Step 7: 兄弟ノード作成を最小実装する**

~~~ts
const addSiblingNode = useCallback((nodeId: number) => {
  const source = nodes.find((node) => node.id === nodeId);
  if (!source) return null;

  const siblings = nodes.filter((node) => node.parentId === source.parentId);
  const id = Date.now();
  const y = Math.max(...siblings.map((node) => node.y + node.height))
    + SIBLING_VERTICAL_GAP;

  setNodes((prev) => [
    ...prev,
    {
      id,
      parentId: source.parentId,
      x: source.x,
      y,
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      label: "",
    },
  ]);
  setSelectedNodeId(id);
  return id;
}, [nodes]);
~~~

返却オブジェクトへ addChildNode と addSiblingNode を追加する。

- [ ] **Step 8: フックの全テストを実行する**

Run: cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts

Expected: useNodes の全テストがPASSする。

- [ ] **Step 9: コミットする**

~~~bash
git add client/src/config/shapes.ts client/src/hooks/useNodes.ts client/src/hooks/__tests__/useNodes.test.ts
git commit -m "feat: create child and sibling nodes"
~~~

---

### Task 4: ノード削除をサブツリー削除へ拡張する

**Files:**
- Modify: client/src/hooks/useNodes.ts
- Modify: client/src/hooks/__tests__/useNodes.test.ts

**Interfaces:**
- Consumes: Node.parentId、deleteNode(id: number)
- Produces: 対象ノードと全子孫を削除し、削除対象内の選択を解除する deleteNode

- [ ] **Step 1: サブツリー削除の失敗テストを書く**

~~~tsx
it("deleteNode は対象ノードとすべての子孫を削除する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());

  act(() => result.current.addNode(100, 100));
  const rootId = result.current.nodes[0].id;
  act(() => result.current.addChildNode(rootId));
  const childId = result.current.nodes[1].id;
  act(() => result.current.addChildNode(childId));
  act(() => result.current.addNode(500, 100));
  const unrelatedRootId = result.current.nodes[3].id;

  act(() => result.current.deleteNode(rootId));

  expect(result.current.nodes.map((node) => node.id)).toEqual([unrelatedRootId]);
  jest.restoreAllMocks();
});

it("削除する子孫が選択中なら選択を解除する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());

  act(() => result.current.addNode(100, 100));
  const rootId = result.current.nodes[0].id;
  act(() => result.current.addChildNode(rootId));
  const childId = result.current.nodes[1].id;
  act(() => result.current.selectNode(childId));
  act(() => result.current.deleteNode(rootId));

  expect(result.current.selectedNodeId).toBeNull();
  jest.restoreAllMocks();
});
~~~

- [ ] **Step 2: 既存削除実装では子孫が残って失敗することを確認する**

Run: cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts

Expected: 子孫ノードが残るためFAILする。

- [ ] **Step 3: 循環に耐える子孫ID収集と削除を実装する**

client/src/hooks/useNodes.ts のフック外:

~~~ts
function collectSubtreeIds(nodes: Node[], rootId: number): Set<number> {
  const subtreeIds = new Set<number>([rootId]);
  let foundNewNode = true;

  while (foundNewNode) {
    foundNewNode = false;
    for (const node of nodes) {
      if (
        node.parentId !== null
        && subtreeIds.has(node.parentId)
        && !subtreeIds.has(node.id)
      ) {
        subtreeIds.add(node.id);
        foundNewNode = true;
      }
    }
  }

  return subtreeIds;
}
~~~

deleteNode を置き換える。

~~~ts
const deleteNode = useCallback((id: number) => {
  const subtreeIds = collectSubtreeIds(nodes, id);
  setNodes((prev) => prev.filter((node) => !subtreeIds.has(node.id)));
  setSelectedNodeId((prev) => (
    prev !== null && subtreeIds.has(prev) ? null : prev
  ));
}, [nodes]);
~~~

- [ ] **Step 4: フックの全テストを実行する**

Run: cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts

Expected: 既存削除テストを含む全テストがPASSする。

- [ ] **Step 5: コミットする**

~~~bash
git add client/src/hooks/useNodes.ts client/src/hooks/__tests__/useNodes.test.ts
git commit -m "feat: delete node subtrees"
~~~

---

### Task 5: 親子ノード間の曲線を描画する

**Files:**
- Modify: client/src/components/map/MapStage.tsx:131
- Modify: client/src/components/map/__tests__/MapStage.test.tsx:5

**Interfaces:**
- Consumes: Node.parentId と親子ノードの座標・サイズ
- Produces: 親の右中央から子の左中央へ引かれる2px青灰色ベジェ曲線

- [ ] **Step 1: PixiJSモックへ曲線APIを追加し、失敗テストを書く**

モックへ追加:

~~~tsx
const mockMoveTo = jest.fn().mockReturnThis();
const mockBezierCurveTo = jest.fn().mockReturnThis();
const mockEdgeStroke = jest.fn().mockReturnThis();

Graphics: jest.fn().mockImplementation(() => ({
  rect: jest.fn().mockReturnThis(),
  fill: jest.fn().mockReturnThis(),
  stroke: mockEdgeStroke,
  moveTo: mockMoveTo,
  bezierCurveTo: mockBezierCurveTo,
})),
~~~

親子fixtureとテスト:

~~~tsx
const connectedNodes: Node[] = [
  { id: 1, parentId: null, x: 50, y: 30, width: 100, height: 60, label: "親" },
  { id: 2, parentId: 1, x: 270, y: 30, width: 100, height: 60, label: "子" },
];

it("親の右中央から子の左中央へベジェ曲線を描画する", async () => {
  await act(async () => {
    render(<MapStage {...defaultProps} nodes={connectedNodes} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockMoveTo).toHaveBeenCalledWith(150, 60);
  expect(mockBezierCurveTo).toHaveBeenCalledWith(210, 60, 210, 60, 270, 60);
  expect(mockEdgeStroke).toHaveBeenCalledWith({ width: 2, color: 0x64748b });
  expect(mockStage.addChild).toHaveBeenCalledTimes(connectedNodes.length + 1);
});

it("親が存在しない parentId の接続線は描画しない", async () => {
  const orphan: Node[] = [
    { id: 2, parentId: 999, x: 270, y: 30, width: 100, height: 60, label: "孤立" },
  ];

  await act(async () => {
    render(<MapStage {...defaultProps} nodes={orphan} />);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(mockMoveTo).not.toHaveBeenCalled();
  expect(mockBezierCurveTo).not.toHaveBeenCalled();
  expect(mockStage.addChild).toHaveBeenCalledTimes(1);
});
~~~

beforeEach で mockMoveTo、mockBezierCurveTo、mockEdgeStroke をクリアする。

- [ ] **Step 2: 接続線テストが描画未実装で失敗することを確認する**

Run: cd client && npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx

Expected: moveTo と bezierCurveTo が呼ばれずFAILする。

- [ ] **Step 3: ノード描画ループの前に接続線描画を実装する**

app.stage.removeChildren() の直後:

~~~ts
const edgeGraphics = new Graphics();
let hasEdges = false;

for (const child of nodes) {
  if (child.parentId === null) continue;
  const parent = nodes.find((node) => node.id === child.parentId);
  if (!parent) continue;

  const startX = parent.x + parent.width;
  const startY = parent.y + parent.height / 2;
  const endX = child.x;
  const endY = child.y + child.height / 2;
  const controlX = (startX + endX) / 2;

  edgeGraphics
    .moveTo(startX, startY)
    .bezierCurveTo(controlX, startY, controlX, endY, endX, endY);
  hasEdges = true;
}

if (hasEdges) {
  edgeGraphics.stroke({ width: 2, color: 0x64748b });
  app.stage.addChild(edgeGraphics);
}
~~~

- [ ] **Step 4: MapStageの全テストを実行する**

Run: cd client && npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx

Expected: 接続線と既存描画の全テストがPASSする。

- [ ] **Step 5: コミットする**

~~~bash
git add client/src/components/map/MapStage.tsx client/src/components/map/__tests__/MapStage.test.tsx
git commit -m "feat: draw parent child connections"
~~~

---

### Task 6: Tab・Enterによる作成と自動編集を接続する

**Files:**
- Modify: client/src/components/map/MapStage.tsx:9
- Modify: client/src/components/map/__tests__/MapStage.test.tsx:49
- Modify: client/src/app/page.tsx:7

**Interfaces:**
- Consumes: addChildNode(parentId): number | null、addSiblingNode(nodeId): number | null
- Produces: MapStageProps.onAddChildNode、MapStageProps.onAddSiblingNode、作成直後の編集モード

- [ ] **Step 1: キーボード作成コールバックの失敗テストを書く**

defaultProps に追加:

~~~tsx
onAddChildNode: jest.fn(() => null),
onAddSiblingNode: jest.fn(() => null),
~~~

テスト:

~~~tsx
it("選択中のTabで子ノードを作成する", () => {
  const onAddChildNode = jest.fn(() => 3);
  render(
    <MapStage
      {...defaultProps}
      nodes={sampleNodes}
      selectedNodeId={1}
      onAddChildNode={onAddChildNode}
    />,
  );
  fireEvent.keyDown(window, { key: "Tab" });
  expect(onAddChildNode).toHaveBeenCalledWith(1);
});

it("選択中のEnterで兄弟ノードを作成する", () => {
  const onAddSiblingNode = jest.fn(() => 3);
  render(
    <MapStage
      {...defaultProps}
      nodes={sampleNodes}
      selectedNodeId={1}
      onAddSiblingNode={onAddSiblingNode}
    />,
  );
  fireEvent.keyDown(window, { key: "Enter" });
  expect(onAddSiblingNode).toHaveBeenCalledWith(1);
});

it.each(["Tab", "Enter"])("未選択時の%sはノードを作成しない", (key) => {
  const onAddChildNode = jest.fn(() => 3);
  const onAddSiblingNode = jest.fn(() => 3);
  render(
    <MapStage
      {...defaultProps}
      onAddChildNode={onAddChildNode}
      onAddSiblingNode={onAddSiblingNode}
    />,
  );
  fireEvent.keyDown(window, { key });
  expect(onAddChildNode).not.toHaveBeenCalled();
  expect(onAddSiblingNode).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 2: props未定義またはコールバック未実行でテストが失敗することを確認する**

Run: cd client && npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx

Expected: 新しいpropsまたはキー処理が存在しないためFAILする。

- [ ] **Step 3: MapStageへ作成コールバックとキー処理を追加する**

props:

~~~ts
onAddChildNode: (parentId: number) => number | null;
onAddSiblingNode: (nodeId: number) => number | null;
~~~

既存のグローバル keydown effect を置き換える。

~~~ts
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (editingNodeId !== null || selectedNodeId === null) return;

    let createdNodeId: number | null = null;
    if (e.key === "Tab") {
      e.preventDefault();
      createdNodeId = onAddChildNode(selectedNodeId);
    } else if (e.key === "Enter") {
      e.preventDefault();
      createdNodeId = onAddSiblingNode(selectedNodeId);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDeleteNode(selectedNodeId);
    }

    if (createdNodeId !== null) {
      setEditingNodeId(createdNodeId);
      setEditingText("");
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [
  selectedNodeId,
  editingNodeId,
  onAddChildNode,
  onAddSiblingNode,
  onDeleteNode,
]);
~~~

- [ ] **Step 4: 作成後の編集開始と編集中の競合防止テストを書く**

~~~tsx
it("作成された子ノードがpropsへ反映されると編集を開始する", () => {
  const onAddChildNode = jest.fn(() => 3);
  const props = {
    ...defaultProps,
    nodes: sampleNodes,
    selectedNodeId: 1,
    onAddChildNode,
  };
  const { rerender, queryByTestId } = render(<MapStage {...props} />);

  fireEvent.keyDown(window, { key: "Tab" });
  expect(queryByTestId("node-label-input")).not.toBeInTheDocument();

  const createdNode: Node = {
    id: 3,
    parentId: 1,
    x: 270,
    y: 30,
    width: 100,
    height: 60,
    label: "",
  };
  rerender(
    <MapStage
      {...props}
      nodes={[...sampleNodes, createdNode]}
      selectedNodeId={3}
    />,
  );

  expect(queryByTestId("node-label-input")).toBeInTheDocument();
});

it("編集中のTabとEnterはノードを作成しない", () => {
  const onAddChildNode = jest.fn(() => 3);
  const onAddSiblingNode = jest.fn(() => 3);
  const { getByTestId } = render(
    <MapStage
      {...defaultProps}
      nodes={sampleNodes}
      selectedNodeId={1}
      onAddChildNode={onAddChildNode}
      onAddSiblingNode={onAddSiblingNode}
    />,
  );
  const container = document.querySelector(".cursor-crosshair") as HTMLElement;
  jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, right: 800, bottom: 600,
    width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}),
  });
  fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });
  const input = getByTestId("node-label-input");

  fireEvent.keyDown(input, { key: "Tab" });
  fireEvent.keyDown(input, { key: "Enter" });

  expect(onAddChildNode).not.toHaveBeenCalled();
  expect(onAddSiblingNode).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 5: ページから新しい操作を渡す**

client/src/app/page.tsx:

~~~tsx
const {
  nodes,
  selectedNodeId,
  addNode,
  addChildNode,
  addSiblingNode,
  selectNode,
  updateNodeLabel,
  moveNode,
  deleteNode,
} = useNodes();
~~~

MapStage props:

~~~tsx
<MapStage
  nodes={nodes}
  selectedNodeId={selectedNodeId}
  onDoubleClick={addNode}
  onAddChildNode={addChildNode}
  onAddSiblingNode={addSiblingNode}
  onSelectNode={selectNode}
  onUpdateLabel={updateNodeLabel}
  onMoveNode={moveNode}
  onDeleteNode={deleteNode}
/>
~~~

- [ ] **Step 6: コンポーネントテストと型チェックを実行する**

Run:

~~~bash
cd client
npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx
npm run typecheck
~~~

Expected: MapStage の全テストと型チェックがPASSする。

- [ ] **Step 7: コミットする**

~~~bash
git add client/src/components/map/MapStage.tsx client/src/components/map/__tests__/MapStage.test.tsx client/src/app/page.tsx
git commit -m "feat: add keyboard node creation"
~~~

---

### Task 7: ロードマップ更新と全体検証を行う

**Files:**
- Modify: ROADMAP.md:40

**Interfaces:**
- Consumes: Task 2〜6で完成したPhase 2機能
- Produces: 実装済み項目と後続のマウス接続を区別したロードマップ

- [ ] **Step 1: 実装済み項目だけを完了へ変更する**

ROADMAP.md のPhase 2:

~~~markdown
## Phase 2: ノード間の接続

マインドマップの核となる親子関係と接続線。

- [x] ノード同士を線（エッジ）で接続できるようにする
- [x] 親子関係のデータ構造を導入する（ツリー構造）
- [x] 親ノードから子ノードを作成するショートカット（Tab キー）
- [x] 兄弟ノードを作成するショートカット（Enter キー）
- [x] エッジの自動ルーティング（ノード間を曲線で繋ぐ）
- [ ] マウス操作で既存ノード同士を接続できるようにする
~~~

- [ ] **Step 2: 完全な検証を実行する**

Run:

~~~bash
cd client
npm run verify
~~~

Expected: Tailwind scan、ESLint、TypeScript、全Jestテスト、Next.js本番ビルドが終了コード0で成功する。サンドボックスのポート制限で本番ビルドだけが失敗した場合は、npm run build を許可付きで再実行する。

- [ ] **Step 3: 差分とロードマップの整合性を確認する**

Run:

~~~bash
git diff --check
git diff --stat
git status --short
~~~

Expected: 空白エラーがなく、未コミット差分は ROADMAP.md の完了チェックだけである。

- [ ] **Step 4: ロードマップをコミットする**

~~~bash
git add ROADMAP.md
git commit -m "docs: mark keyboard connections complete"
~~~

- [ ] **Step 5: 最終コミット列と作業ツリーを確認する**

Run:

~~~bash
git log --oneline -7
git status --short
~~~

Expected: Phase 1ベースライン、親子モデル、作成、サブツリー削除、接続線、キーボード操作、ロードマップの各コミットが並び、作業ツリーが空である。

