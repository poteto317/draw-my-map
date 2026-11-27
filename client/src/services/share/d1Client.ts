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
  errors?: unknown;
  result?: Array<{ results?: unknown[]; meta?: unknown; success?: boolean }>;
};

export type D1QueryErrorKind = "no-such-table" | "failed";

/** D1 の失敗。生のエラーメッセージ（SQL・秘密を含みうる）は載せず、種類だけを持つ */
export class D1QueryError extends Error {
  readonly kind: D1QueryErrorKind;

  constructor(kind: D1QueryErrorKind) {
    super("d1-query-failed");
    this.name = "D1QueryError";
    this.kind = kind;
  }
}

/** テーブルが無い（DDL 未実行）ことによる失敗か */
export function isD1MissingTableError(error: unknown): boolean {
  return error instanceof D1QueryError && error.kind === "no-such-table";
}

/** 失敗応答の errors[].message（文字列のみ）に "no such table" を含めば no-such-table */
function classifyD1Failure(body: D1QueryResponse | null): D1QueryErrorKind {
  const errors = body?.errors;
  if (!Array.isArray(errors)) return "failed";
  const missingTable = errors.some((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const message = (entry as { message?: unknown }).message;
    return typeof message === "string" && message.toLowerCase().includes("no such table");
  });
  return missingTable ? "no-such-table" : "failed";
}

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
        throw new D1QueryError("failed");
      }

      if (!response.ok || body?.success !== true) {
        throw new D1QueryError(classifyD1Failure(body));
      }

      const first = Array.isArray(body.result) ? body.result[0] : undefined;
      return {
        results: Array.isArray(first?.results) ? first.results : [],
        meta: first?.meta,
      };
    },
  };
}
