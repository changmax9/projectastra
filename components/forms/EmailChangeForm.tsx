"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateEmailAction, type ActionState } from "@/app/actions";

function ChangeEmailButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="edu-button-primary px-5 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
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
    <form action={formAction} className="edu-panel rounded-2xl">
      <div className="edu-panel-header rounded-t-2xl px-5 py-3">Email change</div>
      <div className="space-y-4 p-6">
      <div>
        <h2 className="font-semibold text-slate-950">Change email</h2>
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
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
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
      </div>
    </form>
  );
}
