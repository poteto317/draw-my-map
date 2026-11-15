import { isApplePlatform } from "@/domain/platform/isApplePlatform";

describe("isApplePlatform", () => {
  it.each([
    ["MacIntel", true],
    ["MacPPC", true],
    ["Mac68K", true],
    ["iPhone", true],
    ["iPad", true],
    ["iPod", true],
    ["Macintosh", true],
  ])("%s は Apple", (platform, expected) => {
    expect(isApplePlatform(platform)).toBe(expected);
  });

  it.each([
    ["Win32", false],
    ["Windows", false],
    ["Linux x86_64", false],
    ["Linux armv8l", false],
    ["", false],
  ])("%s は非 Apple", (platform, expected) => {
    expect(isApplePlatform(platform)).toBe(expected);
  });

  it("引数省略時は navigator.platform を使う", () => {
    const original = navigator.platform;
    Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
    try {
      expect(isApplePlatform()).toBe(true);
    } finally {
      Object.defineProperty(navigator, "platform", { configurable: true, value: original });
    }
  });
});
