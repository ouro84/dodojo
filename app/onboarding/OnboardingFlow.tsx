"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DEFAULT_HERO_ID } from "@/lib/heroes";
import type { AggressivityLevel } from "@/types";
import OnboardingAvatarPicker from "@/components/combat/OnboardingAvatarPicker";
import { createProfile, type CreateProfileState } from "./actions";

const initialState: CreateProfileState = { error: null };

const AGGRESSIVITY_OPTIONS: Array<{ value: AggressivityLevel; name: string; description: string }> = [
  { value: "doux", name: "Doux", description: "Philosophe, zen." },
  { value: "direct", name: "Direct", description: "Franc-parler, équilibré." },
  { value: "brut", name: "Brut", description: "Arcade, sans filtre." },
];

export default function OnboardingFlow() {
  const [state, formAction, pending] = useActionState(createProfile, initialState);
  const [step, setStep] = useState<"pseudo" | "avatar" | "agressivite">("pseudo");
  const [username, setUsername] = useState("");
  const [starterId, setStarterId] = useState(DEFAULT_HERO_ID);
  const [aggressivityLevel, setAggressivityLevel] = useState<AggressivityLevel>("direct");
  const tzRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tzRef.current) {
      tzRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  const trimmed = username.trim();

  if (step === "pseudo") {
    return (
      <div className="flex w-full max-w-xs flex-col gap-4">
        <label htmlFor="username" className="text-xs uppercase tracking-wide text-faint">
          Ton pseudo de combattant
        </label>
        <input
          id="username"
          type="text"
          required
          minLength={2}
          maxLength={24}
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-xp"
        />
        <button
          type="button"
          disabled={trimmed.length < 2}
          onClick={() => setStep("avatar")}
          className="rounded-md bg-hp px-3 py-1.5 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          Continuer
        </button>
        <p className="text-xs text-faint">Ton nom. Ta rue.</p>
      </div>
    );
  }

  if (step === "avatar") {
    return (
      <div className="flex w-full max-w-xs flex-col gap-4">
        <p className="text-center text-xs uppercase tracking-wide text-faint">
          Choisis ton combattant, {trimmed}
        </p>
        <OnboardingAvatarPicker value={starterId} onChange={setStarterId} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep("pseudo")}
            className="rounded-md border border-border px-3 py-2 text-xs uppercase tracking-wide text-muted"
          >
            Retour
          </button>
          <button
            type="button"
            onClick={() => setStep("agressivite")}
            className="flex-1 rounded-md bg-hp px-3 py-1.5 font-display text-xs uppercase tracking-wide text-ink"
          >
            Continuer
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-xs flex-col gap-4">
      <input type="hidden" name="username" value={trimmed} readOnly />
      <input type="hidden" name="starterId" value={starterId} readOnly />
      <input type="hidden" name="aggressivityLevel" value={aggressivityLevel} readOnly />
      <input ref={tzRef} type="hidden" name="timezone" defaultValue="UTC" />
      <p className="text-center text-xs uppercase tracking-wide text-faint">
        Ton Volume Intérieur, {trimmed}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {AGGRESSIVITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setAggressivityLevel(option.value)}
            aria-pressed={aggressivityLevel === option.value}
            className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm ${
              aggressivityLevel === option.value ? "border-hp text-ink" : "border-border text-muted"
            }`}
          >
            <span className="font-display uppercase tracking-wide">{option.name}</span>
            <span className="text-xs text-faint">{option.description}</span>
          </button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStep("avatar")}
          className="rounded-md border border-border px-3 py-2 text-xs uppercase tracking-wide text-muted"
        >
          Retour
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-md bg-hp px-3 py-1.5 font-display text-xs uppercase tracking-wide text-ink disabled:opacity-50"
        >
          {pending ? "…" : "Entrer dans l'Arène"}
        </button>
      </div>
    </form>
  );
}
