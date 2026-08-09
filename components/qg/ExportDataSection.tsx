"use client";

import { useState } from "react";
import { exportUserData } from "@/app/actions/account";

// Issue #154 (art. 20 RGPD) : export complet des données personnelles en un
// fichier JSON téléchargé côté client. Indépendant de DeleteAccountSection —
// aucune obligation de forcer l'export avant suppression (cf. spec).
export default function ExportDataSection() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setPending(true);
    setError(null);
    const result = await exportUserData();
    setPending(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Dodojo n'a pas pu préparer ton export. Réessaie.");
      return;
    }

    const username = (result.data.profile.username as string | undefined) ?? "dodojo";
    const day = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dodojo-export-${username}-${day}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="font-display text-xs uppercase tracking-wide text-muted">
        Données & vie privée
      </p>
      <button
        type="button"
        onClick={handleExport}
        disabled={pending}
        className="self-start rounded border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-ink disabled:opacity-50"
      >
        {pending ? "…" : "Télécharger mes données"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-alert">
          {error}
        </p>
      )}
    </section>
  );
}
