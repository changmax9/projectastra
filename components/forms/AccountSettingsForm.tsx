"use client";

import { useFormState, useFormStatus } from "react-dom";
import { updateAccountSettingsAction, type ActionState } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="rounded-full bg-astra-navy text-white hover:bg-astra-blue"
    >
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}

export function AccountSettingsForm({
  fullName
}: {
  fullName: string;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(updateAccountSettingsAction, {});

  return (
    <Card className="glass-panel rounded-[1.75rem]">
      <div className="rounded-t-[1.75rem] border-b border-white/55 bg-white/28 px-5 py-3 font-mono text-xs font-black uppercase tracking-[0.18em] text-astra-blue">Profile details</div>
      <form action={formAction}>
        <CardHeader>
          <CardTitle className="text-base">Display profile</CardTitle>
          <CardDescription>Update the public details attached to your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="full_name">Display name</Label>
            <Input id="full_name" name="full_name" defaultValue={fullName} placeholder="Your name" className="rounded-full border-white/70 bg-white/82" />
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
            <SaveButton />
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
