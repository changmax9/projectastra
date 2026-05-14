"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { deleteAccountAction, type ActionState } from "@/app/actions";

function DeleteSubmitButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!canSubmit || pending}
      className="rounded-full border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Deleting..." : "Permanently delete account"}
    </button>
  );
}

export function DeleteAccountForm({ isAdmin }: { isAdmin: boolean }) {
  const [state, formAction] = useFormState<ActionState, FormData>(deleteAccountAction, {});
  const [confirmation, setConfirmation] = useState("");
  const canSubmit = useMemo(() => confirmation === "DELETE" && !isAdmin, [confirmation, isAdmin]);

  return (
    <section className="rounded-[28px] border border-rose-200/80 bg-rose-50/80 p-6 shadow-[0_20px_60px_-35px_rgba(190,18,60,0.35)] backdrop-blur-xl">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-rose-600">Danger Zone</p>
        <h2 className="mt-2 text-xl font-semibold text-rose-950">Delete account</h2>
        <div className="mt-3 space-y-1 text-sm leading-6 text-rose-800">
          <p>Deleting your account is permanent.</p>
          <p>Your profile and account access will be removed.</p>
          <p>This action cannot be undone.</p>
        </div>
      </div>

      {isAdmin ? (
        <div className="mt-5 rounded-3xl border border-rose-200 bg-white/80 px-4 py-3 text-sm font-medium text-rose-700">
          Admin accounts cannot be deleted from this page.
        </div>
      ) : (
        <form action={formAction} className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-rose-950">
            Current password
            <input
              required
              type="password"
              name="current_password"
              className="mt-1 w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              placeholder="Enter your current password"
            />
          </label>

          <label className="block text-sm font-medium text-rose-950">
            Type DELETE to confirm
            <input
              required
              name="delete_confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              placeholder="DELETE"
            />
          </label>

          {state.error ? (
            <div className="rounded-3xl border border-red-200 bg-white px-3 py-2 text-sm text-red-700">{state.error}</div>
          ) : null}
          {state.message ? (
            <div className="rounded-3xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-700">
              {state.message}
            </div>
          ) : null}

          <div className="flex justify-end">
            <DeleteSubmitButton canSubmit={canSubmit} />
          </div>
        </form>
      )}
    </section>
  );
}
