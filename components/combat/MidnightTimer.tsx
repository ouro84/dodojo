"use client";

import { useEffect, useState } from "react";

function formatRemainingUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  const totalMinutes = Math.max(
    0,
    Math.floor((midnight.getTime() - now.getTime()) / 60_000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function MidnightTimer() {
  const [label, setLabel] = useState(() => formatRemainingUntilMidnight());

  useEffect(() => {
    const timer = setInterval(() => {
      setLabel(formatRemainingUntilMidnight());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span
      className="rounded-md border border-alert/50 bg-black/40 px-2 py-0.5 font-display text-xl tabular-nums text-alert drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
      aria-label={`Temps restant avant minuit : ${label}`}
    >
      {label}
    </span>
  );
}
