"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

export function ExamTimer({
  startedAt,
  initialElapsedSeconds = 0,
  timeLimitMinutes,
  onExpire
}: {
  startedAt: string;
  initialElapsedSeconds?: number;
  timeLimitMinutes: number;
  onExpire: () => void;
}) {
  const [mountedAt] = useState(() => Date.now());
  const totalSeconds = timeLimitMinutes * 60;
  const calculateRemaining = useCallback(
    () => {
      const elapsedSinceMount = Math.floor((Date.now() - mountedAt) / 1000);
      return Math.max(0, totalSeconds - Math.floor(initialElapsedSeconds || 0) - elapsedSinceMount);
    },
    [initialElapsedSeconds, mountedAt, totalSeconds]
  );
  const [remaining, setRemaining] = useState(() => calculateRemaining());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining(calculateRemaining());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [calculateRemaining]);

  useEffect(() => {
    if (remaining === 0) onExpire();
  }, [remaining, onExpire]);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold",
        remaining < 300 ? "bg-red-50 text-danger" : "bg-slate-100 text-ink"
      )}
    >
      <Clock className="h-4 w-4" />
      {formatDuration(remaining)}
    </div>
  );
}
