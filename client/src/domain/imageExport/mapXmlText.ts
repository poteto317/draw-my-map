export function normalizeMapXmlText(value: string): string {
  // XML 1.0 allows these code points; replace invalid controls and lone surrogates.
  return value.replace(
    /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,
    "\uFFFD",
  );
}

export function escapeMapXmlText(value: string): string {
  return normalizeMapXmlText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
