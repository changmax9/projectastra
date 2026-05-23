import Link from "next/link";
import { notFound } from "next/navigation";
import { PdfDraftQuestionReview } from "@/components/admin/PdfDraftQuestionReview";
import { getPdfImportJobDetails } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminPdfImportJobPage({ params }: { params: { jobId: string } }) {
  const job = await getPdfImportJobDetails(params.jobId);
  if (!job) notFound();

  const pendingCount = job.draft_questions.filter((draft) => draft.review_status === "pending").length;
  const savedCount = job.draft_questions.filter((draft) => draft.review_status === "saved").length;
  const rejectedCount = job.draft_questions.filter((draft) => draft.review_status === "rejected").length;

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
          <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Pages: {job.page_count}</span>
          <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Drafts: {job.draft_question_count}</span>
          <span className="rounded-md bg-amber-50 px-3 py-1 text-amber-800">Pending: {pendingCount}</span>
          <span className="rounded-md bg-green-50 px-3 py-1 text-green-700">Saved: {savedCount}</span>
          <span className="rounded-md bg-red-50 px-3 py-1 text-red-700">Rejected: {rejectedCount}</span>
        </div>
      </div>

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
          {job.pages.map((page) => (
            <div key={page.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-ink">Page {page.page_number}</span>
                <span className="text-xs text-slate-500">{page.extraction_method} · {page.ocr_status}</span>
              </div>
              <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600">
                {page.text_extracted || page.ocr_text || page.warnings[0] || "No text extracted."}
              </p>
            </div>
          ))}
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
            return <PdfDraftQuestionReview key={draft.id} draft={draft} sourcePages={sourcePages} />;
          })}
        </div>
      )}
    </div>
  );
}
