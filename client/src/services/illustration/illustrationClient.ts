export type IllustrationErrorKind =
  | "invalid-label"
  | "not-configured"
  | "quota-exceeded"
  | "upstream-error"
  | "content-rejected"
  | "network"
  | "image-processing";

export type IllustrationImage = { dataUrl: string };

export class IllustrationRequestError extends Error {
  readonly kind: IllustrationErrorKind;

  constructor(kind: IllustrationErrorKind) {
    super(kind);
    this.name = "IllustrationRequestError";
    this.kind = kind;
  }
}

const ERROR_MESSAGES: Record<IllustrationErrorKind, string> = {
  "invalid-label": "ノードのテキストが空、または長すぎるため、イラストを生成できません。",
  "not-configured": "イラスト生成の設定（Cloudflareの認証情報）が見つかりません。README の手順で設定してください。",
  "quota-exceeded": "無料の利用上限に達しました（1日の無料枠を使い切ったか、一時的な制限です）。時間をおいて（無料枠は毎日 0:00 UTC にリセット）、再度お試しください。",
  "upstream-error": "イラストの生成に失敗しました。時間をおいて、再度お試しください。",
  "content-rejected": "画像生成AIが、内容を不適切と判定しました（誤判定のことがあります）。もう一度お試しください。ノードのテキストを少し変えると、通ることもあります。",
  network: "通信に失敗しました。接続を確認して、再度お試しください。",
  "image-processing": "生成した画像を処理できませんでした。もう一度お試しください。",
};

export function describeIllustrationError(kind: IllustrationErrorKind): string {
  return ERROR_MESSAGES[kind];
}

function kindFromStatus(status: number): IllustrationErrorKind {
  if (status === 400) return "invalid-label";
  if (status === 503) return "not-configured";
  if (status === 429) return "quota-exceeded";
  if (status === 422) return "content-rejected";
  return "upstream-error";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// サーバーの応答でも、data URLに使える画像の種類は限定する
const ALLOWED_MIME_TYPE = /^image\/(jpeg|png|webp)$/;

type RequestOptions = { signal?: AbortSignal; fetchImpl?: typeof fetch };

export async function requestIllustration(
  label: string,
  { signal, fetchImpl = fetch }: RequestOptions = {},
): Promise<IllustrationImage> {
  let response: Response;
  try {
    response = await fetchImpl("/api/illustrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new IllustrationRequestError("network");
  }

  if (!response.ok) throw new IllustrationRequestError(kindFromStatus(response.status));

  const body: unknown = await response.json().catch(() => null);
  const { image, mimeType } = (body ?? {}) as { image?: unknown; mimeType?: unknown };
  if (typeof image !== "string" || typeof mimeType !== "string" || !ALLOWED_MIME_TYPE.test(mimeType)) {
    throw new IllustrationRequestError("upstream-error");
  }
  return { dataUrl: `data:${mimeType};base64,${image}` };
}
