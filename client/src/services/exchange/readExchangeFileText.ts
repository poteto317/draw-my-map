import { EXCHANGE_MAX_FILE_BYTES } from "@/domain/exchange/exchangeLimits";

export type ExchangeFileReadFailureReason = "file-too-large" | "read-failed";

export class ExchangeFileReadError extends Error {
  readonly reason: ExchangeFileReadFailureReason;

  constructor(reason: ExchangeFileReadFailureReason) {
    super(reason);
    this.name = "ExchangeFileReadError";
    this.reason = reason;
  }
}

export async function readExchangeFileText(file: File): Promise<string> {
  if (file.size > EXCHANGE_MAX_FILE_BYTES) {
    throw new ExchangeFileReadError("file-too-large");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new ExchangeFileReadError("read-failed"));
    reader.readAsText(file);
  });
}