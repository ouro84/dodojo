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
      className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-lg border border-gold bg-surface p-4 text-center shadow-lg">
        {step === "add" ? (
          <>
            <p className="text-sm text-ink">
              Ajoute ta première tâche pour défier le Boss du jour.
            </p>
            <button
              type="button"
              onClick={onSuggest}
              className="rounded-md border border-gold px-4 py-2 font-display text-xs uppercase tracking-wide text-gold"
            >
              ⚡ Prendre en main Dodojo
            </button>
          </>
        ) : (
          <p className="text-sm text-ink">
            Coche-la pour frapper : dégâts au Boss + XP pour toi.
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
