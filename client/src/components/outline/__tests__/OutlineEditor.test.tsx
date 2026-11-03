import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OutlineEditor, type OutlineEditorProps } from "../OutlineEditor";
import { buildOutlineRows } from "@/domain/outline/outlineRows";
import { useOutlineEditorActions, type OutlineEditorActions } from "@/hooks/useOutlineEditorActions";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

const initial = [createTestNode({ id: 1, label: "根" }), createTestNode({ id: 3, label: "末尾" }), createTestNode({ id: 2, parentId: 1, label: "子" })];
const scroll = jest.fn();
beforeAll(() => { Element.prototype.scrollIntoView = scroll; });
beforeEach(() => { jest.clearAllMocks(); });
function actionsStub(): OutlineEditorActions {
  return { draft: null, focusRequest: null, canAddRoot: true, canAddRelated: true, canEdit: true, canMoveUp: true, canMoveDown: true, canIndent: true, canOutdent: true, canDelete: true,
    select: jest.fn(), beginEdit: jest.fn(), setDraftText: jest.fn(), finishEdit: jest.fn(), cancelEdit: jest.fn(), invalidateDraft: jest.fn(), addRoot: jest.fn(), addChild: jest.fn(), addSibling: jest.fn(), move: jest.fn(), changeIndent: jest.fn(), deleteSelected: jest.fn() };
}
function props(overrides: Partial<OutlineEditorProps> = {}): OutlineEditorProps {
  return { nodes: initial, model: buildOutlineRows(initial), selectedNodeId: 2, documentRevision: 0, enabled: true, actions: actionsStub(), ...overrides };
}
const row = (name: string) => screen.getByRole("button", { name });

it("rendersAllRowsAndRovingEntry", () => {
  const long = "長文".repeat(150);
  const nodes = [...initial, createTestNode({ id: 4, label: "" }), createTestNode({ id: 5, label: long })];
  const p = props({ nodes, model: buildOutlineRows(nodes) });
  const view = render(<OutlineEditor {...p} />);
  const rows = within(screen.getByRole("list")).getAllByRole("button");
  expect(rows.map(button => button.getAttribute("aria-label"))).toEqual(["階層1・根", "階層2・子", "階層1・末尾", "階層1・新しいノード", `階層1・${long}`]);
  expect(rows.filter(button => button.tabIndex === 0)).toEqual([rows[1]]);
  expect(rows[1]).toHaveAttribute("aria-pressed", "true");
  expect(rows[4]).toHaveTextContent(long);
  expect(document.activeElement).toBe(document.body);
  expect(scroll).toHaveBeenCalledTimes(1);
  view.rerender(<OutlineEditor {...p} />);
  expect(scroll).toHaveBeenCalledTimes(1);
  view.rerender(<OutlineEditor {...p} selectedNodeId={null} />);
  expect(rows[0]).toHaveAttribute("tabindex", "0");
  view.rerender(<OutlineEditor {...p} selectedNodeId={3} />);
  expect(scroll).toHaveBeenCalledTimes(2);
});

function Harness({ nodes: supplied = initial, enabled = true, revision = 0, update = jest.fn() }: { nodes?: Node[]; enabled?: boolean; revision?: number; update?: (id: number, text: string) => void }) {
  const [nodes, setNodes] = useState(supplied);
  const [selected, selectNode] = useState<number | null>(1);
  const model = buildOutlineRows(nodes);
  const actions = useOutlineEditorActions({ nodes, selectedNodeId: selected, model, enabled, documentRevision: revision, expandNodes: () => {}, publishNotice: () => {},
    api: { selectNode, updateNodeLabel(id, label) { update(id, label); setNodes(current => current.map(node => node.id === id ? { ...node, label } : node)); }, insertForest: () => ({ ok: false, reason: "placement-failed" }), addChildNode: () => null, addSiblingNode: () => null, reorderSibling: () => ({ ok: false, reason: "placement-failed" }), changeNodeIndent: () => ({ ok: false, reason: "placement-failed" }), deleteNodeOnly(id) { setNodes(current => current.filter(node => node.id !== id).map(node => node.parentId === id ? { ...node, parentId: null } : node)); return { ok: true, deletedId: id }; } } });
  return <OutlineEditor nodes={nodes} model={model} selectedNodeId={selected} documentRevision={revision} enabled={enabled} actions={actions} />;
}

