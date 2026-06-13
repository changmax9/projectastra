import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { savePdfUpload, updatePdfUploadStorage } from "@/lib/data";
import { R2_MAX_PDF_BYTES, R2_MULTIPART_PART_SIZE, r2Buckets, r2ObjectKey, r2Request } from "@/lib/r2";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  const body = await request.json() as { fileName?: string; fileSize?: number; contentType?: string; subject?: string; unit?: string; topic?: string };
  const fileName = String(body.fileName || "");
  const fileSize = Number(body.fileSize || 0);
  if (!fileName.toLowerCase().endsWith(".pdf") || (body.contentType && body.contentType !== "application/pdf")) {
    return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > R2_MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF must be between 1 byte and 500 MB." }, { status: 400 });
  }
  const objectKey = r2ObjectKey("sources", fileName);
  const response = await r2Request({ bucket: r2Buckets.source, objectKey, method: "POST", query: { uploads: "" } });
  const xml = await response.text();
  const uploadId = xml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  if (!uploadId) return NextResponse.json({ error: "R2 did not return a multipart upload id." }, { status: 502 });
  const pdf = await savePdfUpload({
    file_name: fileName,
    file_url: "",
    subject: body.subject || null,
    unit: body.unit || null,
    topic: body.topic || null,
    uploaded_by: admin.id,
    storage_provider: "r2",
    storage_bucket: r2Buckets.source,
    storage_object_key: objectKey,
    mime_type: "application/pdf",
    size_bytes: fileSize,
    upload_status: "uploading"
  });
  await updatePdfUploadStorage(pdf.id, { status: "uploading", upload_status: "uploading" });
  return NextResponse.json({ pdfId: pdf.id, objectKey, uploadId, partSize: R2_MULTIPART_PART_SIZE });
}
