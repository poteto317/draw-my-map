export type ImageGenerationErrorKind = "quota-exceeded" | "upstream-error" | "content-rejected";
export type CloudflareConfig = { accountId: string; apiToken: string };

export class ImageGenerationError extends Error {
  readonly kind: ImageGenerationErrorKind;

  constructor(kind: ImageGenerationErrorKind, message: string) {
    super(message);
    this.name = "ImageGenerationError";
    this.kind = kind;
  }
}
