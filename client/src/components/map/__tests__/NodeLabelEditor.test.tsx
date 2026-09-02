import { fireEvent, render, screen } from "@testing-library/react";
import { NodeLabelEditor } from "@/components/map/NodeLabelEditor";
import type { Node } from "@/types/node";

const node: Node = {
  id: 1,
  parentId: null,
  x: 50,
  y: 30,
  width: 100,
  height: 60,
  label: "既存ラベル",
};

function renderEditor() {
  const onChange = jest.fn();
  const onCommit = jest.fn();
  const onCancel = jest.fn();
  const result = render(
    <NodeLabelEditor
      node={node}
      value="下書き"
      onChange={onChange}
      onCommit={onCommit}
      onCancel={onCancel}
    />,
  );

  return { ...result, onChange, onCommit, onCancel, input: screen.getByTestId("node-label-input") };
}

describe("NodeLabelEditor", () => {
  it("forwards text changes and commits on Enter", () => {
    const { input, onChange, onCommit } = renderEditor();

    fireEvent.change(input, { target: { value: "変更" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("変更");
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits when focus leaves the input", () => {
    const { input, onCommit } = renderEditor();

    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape", () => {
    const { input, onCommit, onCancel } = renderEditor();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Enter後にblurしても一度だけ確定する", () => {
    const { input, onCommit } = renderEditor();

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("Escape後のblurでは確定しない", () => {
    const { input, onCommit, onCancel } = renderEditor();

    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ignores unrelated key presses", () => {
    const { input, onCommit, onCancel } = renderEditor();

    fireEvent.keyDown(input, { key: "a" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("stops input double-clicks from reaching its parent", () => {
    const onParentDoubleClick = jest.fn();
    render(
      <div onDoubleClick={onParentDoubleClick}>
        <NodeLabelEditor
          node={node}
          value="下書き"
          onChange={jest.fn()}
          onCommit={jest.fn()}
          onCancel={jest.fn()}
        />
      </div>,
    );
    const input = screen.getByTestId("node-label-input");

    fireEvent.doubleClick(input);

    expect(onParentDoubleClick).not.toHaveBeenCalled();
  });

  it("autofocuses at the node's exact overlay geometry", () => {
    const { input } = renderEditor();

    expect(input).toHaveFocus();
    expect(input).toHaveStyle({
      left: "50px",
      top: "30px",
      width: "100px",
      height: "60px",
      lineHeight: "60px",
    });
  });
});
