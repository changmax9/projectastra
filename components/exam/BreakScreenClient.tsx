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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_28%),#f7f8fb] px-4 py-10">
      <section className="mx-auto max-w-2xl rounded-[28px] border border-white/60 bg-white/75 p-8 text-center shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Break Time</p>
        <h1 className="mt-4 text-6xl font-semibold tabular-nums text-ink">{formatBreakTime(remaining)}</h1>
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
            className="rounded-full border border-slate-200/80 bg-white/70 px-5 py-2.5 text-sm font-medium text-slate-700 backdrop-blur-xl transition hover:bg-white/90 disabled:opacity-60"
          >
            Save & Exit
          </button>
          <button
            type="button"
            onClick={skipBreak}
            disabled={isPending}
            className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
          >
            {isPending ? "Continuing..." : "Skip Break"}
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-500">Continue when timer ends.</p>
      </section>
    </main>
  );
}
