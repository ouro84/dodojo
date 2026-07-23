"use client";

import { useEffect } from "react";
import { usePwaUpdatePrompt } from "@/hooks/usePwaUpdatePrompt";
import { initUpdatePrompt } from "@/lib/pwa/update-prompt-client";

// Détecte un service worker "waiting" (nouvelle version déployée sur
// `main`, cf. déploiement auto Vercel — CLAUDE.md) et propose de recharger.
// Sans ça, un onglet resté ouvert reste bloqué sur l'app-shell caché de
// l'ancien déploiement.
export default function UpdateToast() {
  useEffect(() => {
    initUpdatePrompt();
  }, []);

  const { updateAvailable, reloadForUpdate } = usePwaUpdatePrompt();
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3 shadow-lg"
    >
      <p className="text-xs text-ink">Nouvelle version disponible.</p>
      <button
        type="button"
        onClick={reloadForUpdate}
        className="rounded-md bg-xp px-3 py-1.5 font-display text-[10px] uppercase tracking-wide text-ink"
      >
        Recharger
      </button>
    </div>
  );
}
