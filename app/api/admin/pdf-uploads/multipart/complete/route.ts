import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPdfUpload, updatePdfUploadStorage } from "@/lib/data";
import { r2Request } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 10;

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function POST(request: Request) {
  await requireAdmin();
  const body = await request.json() as { pdfId?: string; uploadId?: string; parts?: Array<{ partNumber: number; etag: string }> };
  const pdf = await getPdfUpload(String(body.pdfId || ""));
  if (!pdf?.storage_bucket || !pdf.storage_object_key || pdf.upload_status !== "uploading" || !body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
    return NextResponse.json({ error: "Invalid multipart completion request." }, { status: 400 });
  }
  const parts = [...body.parts].sort((a, b) => a.partNumber - b.partNumber);
  const seen = new Set<number>();
  for (const part of parts) {
    if (!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > 10_000 || seen.has(part.partNumber) || !part.etag) {
      return NextResponse.json({ error: "Multipart completion contains invalid part metadata." }, { status: 400 });
    }
    seen.add(part.partNumber);
  }
  const xml = `<CompleteMultipartUpload>${parts.map((part) =>
    `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`
  ).join("")}</CompleteMultipartUpload>`;
  await r2Request({
    bucket: pdf.storage_bucket,
    objectKey: pdf.storage_object_key,
    method: "POST",
    query: { uploadId: body.uploadId },
    body: xml,
    headers: { "Content-Type": "application/xml" }
  });
  await updatePdfUploadStorage(pdf.id, {
    status: "uploaded",
    upload_status: "completed",
    file_url: `/api/admin/pdf-uploads/${pdf.id}/download`
  });
  return NextResponse.json({ ok: true, pdfId: pdf.id });
}
