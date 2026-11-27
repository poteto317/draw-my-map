import { createShareApiClient } from "@/services/share/shareApiClient";

describe("createShareApiClient.viewByToken", () => {
  it("ネットワーク例外を ShareResult network-error に正規化する", async () => {
    const client = createShareApiClient(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(client.viewByToken("tok")).resolves.toEqual({
      ok: false,
      reason: "network-error",
    });
  });

  it.each(["view", "comment", "edit"])("成功応答（permission: %s）を生値のまま返す", async (permission) => {
    const client = createShareApiClient(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        value: { documentJson: "{\"version\":3,\"layoutMode\":\"manual\",\"nodes\":[]}", permission },
      }),
    } as Response));
    await expect(client.viewByToken("tok")).resolves.toEqual({
      ok: true,
      value: { documentJson: "{\"version\":3,\"layoutMode\":\"manual\",\"nodes\":[]}", permission },
    });
  });
});
