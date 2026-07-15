import Link from "next/link";
import { Check } from "lucide-react";
import { AstraLogo } from "@/components/brand/AstraLogo";
import styles from "./BluebookCompletionScreen.module.css";

export function BluebookCompletionScreen({
  examTitle,
  submissionId
}: {
  examTitle: string;
  submissionId: string;
}) {
  return (
    <main className={styles.page} data-ud-check="test-completion">
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.brand} aria-label="Astra Exams home">
          <AstraLogo className={styles.logo} />
          <span>Astra Exams</span>
        </Link>
      </header>

      <section className={styles.content} aria-labelledby="completion-title">
        <span className={styles.successMark} aria-hidden="true">
          <Check />
        </span>
        <p className={styles.eyebrow}>Submission Complete</p>
        <h1 id="completion-title">Your practice test has been submitted.</h1>
        <p className={styles.description}>
          Your answers are saved and the timed session for <strong>{examTitle}</strong> is complete.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href={`/results/${submissionId}`}>
            View Results
          </Link>
          <Link className={styles.secondaryAction} href="/dashboard">
            Return Home
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Independent AP practice</span>
        <span>It is now safe to leave this page.</span>
      </footer>
    </main>
  );
}
