import { STALE_DIALOG_MESSAGE, formatPreviewLabel } from "@/hooks/dialogPreviewText";

describe("STALE_DIALOG_MESSAGE", () => {
  it("マップが更新されたことと開き直しを促す固定の文言", () => {
    expect(STALE_DIALOG_MESSAGE).toBe("マップが更新されました。閉じてから開き直してください。");
  });
});

describe("formatPreviewLabel", () => {
  it("空文字は（空）、空白だけは（空白のみ）にし、それ以外は入力どおり返す", () => {
    expect(formatPreviewLabel("")).toBe("（空）");
    expect(formatPreviewLabel("  ")).toBe("（空白のみ）");
    expect(formatPreviewLabel(" 　\t")).toBe("（空白のみ）");
    expect(formatPreviewLabel(" a ")).toBe(" a ");
    expect(formatPreviewLabel("a  b")).toBe("a  b");
  });
});
