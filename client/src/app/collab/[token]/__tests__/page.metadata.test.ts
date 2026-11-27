jest.mock("@/app/collab/[token]/CollabEditorPage", () => ({
  CollabEditorPage: () => null,
}));

import { metadata } from "@/app/collab/[token]/page";
import nextConfig from "../../../../../next.config";

describe("collab/[token] page metadata（L-1233）", () => {
  it("robots は noindex / nofollow（トークン URL を索引させない）", () => {
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });

  it("referrer は no-referrer（平文トークンを Referer に載せない）", () => {
    expect(metadata.referrer).toBe("no-referrer");
  });
});

describe("collab/[token] HTTP Referrer-Policy（L-1233）", () => {
  it("next.config headers に /collab 向け Referrer-Policy: no-referrer がある", async () => {
    const headersFn = nextConfig.headers;
    expect(typeof headersFn).toBe("function");
    const headers = await headersFn!();
    const collab = headers.find((entry) => entry.source.includes("/collab"));
    expect(collab).toBeDefined();
    expect(collab!.headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "Referrer-Policy",
          value: "no-referrer",
        }),
      ]),
    );
  });
});
