import { MAX_LIBRARY_BACKUP_BYTES } from "@/domain/mapLibrary/libraryBackupCodec";
import { downloadLibraryBackup, readLibraryBackupFile } from "@/services/persistence/libraryBackupFile";

const backup = {
  format: "draw-my-map-library-backup",
  version: 1,
  exportedAt: "2026-11-05T00:00:00.000Z",
  currentMapId: "source-a",
  maps: [{
    id: "source-a",
    name: "旅行",
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
    document: { version: 3, layoutMode: "manual", nodes: [] },
  }],
};

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

afterEach(() => {
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
  jest.restoreAllMocks();
});

it("有効なファイルを V3 バックアップとして読む", async () => {
  const raw = JSON.stringify(backup);
  const file = new File([raw], "backup.json", { type: "application/json" });
  Object.defineProperty(file, "text", { configurable: true, value: jest.fn().mockResolvedValue(raw) });
  await expect(readLibraryBackupFile(file)).resolves.toEqual({ ok: true, value: backup });
});

it("File.size が上限超過なら text を呼ばずに拒否する", async () => {
  const file = new File([], "backup.json");
  const read = jest.fn();
  Object.defineProperty(file, "size", { configurable: true, value: MAX_LIBRARY_BACKUP_BYTES + 1 });
  Object.defineProperty(file, "text", { configurable: true, value: read });
  const result = await readLibraryBackupFile(file);
  expect(result.ok).toBe(false);
  expect(read).not.toHaveBeenCalled();
});

it("File.text の例外を利用者向けエラーに変える", async () => {
  const file = new File([], "backup.json");
  Object.defineProperty(file, "text", { configurable: true, value: jest.fn().mockRejectedValue(new Error("read failed")) });
  await expect(readLibraryBackupFile(file)).resolves.toEqual({
    ok: false,
    error: "バックアップファイルを読み取れませんでした。",
  });
});

it("ダウンロード名はマップ名を含めずローカル日時を使い、URLを解放する", () => {
  const createObjectURL = jest.fn(() => "blob:library-backup");
  const revokeObjectURL = jest.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

  downloadLibraryBackup("{}\n", new Date(2026, 10, 6, 9, 5, 7));

  expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: "application/json" }));
  const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
  expect(anchor.href).toBe("blob:library-backup");
  expect(anchor.download).toBe("draw-my-map-library-backup-20261106-090507.json");
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:library-backup");
});

it("click が例外でも URL を解放し、例外を呼出側へ伝える", () => {
  const revokeObjectURL = jest.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:library-backup") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw new Error("download failed"); });

  expect(() => downloadLibraryBackup("{}", new Date(2026, 10, 6))).toThrow("download failed");
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:library-backup");
});
