"use client";

import { useFormState, useFormStatus } from "react-dom";
import { adminUploadPdfAction, type ActionState } from "@/app/actions";

function UploadPdfButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
      {pending ? "Uploading..." : "Upload PDF"}
    </button>
  );
}

export function PdfUploader() {
  const [state, action] = useFormState<ActionState, FormData>(adminUploadPdfAction, {});
  return (
    <form action={action} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Upload PDF</h2>
        <p className="text-sm text-slate-500">PDFs are saved for the future PDF → JSON → import workflow.</p>
      </div>
      <input required type="file" name="file" accept="application/pdf" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <div className="grid gap-3 md:grid-cols-3">
        <input name="subject" placeholder="Subject" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="unit" placeholder="Unit" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="topic" placeholder="Topic" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <UploadPdfButton />
      {state.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}
      {state.message ? <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{state.message}</p> : null}
    </form>
  );
}
