"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, signInAction, type ActionState } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormPanel } from "@/components/ui-custom/FormPanel";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-astra-navy text-white shadow-[0_18px_36px_-26px_rgba(6,18,37,0.9)] hover:bg-astra-blue"
      size="lg"
    >
      {pending ? "Working..." : label}
    </Button>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    mode === "login" ? signInAction : registerAction,
    {}
  );
  const description =
    mode === "login"
      ? "Use your student or admin account to continue."
      : "Create a student account, then confirm your email before signing in.";

  return (
    <FormPanel
      title={<span className="text-2xl font-black tracking-tight">{mode === "login" ? "Log in" : "Create account"}</span>}
      description={description}
      className="border-astra-gold/25"
    >
      <form action={formAction} className="flex flex-col gap-4">
        {mode === "register" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" name="full_name" placeholder="Ada Lovelace" />
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" required type="email" name="email" placeholder="you@example.com" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" required minLength={6} type="password" name="password" placeholder="••••••••" />
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
        <SubmitButton label={mode === "login" ? "Log in" : "Register"} />
        <p className="text-center text-sm text-slate-500">
          {mode === "login" ? (
            <>
              New here?{" "}
              <Link className="font-medium text-brand" href="/register">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link className="font-medium text-brand" href="/login">
                Log in
              </Link>
            </>
          )}
        </p>
      </form>
    </FormPanel>
  );
}
