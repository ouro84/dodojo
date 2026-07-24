"use client";

// US-29 : coach du 1er combat, non bloquant, en surimpression basse de l'Arène.
// L'utilisateur peut agir pendant qu'il est affiché. « Passer » (A2) le clôt.
interface ArenaCoachProps {
  step: "add" | "strike";
  onSuggest: () => void;
  onSkip: () => void;
}

export default function ArenaCoach({ step, onSuggest, onSkip }: ArenaCoachProps) {
  return (
    <div
      role="status"
      className="pointer-events-none sticky bottom-3 z-40 mx-auto flex w-full max-w-md justify-center px-4"
    >
      <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 text-center">
        {step === "add" ? (
          <>
            <p className="text-sm text-ink">
              Ajoute ta première tâche — tout ce qui traîne nourrit le Boss du jour.
            </p>
            <button
              type="button"
              onClick={onSuggest}
              className="rounded-md border border-hp px-4 py-2 font-display text-xs uppercase tracking-wide text-hp-text"
            >
              ⚡ Prendre en main Dodojo
            </button>
          </>
        ) : (
          <p className="text-sm text-ink">
            Regarde, il vient de grandir. Coche la tâche pour le frapper : dégâts au Boss + XP pour toi.
          </p>
        )}
        <button
          type="button"
          onClick={onSkip}
          className="text-[11px] text-faint underline underline-offset-2"
        >
          Passer
        </button>
      </div>
    </div>
  );
}
