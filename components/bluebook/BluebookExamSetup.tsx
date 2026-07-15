"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { launchBluebookPracticeAction } from "@/app/actions";
import styles from "./BluebookExamSetup.module.css";

function LaunchButton({ ready, inProgress }: { ready: boolean; inProgress: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={styles.launch} type="submit" disabled={!ready || pending} aria-busy={pending}>
      {pending ? "Opening Test..." : inProgress ? "Resume Testing" : "Start Test"}
    </button>
  );
}

export function BluebookExamSetup({
  examId,
  title,
  timeMinutes,
  questionCount,
  sectionCount,
  inProgress
}: {
  examId: string;
  title: string;
  timeMinutes: number;
  questionCount: number;
  sectionCount: number;
  inProgress: boolean;
}) {
  const [checks, setChecks] = useState([false, false, false]);
  const ready = checks.every(Boolean);

  function setCheck(index: number, value: boolean) {
    setChecks((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  return (
    <Dialog.Root onOpenChange={(open) => !open && setChecks([false, false, false])}>
      <Dialog.Trigger asChild>
        <button className={styles.trigger} type="button">{inProgress ? "Resume Testing" : "Start Test"}</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} data-ud-check="exam-setup-dialog">
          <header className={styles.header}>
            <Dialog.Title>{inProgress ? "Resume Practice Test" : "Exam Setup"}</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close exam setup"><X aria-hidden="true" /></Dialog.Close>
          </header>
          <form action={launchBluebookPracticeAction}>
            <input type="hidden" name="exam_id" value={examId} />
            <div className={styles.body}>
              <Dialog.Description>
                {inProgress
                  ? `Confirm your testing workspace before returning to ${title}.`
                  : `Complete these checks before beginning ${title}. The timer starts after the directions screen.`}
              </Dialog.Description>
              <div className={styles.summary} aria-label="Test summary">
                <div><strong>{timeMinutes} min</strong><span>Total time</span></div>
                <div><strong>{questionCount}</strong><span>Questions</span></div>
                <div><strong>{sectionCount}</strong><span>Section{sectionCount === 1 ? "" : "s"}</span></div>
              </div>
              <section className={styles.checklist}>
                <h3>Before You Start</h3>
                <label className={styles.check}>
                  <input type="checkbox" checked={checks[0]} onChange={(event) => setCheck(0, event.target.checked)} />
                  <span><strong>My device is connected to power.</strong><span>A full-length test may keep this screen active for an extended period.</span></span>
                </label>
                <label className={styles.check}>
                  <input type="checkbox" checked={checks[1]} onChange={(event) => setCheck(1, event.target.checked)} />
                  <span><strong>My workspace is ready.</strong><span>I have scratch paper and will not be interrupted during a timed section.</span></span>
                </label>
                <label className={styles.check}>
                  <input type="checkbox" checked={checks[2]} onChange={(event) => setCheck(2, event.target.checked)} />
                  <span><strong>I understand section submission is final.</strong><span>After submitting a section, I cannot return to its questions.</span></span>
                </label>
              </section>
            </div>
            <footer className={styles.footer}>
              <Dialog.Close className={styles.cancel} type="button">Cancel</Dialog.Close>
              {!ready ? <span className={styles.disabledReason}>Complete all three checks to continue.</span> : <span />}
              <LaunchButton ready={ready} inProgress={inProgress} />
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
