"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeBreakAction } from "@/app/actions";
import type { Submission } from "@/lib/types";

const BREAK_SECONDS = 10 * 60;

function formatBreakTime(seconds: number) {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function BreakScreenClient({ submission }: { submission: Submission }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const breakStartedAt = useMemo(
    () => new Date(submission.break_started_at || new Date().toISOString()).getTime(),
    [submission.break_started_at]
  );
  const [now, setNow] = useState(() => Date.now());
  const remaining = Math.max(0, BREAK_SECONDS - Math.floor((now - breakStartedAt) / 1000));

  useEffect(() => {
    if (remaining <= 0 && !isPending) {
      startTransition(async () => {
        await completeBreakAction(submission.id, false);
      });
      return;
    }
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [isPending, remaining, submission.id]);

  const skipBreak = () => {
    startTransition(async () => {
      await completeBreakAction(submission.id, true);
    });
  };

  return (
    <main className="edu-page px-4 py-10">
      <section className="edu-panel mx-auto max-w-2xl rounded-2xl text-center">
        <div className="edu-panel-header rounded-t-2xl px-5 py-3">Break Time</div>
        <div className="p-8">
        <h1 className="mt-2 font-mono text-7xl font-black tabular-nums text-slate-950">{formatBreakTime(remaining)}</h1>
        <p className="mt-6 leading-7 text-slate-600">
          You have completed the multiple-choice section. The free-response section will begin after the break.
          You may skip the break and continue now.
        </p>
        <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50/90 p-4 text-left text-sm leading-6 text-amber-900">
          Note: The real AP exam does not allow students to skip the scheduled break. This option is only for practice.
        </div>
        <div className="mt-7 flex flex-col-reverse justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            disabled={isPending}
            className="edu-button-secondary px-5 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            Save & Exit
          </button>
          <button
            type="button"
            onClick={skipBreak}
            disabled={isPending}
            className="edu-button-primary px-5 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {isPending ? "Continuing..." : "Skip Break"}
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-500">Continue when timer ends.</p>
        </div>
      </section>
    </main>
  );
}
