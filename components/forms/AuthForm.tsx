"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, signInAction, type ActionState } from "@/app/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="edu-button-primary w-full px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Working..." : label}
    </button>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    mode === "login" ? signInAction : registerAction,
    {}
  );

  return (
    <form action={formAction} className="edu-panel rounded-2xl">
      <div className="edu-panel-header rounded-t-2xl px-5 py-3">{mode === "login" ? "Account access" : "Student registration"}</div>
      <div className="space-y-4 p-6">
      <div>
        <h1 className="edu-heading text-2xl">{mode === "login" ? "Log in" : "Create account"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login"
            ? "Use your student or admin account to continue."
            : "Create a student account, then confirm your email before signing in."}
        </p>
      </div>
      {mode === "register" ? (
        <label className="block text-sm font-medium text-slate-700">
          Full name
          <input
            name="full_name"
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
            placeholder="Ada Lovelace"
          />
        </label>
      ) : null}
      <label className="block text-sm font-medium text-slate-700">
        Email
        <input
          required
          type="email"
          name="email"
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
          placeholder="you@example.com"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Password
        <input
          required
          minLength={6}
          type="password"
          name="password"
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
          placeholder="••••••••"
        />
      </label>
      {state.error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
      ) : null}
      {state.message ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</div>
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
      </div>
    </form>
  );
}
