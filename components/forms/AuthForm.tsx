"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, signInAction, type ActionState } from "@/app/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="w-full rounded-md bg-brand px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
    <form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{mode === "login" ? "Log in" : "Create account"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login"
            ? "Use your student or admin account to continue."
            : "Student accounts can start exams and read review guides immediately."}
        </p>
      </div>
      {mode === "register" ? (
        <label className="block text-sm font-medium text-slate-700">
          Full name
          <input
            name="full_name"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
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
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
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
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
          placeholder="••••••••"
        />
      </label>
      {state.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
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
  );
}
