"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, CircleHelp, Home } from "lucide-react";
import { launchBluebookPracticeAction } from "@/app/actions";
import { AstraLogo } from "@/components/brand/AstraLogo";
import styles from "./BluebookExamSetup.module.css";

function LaunchButton({ inProgress }: { inProgress: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={styles.launch} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Opening Test..." : inProgress ? "Resume Testing" : "Start Test"}
      {!pending ? <ChevronRight aria-hidden="true" /> : null}
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
  const [step, setStep] = useState<1 | 2>(1);
  const ready = checks.every(Boolean);

  function setCheck(index: number, value: boolean) {
    setChecks((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  function reset() {
    setChecks([false, false, false]);
    setStep(1);
  }

  return (
    <Dialog.Root onOpenChange={(open) => !open && reset()}>
      <Dialog.Trigger asChild>
        <button className={styles.trigger} type="button">{inProgress ? "Resume Testing" : "Start Test"}</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} data-ud-check="exam-setup-dialog">
          <header className={styles.header}>
            <Link href="/review" className={styles.utilityLink}>
              <CircleHelp aria-hidden="true" /> <span>Help</span>
            </Link>
            <span className={styles.brand}><AstraLogo /> <strong>Astra Exams</strong></span>
            <Dialog.Close className={styles.utilityLink} aria-label="Return to test overview">
              <span>Return to Test Overview</span> <Home aria-hidden="true" />
            </Dialog.Close>
          </header>

          <form action={launchBluebookPracticeAction} className={styles.form}>
            <input type="hidden" name="exam_id" value={examId} />
            <div className={styles.body} data-step={step}>
              {step === 1 ? (
                <section className={styles.stage}>
                  <p className={styles.eyebrow}>{inProgress ? "Resume Check" : "Practice Readiness"}</p>
                  <Dialog.Title>Before You Start</Dialog.Title>
                  <Dialog.Description>
                    Confirm your device and workspace are ready for one continuous test with timed sections.
                  </Dialog.Description>
                  <div className={styles.checklist}>
                    <label className={styles.check}>
                      <input type="checkbox" checked={checks[0]} onChange={(event) => setCheck(0, event.target.checked)} />
                      <span><strong>My device is ready.</strong><span>It is connected to power and has a stable internet connection.</span></span>
                    </label>
                    <label className={styles.check}>
                      <input type="checkbox" checked={checks[1]} onChange={(event) => setCheck(1, event.target.checked)} />
                      <span><strong>My workspace is ready.</strong><span>I have scratch paper and will not be interrupted during a timed section.</span></span>
                    </label>
                    <label className={styles.check}>
                      <input type="checkbox" checked={checks[2]} onChange={(event) => setCheck(2, event.target.checked)} />
                      <span><strong>I understand the section rules.</strong><span>I can review within a section, but I cannot return after moving on.</span></span>
                    </label>
                  </div>
                  {!ready ? <p className={styles.disabledReason}>Complete all three checks to continue.</p> : null}
                </section>
              ) : (
                <section className={`${styles.stage} ${styles.readyStage}`}>
                  <p className={styles.eyebrow}>{inProgress ? "Ready to Resume" : "Ready to Begin"}</p>
                  <Dialog.Title>{title}</Dialog.Title>
                  <Dialog.Description>
                    {inProgress
                      ? "Your saved place and responses are ready. The active section timer continues when the test opens."
                      : "The timer begins when the first section opens. Read the section directions before answering."}
                  </Dialog.Description>
                  <div className={styles.summary} aria-label="Test summary">
                    <div><strong>{timeMinutes} min</strong><span>Total testing time</span></div>
                    <div><strong>{questionCount}</strong><span>Questions</span></div>
                    <div><strong>{sectionCount}</strong><span>Section{sectionCount === 1 ? "" : "s"}</span></div>
                  </div>
                  <div className={styles.startNotice}>
                    <strong>One test, one scheduled break.</strong>
                    <span>The test continues through every section, with the break between multiple choice and free response.</span>
                  </div>
                </section>
              )}
            </div>

            <footer className={styles.footer}>
              {step === 2 ? (
                <button className={styles.back} type="button" onClick={() => setStep(1)}>
                  <ChevronLeft aria-hidden="true" /> Back
                </button>
              ) : (
                <Dialog.Close className={styles.back} type="button">
                  <ChevronLeft aria-hidden="true" /> Back
                </Dialog.Close>
              )}
              <div className={styles.progress} aria-label={`Step ${step} of 2`}>
                <span>Step {step} of 2</span>
                <div><i style={{ width: `${step * 50}%` }} /></div>
              </div>
              {step === 1 ? (
                <button className={styles.next} type="button" onClick={() => setStep(2)} disabled={!ready}>
                  Next <ChevronRight aria-hidden="true" />
                </button>
              ) : (
                <LaunchButton inProgress={inProgress} />
              )}
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
