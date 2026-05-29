"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PdfDraftQuestionReview } from "@/components/admin/PdfDraftQuestionReview";
import type { PdfImportJobDetails } from "@/lib/types";

function progressForJob(job: PdfImportJobDetails) {
  const ocrPending = job.pages.filter((page) => page.ocr_status === "pending").length;
  const ocrCompleted = job.pages.filter((page) => page.ocr_status === "completed" || page.ocr_status === "not_needed").length;
  const ocrFailed = job.pages.filter((page) => page.ocr_status === "failed" || page.ocr_status === "unavailable").length;
  const processedPages = job.pages.filter((page) => page.extraction_method !== "none" || page.ocr_status !== "pending").length;
  return {
    processedPages,
    ocrPending,
    ocrCompleted,
    ocrFailed
  };
}

function statusTone(status: PdfImportJobDetails["status"]) {
  if (status === "failed") return "border-red-200 bg-red-50 text-red-800";
  if (status === "processing") return "border-blue-200 bg-blue-50 text-blue-900";
  if (status === "completed") return "border-green-200 bg-green-50 text-green-800";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export function PdfImportWorkspace({ initialJob }: { initialJob: PdfImportJobDetails | null }) {
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setJob(initialJob);
    setError(null);
  }, [initialJob]);

  const progress = useMemo(() => (job ? progressForJob(job) : null), [job]);

  useEffect(() => {
    if (!job || job.status !== "processing") return;
    let cancelled = false;
    const jobId = job.id;
    async function processJob() {
      try {
        setError(null);
        const response = await fetch(`/api/admin/pdf-imports/${jobId}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const payload = await response.json();
        if (cancelled) return;
        if (payload.job) setJob(payload.job);
        if (!response.ok) setError(payload.error || "PDF import processing failed.");
        startTransition(() => router.refresh());
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "PDF import processing failed.");
      }
    }
    const timer = window.setTimeout(processJob, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job, router]);

  if (!job) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink">Import workspace</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Select an existing import or click Analyze PDF to generate reviewable draft questions on this page.
        </p>
      </section>
    );
  }

  const pendingCount = job.draft_questions.filter((draft) => draft.review_status === "pending").length;
  const savedCount = job.draft_questions.filter((draft) => draft.review_status === "saved").length;
  const rejectedCount = job.draft_questions.filter((draft) => draft.review_status === "rejected").length;

  return (
    <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">Import workspace</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {job.pdf_upload?.file_name || job.pdf_upload_id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`rounded-md border px-3 py-1 ${statusTone(job.status)}`}>Status: {job.status}</span>
          <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Pages: {job.page_count}</span>
          <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-700">Drafts: {job.draft_question_count}</span>
          <Link href={`/admin/pdf-imports/${job.id}`} className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50">
            Deep link
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Processed pages</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{progress?.processedPages || 0}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">OCR complete</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{progress?.ocrCompleted || 0}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">OCR pending</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{progress?.ocrPending || 0}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Review state</p>
          <p className="mt-1 text-sm font-semibold text-ink">{pendingCount} pending · {savedCount} saved · {rejectedCount} rejected</p>
        </div>
      </div>

      {job.status === "processing" ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          OCR/import is running. This page will update automatically. {isPending ? "Refreshing..." : null}
        </div>
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {job.error_message ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Import error</p>
          <p className="mt-1">{job.error_message}</p>
        </div>
      ) : null}

      {job.warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {job.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-md border border-slate-200 p-4">
        <h3 className="font-semibold text-ink">Page audit</h3>
        <div className="mt-3 grid max-h-96 gap-3 overflow-auto md:grid-cols-2 xl:grid-cols-3">
          {job.pages.length === 0 ? (
            <p className="text-sm text-slate-500">No page records yet.</p>
          ) : job.pages.map((page) => (
            <div key={page.id} className="rounded-md border border-slate-200 p-3 text-xs text-slate-600">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-ink">Page {page.page_number}</span>
                <span>{page.extraction_method} · {page.ocr_status}</span>
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap leading-5">{page.text_extracted || page.ocr_text || page.warnings[0] || "No accepted text."}</p>
            </div>
          ))}
        </div>
      </div>

      {job.draft_questions.length === 0 ? (
        <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-500">
          No draft questions are available yet.
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="font-semibold text-ink">Generated draft questions</h3>
          {job.draft_questions.map((draft) => {
            const sourcePages = job.pages.filter(
              (page) => page.page_number >= draft.source_page_start && page.page_number <= draft.source_page_end
            );
            const candidateAssets = job.draft_assets.filter((asset) => asset.draft_question_id === draft.id);
            return <PdfDraftQuestionReview key={draft.id} draft={draft} sourcePages={sourcePages} candidateAssets={candidateAssets} />;
          })}
        </div>
      )}
    </section>
  );
}
