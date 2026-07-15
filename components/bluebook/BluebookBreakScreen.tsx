"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Coffee, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { resumeBluebookAfterBreakAction } from "@/app/actions";
import type { Submission } from "@/lib/types";
import styles from "./BluebookBreakScreen.module.css";

const BREAK_SECONDS = 10 * 60;

function formatTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.max(0, seconds) % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function BluebookBreakScreen({
  submission,
  studentName
}: {
  submission: Submission;
  studentName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const resumedRef = useRef(false);
  const startedAt = useMemo(
    () => new Date(submission.break_started_at || submission.updated_at).getTime(),
    [submission.break_started_at, submission.updated_at]
  );
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, BREAK_SECONDS - Math.floor((now - startedAt) / 1000));

  const resume = useCallback((resumedEarly: boolean) => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    startTransition(async () => {
      await resumeBluebookAfterBreakAction(submission.id, resumedEarly);
    });
  }, [submission.id]);

  useEffect(() => {
    if (remaining === 0) {
      resume(false);
      return;
    }
    const timeout = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timeout);
  }, [remaining, resume]);

  return (
    <main className={styles.app}>
      <div className={styles.brandBar}>Astra Exams</div>
      <header className={styles.header}>
        <span>Scheduled Break</span>
        <button type="button" onClick={() => router.push("/dashboard")} disabled={isPending}>
          <LogOut aria-hidden="true" /> Exit Practice
        </button>
      </header>
      <div className={styles.testStripe} />
      <section className={styles.content}>
        <Coffee aria-hidden="true" />
        <p>Break Time Remaining</p>
        <h1>{formatTime(remaining)}</h1>
        <h2>Take a Break</h2>
        <div className={styles.instructions}>
          <p>You may leave your device, but do not close it. Your next section will begin when the break ends.</p>
          <p>In this practice test, you can resume before the timer reaches zero.</p>
        </div>
        <button type="button" className={styles.resumeButton} onClick={() => resume(true)} disabled={isPending}>
          {isPending ? "Resuming..." : "Resume Testing"}
        </button>
      </section>
      <div className={styles.testStripe} />
      <footer>{studentName}</footer>
    </main>
  );
}
