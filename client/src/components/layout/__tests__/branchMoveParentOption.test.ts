import { listBranchMoveParentOptions } from "@/components/layout/branchMoveParentOption";

const node = (id: number, parentId: number | null, label: string) => ({ id, parentId, label });

it("同名が無ければラベルだけを返す", () => {
  const nodes = [node(1, null, "A"), node(2, 1, "B")];
  expect(listBranchMoveParentOptions(nodes, nodes)).toEqual([
    { id: 1, text: "A" },
    { id: 2, text: "B" },
  ]);
});

it("空のラベルのノードもキャンバスと同じ表示で同名として親を併記する", () => {
  const nodes = [node(1, null, "A"), node(2, 1, ""), node(3, null, "")];
  expect(listBranchMoveParentOptions(nodes, nodes).slice(1)).toEqual([
    { id: 2, text: "新しいノード（親: A）" },
    { id: 3, text: "新しいノード（ルート）" },
  ]);
});

it("ラベルが空の候補と、ラベルが「新しいノード」の候補を同名として見分ける", () => {
  const nodes = [node(1, null, "A"), node(2, 1, ""), node(3, null, "新しいノード")];
  expect(listBranchMoveParentOptions(nodes.slice(1), nodes)).toEqual([
    { id: 2, text: "新しいノード（親: A）" },
    { id: 3, text: "新しいノード（ルート）" },
  ]);
});

it("候補から外れた親のラベルも併記する", () => {
  const nodes = [node(1, null, "現在の親"), node(2, 1, "同名"), node(3, null, "同名")];
  expect(listBranchMoveParentOptions(nodes.slice(1), nodes)).toEqual([
    { id: 2, text: "同名（親: 現在の親）" },
    { id: 3, text: "同名（ルート）" },
  ]);
});

it("親のラベルでも見分けられない同名は、候補の順番を併記する", () => {
  const nodes = [node(1, null, "親"), node(2, 1, "同名"), node(3, 1, "同名"), node(4, null, "同名")];
  expect(listBranchMoveParentOptions(nodes, nodes).slice(1)).toEqual([
    { id: 2, text: "同名（親: 親・1件目）" },
    { id: 3, text: "同名（親: 親・2件目）" },
    { id: 4, text: "同名（ルート）" },
  ]);
});

it("親のラベルが空のときは、注記の親もキャンバスと同じ表示にする", () => {
  const nodes = [node(1, null, ""), node(2, 1, "X"), node(3, null, "X")];
  expect(listBranchMoveParentOptions(nodes.slice(1), nodes)).toEqual([
    { id: 2, text: "X（親: 新しいノード）" },
    { id: 3, text: "X（ルート）" },
  ]);
});
