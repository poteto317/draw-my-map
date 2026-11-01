import {
  preventRepeatedActivationClick,
  preventRepeatedEnterClick,
} from "@/components/layout/repeatedEnterClick";

function keyEvent(key: string, repeat: boolean) {
  return { key, repeat, preventDefault: jest.fn() };
}

describe("preventRepeatedEnterClick", () => {
  it("Enterのリピートは既定動作（ボタンのclickの合成）を止める", () => {
    const event = keyEvent("Enter", true);

    preventRepeatedEnterClick(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["単発のEnter", "Enter", false],
    ["Spaceのリピート", " ", true],
    ["ほかのキーのリピート", "a", true],
  ])("%sは止めない", (_name, key, repeat) => {
    const event = keyEvent(key, repeat);

    preventRepeatedEnterClick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("preventRepeatedActivationClick", () => {
  it.each(["Enter", " "])("%sのリピートは既定動作を止める", (key) => {
    const event = keyEvent(key, true);

    preventRepeatedActivationClick(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["単発のEnter", "Enter", false],
    ["単発のSpace", " ", false],
    ["ほかのキーのリピート", "a", true],
  ])("%sは止めない", (_name, key, repeat) => {
    const event = keyEvent(key, repeat);

    preventRepeatedActivationClick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
