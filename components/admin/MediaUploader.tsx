"use client";

import { useFormState, useFormStatus } from "react-dom";
import { adminUploadMediaAction, type ActionState } from "@/app/actions";

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
      {pending ? "Uploading..." : "Upload image"}
    </button>
  );
}

export function MediaUploader() {
  const [state, action] = useFormState<ActionState, FormData>(adminUploadMediaAction, {});
  return (
    <form action={action} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink">Upload image</h2>
        <p className="text-sm text-slate-500">Stored in Supabase Storage when configured, otherwise in local public/uploads for MVP development.</p>
      </div>
      <input required type="file" name="file" accept="image/*" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <UploadButton />
      {state.error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}
      {state.message ? <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">{state.message}</p> : null}
    </form>
  );
}
