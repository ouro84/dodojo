"use client";

import { useState } from "react";
import { technicalErrorLine } from "@/lib/copy/errors";
import { randomSeed } from "@/lib/copy/variant";
import BottomNav from "@/components/ui/BottomNav";

export default function EntrainementError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [seed] = useState(randomSeed);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <p role="alert" className="max-w-[32ch] text-sm text-hp-text">
        {technicalErrorLine("sparring", seed)}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-alert px-4 py-2 font-display text-xs uppercase tracking-wide text-alert-ink"
      >
        Réessayer
      </button>
      <BottomNav active="qg" />
    </main>
  );
}
