import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPdfUpload } from "@/lib/data";
import { r2SignedUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(_: Request, { params }: { params: { pdfId: string } }) {
  await requireAdmin();
  const pdf = await getPdfUpload(params.pdfId);
  if (!pdf?.storage_bucket || !pdf.storage_object_key) return NextResponse.json({ error: "PDF source was not found." }, { status: 404 });
  return NextResponse.redirect(r2SignedUrl({ bucket: pdf.storage_bucket, objectKey: pdf.storage_object_key, method: "GET", expiresSeconds: 300 }));
}
