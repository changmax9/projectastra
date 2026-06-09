"use client";

import { useFormState, useFormStatus } from "react-dom";
import { resendVerificationEmailAction, type ActionState } from "@/app/actions";

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="edu-button-secondary mt-4 px-5 py-2.5 text-sm font-medium disabled:opacity-60"
    >
      {pending ? "Sending..." : "Resend verification email"}
    </button>
  );
}

export function EmailVerificationForm() {
  const [state, formAction] = useFormState<ActionState, FormData>(resendVerificationEmailAction, {});

  return (
    <form action={formAction}>
      <ResendButton />
      {state.error ? (
        <p className="mt-3 rounded-3xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="mt-3 rounded-3xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
