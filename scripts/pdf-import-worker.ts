import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { analyzePdfUpload, finalizePdfPages, PARSER_VERSION } from "@/lib/pdf";
import { completePdfImportJob } from "@/lib/data";
import { R2_MAX_PDF_BYTES, r2SignedUrl, uploadEvidence } from "@/lib/r2";
import type { PdfImportAnalysisInput } from "@/lib/data";
import type { PdfImportJob, PdfUpload } from "@/lib/types";

const workerId = process.env.PDF_WORKER_ID || `railway-${randomUUID()}`;
const pollMs = Number(process.env.PDF_WORKER_POLL_MS || 5000);
const batchSize = Number(process.env.PDF_WORKER_BATCH_SIZE || 12);
const maxPages = Number(process.env.PDF_WORKER_MAX_PAGES || 2000);
const supabase = createSupabaseAdminClient();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateJob(jobId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("pdf_import_jobs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", jobId);
  if (error) throw new Error(error.message);
}

async function claimJob() {
  const { data, error } = await supabase.rpc("claim_next_pdf_import_job", { worker_id: workerId, lease_seconds: 300 });
  if (error) throw new Error(error.message);
  return (data?.[0] || null) as PdfImportJob | null;
}

async function downloadSource(pdf: PdfUpload, target: string) {
  if (!pdf.storage_bucket || !pdf.storage_object_key) throw new Error("PDF source is not stored in R2.");
  const response = await fetch(r2SignedUrl({ bucket: pdf.storage_bucket, objectKey: pdf.storage_object_key, method: "GET", expiresSeconds: 1800 }));
  if (!response.ok) throw new Error(`Unable to download PDF source: ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function cancelled(jobId: string) {
  const { data, error } = await supabase.from("pdf_import_jobs").select("cancel_requested_at").eq("id", jobId).single();
  if (error) throw new Error(error.message);
  return Boolean(data.cancel_requested_at);
}

async function ensureBatches(jobId: string, pageCount: number) {
  const { data: existing, error } = await supabase.from("pdf_import_batches").select("*").eq("job_id", jobId).order("created_at");
  if (error) throw new Error(error.message);
  if (existing && existing.length > 0) return existing;
  const rows = [];
  for (let start = 1; start <= pageCount; start += batchSize) {
    rows.push({ job_id: jobId, page_numbers: Array.from({ length: Math.min(batchSize, pageCount - start + 1) }, (_, index) => start + index) });
  }
  const { data, error: insertError } = await supabase.from("pdf_import_batches").insert(rows).select("*");
  if (insertError) throw new Error(insertError.message);
  return data || [];
}

async function persistBatchPages(job: PdfImportJob, analysis: PdfImportAnalysisInput, batchId: string) {
  const timestamp = new Date().toISOString();
  const rows = analysis.pages
    .filter((page) => page.extraction_method !== "none" || page.ocr_status !== "pending")
    .map((page) => ({ ...page, id: `pdf_page_${randomUUID()}`, job_id: job.id, pdf_upload_id: job.pdf_upload_id, created_at: timestamp, updated_at: timestamp }));
  if (rows.length > 0) {
    const { error } = await supabase.from("pdf_import_pages").upsert(rows, { onConflict: "job_id,page_number" });
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from("pdf_import_batches").update({
    status: "completed",
    lease_owner: null,
    lease_expires_at: null,
    error_message: null,
    updated_at: timestamp
  }).eq("id", batchId);
  if (error) throw new Error(error.message);
  const { count } = await supabase.from("pdf_import_pages").select("*", { head: true, count: "exact" }).eq("job_id", job.id);
  await updateJob(job.id, { processed_page_count: count || 0 });
}

async function uploadAnalysisEvidence(pdfUploadId: string, jobId: string, analysis: PdfImportAnalysisInput) {
  async function moveUrl(url: string | null) {
    if (!url?.startsWith("/uploads/")) return url;
    const localPath = path.join(process.cwd(), "public", url.replace(/^\/+/, ""));
    return uploadEvidence(`evidence/${pdfUploadId}/${jobId}/${randomUUID()}.png`, await readFile(localPath));
  }
  for (const page of analysis.pages) page.page_image_url = await moveUrl(page.page_image_url);
  for (const asset of analysis.draftAssets || []) asset.image_url = await moveUrl(asset.image_url);
  for (const draft of analysis.draftQuestions) {
    for (const image of draft.question_images) image.url = (await moveUrl(image.url)) || image.url;
  }
}

async function processJob(job: PdfImportJob) {
  const workDir = path.join(process.env.PDF_WORKER_TEMP_DIR || "/tmp", "astra-pdf-worker", job.id);
  await mkdir(workDir, { recursive: true });
  const pdfPath = path.join(workDir, "source.pdf");
  const heartbeat = setInterval(() => void updateJob(job.id, {
    heartbeat_at: new Date().toISOString(),
    lease_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    lease_owner: workerId
  }), 30_000);
  try {
    const { data: pdf, error } = await supabase.from("pdf_uploads").select("*").eq("id", job.pdf_upload_id).single();
    if (error || !pdf) throw new Error(error?.message || "PDF upload not found.");
    await updateJob(job.id, { status: "triaging", phase: "downloading", parser_version: PARSER_VERSION });
    await downloadSource(pdf as PdfUpload, pdfPath);
    const bytes = await readFile(pdfPath);
    if (bytes.length > R2_MAX_PDF_BYTES) throw new Error("PDF exceeds the 500 MB worker limit.");
    if (!bytes.subarray(0, 1024).toString("latin1").includes("%PDF-")) throw new Error("Uploaded source is not a valid PDF.");
    const localPdf = { ...(pdf as PdfUpload), file_url: pdfPath };
    process.env.PDF_OCR_MAX_PAGES = "0";
    const probe = await analyzePdfUpload(localPdf, { ocrPageNumbers: [] });
    if (probe.pageCount > maxPages) throw new Error(`PDF has ${probe.pageCount} pages; the worker limit is ${maxPages}.`);
    const batches = await ensureBatches(job.id, probe.pageCount);
    await updateJob(job.id, { status: "processing", phase: "processing", page_count: probe.pageCount });
    for (const batch of batches) {
      if (batch.status === "completed") continue;
      if (await cancelled(job.id)) {
        await updateJob(job.id, { status: "cancelled", phase: "cancelled", lease_owner: null, lease_expires_at: null });
        return;
      }
      await supabase.from("pdf_import_batches").update({
        status: "processing",
        attempt_count: Number(batch.attempt_count || 0) + 1,
        lease_owner: workerId,
        lease_expires_at: new Date(Date.now() + 5 * 60_000).toISOString()
      }).eq("id", batch.id);
      try {
        await persistBatchPages(job, await analyzePdfUpload(localPdf, { ocrPageNumbers: batch.page_numbers }), batch.id);
      } catch (error) {
        const attempts = Number(batch.attempt_count || 0) + 1;
        const nextAttemptAt = new Date(Date.now() + [1, 5, 15][Math.min(attempts - 1, 2)] * 60_000).toISOString();
        await supabase.from("pdf_import_batches").update({
          status: attempts >= 3 ? "failed" : "pending",
          error_message: error instanceof Error ? error.message : "Batch processing failed.",
          next_attempt_at: nextAttemptAt,
          lease_owner: null,
          lease_expires_at: null
        }).eq("id", batch.id);
        if (attempts < 3) {
          await updateJob(job.id, {
            status: "queued",
            phase: "retry_wait",
            lease_owner: null,
            lease_expires_at: nextAttemptAt,
            error_message: `A page batch failed and will retry automatically (attempt ${attempts} of 3).`
          });
          return;
        }
        throw error;
      }
    }
    await updateJob(job.id, { status: "finalizing", phase: "finalizing" });
    const { data: persistedPages, error: pagesError } = await supabase
      .from("pdf_import_pages")
      .select("*")
      .eq("job_id", job.id)
      .order("page_number", { ascending: true });
    if (pagesError) throw new Error(pagesError.message);
    const finalAnalysis = await finalizePdfPages(localPdf, persistedPages || [], [], "tesseract-remote-worker", probe.pageCount);
    await uploadAnalysisEvidence(job.pdf_upload_id, job.id, finalAnalysis);
    await completePdfImportJob(job.id, finalAnalysis, job.created_by || workerId);
    await updateJob(job.id, { phase: "needs_review", processed_page_count: finalAnalysis.pageCount, lease_owner: null, lease_expires_at: null });
  } catch (error) {
    await updateJob(job.id, {
      status: "failed",
      phase: "failed",
      error_message: error instanceof Error ? error.message : "PDF worker failed.",
      lease_owner: null,
      lease_expires_at: null
    });
  } finally {
    clearInterval(heartbeat);
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`Astra PDF worker ${workerId} started.`);
  for (;;) {
    const job = await claimJob();
    if (job) await processJob(job);
    else await delay(pollMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
