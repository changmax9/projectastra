import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPdfUpload, updatePdfUploadStorage } from "@/lib/data";
import { r2Request } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  await requireAdmin();
  const body = await request.json() as { pdfId?: string; uploadId?: string };
  const pdf = await getPdfUpload(String(body.pdfId || ""));
  if (!pdf?.storage_bucket || !pdf.storage_object_key || !body.uploadId) {
    return NextResponse.json({ error: "Multipart upload was not found." }, { status: 404 });
  }
  await r2Request({ bucket: pdf.storage_bucket, objectKey: pdf.storage_object_key, method: "DELETE", query: { uploadId: body.uploadId } });
  await updatePdfUploadStorage(pdf.id, { status: "failed", upload_status: "failed" });
  return NextResponse.json({ ok: true });
}
