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
  hidden,
  onToggle,
  onFiveMinutes,
  onExpire,
  className
}: {
  initialElapsedSeconds: number;
  timeLimitMinutes: number;
  hidden: boolean;
  onToggle: () => void;
  onFiveMinutes: () => void;
  onExpire: () => void;
  className?: string;
}) {
  const mountedAtRef = useRef(Date.now());
  const fiveMinuteAlertedRef = useRef(false);
  const expiredRef = useRef(false);
  const initialRemaining = Math.max(0, timeLimitMinutes * 60 - Math.max(0, initialElapsedSeconds));
  const [remaining, setRemaining] = useState(initialRemaining);

  useEffect(() => {
    const tick = () => {
      const elapsedSinceMount = Math.floor((Date.now() - mountedAtRef.current) / 1000);
      setRemaining(Math.max(0, initialRemaining - elapsedSinceMount));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [initialRemaining]);

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
