import { render, screen } from "@testing-library/react";
import { OutlineRowAppearance } from "@/components/outline/OutlineRowAppearance";

it("kind 色バーと icon を出す", () => {
  render(<OutlineRowAppearance node={{ icon: "❓", kind: "question" }} />);

  expect(screen.getByText("❓")).toHaveStyle({ fontSize: "16px" });
  expect(screen.getByTestId("node-kind-bar")).toHaveStyle({
    width: "4px",
    backgroundColor: "var(--node-kind-question)",
  });
});

it("icon / kind が無ければ何も出さない", () => {
  const { container } = render(<OutlineRowAppearance node={{}} />);
  expect(container).toBeEmptyDOMElement();
});
