"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateEmailAction, type ActionState } from "@/app/actions";

function ChangeEmailButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Sending..." : "Send change confirmation"}
    </button>
  );
}

export function EmailChangeForm({
  currentEmail,
  pendingEmail
}: {
  currentEmail: string;
  pendingEmail?: string | null;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(updateEmailAction, {});

  return (
    <form action={formAction} className="space-y-4 rounded-[28px] border border-white/60 bg-white/70 p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      <div>
        <h2 className="text-xl font-semibold text-ink">Change email</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Your current email stays active until Supabase confirms the change.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current email</p>
        <p className="mt-1 break-words text-sm font-medium text-ink">{currentEmail}</p>
      </div>

      {pendingEmail ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Pending email change: <span className="font-medium">{pendingEmail}</span>
        </div>
      ) : null}

      <label className="block text-sm font-medium text-slate-700">
        New email
        <input
          required
          type="email"
          name="new_email"
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
          placeholder="new-email@example.com"
        />
      </label>

      {state.error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
      ) : null}
      {state.message ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </div>
      ) : null}

      <div className="flex justify-end">
        <ChangeEmailButton />
      </div>
    </form>
  );
}
