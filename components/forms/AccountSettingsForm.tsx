"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateAccountSettingsAction, type ActionState } from "@/app/actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="edu-button-primary px-5 py-2.5 text-sm font-medium disabled:opacity-60"
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
    <form action={formAction} className="edu-panel rounded-2xl">
      <div className="edu-panel-header rounded-t-2xl px-5 py-3">Profile details</div>
      <div className="space-y-5 p-6">
      <div>
        <h2 className="font-semibold text-slate-950">Display profile</h2>
        <p className="mt-1 text-sm text-slate-500">Update the public details attached to your account.</p>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Display name
        <input
          name="full_name"
          defaultValue={fullName}
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
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
      </div>
    </form>
  );
}
