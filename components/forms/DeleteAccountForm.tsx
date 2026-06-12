"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { deleteAccountAction, type ActionState } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DangerZonePanel } from "@/components/ui-custom/DangerZonePanel";

function DeleteSubmitButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={!canSubmit || pending}
      variant="destructive"
      className="rounded-full"
    >
      {pending ? "Deleting..." : "Permanently delete account"}
    </Button>
  );
}

export function DeleteAccountForm({ isAdmin }: { isAdmin: boolean }) {
  const [state, formAction] = useFormState<ActionState, FormData>(deleteAccountAction, {});
  const [confirmation, setConfirmation] = useState("");
  const canSubmit = useMemo(() => confirmation === "DELETE" && !isAdmin, [confirmation, isAdmin]);

  return (
    <DangerZonePanel title="Delete account">
        <span className="sr-only">Danger Zone</span>
        <div className="space-y-1 text-sm leading-6 text-rose-800">
          <p>Deleting your account is permanent.</p>
          <p>Your profile and account access will be removed.</p>
          <p>This action cannot be undone.</p>
        </div>

        {isAdmin ? (
          <Alert className="mt-5 border-rose-200 bg-white/80 text-rose-700">
            <AlertDescription>Admin accounts cannot be deleted from this page.</AlertDescription>
          </Alert>
        ) : (
          <form action={formAction} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current_password" className="text-rose-950">
                Current password
              </Label>
              <Input
                id="current_password"
                required
                type="password"
                name="current_password"
                className="rounded-full border-rose-200 bg-white focus-visible:ring-rose-300"
                placeholder="Enter your current password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="delete_confirmation" className="text-rose-950">
                Type DELETE to confirm
              </Label>
              <Input
                id="delete_confirmation"
                required
                name="delete_confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="rounded-full border-rose-200 bg-white focus-visible:ring-rose-300"
                placeholder="DELETE"
              />
            </div>

            {state.error ? (
              <Alert variant="destructive" className="bg-white">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            {state.message ? (
              <Alert className="border-emerald-200 bg-white text-emerald-700">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end">
              <DeleteSubmitButton canSubmit={canSubmit} />
            </div>
          </form>
        )}
    </DangerZonePanel>
  );
}
