export type D1ClientConfig = {
  accountId: string;
  apiToken: string;
  databaseId: string;
};

export type D1ExecResult = {
  results: unknown[];
  meta: unknown;
};

export type D1Client = {
  exec(sql: string, params?: unknown[]): Promise<D1ExecResult>;
};

type D1QueryResponse = {
  success?: boolean;
  result?: Array<{ results?: unknown[]; meta?: unknown; success?: boolean }>;
};

/** Cloudflare D1 REST（Node から HTTP）。秘密は config 引数のみ */
export function createD1Client(
  config: D1ClientConfig,
  fetchImpl: typeof fetch = fetch,
): D1Client {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

  return {
    async exec(sql, params = []) {
      let response: Response;
      let body: D1QueryResponse | null;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql, params }),
        });
        body = (await response.json().catch(() => null)) as D1QueryResponse | null;
      } catch {
        throw new Error("d1-query-failed");
      }

      if (!response.ok || body?.success !== true) {
        throw new Error("d1-query-failed");
      }

      const first = Array.isArray(body.result) ? body.result[0] : undefined;
      return {
        results: Array.isArray(first?.results) ? first.results : [],
        meta: first?.meta,
      };
    },
  };
}
