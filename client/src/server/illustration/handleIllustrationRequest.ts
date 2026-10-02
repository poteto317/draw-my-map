import {
  buildIllustrationPrompt,
  validateIllustrationLabel,
} from "@/domain/illustration/illustrationPrompt";
import {
  ImageGenerationError,
  readCloudflareConfig,
  type CloudflareConfig,
  type ImageGenerator,
} from "@/server/illustration/cloudflareImageGenerator";

export type IllustrationRouteDeps = {
  env: Record<string, string | undefined>;
  createGenerator: (config: CloudflareConfig) => ImageGenerator;
};

// NSFW の誤判定はランダムに起きるため、同じプロンプトで、最大この回数まで試す
const MAX_GENERATION_ATTEMPTS = 3;

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

async function readLabel(request: Request): Promise<string | null> {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const label = (body as { label?: unknown }).label;
  return typeof label === "string" ? label : null;
}

export async function handleIllustrationRequest(
  request: Request,
  { env, createGenerator }: IllustrationRouteDeps,
): Promise<Response> {
  const rawLabel = await readLabel(request);
  if (rawLabel === null) return errorResponse("invalid-request", 400);

  const validation = validateIllustrationLabel(rawLabel);
  if (!validation.ok) return errorResponse("invalid-label", 400);

  const config = readCloudflareConfig(env);
  if (config === null) return errorResponse("not-configured", 503);

  const generate = createGenerator(config);
  const prompt = buildIllustrationPrompt(validation.label);

  for (let attempt = 1; ; attempt++) {
    try {
      const image = await generate(prompt);
      return Response.json({ image: image.base64, mimeType: image.mimeType });
    } catch (error) {
      if (error instanceof ImageGenerationError && error.kind === "content-rejected") {
        if (attempt < MAX_GENERATION_ATTEMPTS) continue;
        return errorResponse("content-rejected", 422);
      }
      if (error instanceof ImageGenerationError && error.kind === "quota-exceeded") {
        return errorResponse("quota-exceeded", 429);
      }
      return errorResponse("upstream-error", 502);
    }
  }
}