it("行の矢印とHome/Endはfocusと共通選択を変える", () => {
  render(<Harness />);
  for (const [from, key, to] of [["階層1・根", "ArrowDown", "階層2・子"], ["階層2・子", "End", "階層1・末尾"], ["階層1・末尾", "Home", "階層1・根"], ["階層2・子", "ArrowUp", "階層1・根"]]) {
    fireEvent.keyDown(row(from), { key });
    expect(row(to)).toHaveFocus(); expect(row(to)).toHaveAttribute("aria-pressed", "true");
  }
});
it.each(["Enter", "F2", "double", "toolbar"])("%sで編集を開始しEnterで一度だけ確定して行へ戻る", method => {
  const update = jest.fn(); render(<Harness update={update} />);
  if (method === "double") fireEvent.doubleClick(row("階層1・根"));
  else if (method === "toolbar") fireEvent.click(row("ラベル編集"));
  else fireEvent.keyDown(row("階層1・根"), { key: method });
  const input = screen.getByRole("textbox", { name: "ラベル編集" });
  expect(input).toHaveFocus(); fireEvent.change(input, { target: { value: " 新\n文 " } });
  fireEvent.keyDown(input, { key: "Enter" }); fireEvent.blur(input);
  expect(update).toHaveBeenCalledTimes(1); expect(update).toHaveBeenCalledWith(1, " 新\n文 ");
  expect(screen.getByRole("button", { name: /階層1・ 新/ })).toHaveFocus();
  expect(document.activeElement).toHaveAttribute("aria-label", "階層1・ 新\n文 ");
});
it("Escape破棄後のblurは保存せず、再編集できる", () => {
  const update = jest.fn(); render(<Harness update={update} />);
  fireEvent.keyDown(row("階層1・根"), { key: "Enter" });
  const input = screen.getByRole("textbox"); fireEvent.change(input, { target: { value: "破棄" } });
  fireEvent.keyDown(input, { key: "Escape" }); fireEvent.blur(input);
  expect(update).not.toHaveBeenCalled(); expect(row("階層1・根")).toHaveFocus();
  fireEvent.keyDown(row("階層1・根"), { key: "F2" }); expect(screen.getByRole("textbox")).toHaveValue("根");
});
it.each(["Enter", "Escape"])("IME %sはisComposingと229の各条件で未処理", key => {
  render(<Harness />); fireEvent.keyDown(row("階層1・根"), { key: "F2" });
  const input = screen.getByRole("textbox");
  expect(fireEvent.keyDown(input, { key, isComposing: true })).toBe(true);
  expect(fireEvent.keyDown(input, { key, keyCode: 229 })).toBe(true);
  expect(screen.getByRole("textbox")).toBe(input);
});
it("textareaのネイティブ入力キーとrepeatは横取りしない", () => {
  render(<Harness />); fireEvent.keyDown(row("階層1・根"), { key: "F2" });
  const input = screen.getByRole("textbox");
  for (const event of [{ key: "Enter", shiftKey: true }, { key: "z", ctrlKey: true }, { key: "z", metaKey: true }, { key: "Tab" }, { key: "Tab", shiftKey: true }, { key: "Delete" }, { key: "Backspace" }, { key: "Enter", repeat: true }, { key: "Escape", repeat: true }]) expect(fireEvent.keyDown(input, event)).toBe(true);
  expect(screen.getByRole("textbox")).toBe(input);
});
it("blur→別行clickは確定後に選択し、focusを奪わない", async () => {
  const user = userEvent.setup(); const update = jest.fn(); render(<Harness update={update} />);
  await user.dblClick(row("階層1・根")); await user.type(screen.getByRole("textbox"), "変更");
  await user.click(row("階層2・子"));
  expect(update).toHaveBeenCalledTimes(1); expect(row("階層2・子")).toHaveFocus(); expect(row("階層2・子")).toHaveAttribute("aria-pressed", "true");
});
it("通常Spaceは選択だけ、Enterのネイティブclickを二重実行しない", async () => {
  const user = userEvent.setup(); const p = props(); render(<OutlineEditor {...p} />);
  row("階層1・根").focus(); await user.keyboard(" "); expect(p.actions.select).toHaveBeenCalledTimes(1); expect(p.actions.beginEdit).not.toHaveBeenCalled();
  await user.keyboard("{Enter}"); expect(p.actions.beginEdit).toHaveBeenCalledTimes(1); expect(p.actions.select).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(row("階層1・根"), { key: "Enter", repeat: true }); expect(p.actions.beginEdit).toHaveBeenCalledTimes(1);
});
it("toolbarは既定clickだけで操作し矢印を横取りしない", async () => {
  const p = props(); const user = userEvent.setup(); render(<OutlineEditor {...p} />);
  const add = row("ルート追加"); add.focus(); expect(fireEvent.keyDown(add, { key: "ArrowDown" })).toBe(true);
  await user.keyboard("{Enter}"); expect(p.actions.addRoot).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(add, { key: "Enter", repeat: true }); expect(p.actions.addRoot).toHaveBeenCalledTimes(1);
});
it("focus要求の連番を消費し古いrevisionや再renderでは奪わない", () => {
  const p = props(); const view = render(<OutlineEditor {...p} />);
  const request = { target: { kind: "row" as const, nodeId: 2 }, documentRevision: 0, sequence: 1 };
  view.rerender(<OutlineEditor {...p} actions={{ ...p.actions, focusRequest: request }} />); expect(row("階層2・子")).toHaveFocus();
  row("ルート追加").focus(); view.rerender(<OutlineEditor {...p} actions={{ ...p.actions, focusRequest: { ...request } }} />); expect(row("ルート追加")).toHaveFocus();
  view.rerender(<OutlineEditor {...p} actions={{ ...p.actions, focusRequest: { ...request, sequence: 2 } }} />); expect(row("階層2・子")).toHaveFocus();
  row("ルート追加").focus(); view.rerender(<OutlineEditor {...p} documentRevision={1} actions={{ ...p.actions, focusRequest: { ...request, sequence: 3 } }} />); expect(row("ルート追加")).toHaveFocus();
});
it("削除後は先頭、空になればルート追加へfocus", () => {
  render(<Harness nodes={[initial[0]]} />); fireEvent.click(row("ノードだけ削除")); expect(screen.getByText("ノードがありません")).toBeVisible(); expect(row("ルート追加")).toHaveFocus();
});
it("disabledと重複IDは選択と編集を防ぎ、不正構造を通知する", () => {
  const p = props({ enabled: false }); const view = render(<OutlineEditor {...p} />);
  fireEvent.click(row("階層1・根")); fireEvent.keyDown(row("階層1・根"), { key: "F2" }); expect(p.actions.select).not.toHaveBeenCalled(); expect(p.actions.beginEdit).not.toHaveBeenCalled(); expect(row("ルート追加")).toBeDisabled();
  const nodes = [initial[0], initial[0]]; view.rerender(<OutlineEditor {...p} enabled nodes={nodes} model={buildOutlineRows(nodes)} />);
  expect(screen.getByRole("alert")).toBeVisible(); expect(row("階層1・根")).toBeDisabled();
});

