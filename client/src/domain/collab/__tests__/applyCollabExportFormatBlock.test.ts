import { applyCollabOutlineExportBlock } from "@/domain/collab/applyCollabExportFormatBlock";

const base = {
  markdown: { enabled: true },
  bullets: { enabled: true },
  opml: { enabled: true },
  csv: { enabled: true },
  tsv: { enabled: true },
  json: { enabled: true },
  png: { enabled: true },
  svg: { enabled: true },
  print: { enabled: true },
  extra: { enabled: true },
};

describe("applyCollabOutlineExportBlock", () => {
  it("拒否理由 null なら同一参照を返す", () => {
    expect(applyCollabOutlineExportBlock(base, null)).toBe(base);
  });

  it("拒否理由ありなら対象スロットのみ無効化（他キーは維持）", () => {
    const next = applyCollabOutlineExportBlock(base, "共同編集中はこの操作をできません。");
    expect(next).not.toBe(base);
    expect(next.markdown).toEqual({
      enabled: false,
      disabledReason: "共同編集中はこの操作をできません。",
    });
    expect(next.print.enabled).toBe(false);
    expect(next.extra).toEqual({ enabled: true });
  });
});
