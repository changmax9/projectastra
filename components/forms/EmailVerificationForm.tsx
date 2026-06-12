"use client";

import { useFormState, useFormStatus } from "react-dom";
import { resendVerificationEmailAction, type ActionState } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      variant="outline"
      className="mt-4"
    >
      {pending ? "Sending..." : "Resend verification email"}
    </Button>
  );
}

export function EmailVerificationForm() {
  const [state, formAction] = useFormState<ActionState, FormData>(resendVerificationEmailAction, {});

  return (
    <form action={formAction}>
      <ResendButton />
      {state.error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.message ? (
        <Alert className="mt-3 border-emerald-200 bg-emerald-50 text-emerald-800">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
