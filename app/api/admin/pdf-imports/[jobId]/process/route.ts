import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  completePdfImportJob,
  getPdfImportJobDetails,
  getPdfImportSchemaStatus,
  getPdfUpload,
  isPdfImportSchemaSetupError
} from "@/lib/data";
import { analyzePdfUpload } from "@/lib/pdf";
import { isRemotePdfOcrMode } from "@/lib/pdf-ocr-mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

function progressFromJob(job: NonNullable<Awaited<ReturnType<typeof getPdfImportJobDetails>>>) {
  const ocrPending = job.pages.filter((page) => page.ocr_status === "pending").length;
  const ocrCompleted = job.pages.filter((page) => page.ocr_status === "completed" || page.ocr_status === "not_needed").length;
  const ocrFailed = job.pages.filter((page) => page.ocr_status === "failed" || page.ocr_status === "unavailable").length;
  return {
    pageCount: job.page_count,
    processedPages: job.pages.filter((page) => page.extraction_method !== "none" || page.ocr_status !== "pending").length,
    extractedPages: job.extracted_page_count,
    ocrPending,
    ocrCompleted,
    ocrFailed,
    draftCount: job.draft_question_count
  };
}

export async function POST(_: Request, { params }: { params: { jobId: string } }) {
  const admin = await requireAdmin();
  const schemaStatus = await getPdfImportSchemaStatus();
  if (!schemaStatus.available) {
    return NextResponse.json({ error: schemaStatus.message }, { status: 503 });
  }
  const current = await getPdfImportJobDetails(params.jobId);
  if (!current) {
    return NextResponse.json({ error: "PDF import job not found." }, { status: 404 });
  }

  if (isRemotePdfOcrMode()) {
    const active = ["queued", "triaging", "processing", "finalizing"].includes(current.status);
    return NextResponse.json({ job: current, progress: progressFromJob(current), done: !active });
  }
  if (!["queued", "processing"].includes(current.status)) {
    return NextResponse.json({ job: current, progress: progressFromJob(current), done: true });
  }

  const pdf = await getPdfUpload(current.pdf_upload_id);
  if (!pdf) {
    return NextResponse.json({ error: "PDF upload not found." }, { status: 404 });
  }

  try {
    const analysis = await analyzePdfUpload(pdf);
    await completePdfImportJob(current.id, analysis, admin.id);
    const updated = await getPdfImportJobDetails(current.id);
    if (!updated) return NextResponse.json({ error: "PDF import job disappeared after processing." }, { status: 500 });
    revalidatePath("/admin/pdfs");
    revalidatePath(`/admin/pdf-imports/${current.id}`);
    return NextResponse.json({ job: updated, progress: progressFromJob(updated), done: updated.status !== "processing" });
  } catch (error) {
    const failedAnalysis = {
      pdfUploadId: pdf.id,
      status: "failed" as const,
      parserVersion: current.parser_version,
      ocrProvider: "failed",
      pageCount: current.page_count,
      warnings: [error instanceof Error ? error.message : "PDF import processing failed."],
      errorMessage: error instanceof Error ? error.message : "PDF import processing failed.",
      pages: [],
      draftQuestions: [],
      draftAssets: []
    };
    try {
      await completePdfImportJob(current.id, failedAnalysis, admin.id);
    } catch (persistError) {
      const persistMessage = isPdfImportSchemaSetupError(persistError)
        ? "PDF import database tables are unavailable. Apply Supabase migrations through 009_remote_pdf_worker.sql and retry."
        : "PDF import failed, and its failed state could not be saved. Check the server log.";
      console.error("Unable to save failed PDF import state:", persistError);
      return NextResponse.json({ done: true, error: persistMessage }, { status: 500 });
    }
    const failed = await getPdfImportJobDetails(current.id);
    return NextResponse.json(
      { job: failed, progress: failed ? progressFromJob(failed) : null, done: true, error: failedAnalysis.errorMessage },
      { status: 500 }
    );
  }
}
