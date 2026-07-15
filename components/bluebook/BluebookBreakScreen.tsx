"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { resumeBluebookAfterBreakAction } from "@/app/actions";
import { AstraLogo } from "@/components/brand/AstraLogo";
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
  const [isPending, startTransition] = useTransition();
  const startedAt = useMemo(
    () => new Date(submission.break_started_at || submission.updated_at).getTime(),
    [submission.break_started_at, submission.updated_at]
  );
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, BREAK_SECONDS - Math.floor((now - startedAt) / 1000));

  useEffect(() => {
    if (remaining === 0) return undefined;
    const timeout = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timeout);
  }, [remaining]);

  function resume() {
    startTransition(async () => {
      await resumeBluebookAfterBreakAction(submission.id);
    });
  }

  return (
    <main className={styles.app} data-ud-check="scheduled-break-screen">
      <header className={styles.header}>
        <span className={styles.brand}><AstraLogo /> <strong>Astra Exams</strong></span>
        <span>Scheduled Break</span>
      </header>
      <section className={styles.content}>
        <div className={styles.timerPanel}>
          <p>Remaining Break Time</p>
          <strong>{formatTime(remaining)}</strong>
        </div>
        <div className={styles.instructions}>
          <p className={styles.eyebrow}>Multiple Choice Complete</p>
          <h1>Take a Break. Keep This Device Open.</h1>
          <p>Free response begins after the scheduled break. The resume button will appear when the timer reaches zero.</p>
          <h2>During the break:</h2>
          <ol>
            <li>Do not close this tab or sign out of Astra Exams.</li>
            <li>Keep your scratch paper and testing materials at your workspace.</li>
            <li>Do not review questions or discuss the test with anyone.</li>
          </ol>
          {remaining === 0 ? (
            <button type="button" className={styles.resumeButton} onClick={resume} disabled={isPending}>
              {isPending ? "Resuming..." : "Resume Testing Now"}
              {!isPending ? <ChevronRight aria-hidden="true" /> : null}
            </button>
          ) : (
            <p className={styles.lockedMessage} aria-live="polite">Testing stays locked until the break ends.</p>
          )}
        </div>
      </section>
      <footer>{studentName}</footer>
    </main>
  );
}
