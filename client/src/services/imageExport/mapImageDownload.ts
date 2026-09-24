export function downloadMapImage(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
