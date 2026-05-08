import { adminUpdatePdfMetadataAction } from "@/app/actions";
import { DataTable } from "@/components/admin/DataTable";
import { PdfUploader } from "@/components/admin/PdfUploader";
import { listPdfUploads } from "@/lib/data";
import { parsePdfToQuestions } from "@/lib/pdf";

export const dynamic = "force-dynamic";

export default async function AdminPdfsPage() {
  const pdfs = await listPdfUploads();
  await parsePdfToQuestions("placeholder-interface-check");

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
        <h2 className="font-semibold">Recommended future workflow</h2>
        <p className="mt-2">PDF 上传保存 → parse 成 JSON → 管理员预览和修改 → 导入题库。The placeholder parsePdfToQuestions(pdfUploadId) currently returns an empty array and is ready for OCR/AI integration.</p>
      </section>
      <DataTable
        headers={["File", "Subject", "Unit", "Topic", "Status", "Metadata"]}
        empty="No PDFs uploaded yet."
        rows={pdfs.map((pdf) => [
          <a key="file" href={pdf.file_url} target="_blank" className="font-medium text-brand">{pdf.file_name}</a>,
          pdf.subject || "",
          pdf.unit || "",
          pdf.topic || "",
          pdf.status,
          <form key="meta" action={adminUpdatePdfMetadataAction} className="grid min-w-[420px] gap-2 md:grid-cols-[1fr_1fr_1fr_70px]">
            <input type="hidden" name="id" value={pdf.id} />
            <input name="subject" defaultValue={pdf.subject || ""} placeholder="Subject" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input name="unit" defaultValue={pdf.unit || ""} placeholder="Unit" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input name="topic" defaultValue={pdf.topic || ""} placeholder="Topic" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <button className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white">Save</button>
          </form>
        ])}
      />
    </div>
  );
}
