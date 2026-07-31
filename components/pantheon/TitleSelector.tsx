"use client";

import { useState, useTransition } from "react";
import { ALL_ACHIEVEMENT_DEFS } from "@/lib/achievements";
import { equipTitle } from "@/app/actions/achievements";

interface TitleSelectorProps {
  unlockedCodes: string[];
  equippedCode: string | null;
}

export default function TitleSelector({ unlockedCodes, equippedCode }: TitleSelectorProps) {
  const [selected, setSelected] = useState(equippedCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unlockedTitles = ALL_ACHIEVEMENT_DEFS.filter((d) => unlockedCodes.includes(d.code));

  function handleSelect(code: string | null) {
    setError(null);
    setSelected(code);
    startTransition(async () => {
      const res = await equipTitle(code);
      if (res.error) {
        setError(res.error);
        setSelected(equippedCode);
      }
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">Titre équipé</p>
      <select
        value={selected ?? ""}
        disabled={pending}
        onChange={(event) => handleSelect(event.target.value || null)}
        className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-ink"
      >
        <option value="">Aucun</option>
        {unlockedTitles.map((def) => (
          <option key={def.code} value={def.code}>
            {def.title}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
