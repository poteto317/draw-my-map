/** @jest-environment node */

import { createR2Client } from "@/services/share/r2Client";

const config = {
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secretAccessKeyValue",
  bucket: "share-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
};

describe("createR2Client", () => {
  it("putObject は SigV4 付き PUT を送り、秘密を URL に載せない", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const client = createR2Client(config, fetchImpl);
    const body = new TextEncoder().encode('{"nodes":[]}');

    await client.putObject("shares/map-1/rev-1.json", body, "application/json");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://acct.r2.cloudflarestorage.com/share-bucket/shares/map-1/rev-1.json");
    expect(String(url)).not.toContain(config.secretAccessKey);
    expect(init.method).toBe("PUT");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(headers["x-amz-content-sha256"]).toMatch(/^[a-f0-9]{64}$/);
    expect(headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(Buffer.from(init.body as Buffer)).toEqual(Buffer.from(body));
  });

  it("getObject は 200 で本文を返し、404 は null", async () => {
    const payload = new TextEncoder().encode('{"ok":true}');
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response(payload, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const client = createR2Client(config, fetchImpl);

    const found = await client.getObject("shares/map-1/rev-1.json");
    const missing = await client.getObject("shares/missing.json");

    expect(found).toEqual(payload);
    expect(missing).toBeNull();
    expect(fetchImpl.mock.calls[0][1].method).toBe("GET");
    expect(fetchImpl.mock.calls[1][1].method).toBe("GET");
  });

  it("deleteObject は DELETE を送り、2xx なら成功する", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createR2Client(config, fetchImpl);

    await expect(client.deleteObject("shares/map-1/rev-1.json")).resolves.toBeUndefined();

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://acct.r2.cloudflarestorage.com/share-bucket/shares/map-1/rev-1.json");
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).authorization).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it("非 2xx（404 以外の get 失敗含む）は固定文言で失敗する", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const client = createR2Client(config, fetchImpl);

    await expect(client.putObject("k", new Uint8Array([1]))).rejects.toThrow("r2-request-failed");
    await expect(client.getObject("k")).rejects.toThrow("r2-request-failed");
    await expect(client.deleteObject("k")).rejects.toThrow("r2-request-failed");
  });
});
