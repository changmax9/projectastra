import Link from "next/link";
import { adminStartPdfImportAction, adminUpdatePdfMetadataAction } from "@/app/actions";
import { DataTable } from "@/components/admin/DataTable";
import { PdfImportWorkspace } from "@/components/admin/PdfImportWorkspace";
import { PdfUploader } from "@/components/admin/PdfUploader";
import { getPdfImportJobDetails, getPdfImportSchemaStatus, listPdfImportJobs, listPdfUploads } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AdminPdfsPage({ searchParams }: { searchParams?: { import_error?: string; job_id?: string } }) {
  const [pdfs, jobs, importSchemaStatus] = await Promise.all([
    listPdfUploads(),
    listPdfImportJobs(),
    getPdfImportSchemaStatus()
  ]);
  const latestJobByPdf = new Map(jobs.map((job) => [job.pdf_upload_id, job]));
  const selectedJobId = searchParams?.job_id || jobs[0]?.id || "";
  const selectedJob = selectedJobId ? await getPdfImportJobDetails(selectedJobId) : null;
  const showMissingSchemaWarning = !importSchemaStatus.available || searchParams?.import_error === "schema_missing";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-ink">PDF uploads</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          MVP saves PDFs and metadata. Do not write PDF content directly into the question bank. The intended flow is PDF upload → AI/OCR parse to JSON → admin preview/edit → question import → exam creation.
        </p>
      </div>
      <PdfUploader />
      <section className="rounded-lg border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
        <h2 className="font-semibold">PDF import safety</h2>
        <p className="mt-2">PDF 上传保存 → async text/OCR analysis → same-page draft review → 管理员预览和修改 → save as draft question. Imported questions are never published directly.</p>
      </section>
      {showMissingSchemaWarning ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <h2 className="font-semibold">PDF import setup needed</h2>
          <p className="mt-2">
            Supabase is connected, but the PDF import tables are not available in this project yet. Existing PDF uploads
            still work, but OCR analysis is disabled until <code className="rounded bg-amber-100 px-1">supabase/migrations/008_pdf_import_pipeline.sql</code> is applied.
          </p>
        </section>
      ) : null}
      <DataTable
        headers={["File", "Subject", "Unit", "Topic", "Status", "Import", "Metadata"]}
        empty="No PDFs uploaded yet."
        rows={pdfs.map((pdf) => {
          const latestJob = latestJobByPdf.get(pdf.id);
          return [
            <a key="file" href={pdf.file_url} target="_blank" className="font-medium text-brand">{pdf.file_name}</a>,
            pdf.subject || "",
            pdf.unit || "",
            pdf.topic || "",
            pdf.status,
            <div key="import" className="flex min-w-[220px] flex-wrap gap-2">
              <form action={adminStartPdfImportAction}>
                <input type="hidden" name="pdf_id" value={pdf.id} />
                <button
                  disabled={!importSchemaStatus.available}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Analyze PDF
                </button>
              </form>
              {latestJob ? (
                <Link
                  href={`/admin/pdfs?job_id=${latestJob.id}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Review {latestJob.draft_question_count}
                </Link>
              ) : null}
            </div>,
            <form key="meta" action={adminUpdatePdfMetadataAction} className="grid min-w-[420px] gap-2 md:grid-cols-[1fr_1fr_1fr_70px]">
              <input type="hidden" name="id" value={pdf.id} />
              <input name="subject" defaultValue={pdf.subject || ""} placeholder="AP Course" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
              <input name="unit" defaultValue={pdf.unit || ""} placeholder="Unit" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
              <input name="topic" defaultValue={pdf.topic || ""} placeholder="Topic" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
              <button className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white">Save</button>
            </form>
          ];
        })}
      />
      <PdfImportWorkspace initialJob={selectedJob} />
    </div>
  );
}
