"use client";

interface TomorrowBannerProps {
  count: number;
  onOpen: () => void;
}

// Issue #147 : remplace le rendu inline de TomorrowSection dans l'Arène.
// Hauteur constante (une ligne) — ne recompresse jamais TaskList, contrairement
// à l'ancien rendu inline (cf. spec).
export default function TomorrowBanner({ count, onOpen }: TomorrowBannerProps) {
  const label =
    count === 0
      ? "Demain — rien de prévu"
      : `Demain · ${count} tâche${count > 1 ? "s" : ""}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface/50 px-3 py-2 text-xs text-muted"
    >
      <span>{label}</span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
