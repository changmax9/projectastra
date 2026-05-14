"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateAccountSettingsAction, type ActionState } from "@/app/actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save changes"}
    </button>
  );
}

export function AccountSettingsForm({
  fullName
}: {
  fullName: string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(updateAccountSettingsAction, {});

  return (
    <form action={formAction} className="space-y-5 rounded-[28px] border border-white/60 bg-white/70 p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      <div>
        <h2 className="text-xl font-semibold text-ink">Profile details</h2>
        <p className="mt-1 text-sm text-slate-500">Update the public details attached to your account.</p>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Display name
        <input
          name="full_name"
          defaultValue={fullName}
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
          placeholder="Your name"
        />
      </label>

      {state.error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
      ) : null}
      {state.message ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</div>
      ) : null}

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}
