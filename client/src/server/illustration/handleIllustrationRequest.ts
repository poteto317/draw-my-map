import {
  buildIllustrationPrompt,
  needsTranslation,
  validateIllustrationLabel,
} from "@/domain/illustration/illustrationPrompt";
import { isRecord } from "@/domain/shared/unknownRecord";
import {
  ImageGenerationError,
  readCloudflareConfig,
  type CloudflareConfig,
  type ImageGenerationErrorKind,
  type ImageGenerator,
} from "@/server/illustration/cloudflareImageGenerator";
import type { Translator } from "@/server/illustration/cloudflareTranslator";

export type IllustrationRouteDeps = {
  env: Record<string, string | undefined>;
  createGenerator: (config: CloudflareConfig) => ImageGenerator;
  createTranslator: (config: CloudflareConfig) => Translator;
};

// NSFW の誤判定はランダムに起きるため、同じプロンプトで、最大この回数まで試す
const MAX_GENERATION_ATTEMPTS = 3;

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function isImageGenerationError(error: unknown, kind: ImageGenerationErrorKind): boolean {
  return error instanceof ImageGenerationError && error.kind === kind;
}

// 翻訳・生成の失敗の応答。無料枠の超過だけを 429 にし、それ以外（想定外の例外を含む）は内部の情報を返さずに 502 にする
function upstreamFailureResponse(error: unknown): Response {
  if (isImageGenerationError(error, "quota-exceeded")) {
    return errorResponse("quota-exceeded", 429);
  }
  return errorResponse("upstream-error", 502);
}

async function readLabel(request: Request): Promise<string | null> {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return null;
  const { label } = body;
  return typeof label === "string" ? label : null;
}

export async function handleIllustrationRequest(
  request: Request,
  { env, createGenerator, createTranslator }: IllustrationRouteDeps,
): Promise<Response> {
  const rawLabel = await readLabel(request);
  if (rawLabel === null) return errorResponse("invalid-request", 400);

  const validation = validateIllustrationLabel(rawLabel);
  if (!validation.ok) return errorResponse("invalid-label", 400);

  const config = readCloudflareConfig(env);
  if (config === null) return errorResponse("not-configured", 503);

  // 翻訳は、NSFW の再試行の前に1回だけ行う。失敗しても、日本語のラベルでは描かない
  let concept = validation.label;
  if (needsTranslation(concept)) {
    try {
      concept = await createTranslator(config)(concept);
    } catch (error) {
      return upstreamFailureResponse(error);
    }
  }

  const generate = createGenerator(config);
  const prompt = buildIllustrationPrompt(concept);

  for (let attempt = 1; ; attempt++) {
    try {
      const image = await generate(prompt);
      return Response.json({ image: image.base64, mimeType: image.mimeType });
    } catch (error) {
      if (isImageGenerationError(error, "content-rejected")) {
        if (attempt < MAX_GENERATION_ATTEMPTS) continue;
        return errorResponse("content-rejected", 422);
      }
      return upstreamFailureResponse(error);
    }
  }
}
