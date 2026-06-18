import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPdfUpload } from "@/lib/data";
import { r2SignedUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  await requireAdmin();
  const body = await request.json() as { pdfId?: string; uploadId?: string; partNumber?: number };
  const pdf = await getPdfUpload(String(body.pdfId || ""));
  const partNumber = Number(body.partNumber || 0);
  if (!pdf?.storage_bucket || !pdf.storage_object_key || pdf.upload_status !== "uploading") {
    return NextResponse.json({ error: "Multipart PDF upload was not found." }, { status: 404 });
  }
  if (!body.uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    return NextResponse.json({ error: "Invalid multipart upload request." }, { status: 400 });
  }
  const url = r2SignedUrl({
    bucket: pdf.storage_bucket,
    objectKey: pdf.storage_object_key,
    method: "PUT",
    expiresSeconds: 900,
    query: { partNumber: String(partNumber), uploadId: body.uploadId }
  });
  return NextResponse.json({ url });
}
