import Link from "next/link";
import { adminCancelPdfImportAction, adminDeletePdfUploadAction, adminRetryPdfImportAction, adminStartPdfImportAction, adminUpdatePdfMetadataAction } from "@/app/actions";
import { DataTable } from "@/components/admin/DataTable";
import { PdfImportWorkspace } from "@/components/admin/PdfImportWorkspace";
import { PdfUploader } from "@/components/admin/PdfUploader";
import { getPdfImportJobDetails, getPdfImportSchemaStatus, listPdfImportJobs, listPdfUploads } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminPdfsPage({ searchParams }: { searchParams?: { import_error?: string; job_id?: string } }) {
  const remoteWorkerMode = process.env.PDF_OCR_MODE === "remote-worker";
  const remoteStorageConfigured = Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_EVIDENCE_PUBLIC_URL
  );
  const remoteReady = remoteWorkerMode && remoteStorageConfigured;
  const [pdfs, jobs, importSchemaStatus] = await Promise.all([
    listPdfUploads(),
    listPdfImportJobs(),
    getPdfImportSchemaStatus()
  ]);
  const latestJobByPdf = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) {
    if (!latestJobByPdf.has(job.pdf_upload_id)) latestJobByPdf.set(job.pdf_upload_id, job);
  }
  const selectedJobId = searchParams?.job_id || jobs[0]?.id || "";
  const selectedJob = selectedJobId ? await getPdfImportJobDetails(selectedJobId) : null;
  const showMissingSchemaWarning = !importSchemaStatus.available || searchParams?.import_error === "schema_missing";
  const showStartFailureWarning = searchParams?.import_error === "start_failed";

  return (
    <div className="space-y-6">
      <div>
        <p className="edu-kicker">Import pipeline</p>
        <h1 className="edu-heading mt-2 text-3xl">PDF Imports</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Upload packets, run OCR analysis, then verify each draft before it can enter the question bank.
        </p>
      </div>
      <section className="grid gap-3 md:grid-cols-4">
        {[
          ["1", "Upload", "Add a source PDF and course metadata."],
          ["2", "Analyze", "Generate review-only drafts from OCR/text."],
          ["3", "Review", "Check wording, choices, answers, and source evidence."],
          ["4", "Save draft", "Verified items become draft questions only."]
        ].map(([step, label, detail]) => (
          <div key={step} className="edu-card rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-950 text-xs font-semibold text-white">{step}</span>
              <h2 className="edu-heading text-lg">{label}</h2>
            </div>
            <p className="mt-2 text-sm leading-5 text-slate-500">{detail}</p>
          </div>
        ))}
      </section>
      <PdfUploader remoteEnabled={remoteReady} />
      {remoteWorkerMode && !remoteReady ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
          <h2 className="font-semibold">Remote OCR setup is incomplete</h2>
          <p className="mt-2">Configure Cloudflare R2 credentials and the public evidence URL before uploading or queueing production PDF imports.</p>
        </section>
      ) : null}
      <section className="rounded-lg border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
        <h2 className="font-semibold">Review-only import safety</h2>
        <p className="mt-2">OCR output stays as draft/review-state content. Imported questions are never published directly.</p>
      </section>
      {showMissingSchemaWarning ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <h2 className="font-semibold">PDF import setup needed</h2>
          <p className="mt-2">
            Supabase is connected, but the PDF import tables are not available in this project yet. Existing PDF uploads
            still work, but OCR analysis is disabled until migrations through <code className="rounded bg-amber-100 px-1">supabase/migrations/009_remote_pdf_worker.sql</code> are applied.
          </p>
        </section>
      ) : null}
      {showStartFailureWarning ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-800">
          <h2 className="font-semibold">Unable to start PDF analysis</h2>
          <p className="mt-2">
            The import job could not be queued. Check the server log for the underlying error and confirm that the
            current Supabase project has every migration through <code className="rounded bg-red-100 px-1">009_remote_pdf_worker.sql</code>.
          </p>
        </section>
      ) : null}
      <DataTable
        headers={["File", "Subject", "Unit", "Topic", "Status", "Import", "Metadata"]}
        empty="No PDFs uploaded yet."
        rows={pdfs.map((pdf) => {
          const latestJob = latestJobByPdf.get(pdf.id);
          const isSelected = Boolean(latestJob && latestJob.id === selectedJobId);
          const importActive = Boolean(latestJob && ["queued", "triaging", "processing", "finalizing"].includes(latestJob.status));
          return [
            <a key="file" href={pdf.file_url || "#"} target="_blank" className="font-medium text-brand">{pdf.file_name}</a>,
            pdf.subject || "",
            pdf.unit || "",
            pdf.topic || "",
            pdf.status,
            <div key="import" className="flex min-w-[220px] flex-wrap gap-2">
              <form action={adminStartPdfImportAction}>
                <input type="hidden" name="pdf_id" value={pdf.id} />
                <button
                  disabled={!importSchemaStatus.available || pdf.upload_status === "uploading" || importActive || (remoteWorkerMode && !remoteReady)}
                  className="rounded-full bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Start analysis
                </button>
              </form>
              {latestJob ? (
                <Link
                  href={`/admin/pdfs?job_id=${latestJob.id}`}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 ${isSelected ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-700"}`}
                >
                  {isSelected ? "Selected" : `Review ${latestJob.draft_question_count}`}
                </Link>
              ) : null}
              {latestJob && ["queued", "triaging", "processing", "finalizing"].includes(latestJob.status) ? (
                <form action={adminCancelPdfImportAction}>
                  <input type="hidden" name="job_id" value={latestJob.id} />
                  <button className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700">Cancel</button>
                </form>
              ) : null}
              {latestJob?.status === "failed" || latestJob?.status === "cancelled" ? (
                <form action={adminRetryPdfImportAction}>
                  <input type="hidden" name="job_id" value={latestJob.id} />
                  <button className="rounded-full border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700">Retry</button>
                </form>
              ) : null}
              <form action={adminDeletePdfUploadAction}>
                <input type="hidden" name="pdf_id" value={pdf.id} />
                <button disabled={importActive} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">Delete</button>
              </form>
            </div>,
            <form key="meta" action={adminUpdatePdfMetadataAction} className="grid min-w-[420px] gap-2 md:grid-cols-[1fr_1fr_1fr_70px]">
              <input type="hidden" name="id" value={pdf.id} />
              <input name="subject" defaultValue={pdf.subject || ""} placeholder="AP Course" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
              <input name="unit" defaultValue={pdf.unit || ""} placeholder="Unit" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
              <input name="topic" defaultValue={pdf.topic || ""} placeholder="Topic" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
              <button className="rounded-full bg-blue-900 px-2 py-1 text-xs font-semibold text-white">Save</button>
            </form>
          ];
        })}
      />
      <PdfImportWorkspace initialJob={selectedJob} />
    </div>
  );
}
