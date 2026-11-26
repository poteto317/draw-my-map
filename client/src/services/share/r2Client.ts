import { createHash, createHmac } from "node:crypto";

export type R2ClientConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** 例: https://<accountid>.r2.cloudflarestorage.com */
  endpoint: string;
  /** R2 は通常 "auto" */
  region?: string;
};

export type R2Client = {
  putObject(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array | null>;
  deleteObject(key: string): Promise<void>;
};

const EMPTY_PAYLOAD_HASH = createHash("sha256").update("").digest("hex");

/** Cloudflare R2（S3 互換 HTTP + SigV4）。秘密は config 引数のみ */
export function createR2Client(
  config: R2ClientConfig,
  fetchImpl: typeof fetch = fetch,
): R2Client {
  const region = config.region ?? "auto";
  const endpoint = config.endpoint.replace(/\/$/, "");

  async function signedRequest(
    method: string,
    key: string,
    options: { body?: Uint8Array; contentType?: string } = {},
  ): Promise<Response> {
    const objectPath = `/${config.bucket}/${key.replace(/^\/+/, "")}`;
    const url = `${endpoint}${objectPath}`;
    const amzDate = formatAmzDate(new Date());
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = options.body
      ? createHash("sha256").update(options.body).digest("hex")
      : EMPTY_PAYLOAD_HASH;

    const headers: Record<string, string> = {
      host: new URL(endpoint).host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (options.contentType) {
      headers["content-type"] = options.contentType;
    }

    headers.authorization = signRequest({
      method,
      canonicalUri: objectPath,
      headers,
      payloadHash,
      amzDate,
      dateStamp,
      region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });

    try {
      return await fetchImpl(url, {
        method,
        headers,
        // Node の fetch BodyInit は Uint8Array<ArrayBufferLike> を拒むため Buffer に揃える
        body: options.body ? Buffer.from(options.body) : undefined,
      });
    } catch {
      throw new Error("r2-request-failed");
    }
  }

  return {
    async putObject(key, body, contentType = "application/octet-stream") {
      const response = await signedRequest("PUT", key, { body, contentType });
      if (!response.ok) throw new Error("r2-request-failed");
    },

    async getObject(key) {
      const response = await signedRequest("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("r2-request-failed");
      return new Uint8Array(await response.arrayBuffer());
    },

    async deleteObject(key) {
      const response = await signedRequest("DELETE", key);
      if (!response.ok) throw new Error("r2-request-failed");
    },
  };
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function signRequest(input: {
  method: string;
  canonicalUri: string;
  headers: Record<string, string>;
  payloadHash: string;
  amzDate: string;
  dateStamp: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): string {
  const signedHeaderNames = Object.keys(input.headers)
    .map((name) => name.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${input.headers[name]!.trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const credentialScope = `${input.dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest, "utf8").digest("hex"),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, input.dateStamp), input.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return [
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");
}
