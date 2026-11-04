import { downloadOutlineText } from "@/services/outlineExport/outlineTextDownload";

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalBlob = Blob;

async function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob, "utf-8");
  });
}

describe("downloadOutlineText", () => {
  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreate });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevoke });
    Object.defineProperty(globalThis, "Blob", { configurable: true, value: originalBlob });
    jest.restoreAllMocks();
  });

  it.each([
    ["md", "text/markdown;charset=utf-8", "CON", "_CON-20261103-090507.md"],
    ["txt", "text/plain;charset=utf-8", "a/b", "a_b-20261103-090507.txt"],
  ] as const)("usesUtf8BlobSafeNameAndReleasesUrl: %s", async (format, mime, mapName, filename) => {
    const events: string[] = [];
    let captured: Blob | undefined;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn((blob: Blob) => {
      events.push("create"); captured = blob; return "blob:outline";
    }) });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn((url: string) => {
      expect(url).toBe("blob:outline"); events.push("revoke");
    }) });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { events.push("click"); });

    downloadOutlineText("日本語😀\n", mapName, format, new Date(2026, 10, 3, 9, 5, 7));

    expect(events).toEqual(["create", "click", "revoke"]);
    expect(captured).toBeInstanceOf(Blob);
    expect(captured?.type).toBe(mime);
    expect(await readBlob(captured!)).toBe("日本語😀\n");
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.href).toBe("blob:outline");
    expect(anchor.download).toBe(filename);
  });

  it("releasesUrlAfterClickFailure", () => {
    const revoke = jest.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:outline") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw new Error("click failed"); });
    expect(() => downloadOutlineText("x", "name", "md")).toThrow("click failed");
    expect(revoke).toHaveBeenCalledWith("blob:outline");
  });

  it("doesNotClickOrRevokeWhenBlobConstructionFails", () => {
    Object.defineProperty(globalThis, "Blob", { configurable: true, value: class { constructor() { throw new Error("blob failed"); } } });
    const create = jest.fn();
    const revoke = jest.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    expect(() => downloadOutlineText("x", "name", "txt")).toThrow("blob failed");
    expect(create).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("doesNotClickOrRevokeWhenUrlCreationFails", () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => { throw new Error("url failed"); }) });
    const revoke = jest.fn();
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    expect(() => downloadOutlineText("x", "name", "txt")).toThrow("url failed");
    expect(click).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
});
