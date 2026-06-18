export type PdfOcrMode = "local" | "remote-worker";

export function getPdfOcrMode(): PdfOcrMode {
  const configured = process.env.PDF_OCR_MODE?.trim();
  if (configured === "local" || configured === "remote-worker") return configured;
  return process.env.VERCEL ? "remote-worker" : "local";
}

export function isRemotePdfOcrMode() {
  return getPdfOcrMode() === "remote-worker";
}
