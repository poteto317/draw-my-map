/** @jest-environment node */

import { createShareApiClient } from "@/services/share/shareApiClient";

describe("createShareApiClient.createLink", () => {
  it.each(["view", "comment", "edit"] as const)(
    "本文に { permission: \"%s\" } を載せて POST する",
    async (permission) => {
      const calls: { url: string; init: RequestInit | undefined }[] = [];
      const urlPath = permission === "edit" ? "collab" : "share";
      const issuedUrl = `https://example.com/${urlPath}/t`;
      const client = createShareApiClient((async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify({
          ok: true,
          value: { linkId: "l1", url: issuedUrl, token: "t", permission },
        }));
      }) as typeof fetch);
      await expect(client.createLink("sm/1", permission)).resolves.toEqual({
        ok: true,
        value: { linkId: "l1", url: issuedUrl, token: "t", permission },
      });
      expect(calls[0].url).toBe("/api/share/maps/sm%2F1/links");
      expect(calls[0].init?.method).toBe("POST");
      expect(JSON.parse(String(calls[0].init?.body))).toEqual({ permission });
    },
  );
});
