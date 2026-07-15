"use client";

import { useEffect, useRef, useState } from "react";

function formatTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.max(0, seconds) % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
export function BluebookTimer({
  initialElapsedSeconds,
  timeLimitMinutes,
  storageKey,
  hidden,
  onToggle,
  onFiveMinutes,
  onExpire,
  className
}: {
  initialElapsedSeconds: number;
  timeLimitMinutes: number;
  storageKey: string;
  hidden: boolean;
  onToggle: () => void;
  onFiveMinutes: () => void;
  onExpire: () => void;
  className?: string;
}) {
  const mountedAtRef = useRef(Date.now());
  const elapsedBaselineRef = useRef(Math.max(0, initialElapsedSeconds));
  const fiveMinuteAlertedRef = useRef(false);
  const expiredRef = useRef(false);
  const timeLimitSeconds = timeLimitMinutes * 60;
  const initialRemaining = Math.max(0, timeLimitSeconds - Math.max(0, initialElapsedSeconds));
  const [remaining, setRemaining] = useState(initialRemaining);

  useEffect(() => {
    const storedElapsed = Number(window.sessionStorage.getItem(storageKey) || "0");
    elapsedBaselineRef.current = Math.max(
      0,
      initialElapsedSeconds,
      Number.isFinite(storedElapsed) ? storedElapsed : 0
    );
    mountedAtRef.current = Date.now();

    const tick = () => {
      const elapsedSinceMount = Math.floor((Date.now() - mountedAtRef.current) / 1000);
      const elapsed = Math.min(timeLimitSeconds, elapsedBaselineRef.current + elapsedSinceMount);
      window.sessionStorage.setItem(storageKey, String(elapsed));
      setRemaining(Math.max(0, timeLimitSeconds - elapsed));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [initialElapsedSeconds, storageKey, timeLimitSeconds]);

  useEffect(() => {
    if (remaining <= 300 && remaining > 0 && !fiveMinuteAlertedRef.current) {
      fiveMinuteAlertedRef.current = true;
      onFiveMinutes();
    }
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
    }
  }, [onExpire, onFiveMinutes, remaining]);

  return (
    <div className={className} aria-live={remaining <= 300 ? "assertive" : "off"}>
      <strong>{hidden && remaining > 300 ? "Time Remaining" : formatTime(remaining)}</strong>
      <button type="button" onClick={onToggle} disabled={remaining <= 300}>
        {hidden && remaining > 300 ? "Show" : "Hide"}
      </button>
    </div>
  );
}
