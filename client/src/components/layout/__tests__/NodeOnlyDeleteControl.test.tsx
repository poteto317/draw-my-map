import { fireEvent, render, screen } from "@testing-library/react";
import { NodeOnlyDeleteControl } from "../NodeOnlyDeleteControl";

it("ラベル・説明を表示し、無効時は削除しない", () => {
  const onDelete = jest.fn();
  render(<NodeOnlyDeleteControl canDelete={false} onDelete={onDelete} />);
  const button = screen.getByRole("button", { name: "選択中のノードだけ削除" });
  expect(button).toHaveTextContent("ノードだけ削除");
  expect(button).toHaveAttribute("title", "子孫を残して、選択中のノードだけ削除");
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(onDelete).not.toHaveBeenCalled();
});
it("detail 0/1を許し2を無視し、repeat Enter/Spaceだけ既定動作を止める", () => {
  const onDelete = jest.fn();
  render(<NodeOnlyDeleteControl canDelete onDelete={onDelete} />);
  const button = screen.getByRole("button");
  fireEvent.click(button, { detail: 0 });
  fireEvent.click(button, { detail: 1 });
  fireEvent.click(button, { detail: 2 });
  expect(onDelete).toHaveBeenCalledTimes(2);
  for (const key of ["Enter", " "]) {
    expect(fireEvent.keyDown(button, { key, repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key, repeat: false })).toBe(true);
  }
  expect(fireEvent.pointerDown(button)).toBe(true);
  expect(button).not.toHaveAttribute("aria-keyshortcuts");
});
