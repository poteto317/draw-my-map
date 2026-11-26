jest.mock("@/app/share/[token]/ShareViewerPage", () => ({
  ShareViewerPage: () => null,
}));

import { metadata } from "@/app/share/[token]/page";

describe("share/[token] page metadata", () => {
  it("robots は noindex / nofollow（トークン URL を索引させない）", () => {
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