it("選択がなければtoolbar編集できない", () => {
  const p = props({ selectedNodeId: null }); render(<OutlineEditor {...p} />);
  expect(row("ラベル編集")).toBeDisabled(); fireEvent.click(row("ラベル編集")); expect(p.actions.beginEdit).not.toHaveBeenCalled();
});
it("孤立ノードはラベル編集可能で構造操作だけが無効", () => {
  render(<Harness nodes={[createTestNode({ id: 1, parentId: 999, label: "孤立" })]} />);
  expect(row("ルート追加")).toBeDisabled(); expect(row("ノードだけ削除")).toBeDisabled();
  expect(row("ラベル編集")).toBeEnabled(); fireEvent.click(row("ラベル編集")); expect(screen.getByRole("textbox")).toHaveValue("孤立");
});
it("削除後の先頭へfocusし、通常toolbarクリックはblur確定を先に行う", async () => {
  const user = userEvent.setup(); const update = jest.fn(); render(<Harness update={update} />);
  await user.dblClick(row("階層1・根")); await user.type(screen.getByRole("textbox"), "更新");
  await user.click(row("ノードだけ削除"));
  expect(update).toHaveBeenCalledTimes(1); expect(row("階層1・子")).toHaveFocus();
});
it("revision変更とdisabledで古いtextareaを消し後着blurで保存しない", () => {
  const update = jest.fn(); const view = render(<Harness update={update} />);
  fireEvent.keyDown(row("階層1・根"), { key: "F2" }); const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "古い" } }); view.rerender(<Harness revision={1} update={update} />);
  fireEvent.blur(input); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(update).not.toHaveBeenCalled();
  fireEvent.keyDown(row("階層1・根"), { key: "F2" }); const next = screen.getByRole("textbox");
  view.rerender(<Harness revision={1} enabled={false} update={update} />); fireEvent.blur(next); expect(update).not.toHaveBeenCalled();
});
it("深さ表示は実値、字下げだけが一定以上で止まる", () => {
  const nodes = Array.from({ length: 16 }, (_, index) => createTestNode({ id: index + 1, parentId: index === 0 ? null : index, label: String(index + 1) }));
  render(<OutlineEditor {...props({ nodes, model: buildOutlineRows(nodes) })} />);
  expect(row("階層16・16")).toBeVisible();
  expect(row("階層16・16").parentElement?.style.paddingInlineStart).toBe(row("階層14・14").parentElement?.style.paddingInlineStart);
});
it("初回に残っていたfocus要求ではモードボタンから奪わない", () => {
  const p = props();
  const view = render(<button type="button">アウトラインに切替</button>);
  row("アウトラインに切替").focus();
  view.rerender(<><button type="button">アウトラインに切替</button><OutlineEditor {...p} actions={{ ...p.actions, focusRequest: { target: { kind: "row", nodeId: 2 }, documentRevision: 0, sequence: 5 } }} /></>);
  expect(row("アウトラインに切替")).toHaveFocus();
  const focus = jest.spyOn(row("階層2・子"), "focus");
  const content = <><button type="button">アウトラインに切替</button><OutlineEditor {...p} actions={{ ...p.actions, focusRequest: { target: { kind: "row", nodeId: 2 }, documentRevision: 0, sequence: 6 } }} /></>;
  view.rerender(content); expect(row("階層2・子")).toHaveFocus(); expect(focus).toHaveBeenCalledTimes(1);
  row("アウトラインに切替").focus(); view.rerender(content); expect(row("アウトラインに切替")).toHaveFocus(); expect(focus).toHaveBeenCalledTimes(1);
});
it("同じ選択で再有効化してもscrollせず、無効中の選択変更は復帰時にscrollする", () => {
  const p = props(); const view = render(<OutlineEditor {...p} />);
  expect(scroll).toHaveBeenCalledTimes(1);
  view.rerender(<OutlineEditor {...p} enabled={false} />);
  view.rerender(<OutlineEditor {...p} />);
  expect(scroll).toHaveBeenCalledTimes(1);
  view.rerender(<OutlineEditor {...p} enabled={false} />);
  view.rerender(<OutlineEditor {...p} selectedNodeId={3} enabled={false} />);
  expect(scroll).toHaveBeenCalledTimes(1);
  view.rerender(<OutlineEditor {...p} selectedNodeId={3} />);
  expect(scroll).toHaveBeenCalledTimes(2);
});
