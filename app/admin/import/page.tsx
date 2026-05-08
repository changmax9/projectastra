import { JsonImportUploader } from "@/components/admin/JsonImportUploader";

export default function AdminImportPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Import structured questions</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Upload AP draft JSON or internal question JSON. The importer keeps question text, choices, formulas, and tables as structured content, and only allows cropped figures, diagrams, or visual answer choices as images.
        </p>
      </div>
      <JsonImportUploader />
    </div>
  );
}
