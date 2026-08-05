"use client";

import { useState, useTransition } from "react";
import { updateUsername } from "@/app/actions/profile";

interface UsernameSectionProps {
  initialUsername: string;
}

const MAX_LENGTH = 24;

// Issue #69 : édition du pseudo, jusqu'ici fixé une seule fois à l'onboarding.
// Save explicite (pas de save-on-blur) pour laisser le temps de corriger une
// faute de frappe avant l'appel serveur.
export default function UsernameSection({ initialUsername }: UsernameSectionProps) {
  const [username, setUsername] = useState(initialUsername);
  const [saved, setSaved] = useState(initialUsername);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Un pseudo, ça se choisit. Tape quelque chose.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateUsername(trimmed);
      if (result.error) {
        setError(result.error);
        setUsername(saved);
      } else {
        setSaved(trimmed);
        setUsername(trimmed);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="profil-username" className="text-xs text-muted">
        Pseudo
      </label>
      <div className="flex items-center gap-2">
        <input
          id="profil-username"
          type="text"
          value={username}
          maxLength={MAX_LENGTH}
          disabled={isPending}
          onChange={(event) => setUsername(event.target.value)}
          className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-sm text-ink disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || username.trim() === saved}
          className="rounded bg-hp px-3 py-1 text-xs uppercase tracking-wide text-ink disabled:opacity-40"
        >
          Enregistrer
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
