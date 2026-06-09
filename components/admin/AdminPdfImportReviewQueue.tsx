import Link from "next/link";
import { AlertTriangle, ArrowRight, FileSearch, LoaderCircle } from "lucide-react";
import type { PdfImportReviewQueue } from "@/lib/types";

function statusLabel(status: PdfImportReviewQueue["items"][number]["status"]) {
  if (status === "processing") return "Processing";
  if (status === "failed") return "Needs attention";
  return "Awaiting review";
}

function statusTone(status: PdfImportReviewQueue["items"][number]["status"]) {
  if (status === "processing") return "bg-blue-50 text-blue-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-800";
}

export function AdminPdfImportReviewQueue({ queue }: { queue: PdfImportReviewQueue }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-amber-100 bg-amber-50 px-5 py-4">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-800">
            <FileSearch className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950">PDF drafts awaiting review</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900">
              OCR imports stay here until an admin verifies and saves each draft. They do not appear in Questions or student exams yet.
            </p>
          </div>
        </div>
        <Link href="/admin/pdfs" className="edu-button-primary inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold">
          Open PDF imports
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {queue.items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">No PDF imports currently need attention.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {queue.items.map((job) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{job.pdf_upload?.file_name || job.pdf_upload_id}</p>
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusTone(job.status)}`}>
                    {job.status === "processing" ? <LoaderCircle className="mr-1 inline h-3 w-3" /> : null}
                    {job.status === "failed" ? <AlertTriangle className="mr-1 inline h-3 w-3" /> : null}
                    {statusLabel(job.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {[job.pdf_upload?.subject, job.pdf_upload?.unit ? `Unit ${job.pdf_upload.unit}` : "", job.pdf_upload?.topic]
                    .filter(Boolean)
                    .join(" · ") || "Metadata not set"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-ink">{job.pending_draft_count}</span> pending
                  {job.saved_draft_count > 0 ? ` · ${job.saved_draft_count} saved` : ""}
                  {job.rejected_draft_count > 0 ? ` · ${job.rejected_draft_count} rejected` : ""}
                </p>
                <Link
                  href={`/admin/pdfs?job_id=${job.id}`}
                  className="edu-button-secondary inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold"
                >
                  Review drafts
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
