"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateEmailAction, type ActionState } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ChangeEmailButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="rounded-full bg-astra-navy text-white hover:bg-astra-blue"
    >
      {pending ? "Sending..." : "Send change confirmation"}
    </Button>
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
    <Card className="glass-panel rounded-[1.75rem]">
      <div className="rounded-t-[1.75rem] border-b border-white/55 bg-white/28 px-5 py-3 font-mono text-xs font-black uppercase tracking-[0.18em] text-astra-blue">Email change</div>
      <form action={formAction}>
        <CardHeader>
          <CardTitle className="text-base">Change email</CardTitle>
          <CardDescription>Your current email stays active until Supabase confirms the change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[1.25rem] border border-white/70 bg-white/78 px-4 py-3 shadow-inner">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current email</p>
            <p className="mt-1 break-words text-sm font-medium text-ink">{currentEmail}</p>
          </div>

          {pendingEmail ? (
            <Badge variant="outline" className="w-fit border-amber-200 bg-amber-50 text-amber-800">
              Pending email change: {pendingEmail}
            </Badge>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="new_email">New email</Label>
            <Input id="new_email" required type="email" name="new_email" placeholder="new-email@example.com" className="rounded-full border-white/70 bg-white/82" />
          </div>

          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {state.message ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end">
            <ChangeEmailButton />
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
