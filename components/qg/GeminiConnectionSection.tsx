"use client";

import { useState, useTransition } from "react";
import { disconnectGemini } from "@/app/actions/oauth";

interface GeminiConnectionSectionProps {
  isConnected: boolean;
}

// US-22 : bloc "Gemini" de la section Integrations du QG - sibling de
// WebhookTokenSection (US-03) et PushReminderToggle (US-11). Contrairement
// a ces deux blocs, la CONNEXION s'initie cote Gemini ("Connected Apps"),
// pas ici : ce bloc n'affiche que l'etat + un bouton de deconnexion.
export default function GeminiConnectionSection({ isConnected }: GeminiConnectionSectionProps) {
  const [pending, startTransition] = useTransition();
  const [connected, setConnected] = useState(isConnected);
  const [error, setError] = useState<string | null>(null);

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const result = await disconnectGemini();
      if (result.error) {
        setError(result.error);
        return;
      }
      setConnected(false);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink">Gemini {connected ? "connecté" : "non connecté"}</p>
        {connected ? (
          <button
            type="button"
            disabled={pending}
            onClick={disconnect}
            className="rounded-md border border-border bg-bg px-3 py-2.5 font-display text-[10px] uppercase tracking-wide text-hp disabled:opacity-50"
          >
            Déconnecter
          </button>
        ) : (
          <span className="text-xs text-faint">Connecte-toi depuis Gemini</span>
        )}
      </div>
      {!connected && (
        <p className="text-xs text-faint">
          Dans l&apos;app Gemini : réglages puis Apps connectées puis cherche Dodojo.
        </p>
      )}
      {error && <p className="text-xs text-hp">{error}</p>}
    </div>
  );
}
