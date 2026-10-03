import { loadIllustrationTexture } from "@/components/map/pixi/illustrationTextureLoader";

describe("loadIllustrationTexture", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("画像を decode してから Texture.from に渡す", async () => {
    const from = jest.fn().mockReturnValue({ id: "tex" });
    const decode = jest.fn().mockResolvedValue(undefined);
    const created: HTMLImageElement[] = [];
    jest.spyOn(window, "Image").mockImplementation(() => {
      const img = { decode } as unknown as HTMLImageElement;
      created.push(img);
      return img;
    });

    const texture = await loadIllustrationTexture({ from } as never, "data:image/jpeg;base64,AAAA");

    expect(created[0].src).toBe("data:image/jpeg;base64,AAAA");
    expect(decode).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith(created[0]);
    expect(texture).toEqual({ id: "tex" });
  });

  it("decode が失敗したら、Texture を作らずに reject する", async () => {
    const from = jest.fn();
    const decode = jest.fn().mockRejectedValue(new Error("decode failed"));
    jest.spyOn(window, "Image").mockImplementation(() => ({ decode }) as unknown as HTMLImageElement);

    await expect(loadIllustrationTexture({ from } as never, "data:image/jpeg;base64,AAAA"))
      .rejects.toThrow("decode failed");
    expect(from).not.toHaveBeenCalled();
  });
});
