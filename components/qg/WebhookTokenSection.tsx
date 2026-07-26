"use client";

import { useState, useTransition } from "react";
import { regenerateWebhookToken } from "@/app/actions/webhook-token";

interface WebhookTokenSectionProps {
  hasToken: boolean;
  lastUsedAt: string | null;
}

function formatLastUsed(lastUsedAt: string | null): string {
  if (!lastUsedAt) return "Jamais utilisé";
  const diffDays = Math.floor((Date.now() - new Date(lastUsedAt).getTime()) / 86_400_000);
  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return "Il y a 1 jour";
  return `Il y a ${diffDays} jours`;
}

// US-03 : bloc « Raccourci Siri » de la section Intégrations du Vestiaire — sibling
// de PushReminderToggle (US-11), même conteneur IntegrationsSection, sans
// réorganiser la section. Le token en clair n'est connu du client qu'à
// l'instant de la (ré)génération (revealedToken) : jamais relu depuis la
// base ensuite (design : "affiché une seule fois").
export default function WebhookTokenSection({ hasToken, lastUsedAt }: WebhookTokenSectionProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<"idle" | "success" | "error">("idle");

  const tokenExists = hasToken || revealedToken !== null;

  function generate() {
    setError(null);
    setTestResult("idle");
    startTransition(async () => {
      const result = await regenerateWebhookToken();
      if (result.error || !result.token) {
        setError(result.error ?? "Impossible de générer le token.");
        return;
      }
      setRevealedToken(result.token);
    });
  }

  function copyToken() {
    if (revealedToken) void navigator.clipboard.writeText(revealedToken);
  }

  function testShortcut() {
    if (!revealedToken) return;
    setTestResult("idle");
    startTransition(async () => {
      try {
        const response = await fetch("/api/webhook/add-task", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${revealedToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: "Test depuis le Vestiaire" }),
        });
        setTestResult(response.ok ? "success" : "error");
      } catch {
        setTestResult("error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink">🗣️ Raccourci Siri</p>
        <button
          type="button"
          disabled={pending}
          onClick={generate}
          className="rounded-md border border-border bg-bg px-3 py-2.5 font-display text-[10px] uppercase tracking-wide text-gold disabled:opacity-50"
        >
          {tokenExists ? "Régénérer" : "Générer mon token"}
        </button>
      </div>

      {revealedToken && (
        <div className="flex flex-col gap-1 rounded-md border border-hp bg-bg p-2">
          <p className="text-xs text-hp-text">Copie-le maintenant, il ne sera plus affiché ensuite.</p>
          <code className="break-all text-xs text-ink">{revealedToken}</code>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyToken}
              className="rounded-md border border-border bg-surface px-2.5 py-2.5 text-[10px] uppercase tracking-wide text-ink"
            >
              Copier
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={testShortcut}
              className="rounded-md border border-border bg-surface px-2.5 py-2.5 text-[10px] uppercase tracking-wide text-xp-text disabled:opacity-50"
            >
              Tester mon raccourci
            </button>
          </div>
          {testResult === "success" && (
            <p className="text-xs text-xp-text">Raccourci fonctionnel : une tâche de test a été ajoutée.</p>
          )}
          {testResult === "error" && <p className="text-xs text-hp-text">Le test a échoué. Vérifie le token.</p>}
        </div>
      )}

      {tokenExists && (
        <p className="text-xs text-faint">Dernière utilisation : {formatLastUsed(lastUsedAt)}</p>
      )}
      {error && <p className="text-xs text-hp-text">{error}</p>}
    </div>
  );
}
