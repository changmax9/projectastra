"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { registerAction, signInAction, type ActionState } from "@/app/actions";
import styles from "./AuthForm.module.css";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={styles.submit} aria-busy={pending}>
      {pending ? (label === "Sign In" ? "Signing In..." : "Creating Account...") : label}
    </button>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, formAction] = useFormState<ActionState, FormData>(
    mode === "login" ? signInAction : registerAction,
    {}
  );

  return (
    <section className={styles.formPanel}>
      <header className={styles.formHeader}>
        <h2>{mode === "login" ? "Sign In" : "Create Account"}</h2>
        <p>{mode === "login" ? "Use your Astra student or administrator account." : "Register a student account for timed AP practice."}</p>
      </header>
      <form action={formAction} className={styles.form}>
        {mode === "register" ? (
          <div className={styles.field}>
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" name="full_name" autoComplete="name" placeholder="Ada Lovelace" />
          </div>
        ) : null}
        <div className={styles.field}>
          <label htmlFor="email">Email address</label>
          <input id="email" required type="email" name="email" autoComplete="email" placeholder="you@example.com" />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input id="password" required minLength={6} type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </div>
        {state.error ? <div className={styles.alert} role="alert">{state.error}</div> : null}
        {state.message ? <div className={`${styles.alert} ${styles.success}`} role="status">{state.message}</div> : null}
        <SubmitButton label={mode === "login" ? "Sign In" : "Create Account"} />
        <p className={styles.switch}>
          {mode === "login" ? (
            <>New to Astra? <Link href="/register">Create an account</Link></>
          ) : (
            <>Already registered? <Link href="/login">Sign in</Link></>
          )}
        </p>
        {mode === "login" ? <p className={styles.help}>Having trouble signing in? Check the email and password for your Astra account.</p> : null}
      </form>
    </section>
  );
}
