"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { ALL_ACHIEVEMENT_DEFS } from "@/lib/achievements";
import { equipTitle } from "@/app/actions/achievements";

interface TitleSelectorProps {
  unlockedCodes: string[];
  equippedCode: string | null;
}

const NONE_KEY = "__none__";

// Issue #140 : remplace le <select> HTML natif (rendu navigateur par défaut,
// casse l'immersion pixel-art) par un vrai radiogroup ARIA — tabIndex
// roving, flèches Haut/Bas pour naviguer ET sélectionner (comportement
// natif d'un groupe de radios), Entrée/Espace via la sémantique native du
// <button>.
export default function TitleSelector({ unlockedCodes, equippedCode }: TitleSelectorProps) {
  const [selected, setSelected] = useState(equippedCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const unlockedTitles = ALL_ACHIEVEMENT_DEFS.filter((d) => unlockedCodes.includes(d.code));
  const options: Array<{ code: string | null; label: string }> = [
    { code: null, label: "Aucun" },
    ...unlockedTitles.map((def) => ({ code: def.code, label: def.title })),
  ];
  const selectedIndex = options.findIndex((option) => option.code === selected);
  const focusedIndex = selectedIndex === -1 ? 0 : selectedIndex;

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

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (index + delta + options.length) % options.length;
    optionRefs.current[nextIndex]?.focus();
    handleSelect(options[nextIndex].code);
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <p id="title-selector-label" className="font-display text-xs uppercase tracking-wide text-muted">
        Titre équipé
      </p>
      <div role="radiogroup" aria-labelledby="title-selector-label" className="flex flex-col gap-1">
        {options.map((option, index) => {
          const isSelected = selected === option.code;
          return (
            <button
              key={option.code ?? NONE_KEY}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={index === focusedIndex ? 0 : -1}
              disabled={pending}
              onClick={() => handleSelect(option.code)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`rounded-md border px-2 py-1.5 text-left text-xs disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-hp/20 ${
                isSelected ? "border-hp text-ink" : "border-border text-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
