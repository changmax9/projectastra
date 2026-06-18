import Link from "next/link";
import { notFound } from "next/navigation";
import { adminCancelPdfImportAction, adminDeletePdfUploadAction, adminRetryPdfImportAction } from "@/app/actions";
import { PdfDraftQuestionReview } from "@/components/admin/PdfDraftQuestionReview";
import { getPdfImportJobDetails } from "@/lib/data";

export const dynamic = "force-dynamic";

function rawOcrTextForPage(page: NonNullable<Awaited<ReturnType<typeof getPdfImportJobDetails>>>["pages"][number]) {
  const rawOcrBlock = page.raw_blocks.find(
    (block) => block.kind === "ocr_raw_text" && block.source === "tesseract-local-raw"
  );
  return typeof rawOcrBlock?.text === "string" ? rawOcrBlock.text : "";
}

export default async function AdminPdfImportJobPage({ params }: { params: { jobId: string } }) {
  const job = await getPdfImportJobDetails(params.jobId);
  if (!job) notFound();

  const pendingCount = job.draft_questions.filter((draft) => draft.review_status === "pending").length;
  const savedCount = job.draft_questions.filter((draft) => draft.review_status === "saved").length;
  const rejectedCount = job.draft_questions.filter((draft) => draft.review_status === "rejected").length;
  const importActive = ["queued", "triaging", "processing", "finalizing"].includes(job.status);
  const completedBatchCount = job.batches?.filter((batch) => batch.status === "completed").length || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/pdfs" className="text-sm font-medium text-brand hover:underline">
            Back to PDFs
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-ink">PDF import review</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            {job.pdf_upload?.file_name || job.pdf_upload_id}. Review and fix every draft before saving it to the real question bank.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Status: {job.status}</span>
          {job.phase ? <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Phase: {job.phase}</span> : null}
          <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Pages: {job.page_count}</span>
          <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Processed: {job.processed_page_count || 0}</span>
          <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Drafts: {job.draft_question_count}</span>
          <span className="rounded-md bg-amber-50 px-3 py-1 text-amber-800">Pending: {pendingCount}</span>
          <span className="rounded-md bg-green-50 px-3 py-1 text-green-700">Saved: {savedCount}</span>
          <span className="rounded-md bg-red-50 px-3 py-1 text-red-700">Rejected: {rejectedCount}</span>
          {job.heartbeat_at ? <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Heartbeat: {new Date(job.heartbeat_at).toLocaleTimeString()}</span> : null}
        </div>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <div>
          <p className="font-semibold text-ink">Import controls</p>
          <p className="mt-1 text-slate-500">
            Source PDFs remain private. Generated evidence stays review-only until an admin explicitly saves a verified draft.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {importActive ? (
            <form action={adminCancelPdfImportAction}>
              <input type="hidden" name="job_id" value={job.id} />
              <button className="rounded-md border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">Cancel</button>
            </form>
          ) : null}
          {job.status === "failed" || job.status === "cancelled" ? (
            <form action={adminRetryPdfImportAction}>
              <input type="hidden" name="job_id" value={job.id} />
              <button className="rounded-md border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Retry</button>
            </form>
          ) : null}
          <form action={adminDeletePdfUploadAction}>
            <input type="hidden" name="pdf_id" value={job.pdf_upload_id} />
            <button disabled={importActive} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Delete source and evidence</button>
          </form>
        </div>
      </section>

      {job.batches?.length ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-ink">Batch progress</h2>
            <span className="text-slate-500">{completedBatchCount} / {job.batches.length} completed</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {job.batches.map((batch) => (
              <div key={batch.id} className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-ink">Pages {batch.page_numbers[0]}-{batch.page_numbers[batch.page_numbers.length - 1]}</span>
                  <span>{batch.status}</span>
                </div>
                <p className="mt-1">Attempts: {batch.attempt_count}</p>
                {batch.next_attempt_at ? <p className="mt-1">Next retry: {new Date(batch.next_attempt_at).toLocaleString()}</p> : null}
                {batch.error_message ? <p className="mt-1 text-red-700">{batch.error_message}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {job.error_message ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Import error</p>
          <p className="mt-1">{job.error_message}</p>
        </section>
      ) : null}

      {job.warnings.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Job warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {job.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Page extraction</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {job.pages.map((page) => {
            const rawOcrText = rawOcrTextForPage(page);
            return (
              <div key={page.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-ink">Page {page.page_number}</span>
                  <span className="text-xs text-slate-500">{page.extraction_method} · {page.ocr_status}</span>
                </div>
                <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600">
                  {page.text_extracted || page.ocr_text || page.warnings[0] || "No text extracted."}
                </p>
                {rawOcrText ? (
                  <details className="mt-3 border-t border-slate-200 pt-2 text-xs">
                    <summary className="cursor-pointer font-semibold text-slate-700">Raw OCR model output</summary>
                    <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono leading-5 text-slate-500">{rawOcrText}</p>
                    <p className="mt-2 text-[11px] text-slate-400">Untouched Tesseract output shown separately from Astra normalization.</p>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {job.draft_questions.length === 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          No draft questions were created. For scanned PDFs, configure an OCR/render provider before rerunning import.
        </section>
      ) : (
        <div className="space-y-5">
          {job.draft_questions.map((draft) => {
            const sourcePages = job.pages.filter(
              (page) => page.page_number >= draft.source_page_start && page.page_number <= draft.source_page_end
            );
            const candidateAssets = job.draft_assets.filter((asset) => asset.draft_question_id === draft.id);
            return <PdfDraftQuestionReview key={draft.id} draft={draft} sourcePages={sourcePages} candidateAssets={candidateAssets} />;
          })}
        </div>
      )}
    </div>
  );
}
